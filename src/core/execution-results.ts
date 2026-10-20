/**
 * Results for TCMS (T8; design in L24, S11, D3).
 *
 * buildResults reports a finished run as one TCMS result per testcase of the change, control cases excluded.
 * runResultsGate checks that the run can be reported and stores a gate token in the run, so the workflow halts
 * once before any TCMS write. recordTcmsMapping keeps the case title to TCMS id mapping of a run in tcms.json,
 * under the run lock; publish keeps recording no ids.
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseTestcaseDetails, type TestcaseDetail } from './cases-validation.js';
import type { ExecutionIssue } from './execution-plan.js';
import {
  listAttemptEvidence,
  readRun,
  testcaseTitle,
  withRunLock,
  writeFileAtomic,
  writeRun,
  type CaseRecord,
  type CaseStatus,
  type ResultsGateRecord,
  type RunLocation,
  type RunRecord,
  type RunState,
} from './execution-run.js';
import { findingsByCase, readJudgements, type Classification, type Finding, type Judgement } from './execution-triage.js';
import { resolveTcmsTarget, type TcmsTarget } from './tcms-target.js';

export const RESULTS_SCHEMA = 'qaspec.execution-results/v1';
export const TCMS_SCHEMA = 'qaspec.execution-tcms/v1';
const TCMS_FILE = 'tcms.json';

export type TcmsStatus = 'passed' | 'failed' | 'blocked' | 'skipped';
export type FinishedState = 'completed' | 'environment-noise';

export interface ResultEntry {
  /** Testcase id such as 1.1; null when the checkbox has no case number, so the case can never be planned. */
  case: string | null;
  /** The TCMS match key (D3): the checkbox text after the case number, as written in testcases.md. */
  title: string;
  status: TcmsStatus;
  /** Short: the verdict and attempt count, then the finding, or why the case is blocked or skipped. */
  comment: string;
  attempts: number;
  /** Run-relative paths of the evidence files saved for every attempt. */
  evidence: string[];
}

export interface ResultsPayload {
  schema: typeof RESULTS_SCHEMA;
  run: string;
  change: string;
  state: FinishedState;
  finishReasons: string[];
  results: ResultEntry[];
}

interface Refusal {
  ok: false;
  issues: ExecutionIssue[];
}

export type ResultsOutcome = { ok: true; payload: ResultsPayload } | Refusal;

export interface ResultsGateFailure {
  code: string;
  message: string;
  resolve: string;
}

export interface ResultsGateResult {
  passed: boolean;
  token?: string;
  failures: ResultsGateFailure[];
  tcms?: TcmsTarget;
}

export interface TcmsCaseMapping {
  tcmsId: string;
  recordedAt: string;
}

export interface TcmsMapping {
  schema: typeof TCMS_SCHEMA;
  run: string;
  tcmsRun: string | null;
  /** Keyed by the case title, the TCMS match key. */
  cases: Record<string, TcmsCaseMapping>;
}

export interface TcmsMapInput {
  title: string;
  tcmsId: string;
  tcmsRun?: string;
  /** How long to wait for the run lock; defaults to the run lock timeout. */
  lockTimeoutMs?: number;
  now?: Date;
}

export type TcmsMapOutcome = { ok: true; title: string; tcmsId: string; mapping: TcmsMapping } | Refusal;

function refusal(message: string): Refusal {
  return { ok: false, issues: [{ message }] };
}

function isFinished(state: RunState): state is FinishedState {
  return state === 'completed' || state === 'environment-noise';
}

/** The next step that brings a run that is not finished closer to its end. */
function nextStep(run: RunRecord): string {
  if (run.state === 'awaiting-confirmation') {
    return `qaspec execute confirm --run ${run.id}`;
  }
  if (run.state === 'ready') {
    return `qaspec execute finish --run ${run.id}`;
  }
  return 'fix the environment and start a new run';
}

/**
 * The TCMS status of one case (L24). A case that was never planned is skipped. A needs-triage case is failed
 * only when the judge classified it app; any other judgement, or none yet, leaves it blocked. Needs-human and
 * the states that never reach a verdict are blocked as well, so TCMS never takes them for a pass.
 */
