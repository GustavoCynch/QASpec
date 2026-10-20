/**
 * Assessors of /qsx:catch (T9, S2, S7, L36). Every classified report goes through two checks that never add a report,
 * change a classification or promote a result:
 *
 *   assessCatchRun (once, on a classified run): generic false-positive rules, then the per-project rules of
 *     catch.rulesFile, decide whether each report survives. A matching false-positive rule discards it (rule-filtered,
 *     with the rule id); a true-positive rule only adds its signal. Intent signals (S2) and the low-confidence mark of
 *     degraded runs are added to the reports that survive.
 *   judgeCatchReport (once per surviving report): the fresh-context judges of catch.judges give a verdict each. Scores
 *     keep +1, discard low +0.5, discard medium -0.5, discard high -1; a median below 0 discards the report.
 *
 * A regular expression runs the way execution-check runs a matches check: its value is capped in length and it runs in
 * an isolated context with a time limit. A pattern that cannot be evaluated never discards a report.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { CatchResult } from './catch-child.js';
import { findIntentRequirement, type CatchIntentArtifact, type CatchRisk } from './catch-context.js';
import type { CatchMutant } from './catch-mutant.js';
import { INTENT_CLASSES, type CatchRequirementStatus, type IntentClass } from './catch-intent.js';
import {
  ASSESSMENT_FILE,
  INTENT_FILE,
  JUDGES_DIRNAME,
  MUTANTS_DIRNAME,
  RESULTS_DIRNAME,
  RISKS_DIRNAME,
  TESTS_DIRNAME,
  findCatchRun,
  listRecordIds,
  readCatchRun,
  readRecord,
  readRunJson,
  writeRecord,
  writeRunJson,
  writeRunRecord,
  withCatchRunLock,
  type CatchRecordIssue,
  type CatchRunRecord,
  type CatchRunState,
} from './catch-run.js';
import type { CatchTest } from './catch-test.js';
import { MATCH_TIMEOUT_MS, MAX_MATCH_VALUE_LENGTH } from './execution-check.js';
import { readProjectConfig } from './project-config.js';
import { RUN_LOCK_TIMEOUT_MS, appendLedgerEntry, nowIso } from './run-store.js';

export const CATCH_ASSESSMENT_SCHEMA = 'qaspec.catch-assessment/v1' as const;
export const CATCH_JUDGEMENT_SCHEMA = 'qaspec.catch-judgement/v1' as const;

/** Bytes of a rules file the CLI reads: a rules file is small, and a larger one is refused rather than cut. */
export const RULES_FILE_MAX_BYTES = 64 * 1024;
const RULE_ID = /^[a-z0-9][a-z0-9-]*$/;
const GENERIC_PREFIX = 'generic-';
const TEST_ID = /^T[1-9]\d*$/;
const MAX_JUDGE_NAME_CHARS = 100;
const MAX_RATIONALE_CHARS = 2000;
export const RULE_KINDS = ['false-positive', 'true-positive'] as const;
export type RuleKind = (typeof RULE_KINDS)[number];
const REQUIREMENT_STATUSES = ['preserved', 'added', 'modified', 'removed', 'renamed'] as const;
const CONFIDENCES = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** A per-project rule of catch.rulesFile, as the file states it (validated by parseAssessRules). */
export interface AssessRule {
  id: string;
  kind: RuleKind;
  match: {
    /** A regular expression; a false-positive rule needs every failure message of the report to match it. */
    failure?: string;
    /** A glob of the project-relative test file: * within one folder, ** across folders, ? one character. */
    file?: string;
    requirementStatus?: CatchRequirementStatus[];
    intentClass?: IntentClass[];
  };
  reason: string;
}

/* Regular expressions: bounded, time-limited, and never run on more than the value it is given. */

const MATCH_SCRIPT = new vm.Script('new RegExp(pattern).test(value)');

/**
 * Whether a regular expression matches a value, evaluated as execution-check evaluates a matches check. Undefined when
 * the value cannot be evaluated: it is longer than the cap, the pattern is not valid, or the time limit stopped it.
 */
