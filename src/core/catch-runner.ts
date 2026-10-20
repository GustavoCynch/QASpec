/**
 * Test-runner adapters for /qsx:catch: the interface every adapter implements, the registry, and the rules
 * they share. The core reads only this module; the first adapter is Jest (catch-jest.ts).
 *
 * Outcomes. A file passes only when at least one of its tests executed and none failed. A file is pass, fail
 * (a test failed), no-build (it did not build), or no-tests (it ran, but no test executed: all skipped, pending
 * or todo, or none at all). A run takes the worst outcome of its files, in this order: no-build, fail, no-tests,
 * pass. timeout and runner-error come before any file verdict, except that runner-error keeps the file outcomes
 * when a passing report was followed by a non-zero exit code. Only pass means that tests ran and passed.
 *
 * Every command runs through runInProcessGroup, in the project folder, with the complete environment from
 * buildChildEnv (never merged with process.env) and the configured timeout. Paths are project-relative and must
 * stay inside the project folder, symlinks included, even for a file that does not exist yet: a path that does
 * not is refused before any command starts. Captured text is bounded to MAX_TEXT_BYTES, and every cut is marked.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type { ResolvedCatchConfig } from './catch-config.js';
import { buildChildEnv } from './catch-git.js';
import { jestAdapter } from './catch-jest.js';
import { runInProcessGroup } from './process-group.js';

export const TEST_RUNNER_ADAPTER_IDS = ['jest'] as const;
export type TestRunnerAdapterId = (typeof TEST_RUNNER_ADAPTER_IDS)[number];

/** Overall outcome of one run: the worst file outcome, or a run-level outcome. See the module comment. */
export type RunOutcome = 'pass' | 'fail' | 'no-build' | 'no-tests' | 'timeout' | 'runner-error';
/** Outcome of one test file. */
export type FileOutcome = 'pass' | 'fail' | 'no-build' | 'no-tests';

/** Everything an adapter needs to run commands for one project folder. */
export interface RunnerContext {
  /** Project folder inside the catch worktree: the cwd of every runner command. */
  projectDir: string;
  /** The configured base test command (catch.runner.command), before the adapter's arguments. */
  runnerCommand: string;
  /** The complete child environment from buildChildEnv. Never merged with process.env. */
  env: Readonly<Record<string, string>>;
  /** Timeout of each runner command, in milliseconds. */
  timeoutMs: number;
  /** Folder for runner output files, outside the worktree. */
  scratchDir: string;
}

export interface FileRunResult {
  /** Project-relative test file. */
  file: string;
  outcome: FileOutcome;
  /** Bounded failure, build or no-test messages; empty when the file passed. */
  messages: string[];
  /** Duration the runner reported for this file, when it reported one: summed over a file listed more than once. */
  durationMs?: number;
}

export interface RunResult {
  outcome: RunOutcome;
  /**
   * Per-file outcomes of a readable report. Empty when there is none, or when a worker crashed (runner-error), except
   * that runner-error keeps them when a passing report was followed by a non-zero exit code.
   */
  files: FileRunResult[];
  durationMs: number;
  /** Why the run ended with timeout or runner-error. */
  reason?: string;
  /** Bounded tail of the command output. */
  outputTail: string;
}

export interface TestRunnerAdapter {
  readonly id: TestRunnerAdapterId;
  /**
   * Existing test files related to the given source files: project-relative, sorted, unique.
   * Throws when the runner cannot answer, so a failed lookup never reads as "no related tests".
   */
  relatedTests(ctx: RunnerContext, sourceFiles: readonly string[]): Promise<string[]>;
  /** Runs the given test files and classifies them. Throws for refused paths; runner failures are outcomes. */
  run(ctx: RunnerContext, testFiles: readonly string[]): Promise<RunResult>;
  /**
   * The comparable form of a source file for the equivalence filter (S6): two texts with equal forms differ only in
   * text that cannot change behavior. Pure: it reads no file and runs no command.
   */
  normalizeSource(relativePath: string, text: string): string;
}

