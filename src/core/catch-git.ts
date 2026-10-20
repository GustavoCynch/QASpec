/**
 * Git revisions, worktrees and the child environment for /qsx:catch. Library only.
 *
 * Git runs through execFile without a shell and with a timeout. Catch never changes the user's checkout:
 * it reads commits, and it adds or removes worktrees under <tmpdir>/qaspec-catch (git also records them
 * in the repository's .git). Setup and test processes get only the environment that buildChildEnv
 * returns, so tokens in the parent environment are not passed on.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type { CatchConfig } from './catch-config.js';
import { runInProcessGroup } from './process-group.js';

const GIT_TIMEOUT_MS = 120_000;
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const CATCH_ROOT_NAME = 'qaspec-catch';
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** Same default that parseCatchConfig applies to setup.timeoutSeconds. */
const DEFAULT_SETUP_TIMEOUT_SECONDS = 900;
/** Variables a child process receives from the parent environment when they are set. */
const BUILT_IN_ENV_NAMES = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
] as const;

export interface GitRevisions {
  /** Full commit id of the approved head. */
  headSha: string;
  /** Full commit id of the base ref. */
  baseSha: string;
  /** merge-base of the base and the head: the revision the PR branched from. */
  parentSha: string;
}

export interface ChangedFile {
  /** Git status letter: A (added), M (modified), D (deleted), T (type changed), U or X. */
  status: string;
  /** Repository-relative path. Renames are listed as a deletion and an addition. */
  path: string;
}

export interface SetupCommandResult {
  /** The configured command line, run through the shell. */
  command: string;
  /** Null when the command was stopped by a signal, such as its timeout. */
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

export interface SetupResult {
  /** True when every configured command exited 0 within its timeout. */
  ok: boolean;
  /** One entry per command that ran, in order; the list ends at the first failure. */
  commands: SetupCommandResult[];
}

interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs git without a shell. Resolves with its exit code; rejects only when git cannot run or times out. */
function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, env: gitEnvironment(), timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER_BYTES, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, stdout, stderr });
        } else if (typeof error.code === 'number') {
          resolve({ code: error.code, stdout, stderr });
        } else if (error.killed) {
          reject(new Error(`git ${args[0]} timed out after ${GIT_TIMEOUT_MS / 1000} seconds`));
        } else if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
          reject(new Error(`git ${args[0]} output is larger than ${GIT_MAX_BUFFER_BYTES / (1024 * 1024)} MiB`));
        } else {
          reject(new Error(`QASpec could not run git ${args[0]}: ${error.message}`));
        }
      }
    );
  });
}

/** Repository-location variables would send git to another repository than the one it runs in. */
function gitEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.toUpperCase().startsWith('GIT_')) {
      env[name] = value;
    }
  }
  return env;
}

function gitError(args: string[], result: GitResult): Error {
  const detail = result.stderr.trim() || `exit code ${result.code}`;
  return new Error(`git ${args[0]} failed: ${detail}`);
}

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  const result = await runGit(cwd, args);
  if (result.code !== 0) {
    throw gitError(args, result);
  }
  return result.stdout;
}

/** Git reads a leading dash as an option, so such a ref is refused before git runs. */
function assertRef(ref: string, label: string): void {
  if (ref.length === 0 || ref.startsWith('-')) {
    throw new Error(`Refusing ${label} "${ref}": a git ref must not be empty or start with "-".`);
  }
}

