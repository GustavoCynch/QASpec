/**
 * Failure triage for /qsx:execute (T7; design in L21, S8, S10, S13).
 *
 * A case that failed twice needs triage. triageContext prints the judge's input: the case text, the stored
 * plan, both attempts with their evidence, and the run's readiness. The judge (a fresh subagent, whose prompt
 * lives in the workflow template, T9) classifies the case once with triageCase. Only an app classification
 * becomes a finding: one sense-check question in findings.json, rendered as findings.md. answerFinding
 * records the person's answer. Every write takes the run lock and appends to ledger.jsonl.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseTestcaseDetails, type TestcaseStepRow } from './cases-validation.js';
import { parseJsonText, type ExecutionIssue, type ExecutionPlan } from './execution-plan.js';
import {
  appendLedgerEntry,
  CONTROL_ARG,
  CONTROL_DIR,
  CONTROL_END,
  CONTROL_START,
  listAttemptEvidence,
  parseCaseArg,
  readLedger,
  readRun,
  readStoredPlan,
  testcaseTitle,
  withRunLock,
  writeFileAtomic,
  type CaseStatus,
  type ReadinessRecord,
  type RunLocation,
  type RunRecord,
  type RunState,
} from './execution-run.js';

export const TRIAGE_CONTEXT_SCHEMA = 'qaspec.execution-triage-context/v1';
export const CLASSIFICATIONS = ['agent', 'environment', 'app'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];
const INTENDED_ANSWERS = ['yes', 'no'] as const;
const FINDINGS_FILE = 'findings.json';
const FINDINGS_MARKDOWN = 'findings.md';
const CHECKBOX_START = /^-\s+\[[ xX]\]\s/;

export interface Finding {
  /** Stable id in creation order: F1, F2, ... */
  id: string;
  /** The case key, such as 1.1. */
  case: string;
  expected: string;
  observed: string;
  /** One sense-check question: what the case expects, what was observed, and "Is this intended?". */
  question: string;
  reportedAt: string;
}

export interface TriageContextAttempt {
  attempt: number;
  verdict: string;
  recordedAt: string;
  /** Run-relative path and the parsed observations stored for the attempt. */
  observations: { path: string; content: unknown };
  /** Run-relative path and the parsed result stored for the attempt. */
  result: { path: string; content: unknown };
  /** Run-relative paths of the evidence files saved for the attempt. */
  evidence: string[];
}

export interface TriageContext {
  schema: typeof TRIAGE_CONTEXT_SCHEMA;
  run: string;
  change: string;
  state: RunState;
  /** The case key: a testcase id, or control-start or control-end. */
  case: string;
  caseStatus: CaseStatus;
  testcase: {
    id: string;
    title: string;
    line: number;
    /** testcases.md of the change, or the control case snapshot of the run. */
    source: 'testcases.md' | 'control/testcases.md';
    /** The case as written: its checkbox line through its Preconditions and Steps. */
    text: string;
    steps: TestcaseStepRow[];
    stepIssues: string[];
  };
  plan: { path: string; sha256: string; content: ExecutionPlan };
  attempts: TriageContextAttempt[];
  readiness: ReadinessRecord;
}

export interface TriageInput {
  classification: string;
  rationale: string;
  expected?: string;
  observed?: string;
  /** The judgement time; defaults to now. */
  now?: Date;
}

export interface AnswerInput {
  finding: string;
  intended: string;
  note?: string;
  /** The answer time; defaults to now. */
  now?: Date;
}

export interface JudgementOutcome {
  ok: true;
  run: string;
  caseKey: string;
  classification: Classification;
  rationale: string;
  judgedAt: string;
  finding?: Finding;
}

export interface AnswerOutcome {
  ok: true;
  run: string;
  finding: string;
  intended: (typeof INTENDED_ANSWERS)[number];
  stage: 'confirmed' | 'dismissed';
  note?: string;
  answeredAt: string;
  secondsToAnswer: number;
}

