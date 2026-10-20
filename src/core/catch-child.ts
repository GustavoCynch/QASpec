/**
 * The child phase of /qsx:catch (T8, L28, L35, S5 Table 3). The worktree switches to the PR head once. catch.setup runs
 * again only when needsReinstall says a configured path changed. Every gated test is then run on the head
 * gates.childRuns times and classified with its parent outcome. The run ends classified, and the worktree stays at the
 * head for landing. A failed reinstall ends the run in child-setup-failed with nothing classified.
 */

import { mkdirSync, promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  describeSetupFailure,
  findCatchRun,
  listRecordIds,
  projectDirInWorktree,
  readCatchRun,
  readRecord,
  requireReadyRun,
  RESULTS_DIRNAME,
  RUNNER_OUTPUT_DIRNAME,
  TESTS_DIRNAME,
  CHILD_SETUP_OUTPUT_FILE,
  withoutOutput,
  withRunLockAsync,
  writeRunJson,
  writeRunRecord,
  type CatchRecordIssue,
  type CatchRunRecord,
} from './catch-run.js';
import type { ResolvedCatchConfig } from './catch-config.js';
import { needsReinstall, runSetup, switchRevision } from './catch-git.js';
import {
  type FileRunResult,
  type ProjectFolder,
  type RunOutcome,
  type TestRunnerAdapter,
  createRunnerContext,
  openProjectFolder,
  runnerFor,
} from './catch-runner.js';
import { type CatchTest, type CatchTestKind, runPlacedTest } from './catch-test.js';
import { readProjectConfig } from './project-config.js';
import { RUN_LOCK_TIMEOUT_MS, appendLedgerEntry, nowIso } from './run-store.js';

export const CATCH_RESULT_SCHEMA = 'qaspec.catch-result/v1' as const;

const CHILD_COMMAND = 'qaspec catch child';

/** The Table 3 actions: land (a hardening test to offer), report (a regression to ask about), signal, discard. */
export type CatchAction = 'land' | 'report' | 'signal' | 'discard';

export interface Classification {
  action: CatchAction;
  /** Why a test is discarded or signalled: flaky, vacuous, inconclusive, fails-on-both, child-no-build. */
  reason?: string;
}

const isInconclusive = (outcome: RunOutcome): boolean => outcome === 'timeout' || outcome === 'runner-error';

const discard = (reason: string): Classification => ({ action: 'discard', reason });

/**
 * Table 3 of S5 for one gated test: the parent outcome and the outcome of every child run. Timeouts and runner errors
 * are inconclusive first; child runs that disagree are flaky; no test executed on either side is vacuous. Then the
 * rows: a child that does not build is a signal; a passing child lands; a failing child is reported, unless the parent
 * failed too, which discards it.
 */
export function classifyChild(parent: RunOutcome, child: readonly RunOutcome[]): Classification {
  if (isInconclusive(parent) || child.length === 0 || child.some(isInconclusive)) {
    return discard('inconclusive');
  }
  const [outcome] = child;
  if (child.some((entry) => entry !== outcome)) {
    return discard('flaky');
  }
  if (parent === 'no-tests' || outcome === 'no-tests') {
    return discard('vacuous');
  }
  if (outcome === 'no-build') {
    return { action: 'signal', reason: 'child-no-build' };
  }
  if (outcome === 'pass') {
    return { action: 'land' };
  }
  if (parent === 'fail') {
    return discard('fails-on-both');
  }
  return { action: 'report' };
}

/** One child run of a gated test: its outcome, the bounded failure messages, and the time it took. */
export interface ChildRunRecord {
  outcome: RunOutcome;
  durationMs: number;
  reason?: string;
  files: FileRunResult[];
}

/** The classification of one gated test: what the child runs showed, and the action Table 3 gives it. */
export interface CatchResult {
  schema: typeof CATCH_RESULT_SCHEMA;
  test: string;
  kind: CatchTestKind;
  /** The parent outcome: pass for every catching test, the recorded outcome of the other kinds. */
  parent: RunOutcome;
  /** The outcome of every child run, in order; empty when the test could not be run on the head. */
  child: RunOutcome[];
  action: CatchAction;
  reason?: string;
  /** Why the test could not be run on the head, for the discards that have no runner outcome. */
  detail?: string;
  childRuns: ChildRunRecord[];
  createdAt: string;
}

export interface RunChildInput {
  projectRoot: string;
  changesDir: string;
  runId: string;
  lockTimeoutMs?: number;
}

export type RunChildOutcome =
  | { status: 'refused'; issues: CatchRecordIssue[] }
  | { status: 'setup-failed'; run: CatchRunRecord }
  | { status: 'classified'; run: CatchRunRecord; results: CatchResult[] };

/** The gated tests of a run, in id order: the tests the child phase runs. */
function gatedTests(runDir: string): CatchTest[] {
  const testsDir = path.join(runDir, TESTS_DIRNAME);
  return listRecordIds(testsDir, 'T')
    .map((id) => readRecord<CatchTest>(testsDir, id))
    .filter((test): test is CatchTest => test !== undefined && test.outcome === 'gated');
}

async function pathExists(file: string): Promise<boolean> {
  return fs.lstat(file).then(
    () => true,
    () => false
  );
}

/**
 * Runs catch.setup on the head, in the worktree. Its output tail goes to child-setup-output.json only. The run it
 * returns is ready (installed for the head) or child-setup-failed (nothing is installed for a known revision).
 */