export function testPattern(pattern: string, value: string): boolean | undefined {
  if (value.length > MAX_MATCH_VALUE_LENGTH) {
    return undefined;
  }
  try {
    return MATCH_SCRIPT.runInNewContext({ pattern, value }, { timeout: MATCH_TIMEOUT_MS }) === true;
  } catch {
    return undefined;
  }
}

function isRegExpSource(pattern: string): boolean {
  try {
    return new RegExp(pattern) !== undefined;
  } catch {
    return false;
  }
}

/** The regular expression source a glob stands for: * within one folder, ** across folders, ? one character. */
function globSource(glob: string): string {
  let source = '';
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') {
      if (glob[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index += 1;
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
    }
  }
  return `^${source}$`;
}

/** Whether a project-relative path matches a glob; a path that cannot be evaluated does not match. */
export function globMatches(glob: string, value: string): boolean {
  return testPattern(globSource(glob), value) === true;
}

/* Generic rules: the false-positive failures every project shares (S7). Each one names its id and its reason. */

const ENVIRONMENT_PATTERN =
  'ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|socket hang up|[Ss]erver (is )?(down|not running|unavailable)|[Ss]ervice [Uu]navailable';
const MODULE_PATTERN = 'Cannot find module|Module not found|ERR_MODULE_NOT_FOUND|Failed to resolve import';
const MOCK_PATTERN = 'is not a spy|must be a mock or spy|not a mock function|Cannot spy the|reading .mock.';
const STUB_PATTERN = 'NotImplementedError|not (yet )?implemented';
const CALL_COUNT_PATTERN =
  'Expected number of calls|Received number of calls|toHaveBeenCalledTimes|Expected mock function to have been called';

/** A removed line and an added line of a diff, trimmed and without a trailing comma, so a moved item compares equal. */
const diffLine = (text: string): string => text.trim().replace(/,$/, '');

/**
 * Whether a failure is only an order difference between two collections: each removed line of the diff has one identical
 * added line, and nothing else differs. Jest's "- Expected" and "+ Received" headers are not differences.
 */
function isOrderOnlyDifference(message: string): boolean {
  const removed: string[] = [];
  const added: string[] = [];
  for (const line of message.split('\n')) {
    if (/^[-+] (Expected|Received)\b/.test(line)) {
      continue;
    }
    if (line.startsWith('-')) {
      removed.push(diffLine(line.slice(1)));
    } else if (line.startsWith('+')) {
      added.push(diffLine(line.slice(1)));
    }
  }
  if (removed.length === 0 || removed.length !== added.length) {
    return false;
  }
  return [...removed].sort().join('\n') === [...added].sort().join('\n');
}

/** A generic rule matches a report when every failure message of the report is that failure (and there is one). */
const allMessages =
  (pattern: string) =>
  (messages: readonly string[]): boolean =>
    messages.length > 0 && messages.every((message) => testPattern(pattern, message) === true);

interface GenericRule {
  id: string;
  reason: string;
  /** Whether the failure of a report, given its messages and its test file, is this generic failure. */
  matches: (messages: readonly string[], testPath: string) => boolean;
}

const GENERIC_RULES: readonly GenericRule[] = [
  {
    id: 'generic-environment',
    reason: 'The failure is an environment or runner problem (connection refused, server down), not the change.',
    matches: allMessages(ENVIRONMENT_PATTERN),
  },
  {
    id: 'generic-module',
    reason: 'The failure is a module or import error in the test itself.',
    // A missing module named by a source file can be the change itself (a deleted module), so the message must name the test.
    matches: (messages, testPath) => {
      const testFile = path.posix.basename(testPath);
      return (
        messages.length > 0 &&
        messages.every((message) => testPattern(MODULE_PATTERN, message) === true && message.includes(testFile))
      );
    },
  },
  {
    id: 'generic-mock',
    reason: 'The failure is a mock or spy the test uses wrongly.',
    matches: allMessages(MOCK_PATTERN),
  },
  {
    id: 'generic-stub',
    reason: 'The failure is a not-implemented stub, not behavior of the change.',
    matches: allMessages(STUB_PATTERN),
  },
  {
    id: 'generic-call-count',
    reason: 'The failure is a call-count expectation of the test, not an observable result.',
    matches: allMessages(CALL_COUNT_PATTERN),
  },
  {
    id: 'generic-order',
    reason: 'The failure is an order-only difference between two collections.',
    matches: (messages) => messages.length > 0 && messages.every(isOrderOnlyDifference),
  },
];