/** A refused command: nothing was written, and each issue says why. */
export interface Refusal {
  ok: false;
  issues: ExecutionIssue[];
}

export type TriageContextOutcome = { ok: true; context: TriageContext } | Refusal;
export type TriageOutcome = JudgementOutcome | Refusal;
export type AnswerResult = AnswerOutcome | Refusal;

function refusal(message: string, caseKey?: string): Refusal {
  return { ok: false, issues: [{ message, ...(caseKey !== undefined ? { case: caseKey } : {}) }] };
}

function isControlKey(key: string): boolean {
  return key === CONTROL_START || key === CONTROL_END;
}

function isClassification(value: string): value is Classification {
  return (CLASSIFICATIONS as readonly string[]).includes(value);
}

function isIntended(value: string): value is (typeof INTENDED_ANSWERS)[number] {
  return (INTENDED_ANSWERS as readonly string[]).includes(value);
}

function present(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== '';
}

function nowIso(now: Date | undefined): string {
  return (now ?? new Date()).toISOString();
}

function noiseRefusal(run: RunRecord, purpose: string): Refusal {
  return refusal(`Run ${run.id} is environment-noise: its ${purpose}`);
}

/** A judgement of one case: its classification and rationale, and when it was recorded. */
export interface Judgement {
  case: string;
  classification: Classification;
  rationale: string;
  at: string;
}

/**
 * Judgements of the run by case key, read from the judged lines of the ledger. A judged line without a valid
 * classification is not a judgement.
 */
export function readJudgements(runDir: string): Map<string, Judgement> {
  const judgements = new Map<string, Judgement>();
  for (const entry of readLedger(runDir)) {
    if (entry.stage === 'judged' && typeof entry.classification === 'string' && isClassification(entry.classification)) {
      judgements.set(String(entry.case), {
        case: String(entry.case),
        classification: entry.classification,
        rationale: String(entry.rationale),
        at: String(entry.at),
      });
    }
  }
  return judgements;
}

/** Judged cases of the run, from the judged lines of the ledger. */
function judgedCases(runDir: string): Set<string> {
  return new Set(readJudgements(runDir).keys());
}

function answeredFindings(runDir: string): Set<string> {
  return new Set(
    readLedger(runDir)
      .filter((entry) => entry.stage === 'confirmed' || entry.stage === 'dismissed')
      .map((entry) => String(entry.finding))
  );
}

export function readFindings(runDir: string): Finding[] {
  const file = path.join(runDir, FINDINGS_FILE);
  if (!existsSync(file)) {
    return [];
  }
  const findings = JSON.parse(readFileSync(file, 'utf-8')) as unknown;
  if (!Array.isArray(findings)) {
    throw new Error(`${file} is not a list of findings; the run cannot be trusted`);
  }
  return findings as Finding[];
}

/**
 * The finding of each case, named by the last reported line of that case in the ledger. A finding left behind
 * by an interrupted judgement is therefore never shown for a case that was judged again.
 */
export function findingsByCase(runDir: string): Map<string, Finding> {
  const findings = readFindings(runDir);
  const byCase = new Map<string, Finding>();
  for (const entry of readLedger(runDir)) {
    if (entry.stage !== 'reported') {
      continue;
    }
    const finding = findings.find((item) => item.id === entry.finding);
    if (finding) {
      byCase.set(String(entry.case), finding);
    }
  }
  return byCase;
}

/**
 * The case a triage command acts on. `control` names the control case that needs triage: the start one
 * first, then the end one, skipping a control case that was already judged.
 */
function resolveCase(run: RunRecord, caseArg: string, judged: Set<string>): Refusal | { ok: true; key: string } {
  if (caseArg === CONTROL_ARG) {
    const candidates = [CONTROL_START, CONTROL_END].filter((key) => run.cases[key]?.status === 'needs-triage');
    if (candidates.length === 0) {
      return refusal(`No control case of run ${run.id} needs triage`);
    }
    return { ok: true, key: candidates.find((key) => !judged.has(key)) ?? candidates[0] };
  }
  if (!run.cases[caseArg]) {
    return refusal(`Case ${caseArg} is not part of run ${run.id}`, caseArg);
  }
  return { ok: true, key: caseArg };
}