/** The project folder as the OS names it (real) and as the configuration spells it (configured). */
export interface ProjectFolder {
  real: string;
  configured: string;
}

/** What one command produced. */
export interface CommandRun {
  /** Null when the command was stopped by a signal. */
  exitCode: number | null;
  timedOut: boolean;
  /** Standard output and standard error, interleaved in arrival order. */
  output: string;
  durationMs: number;
}

/** Budget for every captured message and for the output tail. */
export const MAX_TEXT_BYTES = 4096;

const CUT_MARK = '[truncated]';
/** Bytes a cut takes besides the kept text: the mark and one line break. */
const CUT_BYTES = Buffer.byteLength(CUT_MARK) + 1;

const DRIVE_PREFIX = /^[A-Za-z]:/;

/** The adapter for a configured id. Throws for an id that no adapter implements. */
export function getAdapter(id: string): TestRunnerAdapter {
  // catch-jest.ts imports this module, so the adapter is looked up at call time, not at load time.
  if (id === 'jest') {
    return jestAdapter;
  }
  throw new Error(`Unknown test-runner adapter "${id}". Supported adapters: ${TEST_RUNNER_ADAPTER_IDS.join(', ')}.`);
}

/** The context for one project folder, built from the resolved catch block. */
export function createRunnerContext(
  config: ResolvedCatchConfig,
  location: { projectDir: string; scratchDir: string }
): RunnerContext {
  const runnerCommand = config.runner.command;
  if (runnerCommand === undefined || runnerCommand.trim() === '') {
    throw new Error('catch.runner.command is not set: the test-runner adapter needs the base test command.');
  }
  return {
    projectDir: location.projectDir,
    runnerCommand,
    env: buildChildEnv(config),
    timeoutMs: config.runner.timeoutSeconds * 1000,
    scratchDir: location.scratchDir,
  };
}

/**
 * The adapter and the resolved catch block of a run's commands. Refuses a catch block without the adapter id or the
 * base test command, because no gate can run without them.
 */
export function runnerFor(config: ResolvedCatchConfig | undefined): {
  adapter: TestRunnerAdapter;
  config: ResolvedCatchConfig;
} {
  const adapterId = config?.runner.adapter;
  if (config === undefined || adapterId === undefined || config.runner.command === undefined) {
    throw new Error(
      'The catch block needs runner.adapter and runner.command in qaspec/config.yaml to run the existing tests.'
    );
  }
  return { adapter: getAdapter(adapterId), config };
}

/** Resolves the project folder and its real path. Throws when the folder does not exist. */
export async function openProjectFolder(projectDir: string): Promise<ProjectFolder> {
  const configured = path.resolve(projectDir);
  try {
    return { real: await fs.realpath(configured), configured };
  } catch {
    throw new Error(`The project folder does not exist: ${configured}.`);
  }
}

/**
 * Validates project-relative paths before they reach a command line. Each must be relative, must not leave
 * the project folder lexically, and must not lead outside it through a symlink (a dangling one included) or
 * through a folder above a name that does not exist yet. Returns the POSIX form, each path once, in the order
 * given. Nothing runs when any path is refused.
 */
export async function resolveProjectPaths(folder: ProjectFolder, paths: readonly string[]): Promise<string[]> {
  const resolved: string[] = [];
  for (const raw of paths) {
    const relative = normalizeProjectPath(raw);
    if (!resolved.includes(relative)) {
      resolved.push(relative);
    }
    const target = await realLocation(path.join(folder.real, ...relative.split('/')));
    if (target === undefined || !isInside(target, folder.real)) {
      throw refusal(raw);
    }
  }
  return resolved;
}

/** Symlinks followed on one path before it is taken for a loop. */
const MAX_SYMLINK_HOPS = 40;

/**
 * Where a path really points, even when it does not exist yet: every symlink on the way is followed, a dangling
 * one included, and a missing name is kept as written. A link is read relative to the real folder it lives in.
 * Undefined for a symlink loop.
 */
