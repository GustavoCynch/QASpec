import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  EXECUTION_PLAN_SCHEMA,
  MAX_PATTERN_LENGTH,
  hashPlanBytes,
  parseJsonText,
  validatePlanAgainstTestcases,
  validatePlanShape,
} from '../../src/core/execution-plan.js';
import type { TestcaseDetail } from '../../src/core/cases-validation.js';

const SOURCE = { kind: 'dom', target: 'status banner text' };
const equalsCheck = { id: 'banner', source: SOURCE, op: 'equals', value: 'Saved' };

function planWith(steps: unknown[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: EXECUTION_PLAN_SCHEMA,
    change: 'pr-1',
    case: { id: '1.1', title: 'Export totals' },
    steps,
    ...overrides,
  };
}

function checkPlan(check: Record<string, unknown>): Record<string, unknown> {
  return planWith([{ n: 2, checks: [check] }]);
}

function matchesCheck(pattern: string): Record<string, unknown> {
  return { id: 'banner', source: SOURCE, op: 'matches', pattern };
}

/** Case 1.1 as parseTestcaseDetails reads it: row 1 is a transition step with no Expected cell. */
const CASE_1_1: TestcaseDetail = {
  id: '1.1',
  title: '1.1 Export totals',
  line: 3,
  steps: [
    { n: 1, action: 'Navigate to the report', expected: '', line: 12 },
    { n: 2, action: 'Click save', expected: 'Saved banner shown', line: 13 },
  ],
  stepIssues: [],
};

/** Validates the plan shape, then checks it against the case table; a shape error fails the test. */
function againstCases(plan: unknown, cases: TestcaseDetail[] = [CASE_1_1], changeName = 'pr-1') {
  const shape = validatePlanShape(plan);
  expect(shape.issues).toEqual([]);
  return validatePlanAgainstTestcases({ plan: shape.plan!, changeName, cases });
}

describe('execution plan format', () => {
  it('accepts a plan that follows the format', () => {
    const shape = validatePlanShape(planWith([{ n: 2, checks: [equalsCheck] }]));

    expect(shape.issues).toEqual([]);
    expect(shape.plan?.case.id).toBe('1.1');
  });

  it('accepts each fixed operator with its own fields', () => {
    const checks = [
      { id: 'a', source: SOURCE, op: 'equals', value: 'Saved' },
      { id: 'b', source: SOURCE, op: 'contains', value: 'Saved' },
      { id: 'c', source: SOURCE, op: 'matches', pattern: '^Saved\\b' },
      { id: 'd', source: SOURCE, op: 'compare', comparator: 'gte', value: 2 },
      { id: 'e', source: SOURCE, op: 'delta', by: 1, negate: true },
    ];

    expect(validatePlanShape(planWith([{ n: 2, checks }])).issues).toEqual([]);
  });

  it('rejects an operator outside the fixed set and names the case, step and check', () => {
    const shape = validatePlanShape(checkPlan({ ...equalsCheck, op: 'fuzzy' }));

    expect(shape.plan).toBeUndefined();
    expect(shape.issues).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('fuzzy'),
        case: '1.1',
        step: 2,
        check: 'banner',
      }),
    ]);
  });

  it('rejects a misspelled option instead of silently ignoring it', () => {
    const shape = validatePlanShape(checkPlan({ ...equalsCheck, negated: true }));

    expect(shape.issues).toEqual([
      expect.objectContaining({ message: expect.stringContaining('negated'), case: '1.1', step: 2, check: 'banner' }),
    ]);
  });

  it('rejects a plan written for another schema version', () => {
    const shape = validatePlanShape(
      planWith([{ n: 2, checks: [equalsCheck] }], { schema: 'qaspec.execution-plan/v2' })
    );

    expect(shape.issues).toEqual([expect.objectContaining({ message: expect.stringContaining(EXECUTION_PLAN_SCHEMA) })]);
  });

  it('rejects a check id that repeats and names the step where it repeats', () => {
    const shape = validatePlanShape(planWith([{ n: 1, checks: [equalsCheck] }, { n: 2, checks: [equalsCheck] }]));

    expect(shape.issues).toEqual([
      expect.objectContaining({ message: expect.stringContaining('banner'), case: '1.1', step: 2, check: 'banner' }),
    ]);
  });

  it('rejects a plan that declares no check and no needsHuman reason, so it can never pass empty', () => {
    for (const steps of [[], [{ n: 1, checks: [] }]]) {
      const shape = validatePlanShape(planWith(steps));

      expect(shape.issues).toEqual([
        expect.objectContaining({ message: expect.stringContaining('declares no check'), case: '1.1' }),
      ]);
    }
  });

  it('rejects a regex pattern that does not compile', () => {
    const shape = validatePlanShape(checkPlan(matchesCheck('(unclosed')));

    expect(shape.issues).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('does not compile'),
        case: '1.1',
        step: 2,
        check: 'banner',
      }),
    ]);
  });

  it('rejects a regex pattern longer than the cap', () => {
    const shape = validatePlanShape(checkPlan(matchesCheck('a'.repeat(MAX_PATTERN_LENGTH + 1))));

    expect(shape.issues).toEqual([
      expect.objectContaining({
        message: expect.stringContaining(`${MAX_PATTERN_LENGTH + 1} characters`),
        case: '1.1',
        step: 2,
        check: 'banner',
      }),
    ]);
  });

  it('accepts a regex pattern exactly at the cap', () => {
    expect(validatePlanShape(checkPlan(matchesCheck('a'.repeat(MAX_PATTERN_LENGTH)))).issues).toEqual([]);
  });

  it('rejects an empty contains value, which would always pass', () => {
    const shape = validatePlanShape(checkPlan({ ...equalsCheck, op: 'contains', value: '' }));

    expect(shape.issues).toEqual([
      expect.objectContaining({ message: expect.stringContaining('must not be empty'), check: 'banner' }),
    ]);
  });

  it('rejects a compare value that is not a finite number', () => {
    const value = JSON.parse('1e400');
    const shape = validatePlanShape(checkPlan({ id: 'total', source: SOURCE, op: 'compare', comparator: 'gt', value }));

    expect(shape.issues).toEqual([expect.objectContaining({ message: expect.stringContaining('finite'), check: 'total' })]);
  });

  it('rejects a step number that repeats in the plan', () => {
    const shape = validatePlanShape(
      planWith([
        { n: 2, checks: [equalsCheck] },
        { n: 2, checks: [{ ...equalsCheck, id: 'other' }] },
      ])
    );

    expect(shape.issues).toEqual([
      expect.objectContaining({ message: expect.stringContaining('step 2'), case: '1.1', step: 2 }),
    ]);
  });
});

