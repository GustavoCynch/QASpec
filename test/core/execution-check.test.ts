import { describe, it, expect, beforeEach } from 'vitest';
import {
  EXECUTION_OBSERVATIONS_SCHEMA,
  MAX_MATCH_VALUE_LENGTH,
  evaluateCheck,
  evaluatePlan,
  parseObservations,
  type Observation,
} from '../../src/core/execution-check.js';
import {
  EXECUTION_PLAN_SCHEMA,
  validatePlanShape,
  type ExecutionPlan,
  type ExecutionPlanCheck,
} from '../../src/core/execution-plan.js';

const SOURCE = { kind: 'dom', target: 'status text' };

function planOf(steps: unknown[]): ExecutionPlan {
  const shape = validatePlanShape({
    schema: EXECUTION_PLAN_SCHEMA,
    change: 'pr-1',
    case: { id: '1.1', title: 'Export totals' },
    steps,
  });
  if (!shape.plan) {
    throw new Error(`fixture is invalid: ${shape.issues.map((issue) => issue.message).join('; ')}`);
  }
  return shape.plan;
}

/** Parses one check through the plan validator, so tests use the shape the CLI evaluates. */
function checkOf(fields: Record<string, unknown>): ExecutionPlanCheck {
  return planOf([{ n: 1, checks: [{ id: 'c1', source: SOURCE, ...fields }] }]).steps[0].checks[0];
}

function observed(after: unknown, before?: unknown): Observation {
  return before === undefined ? { check: 'c1', after } as Observation : { check: 'c1', after, before } as Observation;
}

function evaluate(steps: unknown[], observations: Array<Record<string, unknown>>) {
  const plan = planOf(steps);
  const parsed = parseObservations({ schema: EXECUTION_OBSERVATIONS_SCHEMA, observations }, plan);
  expect(parsed.issues).toEqual([]);
  return evaluatePlan(plan, parsed.observations);
}

