/**
 * Jest/TypeScript adapter for /qsx:catch. The configured command (for example `npx jest` or `npm test --`)
 * gets Jest's arguments appended, each quoted for the shell that runs it. Options come first and paths last,
 * so no option can take a path as its value. A path that starts with a dash is written as ./name: Jest reads
 * it as a path, so it is never taken for an option.
 *
 *   run:          --json --outputFile=<scratch report> --ci --colors=false --runTestsByPath <files>
 *   relatedTests: --listTests --findRelatedTests <source files>
 *
 * Each suite of Jest's JSON report is one test file. Jest 30 gives a suite the status passed, failed or skipped;
 * each assertion is passed, failed, pending (skipped) or todo. By suite:
 *   passed, some test executed                  -> pass
 *   passed, no test executed                    -> no-tests (all skipped, pending or todo, or none): not a pass
 *   skipped                                     -> no-tests (the whole file is skipped: its assertions are pending)
 *   failed, some test executed                  -> fail (the messages are the failed assertions)
 *   failed, no test executed, "Your test suite must contain at least one test." -> no-tests
 *   failed, no test executed, a worker crashed or ran out of memory -> runner-error for the run, never no-build
 *   failed, no test executed, otherwise        -> no-build (compile, type or import: "Test suite failed to run")
 * Jest lists a file once per project it ran in: the file takes the worst outcome of its suites, the messages of
 * the suites that have it, and the sum of their durations.
 *
 * Overall outcome: the worst file outcome, in the order of catch-runner.ts (no-build, fail, no-tests, pass), so
 * a run is pass only when every requested file passed. timeout and runner-error come before any file verdict. A
 * requested file that the report does not contain was not run: that is runner-error, never a vacuous pass. The
 * report decides the file outcomes. The exit code matters when the command was stopped, left no readable report,
 * or exited non-zero after a passing report: a failed globalTeardown or a coverage threshold leaves every suite
 * passed, so that run is runner-error, with its file outcomes kept.
 *
 * Failure messages and the output tail lose their ANSI escape sequences (control sequences and operating system
 * commands, 7-bit and 8-bit) before they are bounded, so a cut never leaves a partial sequence.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  type CommandRun,
  type FileOutcome,
  type FileRunResult,
  MAX_TEXT_BYTES,
  type ProjectFolder,
  type RunOutcome,
  type RunResult,
  type RunnerContext,
  type TestRunnerAdapter,
  keepHead,
  keepTail,
  openProjectFolder,
  relativeWithin,
  resolveProjectPaths,
  runRunnerCommand,
} from './catch-runner.js';
import { normalizeScriptSource, normalizeWhitespaceOnly } from './catch-normalize.js';

/** Failure messages kept per file; the rest are counted in one trailing note. */
const MAX_MESSAGES_PER_FILE = 10;
/** Lower is worse: the order of catch-runner.ts. A run takes the worst outcome of its files. */
const SEVERITY: Record<FileOutcome, number> = { 'no-build': 0, fail: 1, 'no-tests': 2, pass: 3 };
const NO_TESTS_MESSAGE = 'No test was executed: every test is skipped, pending or todo, or the file has none.';
/** Jest's message for a test file that has no test at all. */
const NO_TESTS_SUITE_MESSAGE = 'Your test suite must contain at least one test.';
/** Jest's messages for a worker that crashed, was force-exited or ran out of memory while it ran a test file. */
const WORKER_CRASH = new RegExp(
  [
    'jest worker encountered',
    'worker (?:process )?crashed',
    'call retries were exceeded',
    'a worker process has failed to exit gracefully',
    'out of memory',
  ].join('|'),
  'i'
);
/**
 * Escape sequences a terminal draws instead of showing: control sequences (ESC [, parameters, final byte: colors and
 * styles) and operating system commands (ESC ], text, ended by BEL or ESC \: hyperlinks), with their 8-bit forms. An
 * operating system command that is never ended stops at the line break, so it cannot swallow the text after it.
 */
const ANSI_SEQUENCE =
  /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]|(?:\u001b\]|\u009d)[^\u0007\u001b\u009c\r\n]*(?:\u0007|\u001b\\|\u009c)?/g;

type JsonObject = Record<string, unknown>;

interface JestAssertion {
  status: string;
  failureMessages: string[];
}

interface JestSuite {
  /** Absolute path of the test file, as Jest names it. */
  name: string;
  status: string;
  message: string;
  startTime?: number;
  endTime?: number;
  assertions: JestAssertion[];
}

