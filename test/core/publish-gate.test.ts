import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import {
  runPublishGate,
  readPublishGateToken,
} from '../../src/core/publish-gate.js';
import {
  computeAnalyzeContentHash,
  writeApprovalRecord,
} from '../../src/core/approval-ledger.js';
import { writeChangeMetadata } from '../../src/utils/change-metadata.js';

const CASE_BLOCK = `
  <!-- req: cap-a/my-req -->

  **Preconditions:**
  1. Setup

  **Steps:**
  | # | Action | Expected |
  |---|--------|----------|
  | 1 | Act | Result |
`;

describe('publish-gate', () => {
  let testDir: string;
  let projectRoot: string;
  let changeDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `qaspec-gate-${randomUUID()}`);
    projectRoot = testDir;
    changeDir = path.join(testDir, 'openspec', 'changes', 'pr-gate');
    await fs.mkdir(path.join(changeDir, 'specs', 'cap-a'), { recursive: true });
    await fs.mkdir(path.join(testDir, 'qaspec'), { recursive: true });

    writeChangeMetadata(changeDir, { schema: 'qaspec-pr-review', created: '2026-06-10' });

    await fs.writeFile(path.join(changeDir, 'analysis.md'), '# Analysis\n', 'utf-8');
    await fs.writeFile(
      path.join(changeDir, 'specs/cap-a/spec.md'),
      `## ADDED Requirements

### Requirement: My req
`,
      'utf-8'
    );
    await fs.writeFile(
      path.join(changeDir, 'testcases.md'),
      `## Suite: S\n\n- [ ] 1.1 Case${CASE_BLOCK}`,
      'utf-8'
    );
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function seedGreenPath() {
    await fs.writeFile(
      path.join(testDir, 'qaspec/config.yaml'),
      'schema: qaspec-pr-review\ntcms:\n  provider: qase\n  project: PR1\n',
      'utf-8'
    );
    const { hash } = computeAnalyzeContentHash(changeDir);
    writeApprovalRecord(changeDir, 'analyze', {
      approvedAt: '2026-06-10T12:00:00.000Z',
      contentHash: hash,
    });
  }

  it('issues token when all preconditions pass', async () => {
    await seedGreenPath();
    const result = runPublishGate(changeDir, projectRoot);
    expect(result.passed).toBe(true);
    expect(result.token).toMatch(/^qaspec-gate:[a-f0-9]{8}$/);
    expect(readPublishGateToken(changeDir)).toBe(result.token);
  });

  it('enumerates failures when approval and tcms are missing', async () => {
    const result = runPublishGate(changeDir, projectRoot);
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.code === 'approval-missing')).toBe(true);
    expect(result.failures.some((f) => f.code === 'tcms-missing')).toBe(true);
  });

  it('replaces token on re-run', async () => {
    await seedGreenPath();
    const first = runPublishGate(changeDir, projectRoot);
    const second = runPublishGate(changeDir, projectRoot);
    expect(first.token).toBeDefined();
    expect(second.token).toBeDefined();
    expect(readPublishGateToken(changeDir)).toBe(second.token);
  });

  it('invalidates persisted token after artifact edit', async () => {
    await seedGreenPath();
    const first = runPublishGate(changeDir, projectRoot);
    await fs.appendFile(path.join(changeDir, 'testcases.md'), '\n', 'utf-8');

    const tokenAfterEdit = readPublishGateToken(changeDir);
    expect(tokenAfterEdit).toBe(first.token);

    const second = runPublishGate(changeDir, projectRoot);
    expect(second.passed).toBe(true);
    expect(second.token).not.toBe(first.token);
  });
});
