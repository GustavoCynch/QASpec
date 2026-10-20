/**
 * Catch runs for /qsx:catch: start, status and finish (T5b, design in L19 and L27).
 *
 * A run is a folder under the change: qaspec/changes/<name>/catch/<run-id>/ with run.json, intent.json, diff.patch,
 * changed-files.json, setup-output.json (setup tails only; never printed) and ledger.jsonl. start checks every gate
 * before it creates anything, then creates the run folder, the git worktree of the parent and runs catch.setup in
 * it. finish removes the worktree. The user's checkout is never modified: git only reads commits here, and the
 * worktree lives outside the project (catch-git.ts).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ResolvedCatchConfig } from './catch-config.js';
import { evaluateAnalyzeApproval } from './approval-ledger.js';
import { buildCatchIntent, CATCH_INTENT_SCHEMA, type CatchIntent } from './catch-intent.js';
import {
  changedFiles,
  createCatchWorktree,
  diffPatch,
  projectPrefix,
  removeCatchWorktree,
  resolveRevisions,
  runSetup,
  type GitRevisions,
  type SetupCommandResult,
  type SetupResult,
} from './catch-git.js';
import { readProjectConfig } from './project-config.js';
import {
  acquireRunLock,
  appendLedgerEntry,
  generateRunId,
  isValidRunId,
  nowIso,
  readLedger,
  RUN_LOCK_TIMEOUT_MS,
  withRunLock,
  writeFileAtomic,
} from './run-store.js';
import { validateChangeName } from '../utils/change-utils.js';

export const CATCH_RUN_SCHEMA = 'qaspec.catch-run/v1' as const;
/** The folder of a change that holds its catch runs. Git-ignored by its own .gitignore, as execute's runs/ is. */
export const CATCH_RUNS_DIRNAME = 'catch';
/** The command named in the busy-lock message of a catch run. */
export const CATCH_COMMAND = 'qaspec catch';

const RUN_FILE = 'run.json';
const INTENT_FILE = 'intent.json';
const DIFF_FILE = 'diff.patch';
const CHANGED_FILES_FILE = 'changed-files.json';
const SETUP_OUTPUT_FILE = 'setup-output.json';

export type CatchRunMode = 'analysis' | 'without-analysis';
/** setting-up while the worktree and setup run; then ready, or one of the failure states, and finished at the end. */
export type CatchRunState = 'setting-up' | 'ready' | 'worktree-failed' | 'setup-failed' | 'finished';

/** One refusal reason of start: a stable code, what is wrong, and how to resolve it. */
export interface CatchBlocker {
  code: string;
  message: string;
  resolve: string;
}

