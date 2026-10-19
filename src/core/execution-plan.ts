/**
 * Execution plan format and validation for /qsx:execute (S7, D2).
 *
 * The agent writes a plan before it acts on a case, and the plan does not change during the run.
 * This module checks the plan's shape and, given the change's testcases.md, its link to the case's
 * Steps table. A plan is data: nothing in it is executed. Regex patterns are only compiled here and
 * matched later by the evaluator in execution-check.ts.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { TestcaseDetail } from './cases-validation.js';

export const EXECUTION_PLAN_SCHEMA = 'qaspec.execution-plan/v1';

/** Longest regex pattern a `matches` check may carry. Longer patterns are rejected, never truncated. */
export const MAX_PATTERN_LENGTH = 500;

export const CHECK_OPERATORS = ['equals', 'contains', 'matches', 'compare', 'delta'] as const;
export const SOURCE_KINDS = ['dom', 'network', 'console', 'url'] as const;
export const COMPARATORS = ['gt', 'gte', 'lt', 'lte'] as const;

/** A value the agent observed or a plan expects. Other JSON types are rejected. */
export type ScalarValue = string | number | boolean;

/** A readable problem with a plan or an observations file. The fields name where it occurs. */
export interface ExecutionIssue {
  message: string;
  case?: string;
  step?: number;
  check?: string;
}

function isScalar(value: unknown): value is ScalarValue {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

/** A text, finite-number or boolean value, named by the field it belongs to. */
export const scalarSchema = (field: string) =>
  z.custom<ScalarValue>(isScalar, { error: `${field} must be text, a finite number or a boolean` });

const finiteNumberSchema = (field: string) => z.number({ error: `${field} must be a finite number` });

const textSchema = (field: string) =>
  z.string({ error: `${field} must be text` }).min(1, { error: `${field} must not be empty` });

const SourceSchema = z.strictObject(
  {
    kind: z.enum(SOURCE_KINDS, { error: `source.kind must be one of ${SOURCE_KINDS.join(', ')}` }),
    target: textSchema('source.target'),
  },
  { error: 'source must be an object with kind and target' }
);

/**
 * Regex patterns are compiled without flags and must stay within MAX_PATTERN_LENGTH. Compiling
 * here means a pattern that cannot be used is reported when the plan is validated.
 */
const PatternSchema = textSchema('pattern').superRefine((pattern, ctx) => {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    ctx.addIssue({
      code: 'custom',
      message: `pattern is ${pattern.length} characters; the limit is ${MAX_PATTERN_LENGTH}`,
    });
    return;
  }
  try {
    new RegExp(pattern);
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: `pattern does not compile: ${(error as Error).message}` });
  }
});

const checkBase = {
  id: textSchema('id'),
  source: SourceSchema,
  negate: z.boolean({ error: 'negate must be true or false' }).optional(),
};

const CheckSchema = z.discriminatedUnion(
  'op',
  [
    z.strictObject({ ...checkBase, op: z.literal('equals'), value: scalarSchema('value') }),
    z.strictObject({ ...checkBase, op: z.literal('contains'), value: textSchema('value') }),
    z.strictObject({ ...checkBase, op: z.literal('matches'), pattern: PatternSchema }),
    z.strictObject({
      ...checkBase,
      op: z.literal('compare'),
      comparator: z.enum(COMPARATORS, { error: `comparator must be one of ${COMPARATORS.join(', ')}` }),
      value: finiteNumberSchema('value'),
    }),
    z.strictObject({ ...checkBase, op: z.literal('delta'), by: finiteNumberSchema('by') }),
  ],
  { error: 'check must be an object with id, source and op' }
);

const StepSchema = z.strictObject(
  {
    n: z
      .number({ error: 'n must be a whole number from 1' })
      .int({ error: 'n must be a whole number from 1' })
      .min(1, { error: 'n must be a whole number from 1' }),
    checks: z.array(CheckSchema, { error: 'checks must be an array' }),
    needsHuman: textSchema('needsHuman').optional(),
  },
  { error: 'step must be an object with n and checks' }
);

