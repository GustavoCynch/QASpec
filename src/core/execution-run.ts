/**
 * Run lifecycle for /qsx:execute (T6; design in L19, S2, S4, S5, S8, S9, S10, S12, S13).
 *
 * A run lives in qaspec/changes/<change>/runs/<run-id>/. run.json holds its state, readiness results
 * and the status of every case; plans/, observations/ and results/ hold one file per stored plan and
 * per attempt; ledger.jsonl holds the candidates for triage (T7). A plan is copied before execution
 * and never replaced, and observations are always evaluated against that stored copy. The control
 * case is snapshotted when the run starts, so the run keeps the control case it began with.
 */

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { evaluateAnalyzeApproval } from './approval-ledger.js';
import { parseTestcaseDetails, validateCases } from './cases-validation.js';
import { assertIgnoredByGit, gitExitCode } from './execution-auth.js';
import { evaluatePlan, parseObservations, type CaseEvaluation, type CaseVerdict } from './execution-check.js';
import type { ExecutionConfig } from './execution-config.js';
import {
  hashPlanBytes,
  parseJsonText,
  validatePlanAgainstTestcases,
  validatePlanShape,
  type ExecutionIssue,
  type ExecutionPlan,
} from './execution-plan.js';
import {
  probeAppUrl,
  runReadinessCheck,
  type ProbeRecord,
  type ReadinessCheckRecord,
  type ReadinessCommand,
} from './execution-readiness.js';
import { readProjectConfig } from './project-config.js';
import {
  appendLedgerEntry,
  generateRunId,
  isValidRunId,
  LEDGER_FILE,
  nowIso,
  readLedger,
  withRunLock,
  writeFileAtomic,
} from './run-store.js';

export const RUN_SCHEMA = 'qaspec.execution-run/v1';
export const RUNS_DIRNAME = 'runs';
/** Folder of the evidence the agent saved for each attempt (T7), under the run folder. */
export const EVIDENCE_DIRNAME = 'evidence';
export const DEFAULT_DATA_PREFIX = 'QASPEC';
/** The case argument that selects the control case (S8). */
export const CONTROL_ARG = 'control';
/** Case keys of the two control runs, one at the start and one at the end of a run. */
export const CONTROL_START = 'control-start';
export const CONTROL_END = 'control-end';
/** The command named in the busy message of an execute run's lock. */
export const EXECUTE_COMMAND = 'qaspec execute';

/** One retry after a first failed or incomplete verdict; a second one needs triage (S10). */
const MAX_ATTEMPTS = 2;

const RUN_FILE = 'run.json';
export const CONTROL_DIR = 'control';
const CASE_ID_PATTERN = /^\d+(?:\.\d+)*$/;

export type RunState =
  | 'awaiting-confirmation'
  | 'ready'
  | 'blocked-by-environment'
  | 'completed'
  | 'environment-noise';

export type CaseStatus =
  | 'pending'
  | 'planned'
  | 'retry'
  | 'passed'
  | 'needs-human'
  | 'needs-triage'
  | 'blocked-by-environment';

export interface StartBlocker {
  code: string;
  message: string;
  resolve: string;
}

export interface CaseAttemptRecord {
  attempt: number;
  verdict: CaseVerdict;
  /** Run-relative path of the stored observations. */
  observations: string;
  /** Run-relative path of the stored result. */
  result: string;
  recordedAt: string;
}

export interface CasePlanRecord {
  /** Run-relative path of the stored plan copy. */
  path: string;
  sha256: string;
  storedAt: string;
}

export interface CaseRecord {
  status: CaseStatus;
  plan?: CasePlanRecord;
  attempts: CaseAttemptRecord[];
}

export interface ReadinessRecord {
  mode: 'manual' | 'probe';
  checks: ReadinessCheckRecord[];
  probe?: ProbeRecord;
  confirmedAt?: string;
}

export interface ControlCaseRecord {
  /** The path configured in execution.controlCase when the run started. */
  source: string;
  /** Run-relative path of the snapshot the control plans are validated against. */
  snapshot: string;
  sha256: string;
}

/** The results gate of a finished run (T8): its token, and the SHA-256 of the results payload it checked. */
export interface ResultsGateRecord {
  token: string;
  resultsSha256: string;
  storedAt: string;
}

export interface RunRecord {
  schema: typeof RUN_SCHEMA;
  id: string;
  change: string;
  dataTag: string;
  state: RunState;
  createdAt: string;
  readiness: ReadinessRecord;
  controlCase?: ControlCaseRecord;
  cases: Record<string, CaseRecord>;
  finishedAt?: string;
  finishReasons?: string[];
  resultsGate?: ResultsGateRecord;
}

