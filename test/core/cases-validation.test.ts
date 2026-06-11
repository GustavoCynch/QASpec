import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { validateCases, toRequirementSlug } from '../../src/core/cases-validation.js';

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
});