/** Full commit id of ref, or undefined when git does not know it (exit 1 with --quiet). */
async function commitOf(projectRoot: string, ref: string): Promise<string | undefined> {
  const result = await runGit(projectRoot, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (result.code === 0) {
    return result.stdout.trim();
  }
  if (result.code === 1) {
    return undefined;
  }
  throw gitError(['rev-parse'], result);
}

export interface ResolveRevisionsInput {
  projectRoot: string;
  /** Head commit saved in the analyze approval record (headSha). */
  headSha: string;
  /** Base ref from catch.baseRef in the config, or from --base. */
  baseRef: string;
}

/** Resolves the approved head and the base to commits, and returns their merge-base as the parent. */
export async function resolveRevisions(input: ResolveRevisionsInput): Promise<GitRevisions> {
  const { projectRoot, headSha, baseRef } = input;
  assertRef(headSha, 'approved head');
  assertRef(baseRef, 'base ref');

  const head = await commitOf(projectRoot, headSha);
  if (head === undefined) {
    throw new Error(
      `Approved head ${headSha} is not a commit in this repository. ` +
        'Fetch the PR head into this clone, or approve the analysis again with --head-sha <commit>.'
    );
  }
  const base = await commitOf(projectRoot, baseRef);
  if (base === undefined) {
    throw new Error(
      `Base ref "${baseRef}" is not a commit in this repository. ` +
        'Set catch.baseRef in qaspec/config.yaml or pass --base <ref>; fetch it first if it exists only on a remote.'
    );
  }

  const merge = await runGit(projectRoot, ['merge-base', base, head]);
  if (merge.code === 1) {
    throw new Error(`Base ref "${baseRef}" and approved head ${headSha} have no merge base: they share no history.`);
  }
  if (merge.code !== 0) {
    throw gitError(['merge-base'], merge);
  }
  return { headSha: head, baseSha: base, parentSha: merge.stdout.trim() };
}

export async function changedFiles(projectRoot: string, parentSha: string, headSha: string): Promise<ChangedFile[]> {
  assertRef(parentSha, 'parent revision');
  assertRef(headSha, 'head revision');
  // --no-renames lists both paths of a rename, so every touched path is visible to the caller.
  const output = await gitOutput(projectRoot, [
    'diff',
    '--name-status',
    '-z',
    '--no-renames',
    parentSha,
    headSha,
    '--',
  ]);
  // With -z each entry is a status field followed by a path field, both NUL-terminated.
  const fields = output.split('\0');
  const files: ChangedFile[] = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    files.push({ status: fields[index], path: fields[index + 1] });
  }
  return files;
}

export async function diffPatch(projectRoot: string, parentSha: string, headSha: string): Promise<string> {
  assertRef(parentSha, 'parent revision');
  assertRef(headSha, 'head revision');
  return gitOutput(projectRoot, [
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--no-color',
    '--binary',
    parentSha,
    headSha,
    '--',
  ]);
}

/** <tmpdir>/qaspec-catch: the parent of every project's catch root. */
function catchTempRoot(): string {
  return path.join(os.tmpdir(), CATCH_ROOT_NAME);
}

/** <tmpdir>/qaspec-catch/<first 12 hex of sha256(projectRoot)>: where one project's worktrees live. */
function projectCatchRoot(projectRoot: string): string {
  const hash = createHash('sha256').update(path.resolve(projectRoot)).digest('hex').slice(0, 12);
  return path.join(catchTempRoot(), hash);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.lstat(target);
    return true;
  } catch {
    return false;
  }
}

/** Resolves symlinks through the longest existing ancestor, so a path that is already gone still compares. */
async function canonicalPath(target: string): Promise<string> {
  const resolved = path.resolve(target);
  try {
    return await fs.realpath(resolved);
  } catch {
    const parent = path.dirname(resolved);
    return parent === resolved ? resolved : path.join(await canonicalPath(parent), path.basename(resolved));
  }
}

/** True when child is strictly inside parent. Both paths must be canonical. */
function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
  );
}

async function assertInsideRoot(target: string, root: string, action: string): Promise<void> {
  const [canonicalTarget, canonicalRoot] = await Promise.all([canonicalPath(target), canonicalPath(root)]);
  if (!isInside(canonicalTarget, canonicalRoot)) {
    throw new Error(`Refusing to ${action} ${target}: it is outside the catch worktree root ${root}.`);
  }
}

/** A catch worktree is a linked worktree under the catch temp root, so no command reaches the user's checkout. */
async function assertCatchWorktree(worktree: string, action: string): Promise<void> {
  await assertInsideRoot(worktree, catchTempRoot(), action);
  const marker = await fs.stat(path.join(worktree, '.git')).catch(() => undefined);
  if (!marker?.isFile()) {
    throw new Error(`Refusing to ${action} ${worktree}: it is not a catch worktree.`);
  }
}