describe('validation against testcases.md', () => {
  it('accepts a plan whose steps match the case rows and leaves transition rows undeclared', () => {
    expect(againstCases(planWith([{ n: 2, checks: [equalsCheck] }]))).toEqual([]);
  });

  it('rejects a case id that testcases.md does not contain', () => {
    const issues = againstCases(planWith([{ n: 2, checks: [equalsCheck] }], { case: { id: '9.9', title: 'Missing' } }));

    expect(issues).toEqual([expect.objectContaining({ message: expect.stringContaining('"9.9"'), case: '9.9' })]);
  });

  it('rejects a step number that has no row in the case table', () => {
    const issues = againstCases(
      planWith([
        { n: 2, checks: [equalsCheck] },
        { n: 7, checks: [{ ...equalsCheck, id: 'other' }] },
      ])
    );

    expect(issues).toEqual([expect.objectContaining({ message: expect.stringContaining('step 7'), case: '1.1', step: 7 })]);
  });

  it('requires a check or a needsHuman reason for every row with an Expected cell', () => {
    const issues = againstCases(planWith([{ n: 1, checks: [equalsCheck] }, { n: 2, checks: [] }]));

    expect(issues).toEqual([expect.objectContaining({ message: expect.stringContaining('step 2'), case: '1.1', step: 2 })]);
  });

  it('accepts a needsHuman reason in place of a check for an Expected row', () => {
    expect(againstCases(planWith([{ n: 2, checks: [], needsHuman: 'The layout cannot be read as a value' }]))).toEqual([]);
  });

  it('rejects a plan that names another change', () => {
    const issues = againstCases(planWith([{ n: 2, checks: [equalsCheck] }]), [CASE_1_1], 'pr-2');

    expect(issues).toEqual([expect.objectContaining({ message: expect.stringContaining('"pr-2"') })]);
  });

  it('rejects a case id that testcases.md lists more than once', () => {
    const issues = againstCases(planWith([{ n: 2, checks: [equalsCheck] }]), [CASE_1_1, CASE_1_1]);

    expect(issues).toEqual([
      expect.objectContaining({ message: expect.stringContaining('more than once'), case: '1.1' }),
    ]);
  });

  it('reports the Steps table problems of the matched case', () => {
    const issues = againstCases(planWith([{ n: 2, checks: [equalsCheck] }]), [
      { ...CASE_1_1, stepIssues: ['Steps row at line 13 has no step number in the # column'] },
    ]);

    expect(issues).toEqual([expect.objectContaining({ message: expect.stringContaining('line 13'), case: '1.1' })]);
  });
});

describe('plan bytes and JSON input', () => {
  it('hashes the exact file bytes with sha256, line endings included', () => {
    expect(hashPlanBytes(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashPlanBytes(Buffer.from('a\r\n'))).toBe(createHash('sha256').update('a\r\n').digest('hex'));
    expect(hashPlanBytes(Buffer.from('a\r\n'))).not.toBe(hashPlanBytes(Buffer.from('a\n')));
  });

  it('parses JSON that starts with a byte order mark', () => {
    expect(parseJsonText('﻿{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('reports invalid JSON as a message instead of throwing', () => {
    expect(parseJsonText('{"a":')).toEqual({ ok: false, message: expect.any(String) });
  });
});