export const ExecutionPlanSchema = z.strictObject(
  {
    schema: z.literal(EXECUTION_PLAN_SCHEMA, { error: `schema must be "${EXECUTION_PLAN_SCHEMA}"` }),
    change: textSchema('change'),
    case: z.strictObject(
      { id: textSchema('case.id'), title: textSchema('case.title') },
      { error: 'case must be an object with id and title' }
    ),
    steps: z.array(StepSchema, { error: 'steps must be an array' }),
  },
  { error: 'plan must be a JSON object with schema, change, case and steps' }
);

export type ExecutionPlanCheck = z.infer<typeof CheckSchema>;
export type ExecutionStep = z.infer<typeof StepSchema>;
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

/** SHA-256 of the exact file bytes, so a run can prove which plan it executed. */
export function hashPlanBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Parses JSON text, dropping a leading byte order mark; returns the parser message instead of throwing. */
export function parseJsonText(text: string): { ok: true; value: unknown } | { ok: false; message: string } {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    return { ok: true, value: JSON.parse(withoutBom) };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export type SchemaIssue = z.ZodError['issues'][number];

function readKey(value: unknown, key: PropertyKey): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<PropertyKey, unknown>)[key] : undefined;
}

function readPath(value: unknown, path: PropertyKey[]): unknown {
  return path.reduce<unknown>((node, key) => readKey(node, key), value);
}

/**
 * Wording for one schema issue. Unknown keys come from issue.keys because an object-level message
 * replaces the issue text for every issue of that object.
 */
export function describeIssue(raw: unknown, issue: SchemaIssue): string {
  if (issue.code === 'unrecognized_keys') {
    return `unrecognized key ${issue.keys.map((key) => JSON.stringify(key)).join(', ')}`;
  }
  if (issue.code === 'invalid_union' && issue.path[issue.path.length - 1] === 'op') {
    const op = readPath(raw, issue.path);
    const allowed = `use one of ${CHECK_OPERATORS.join(', ')}`;
    return op === undefined ? `op is required; ${allowed}` : `unsupported op ${JSON.stringify(op)}; ${allowed}`;
  }
  return issue.message;
}

/** Turns one zod issue into a message that names the case, step and check it belongs to. */
function toExecutionIssue(raw: unknown, issue: SchemaIssue): ExecutionIssue {
  const result: ExecutionIssue = { message: '' };
  const labels: string[] = [];
  const caseId = readKey(readKey(raw, 'case'), 'id');
  if (typeof caseId === 'string') {
    result.case = caseId;
    labels.push(`Case ${caseId}`);
  }

  const { path } = issue;
  if (path[0] === 'steps' && typeof path[1] === 'number') {
    const rawStep = readKey(readKey(raw, 'steps'), path[1]);
    const n = readKey(rawStep, 'n');
    if (typeof n === 'number' && Number.isInteger(n) && n >= 1) {
      result.step = n;
      labels.push(`step ${n}`);
    } else {
      labels.push(`step at position ${path[1] + 1}`);
    }

    if (path[2] === 'checks' && typeof path[3] === 'number') {
      const id = readKey(readKey(rawStep, 'checks'), path[3]);
      const checkId = readKey(id, 'id');
      if (typeof checkId === 'string') {
        result.check = checkId;
        labels.push(`check "${checkId}"`);
      } else {
        labels.push(`check at position ${path[3] + 1}`);
      }
    }
  }

  const detail = describeIssue(raw, issue);
  result.message = labels.length > 0 ? `${labels.join(', ')}: ${detail}` : detail;
  return result;
}

