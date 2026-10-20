/**
 * Git revisions, worktrees and the child environment for /qsx:catch. Library only.
 *
 * Git runs through execFile without a shell and with a timeout. Every git call of this module runs with hooks
 * disabled (core.hooksPath points at an empty folder made for that call and removed when the call returns) and with
 * the allowlisted environment only, so no hook that the PR commits or setup leaves in the worktree runs here, and
 * tokens are not visible to git. Catch never changes the user's checkout: it reads commits, and it adds or removes
 * worktrees under <tmpdir>/qaspec-catch (git also records them in the repository's .git). Setup and test processes
 * get only the environment that buildChildEnv returns.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs, realpathSync, type Stats } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type { CatchConfig, ResolvedCatchConfig } from './catch-config.js';
import { runInProcessGroup } from './process-group.js';

const GIT_TIMEOUT_MS = 120_000;
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const CATCH_ROOT_NAME = 'qaspec-catch';
/** Prefix of the empty hooks folder that one git call uses. The call removes it when it returns. */
const NO_HOOKS_PREFIX = 'qaspec-no-hooks-';
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const GITDIR_LINE = /^gitdir:[ \t]*(.*?)\s*$/m;
/** Output kept per setup command for diagnostics: the last 4 KiB of its combined stdout and stderr. */
const OUTPUT_TAIL_BYTES = 4 * 1024;
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
/** Git gets the built-in essentials and its own configuration directory, and nothing else from the parent. */
const GIT_ENV_ALLOWLIST = [...BUILT_IN_ENV_NAMES, 'XDG_CONFIG_HOME'] as const;
/** Diff settings that change which paths or prefixes appear; every diff call overrides them. */
const NEUTRAL_DIFF_CONFIG = ['diff.relative=false', 'diff.noprefix=false'] as const;

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
  /** Last 4 KiB of the command's combined stdout and stderr, for diagnostics. It is raw command output. */
  outputTail: string;
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

/** The real path of the project, so the same folder reached through a symlink or another spelling gets one root. */
function realProjectPath(projectRoot: string): string {
  try {
    return realpathSync(path.resolve(projectRoot));
  } catch {
    throw new Error(`Project folder ${projectRoot} does not exist.`);
  }
}

/** <tmpdir>/qaspec-catch: the folder that holds the catch root of every project. */
function sharedCatchRoot(): string {
  return path.join(os.tmpdir(), CATCH_ROOT_NAME);
}

/** <tmpdir>/qaspec-catch/<first 12 hex of sha256(real path of projectRoot)>: where one project's worktrees live. */
function projectCatchRoot(projectRoot: string): string {
  const hash = createHash('sha256').update(realProjectPath(projectRoot)).digest('hex').slice(0, 12);
  return path.join(sharedCatchRoot(), hash);
}

/** The named variables that are set in parentEnv. Unset names are skipped. */
function pickEnv(names: readonly string[], parentEnv: NodeJS.ProcessEnv): Map<string, string> {
  const values = new Map<string, string>();
  for (const name of names) {
    const value = parentEnv[name];
    if (value !== undefined) {
      values.set(name, value);
    }
  }
  return values;
}

/** Git's environment: the allowlist only, so GIT_* repository variables and tokens are never passed. */
function gitEnvironment(): Record<string, string> {
  return Object.fromEntries(pickEnv(GIT_ENV_ALLOWLIST, process.env));
}

/**
 * Runs git in cwd, without a shell. Hooks are disabled with an empty folder that exists only for this call, and
 * config entries (key=value) are passed as -c options before the subcommand.
 * Resolves with the exit code; rejects only when git cannot run, exceeds its output cap or times out.
 */