export const GENERIC_RULE_IDS: readonly string[] = GENERIC_RULES.map((rule) => rule.id);

/* Rules file: YAML, validated field by field with the path of each problem (S7). */

const RuleMatchSchema = z
  .strictObject({
    failure: z.string().min(1).optional(),
    file: z.string().min(1).optional(),
    requirementStatus: z.array(z.enum(REQUIREMENT_STATUSES)).min(1).optional(),
    intentClass: z.array(z.enum(INTENT_CLASSES)).min(1).optional(),
  })
  .refine((match) => Object.values(match).some((value) => value !== undefined), {
    error: 'at least one of failure, file, requirementStatus or intentClass is required: a rule with no condition would match every report',
  });

const RuleSchema = z.strictObject({
  id: z.string().regex(RULE_ID, {
    error: 'must be lowercase letters, digits and dashes, starting with a letter or a digit',
  }),
  kind: z.enum(RULE_KINDS),
  match: RuleMatchSchema,
  reason: z.string().trim().min(1, { error: 'must say why the rule applies' }),
});

const RulesFileSchema = z.strictObject({ rules: z.array(RuleSchema) });

/** One problem of a parsed value, named by its path: rules[0].match.failure, then the zod message. */
function describePath(issue: { path: PropertyKey[]; message: string }): string {
  const where = issue.path.reduce<string>((text, segment) => {
    if (typeof segment === 'number') {
      return `${text}[${segment}]`;
    }
    return text === '' ? String(segment) : `${text}.${String(segment)}`;
  }, '');
  return where === '' ? issue.message : `${where}: ${issue.message}`;
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Reads and validates the text of a rules file. Every problem is listed; a file with one problem has no rules. */
export function parseAssessRules(
  text: string
): { ok: true; rules: AssessRule[] } | { ok: false; issues: CatchRecordIssue[] } {
  let raw: unknown;
  try {
    raw = parseYaml(text) ?? {};
  } catch (error) {
    return { ok: false, issues: [{ code: 'rules-file-invalid', message: `The rules file is not valid YAML: ${errorText(error)}` }] };
  }
  const parsed = RulesFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({ code: 'rules-file-invalid', message: describePath(issue) })),
    };
  }

  const issues: CatchRecordIssue[] = [];
  const ids = new Set<string>();
  parsed.data.rules.forEach((rule, index) => {
    if (rule.id.startsWith(GENERIC_PREFIX)) {
      issues.push({
        code: 'rules-file-invalid',
        message: `rules[${index}].id: "${rule.id}" is reserved: the generic rules own the ${GENERIC_PREFIX}* ids`,
      });
    } else if (ids.has(rule.id)) {
      issues.push({ code: 'rules-file-invalid', message: `rules[${index}].id: duplicate rule id "${rule.id}"` });
    }
    ids.add(rule.id);
    if (rule.match.failure !== undefined && !isRegExpSource(rule.match.failure)) {
      issues.push({
        code: 'rules-file-invalid',
        message: `rules[${index}].match.failure is not a valid regular expression`,
      });
    }
  });
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, rules: parsed.data.rules as AssessRule[] };
}