export function tcmsStatusOf(status: CaseStatus | undefined, judged?: Classification): TcmsStatus {
  switch (status) {
    case 'passed':
      return 'passed';
    case 'needs-triage':
      return judged === 'app' ? 'failed' : 'blocked';
    case undefined:
    case 'pending':
      return 'skipped';
    default:
      return 'blocked';
  }
}

/** The verdict of a case as its last attempt recorded it, with the number of attempts. */
function verdictText(record: CaseRecord | undefined): string {
  const attempts = record?.attempts ?? [];
  if (attempts.length === 0) {
    return 'No verdict (attempts: 0).';
  }
  const last = attempts[attempts.length - 1];
  return `Verdict ${last.verdict} (attempts: ${attempts.length}).`;
}

/** Why a case is failed, blocked or skipped, in one short sentence; empty for a passed case. */
function reasonText(
  status: TcmsStatus,
  record: CaseRecord | undefined,
  judgement: Judgement | undefined,
  finding: Finding | undefined
): string {
  if (status === 'passed') {
    return '';
  }
  if (status === 'skipped') {
    return 'Skipped: never planned.';
  }
  if (status === 'failed') {
    return finding ? `Finding ${finding.id}: ${finding.question}` : 'Judged app.';
  }
  if (record?.status === 'needs-triage') {
    return judgement ? `Blocked: judged ${judgement.classification}.` : 'Blocked: awaiting triage.';
  }
  if (record?.status === 'needs-human') {
    return 'Blocked: a step needs a person.';
  }
  if (record?.status === 'blocked-by-environment') {
    return 'Blocked: the environment did not pass readiness.';
  }
  return 'Blocked: no final verdict.';
}

interface ResultsContext {
  location: RunLocation;
  run: RunRecord;
  judgements: Map<string, Judgement>;
  findings: Map<string, Finding>;
}

/** One TCMS result for one testcase of the change. Control cases are never part of it. */
function resultEntry(context: ResultsContext, testcase: TestcaseDetail): ResultEntry {
  const { location, run } = context;
  const caseId = testcase.id ?? null;
  const record = caseId === null ? undefined : run.cases[caseId];
  const attempts = record?.attempts ?? [];
  const evidence =
    caseId === null ? [] : attempts.flatMap((attempt) => listAttemptEvidence(location.runDir, caseId, attempt.attempt));
  const judgement = caseId === null ? undefined : context.judgements.get(caseId);
  const finding = caseId === null ? undefined : context.findings.get(caseId);

  // An environment-noise run reports every case as blocked, whatever its own verdict was.
  const status: TcmsStatus =
    run.state === 'environment-noise' ? 'blocked' : tcmsStatusOf(record?.status, judgement?.classification);
  const reason =
    run.state === 'environment-noise'
      ? `Blocked: run is environment-noise (${(run.finishReasons ?? []).join('; ')}).`
      : reasonText(status, record, judgement, finding);

  return {
    case: caseId,
    title: testcaseTitle(testcase.title),
    status,
    comment: [verdictText(record), reason].filter((part) => part !== '').join(' '),
    attempts: attempts.length,
    evidence,
  };
}

/** The results payload of a run, given the run record to report (the gate passes a freshly read one). */
function payloadOf(location: RunLocation, run: RunRecord): ResultsOutcome {
  if (!isFinished(run.state)) {
    return refusal(`Run ${run.id} is ${run.state}: results are built only for a finished run. Next: ${nextStep(run)}`);
  }
  const source = parseTestcaseDetails(location.changeDir);
  if (source.path === null) {
    return refusal(`testcases.md of change "${location.changeName}" is missing: its cases cannot be matched by title`);
  }
  const context: ResultsContext = {
    location,
    run,
    judgements: readJudgements(location.runDir),
    findings: findingsByCase(location.runDir),
  };
  return {
    ok: true,
    payload: {
      schema: RESULTS_SCHEMA,
      run: run.id,
      change: location.changeName,
      state: run.state,
      finishReasons: run.finishReasons ?? [],
      results: source.cases.map((testcase) => resultEntry(context, testcase)),
    },
  };
}