/** The case text as written in testcases.md: its checkbox line up to the next checkbox or heading. */
function caseText(filePath: string, line: number): string {
  const lines = readFileSync(filePath, 'utf-8').replace(/\r\n?/g, '\n').split('\n');
  const block: string[] = [];
  for (let index = line - 1; index < lines.length; index++) {
    if (index > line - 1 && (CHECKBOX_START.test(lines[index]) || lines[index].startsWith('#'))) {
      break;
    }
    block.push(lines[index]);
  }
  return block.join('\n').trimEnd();
}

function readStoredJson(runDir: string, relativePath: string): unknown {
  const parsed = parseJsonText(readFileSync(path.join(runDir, relativePath), 'utf-8'));
  if (!parsed.ok) {
    throw new Error(`${relativePath} is not valid JSON (${parsed.message}); the run cannot be trusted`);
  }
  return parsed.value;
}

function buildContext(location: RunLocation, run: RunRecord, key: string): TriageContextOutcome {
  const record = run.cases[key];
  if (!record.plan) {
    throw new Error(`Case ${key} has no stored plan in run ${run.id}; the run cannot be trusted`);
  }
  const plan = readStoredPlan(location.runDir, key, record.plan);

  const control = isControlKey(key);
  const source = parseTestcaseDetails(control ? path.join(location.runDir, CONTROL_DIR) : location.changeDir);
  const detail = source.cases.find((testcase) => testcase.id === plan.case.id);
  if (source.path === null || detail === undefined) {
    return refusal(
      `Case ${plan.case.id} is not in ${control ? 'the control case snapshot' : 'testcases.md'}, so the judge cannot read it`,
      key
    );
  }

  const context: TriageContext = {
    schema: TRIAGE_CONTEXT_SCHEMA,
    run: run.id,
    change: run.change,
    state: run.state,
    case: key,
    caseStatus: record.status,
    testcase: {
      id: plan.case.id,
      title: testcaseTitle(detail.title),
      line: detail.line,
      source: control ? 'control/testcases.md' : 'testcases.md',
      text: caseText(source.path, detail.line),
      steps: detail.steps,
      stepIssues: detail.stepIssues,
    },
    plan: { path: record.plan.path, sha256: record.plan.sha256, content: plan },
    attempts: record.attempts.map((attempt) => ({
      attempt: attempt.attempt,
      verdict: attempt.verdict,
      recordedAt: attempt.recordedAt,
      observations: { path: attempt.observations, content: readStoredJson(location.runDir, attempt.observations) },
      result: { path: attempt.result, content: readStoredJson(location.runDir, attempt.result) },
      evidence: listAttemptEvidence(location.runDir, key, attempt.attempt),
    })),
    readiness: run.readiness,
  };
  return { ok: true, context };
}

/**
 * The judge's input for one case that needs triage. Refused for an environment-noise run and for a case
 * that does not need triage; nothing is written.
 */
export function triageContext(location: RunLocation, caseArg: string): TriageContextOutcome {
  const caseId = parseCaseArg(caseArg);
  const run = readRun(location.runDir);
  if (run.state === 'environment-noise') {
    return noiseRefusal(run, 'cases produce no findings, so they are not triaged');
  }
  const resolved = resolveCase(run, caseId, judgedCases(location.runDir));
  if (!resolved.ok) {
    return resolved;
  }
  const { key } = resolved;
  if (run.cases[key].status !== 'needs-triage') {
    return refusal(`Case ${key} is ${run.cases[key].status}: only a case that needs triage can be triaged`, key);
  }
  return buildContext(location, run, key);
}

/** The sense-check question of a finding; a sentence that already ends in punctuation keeps it. */
function senseCheckQuestion(caseKey: string, expected: string, observed: string): string {
  const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);
  return `Case ${caseKey} expects: ${sentence(expected)} The run observed: ${sentence(observed)} Is this intended?`;
}