async function realLocation(absolute: string, hops = 0): Promise<string | undefined> {
  if (hops > MAX_SYMLINK_HOPS) {
    return undefined;
  }
  const real = await fs.realpath(absolute).catch(() => undefined);
  if (real !== undefined) {
    return real;
  }
  const parent = path.dirname(absolute);
  if (parent === absolute) {
    return undefined;
  }
  const realParent = await realLocation(parent, hops);
  if (realParent === undefined) {
    return undefined;
  }
  const name = path.join(realParent, path.basename(absolute));
  const link = await fs.lstat(name).catch(() => undefined);
  if (link?.isSymbolicLink()) {
    const target = await fs.readlink(name).catch(() => undefined);
    return target === undefined ? undefined : realLocation(path.resolve(realParent, target), hops + 1);
  }
  return name;
}

/**
 * The project-relative POSIX name of a path the runner reported, or undefined when it is not inside the
 * project folder. Either spelling of the folder is accepted: the real path and the configured one.
 */
export function relativeWithin(folder: ProjectFolder, name: string): string | undefined {
  for (const base of [folder.real, folder.configured]) {
    const absolute = path.resolve(base, name);
    if (isInside(absolute, base)) {
      return path.relative(base, absolute).split(path.sep).join('/');
    }
  }
  return undefined;
}

/** The start of the text within maxBytes, cut on a character boundary and marked. */
export function keepHead(text: string, maxBytes: number): string {
  requireBudget(maxBytes);
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= maxBytes) {
    return text;
  }
  let end = maxBytes - CUT_BYTES;
  while (end > 0 && isContinuationByte(bytes[end])) {
    end -= 1;
  }
  return `${bytes.subarray(0, end).toString('utf8')}\n${CUT_MARK}`;
}

/** The end of the text within maxBytes, cut on a character boundary and marked. */
export function keepTail(text: string, maxBytes: number): string {
  requireBudget(maxBytes);
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= maxBytes) {
    return text;
  }
  let start = bytes.length - (maxBytes - CUT_BYTES);
  while (start < bytes.length && isContinuationByte(bytes[start])) {
    start += 1;
  }
  return `${CUT_MARK}\n${bytes.subarray(start).toString('utf8')}`;
}

/**
 * Runs one command line through the shell, in the project folder, with exactly ctx.env and the timeout.
 * Rejects only when the command cannot start.
 */
export async function runRunnerCommand(ctx: RunnerContext, command: string): Promise<CommandRun> {
  const started = performance.now();
  const outcome = await runInProcessGroup({
    command,
    shell: true,
    cwd: ctx.projectDir,
    env: ctx.env,
    timeoutMs: ctx.timeoutMs,
    captureOutput: true,
  });
  return {
    exitCode: outcome.exitCode,
    timedOut: outcome.timedOut,
    output: outcome.output,
    durationMs: Math.round(performance.now() - started),
  };
}

function refusal(raw: string): Error {
  return new Error(
    `Refusing ${JSON.stringify(raw)}: a test or source path must be relative to the project folder and stay inside it.`
  );
}

function normalizeProjectPath(raw: string): string {
  const slashed = raw.split('\\').join('/');
  const relative = path.posix.normalize(slashed).replace(/\/+$/, '');
  const hasControlCharacter = [...raw].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
  if (
    raw.length === 0 ||
    hasControlCharacter ||
    DRIVE_PREFIX.test(raw) ||
    path.posix.isAbsolute(slashed) ||
    relative === '' ||
    relative === '.' ||
    relative === '..' ||
    relative.startsWith('../')
  ) {
    throw refusal(raw);
  }
  return relative;
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isContinuationByte(byte: number): boolean {
  return (byte & 0b1100_0000) === 0b1000_0000;
}

function requireBudget(maxBytes: number): void {
  if (!Number.isInteger(maxBytes) || maxBytes <= CUT_BYTES) {
    throw new RangeError(`A text budget must be an integer above ${CUT_BYTES} bytes, got ${maxBytes}.`);
  }
}
