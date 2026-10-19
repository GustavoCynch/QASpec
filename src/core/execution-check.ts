/**
 * Deterministic check evaluator for /qsx:execute (S7, D2).
 *
 * The CLI decides each check, not the agent. The operators are a fixed set; nothing from a plan or
 * an observation is executed, and regex patterns only run on values capped in length, with a time
 * limit.
 */

import vm from 'node:vm';
import { z } from 'zod';
import {
  describeIssue,
  scalarSchema,
  type ExecutionIssue,
  type ExecutionPlan,
  type ExecutionPlanCheck,
  type ScalarValue,
  type SchemaIssue,
} from './execution-plan.js';

export const EXECUTION_OBSERVATIONS_SCHEMA = 'qaspec.execution-observations/v1';

/** Longest observed value a `matches` check evaluates. Longer values are invalid, never truncated. */
export const MAX_MATCH_VALUE_LENGTH = 10_000;

/** Time a `matches` check may take; catastrophic backtracking is stopped and reported as invalid. */
export const MATCH_TIMEOUT_MS = 1_000;

/**
 * Fixed QASpec script run in an isolated context so the time limit can interrupt the regex engine.
 * The pattern and the value are passed as data; nothing from a plan or observation becomes code.
 */
const MATCH_SCRIPT = new vm.Script('new RegExp(pattern).test(value)');

/** Relative tolerance for `delta`, so that 10.3 - 10.1 equals 0.2 despite binary rounding. */
const DELTA_TOLERANCE = 1e-9;

/** passed and failed are decided; missing has no observation; invalid has one the operator cannot read. */
export type CheckStatus = 'passed' | 'failed' | 'missing' | 'invalid';
export type CaseVerdict = 'passed' | 'failed' | 'needs-human' | 'incomplete';

export interface Observation {
  check: string;
  after: ScalarValue;
  before?: ScalarValue;
}

export interface CheckOutcome {
  status: CheckStatus;
  reason?: string;
}

export interface CheckResult {
  id: string;
  step: number;
  op: string;
  status: CheckStatus;
  reason?: string;
}

export interface CaseEvaluation {
  verdict: CaseVerdict;
  checks: CheckResult[];
  needsHuman: Array<{ step: number; reason: string }>;
}

const ObservationSchema = z.strictObject(
  {
    check: z.string({ error: 'check must be text' }).min(1, { error: 'check must not be empty' }),
    after: scalarSchema('after'),
    before: scalarSchema('before').optional(),
  },
  { error: 'observation must be an object with check and after' }
);

const ObservationsFileSchema = z.strictObject(
  {
    schema: z.literal(EXECUTION_OBSERVATIONS_SCHEMA, {
      error: `schema must be "${EXECUTION_OBSERVATIONS_SCHEMA}"`,
    }),
    observations: z.array(ObservationSchema, { error: 'observations must be an array' }),
  },
  { error: 'observations file must be a JSON object with schema and observations' }
);

function readObservationField(raw: unknown, index: number, field: string): unknown {
  const observations = (raw as { observations?: unknown } | null)?.observations;
  const entry = Array.isArray(observations) ? observations[index] : undefined;
  return (entry as Record<string, unknown> | null | undefined)?.[field];
}

/** Names the observation (and its check, when readable) in each schema message. */
function toObservationIssue(raw: unknown, issue: SchemaIssue): ExecutionIssue {
  const [head, index] = issue.path;
  if (head !== 'observations' || typeof index !== 'number') {
    return { message: describeIssue(raw, issue) };
  }
  const check = readObservationField(raw, index, 'check');
  if (typeof check === 'string' && check !== '') {
    return { message: `Observation ${index + 1} (check "${check}"): ${describeIssue(raw, issue)}`, check };
  }
  return { message: `Observation ${index + 1}: ${describeIssue(raw, issue)}` };
}

function declaredCheckIds(plan: ExecutionPlan): Set<string> {
  return new Set(plan.steps.flatMap((step) => step.checks.map((check) => check.id)));
}

/**
 * Validates the observations file against the plan. A check may have at most one observation, and
 * an observation for a check the plan does not declare is an error: the plan is fixed before the run.
 */
export function parseObservations(
  raw: unknown,
  plan: ExecutionPlan
): { observations: Map<string, Observation>; issues: ExecutionIssue[] } {
  const parsed = ObservationsFileSchema.safeParse(raw);
  if (!parsed.success) {
    return { observations: new Map(), issues: parsed.error.issues.map((issue) => toObservationIssue(raw, issue)) };
  }

  const declared = declaredCheckIds(plan);
  const observations = new Map<string, Observation>();
  const issues: ExecutionIssue[] = [];

  parsed.data.observations.forEach((observation, index) => {
    const label = `Observation ${index + 1} (check "${observation.check}")`;
    if (!declared.has(observation.check)) {
      issues.push({ message: `${label}: the plan does not declare this check`, check: observation.check });
    } else if (observations.has(observation.check)) {
      issues.push({ message: `${label}: this check already has an observation`, check: observation.check });
    } else {
      observations.set(observation.check, observation);
    }
  });

  return { observations, issues };
}

/** Text form used by equals, contains and matches: numbers and booleans become their String() form. */
function asText(value: ScalarValue): string {
  return typeof value === 'string' ? value : String(value);
}