async function runGit(cwd: string, args: string[], config: readonly string[] = []): Promise<GitResult> {
  const hooks = await fs.mkdtemp(path.join(os.tmpdir(), NO_HOOKS_PREFIX));
  try {
    const options = ['-c', `core.hooksPath=${hooks}`, ...config.flatMap((entry) => ['-c', entry])];
    return await new Promise((resolve, reject) => {
      execFile(
        'git',
        [...options, ...args],
        { cwd, env: gitEnvironment(), timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER_BYTES, encoding: 'utf8' },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({ code: 0, stdout, stderr });
          } else if (typeof error.code === 'number') {
            resolve({ code: error.code, stdout, stderr });
          } else if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
            // Checked before killed: the overflow kills git as well, and that kill is not a timeout.
            reject(new Error(`git ${args[0]} output is larger than ${GIT_MAX_BUFFER_BYTES / (1024 * 1024)} MiB`));
          } else if (error.killed) {
            reject(new Error(`git ${args[0]} timed out after ${GIT_TIMEOUT_MS / 1000} seconds`));
          } else {
            reject(new Error(`QASpec could not run git ${args[0]}: ${error.message}`));
          }
        }
      );
    });
  } finally {
    await fs.rm(hooks, { recursive: true, force: true });
  }
}

function gitError(args: string[], result: GitResult): Error {
  const detail = result.stderr.trim() || `exit code ${result.code}`;
  return new Error(`git ${args[0]} failed: ${detail}`);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function gitOutput(cwd: string, args: string[], config?: readonly string[]): Promise<string> {
  const result = await runGit(cwd, args, config);
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
  const output = await gitOutput(
    projectRoot,
    ['diff', '--name-status', '-z', '--no-renames', parentSha, headSha, '--'],
    NEUTRAL_DIFF_CONFIG
  );
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
  return gitOutput(
    projectRoot,
    [
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--no-color',
      '--no-renames',
      '--binary',
      // Explicit prefixes win over diff.srcPrefix, diff.dstPrefix and diff.mnemonicPrefix.
      '--src-prefix=a/',
      '--dst-prefix=b/',
      parentSha,
      headSha,
      '--',
    ],
    NEUTRAL_DIFF_CONFIG
  );
}

/** Canonical path of a path that may not exist: symlinks are resolved through the longest existing ancestor. */
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

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.lstat(target);
    return true;
  } catch {
    return false;
  }
}

/** The entry at target, or undefined when nothing is there. A link is not followed. */
async function lstatOrUndefined(target: string): Promise<Stats | undefined> {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

/**
 * Refuses a catch folder that is a link, is not a folder, belongs to another user, or that group or others can
 * write to. A folder that does not exist yet passes. Windows has no owner or permission bits to compare (its uid is
 * 0, and its mode bits copy the owner's write bit for everyone), so only the link and folder checks apply there.
 */
async function assertPrivateFolder(folder: string): Promise<void> {
  const entry = await lstatOrUndefined(folder);
  if (entry === undefined) {
    return;
  }
  const refuse = (reason: string) =>
    new Error(`Refusing to use ${folder}: ${reason}. Remove it and run the command again so QASpec can create it.`);
  if (entry.isSymbolicLink()) {
    throw refuse('it is a symbolic link');
  }
  if (!entry.isDirectory()) {
    throw refuse('it is not a folder');
  }
  if (process.platform === 'win32') {
    return;
  }
  if (typeof process.getuid === 'function' && entry.uid !== process.getuid()) {
    throw refuse('it is owned by another user');
  }
  if ((entry.mode & 0o022) !== 0) {
    throw refuse('group or others can write to it');
  }
}

/**
 * Creates <tmpdir>/qaspec-catch and then the project's root with mode 0700 when they are missing. Each folder is
 * proved private before the next one is created under it, so nothing is written through a link.
 */
async function ensureCatchRoots(projectRoot: string): Promise<void> {
  for (const folder of [sharedCatchRoot(), projectCatchRoot(projectRoot)]) {
    if ((await lstatOrUndefined(folder)) === undefined) {
      await fs.mkdir(folder, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      });
    }
    await assertPrivateFolder(folder);
  }
}

