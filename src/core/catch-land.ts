/**
 * Landing of the hardening tests of /qsx:catch (T11, S9, D4).
 *
 * The tests the child phase classified land passed on the parent and on the head (catch-child.ts). prepareLanding copies
 * each one's stored content to <run>/land/<project-relative path>, writes one <run>/land.patch that adds them to the
 * head (paths relative to the repository, with the project prefix) and keeps the preparation in <run>/land.json. A test
 * whose path now exists on the head, that names a path another land test names too, or whose stored record cannot be
 * trusted is listed as refused and left out; the others still land.
 *
 * The workflow asks the person once, applies the patch in the user's checkout after git apply --check, and then calls
 * recordLanded, which writes one landed ledger line per prepared test. QASpec never commits and never touches the
 * user's checkout: the head is read through git plumbing (ls-tree), and every write stays in the run folder.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { CatchResult } from './catch-child.js';
import { buildChildEnv } from './catch-git.js';
import {
  type CatchRecordIssue,
  type CatchRunRecord,
  type CatchRunState,
  RESULTS_DIRNAME,
  TESTS_DIRNAME,
  findCatchRun,
  listRecordIds,
  readCatchRun,
  readRecord,
  withCatchRunLock,
  withRunLockAsync,
  writeRunJson,
} from './catch-run.js';
import type { CatchTest, CatchTestKind } from './catch-test.js';
import { RUN_LOCK_TIMEOUT_MS, appendLedgerEntry, nowIso, readLedger, writeFileAtomic } from './run-store.js';

export const LAND_SCHEMA = 'qaspec.catch-land/v1' as const;
/** The folder of the run where each landed test's content is copied, at its project-relative path. */
export const LAND_DIRNAME = 'land';
export const LAND_PATCH_FILE = 'land.patch';
/** The preparation: the tests the patch adds, the tests refused, and the head they were checked against. */
export const LAND_MANIFEST_FILE = 'land.json';
/** The ledger stage of a test the person landed in the checkout; recordLanded writes it, once per prepared test. */
export const LANDED_STAGE = 'landed';

const GIT_TIMEOUT_MS = 120_000;
/** The ls-tree output of the few paths a run names is a few lines: far below the cap. */
const GIT_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
/** A full commit id (SHA-1 or SHA-256): the only head a run records, so nothing else reaches git as an argument. */
const COMMIT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** One test prepared for landing: its record, and the copy written under land/. */
export interface LandedTest {
  test: string;
  kind: CatchTestKind;
  /** Project-relative path of the test file. */
  path: string;
  /** Repository-relative path: the path the patch adds. */
  repoPath: string;
  /** Run-folder relative path of the copy under land/. */
  file: string;
  contentSha256: string;
}

/** A land test that was not prepared, with the reason. path is null when its record cannot be read. */
export interface RefusedLandTest {
  test: string;
  path: string | null;
  reason: string;
}

/** The preparation as land.json keeps it. patch is null when no test was prepared. */
export interface LandPreparation {
  schema: typeof LAND_SCHEMA;
  run: string;
  change: string;
  headSha: string;
  projectPrefix: string;
  patch: string | null;
  tests: LandedTest[];
  refused: RefusedLandTest[];
  preparedAt: string;
}

export interface PrepareLandingInput {
  /** The repository checkout the project belongs to: the head is read from its object store, never its files. */
  projectRoot: string;
  changesDir: string;
  runId: string;
  lockTimeoutMs?: number;
}

/**
 * Refused: nothing was written and every issue is listed. Prepared: the landing is on disk (an empty one, with no patch,
 * when no test can land). patchPath is absolute, so git apply can run from the repository root.
 */
export type PrepareLandingOutcome =
  | { status: 'refused'; issues: CatchRecordIssue[] }
  | { status: 'prepared'; landing: LandPreparation; patchPath: string | null; runDir: string };

export interface RecordLandedInput {
  changesDir: string;
  runId: string;
  lockTimeoutMs?: number;
}

export type RecordLandedOutcome =
  | { status: 'refused'; issues: CatchRecordIssue[] }
  | { status: 'recorded'; run: string; change: string; landed: Array<{ test: string; kind: CatchTestKind; path: string }> };

/** The states before the classification: a run in one of them has no classified test to land. */
const BEFORE_CLASSIFIED: readonly CatchRunState[] = [
  'setting-up',
  'ready',
  'worktree-failed',
  'setup-failed',
  'child-setup-failed',
];

