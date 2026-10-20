/**
 * Jest/TypeScript adapter for /qsx:catch. The configured command (for example `npx jest` or `npm test --`)
 * gets Jest's arguments appended, each quoted for the shell that runs it. Options come first and paths last,
 * so no option can take a path as its value. A path that starts with a dash is written as ./name: Jest reads
 * it as a path, so it is never taken for an option.
 *
 *   run:          --json --outputFile=<scratch report> --ci --colors=false --runTestsByPath <files>
 *   relatedTests: --listTests --findRelatedTests <source files>
 *
 * Each suite of Jest's JSON report is one test file:
 *   passed                        -> pass
 *   failed, no test executed      -> no-build (compile, type or import error: "Test suite failed to run")
 *   failed, some test executed    -> fail (the messages are the failed assertions)
 *
 * Overall outcome: timeout and runner-error come first and carry no per-file verdicts. Then no-build when any
 * file is no-build: a run that did not build every file is not a clean fail, and the gates need that signal.
 * Then fail when any file fails; otherwise pass. A requested file that the report does not contain was not
 * run: that is runner-error, never a vacuous pass. The report decides when there is one; the exit code only
 * matters when the command was stopped or left no readable report.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  type CommandRun,
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

/** Failure messages kept per file; the rest are counted in one trailing note. */
const MAX_MESSAGES_PER_FILE = 10;

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
};

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
  const outputTail = keepTail(execution.output, MAX_TEXT_BYTES);
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
  return { outcome: overallOutcome(mapped.files), files: mapped.files, durationMs, outputTail };
}

async function relatedTests(ctx: RunnerContext, sourceFiles: readonly string[]): Promise<string[]> {
  if (sourceFiles.length === 0) {
    return [];
  }
  const folder = await openProjectFolder(ctx.projectDir);
  const files = await resolveProjectPaths(folder, sourceFiles);
  const execution = await runRunnerCommand(ctx, jestCommand(ctx, ['--listTests', '--findRelatedTests'], files));
  const outputTail = keepTail(execution.output, MAX_TEXT_BYTES);
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
  for (const line of execution.output.split(/\r?\n/)) {
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
          ? assertion.failureMessages.filter((message): message is string => typeof message === 'string')
          : [],
      }))
    : [];
  return {
    name: value.name,
    status: value.status,
    message: typeof value.message === 'string' ? value.message : '',
    startTime: typeof value.startTime === 'number' ? value.startTime : undefined,
    endTime: typeof value.endTime === 'number' ? value.endTime : undefined,
    assertions,
  };
}

/** Maps every suite to its project-relative file. A requested file without a suite was not run. */
function mapReport(suites: readonly JestSuite[], requested: readonly string[], folder: ProjectFolder): Mapped {
  const byFile = new Map<string, FileRunResult>();
  for (const suite of suites) {
    const file = relativeWithin(folder, suite.name);
    if (file === undefined) {
      return { error: 'The report names a test suite outside the project folder.' };
    }
    const result = classifySuite(file, suite);
    if (result === undefined) {
      return { error: `The report gives ${file} an unknown status.` };
    }
    byFile.set(file, result);
  }

  const notRun = requested.filter((file) => !byFile.has(file));
  if (notRun.length > 0) {
    return { error: `The runner did not run: ${notRun.join(', ')}.` };
  }
  const extra = [...byFile].filter(([file]) => !requested.includes(file)).map(([, result]) => result);
  return { files: [...requested.map((file) => byFile.get(file) as FileRunResult), ...extra] };
}

function classifySuite(file: string, suite: JestSuite): FileRunResult | undefined {
  const durationMs =
    suite.startTime !== undefined && suite.endTime !== undefined
      ? Math.max(0, Math.round(suite.endTime - suite.startTime))
      : undefined;
  if (suite.status === 'passed') {
    return { file, outcome: 'pass', messages: [], durationMs };
  }
  if (suite.status !== 'failed') {
    return undefined;
  }
  const executed = suite.assertions.filter(
    (assertion) => assertion.status === 'passed' || assertion.status === 'failed'
  );
  if (executed.length === 0) {
    return { file, outcome: 'no-build', messages: boundedMessages([suite.message]), durationMs };
  }
  const failures = suite.assertions.flatMap((assertion) => assertion.failureMessages);
  const messages = failures.length > 0 ? failures : [suite.message];
  return { file, outcome: 'fail', messages: boundedMessages(messages), durationMs };
}

function boundedMessages(texts: readonly string[]): string[] {
  const present = texts.filter((text) => text.trim() !== '');
  const kept = present.slice(0, MAX_MESSAGES_PER_FILE).map((text) => keepHead(text, MAX_TEXT_BYTES));
  if (present.length > MAX_MESSAGES_PER_FILE) {
    kept.push(`${present.length - MAX_MESSAGES_PER_FILE} more messages not shown.`);
  }
  return kept;
}

/** no-build takes precedence over fail: see the module comment. */
function overallOutcome(files: readonly FileRunResult[]): Extract<RunOutcome, 'pass' | 'fail' | 'no-build'> {
  if (files.some((file) => file.outcome === 'no-build')) {
    return 'no-build';
  }
  if (files.some((file) => file.outcome === 'fail')) {
    return 'fail';
  }
  return 'pass';
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