/** Numeric value of a number or of text that is exactly a decimal number, ignoring surrounding spaces. */
const NUMERIC_TEXT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function asNumber(value: ScalarValue): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!NUMERIC_TEXT.test(trimmed)) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function verdict(passed: boolean, failure: string): CheckOutcome {
  return passed ? { status: 'passed' } : { status: 'failed', reason: failure };
}

const COMPARE_PHRASES = {
  gt: { holds: (actual: number, expected: number) => actual > expected, phrase: 'greater than' },
  gte: { holds: (actual: number, expected: number) => actual >= expected, phrase: 'greater than or equal to' },
  lt: { holds: (actual: number, expected: number) => actual < expected, phrase: 'less than' },
  lte: { holds: (actual: number, expected: number) => actual <= expected, phrase: 'less than or equal to' },
} as const;

function evaluateMatches(pattern: string, value: string): CheckOutcome {
  if (value.length > MAX_MATCH_VALUE_LENGTH) {
    return {
      status: 'invalid',
      reason: `observed value is ${value.length} characters; matches evaluates at most ${MAX_MATCH_VALUE_LENGTH}`,
    };
  }
  try {
    const matched = MATCH_SCRIPT.runInNewContext({ pattern, value }, { timeout: MATCH_TIMEOUT_MS });
    return verdict(matched === true, 'value does not match the pattern');
  } catch (error) {
    const timedOut = (error as NodeJS.ErrnoException).code === 'ERR_SCRIPT_EXECUTION_TIMEOUT';
    return {
      status: 'invalid',
      reason: timedOut
        ? `regex evaluation exceeded ${MATCH_TIMEOUT_MS} ms`
        : `regex evaluation failed: ${(error as Error).message}`,
    };
  }
}

function evaluateCompare(comparator: keyof typeof COMPARE_PHRASES, expected: number, after: ScalarValue): CheckOutcome {
  const actual = asNumber(after);
  if (actual === undefined) {
    return { status: 'invalid', reason: 'observed value is not numeric' };
  }
  const { holds, phrase } = COMPARE_PHRASES[comparator];
  return verdict(holds(actual, expected), `value is not ${phrase} ${expected}`);
}

function evaluateDelta(by: number, observation: Observation): CheckOutcome {
  if (observation.before === undefined) {
    return { status: 'invalid', reason: 'delta needs a before value' };
  }
  const before = asNumber(observation.before);
  const after = asNumber(observation.after);
  if (before === undefined || after === undefined) {
    return { status: 'invalid', reason: 'delta needs numeric before and after values' };
  }
  const difference = after - before;
  if (!Number.isFinite(difference)) {
    return { status: 'invalid', reason: 'the difference is not a finite number' };
  }
  const scale = Math.max(1, Math.abs(before), Math.abs(after), Math.abs(by));
  return verdict(Math.abs(difference - by) <= DELTA_TOLERANCE * scale, `after minus before is not ${by}`);
}

function applyOperator(check: ExecutionPlanCheck, observation: Observation): CheckOutcome {
  switch (check.op) {
    case 'equals':
      return verdict(asText(observation.after) === asText(check.value), 'value does not equal the expected value');
    case 'contains':
      return verdict(asText(observation.after).includes(check.value), 'value does not contain the expected text');
    case 'matches':
      return evaluateMatches(check.pattern, asText(observation.after));
    case 'compare':
      return evaluateCompare(check.comparator, check.value, observation.after);
    case 'delta':
      return evaluateDelta(check.by, observation);
  }
}

/**
 * Evaluates one check. A missing observation is `missing`; a value the operator cannot read is
 * `invalid`. `negate` inverts only a decided result, so missing and invalid stay as they are.
 */
export function evaluateCheck(check: ExecutionPlanCheck, observation: Observation | undefined): CheckOutcome {
  if (observation === undefined) {
    return { status: 'missing', reason: 'no observation was recorded for this check' };
  }
  const outcome = applyOperator(check, observation);
  if (check.negate !== true || (outcome.status !== 'passed' && outcome.status !== 'failed')) {
    return outcome;
  }
  return outcome.status === 'passed'
    ? { status: 'failed', reason: 'negate is set and the condition holds' }
    : { status: 'passed' };
}

/**
 * Case verdict, by precedence: any failed check fails the case; then a step that needs a human;
 * then any missing or invalid check; otherwise the case passed.
 */
function caseVerdict(checks: CheckResult[], needsHuman: unknown[]): CaseVerdict {
  if (checks.some((check) => check.status === 'failed')) {
    return 'failed';
  }
  if (needsHuman.length > 0) {
    return 'needs-human';
  }
  if (checks.some((check) => check.status === 'missing' || check.status === 'invalid')) {
    return 'incomplete';
  }
  return 'passed';
}

/** Evaluates every check of a validated plan against the observations, in plan order. */
export function evaluatePlan(plan: ExecutionPlan, observations: Map<string, Observation>): CaseEvaluation {
  const checks: CheckResult[] = [];
  const needsHuman: Array<{ step: number; reason: string }> = [];

  for (const step of plan.steps) {
    if (step.needsHuman !== undefined) {
      needsHuman.push({ step: step.n, reason: step.needsHuman });
    }
    for (const check of step.checks) {
      const outcome = evaluateCheck(check, observations.get(check.id));
      checks.push({
        id: check.id,
        step: step.n,
        op: check.op,
        status: outcome.status,
        ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
      });
    }
  }

  return { verdict: caseVerdict(checks, needsHuman), checks, needsHuman };
}