/** One configured setup command as run.json keeps it: no output, which lives in setup-output.json. */
export interface CatchRunSetupCommand {
  command: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

export interface CatchRunSetup {
  ok: boolean;
  commands: CatchRunSetupCommand[];
}

export interface CatchRunRecord {
  schema: typeof CATCH_RUN_SCHEMA;
  change: string;
  runId: string;
  mode: CatchRunMode;
  /** True for the degraded mode: no approved analysis, so the findings are of lower confidence. */
  lowConfidence: boolean;
  /** The base ref as given (--base or catch.baseRef). */
  baseRef: string;
  /** Full commit of the PR head: the approved headSha, or --head in degraded mode. */
  headSha: string;
  /** Full commit of baseRef. */
  baseSha: string;
  /** merge-base of baseRef and headSha: the revision the worktree is checked out at first. */
  parentSha: string;
  /** The project's path inside its git checkout ("" at the checkout root). */
  projectPrefix: string;
  /** The catch worktree while it exists; null before it is created and after it is removed. */
  worktree: string | null;
  state: CatchRunState;
  setup: CatchRunSetup | null;
  /** The revision whose dependencies are installed in the worktree; null when none are. */
  installedFor: string | null;
  /** Why the run ended in a failure state. */
  failure?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export interface CatchRunLocation {
  changeName: string;
  changeDir: string;
  runDir: string;
  run: CatchRunRecord;
}

export interface CatchRunStatus {
  run: CatchRunRecord;
  /** Ledger lines per stage. */
  ledger: Record<string, number>;
}

export interface CatchRunSummary {
  run: string;
  state: CatchRunState;
  mode: CatchRunMode;
  createdAt: string;
}

export interface StartCatchRunInput {
  projectRoot: string;
  changesDir: string;
  changeName: string;
  /** --base. Without it the base is catch.baseRef. */
  base?: string;
  /** --without-analysis: degraded mode. Requires head; skips the approval and the intent. */
  withoutAnalysis?: boolean;
  /** --head, the PR head commit; only with withoutAnalysis. */
  head?: string;
  /** Wait for the run lock before it fails as busy. Defaults to RUN_LOCK_TIMEOUT_MS. */
  lockTimeoutMs?: number;
}

/** Refused: nothing was created and every blocker is listed. Started: the run exists, in state ready or a failure. */
export type StartCatchRunOutcome =
  | { started: false; blockers: CatchBlocker[] }
  | { started: true; run: CatchRunRecord; runDir: string };

export interface FinishCatchRunInput {
  projectRoot: string;
  changesDir: string;
  runId: string;
  lockTimeoutMs?: number;
}

export interface FinishCatchRunOutcome {
  run: CatchRunRecord;
  alreadyFinished: boolean;
}

/** The checked inputs of a start: every value start needs, all present and consistent. */
interface StartPlan {
  changeName: string;
  changeDir: string;
  mode: CatchRunMode;
  lowConfidence: boolean;
  baseRef: string;
  projectPrefix: string;
  /** null in the degraded mode, which has no approved intent. */
  intent: CatchIntent | null;
  config: ResolvedCatchConfig;
  revisions: GitRevisions;
}

type GateOutcome = { ok: true; plan: StartPlan } | { ok: false; blockers: CatchBlocker[] };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const jsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const short = (sha: string): string => sha.slice(0, 12);

/** The command the person runs to approve the analysis again with the PR head. */
const approveCommand = (changeName: string): string =>
  `qaspec approve analyze --change ${changeName} --head-sha <sha>`;

/** Change names of a changes folder. A private copy of execution-run's listing: that one is not exported. */
function listChangeNames(changesDir: string): string[] {
  if (!existsSync(changesDir)) {
    return [];
  }
  return readdirSync(changesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function readCatchRun(runDir: string): CatchRunRecord {
  const file = path.join(runDir, RUN_FILE);
  const run = JSON.parse(readFileSync(file, 'utf-8')) as CatchRunRecord;
  if (run?.schema !== CATCH_RUN_SCHEMA) {
    throw new Error(`${file} is not a QASpec catch run record`);
  }
  return run;
}

function writeRunRecord(runDir: string, run: CatchRunRecord): void {
  writeFileAtomic(path.join(runDir, RUN_FILE), jsonText(run));
}

/** Creates <change>/catch and its .gitignore when they are missing, as execute creates runs/.gitignore. */
function ensureRunsFolder(changeDir: string): string {
  const runsDir = path.join(changeDir, CATCH_RUNS_DIRNAME);
  mkdirSync(runsDir, { recursive: true });
  const ignoreFile = path.join(runsDir, '.gitignore');
  if (!existsSync(ignoreFile)) {
    // Runs hold setup output and diffs, which stay out of git. An existing file is left as the team wrote it.
    writeFileSync(ignoreFile, '*\n');
  }
  return runsDir;
}

/**
 * Runs an async step under the run lock. withRunLock is synchronous, so a step that awaits (worktree and setup)
 * takes the same lock with acquireRunLock and holds it until the step settles.
 */
async function withRunLockAsync<T>(runDir: string, timeoutMs: number, write: () => Promise<T>): Promise<T> {
  const release = acquireRunLock(runDir, timeoutMs, CATCH_COMMAND);
  try {
    return await write();
  } finally {
    release();
  }
}

function countStages(entries: Array<Record<string, unknown>>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    const stage = String(entry.stage);
    counts[stage] = (counts[stage] ?? 0) + 1;
  }
  return counts;
}

function withoutOutput(result: SetupCommandResult): CatchRunSetupCommand {
  const { command, exitCode, durationMs, timedOut } = result;
  return { command, exitCode, durationMs, timedOut };
}

/** The first failing setup command, described without its output. */
function describeSetupFailure(result: SetupResult): string {
  const failed = result.commands.find((entry) => entry.timedOut || entry.exitCode !== 0);
  if (failed === undefined) {
    return 'Setup failed.';
  }
  const outcome = failed.timedOut
    ? 'timed out'
    : failed.exitCode === null
      ? 'was stopped by a signal'
      : `exited with code ${failed.exitCode}`;
  return `Setup command "${failed.command}" ${outcome}.`;
}

/** Every gate of start, in order, without any side effect. Each failed gate adds one blocker. */
async function checkStart(input: StartCatchRunInput): Promise<GateOutcome> {
  const { projectRoot, changesDir, changeName } = input;
  const changeDir = path.join(changesDir, changeName);
  const blockers: CatchBlocker[] = [];

  let prefix: string | undefined;
  try {
    prefix = await projectPrefix(projectRoot);
  } catch (error) {
    blockers.push({
      code: 'not-git-work-tree',
      message: `The project is not inside a git work tree: ${errorText(error)}`,
      resolve: 'Run qaspec catch from a project that is inside its git repository, with the PR head and base fetched',
    });
  }

  const config = readProjectConfig(projectRoot)?.catch;
  if (config === undefined) {
    blockers.push({
      code: 'catch-config-missing',
      message: 'qaspec/config.yaml has no catch block',
      resolve: 'Add a catch block with runner.adapter and runner.command to qaspec/config.yaml',
    });
  } else {
    if (config.runner.adapter === undefined) {
      blockers.push({
        code: 'runner-adapter-missing',
        message: 'catch.runner.adapter is not set in qaspec/config.yaml',
        resolve: 'Set catch.runner.adapter to jest in qaspec/config.yaml',
      });
    }
    if (config.runner.command === undefined) {
      blockers.push({
        code: 'runner-command-missing',
        message: 'catch.runner.command is not set in qaspec/config.yaml',
        resolve: 'Set catch.runner.command in qaspec/config.yaml, for example: npm test --',
      });
    }
  }

  const baseRef = input.base ?? config?.baseRef;
  if (baseRef === undefined) {
    blockers.push({
      code: 'base-missing',
      message: 'No base ref: neither --base nor catch.baseRef is set',
      resolve: 'Pass --base <ref>, or set catch.baseRef in qaspec/config.yaml',
    });
  }

  let mode: CatchRunMode;
  let headSha: string | undefined;
  let intent: CatchIntent | null = null;
  if (input.withoutAnalysis) {
    mode = 'without-analysis';
    if (input.head === undefined) {
      blockers.push({
        code: 'head-required',
        message: '--without-analysis needs the PR head to catch',
        resolve: 'Pass --head <sha>, the commit of the PR head',
      });
    }
    headSha = input.head;
  } else {
    mode = 'analysis';
    if (input.head !== undefined) {
      blockers.push({
        code: 'head-without-analysis',
        message: '--head is only accepted with --without-analysis: the normal mode takes the head from the analyze approval',
        resolve: 'Remove --head, or add --without-analysis for the degraded mode',
      });
    }
    const approval = evaluateAnalyzeApproval(changeDir, { projectRoot });
    if (approval.state === 'missing') {
      blockers.push({
        code: 'approval-missing',
        message: 'Analyze phase has not been approved',
        resolve: `Approve the analysis with its PR head: ${approveCommand(changeName)}`,
      });
    } else if (approval.state === 'stale') {
      blockers.push({
        code: 'approval-stale',
        message: 'Approval is stale: Analyze artifacts changed since approval',
        resolve: `Re-run /qsx:analyze halt and approve again: ${approveCommand(changeName)}`,
      });
    } else if (approval.record?.headSha === undefined) {
      blockers.push({
        code: 'head-sha-missing',
        message: 'The analyze approval has no headSha, so the PR head to catch is unknown',
        resolve: `Approve again with the PR head: ${approveCommand(changeName)}`,
      });
    } else {
      headSha = approval.record.headSha;
    }

    const outcome = buildCatchIntent(projectRoot, changeName);
    if (outcome.ok) {
      intent = outcome.intent;
    } else {
      for (const issue of outcome.errors) {
        blockers.push({
          code: issue.code,
          message: issue.message,
          resolve: `Fix the analysis or its delta specs, then approve again: ${approveCommand(changeName)}`,
        });
      }
    }
  }

  let revisions: GitRevisions | undefined;
  if (prefix !== undefined && baseRef !== undefined && headSha !== undefined) {
    try {
      revisions = await resolveRevisions({ projectRoot, headSha, baseRef });
    } catch (error) {
      blockers.push({
        code: 'revisions-unresolved',
        message: errorText(error),
        resolve: 'Fix the reported ref or fetch the missing commit into this clone, then run start again',
      });
    }
    if (revisions !== undefined && revisions.parentSha === revisions.headSha) {
      blockers.push({
        code: 'nothing-to-catch',
        message: `The parent ${short(revisions.parentSha)} is the head itself: the PR adds no commits over ${baseRef}`,
        resolve: 'Check --base or catch.baseRef: it must be the branch the PR was opened from',
      });
    }
  }

  if (blockers.length > 0) {
    return { ok: false, blockers };
  }
  // With no blocker every gate above passed, so each value below is present. The guard makes that explicit.
  if (
    prefix === undefined ||
    config === undefined ||
    baseRef === undefined ||
    revisions === undefined ||
    (mode === 'analysis' && intent === null)
  ) {
    throw new Error('catch start: the gates passed without every value a run needs');
  }
  return {
    ok: true,
    plan: {
      changeName,
      changeDir,
      mode,
      lowConfidence: mode === 'without-analysis',
      baseRef,
      projectPrefix: prefix,
      intent,
      config,
      revisions,
    },
  };
}

/**
 * Creates the worktree at the parent and runs catch.setup in it, under the run lock. Returns the run in its final
 * state: ready, worktree-failed (no worktree was made) or setup-failed (the worktree is removed again).
 */
async function prepareWorktree(
  projectRoot: string,
  runDir: string,
  plan: StartPlan,
  started: CatchRunRecord
): Promise<CatchRunRecord> {
  const { parentSha } = plan.revisions;
  let run = started;

  let worktree: string;
  try {
    worktree = await createCatchWorktree(projectRoot, run.runId, parentSha);
  } catch (error) {
    run = { ...run, state: 'worktree-failed', failure: errorText(error), updatedAt: nowIso() };
    writeRunRecord(runDir, run);
    appendLedgerEntry(runDir, { stage: 'worktree-failed', at: run.updatedAt });
    return run;
  }
  run = { ...run, worktree, updatedAt: nowIso() };
  writeRunRecord(runDir, run);

  let result: SetupResult | undefined;
  let failure: string | undefined;
  try {
    result = await runSetup(projectRoot, worktree, plan.config, plan.projectPrefix);
  } catch (error) {
    failure = errorText(error);
  }
  if (result !== undefined) {
    writeFileAtomic(path.join(runDir, SETUP_OUTPUT_FILE), jsonText(result));
    if (!result.ok) {
      failure = describeSetupFailure(result);
    }
  }
  const setup: CatchRunSetup = {
    ok: result?.ok === true,
    commands: (result?.commands ?? []).map(withoutOutput),
  };
  appendLedgerEntry(runDir, {
    stage: 'setup',
    at: nowIso(),
    result: setup.ok ? 'passed' : 'failed',
    commands: setup.commands.length,
  });

  if (setup.ok) {
    run = { ...run, state: 'ready', setup, installedFor: parentSha, updatedAt: nowIso() };
  } else {
    let kept: string | null = worktree;
    try {
      await removeCatchWorktree(projectRoot, worktree);
      kept = null;
    } catch (error) {
      failure = [failure, `The worktree could not be removed: ${errorText(error)}`].filter(Boolean).join(' ');
    }
    run = {
      ...run,
      state: 'setup-failed',
      setup,
      worktree: kept,
      installedFor: null,
      ...(failure === undefined ? {} : { failure }),
      updatedAt: nowIso(),
    };
  }
  writeRunRecord(runDir, run);
  appendLedgerEntry(runDir, { stage: run.state, at: run.updatedAt });
  return run;
}

/**
 * Checks every gate of start and refuses with each blocker when one fails: nothing is created then. A started run
 * is in state ready, or in setup-failed or worktree-failed with its reason in failure.
 */
export async function startCatchRun(input: StartCatchRunInput): Promise<StartCatchRunOutcome> {
  if (!validateChangeName(input.changeName).valid) {
    throw new Error(`Invalid change name "${input.changeName}"`);
  }
  const gate = await checkStart(input);
  if (!gate.ok) {
    return { started: false, blockers: gate.blockers };
  }
  const { plan } = gate;
  const timeoutMs = input.lockTimeoutMs ?? RUN_LOCK_TIMEOUT_MS;
  const { revisions } = plan;

  const files = await changedFiles(input.projectRoot, revisions.parentSha, revisions.headSha);
  const patch = await diffPatch(input.projectRoot, revisions.parentSha, revisions.headSha);

  const runId = generateRunId();
  const runsDir = ensureRunsFolder(plan.changeDir);
  const runDir = path.join(runsDir, runId);
  mkdirSync(runDir);
  const createdAt = nowIso();
  const started: CatchRunRecord = {
    schema: CATCH_RUN_SCHEMA,
    change: plan.changeName,
    runId,
    mode: plan.mode,
    lowConfidence: plan.lowConfidence,
    baseRef: plan.baseRef,
    headSha: revisions.headSha,
    baseSha: revisions.baseSha,
    parentSha: revisions.parentSha,
    projectPrefix: plan.projectPrefix,
    worktree: null,
    state: 'setting-up',
    setup: null,
    installedFor: null,
    createdAt,
    updatedAt: createdAt,
  };
  const degradedIntent = {
    schema: CATCH_INTENT_SCHEMA,
    change: plan.changeName,
    mode: 'without-analysis',
    intentClass: null,
    capabilities: [],
  };

  withRunLock(
    runDir,
    () => {
      writeRunRecord(runDir, started);
      writeFileAtomic(path.join(runDir, INTENT_FILE), jsonText(plan.intent ?? degradedIntent));
      writeFileAtomic(path.join(runDir, DIFF_FILE), patch);
      writeFileAtomic(path.join(runDir, CHANGED_FILES_FILE), jsonText(files));
      appendLedgerEntry(runDir, { stage: 'started', at: createdAt, mode: plan.mode, lowConfidence: plan.lowConfidence });
    },
    { command: CATCH_COMMAND, timeoutMs }
  );

  const run = await withRunLockAsync(runDir, timeoutMs, () =>
    prepareWorktree(input.projectRoot, runDir, plan, started)
  );
  return { started: true, run, runDir };
}

/**
 * Removes the run's worktree and marks the run finished. A run that is already finished is reported as such and
 * changes nothing, so a second finish is safe.
 */
export async function finishCatchRun(input: FinishCatchRunInput): Promise<FinishCatchRunOutcome> {
  const location = findCatchRun(input.changesDir, input.runId);
  const timeoutMs = input.lockTimeoutMs ?? RUN_LOCK_TIMEOUT_MS;
  return withRunLockAsync(location.runDir, timeoutMs, async () => {
    // Read under the lock: the record may have changed while this command waited for it.
    const current = readCatchRun(location.runDir);
    if (current.state === 'finished') {
      return { run: current, alreadyFinished: true };
    }
    if (current.worktree !== null) {
      await removeCatchWorktree(input.projectRoot, current.worktree);
    }
    const finishedAt = nowIso();
    const finished: CatchRunRecord = {
      ...current,
      state: 'finished',
      worktree: null,
      installedFor: null,
      finishedAt,
      updatedAt: finishedAt,
    };
    writeRunRecord(location.runDir, finished);
    appendLedgerEntry(location.runDir, { stage: 'finished', at: finishedAt });
    return { run: finished, alreadyFinished: false };
  });
}

/**
 * Finds a catch run by id. Without a change name the run is searched in every change, as execute finds its runs;
 * with one, only in that change.
 */
export function findCatchRun(changesDir: string, runId: string, changeName?: string): CatchRunLocation {
  if (!isValidRunId(runId)) {
    throw new Error(`Invalid catch run id "${runId}": expected a value such as 20261019T163000Z-abcdef from catch start`);
  }
  if (changeName !== undefined && !validateChangeName(changeName).valid) {
    throw new Error(`Invalid change name "${changeName}"`);
  }
  const names = changeName === undefined ? listChangeNames(changesDir) : [changeName];
  const matches = names.filter((name) =>
    existsSync(path.join(changesDir, name, CATCH_RUNS_DIRNAME, runId, RUN_FILE))
  );
  if (matches.length === 0) {
    throw new Error(
      changeName === undefined
        ? `Catch run ${runId} was not found in any change`
        : `Catch run ${runId} was not found in change "${changeName}"`
    );
  }
  if (matches.length > 1) {
    throw new Error(`Catch run ${runId} exists in more than one change: ${matches.join(', ')}`);
  }
  const [name] = matches;
  const changeDir = path.join(changesDir, name);
  const runDir = path.join(changeDir, CATCH_RUNS_DIRNAME, runId);
  return { changeName: name, changeDir, runDir, run: readCatchRun(runDir) };
}

/** The run and its ledger line counts per stage. Reads only: it takes no lock. */
export function describeCatchRun(location: CatchRunLocation): CatchRunStatus {
  return {
    run: readCatchRun(location.runDir),
    ledger: countStages(readLedger(location.runDir)),
  };
}

/** The runs of a change, sorted by id (ids start with a UTC timestamp). */
export function listCatchRuns(changeDir: string): CatchRunSummary[] {
  const runsDir = path.join(changeDir, CATCH_RUNS_DIRNAME);
  if (!existsSync(runsDir)) {
    return [];
  }
  return readdirSync(runsDir)
    .filter((id) => isValidRunId(id) && existsSync(path.join(runsDir, id, RUN_FILE)))
    .sort()
    .map((id) => {
      const run = readCatchRun(path.join(runsDir, id));
      return { run: id, state: run.state, mode: run.mode, createdAt: run.createdAt };
    });
}