async function reinstallOnHead(input: {
  projectRoot: string;
  worktree: string;
  runDir: string;
  run: CatchRunRecord;
  config: ResolvedCatchConfig;
}): Promise<{ ok: true; run: CatchRunRecord } | { ok: false; run: CatchRunRecord }> {
  const { projectRoot, worktree, runDir, run, config } = input;
  const result = await runSetup(projectRoot, worktree, config, run.projectPrefix);
  writeRunJson(runDir, CHILD_SETUP_OUTPUT_FILE, result);
  const setup = { ok: result.ok, commands: result.commands.map(withoutOutput) };
  const at = nowIso();
  appendLedgerEntry(runDir, {
    stage: 'setup',
    at,
    phase: 'child',
    result: result.ok ? 'passed' : 'failed',
    commands: setup.commands.length,
  });
  if (result.ok) {
    return { ok: true, run: { ...run, setup, installedFor: run.headSha, updatedAt: at } };
  }
  return {
    ok: false,
    run: {
      ...run,
      state: 'child-setup-failed',
      setup,
      installedFor: null,
      failure: describeSetupFailure(result),
      updatedAt: at,
    },
  };
}

/** Runs one gated test on the head, gates.childRuns times, and classifies it. A timeout or runner error stops the runs. */
async function classifyOnHead(input: {
  test: CatchTest;
  runDir: string;
  folder: ProjectFolder;
  projectDir: string;
  adapter: TestRunnerAdapter;
  config: ResolvedCatchConfig;
}): Promise<CatchResult> {
  const { test, runDir, folder, projectDir, adapter, config } = input;
  const createdAt = nowIso();
  const parent = test.parentOutcomes[0];
  const base = { schema: CATCH_RESULT_SCHEMA, test: test.id, kind: test.kind, parent, createdAt };
  if (await pathExists(path.join(folder.real, ...test.path.split('/')))) {
    return {
      ...base,
      child: [],
      action: 'discard',
      reason: 'inconclusive',
      detail: `${test.path} exists on the head: the test was not run there.`,
      childRuns: [],
    };
  }

  const bytes = readFileSync(path.join(runDir, test.content));
  const ctx = createRunnerContext(config, { projectDir, scratchDir: path.join(runDir, RUNNER_OUTPUT_DIRNAME) });
  const childRuns: ChildRunRecord[] = [];
  for (let attempt = 0; attempt < config.gates.childRuns; attempt++) {
    const result = await runPlacedTest({ adapter, ctx, projectReal: folder.real, relative: test.path, bytes });
    childRuns.push({
      outcome: result.outcome,
      durationMs: result.durationMs,
      ...(result.reason === undefined ? {} : { reason: result.reason }),
      files: result.files,
    });
    if (isInconclusive(result.outcome)) {
      break;
    }
  }
  const child = childRuns.map((entry) => entry.outcome);
  const classification = classifyChild(parent, child);
  return {
    ...base,
    child,
    action: classification.action,
    ...(classification.reason === undefined ? {} : { reason: classification.reason }),
    childRuns,
  };
}

/** The results of a run are stored one file per test, in a folder of their own. */
function writeResult(runDir: string, result: CatchResult): void {
  mkdirSync(path.join(runDir, RESULTS_DIRNAME), { recursive: true });
  writeRunJson(runDir, path.join(RESULTS_DIRNAME, `${result.test}.json`), result);
}

/**
 * The child phase: refuses without a gated test (nothing changes); otherwise switches to the head, reinstalls when
 * needed, classifies every gated test and ends the run classified. Runs under the run lock.
 */
export async function runChildPhase(input: RunChildInput): Promise<RunChildOutcome> {
  const location = findCatchRun(input.changesDir, input.runId);
  return withRunLockAsync(
    location.runDir,
    input.lockTimeoutMs ?? RUN_LOCK_TIMEOUT_MS,
    async (): Promise<RunChildOutcome> => {
      const run = readCatchRun(location.runDir);
      requireReadyRun(run, CHILD_COMMAND);
      const tests = gatedTests(location.runDir);
      if (tests.length === 0) {
        return {
          status: 'refused',
          issues: [{ code: 'no-gated-test', message: 'No test passed its parent gates, so there is nothing to run on the child.' }],
        };
      }

      const { adapter, config } = runnerFor(readProjectConfig(input.projectRoot)?.catch);
      if (run.worktree === null) {
        throw new Error(`Catch run ${run.runId} has no worktree: start a new run.`);
      }
      const worktree = run.worktree;
      await switchRevision(input.projectRoot, worktree, run.headSha);

      let current = run;
      if (await needsReinstall(input.projectRoot, run.parentSha, run.headSha, config.setup.reinstallWhenChanged ?? [])) {
        const reinstalled = await reinstallOnHead({
          projectRoot: input.projectRoot,
          worktree,
          runDir: location.runDir,
          run,
          config,
        });
        if (!reinstalled.ok) {
          writeRunRecord(location.runDir, reinstalled.run);
          appendLedgerEntry(location.runDir, { stage: 'child-setup-failed', at: reinstalled.run.updatedAt });
          return { status: 'setup-failed', run: reinstalled.run };
        }
        current = reinstalled.run;
      }

      const projectDir = await projectDirInWorktree(input.projectRoot, current);
      const folder = await openProjectFolder(projectDir);
      const results: CatchResult[] = [];
      for (const test of tests) {
        const result = await classifyOnHead({ test, runDir: location.runDir, folder, projectDir, adapter, config });
        writeResult(location.runDir, result);
        appendLedgerEntry(location.runDir, {
          stage: 'classified',
          at: result.createdAt,
          test: result.test,
          kind: result.kind,
          parent: result.parent,
          child: result.child,
          action: result.action,
          ...(result.reason === undefined ? {} : { reason: result.reason }),
        });
        results.push(result);
      }

      const classified: CatchRunRecord = { ...current, state: 'classified', updatedAt: nowIso() };
      writeRunRecord(location.runDir, classified);
      return { status: 'classified', run: classified, results };
    }
  );
}