describe('check operators', () => {
  it('equals passes on the same text and fails on other text', () => {
    const check = checkOf({ op: 'equals', value: 'Saved' });

    expect(evaluateCheck(check, observed('Saved')).status).toBe('passed');
    expect(evaluateCheck(check, observed('Draft')).status).toBe('failed');
  });

  it('equals compares numbers and booleans by their text form', () => {
    expect(evaluateCheck(checkOf({ op: 'equals', value: 3 }), observed('3')).status).toBe('passed');
    expect(evaluateCheck(checkOf({ op: 'equals', value: true }), observed('true')).status).toBe('passed');
  });

  it('contains passes when the text includes the value and fails otherwise', () => {
    const check = checkOf({ op: 'contains', value: 'ready' });

    expect(evaluateCheck(check, observed('Export ready in 3 s')).status).toBe('passed');
    expect(evaluateCheck(check, observed('Draft')).status).toBe('failed');
  });

  it('matches passes on a matching pattern and fails otherwise', () => {
    const check = checkOf({ op: 'matches', pattern: '^Saved\\b' });

    expect(evaluateCheck(check, observed('Saved 3 items')).status).toBe('passed');
    expect(evaluateCheck(check, observed('Unsaved')).status).toBe('failed');
  });

  it('matches stops a pattern that backtracks too long and reports it as invalid', () => {
    const check = checkOf({ op: 'matches', pattern: '(a+)+$' });
    const started = Date.now();

    const outcome = evaluateCheck(check, observed(`${'a'.repeat(40)}!`));

    expect(outcome.status).toBe('invalid');
    expect(outcome.reason).toMatch(/exceeded/);
    expect(Date.now() - started).toBeLessThan(5_000);
  }, 10_000);

  it('matches reports a value over the length cap as invalid instead of evaluating it', () => {
    const check = checkOf({ op: 'matches', pattern: 'a' });

    expect(evaluateCheck(check, observed('a'.repeat(MAX_MATCH_VALUE_LENGTH))).status).toBe('passed');
    expect(evaluateCheck(check, observed('a'.repeat(MAX_MATCH_VALUE_LENGTH + 1))).status).toBe('invalid');
  });

  it('compare gt passes only above the value', () => {
    const check = checkOf({ op: 'compare', comparator: 'gt', value: 5 });

    expect(evaluateCheck(check, observed(6)).status).toBe('passed');
    expect(evaluateCheck(check, observed(5)).status).toBe('failed');
  });

  it('compare gte passes at the value and above it', () => {
    const check = checkOf({ op: 'compare', comparator: 'gte', value: 5 });

    expect(evaluateCheck(check, observed(5)).status).toBe('passed');
    expect(evaluateCheck(check, observed(4)).status).toBe('failed');
  });

  it('compare lt passes only below the value', () => {
    const check = checkOf({ op: 'compare', comparator: 'lt', value: 5 });

    expect(evaluateCheck(check, observed(4)).status).toBe('passed');
    expect(evaluateCheck(check, observed(5)).status).toBe('failed');
  });

  it('compare lte passes at the value and below it', () => {
    const check = checkOf({ op: 'compare', comparator: 'lte', value: 5 });

    expect(evaluateCheck(check, observed(5)).status).toBe('passed');
    expect(evaluateCheck(check, observed(6)).status).toBe('failed');
  });

  it('compare reads numeric text and reports any other observation as invalid', () => {
    const check = checkOf({ op: 'compare', comparator: 'gte', value: 40 });

    expect(evaluateCheck(check, observed(' 42 ')).status).toBe('passed');
    expect(evaluateCheck(check, observed('USD 42')).status).toBe('invalid');
    expect(evaluateCheck(check, observed(true)).status).toBe('invalid');
  });

  it('delta passes when after minus before equals the expected change, within float rounding', () => {
    const check = checkOf({ op: 'delta', by: 0.2 });

    expect(evaluateCheck(check, observed(10.3, 10.1)).status).toBe('passed');
    expect(evaluateCheck(check, observed(10.4, 10.1)).status).toBe('failed');
  });

  it('delta reports a missing before value as invalid', () => {
    expect(evaluateCheck(checkOf({ op: 'delta', by: 1 }), observed(5)).status).toBe('invalid');
  });

  it('delta reports non-numeric before or after values as invalid', () => {
    expect(evaluateCheck(checkOf({ op: 'delta', by: 1 }), observed(5, 'n/a')).status).toBe('invalid');
  });

  it('negate inverts passed and failed and leaves missing and invalid results alone', () => {
    const equals = checkOf({ op: 'equals', value: 'Saved', negate: true });

    expect(evaluateCheck(equals, observed('Saved')).status).toBe('failed');
    expect(evaluateCheck(equals, observed('Draft')).status).toBe('passed');
    expect(evaluateCheck(equals, undefined).status).toBe('missing');
    expect(evaluateCheck(checkOf({ op: 'compare', comparator: 'gt', value: 1, negate: true }), observed('x')).status).toBe(
      'invalid'
    );
  });
});