/** A run lands its tests from classified on, including any state added after it, until it is finished. */
function landable(run: CatchRunRecord): boolean {
  return run.state !== 'finished' && !BEFORE_CLASSIFIED.includes(run.state);
}

function stateIssue(run: CatchRunRecord): CatchRecordIssue {
  return {
    code: 'run-state',
    message: `Catch run ${run.runId} is ${run.state}: landing needs a classified run, and a finished run takes no landing.`,
  };
}

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

const idNumber = (id: string): number => Number(id.slice(1));

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** A POSIX project-relative path that stays inside its folder: no absolute, drive, backslash, control or dot segment. */
function isProjectRelativePath(value: unknown): boolean {
  if (
    typeof value !== 'string' ||
    value === '' ||
    value.includes('\\') ||
    path.posix.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value)
  ) {
    return false;
  }
  if ([...value].some((character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f)) {
    return false;
  }
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/** The repository path of a project-relative path: the project prefix (from the run) in front of it. */
function repoPathOf(projectPrefix: string, projectPath: string): string {
  return projectPrefix === '' ? projectPath : `${projectPrefix}/${projectPath}`;
}

/**
 * The environment of the git call: the built-in essentials every catch process gets (buildChildEnv) and the git
 * configuration directory, as catch-git.ts gives git. Nothing else from the parent reaches git, so GIT_* variables and
 * tokens are left out.
 */
function gitEnvironment(): Record<string, string> {
  const environment = buildChildEnv(undefined);
  const configHome = process.env.XDG_CONFIG_HOME;
  if (configHome !== undefined) {
    environment.XDG_CONFIG_HOME = configHome;
  }
  return environment;
}

/** Runs git ls-tree in the project folder, through execFile without a shell. ls-tree only reads the commit: no hook runs. */
function lsTree(projectRoot: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd: projectRoot, env: gitEnvironment(), timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER_BYTES, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
        } else if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
          reject(new Error(`git ls-tree output is larger than ${GIT_MAX_BUFFER_BYTES / (1024 * 1024)} MiB`));
        } else if (error.killed) {
          reject(new Error(`git ls-tree timed out after ${GIT_TIMEOUT_MS / 1000} seconds`));
        } else if (typeof error.code === 'number') {
          reject(new Error(`git ls-tree failed: ${stderr.trim() || `exit code ${error.code}`}`));
        } else {
          reject(new Error(`QASpec could not run git ls-tree: ${error.message}`));
        }
      }
    );
  });
}

/**
 * The repository paths, of those given, that the head commit holds as an entry (a file or a folder). Exact names only:
 * ls-tree matches by prefix, so every returned name is compared with the path asked for.
 */
async function entriesOnHead(projectRoot: string, headSha: string, repoPaths: readonly string[]): Promise<Set<string>> {
  const present = new Set<string>();
  if (repoPaths.length === 0) {
    return present;
  }
  // --full-tree reads the paths from the repository root whatever folder the command runs in; -z keeps names raw.
  const output = await lsTree(projectRoot, [
    '--literal-pathspecs',
    'ls-tree',
    '-z',
    '--full-tree',
    headSha,
    '--',
    ...repoPaths,
  ]);
  for (const record of output.split('\0')) {
    const tab = record.indexOf('\t');
    if (tab !== -1) {
      present.add(record.slice(tab + 1));
    }
  }
  return present;
}