type ReportRead = { kind: 'missing' } | { kind: 'invalid' } | { kind: 'read'; suites: JestSuite[] };

type Mapped = { files: FileRunResult[] } | { error: string };

/**
 * Quotes one argument for the shell that runs the configured command: POSIX single quotes, or cmd.exe
 * double quotes on Windows.
 */
export function quoteShellArgument(argument: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'win32') {
    return `'${argument.replace(/'/g, `'\\''`)}'`;
  }
  // cmd.exe expands %NAME% even inside double quotes, so such an argument cannot be passed faithfully.
  if (argument.includes('%')) {
    throw new Error(
      `Refusing ${JSON.stringify(argument)}: cmd.exe expands % in a command line, so it cannot be passed on Windows.`
    );
  }
  // Windows argument rules: a backslash is literal unless a double quote follows it; then each backslash doubles
  // and the quote is escaped.
  let quoted = '"';
  let backslashes = 0;
  for (const character of argument) {
    if (character === '\\') {
      backslashes += 1;
      continue;
    }
    quoted += character === '"' ? `${'\\'.repeat(backslashes * 2 + 1)}"` : `${'\\'.repeat(backslashes)}${character}`;
    backslashes = 0;
  }
  return `${quoted}${'\\'.repeat(backslashes * 2)}"`;
}

export const jestAdapter: TestRunnerAdapter = {
  id: 'jest',
  relatedTests,
  run,
  normalizeSource,
};

/** Extensions read as TypeScript or JavaScript: their comments are removed and their literals kept. */
const SCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

/** The comparable form of a file of the project: the script scanner for TypeScript and JavaScript, else whitespace only. */
function normalizeSource(relativePath: string, text: string): string {
  const extension = path.posix.extname(relativePath).toLowerCase();
  return SCRIPT_EXTENSIONS.has(extension) ? normalizeScriptSource(text) : normalizeWhitespaceOnly(text);
}

async function run(ctx: RunnerContext, testFiles: readonly string[]): Promise<RunResult> {
  if (testFiles.length === 0) {
    throw new Error('No test files to run: an empty list would let Jest run every test.');
  }
  const folder = await openProjectFolder(ctx.projectDir);
  const files = await resolveProjectPaths(folder, testFiles);
  const scratch = path.resolve(ctx.scratchDir);
  await fs.mkdir(scratch, { recursive: true });
  const reportFile = path.join(scratch, `jest-${randomUUID()}.json`);
  const command = jestCommand(
    ctx,
    ['--json', `--outputFile=${reportFile}`, '--ci', '--colors=false', '--runTestsByPath'],
    files
  );
  try {
    return await classifyRun(ctx, folder, files, reportFile, command);
  } finally {
    await fs.rm(reportFile, { force: true }).catch(() => undefined);
  }
}

async function classifyRun(
  ctx: RunnerContext,
  folder: ProjectFolder,
  files: readonly string[],
  reportFile: string,
  command: string
): Promise<RunResult> {
  const started = performance.now();
  let execution: CommandRun;
  try {
    execution = await runRunnerCommand(ctx, command);
  } catch (error) {
    return runnerError(`The test command could not start: ${errorText(error)}`, 0, '');
  }
  const outputTail = keepTail(stripAnsi(execution.output), MAX_TEXT_BYTES);
  const durationMs = Math.round(performance.now() - started);
  if (execution.timedOut) {
    const reason = `The test command timed out after ${ctx.timeoutMs / 1000} s.`;
    return { outcome: 'timeout', files: [], durationMs, reason, outputTail };
  }
  if (execution.exitCode === null) {
    return runnerError('The test command was stopped by a signal.', durationMs, outputTail);
  }

  const read = await readReport(reportFile);
  if (read.kind === 'missing') {
    const reason =
      execution.exitCode === 0
        ? 'The test command wrote no report.'
        : `The test command exited with code ${execution.exitCode} and wrote no report.`;
    return runnerError(reason, durationMs, outputTail);
  }
  if (read.kind === 'invalid') {
    return runnerError('The report is not a Jest JSON report.', durationMs, outputTail);
  }

  const mapped = mapReport(read.suites, files, folder);
  if ('error' in mapped) {
    return runnerError(mapped.error, durationMs, outputTail);
  }
  const outcome = overallOutcome(mapped.files);
  if (outcome === 'pass' && execution.exitCode !== 0) {
    const reason = `The report passed but the command exited with code ${execution.exitCode}.`;
    return { outcome: 'runner-error', files: mapped.files, durationMs, reason, outputTail };
  }
  return { outcome, files: mapped.files, durationMs, outputTail };
}