function renderFindings(runId: string, findings: Finding[]): string {
  const lines = [
    `# Findings of run ${runId}`,
    '',
    `Answer each finding with: qaspec execute answer --run ${runId} --finding <id> --intended yes|no`,
    '',
  ];
  for (const finding of findings) {
    lines.push(`## ${finding.id}: case ${finding.case}`, '', finding.question, '');
  }
  return lines.join('\n');
}

/** Input problems that need no run state: classification, rationale, and the expected and observed texts. */
function judgementIssues(input: TriageInput): ExecutionIssue[] {
  const issues: ExecutionIssue[] = [];
  if (!isClassification(input.classification)) {
    issues.push({ message: 'Classification must be agent, environment or app' });
  }
  if (input.rationale.trim() === '') {
    issues.push({ message: '--rationale must not be empty' });
  }
  if (input.classification === 'app') {
    if (!present(input.expected)) {
      issues.push({ message: 'An app judgement needs --expected' });
    }
    if (!present(input.observed)) {
      issues.push({ message: 'An app judgement needs --observed' });
    }
  } else if (input.expected !== undefined || input.observed !== undefined) {
    issues.push({ message: '--expected and --observed apply only to app judgements' });
  }
  return issues;
}

/** The keys of a judgement file: the judgement flags without their dashes. */
const JUDGEMENT_FILE_KEYS = ['classification', 'rationale', 'expected', 'observed'] as const;

/**
 * Reads one judgement from the JSON text of a `triage --input` file, an object whose keys are the judgement
 * flags without their dashes. It checks the shape only; triageCase applies the rules every judgement follows.
 */
export function parseTriageInput(text: string): { ok: true; input: TriageInput } | Refusal {
  const parsed = parseJsonText(text);
  if (!parsed.ok) {
    return refusal(`The judgement file is not valid JSON: ${parsed.message}`);
  }
  const value = parsed.value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return refusal(
      'The judgement file must hold one JSON object: classification, rationale and, for app, expected and observed'
    );
  }
  const fields = value as Record<string, unknown>;
  const issues: ExecutionIssue[] = Object.keys(fields)
    .filter((key) => !(JUDGEMENT_FILE_KEYS as readonly string[]).includes(key))
    .map((key) => ({
      message: `Unknown key "${key}" in the judgement file: use classification, rationale, expected and observed`,
    }));
  const { classification, rationale, expected, observed } = fields;
  if (typeof classification !== 'string') {
    issues.push({ message: 'Classification must be agent, environment or app' });
  }
  if (typeof rationale !== 'string') {
    issues.push({ message: 'rationale must be a string' });
  }
  if (expected !== undefined && typeof expected !== 'string') {
    issues.push({ message: 'expected must be a string' });
  }
  if (observed !== undefined && typeof observed !== 'string') {
    issues.push({ message: 'observed must be a string' });
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    input: {
      classification: classification as string,
      rationale: rationale as string,
      ...(expected !== undefined ? { expected: expected as string } : {}),
      ...(observed !== undefined ? { observed: observed as string } : {}),
    },
  };
}

/**
 * Records the judge's classification of one case, once. An app classification also stores a finding
 * (ledger stage reported) with its sense-check question. Agent and environment produce no finding.
 */
export function triageCase(location: RunLocation, caseArg: string, input: TriageInput): TriageOutcome {
  const caseId = parseCaseArg(caseArg);
  const issues = judgementIssues(input);
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return withRunLock<TriageOutcome>(location.runDir, () => judgeLocked(location, caseId, input));
}

