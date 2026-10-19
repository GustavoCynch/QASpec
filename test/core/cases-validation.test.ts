import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { parseTestcaseDetails, toRequirementSlug, validateCases } from '../../src/core/cases-validation.js';

const VALID_CASE_BLOCK = `
  <!-- req: billing-export/totals -->

  **Preconditions:**
  1. User logged in

  **Steps:**
  | # | Action | Expected |
  |---|--------|----------|
  | 1 | Open export | Export dialog shown |
`;

describe('cases-validation', () => {
  let testDir: string;
  let changeDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `qaspec-cases-${randomUUID()}`);
    changeDir = path.join(testDir, 'qaspec', 'changes', 'pr-1');
    await fs.mkdir(path.join(changeDir, 'specs', 'billing-export'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function writeSpec(content: string) {
    await fs.writeFile(path.join(changeDir, 'specs/billing-export/spec.md'), content, 'utf-8');
  }

  async function writeTestcases(content: string) {
    await fs.writeFile(path.join(changeDir, 'testcases.md'), content, 'utf-8');
  }

  it('toRequirementSlug converts names to kebab-case', () => {
    expect(toRequirementSlug('Phase Approval Recording')).toBe('phase-approval-recording');
  });

  it('passes when every requirement has a covering annotated case', async () => {
    await writeSpec(`## ADDED Requirements

### Requirement: Export totals

#### Scenario: Happy path export

- **WHEN** user exports
- **THEN** totals appear
`);
    await writeTestcases(`## Suite: Export

- [ ] 1.1 Happy path export${VALID_CASE_BLOCK.replace('billing-export/totals', 'billing-export/export-totals')}
`);

    const result = validateCases(changeDir);
    expect(result.valid).toBe(true);
    expect(result.coverage.coveredRequirements).toBe(1);
  });

  it('fails on uncovered requirement', async () => {
    await writeSpec(`## ADDED Requirements

### Requirement: Missing coverage case

#### Scenario: One scenario
`);
    await writeTestcases(`## Suite: Empty

- [ ] 1.1 Other${VALID_CASE_BLOCK}
`);

    const result = validateCases(changeDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'uncovered-requirement')).toBe(true);
  });

  it('fails on dangling req reference', async () => {
    await writeSpec(`## ADDED Requirements

### Requirement: Real requirement
`);
    await writeTestcases(`## Suite: Bad ref

- [ ] 1.1 Case${VALID_CASE_BLOCK}
`);

    const result = validateCases(changeDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'dangling-reference')).toBe(true);
  });

  it('fails on unannotated case', async () => {
    await writeSpec(`## ADDED Requirements

### Requirement: Annotated requirement
`);
    await writeTestcases(`## Suite: No annotation

- [ ] 1.1 Case without req

  **Preconditions:**
  1. Setup

  **Steps:**
  | # | Action | Expected |
  |---|--------|----------|
  | 1 | Act | Result |
`);

    const result = validateCases(changeDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'unannotated-case')).toBe(true);
  });

  it('accepts assumption and gap annotations', async () => {
    await writeSpec(`## ADDED Requirements

### Requirement: Covered requirement
`);
    await writeTestcases(`## Suite: Escape hatches

- [ ] 1.1 Assumption case
  <!-- req: assumption:a1 -->

  **Preconditions:**
  1. Setup

  **Steps:**
  | # | Action | Expected |
  |---|--------|----------|
  | 1 | Act | Result |

- [ ] 1.2 Gap case
  <!-- req: gap -->

  **Preconditions:**
  1. Setup

  **Steps:**
  | # | Action | Expected |
  |---|--------|----------|
  | 1 | Act | Result |

- [ ] 1.3 Covered requirement
  <!-- req: billing-export/covered-requirement -->

  **Preconditions:**
  1. Setup

  **Steps:**
  | # | Action | Expected |
  |---|--------|----------|
  | 1 | Act | Result |
`);

    const result = validateCases(changeDir);
    expect(result.valid).toBe(true);
  });

  it('fails on missing Steps block', async () => {
    await writeSpec(`## ADDED Requirements

### Requirement: Export totals
`);
    await writeTestcases(`## Suite: Format

- [ ] 1.1 Bad format
  <!-- req: billing-export/export-totals -->

  **Preconditions:**
  1. Setup
`);

    const result = validateCases(changeDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'malformed-case')).toBe(true);
  });

  it('warns on uncovered scenario when requirement is covered generically', async () => {
    await writeSpec(`## ADDED Requirements

### Requirement: Export totals

#### Scenario: Edge case export

- **WHEN** edge
- **THEN** handled
`);
    await writeTestcases(`## Suite: Export

- [ ] 1.1 Generic export case
  <!-- req: billing-export/export-totals -->

  **Preconditions:**
  1. Setup

  **Steps:**
  | # | Action | Expected |
  |---|--------|----------|
  | 1 | Act | Result |
`);

    const result = validateCases(changeDir);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === 'uncovered-scenario')).toBe(true);
  });

  it('keeps the validateCases result unchanged for a fixture-style input', async () => {
    await writeSpec(`## ADDED Requirements

### Requirement: Export totals
`);
    await writeTestcases(`## Suite: Export

- [ ] 1.1 Happy path export
  <!-- req: billing-export/export-totals -->

  **Preconditions:**
  1. Setup

  **Steps:**
  | # | Action | Expected |
  |---|--------|----------|
  | 1 | Act | Result |
`);

    expect(validateCases(changeDir)).toEqual({
      valid: true,
      errors: [],
      warnings: [],
      requirements: [
        {
          capability: 'billing-export',
          slug: 'export-totals',
          key: 'billing-export/export-totals',
          requirementName: 'Export totals',
          specPath: expect.stringContaining(path.join('specs', 'billing-export', 'spec.md')),
          scenarios: [],
        },
      ],
      cases: [
        {
          line: 3,
          title: '1.1 Happy path export',
          checked: false,
          reqAnnotation: 'billing-export/export-totals',
          hasPreconditions: true,
          hasSteps: true,
          stepsTableValid: true,
          formatIssues: [],
        },
      ],
      coverage: {
        totalRequirements: 1,
        coveredRequirements: 1,
        byCapability: { 'billing-export': { total: 1, covered: 1 } },
      },
    });
  });

  describe('parseTestcaseDetails', () => {
    const CASE_HEAD = ['## Suite: Export', '', '- [ ] 1.1 Export totals', '  <!-- req: billing-export/export-totals -->', ''];

    it('reads the case id and every Steps row, keeping empty Expected cells', async () => {
      await writeTestcases(
        [
          ...CASE_HEAD,
          '  **Preconditions:**',
          '  1. Setup',
          '',
          '  **Steps:**',
          '  | # | Action | Expected |',
          '  |---|--------|----------|',
          '  | 1 | Navigate to the report |  |',
          '  | 2 | Click save | Saved banner shown |',
          '',
        ].join('\n')
      );

      expect(parseTestcaseDetails(changeDir)).toEqual({
        path: path.join(changeDir, 'testcases.md'),
        cases: [
          {
            id: '1.1',
            title: '1.1 Export totals',
            line: 3,
            steps: [
              { n: 1, action: 'Navigate to the report', expected: '', line: 12 },
              { n: 2, action: 'Click save', expected: 'Saved banner shown', line: 13 },
            ],
            stepIssues: [],
          },
        ],
      });
    });

    it('leaves the id undefined when the title has no leading number', async () => {
      await writeTestcases(
        [
          '## Suite: Export',
          '',
          '- [ ] Export totals',
          '  <!-- req: billing-export/export-totals -->',
          '',
          '  **Steps:**',
          '  | # | Action | Expected |',
          '  |---|--------|----------|',
          '  | 1 | Act | Result |',
        ].join('\n')
      );

      const [only] = parseTestcaseDetails(changeDir).cases;
      expect(only.id).toBeUndefined();
      expect(only.title).toBe('Export totals');
    });

    it('keeps an escaped pipe inside its cell', async () => {
      await writeTestcases(
        [
          ...CASE_HEAD,
          '  **Steps:**',
          '  | # | Action | Expected |',
          '  |---|--------|----------|',
          '  | 1 | Type a \\| b | Field shows a \\| b |',
        ].join('\n')
      );

      const [only] = parseTestcaseDetails(changeDir).cases;
      expect(only.steps).toEqual([{ n: 1, action: 'Type a | b', expected: 'Field shows a | b', line: 9 }]);
      expect(only.stepIssues).toEqual([]);
    });

    it('reports a Steps row without a step number and keeps the other rows', async () => {
      await writeTestcases(
        [
          ...CASE_HEAD,
          '  **Steps:**',
          '  | # | Action | Expected |',
          '  |---|--------|----------|',
          '  | first | Navigate |  |',
          '  | 2 | Click save | Saved banner shown |',
        ].join('\n')
      );

      const [only] = parseTestcaseDetails(changeDir).cases;
      expect(only.stepIssues).toEqual(['Steps row at line 9 has no step number in the # column']);
      expect(only.steps).toEqual([{ n: 2, action: 'Click save', expected: 'Saved banner shown', line: 10 }]);
    });

    it('reports a row that does not have three columns', async () => {
      await writeTestcases(
        [
          ...CASE_HEAD,
          '  **Steps:**',
          '  | # | Action | Expected |',
          '  |---|--------|----------|',
          '  | 1 | Act | Result | extra |',
        ].join('\n')
      );

      const [only] = parseTestcaseDetails(changeDir).cases;
      expect(only.stepIssues).toEqual(['Steps row at line 9 must have three columns (#, Action, Expected)']);
      expect(only.steps).toEqual([]);
    });

    it('reports a case without a Steps block', async () => {
      await writeTestcases([...CASE_HEAD, '  **Preconditions:**', '  1. Setup'].join('\n'));

      const [only] = parseTestcaseDetails(changeDir).cases;
      expect(only.stepIssues).toEqual(['Missing **Steps:** block']);
      expect(only.steps).toEqual([]);
    });

    it('reports a repeated step number and keeps the first row', async () => {
      await writeTestcases(
        [
          ...CASE_HEAD,
          '  **Steps:**',
          '  | # | Action | Expected |',
          '  |---|--------|----------|',
          '  | 1 | Navigate |  |',
          '  | 1 | Click save | Saved banner shown |',
        ].join('\n')
      );

      const [only] = parseTestcaseDetails(changeDir).cases;
      expect(only.stepIssues).toEqual(['Steps table repeats step number 1 at line 10']);
      expect(only.steps).toEqual([{ n: 1, action: 'Navigate', expected: '', line: 9 }]);
    });

    it('returns no path and no cases when testcases.md is missing', () => {
      expect(parseTestcaseDetails(changeDir)).toEqual({ path: null, cases: [] });
    });
  });
});