/** The results payload of a finished run: one entry per testcase of the change, in testcases.md order. */
export function buildResults(location: RunLocation): ResultsOutcome {
  return payloadOf(location, location.run);
}

/**
 * Failures of the run itself: it must be finished, and a completed run must have judged every case that needs
 * triage. An environment-noise run reports all its cases as blocked, so its judgements cannot change the results.
 */
function runFailures(location: RunLocation, run: RunRecord): ResultsGateFailure[] {
  if (!isFinished(run.state)) {
    return [
      {
        code: 'run-not-finished',
        message: `Run ${run.id} is ${run.state}: only a finished run can be reported to TCMS`,
        resolve: nextStep(run),
      },
    ];
  }
  if (run.state === 'environment-noise') {
    return [];
  }
  const judgements = readJudgements(location.runDir);
  const unjudged = parseTestcaseDetails(location.changeDir)
    .cases.map((testcase) => testcase.id)
    .filter(
      (caseId): caseId is string =>
        caseId !== undefined && run.cases[caseId]?.status === 'needs-triage' && !judgements.has(caseId)
    );
  if (unjudged.length === 0) {
    return [];
  }
  return [
    {
      code: 'triage-pending',
      message: `No judgement yet for case(s) that need triage: ${unjudged.join(', ')}`,
      resolve: `qaspec execute triage-context --run ${run.id} --case <case-id>, then qaspec execute triage --run ${run.id} --case <case-id> --input <judgement.json>`,
    },
  ];
}

/** The gate token: results-gate plus eight hex characters, derived from the payload hash and a nonce as publish-gate does. */
function deriveToken(resultsSha256: string, nonce: string): string {
  const digest = createHash('sha256').update(resultsSha256).update(':').update(nonce).digest('hex');
  return `results-gate:${digest.slice(0, 8)}`;
}

/**
 * Checks that the run can be reported to TCMS. When every check passes, it stores a gate token and the SHA-256
 * of the results payload in the run, under the run lock, and returns the token for the workflow to cite.
 */
export function runResultsGate(location: RunLocation, projectRoot: string): ResultsGateResult {
  return withRunLock<ResultsGateResult>(location.runDir, () => {
    const run = readRun(location.runDir);
    const target = resolveTcmsTarget(location.changeDir, projectRoot);
    const failures: ResultsGateFailure[] = [...runFailures(location, run)];
    if (!target.usable) {
      failures.push({
        code: 'tcms-missing',
        message: 'Change has no usable TCMS target (provider + project) in .qaspec.yaml or config defaults',
        resolve: `qaspec tcms set --change ${location.changeName} --provider <provider> --project <CODE> [--base-url <url>]`,
      });
    }
    if (failures.length > 0) {
      return { passed: false, failures };
    }

    const built = payloadOf(location, run);
    if (!built.ok) {
      return {
        passed: false,
        failures: built.issues.map((issue) => ({
          code: 'results-unavailable',
          message: issue.message,
          resolve: 'Restore the change testcases.md, then run results-gate again',
        })),
      };
    }

    // Results are matched to TCMS cases by title (D3), so a repeated title cannot be reported.
    const titles = built.payload.results.map((entry) => entry.title);
    const repeated = [...new Set(titles.filter((title, index) => titles.indexOf(title) !== index))];
    if (repeated.length > 0) {
      return {
        passed: false,
        failures: [
          {
            code: 'duplicate-titles',
            message: `testcases.md repeats case titles, so TCMS cases cannot be matched by title: ${repeated
              .map((title) => `"${title}"`)
              .join(', ')}`,
            resolve: 'Give every case in testcases.md a unique title, then run results-gate again',
          },
        ],
      };
    }

    const resultsSha256 = createHash('sha256').update(JSON.stringify(built.payload)).digest('hex');
    const token = deriveToken(resultsSha256, randomBytes(16).toString('hex'));
    const gate: ResultsGateRecord = { token, resultsSha256, storedAt: new Date().toISOString() };
    writeRun(location.runDir, { ...run, resultsGate: gate });
    return { passed: true, token, failures: [], tcms: target.target };
  });
}