/** Creates a detached worktree at parentSha, outside the project, and returns its path. */
export async function createCatchWorktree(projectRoot: string, runId: string, parentSha: string): Promise<string> {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(`Invalid catch run id "${runId}": use letters, digits, dots, dashes and underscores.`);
  }
  assertRef(parentSha, 'parent revision');
  const root = projectCatchRoot(projectRoot);
  const worktree = path.join(root, runId);
  if (await pathExists(worktree)) {
    throw new Error(`A catch worktree already exists at ${worktree}.`);
  }
  await fs.mkdir(root, { recursive: true });
  await gitOutput(projectRoot, ['worktree', 'add', '--detach', worktree, parentSha]);
  return worktree;
}

/** Moves a catch worktree to revisionSha. Untracked files git does not ignore are removed; ignored folders stay. */
export async function switchRevision(worktree: string, revisionSha: string): Promise<void> {
  assertRef(revisionSha, 'revision');
  await assertCatchWorktree(worktree, 'switch');
  await gitOutput(worktree, ['checkout', '--detach', '--force', revisionSha, '--']);
  await gitOutput(worktree, ['clean', '-fd']);
}

/** True when any listed path differs between the two revisions. An empty list always needs a reinstall. */
export async function needsReinstall(
  projectRoot: string,
  parentSha: string,
  childSha: string,
  paths: readonly string[]
): Promise<boolean> {
  assertRef(parentSha, 'parent revision');
  assertRef(childSha, 'child revision');
  if (paths.length === 0) {
    return true;
  }
  const result = await runGit(projectRoot, [
    'diff',
    '--quiet',
    '--no-ext-diff',
    parentSha,
    childSha,
    '--',
    ...paths,
  ]);
  if (result.code === 0) {
    return false;
  }
  if (result.code === 1) {
    return true;
  }
  throw gitError(['diff'], result);
}

/** Removes a catch worktree and its git record. Refuses any path outside this project's catch root. */
export async function removeCatchWorktree(projectRoot: string, worktree: string): Promise<void> {
  await assertInsideRoot(worktree, projectCatchRoot(projectRoot), 'remove');
  const target = await canonicalPath(worktree);
  const removal = await runGit(projectRoot, ['worktree', 'remove', '--force', target]);
  // A folder deleted by hand leaves a record that git refuses to remove; pruning clears that record.
  if (removal.code !== 0 && (await pathExists(target))) {
    throw gitError(['worktree'], removal);
  }
  await gitOutput(projectRoot, ['worktree', 'prune']);
}

/**
 * Environment for setup and test processes: built-in essentials, then env.inherit names that are set
 * in the parent, then env.set, which wins. Every other variable is left out.
 */
export function buildChildEnv(
  catchConfig: CatchConfig | undefined,
  parentEnv: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const values = new Map<string, string>();
  for (const name of [...BUILT_IN_ENV_NAMES, ...(catchConfig?.env?.inherit ?? [])]) {
    const value = parentEnv[name];
    if (value !== undefined) {
      values.set(name, value);
    }
  }
  for (const [name, value] of Object.entries(catchConfig?.env?.set ?? {})) {
    values.set(name, value);
  }
  // Object.fromEntries keeps names such as __proto__ as own properties, unlike plain assignment.
  return Object.fromEntries(values);
}

/** Runs each setup command in order, in the worktree, with the built environment. Stops at the first failure. */
export async function runSetup(worktree: string, config: CatchConfig): Promise<SetupResult> {
  await assertCatchWorktree(worktree, 'set up');
  const commands = config.setup?.commands ?? [];
  const timeoutMs = (config.setup?.timeoutSeconds ?? DEFAULT_SETUP_TIMEOUT_SECONDS) * 1000;
  const env = buildChildEnv(config);
  const results: SetupCommandResult[] = [];
  for (const command of commands) {
    const started = performance.now();
    // Output is discarded: only exit status, duration and timeout are returned, so no command output
    // can end up in errors or results.
    const outcome = await runInProcessGroup({
      command,
      shell: true,
      cwd: worktree,
      env,
      timeoutMs,
      captureOutput: false,
    });
    results.push({
      command,
      exitCode: outcome.exitCode,
      durationMs: Math.round(performance.now() - started),
      timedOut: outcome.timedOut,
    });
    if (outcome.timedOut || outcome.exitCode !== 0) {
      return { ok: false, commands: results };
    }
  }
  return { ok: true, commands: results };
}