/** A plan with no check and no needsHuman reason would pass without verifying anything. */
function findEmptyPlan(plan: ExecutionPlan): ExecutionIssue[] {
  const declaresSomething = plan.steps.some(
    (step) => step.checks.length > 0 || step.needsHuman !== undefined
  );
  return declaresSomething
    ? []
    : [{ message: `Case ${plan.case.id}: the plan declares no check and no needsHuman reason`, case: plan.case.id }];
}

/** Finds step numbers and check ids that repeat within the plan; each repeat names where it occurs. */
function findRepeatedIds(plan: ExecutionPlan): ExecutionIssue[] {
  const issues: ExecutionIssue[] = [];
  const caseLabel = `Case ${plan.case.id}`;
  const seenSteps = new Set<number>();
  const checkStep = new Map<string, number>();

  for (const step of plan.steps) {
    if (seenSteps.has(step.n)) {
      issues.push({
        message: `${caseLabel}, step ${step.n}: step appears more than once in the plan`,
        case: plan.case.id,
        step: step.n,
      });
    }
    seenSteps.add(step.n);

    for (const check of step.checks) {
      const firstStep = checkStep.get(check.id);
      if (firstStep === undefined) {
        checkStep.set(check.id, step.n);
        continue;
      }
      issues.push({
        message: `${caseLabel}, step ${step.n}, check "${check.id}": check id is already used in step ${firstStep}`,
        case: plan.case.id,
        step: step.n,
        check: check.id,
      });
    }
  }
  return issues;
}

/**
 * Validates the plan's shape. Returns the typed plan when the shape is valid; otherwise no plan and
 * readable issues. Duplicate step numbers and check ids are reported as well.
 */
export function validatePlanShape(raw: unknown): { plan?: ExecutionPlan; issues: ExecutionIssue[] } {
  const parsed = ExecutionPlanSchema.safeParse(raw);
  if (!parsed.success) {
    return { issues: parsed.error.issues.map((issue) => toExecutionIssue(raw, issue)) };
  }
  return { plan: parsed.data, issues: [...findRepeatedIds(parsed.data), ...findEmptyPlan(parsed.data)] };
}

/**
 * Links a valid plan to the change's testcases.md: the change matches, the case id exists exactly
 * once, every plan step has a row, and every row with an Expected cell has a check or a needsHuman reason.
 */
export function validatePlanAgainstTestcases(input: {
  plan: ExecutionPlan;
  changeName: string;
  cases: TestcaseDetail[];
}): ExecutionIssue[] {
  const { plan, changeName, cases } = input;
  const caseId = plan.case.id;
  const issues: ExecutionIssue[] = [];

  if (plan.change !== changeName) {
    issues.push({ message: `Plan change "${plan.change}" does not match --change "${changeName}"` });
  }

  const matches = cases.filter((candidate) => candidate.id === caseId);
  if (matches.length === 0) {
    return [...issues, { message: `Case "${caseId}" is not in testcases.md`, case: caseId }];
  }
  if (matches.length > 1) {
    return [...issues, { message: `Case "${caseId}" appears more than once in testcases.md`, case: caseId }];
  }

  const [testcase] = matches;
  for (const problem of testcase.stepIssues) {
    issues.push({ message: `Case ${caseId}: ${problem}`, case: caseId });
  }

  const rowNumbers = new Set(testcase.steps.map((row) => row.n));
  for (const step of plan.steps) {
    if (!rowNumbers.has(step.n)) {
      issues.push({
        message: `Case ${caseId}, step ${step.n}: the Steps table has no row ${step.n}`,
        case: caseId,
        step: step.n,
      });
    }
  }

  for (const row of testcase.steps) {
    if (row.expected === '') {
      continue;
    }
    const step = plan.steps.find((candidate) => candidate.n === row.n);
    const declared = step !== undefined && (step.checks.length > 0 || step.needsHuman !== undefined);
    if (!declared) {
      issues.push({
        message: `Case ${caseId}, step ${row.n}: the Expected result needs at least one check or a needsHuman reason`,
        case: caseId,
        step: row.n,
      });
    }
  }

  return issues;
}