/** A name in a diff header as git writes it: C-quoted when it holds a quote or a backslash, raw otherwise. */
function diffName(prefix: 'a' | 'b', repoPath: string): string {
  const name = `${prefix}/${repoPath}`;
  return /["\\]/.test(name) ? `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : name;
}

/**
 * The git diff that adds one text file: a new file with every line added. A text without a final newline gets the
 * "no newline" marker after its last line, as git writes it.
 */
function newFileDiff(repoPath: string, text: string): string {
  const lines = text.split('\n');
  // A text that ends with a newline splits into an empty last part, which is not a line of the file.
  const endsWithNewline = lines[lines.length - 1] === '';
  if (endsWithNewline) {
    lines.pop();
  }
  const parts = [
    `diff --git ${diffName('a', repoPath)} ${diffName('b', repoPath)}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ ${diffName('b', repoPath)}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
  ];
  if (!endsWithNewline) {
    parts.push('\\ No newline at end of file');
  }
  return `${parts.join('\n')}\n`;
}

/** A land candidate whose record and stored content were read and checked. */
interface CheckedTest {
  id: string;
  test: CatchTest;
  text: string;
}

/**
 * The record and the stored content of a test classified land. Anything that cannot be trusted is a reason to refuse
 * the test: a path that leaves the project, content that no longer matches its hash, or content that is empty or not text.
 */
type LandCheck = { ok: true; checked: CheckedTest } | { ok: false; refused: RefusedLandTest };

function checkLandTest(runDir: string, id: string): LandCheck {
  const test = readRecord<CatchTest>(path.join(runDir, TESTS_DIRNAME), id);
  if (test === undefined) {
    return { ok: false, refused: { test: id, path: null, reason: 'its test record is missing from the run' } };
  }
  if (!isProjectRelativePath(test.path)) {
    return { ok: false, refused: { test: id, path: test.path, reason: `${test.path} is not a project-relative path` } };
  }
  const contentFile = typeof test.content === 'string' ? path.join(runDir, test.content) : undefined;
  if (contentFile === undefined || !isInside(contentFile, path.join(runDir, TESTS_DIRNAME)) || !existsSync(contentFile)) {
    return { ok: false, refused: { test: id, path: test.path, reason: 'its stored content is missing from the run' } };
  }
  const bytes = readFileSync(contentFile);
  if (sha256(bytes) !== test.contentSha256) {
    return {
      ok: false,
      refused: { test: id, path: test.path, reason: 'its stored content no longer matches the recorded hash' },
    };
  }
  if (bytes.length === 0 || bytes.includes(0)) {
    return { ok: false, refused: { test: id, path: test.path, reason: 'its stored content is empty or not text' } };
  }
  return { ok: true, checked: { id, test, text: bytes.toString('utf8') } };
}

/** The tests classified land, in id order, each checked or refused. */
function landCandidates(runDir: string): Array<{ ok: true; checked: CheckedTest } | { ok: false; refused: RefusedLandTest }> {
  const resultsDir = path.join(runDir, RESULTS_DIRNAME);
  return listRecordIds(resultsDir, 'T').flatMap((id) => {
    const result = readRecord<CatchResult>(resultsDir, id);
    return result?.action === 'land' ? [checkLandTest(runDir, id)] : [];
  });
}

/** The landing manifest of a run, or undefined when prepareLanding never wrote one. */
function readManifest(runDir: string): LandPreparation | undefined {
  const file = path.join(runDir, LAND_MANIFEST_FILE);
  if (!existsSync(file)) {
    return undefined;
  }
  const manifest = JSON.parse(readFileSync(file, 'utf-8')) as LandPreparation;
  if (manifest?.schema !== LAND_SCHEMA) {
    throw new Error(`${file} is not a QASpec landing record`);
  }
  return manifest;
}

/**
 * Prepares the landing of a classified run under its lock: copies, the patch and the manifest, all inside the run folder.
 * Refusals (a run that is not classified, or finished) write nothing. Repeating the call rewrites the same files.
 */
export async function prepareLanding(input: PrepareLandingInput): Promise<PrepareLandingOutcome> {
  const location = findCatchRun(input.changesDir, input.runId);
  const timeoutMs = input.lockTimeoutMs ?? RUN_LOCK_TIMEOUT_MS;
  return withRunLockAsync(location.runDir, timeoutMs, async (): Promise<PrepareLandingOutcome> => {
    // Read under the lock: the run may have changed while this command waited for it.
    const run = readCatchRun(location.runDir);
    if (!landable(run)) {
      return { status: 'refused', issues: [stateIssue(run)] };
    }
    if (!COMMIT_ID.test(run.headSha)) {
      return {
        status: 'refused',
        issues: [{ code: 'head-invalid', message: `Catch run ${run.runId} records no valid head commit: "${run.headSha}".` }],
      };
    }

    const refused: RefusedLandTest[] = [];
    const checked: CheckedTest[] = [];
    for (const candidate of landCandidates(location.runDir)) {
      if (candidate.ok) {
        checked.push(candidate.checked);
      } else {
        refused.push(candidate.refused);
      }
    }

    // One file cannot land twice: every test that names a path another land test names too is refused.
    const named = new Map<string, string[]>();
    for (const entry of checked) {
      named.set(entry.test.path, [...(named.get(entry.test.path) ?? []), entry.id]);
    }
    const unique: CheckedTest[] = [];
    for (const entry of checked) {
      const others = (named.get(entry.test.path) ?? []).filter((id) => id !== entry.id);
      if (others.length > 0) {
        refused.push({
          test: entry.id,
          path: entry.test.path,
          reason: `${entry.test.path} is also named by ${others.join(', ')}: one file cannot land twice`,
        });
      } else {
        unique.push(entry);
      }
    }

    // The head decides: a path the head already holds is not a new file, so the patch could not add it.
    const onHead = await entriesOnHead(
      input.projectRoot,
      run.headSha,
      unique.map((entry) => repoPathOf(run.projectPrefix, entry.test.path))
    );
    const landing: CheckedTest[] = [];
    for (const entry of unique) {
      if (onHead.has(repoPathOf(run.projectPrefix, entry.test.path))) {
        refused.push({
          test: entry.id,
          path: entry.test.path,
          reason: `${entry.test.path} exists on the head: the test was not landed`,
        });
      } else {
        landing.push(entry);
      }
    }

    // land/ mirrors this preparation: copies left by an earlier one (a test it no longer lands) are removed first.
    const landDir = path.join(location.runDir, LAND_DIRNAME);
    rmSync(landDir, { recursive: true, force: true });
    const tests: LandedTest[] = [];
    let patch = '';
    for (const entry of landing) {
      const repoPath = repoPathOf(run.projectPrefix, entry.test.path);
      const copy = path.join(landDir, ...entry.test.path.split('/'));
      mkdirSync(path.dirname(copy), { recursive: true });
      writeFileAtomic(copy, entry.text);
      patch += newFileDiff(repoPath, entry.text);
      tests.push({
        test: entry.id,
        kind: entry.test.kind,
        path: entry.test.path,
        repoPath,
        file: `${LAND_DIRNAME}/${entry.test.path}`,
        contentSha256: entry.test.contentSha256,
      });
    }

    const patchFile = path.join(location.runDir, LAND_PATCH_FILE);
    if (tests.length > 0) {
      writeFileAtomic(patchFile, patch);
    } else {
      rmSync(patchFile, { force: true });
    }

    const preparation: LandPreparation = {
      schema: LAND_SCHEMA,
      run: run.runId,
      change: run.change,
      headSha: run.headSha,
      projectPrefix: run.projectPrefix,
      patch: tests.length > 0 ? LAND_PATCH_FILE : null,
      tests,
      refused: refused.sort((left, right) => idNumber(left.test) - idNumber(right.test)),
      preparedAt: nowIso(),
    };
    writeRunJson(location.runDir, LAND_MANIFEST_FILE, preparation);

    return {
      status: 'prepared',
      landing: preparation,
      patchPath: tests.length > 0 ? patchFile : null,
      runDir: location.runDir,
    };
  });
}

/**
 * Records the landing once, after the person applied the patch: one landed ledger line per prepared test. Refused when
 * prepareLanding never ran, when it prepared no test, when the landing is already recorded, or when the run is not
 * landable.
 */
export async function recordLanded(input: RecordLandedInput): Promise<RecordLandedOutcome> {
  const location = findCatchRun(input.changesDir, input.runId);
  return withCatchRunLock(location.runDir, input.lockTimeoutMs ?? RUN_LOCK_TIMEOUT_MS, (): RecordLandedOutcome => {
    const run = readCatchRun(location.runDir);
    if (!landable(run)) {
      return { status: 'refused', issues: [stateIssue(run)] };
    }
    const manifest = readManifest(location.runDir);
    if (manifest === undefined) {
      return {
        status: 'refused',
        issues: [
          { code: 'not-prepared', message: `Catch run ${run.runId} has no landing to record: run qaspec catch land first.` },
        ],
      };
    }
    if (manifest.tests.length === 0) {
      return {
        status: 'refused',
        issues: [
          { code: 'nothing-to-land', message: `No test of run ${run.runId} was prepared to land: nothing to record.` },
        ],
      };
    }
    if (readLedger(location.runDir).some((entry) => entry.stage === LANDED_STAGE)) {
      return {
        status: 'refused',
        issues: [{ code: 'already-recorded', message: `The landing of run ${run.runId} is already recorded.` }],
      };
    }

    const at = nowIso();
    for (const test of manifest.tests) {
      appendLedgerEntry(location.runDir, { stage: LANDED_STAGE, at, test: test.test, kind: test.kind, path: test.path });
    }
    return {
      status: 'recorded',
      run: run.runId,
      change: run.change,
      landed: manifest.tests.map((test) => ({ test: test.test, kind: test.kind, path: test.path })),
    };
  });
}