export interface RunLocation {
  changeName: string;
  changeDir: string;
  runDir: string;
  run: RunRecord;
}

export interface RunSummary {
  id: string;
  state: RunState;
  createdAt: string;
}

export interface LedgerCounts {
  candidates: number;
  environmentNoise: number;
}

/** A recorded attempt with the run-relative paths of the evidence files saved for it. */
export interface CaseAttemptView extends CaseAttemptRecord {
  evidence: string[];
}

/** A case as `status` shows it: the stored record, with each attempt's evidence files. */
export interface CaseView extends Omit<CaseRecord, 'attempts'> {
  attempts: CaseAttemptView[];
}

export interface RunStatus {
  run: RunRecord;
  runDir: string;
  ledger: LedgerCounts;
  /** Every case of the run; the stored run record itself is not changed. */
  cases: Record<string, CaseView>;
}

export interface RunTarget {
  changeName: string;
  changeDir: string;
  projectRoot: string;
}

export interface ReadinessHooks {
  beforeReadinessCheck?: (check: ReadinessCommand) => void;
  afterReadinessCheck?: (record: ReadinessCheckRecord) => void;
}

export interface StartRunInput extends RunTarget {
  now?: Date;
  readinessTimeoutMs?: number;
  hooks?: ReadinessHooks;
}

export type StartOutcome =
  | { started: false; blockers: StartBlocker[] }
  | { started: true; run: RunRecord; runDir: string; dataTag: string };

export type PlanStoreOutcome =
  | { ok: true; caseKey: string; path: string; planSha256: string; storedAt: string }
  | { ok: false; issues: ExecutionIssue[] };

/**
 * What a recorded attempt means next: done, a person must judge it, retry once, or needs triage
 * after the retry. A needs-human verdict is final at once: running the case again cannot change it.
 * A control case gets no retry: its first verdict other than passed needs triage at once, because its
 * run ends as environment-noise either way.
 */
export type RecordStatusOutcome = 'passed' | 'needs-human' | 'retry' | 'needs-triage';

export type RecordOutcome =
  | {
      ok: true;
      caseKey: string;
      attempt: number;
      verdict: CaseVerdict;
      outcome: RecordStatusOutcome;
      evaluation: CaseEvaluation;
      planSha256: string;
      observationsSha256: string;
    }
  | { ok: false; issues: ExecutionIssue[] };

export interface FinishOutcome {
  state: 'completed' | 'environment-noise';
  reasons: string[];
}

/** The case number that starts a checkbox title, such as "1.1 " in "1.1 Export totals". */
const CASE_NUMBER_PREFIX = /^\d+(?:\.\d+)*\s+/;

/**
 * The case title as TCMS matches it (D3): the checkbox text after the case number, exactly as written in
 * testcases.md. Triage and results both read titles through this function.
 */
export function testcaseTitle(checkboxTitle: string): string {
  return checkboxTitle.replace(CASE_NUMBER_PREFIX, '');
}

/** A case argument is a testcase id such as 1.1, or the control case. Anything else is refused. */
export function parseCaseArg(caseArg: string): string {
  if (caseArg === CONTROL_ARG || CASE_ID_PATTERN.test(caseArg)) {
    return caseArg;
  }
  throw new Error(`Invalid case id "${caseArg}": use a testcase id such as 1.1, or control`);
}

function isFile(filePath: string): boolean {
  return existsSync(filePath) && statSync(filePath).isFile();
}

function freshCase(status: CaseStatus): CaseRecord {
  return { status, attempts: [] };
}

/** A case is final once it passed, needs a person, or needs triage; nothing more can be recorded. */
function isFinal(record: CaseRecord | undefined): boolean {
  return record?.status === 'passed' || record?.status === 'needs-human' || record?.status === 'needs-triage';
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function readRun(runDir: string): RunRecord {
  const file = path.join(runDir, RUN_FILE);
  const run = JSON.parse(readFileSync(file, 'utf-8')) as RunRecord;
  if (run?.schema !== RUN_SCHEMA) {
    throw new Error(`${file} is not a QASpec run record`);
  }
  return run;
}

export function writeRun(runDir: string, run: RunRecord): void {
  writeJsonAtomic(path.join(runDir, RUN_FILE), run);
}

/** Creates a file that must not exist yet, so a stored plan, observation or result is never replaced. */
function writeNewFile(filePath: string, content: Buffer | string, label: string): void {
  try {
    writeFileSync(filePath, content, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`${label} is already stored in this run; stored files cannot be replaced`);
    }
    throw error;
  }
}