/**
 * Proves that target is exactly <project catch root>/<run id>, with symlinks resolved, and returns its
 * canonical path. A link at the run folder is refused, so the check cannot be steered to another folder.
 */
async function assertRunFolder(projectRoot: string, target: string, action: string): Promise<string> {
  // Both catch folders must be private before a path under them is trusted (assertPrivateFolder).
  await assertPrivateFolder(sharedCatchRoot());
  await assertPrivateFolder(projectCatchRoot(projectRoot));
  const root = await canonicalPath(projectCatchRoot(projectRoot));
  const entry = await fs.lstat(path.resolve(target)).catch(() => undefined);
  if (entry?.isSymbolicLink()) {
    throw new Error(`Refusing to ${action} ${target}: it is a symbolic link.`);
  }
  const canonical = await canonicalPath(target);
  if (!isInside(canonical, root)) {
    throw new Error(`Refusing to ${action} ${target}: it is outside the catch worktree root ${root}.`);
  }
  if (path.dirname(canonical) !== root || !RUN_ID_PATTERN.test(path.basename(canonical))) {
    throw new Error(
      `Refusing to ${action} ${target}: it is not a run folder of this project (expected <catch root>/<run id>).`
    );
  }
  return canonical;
}

/** Canonical path of the git common directory of the project's repository: the .git folder all worktrees share. */
async function commonGitDir(projectRoot: string): Promise<string> {
  const output = await gitOutput(projectRoot, ['rev-parse', '--git-common-dir']);
  // Git prints the path relative to the folder it ran in, which is the project folder.
  return canonicalPath(path.resolve(projectRoot, output.replace(/\r?\n$/, '')));
}

/**
 * Proves that worktree is a catch worktree of this project: a run folder whose .git is a link file to a
 * worktree record in this project's own repository, and that record points back at the same folder.
 * Returns the canonical path.
 */
async function assertCatchWorktree(projectRoot: string, worktree: string, action: string): Promise<string> {
  const folder = await assertRunFolder(projectRoot, worktree, action);
  const notCatch = (reason: string) =>
    new Error(`Refusing to ${action} ${worktree}: it is not a catch worktree of this project (${reason}).`);
  const link = path.join(folder, '.git');
  const linkEntry = await fs.lstat(link).catch(() => undefined);
  const pointer = linkEntry?.isFile() ? GITDIR_LINE.exec(await fs.readFile(link, 'utf8')) : null;
  if (pointer === null) {
    throw notCatch('its .git is not a worktree link file');
  }
  const record = await canonicalPath(path.resolve(folder, pointer[1]));
  const records = await canonicalPath(path.join(await commonGitDir(projectRoot), 'worktrees'));
  if (path.dirname(record) !== records) {
    throw notCatch("its git record is not in this project's repository");
  }
  const back = (await fs.readFile(path.join(record, 'gitdir'), 'utf8').catch(() => '')).trim();
  if (back === '' || (await canonicalPath(back)) !== (await canonicalPath(link))) {
    throw notCatch('git does not record this folder as its worktree');
  }
  return folder;
}

/**
 * Deletes the git record of each worktree whose .git link is the given folder's. No other record is touched, unlike
 * git worktree prune, which removes every stale record of the repository.
 */
async function removeRecordsOf(projectRoot: string, folder: string): Promise<void> {
  const records = path.join(await commonGitDir(projectRoot), 'worktrees');
  const link = await canonicalPath(path.join(folder, '.git'));
  const names = await fs.readdir(records).catch(() => [] as string[]);
  for (const name of names) {
    const record = path.join(records, name);
    const back = (await fs.readFile(path.join(record, 'gitdir'), 'utf8').catch(() => '')).trim();
    if (back !== '' && (await canonicalPath(back)) === link) {
      await fs.rm(record, { recursive: true, force: true });
    }
  }
}