/** The caller holds the run lock, so the findings, the ledger and the run are read and written as one step. */
function judgeLocked(location: RunLocation, caseId: string, input: TriageInput): TriageOutcome {
  const run = readRun(location.runDir);
  if (run.state === 'environment-noise') {
    return noiseRefusal(run, 'cases produce no findings, so they are not triaged');
  }
  const judged = judgedCases(location.runDir);
  const resolved = resolveCase(run, caseId, judged);
  if (!resolved.ok) {
    return resolved;
  }
  const { key } = resolved;
  if (run.cases[key].status !== 'needs-triage') {
    return refusal(`Case ${key} is ${run.cases[key].status}: only a case that needs triage can be triaged`, key);
  }
  if (judged.has(key)) {
    return refusal(`Case ${key} was already judged in run ${run.id}: a case is judged once`, key);
  }
  const classification = input.classification as Classification;
  if (isControlKey(key) && classification === 'app') {
    return refusal(
      'A control case produces no findings: a failed control case makes its run environment-noise (S8)',
      key
    );
  }

  const at = nowIso(input.now);
  const rationale = input.rationale.trim();
  let finding: Finding | undefined;
  if (classification === 'app') {
    const expected = (input.expected ?? '').trim();
    const observed = (input.observed ?? '').trim();
    const findings = readFindings(location.runDir);
    finding = {
      id: `F${findings.length + 1}`,
      case: key,
      expected,
      observed,
      question: senseCheckQuestion(key, expected, observed),
      reportedAt: at,
    };
    const updated = [...findings, finding];
    writeFileAtomic(path.join(location.runDir, FINDINGS_FILE), `${JSON.stringify(updated, null, 2)}\n`);
    writeFileAtomic(path.join(location.runDir, FINDINGS_MARKDOWN), renderFindings(run.id, updated));
  }
  appendLedgerEntry(location.runDir, { stage: 'judged', case: key, classification, rationale, at });
  if (finding) {
    appendLedgerEntry(location.runDir, {
      stage: 'reported',
      finding: finding.id,
      case: key,
      expected: finding.expected,
      observed: finding.observed,
      at,
    });
  }
  return {
    ok: true,
    run: run.id,
    caseKey: key,
    classification,
    rationale,
    judgedAt: at,
    ...(finding ? { finding } : {}),
  };
}

/**
 * Records the person's answer to one finding, once. "No" (not intended) is stage confirmed; "yes"
 * (intended) is stage dismissed. secondsToAnswer runs from the report to the answer.
 */
export function answerFinding(location: RunLocation, input: AnswerInput): AnswerResult {
  if (!isIntended(input.intended)) {
    return { ok: false, issues: [{ message: '--intended must be yes or no' }] };
  }
  return withRunLock<AnswerResult>(location.runDir, () => answerLocked(location, input, input.intended as 'yes' | 'no'));
}

/** The caller holds the run lock. */
function answerLocked(location: RunLocation, input: AnswerInput, intended: 'yes' | 'no'): AnswerResult {
  const run = readRun(location.runDir);
  if (run.state === 'environment-noise') {
    return noiseRefusal(run, 'findings are void, so they are not answered');
  }
  const finding = readFindings(location.runDir).find((entry) => entry.id === input.finding);
  if (!finding) {
    return refusal(`Finding ${input.finding} does not exist in run ${run.id}`);
  }
  if (answeredFindings(location.runDir).has(finding.id)) {
    return refusal(`Finding ${finding.id} was already answered in run ${run.id}: an answer is recorded once`);
  }

  const at = nowIso(input.now);
  const elapsedMs = Date.parse(at) - Date.parse(finding.reportedAt);
  const secondsToAnswer = Math.round(Math.max(0, elapsedMs)) / 1000;
  const stage = intended === 'no' ? 'confirmed' : 'dismissed';
  const note = input.note?.trim() ? input.note.trim() : undefined;
  appendLedgerEntry(location.runDir, {
    stage,
    finding: finding.id,
    intended,
    ...(note !== undefined ? { note } : {}),
    at,
    secondsToAnswer,
  });
  return {
    ok: true,
    run: run.id,
    finding: finding.id,
    intended,
    stage,
    ...(note !== undefined ? { note } : {}),
    answeredAt: at,
    secondsToAnswer,
  };
}