export function countLedger(runDir: string): LedgerCounts {
  const entries = readLedger(runDir);
  return {
    candidates: entries.filter((entry) => entry.stage === 'candidate').length,
    environmentNoise: entries.filter((entry) => entry.environmentNoise === true).length,
  };
}

/**
 * Keeps every ledger line and marks it, so an environment-noise run produces no findings: its candidates,
 * and the judgements, reports and answers that triage added before the run finished.
 */
function markLedgerAsNoise(runDir: string): void {
  const marked = readLedger(runDir).map((entry) => ({ ...entry, environmentNoise: true }));
  writeFileAtomic(path.join(runDir, LEDGER_FILE), marked.map((entry) => `${JSON.stringify(entry)}\n`).join(''));
}

function listChangeNames(changesDir: string): string[] {
  if (!existsSync(changesDir)) {
    return [];
  }
  return readdirSync(changesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function appBlockers(execution: ExecutionConfig): StartBlocker[] {
  const blockers: StartBlocker[] = [];
  if (!execution.app?.url) {
    blockers.push({
      code: 'app-url-missing',
      message: 'execution.app.url is not set in qaspec/config.yaml',
      resolve: 'Set execution.app.url to the URL of the app under test',
    });
  }
  if (!execution.app?.readiness) {
    blockers.push({
      code: 'readiness-missing',
      message: 'execution.app.readiness is not set in qaspec/config.yaml (manual or probe)',
      resolve: 'Set execution.app.readiness to manual or probe',
    });
  } else if (execution.app.readiness === 'probe' && !execution.app.probeUrl) {
    blockers.push({
      code: 'probe-url-missing',
      message: 'execution.app.probeUrl is required when execution.app.readiness is probe',
      resolve: 'Set execution.app.probeUrl to the URL that must answer 2xx',
    });
  }
  return blockers;
}

async function authBlockers(
  auth: NonNullable<ExecutionConfig['auth']>,
  projectRoot: string
): Promise<StartBlocker[]> {
  const missing = (['envFile', 'storageState'] as const)
    .filter((key) => auth[key] === undefined)
    .map((key) => `execution.auth.${key}`);
  if (missing.length > 0) {
    return [
      {
        code: 'auth-settings-missing',
        message: `Missing settings in qaspec/config.yaml: ${missing.join(', ')}`,
        resolve: 'Set envFile and storageState under execution.auth, or remove the auth block',
      },
    ];
  }
  const envFile = auth.envFile as string;
  const storageState = auth.storageState as string;

  // Same guards as qaspec execute login: git must confirm both files are ignored, never tracked.
  try {
    if ((await gitExitCode(projectRoot, ['rev-parse', '--is-inside-work-tree'])) !== 0) {
      return [
        {
          code: 'auth-not-in-git',
          message: `${projectRoot} is not inside a git repository, so git cannot confirm that the credentials and session files are ignored`,
          resolve: 'Run qaspec inside a git repository',
        },
      ];
    }
  } catch (error) {
    return [{ code: 'auth-not-in-git', message: (error as Error).message, resolve: 'Install git and retry' }];
  }

  const blockers: StartBlocker[] = [];
  try {
    await assertIgnoredByGit(projectRoot, envFile);
  } catch (error) {
    blockers.push({ code: 'auth-env-not-ignored', message: (error as Error).message, resolve: `Ignore ${envFile} in .gitignore` });
  }
  try {
    await assertIgnoredByGit(projectRoot, storageState);
  } catch (error) {
    blockers.push({
      code: 'auth-session-not-ignored',
      message: (error as Error).message,
      resolve: `Ignore ${storageState} in .gitignore`,
    });
  }
  if (!isFile(path.join(projectRoot, storageState))) {
    blockers.push({
      code: 'auth-session-missing',
      message: `${storageState} does not exist: the browser session has not been saved`,
      resolve: 'Run qaspec execute login to save the browser session, then start the run again',
    });
  }
  return blockers;
}

/**
 * Every condition under which `execute start` refuses to create anything: the analyze approval, the
 * cases validation, the execution block, the git guards on the auth files and the control case file.
 */
export async function findStartBlockers(target: RunTarget): Promise<StartBlocker[]> {
  const { changeName, changeDir, projectRoot } = target;
  const blockers: StartBlocker[] = [];

  const approval = evaluateAnalyzeApproval(changeDir, { projectRoot });
  if (approval.state === 'missing') {
    blockers.push({
      code: 'approval-missing',
      message: 'Analyze phase has not been approved',
      resolve: `qaspec approve analyze --change ${changeName}`,
    });
  } else if (approval.state === 'stale') {
    blockers.push({
      code: 'approval-stale',
      message: 'Approval is stale: Analyze artifacts changed since approval',
      resolve: `Re-run /qsx:analyze halt and qaspec approve analyze --change ${changeName}`,
    });
  }

  const cases = validateCases(changeDir);
  if (!cases.valid) {
    blockers.push({
      code: 'cases-validation-failed',
      message: `Cases validation failed (${cases.errors.length} error(s))`,
      resolve: `qaspec validate cases --change ${changeName}`,
    });
  }

  const execution = readProjectConfig(projectRoot)?.execution;
  if (!execution) {
    blockers.push({
      code: 'execution-missing',
      message: 'qaspec/config.yaml has no execution block',
      resolve: 'Add an execution block with app.url and app.readiness (see docs/cli.md, qaspec execute start)',
    });
    return blockers;
  }

  blockers.push(...appBlockers(execution));
  if (execution.auth) {
    blockers.push(...(await authBlockers(execution.auth, projectRoot)));
  }
  if (execution.controlCase === undefined) {
    blockers.push({
      code: 'control-case-required',
      message: 'execution.controlCase is not set: a run cannot finish without its control case',
      resolve: 'Set execution.controlCase in qaspec/config.yaml to a smoke case file (see docs/cli.md)',
    });
  } else if (!isFile(path.join(projectRoot, execution.controlCase))) {
    blockers.push({
      code: 'control-case-missing',
      message: `execution.controlCase file not found: ${execution.controlCase}`,
      resolve: 'Create the control case file or fix execution.controlCase in qaspec/config.yaml',
    });
  }
  return blockers;
}

/** Runs the readiness commands in order, then the probe when every command passed. */
async function evaluateReadiness(execution: ExecutionConfig, input: StartRunInput): Promise<ReadinessRecord> {
  const mode = execution.app?.readiness as ReadinessRecord['mode'];
  const checks: ReadinessCheckRecord[] = [];
  for (const command of execution.readinessChecks ?? []) {
    input.hooks?.beforeReadinessCheck?.(command);
    const record = await runReadinessCheck(command, {
      projectRoot: input.projectRoot,
      timeoutMs: input.readinessTimeoutMs,
    });
    input.hooks?.afterReadinessCheck?.(record);
    checks.push(record);
  }

  const readiness: ReadinessRecord = { mode, checks };
  if (mode === 'probe' && checks.every((check) => check.status === 'passed')) {
    readiness.probe = await probeAppUrl(execution.app?.probeUrl as string);
  }
  return readiness;
}

function isBlocked(readiness: ReadinessRecord): boolean {
  return (
    readiness.checks.some((check) => check.status !== 'passed') ||
    (readiness.probe !== undefined && !readiness.probe.ok)
  );
}

/**
 * Starts a run once every gate passes. Gate failures create nothing. A failed readiness check or
 * probe still creates the run, with its cases marked blocked-by-environment, so the evidence stays.
 */
export async function startRun(input: StartRunInput): Promise<StartOutcome> {
  const blockers = await findStartBlockers(input);
  if (blockers.length > 0) {
    return { started: false, blockers };
  }

  const execution = readProjectConfig(input.projectRoot)?.execution as ExecutionConfig;
  const now = input.now ?? new Date();
  const runId = generateRunId(now);
  const runDir = path.join(input.changeDir, RUNS_DIRNAME, runId);
  const dataTag = `${execution.dataPrefix ?? DEFAULT_DATA_PREFIX}-${runId}`;

  const readiness = await evaluateReadiness(execution, input);
  const blocked = isBlocked(readiness);
  const state: RunState = blocked
    ? 'blocked-by-environment'
    : readiness.mode === 'manual'
      ? 'awaiting-confirmation'
      : 'ready';
  const caseStatus: CaseStatus = blocked ? 'blocked-by-environment' : 'pending';

  const cases: Record<string, CaseRecord> = {};
  for (const testcase of parseTestcaseDetails(input.changeDir).cases) {
    if (testcase.id !== undefined) {
      cases[testcase.id] = freshCase(caseStatus);
    }
  }

  let controlCase: ControlCaseRecord | undefined;
  let controlBytes: Buffer | undefined;
  if (execution.controlCase !== undefined) {
    controlBytes = readFileSync(path.join(input.projectRoot, execution.controlCase));
    controlCase = {
      source: execution.controlCase,
      snapshot: path.join(CONTROL_DIR, 'testcases.md'),
      sha256: hashPlanBytes(controlBytes),
    };
    cases[CONTROL_START] = freshCase(caseStatus);
    cases[CONTROL_END] = freshCase(caseStatus);
  }

  const run: RunRecord = {
    schema: RUN_SCHEMA,
    id: runId,
    change: input.changeName,
    dataTag,
    state,
    createdAt: now.toISOString(),
    readiness,
    ...(controlCase ? { controlCase } : {}),
    cases,
  };

  for (const folder of ['plans', 'observations', 'results']) {
    mkdirSync(path.join(runDir, folder), { recursive: true });
  }
  // Runs hold captured app data and evidence, which stay out of git (S13, L22). An existing file
  // is left as the team wrote it.
  const runsIgnoreFile = path.join(input.changeDir, RUNS_DIRNAME, '.gitignore');
  if (!existsSync(runsIgnoreFile)) {
    writeFileSync(runsIgnoreFile, '*\n');
  }
  if (controlCase && controlBytes) {
    mkdirSync(path.join(runDir, CONTROL_DIR), { recursive: true });
    writeFileSync(path.join(runDir, controlCase.snapshot), controlBytes, { flag: 'wx' });
  }
  writeFileSync(path.join(runDir, LEDGER_FILE), '', { flag: 'wx' });
  writeRun(runDir, run);

  return { started: true, run, runDir, dataTag };
}

/** Finds a run by id across the changes of a planning home; the id alone identifies it. */
export function findRun(changesDir: string, runId: string): RunLocation {
  if (!isValidRunId(runId)) {
    throw new Error(`Invalid run id "${runId}": expected a value such as 20261019T163000Z-abcdef from execute start`);
  }
  const matches = listChangeNames(changesDir).filter((name) =>
    existsSync(path.join(changesDir, name, RUNS_DIRNAME, runId, RUN_FILE))
  );
  if (matches.length === 0) {
    throw new Error(`Run ${runId} was not found in any change`);
  }
  if (matches.length > 1) {
    throw new Error(`Run ${runId} exists in more than one change: ${matches.join(', ')}`);
  }
  const [changeName] = matches;
  const changeDir = path.join(changesDir, changeName);
  const runDir = path.join(changeDir, RUNS_DIRNAME, runId);
  return { changeName, changeDir, runDir, run: readRun(runDir) };
}

export function listRuns(changeDir: string): RunSummary[] {
  const runsDir = path.join(changeDir, RUNS_DIRNAME);
  if (!existsSync(runsDir)) {
    return [];
  }
  return readdirSync(runsDir)
    .filter((id) => isValidRunId(id) && existsSync(path.join(runsDir, id, RUN_FILE)))
    .sort()
    .map((id) => {
      const run = readRun(path.join(runsDir, id));
      return { id, state: run.state, createdAt: run.createdAt };
    });
}

export function confirmRun(location: RunLocation): RunRecord {
  return withRunLock<RunRecord>(location.runDir, () => {
    const run = readRun(location.runDir);
    if (run.state !== 'awaiting-confirmation') {
      throw new Error(`Run ${run.id} is ${run.state}; only a run awaiting confirmation can be confirmed`);
    }
    const confirmed: RunRecord = {
      ...run,
      state: 'ready',
      readiness: { ...run.readiness, confirmedAt: nowIso() },
    };
    writeRun(location.runDir, confirmed);
    return confirmed;
  }, { command: EXECUTE_COMMAND });
}

/** Planning and recording need a ready run: anything else explains what the run is waiting for. */
function requireReady(run: RunRecord): void {
  if (run.state === 'ready') {
    return;
  }
  const reasons: Record<Exclude<RunState, 'ready'>, string> = {
    'awaiting-confirmation': `awaiting-confirmation: ask the user to confirm the app serves this change's code, then run qaspec execute confirm --run ${run.id}`,
    'blocked-by-environment': 'blocked-by-environment: fix the environment and start a new run',
    completed: 'completed: the run is already finished',
    'environment-noise': 'environment-noise: the run is already finished',
  };
  throw new Error(`Run ${run.id} is ${reasons[run.state]}`);
}

function noControlCase(run: RunRecord): Error {
  return new Error(`Run ${run.id} has no control case: execution.controlCase was not set when the run started`);
}

/** Case ids that have a plan but no final verdict yet; they block the control case at the end. */
function openCaseIds(run: RunRecord): string[] {
  return Object.keys(run.cases).filter(
    (key) => !key.startsWith('control-') && (run.cases[key].status === 'planned' || run.cases[key].status === 'retry')
  );
}

/** Control plans run once at the start and once at the end, and the end waits for every case. */
function controlKeyForPlan(run: RunRecord): string {
  const start = run.cases[CONTROL_START];
  if (!start) {
    throw noControlCase(run);
  }
  if (start.status === 'pending') {
    return CONTROL_START;
  }
  if (!isFinal(start)) {
    throw new Error(
      `A plan for control-start is already stored in run ${run.id}; stored plans cannot be replaced, so record its observations instead`
    );
  }
  const end = run.cases[CONTROL_END] ?? freshCase('pending');
  if (end.status === 'pending') {
    const [open] = openCaseIds(run);
    if (open !== undefined) {
      const status = run.cases[open].status;
      const next = status === 'retry' ? 'record its retry' : 'record its observations';
      throw new Error(`Case ${open} still awaits a verdict (status ${status}): ${next} before the control case at the end`);
    }
    return CONTROL_END;
  }
  if (isFinal(end)) {
    throw new Error(`The control case has already run at the start and at the end of run ${run.id}`);
  }
  throw new Error(
    `A plan for control-end is already stored in run ${run.id}; stored plans cannot be replaced, so record its observations instead`
  );
}

function caseKeyForPlan(run: RunRecord, caseId: string): string {
  const start = run.cases[CONTROL_START];
  if (start && !isFinal(start)) {
    throw new Error(
      `Record the control case at the start of the run before other cases (control start is ${start.status})`
    );
  }
  const end = run.cases[CONTROL_END];
  if (end && end.status !== 'pending') {
    throw new Error(`The control case at the end is already planned in run ${run.id}, so no other case can be planned`);
  }
  const current = run.cases[caseId];
  if (!current || current.status === 'pending') {
    return caseId;
  }
  if (current.status === 'planned' || current.status === 'retry') {
    throw new Error(`A plan for case ${caseId} is already stored in run ${run.id}; stored plans cannot be replaced`);
  }
  throw new Error(`Case ${caseId} already has a final verdict (${current.status}); no plan can be stored for it`);
}

function controlKeyForRecord(run: RunRecord): string {
  if (!run.cases[CONTROL_START]) {
    throw noControlCase(run);
  }
  for (const key of [CONTROL_START, CONTROL_END]) {
    const status = run.cases[key]?.status;
    if (status === 'planned' || status === 'retry') {
      return key;
    }
  }
  throw new Error(
    `No control case plan awaits a record in run ${run.id}: the control case already has a final verdict ` +
      'or its next plan is not stored yet (qaspec execute plan --case control)'
  );
}

function caseKeyForRecord(run: RunRecord, caseId: string): string {
  const current = run.cases[caseId];
  if (current?.status === 'planned' || current?.status === 'retry') {
    return caseId;
  }
  if (!current || current.status === 'pending') {
    throw new Error(`Case ${caseId} has no stored plan in run ${run.id}; store it with qaspec execute plan first`);
  }
  throw new Error(`Case ${caseId} already has a final verdict (${current.status}); no further attempts are allowed`);
}

/** The testcases a plan is validated against: the change's testcases.md, or the control snapshot. */
function casesForPlan(location: RunLocation, control: boolean) {
  return control
    ? parseTestcaseDetails(path.join(location.runDir, CONTROL_DIR)).cases
    : parseTestcaseDetails(location.changeDir).cases;
}

/**
 * Validates a plan and stores a copy of its exact bytes before the case runs. The copy is written
 * once; the run record keeps its SHA-256 and the time it was stored.
 */
export function storePlan(location: RunLocation, caseArg: string, bytes: Buffer): PlanStoreOutcome {
  const caseId = parseCaseArg(caseArg);
  return withRunLock<PlanStoreOutcome>(location.runDir, () => {
    const run = readRun(location.runDir);
    requireReady(run);
    const control = caseId === CONTROL_ARG;
    const key = control ? controlKeyForPlan(run) : caseKeyForPlan(run, caseId);

    const parsed = parseJsonText(bytes.toString('utf-8'));
    if (!parsed.ok) {
      return { ok: false, issues: [{ message: `Plan is not valid JSON: ${parsed.message}` }] };
    }
    const shape = validatePlanShape(parsed.value);
    const issues: ExecutionIssue[] = [...shape.issues];
    if (shape.plan) {
      if (!control && shape.plan.case.id !== caseId) {
        issues.push({
          message: `Case ${caseId}: the plan declares case "${shape.plan.case.id}", which does not match --case ${caseId}`,
          case: caseId,
        });
      }
      issues.push(
        ...validatePlanAgainstTestcases({ plan: shape.plan, changeName: run.change, cases: casesForPlan(location, control) })
      );
    }
    if (issues.length > 0) {
      return { ok: false, issues };
    }

    const planPath = path.join('plans', `${key}.json`);
    writeNewFile(path.join(location.runDir, planPath), bytes, `The plan for case ${key}`);
    const storedAt = nowIso();
    const planSha256 = hashPlanBytes(bytes);
    const current = run.cases[key] ?? freshCase('pending');
    run.cases[key] = {
      ...current,
      status: 'planned',
      plan: { path: planPath, sha256: planSha256, storedAt },
    };
    writeRun(location.runDir, run);
    return { ok: true, caseKey: key, path: planPath, planSha256, storedAt };
  }, { command: EXECUTE_COMMAND });
}

function parseStoredPlan(bytes: Buffer, key: string): ExecutionPlan {
  const parsed = parseJsonText(bytes.toString('utf-8'));
  const shape = parsed.ok ? validatePlanShape(parsed.value) : undefined;
  if (!shape?.plan) {
    throw new Error(`The stored plan for case ${key} is not a valid plan; the run cannot be trusted`);
  }
  return shape.plan;
}

/**
 * Reads a stored plan copy and checks its exact bytes against the SHA-256 recorded when it was stored,
 * so no step relies on a plan that changed after it was saved.
 */
export function readStoredPlan(runDir: string, key: string, stored: CasePlanRecord): ExecutionPlan {
  const bytes = readFileSync(path.join(runDir, stored.path));
  if (hashPlanBytes(bytes) !== stored.sha256) {
    throw new Error(`The stored plan for case ${key} does not match its recorded SHA-256; the run cannot be trusted`);
  }
  return parseStoredPlan(bytes, key);
}

/**
 * Evaluates observations against the stored plan copy. A first failed or incomplete verdict returns
 * retry; a second one marks the case needs-triage and adds a candidate line to the ledger. A control
 * case has no retry: its first failed or incomplete verdict is needs-triage at once. A needs-human
 * verdict is final at once and adds no candidate. Observations that do not fit the stored plan are
 * refused without using an attempt.
 */
export function recordObservations(location: RunLocation, caseArg: string, bytes: Buffer): RecordOutcome {
  const caseId = parseCaseArg(caseArg);
  return withRunLock<RecordOutcome>(
    location.runDir,
    () => recordObservationsLocked(location, caseId, bytes),
    { command: EXECUTE_COMMAND }
  );
}

function isControlKey(key: string): boolean {
  return key === CONTROL_START || key === CONTROL_END;
}

/** What a verdict means for its case; see RecordStatusOutcome. */
function outcomeOf(key: string, verdict: CaseVerdict, attempt: number): RecordStatusOutcome {
  if (verdict === 'passed' || verdict === 'needs-human') {
    return verdict;
  }
  return isControlKey(key) || attempt >= MAX_ATTEMPTS ? 'needs-triage' : 'retry';
}

/** Records one attempt. The caller holds the run lock, so the run is read and written as one step. */
function recordObservationsLocked(location: RunLocation, caseId: string, bytes: Buffer): RecordOutcome {
  const run = readRun(location.runDir);
  requireReady(run);
  const key = caseId === CONTROL_ARG ? controlKeyForRecord(run) : caseKeyForRecord(run, caseId);
  const current = run.cases[key];
  const stored = current.plan as CasePlanRecord;
  const plan = readStoredPlan(location.runDir, key, stored);

  const parsed = parseJsonText(bytes.toString('utf-8'));
  if (!parsed.ok) {
    return { ok: false, issues: [{ message: `Observations file is not valid JSON: ${parsed.message}` }] };
  }
  const observed = parseObservations(parsed.value, plan);
  if (observed.issues.length > 0) {
    return { ok: false, issues: observed.issues };
  }

  const attempt = current.attempts.length + 1;
  const evaluation = evaluatePlan(plan, observed.observations);
  const recordedAt = nowIso();
  const observationsSha256 = hashPlanBytes(bytes);
  const observationsPath = path.join('observations', `${key}-${attempt}.json`);
  const resultPath = path.join('results', `${key}-${attempt}.json`);
  writeNewFile(path.join(location.runDir, observationsPath), bytes, `The observations for case ${key} attempt ${attempt}`);
  writeNewFile(
    path.join(location.runDir, resultPath),
    `${JSON.stringify(
      {
        case: key,
        attempt,
        verdict: evaluation.verdict,
        planSha256: stored.sha256,
        observationsSha256,
        recordedAt,
        checks: evaluation.checks,
        needsHuman: evaluation.needsHuman,
      },
      null,
      2
    )}\n`,
    `The result for case ${key} attempt ${attempt}`
  );

  const attempts: CaseAttemptRecord[] = [
    ...current.attempts,
    { attempt, verdict: evaluation.verdict, observations: observationsPath, result: resultPath, recordedAt },
  ];
  const outcome = outcomeOf(key, evaluation.verdict, attempt);
  const status: CaseStatus = outcome;

  run.cases[key] = { ...current, status, attempts };
  if (status === 'needs-triage') {
    appendLedgerEntry(location.runDir, {
      stage: 'candidate',
      case: key,
      attempts: attempts.length,
      verdicts: attempts.map((entry) => entry.verdict),
      planSha256: stored.sha256,
      at: recordedAt,
    });
  }
  writeRun(location.runDir, run);

  return {
    ok: true,
    caseKey: key,
    attempt,
    verdict: evaluation.verdict,
    outcome,
    evaluation,
    planSha256: stored.sha256,
    observationsSha256,
  };
}

/**
 * Closes a run. It is completed only when the control case passed at the start and at the end;
 * otherwise it is environment-noise and its candidates are kept but marked so they produce no findings.
 */
export function finishRun(location: RunLocation): FinishOutcome {
  return withRunLock<FinishOutcome>(location.runDir, () => finishRunLocked(location), { command: EXECUTE_COMMAND });
}

/** Closes the run. The caller holds the run lock, because it rewrites the ledger and the run record. */
function finishRunLocked(location: RunLocation): FinishOutcome {
  const run = readRun(location.runDir);
  requireReady(run);
  const start = run.cases[CONTROL_START];
  const end = run.cases[CONTROL_END];
  if (!start || !end) {
    throw new Error(
      `Control case missing from run ${run.id}: set execution.controlCase, start a new run, and record the control case at the start and at the end`
    );
  }
  for (const [where, record] of [
    ['start', start],
    ['end', end],
  ] as const) {
    if (!isFinal(record)) {
      throw new Error(`The control case at the ${where} has no verdict yet (status ${record.status})`);
    }
  }

  const reasons: string[] = [];
  if (start.status !== 'passed') {
    reasons.push(`control case at the start is ${start.status}`);
  }
  if (end.status !== 'passed') {
    reasons.push(`control case at the end is ${end.status}`);
  }
  const state = reasons.length === 0 ? 'completed' : 'environment-noise';
  if (state === 'environment-noise') {
    markLedgerAsNoise(location.runDir);
  }
  writeRun(location.runDir, { ...run, state, finishedAt: nowIso(), finishReasons: reasons });
  return { state, reasons };
}

/** Whether a path is a real folder. A symbolic link to a folder is not, so it is never followed. */
function isRealDirectory(dirPath: string): boolean {
  try {
    return lstatSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Lists the regular files under one folder of the run, relative to the run, sorted by name at each level.
 * Dirent types describe the entry itself, so a symbolic link is neither a folder nor a file and is skipped.
 */
function collectRegularFiles(runDir: string, relativeDir: string, files: string[]): void {
  const entries = readdirSync(path.join(runDir, relativeDir), { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      collectRegularFiles(runDir, relativePath, files);
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
}

/**
 * Run-relative paths of the evidence files that the agent saved for one attempt, in
 * evidence/<case>-<attempt>/. Nothing outside the run is listed: a symbolic link, to a file or a folder,
 * is skipped, and so is an evidence folder or attempt folder that is itself a link.
 */
export function listAttemptEvidence(runDir: string, caseKey: string, attempt: number): string[] {
  const evidenceDir = path.join(runDir, EVIDENCE_DIRNAME);
  const attemptFolder = path.join(EVIDENCE_DIRNAME, `${caseKey}-${attempt}`);
  if (!isRealDirectory(evidenceDir) || !isRealDirectory(path.join(runDir, attemptFolder))) {
    return [];
  }
  const files: string[] = [];
  collectRegularFiles(runDir, attemptFolder, files);
  return files;
}

/** Every case of the run with the evidence files of each recorded attempt. */
function casesWithEvidence(runDir: string, cases: Record<string, CaseRecord>): Record<string, CaseView> {
  return Object.fromEntries(
    Object.entries(cases).map(([key, record]) => [
      key,
      {
        ...record,
        attempts: record.attempts.map((attempt) => ({
          ...attempt,
          evidence: listAttemptEvidence(runDir, key, attempt.attempt),
        })),
      },
    ])
  );
}

export function describeRunStatus(location: RunLocation): RunStatus {
  const run = readRun(location.runDir);
  return {
    run,
    runDir: location.runDir,
    ledger: countLedger(location.runDir),
    cases: casesWithEvidence(location.runDir, run.cases),
  };
}