async function relatedTests(ctx: RunnerContext, sourceFiles: readonly string[]): Promise<string[]> {
  if (sourceFiles.length === 0) {
    return [];
  }
  const folder = await openProjectFolder(ctx.projectDir);
  const files = await resolveProjectPaths(folder, sourceFiles);
  const execution = await runRunnerCommand(ctx, jestCommand(ctx, ['--listTests', '--findRelatedTests'], files));
  const output = stripAnsi(execution.output);
  const outputTail = keepTail(output, MAX_TEXT_BYTES);
  // A failed listing must not read as "no related tests": the gates would then pass without running anything.
  if (execution.timedOut) {
    throw new Error(`Finding related tests timed out after ${ctx.timeoutMs / 1000} s.`);
  }
  if (execution.exitCode === null) {
    throw new Error(`Finding related tests was stopped by a signal: ${outputTail}`);
  }
  if (execution.exitCode !== 0) {
    throw new Error(`Finding related tests failed with exit code ${execution.exitCode}: ${outputTail}`);
  }

  const tests = new Set<string>();
  // The output interleaves standard error, and npm prints a banner too: only absolute paths of files count.
  for (const line of output.split(/\r?\n/)) {
    const candidate = line.trim();
    if (!path.isAbsolute(candidate)) {
      continue;
    }
    const relative = relativeWithin(folder, candidate);
    if (relative !== undefined && (await isFile(candidate))) {
      tests.add(relative);
    }
  }
  return [...tests].sort();
}

/** Jest's arguments appended to the configured command, every word quoted. Paths come last. */
function jestCommand(ctx: RunnerContext, options: readonly string[], files: readonly string[]): string {
  const words = [...options, ...files.map((file) => (file.startsWith('-') ? `./${file}` : file))];
  return [ctx.runnerCommand, ...words.map((word) => quoteShellArgument(word))].join(' ');
}

function runnerError(reason: string, durationMs: number, outputTail: string): RunResult {
  return { outcome: 'runner-error', files: [], durationMs, reason: keepHead(reason, MAX_TEXT_BYTES), outputTail };
}

async function readReport(reportFile: string): Promise<ReportRead> {
  let text: string;
  try {
    text = await fs.readFile(reportFile, 'utf8');
  } catch {
    return { kind: 'missing' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'invalid' };
  }
  if (!isObject(parsed) || !Array.isArray(parsed.testResults)) {
    return { kind: 'invalid' };
  }
  const suites: JestSuite[] = [];
  for (const entry of parsed.testResults) {
    const suite = parseSuite(entry);
    if (suite === undefined) {
      return { kind: 'invalid' };
    }
    suites.push(suite);
  }
  return { kind: 'read', suites };
}

function parseSuite(value: unknown): JestSuite | undefined {
  if (!isObject(value) || typeof value.name !== 'string' || typeof value.status !== 'string') {
    return undefined;
  }
  const assertions: JestAssertion[] = Array.isArray(value.assertionResults)
    ? value.assertionResults.filter(isObject).map((assertion) => ({
        status: typeof assertion.status === 'string' ? assertion.status : '',
        failureMessages: Array.isArray(assertion.failureMessages)
          ? assertion.failureMessages
              .filter((message): message is string => typeof message === 'string')
              .map((message) => stripAnsi(message))
          : [],
      }))
    : [];
  return {
    name: value.name,
    status: value.status,
    message: typeof value.message === 'string' ? stripAnsi(value.message) : '',
    startTime: typeof value.startTime === 'number' ? value.startTime : undefined,
    endTime: typeof value.endTime === 'number' ? value.endTime : undefined,
    assertions,
  };
}

/** Maps every suite to its project-relative file, one result per file. A requested file without a suite was not run. */
function mapReport(suites: readonly JestSuite[], requested: readonly string[], folder: ProjectFolder): Mapped {
  const suitesByFile = new Map<string, FileRunResult[]>();
  for (const suite of suites) {
    const file = relativeWithin(folder, suite.name);
    if (file === undefined) {
      return { error: 'The report names a test suite outside the project folder.' };
    }
    if (isWorkerCrash(suite)) {
      return { error: `The worker running ${file} crashed or ran out of memory. Jest said: ${suite.message.trim()}` };
    }
    const result = classifySuite(file, suite);
    if (result === undefined) {
      return { error: `The report gives ${file} an unknown status.` };
    }
    suitesByFile.set(file, [...(suitesByFile.get(file) ?? []), result]);
  }

  const byFile = new Map<string, FileRunResult>();
  for (const [file, results] of suitesByFile) {
    byFile.set(file, mergeFile(file, results));
  }
  const notRun = requested.filter((file) => !byFile.has(file));
  if (notRun.length > 0) {
    return { error: `The runner did not run: ${notRun.join(', ')}.` };
  }
  const extra = [...byFile].filter(([file]) => !requested.includes(file)).map(([, result]) => result);
  return { files: [...requested.map((file) => byFile.get(file) as FileRunResult), ...extra] };
}