/**
 * Undoes a worktree add that failed after it started. A folder that git still knows as a catch worktree goes through
 * git worktree remove. Any other folder is deleted, and only its own git record is deleted by hand, so no
 * repository-wide prune runs. Empty catch folders are removed afterwards.
 */
async function rollbackWorktreeAdd(projectRoot: string, worktree: string): Promise<void> {
  const folder = await assertRunFolder(projectRoot, worktree, 'roll back');
  const linked = await assertCatchWorktree(projectRoot, folder, 'roll back').then(
    () => true,
    () => false
  );
  if (linked) {
    await gitOutput(projectRoot, ['worktree', 'remove', '--force', folder]);
  } else {
    await fs.rm(folder, { recursive: true, force: true });
    await removeRecordsOf(projectRoot, folder);
  }
  await removeEmptyCatchFolders(projectRoot);
}

/** Creates a detached worktree at parentSha, outside the project, and returns its path. */
export async function createCatchWorktree(projectRoot: string, runId: string, parentSha: string): Promise<string> {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(`Invalid catch run id "${runId}": use letters, digits, dots, dashes and underscores.`);
  }
  assertRef(parentSha, 'parent revision');
  await ensureCatchRoots(projectRoot);
  const worktree = path.join(projectCatchRoot(projectRoot), runId);
  if (await pathExists(worktree)) {
    throw new Error(`A catch worktree already exists at ${worktree}.`);
  }
  try {
    await gitOutput(projectRoot, ['worktree', 'add', '--detach', worktree, parentSha]);
  } catch (error) {
    try {
      await rollbackWorktreeAdd(projectRoot, worktree);
    } catch (rollbackError) {
      throw new Error(
        `${errorText(error)} The rollback failed too (${errorText(rollbackError)}): remove ${worktree} by hand.`
      );
    }
    throw error;
  }
  return worktree;
}

/** Moves a catch worktree to revisionSha. Untracked files git does not ignore are removed; ignored folders stay. */
export async function switchRevision(projectRoot: string, worktree: string, revisionSha: string): Promise<void> {
  assertRef(revisionSha, 'revision');
  const folder = await assertCatchWorktree(projectRoot, worktree, 'switch');
  await gitOutput(folder, ['checkout', '--detach', '--force', revisionSha, '--']);
  await gitOutput(folder, ['clean', '-fd']);
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
  const result = await runGit(
    projectRoot,
    ['diff', '--quiet', '--no-ext-diff', parentSha, childSha, '--', ...paths],
    NEUTRAL_DIFF_CONFIG
  );
  if (result.code === 0) {
    return false;
  }
  if (result.code === 1) {
    return true;
  }
  throw gitError(['diff'], result);
}

/** Removes the project's catch root, then <tmpdir>/qaspec-catch, each only when it is empty. */
async function removeEmptyCatchFolders(projectRoot: string): Promise<void> {
  // rmdir removes only empty folders, so a folder that still holds a run or anything else is left alone.
  await fs.rmdir(projectCatchRoot(projectRoot)).catch(() => undefined);
  await fs.rmdir(sharedCatchRoot()).catch(() => undefined);
}

/**
 * Removes a catch worktree and its git record. A folder that still exists must be a catch worktree of this
 * project and is removed with git worktree remove --force. Only a folder that is already gone falls back to
 * git worktree prune, which clears its stale record (and any other stale record of this repository).
 */
export async function removeCatchWorktree(projectRoot: string, worktree: string): Promise<void> {
  if (await pathExists(worktree)) {
    const folder = await assertCatchWorktree(projectRoot, worktree, 'remove');
    await gitOutput(projectRoot, ['worktree', 'remove', '--force', folder]);
  } else {
    await assertRunFolder(projectRoot, worktree, 'remove');
    await gitOutput(projectRoot, ['worktree', 'prune']);
  }
  await removeEmptyCatchFolders(projectRoot);
}