describe('case verdicts', () => {
  const ON_SAVE = { id: 'c1', source: SOURCE, op: 'equals', value: 'Saved' };
  const NEEDS_HUMAN = { n: 2, checks: [], needsHuman: 'Read the chart colour' };

  it('reports passed when every check passes and no step needs a human', () => {
    const result = evaluate([{ n: 1, checks: [ON_SAVE] }], [{ check: 'c1', after: 'Saved' }]);

    expect(result).toEqual({
      verdict: 'passed',
      checks: [{ id: 'c1', step: 1, op: 'equals', status: 'passed' }],
      needsHuman: [],
    });
  });

  it('reports failed when any check fails, even beside a needs-human step', () => {
    const result = evaluate([{ n: 1, checks: [ON_SAVE] }, NEEDS_HUMAN], [{ check: 'c1', after: 'Draft' }]);

    expect(result.verdict).toBe('failed');
    expect(result.checks[0]).toEqual({ id: 'c1', step: 1, op: 'equals', status: 'failed', reason: expect.any(String) });
  });

  it('reports needs-human when a step has a needsHuman reason and nothing failed', () => {
    const result = evaluate([{ n: 1, checks: [ON_SAVE] }, NEEDS_HUMAN], [{ check: 'c1', after: 'Saved' }]);

    expect(result.verdict).toBe('needs-human');
    expect(result.needsHuman).toEqual([{ step: 2, reason: 'Read the chart colour' }]);
  });

  it('reports incomplete when a check has no observation', () => {
    const result = evaluate([{ n: 1, checks: [ON_SAVE] }], []);

    expect(result.verdict).toBe('incomplete');
    expect(result.checks[0]).toEqual({ id: 'c1', step: 1, op: 'equals', status: 'missing', reason: expect.any(String) });
  });

  it('reports incomplete when a check observation is invalid', () => {
    const result = evaluate(
      [{ n: 1, checks: [{ id: 'c1', source: SOURCE, op: 'compare', comparator: 'gt', value: 1 }] }],
      [{ check: 'c1', after: 'USD 5' }]
    );

    expect(result.verdict).toBe('incomplete');
    expect(result.checks[0].status).toBe('invalid');
  });

  it('reports needs-human rather than incomplete when both apply', () => {
    const result = evaluate([{ n: 1, checks: [ON_SAVE] }, NEEDS_HUMAN], []);

    expect(result.verdict).toBe('needs-human');
    expect(result.checks[0].status).toBe('missing');
  });
});

describe('observations file', () => {
  let plan: ExecutionPlan;

  beforeEach(() => {
    plan = planOf([{ n: 1, checks: [{ id: 'c1', source: SOURCE, op: 'equals', value: 'Saved' }] }]);
  });

  it('rejects an observation for a check the plan does not declare', () => {
    const { issues } = parseObservations(
      { schema: EXECUTION_OBSERVATIONS_SCHEMA, observations: [{ check: 'c9', after: 'x' }] },
      plan
    );

    expect(issues).toEqual([expect.objectContaining({ message: expect.stringContaining('c9'), check: 'c9' })]);
  });

  it('rejects a second observation for the same check', () => {
    const { issues } = parseObservations(
      {
        schema: EXECUTION_OBSERVATIONS_SCHEMA,
        observations: [
          { check: 'c1', after: 'Saved' },
          { check: 'c1', after: 'Draft' },
        ],
      },
      plan
    );

    expect(issues).toEqual([
      expect.objectContaining({ message: expect.stringContaining('already has an observation'), check: 'c1' }),
    ]);
  });

  it('rejects a value that is not a string, number or boolean and names the observation', () => {
    const { issues } = parseObservations(
      { schema: EXECUTION_OBSERVATIONS_SCHEMA, observations: [{ check: 'c1', after: { text: 'Saved' } }] },
      plan
    );

    expect(issues).toEqual([expect.objectContaining({ message: expect.stringContaining('after'), check: 'c1' })]);
  });

  it('rejects a non-finite number such as 1e400', () => {
    const { issues } = parseObservations(
      { schema: EXECUTION_OBSERVATIONS_SCHEMA, observations: [{ check: 'c1', after: JSON.parse('1e400') }] },
      plan
    );

    expect(issues).toEqual([expect.objectContaining({ message: expect.stringContaining('finite'), check: 'c1' })]);
  });

  it('rejects another observations schema version', () => {
    const { issues } = parseObservations({ schema: 'qaspec.execution-observations/v2', observations: [] }, plan);

    expect(issues).toEqual([expect.objectContaining({ message: expect.stringContaining(EXECUTION_OBSERVATIONS_SCHEMA) })]);
  });

  it('accepts string, number and boolean values, with an optional before value', () => {
    const { issues, observations } = parseObservations(
      {
        schema: EXECUTION_OBSERVATIONS_SCHEMA,
        observations: [{ check: 'c1', after: 'Saved', before: 'Draft' }],
      },
      plan
    );

    expect(issues).toEqual([]);
    expect(observations.get('c1')).toEqual({ check: 'c1', after: 'Saved', before: 'Draft' });
  });
});