/** The outcome of one suite. Its messages are not bounded yet: mergeFile bounds the ones it keeps. */
function classifySuite(file: string, suite: JestSuite): FileRunResult | undefined {
  const durationMs =
    suite.startTime !== undefined && suite.endTime !== undefined
      ? Math.max(0, Math.round(suite.endTime - suite.startTime))
      : undefined;
  const ran = executed(suite);
  if (suite.status === 'passed') {
    return ran
      ? { file, outcome: 'pass', messages: [], durationMs }
      : { file, outcome: 'no-tests', messages: [NO_TESTS_MESSAGE], durationMs };
  }
  if (suite.status === 'skipped') {
    return { file, outcome: 'no-tests', messages: [NO_TESTS_MESSAGE], durationMs };
  }
  if (suite.status !== 'failed') {
    return undefined;
  }
  if (!ran) {
    return suite.message.includes(NO_TESTS_SUITE_MESSAGE)
      ? { file, outcome: 'no-tests', messages: [NO_TESTS_MESSAGE], durationMs }
      : { file, outcome: 'no-build', messages: [suite.message], durationMs };
  }
  const failures = suite.assertions.flatMap((assertion) => assertion.failureMessages);
  return { file, outcome: 'fail', messages: failures.length > 0 ? failures : [suite.message], durationMs };
}

/**
 * One file's result from the suites that Jest reported for it: the worst outcome, the messages of the suites that
 * have that outcome (bounded here), and the sum of the durations reported.
 */
function mergeFile(file: string, results: readonly FileRunResult[]): FileRunResult {
  const outcome = results.map((result) => result.outcome).reduce(worstOf);
  const messages = results.filter((result) => result.outcome === outcome).flatMap((result) => result.messages);
  const durations = results.flatMap((result) => (result.durationMs === undefined ? [] : [result.durationMs]));
  return {
    file,
    outcome,
    messages: boundedMessages(messages),
    durationMs: durations.length > 0 ? durations.reduce((total, duration) => total + duration, 0) : undefined,
  };
}

function boundedMessages(texts: readonly string[]): string[] {
  const present = texts.filter((text) => text.trim() !== '');
  const kept = present.slice(0, MAX_MESSAGES_PER_FILE).map((text) => keepHead(text, MAX_TEXT_BYTES));
  if (present.length > MAX_MESSAGES_PER_FILE) {
    kept.push(`${present.length - MAX_MESSAGES_PER_FILE} more messages not shown.`);
  }
  return kept;
}

/** The worse of two file outcomes, by SEVERITY: the module comment gives the order. */
function worstOf(current: FileOutcome, next: FileOutcome): FileOutcome {
  return SEVERITY[next] < SEVERITY[current] ? next : current;
}

/** The worst file outcome of a readable report. A report without files has no passing test, so it is no-tests. */
function overallOutcome(files: readonly FileRunResult[]): RunOutcome {
  if (files.length === 0) {
    return 'no-tests';
  }
  return files.map((file) => file.outcome).reduce(worstOf);
}

/** Whether a test of the suite reached a verdict: an assertion passed or failed, not pending, skipped or todo. */
function executed(suite: JestSuite): boolean {
  return suite.assertions.some((assertion) => assertion.status === 'passed' || assertion.status === 'failed');
}

/** A failed suite that executed no test and whose message says its worker crashed: a runner failure, never no-build. */
function isWorkerCrash(suite: JestSuite): boolean {
  return suite.status === 'failed' && !executed(suite) && WORKER_CRASH.test(suite.message);
}

/** The text without its ANSI escape sequences. Callers strip before they bound, so a cut never splits a sequence. */
function stripAnsi(text: string): string {
  return text.replace(ANSI_SEQUENCE, '');
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function isFile(file: string): Promise<boolean> {
  return fs.stat(file).then(
    (stat) => stat.isFile(),
    () => false
  );
}

function errorText(error: unknown): string {
  return keepHead(error instanceof Error ? error.message : String(error), MAX_TEXT_BYTES);
}