/** The rules of catch.rulesFile, read from the project. A configured file that is missing or invalid refuses the step. */
function readRulesFile(
  projectRoot: string,
  rulesFile: string
): { ok: true; rules: AssessRule[]; sha256: string } | { ok: false; issues: CatchRecordIssue[] } {
  const file = path.join(projectRoot, rulesFile);
  if (!existsSync(file)) {
    return {
      ok: false,
      issues: [
        {
          code: 'rules-file-missing',
          message: `catch.rulesFile names ${rulesFile}, which does not exist: create the rules file or remove the setting from qaspec/config.yaml`,
        },
      ],
    };
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch (error) {
    return { ok: false, issues: [{ code: 'rules-file-unreadable', message: `${rulesFile} cannot be read: ${errorText(error)}` }] };
  }
  if (bytes.length > RULES_FILE_MAX_BYTES) {
    const limit = `${RULES_FILE_MAX_BYTES / 1024} KB`;
    return { ok: false, issues: [{ code: 'rules-file-invalid', message: `${rulesFile} is larger than ${limit}` }] };
  }
  const parsed = parseAssessRules(bytes.toString('utf-8'));
  if (!parsed.ok) {
    return parsed;
  }
  return { ok: true, rules: parsed.rules, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/* Deciding one report. */

/** What a report carries into its decision: the failure, where it is, and the intent it is judged against. */
export interface ReportFacts {
  /** The project-relative path of the test file that failed. */
  path: string;
  /** The failure messages of the child runs of the report, each one a bounded text. */
  messages: readonly string[];
  /** The status of the requirement the report names; undefined when it names none (degraded runs). */
  requirementStatus?: CatchRequirementStatus;
  /** The intent class of the run; null in a degraded run, which has no intent. */
  intentClass: IntentClass | null;
  /** True for a degraded run: its reports are low confidence and carry no intent signal. */
  lowConfidence: boolean;
  rules: readonly AssessRule[];
}

export interface ReportDecision {
  outcome: 'kept' | 'rule-filtered';
  /** The id of the rule that discarded the report (generic or per-project). */
  rule?: string;
  reason?: string;
  /** The signals of a kept report: intent signals, the low-confidence mark, and the true-positive rules that matched. */
  signals: string[];
  /** The rules whose regular expression or glob could not be evaluated (too long, invalid, or stopped by the time limit). */
  rulesNotEvaluated: string[];
}

/** Whether a per-project rule matches the report. A false-positive failure needs every message; a true-positive one, any. */
function ruleMatches(rule: AssessRule, facts: ReportFacts, notEvaluated: Set<string>): boolean {
  const { match } = rule;
  if (match.failure !== undefined) {
    const failure = match.failure;
    const results = facts.messages.map((message) => testPattern(failure, message));
    if (results.some((result) => result === undefined)) {
      notEvaluated.add(rule.id);
    }
    const matched =
      rule.kind === 'false-positive'
        ? results.length > 0 && results.every((result) => result === true)
        : results.some((result) => result === true);
    if (!matched) {
      return false;
    }
  }
  if (match.file !== undefined) {
    const result = testPattern(globSource(match.file), facts.path);
    if (result === undefined) {
      notEvaluated.add(rule.id);
    }
    if (result !== true) {
      return false;
    }
  }
  if (
    match.requirementStatus !== undefined &&
    (facts.requirementStatus === undefined || !match.requirementStatus.includes(facts.requirementStatus))
  ) {
    return false;
  }
  if (match.intentClass !== undefined && (facts.intentClass === null || !match.intentClass.includes(facts.intentClass))) {
    return false;
  }
  return true;
}

/** The intent signals of a kept report (S2). A degraded run has no intent, so its only signal is the low-confidence mark. */
function intentSignals(facts: ReportFacts): string[] {
  if (facts.lowConfidence) {
    return ['low-confidence'];
  }
  const signals: string[] = [];
  if (facts.requirementStatus === 'preserved' || facts.intentClass === 'refactor') {
    signals.push('unexpected-for-intent');
  }
  if (facts.requirementStatus === 'modified' || facts.requirementStatus === 'removed') {
    signals.push('possibly-intended');
  }
  return signals;
}

/**
 * Decides whether a report survives. Generic rules come first, in their fixed order; then the per-project false-positive
 * rules, in file order. Every rule is evaluated, so the rules that could not be evaluated are named whatever the outcome.
 */
export function decideReport(facts: ReportFacts): ReportDecision {
  const notEvaluated = new Set<string>();
  const matched = facts.rules.filter((rule) => ruleMatches(rule, facts, notEvaluated));
  const rulesNotEvaluated = [...notEvaluated];

  const generic = GENERIC_RULES.find((rule) => rule.matches(facts.messages, facts.path));
  if (generic !== undefined) {
    return { outcome: 'rule-filtered', rule: generic.id, reason: generic.reason, signals: [], rulesNotEvaluated };
  }
  const discarding = matched.find((rule) => rule.kind === 'false-positive');
  if (discarding !== undefined) {
    return { outcome: 'rule-filtered', rule: discarding.id, reason: discarding.reason, signals: [], rulesNotEvaluated };
  }
  const truePositives = matched
    .filter((rule) => rule.kind === 'true-positive')
    .map((rule) => `true-positive:${rule.id}`);
  return { outcome: 'kept', signals: [...intentSignals(facts), ...truePositives], rulesNotEvaluated };
}

/* Judges. */

export interface JudgeVerdict {
  judge: string;
  keep: boolean;
  confidence: Confidence;
  rationale: string;
}

/** The score of one verdict: keep +1; a discard scores +0.5 when its confidence is low, -0.5 medium and -1 high. */
export function scoreOf(verdict: { keep: boolean; confidence: Confidence }): number {
  if (verdict.keep) {
    return 1;
  }
  if (verdict.confidence === 'low') {
    return 0.5;
  }
  return verdict.confidence === 'medium' ? -0.5 : -1;
}

/** The median of the scores: the middle one of an odd number, the mean of the two middle ones of an even number. */
export function medianOf(scores: readonly number[]): number {
  if (scores.length === 0) {
    throw new Error('medianOf needs at least one score');
  }
  const sorted = [...scores].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The judgement of one report: the score of each verdict in judge order, their median, and whether it discards. */
export function decideJudgement(verdicts: readonly JudgeVerdict[]): {
  scores: number[];
  median: number;
  outcome: 'kept' | 'judge-filtered';
} {
  const scores = verdicts.map(scoreOf);
  const median = medianOf(scores);
  return { scores, median, outcome: median < 0 ? 'judge-filtered' : 'kept' };
}

/* The report of one test in a run: its requirement and scenario, as the intent states them. */

export interface ReportContext {
  requirement?: string;
  capability?: string;
  status?: CatchRequirementStatus;
  /** The scenario the risk or the test names, with its THEN lines, when the intent has it. */
  scenario?: { title: string; then: string[] };
}

function requirementContext(
  intent: CatchIntentArtifact,
  name: string,
  scenarioTitle: string | undefined,
  subject: 'risk' | 'test'
): ReportContext {
  const found = findIntentRequirement(intent, name, subject);
  if (!found.ok) {
    return { requirement: name };
  }
  const scenario =
    scenarioTitle === undefined
      ? undefined
      : found.requirement.scenarios.find((entry) => entry.title === scenarioTitle);
  return {
    requirement: name,
    capability: found.capability,
    status: found.requirement.status,
    ...(scenario === undefined ? {} : { scenario: { title: scenario.title, then: scenario.then } }),
  };
}

/** The requirement and scenario of a test: through its mutant's risk for a catching test, its own for a functionality one. */
export function reportContextOf(runDir: string, intent: CatchIntentArtifact, test: CatchTest): ReportContext {
  if (test.kind === 'catching' && test.mutant !== undefined) {
    const mutant = readRecord<CatchMutant>(path.join(runDir, MUTANTS_DIRNAME), test.mutant);
    const risk = mutant === undefined ? undefined : readRecord<CatchRisk>(path.join(runDir, RISKS_DIRNAME), mutant.risk);
    return risk?.requirement === undefined ? {} : requirementContext(intent, risk.requirement, risk.scenario, 'risk');
  }
  if (test.kind === 'functionality' && test.requirement !== undefined) {
    return requirementContext(intent, test.requirement, test.scenario, 'test');
  }
  return {};
}

/* The records of a run: assessment, judgements, and the reports of the child phase. */

export interface AssessedReport {
  test: string;
  outcome: 'kept' | 'rule-filtered';
  rule?: string;
  reason?: string;
  signals: string[];
  lowConfidence: boolean;
  rulesNotEvaluated?: string[];
}

export interface CatchAssessment {
  schema: typeof CATCH_ASSESSMENT_SCHEMA;
  run: string;
  assessedAt: string;
  intentClass: IntentClass | null;
  lowConfidence: boolean;
  /** The configured rules file, its hash and its rule count; null when the project has none. */
  rulesFile: { path: string; sha256: string; rules: number } | null;
  reports: AssessedReport[];
}

export interface CatchJudgement {
  schema: typeof CATCH_JUDGEMENT_SCHEMA;
  test: string;
  verdicts: JudgeVerdict[];
  scores: number[];
  median: number;
  outcome: 'kept' | 'judge-filtered';
  judgedAt: string;
}

/** The assessment of a run, or undefined before catch assess. */
export function readAssessment(runDir: string): CatchAssessment | undefined {
  return existsSync(path.join(runDir, ASSESSMENT_FILE)) ? readRunJson<CatchAssessment>(runDir, ASSESSMENT_FILE) : undefined;
}

/** The judgement of one report, or undefined before catch judge. */
export function readJudgement(runDir: string, test: string): CatchJudgement | undefined {
  return readRecord<CatchJudgement>(path.join(runDir, JUDGES_DIRNAME), test);
}

/** The child results of a run, in test order. */
export function readResults(runDir: string): CatchResult[] {
  const resultsDir = path.join(runDir, RESULTS_DIRNAME);
  return listRecordIds(resultsDir, 'T').flatMap((id) => {
    const result = readRecord<CatchResult>(resultsDir, id);
    return result === undefined ? [] : [result];
  });
}

/** The distinct failure messages of a report: every child run's messages, in order. */
export function failureMessages(result: CatchResult): string[] {
  return [...new Set(result.childRuns.flatMap((run) => run.files.flatMap((file) => file.messages)))];
}

/** The refusal of a step that needs another state of the run: it names the state the run is in, and the one it needs. */
export function runStateIssue(run: CatchRunRecord, action: string, expected: CatchRunState): CatchRecordIssue {
  const article = /^[aeiou]/.test(expected) ? 'an' : 'a';
  return { code: 'run-state', message: `Catch run ${run.runId} is ${run.state}: ${action} needs ${article} ${expected} run.` };
}

/**
 * The report of a test that the assessment kept: a test id of a report that catch assess classified, which no rule
 * discarded. Judge, report and answer read the same checks; a refusal names its one blocker.
 */
export function assessedReportOf(
  runDir: string,
  runId: string,
  test: string
): { ok: true; result: CatchResult; entry: AssessedReport } | { ok: false; issues: CatchRecordIssue[] } {
  if (!TEST_ID.test(test)) {
    return { ok: false, issues: [{ code: 'test-invalid', message: `${test} is not a test id such as T1` }] };
  }
  const result = readRecord<CatchResult>(path.join(runDir, RESULTS_DIRNAME), test);
  if (result === undefined) {
    return { ok: false, issues: [{ code: 'test-unknown', message: `${test} is not a test of run ${runId}` }] };
  }
  if (result.action !== 'report') {
    return {
      ok: false,
      issues: [{ code: 'not-a-report', message: `${test} is ${result.action}: only a report is judged or reported` }],
    };
  }
  const entry = readAssessment(runDir)?.reports.find((report) => report.test === test);
  if (entry === undefined) {
    return { ok: false, issues: [{ code: 'not-assessed', message: `${test} has no assessment in run ${runId}` }] };
  }
  if (entry.outcome === 'rule-filtered') {
    return {
      ok: false,
      issues: [
        {
          code: 'rule-filtered',
          message: `${test} was discarded by rule ${entry.rule}: only the reports that survive the rules are judged or reported`,
        },
      ],
    };
  }
  return { ok: true, result, entry };
}

/* Assess: once per classified run. */

export interface AssessCatchRunInput {
  projectRoot: string;
  changesDir: string;
  runId: string;
  lockTimeoutMs?: number;
}

export type AssessCatchRunOutcome =
  | { ok: true; run: string; assessment: CatchAssessment }
  | { ok: false; issues: CatchRecordIssue[] };

/**
 * Assesses the reports of a classified run, once. Refused, with nothing written, when the run is not classified or when
 * catch.rulesFile names a file that is missing or invalid. On success the run moves to assessed.
 */
export function assessCatchRun(input: AssessCatchRunInput): AssessCatchRunOutcome {
  const location = findCatchRun(input.changesDir, input.runId);
  return withCatchRunLock(location.runDir, input.lockTimeoutMs ?? RUN_LOCK_TIMEOUT_MS, (): AssessCatchRunOutcome => {
    const run = readCatchRun(location.runDir);
    if (run.state !== 'classified') {
      return { ok: false, issues: [runStateIssue(run, 'qaspec catch assess', 'classified')] };
    }

    const rulesPath = readProjectConfig(input.projectRoot)?.catch?.rulesFile;
    let rules: AssessRule[] = [];
    let rulesFile: CatchAssessment['rulesFile'] = null;
    if (rulesPath !== undefined) {
      const read = readRulesFile(input.projectRoot, rulesPath);
      if (!read.ok) {
        return { ok: false, issues: read.issues };
      }
      rules = read.rules;
      rulesFile = { path: rulesPath, sha256: read.sha256, rules: rules.length };
    }

    const intent = readRunJson<CatchIntentArtifact>(location.runDir, INTENT_FILE);
    const reports: AssessedReport[] = readResults(location.runDir)
      .filter((result) => result.action === 'report')
      .map((result) => {
        const test = readRecord<CatchTest>(path.join(location.runDir, TESTS_DIRNAME), result.test);
        if (test === undefined) {
          throw new Error(`Report ${result.test} of run ${run.runId} has no test record; the run cannot be trusted`);
        }
        const context = reportContextOf(location.runDir, intent, test);
        const decision = decideReport({
          path: test.path,
          messages: failureMessages(result),
          requirementStatus: context.status,
          intentClass: intent.intentClass,
          lowConfidence: run.lowConfidence,
          rules,
        });
        return {
          test: result.test,
          outcome: decision.outcome,
          ...(decision.rule === undefined ? {} : { rule: decision.rule }),
          ...(decision.reason === undefined ? {} : { reason: decision.reason }),
          signals: decision.signals,
          lowConfidence: run.lowConfidence,
          ...(decision.rulesNotEvaluated.length === 0 ? {} : { rulesNotEvaluated: decision.rulesNotEvaluated }),
        };
      });

    const at = nowIso();
    const kept = reports.filter((report) => report.outcome === 'kept').length;
    const assessment: CatchAssessment = {
      schema: CATCH_ASSESSMENT_SCHEMA,
      run: run.runId,
      assessedAt: at,
      intentClass: intent.intentClass,
      lowConfidence: run.lowConfidence,
      rulesFile,
      reports,
    };
    writeRunJson(location.runDir, ASSESSMENT_FILE, assessment);
    for (const report of reports) {
      if (report.outcome === 'rule-filtered') {
        appendLedgerEntry(location.runDir, { stage: 'rule-filtered', at, test: report.test, rule: report.rule ?? null });
      }
    }
    appendLedgerEntry(location.runDir, { stage: 'assessed', at, reports: reports.length, kept, filtered: reports.length - kept });
    writeRunRecord(location.runDir, { ...run, state: 'assessed', updatedAt: at });
    return { ok: true, run: run.runId, assessment };
  });
}

/* Judge: once per report that the rules kept. */

const VerdictSchema = z.strictObject({
  judge: z
    .string({ error: 'judge must be the name of the judge' })
    .trim()
    .min(1, { error: 'judge must not be empty' })
    .max(MAX_JUDGE_NAME_CHARS, { error: `judge must be at most ${MAX_JUDGE_NAME_CHARS} characters` }),
  keep: z.boolean({ error: 'keep must be true or false' }),
  confidence: z.enum(CONFIDENCES, { error: 'confidence must be high, medium or low' }),
  rationale: z
    .string({ error: 'rationale must be text' })
    .trim()
    .min(1, { error: 'rationale must not be empty' })
    .max(MAX_RATIONALE_CHARS, { error: `rationale must be at most ${MAX_RATIONALE_CHARS} characters` }),
});

const JudgementInputSchema = z.strictObject({ verdicts: z.array(VerdictSchema, { error: 'verdicts must be a list' }) });

export interface JudgeCatchReportInput {
  projectRoot: string;
  changesDir: string;
  runId: string;
  /** The report to judge, such as T1. */
  test: string;
  /** The parsed verdict file: { verdicts: [...] } with one verdict per judge of catch.judges. */
  value: unknown;
  lockTimeoutMs?: number;
}

export type JudgeCatchReportOutcome =
  | { ok: true; run: string; test: string; outcome: 'kept' | 'judge-filtered'; median: number; scores: number[] }
  | { ok: false; issues: CatchRecordIssue[] };

/**
 * Records the verdicts of the judges on one report that the rules kept. The judges list exactly catch.judges verdicts,
 * with distinct names. Judges can only discard: a median below 0 discards the report, and nothing else changes.
 */
export function judgeCatchReport(input: JudgeCatchReportInput): JudgeCatchReportOutcome {
  const location = findCatchRun(input.changesDir, input.runId);
  return withCatchRunLock(location.runDir, input.lockTimeoutMs ?? RUN_LOCK_TIMEOUT_MS, (): JudgeCatchReportOutcome => {
    const run = readCatchRun(location.runDir);
    if (run.state !== 'assessed') {
      return { ok: false, issues: [runStateIssue(run, 'qaspec catch judge', 'assessed')] };
    }
    const report = assessedReportOf(location.runDir, run.runId, input.test);
    if (!report.ok) {
      return report;
    }
    if (readJudgement(location.runDir, input.test) !== undefined) {
      return {
        ok: false,
        issues: [{ code: 'already-judged', message: `${input.test} was already judged in run ${run.runId}: a report is judged once` }],
      };
    }
    const judges = readProjectConfig(input.projectRoot)?.catch?.judges;
    if (judges === undefined) {
      return {
        ok: false,
        issues: [{ code: 'config-missing', message: 'qaspec/config.yaml has no catch block: catch judge needs catch.judges' }],
      };
    }

    const parsed = JudgementInputSchema.safeParse(input.value);
    if (!parsed.success) {
      return { ok: false, issues: parsed.error.issues.map((issue) => ({ code: 'verdict-invalid', message: describePath(issue) })) };
    }
    const { verdicts } = parsed.data;
    const issues: CatchRecordIssue[] = [];
    if (verdicts.length !== judges) {
      issues.push({
        code: 'verdicts-count',
        message: `verdicts must list ${judges} verdicts, one per judge of catch.judges; got ${verdicts.length}`,
      });
    }
    const names = new Set<string>();
    for (const verdict of verdicts) {
      if (names.has(verdict.judge)) {
        issues.push({ code: 'judge-duplicate', message: `judge "${verdict.judge}" is listed twice: each judge gives one verdict` });
      }
      names.add(verdict.judge);
    }
    if (issues.length > 0) {
      return { ok: false, issues };
    }

    const decision = decideJudgement(verdicts);
    const at = nowIso();
    const judgement: CatchJudgement = {
      schema: CATCH_JUDGEMENT_SCHEMA,
      test: input.test,
      verdicts,
      scores: decision.scores,
      median: decision.median,
      outcome: decision.outcome,
      judgedAt: at,
    };
    writeRecord(path.join(location.runDir, JUDGES_DIRNAME), input.test, judgement);
    appendLedgerEntry(location.runDir, {
      stage: decision.outcome === 'kept' ? 'judged' : 'judge-filtered',
      at,
      test: input.test,
      median: decision.median,
    });
    return {
      ok: true,
      run: run.runId,
      test: input.test,
      outcome: decision.outcome,
      median: decision.median,
      scores: decision.scores,
    };
  });
}