/**
 * Environment for setup and test processes: built-in essentials, then env.inherit names that are set
 * in the parent, then env.set, which wins. Every other variable is left out.
 */
export function buildChildEnv(
  catchConfig: CatchConfig | ResolvedCatchConfig | undefined,
  parentEnv: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const values = pickEnv([...BUILT_IN_ENV_NAMES, ...(catchConfig?.env?.inherit ?? [])], parentEnv);
  for (const [name, value] of Object.entries(catchConfig?.env?.set ?? {})) {
    values.set(name, value);
  }
  // Object.fromEntries keeps names such as __proto__ as own properties, unlike plain assignment.
  return Object.fromEntries(values);
}

/** The last OUTPUT_TAIL_BYTES bytes of output, starting on a character boundary. */
function outputTail(output: string): string {
  // Every UTF-16 unit takes at least one byte, so the last units already hold OUTPUT_TAIL_BYTES bytes.
  const bytes = Buffer.from(output.slice(-OUTPUT_TAIL_BYTES), 'utf8');
  let start = Math.max(0, bytes.length - OUTPUT_TAIL_BYTES);
  // Skips UTF-8 continuation bytes so the tail does not begin with part of a character.
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) {
    start++;
  }
  return bytes.subarray(start).toString('utf8');
}

/**
 * The project folder inside a verified checkout: the checkout itself for an empty prefix, otherwise
 * <checkout>/<prefix>. The prefix is the project's path in its git checkout (projectPrefix); it must stay
 * inside the checkout, including through symlinks, and must exist at this revision.
 */
async function projectFolderIn(checkout: string, prefix: string): Promise<string> {
  if (prefix === '') {
    return checkout;
  }
  if (path.isAbsolute(prefix) || prefix.split(/[\\/]/).includes('..')) {
    throw new Error(`Refusing project folder "${prefix}": it must be a relative path inside the checkout.`);
  }
  const folder = await canonicalPath(path.join(checkout, prefix));
  if (!isInside(folder, checkout)) {
    throw new Error(`Refusing project folder "${prefix}": it leaves the catch worktree.`);
  }
  const stat = await fs.stat(folder).catch(() => undefined);
  if (!stat?.isDirectory()) {
    throw new Error(`Project folder "${prefix}" does not exist at this revision of the catch worktree.`);
  }
  return folder;
}

/** The project's path inside its git checkout, as git reports it: "packages/app", or "" at the checkout root. */
export async function projectPrefix(projectRoot: string): Promise<string> {
  const output = await gitOutput(projectRoot, ['rev-parse', '--show-prefix']);
  return output.replace(/\r?\n$/, '').replace(/\/$/, '');
}

/**
 * Runs each setup command in order, in the project folder of the worktree, with the built environment.
 * Stops at the first failure. prefix is projectPrefix(projectRoot) for a project in a subfolder.
 */
export async function runSetup(
  projectRoot: string,
  worktree: string,
  config: ResolvedCatchConfig,
  prefix = ''
): Promise<SetupResult> {
  const checkout = await assertCatchWorktree(projectRoot, worktree, 'set up');
  const folder = await projectFolderIn(checkout, prefix);
  const commands = config.setup.commands ?? [];
  const timeoutMs = config.setup.timeoutSeconds * 1000;
  const env = buildChildEnv(config);
  const results: SetupCommandResult[] = [];
  for (const command of commands) {
    const started = performance.now();
    const outcome = await runInProcessGroup({
      command,
      shell: true,
      cwd: folder,
      env,
      timeoutMs,
      captureOutput: true,
    });
    results.push({
      command,
      exitCode: outcome.exitCode,
      durationMs: Math.round(performance.now() - started),
      timedOut: outcome.timedOut,
      outputTail: outputTail(outcome.output),
    });
    if (outcome.timedOut || outcome.exitCode !== 0) {
      return { ok: false, commands: results };
    }
  }
  return { ok: true, commands: results };
}