/** The title to TCMS id mapping of a run; an empty mapping when none was recorded yet. */
export function readTcmsMapping(runDir: string): TcmsMapping {
  const file = path.join(runDir, TCMS_FILE);
  if (!existsSync(file)) {
    return { schema: TCMS_SCHEMA, run: path.basename(runDir), tcmsRun: null, cases: {} };
  }
  const mapping = JSON.parse(readFileSync(file, 'utf-8')) as TcmsMapping;
  if (mapping?.schema !== TCMS_SCHEMA) {
    throw new Error(`${file} is not a QASpec TCMS mapping; the run cannot be trusted`);
  }
  return mapping;
}

/**
 * Records one title to TCMS id mapping under the run lock. The title must be the title of exactly one testcase
 * of the change. A title keeps the TCMS id it was first given, and a run keeps the TCMS run it was first given;
 * repeating the same mapping changes nothing.
 */
/**
 * TCMS ids are passed on a command line, so they are limited to characters no shell interprets.
 * Ids from any TCMS fit this set (numbers, project-prefixed keys, UUIDs).
 */
const TCMS_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const TCMS_ID_CHARACTERS = 'letters, digits, dot, underscore, colon and hyphen';

export function recordTcmsMapping(location: RunLocation, input: TcmsMapInput): TcmsMapOutcome {
  const title = input.title.trim();
  const tcmsId = input.tcmsId.trim();
  const tcmsRun = input.tcmsRun?.trim();
  const issues: ExecutionIssue[] = [];
  if (title === '') {
    issues.push({ message: '--title must not be empty' });
  }
  if (tcmsId === '') {
    issues.push({ message: '--tcms-id must not be empty' });
  } else if (!TCMS_ID_PATTERN.test(tcmsId)) {
    issues.push({ message: `--tcms-id may contain only ${TCMS_ID_CHARACTERS}` });
  }
  if (tcmsRun === '') {
    issues.push({ message: '--tcms-run must not be empty' });
  } else if (tcmsRun !== undefined && !TCMS_ID_PATTERN.test(tcmsRun)) {
    issues.push({ message: `--tcms-run may contain only ${TCMS_ID_CHARACTERS}` });
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const matches = parseTestcaseDetails(location.changeDir).cases.filter(
    (testcase) => testcaseTitle(testcase.title) === title
  );
  if (matches.length === 0) {
    return refusal(
      `Title "${title}" is not a testcase of change "${location.changeName}": use the checkbox text after the case number, as written in testcases.md`
    );
  }
  if (matches.length > 1) {
    return refusal(
      `Title "${title}" matches ${matches.length} testcases of change "${location.changeName}": titles must be unique to map them`
    );
  }

  const recordedAt = (input.now ?? new Date()).toISOString();
  return withRunLock<TcmsMapOutcome>(
    location.runDir,
    () => {
      const mapping = readTcmsMapping(location.runDir);
      const existing = Object.hasOwn(mapping.cases, title) ? mapping.cases[title] : undefined;
      if (existing && existing.tcmsId !== tcmsId) {
        return refusal(`Title "${title}" is already mapped to TCMS id ${existing.tcmsId}: a title keeps one TCMS id`);
      }
      if (tcmsRun !== undefined && mapping.tcmsRun !== null && mapping.tcmsRun !== tcmsRun) {
        return refusal(
          `Run ${location.run.id} is already mapped to TCMS run ${mapping.tcmsRun}: a run keeps one TCMS run`
        );
      }
      const next: TcmsMapping = {
        ...mapping,
        tcmsRun: tcmsRun ?? mapping.tcmsRun,
        cases: { ...mapping.cases, [title]: existing ?? { tcmsId, recordedAt } },
      };
      if (JSON.stringify(next) !== JSON.stringify(mapping)) {
        writeFileAtomic(path.join(location.runDir, TCMS_FILE), `${JSON.stringify(next, null, 2)}\n`);
      }
      return { ok: true, title, tcmsId, mapping: next };
    },
    input.lockTimeoutMs
  );
}
