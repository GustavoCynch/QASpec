import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import {
  computeAnalyzeContentHash,
  evaluateAnalyzeApproval,
  normalizeContentForHash,
  readApprovalRecord,
  writeApprovalRecord,
  toHashRelativePath,
} from '../../src/core/approval-ledger.js';
import { writeChangeMetadata } from '../../src/utils/change-metadata.js';

describe('approval-ledger', () => {
  let testDir: string;
  let changeDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `qaspec-approval-${randomUUID()}`);
    changeDir = path.join(testDir, 'qaspec', 'changes', 'test-change');
    await fs.mkdir(path.join(changeDir, 'specs', 'cap-a'), { recursive: true });
    writeChangeMetadata(changeDir, { schema: 'qaspec-pr-review', created: '2026-06-10' });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function seedAnalyzeArtifacts(options?: {
    analysisContent?: string;
    specContents?: Record<string, string>;
  }) {
    await fs.writeFile(
      path.join(changeDir, 'analysis.md'),
      options?.analysisContent ?? '# Analysis\n',
      'utf-8'
    );
    const specs = options?.specContents ?? {
      'specs/cap-a/spec.md': '## ADDED Requirements\n',
    };
    for (const [rel, content] of Object.entries(specs)) {
      const full = path.join(changeDir, rel);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, 'utf-8');
    }
  }

  describe('normalizeContentForHash', () => {
    it('normalizes CRLF and CR line endings to LF', () => {
      expect(normalizeContentForHash('a\r\nb\rc')).toBe('a\nb\nc');
    });
  });

  describe('computeAnalyzeContentHash', () => {
    it('produces identical hashes for same content with different line endings', async () => {
      await fs.writeFile(path.join(changeDir, 'analysis.md'), 'line\r\n', 'utf-8');
      await fs.writeFile(
        path.join(changeDir, 'specs/cap-a/spec.md'),
        'spec\r\n',
        'utf-8'
      );

      const { hash: hashCrlf } = computeAnalyzeContentHash(changeDir);

      await fs.writeFile(path.join(changeDir, 'analysis.md'), 'line\n', 'utf-8');
      await fs.writeFile(
        path.join(changeDir, 'specs/cap-a/spec.md'),
        'spec\n',
        'utf-8'
      );

      const { hash: hashLf } = computeAnalyzeContentHash(changeDir);
      expect(hashCrlf).toBe(hashLf);
      expect(hashCrlf).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('sorts spec files deterministically regardless of creation order', async () => {
      await fs.writeFile(path.join(changeDir, 'analysis.md'), 'a\n', 'utf-8');
      await fs.mkdir(path.join(changeDir, 'specs/z-cap'), { recursive: true });
      await fs.mkdir(path.join(changeDir, 'specs/a-cap'), { recursive: true });
      await fs.writeFile(path.join(changeDir, 'specs/z-cap/spec.md'), 'z\n', 'utf-8');
      await fs.writeFile(path.join(changeDir, 'specs/a-cap/spec.md'), 'a\n', 'utf-8');

      const { artifacts, hash } = computeAnalyzeContentHash(changeDir);
      expect(artifacts.map((a) => a.relativePath)).toEqual([
        'analysis.md',
        'specs/a-cap/spec.md',
        'specs/z-cap/spec.md',
      ]);
      expect(hash).toMatch(/^sha256:/);
    });

    it('uses POSIX separators in hashed relative paths', () => {
      const posix = toHashRelativePath('/proj/change', '/proj/change/specs/a/spec.md');
      expect(posix).toBe('specs/a/spec.md');
      expect(posix).not.toContain('\\');
    });
  });

  describe('writeApprovalRecord / readApprovalRecord', () => {
    it('persists and reads an analyze approval record', async () => {
      await seedAnalyzeArtifacts();
      const { hash } = computeAnalyzeContentHash(changeDir);
      const record = {
        approvedAt: '2026-06-10T12:00:00.000Z',
        contentHash: hash,
        headSha: 'abc123',
      };

      writeApprovalRecord(changeDir, 'analyze', record);
      const read = readApprovalRecord(changeDir, 'analyze');
      expect(read).toEqual(record);
    });
  });

  describe('evaluateAnalyzeApproval', () => {
    it('returns missing when no approvals key exists', async () => {
      await seedAnalyzeArtifacts();
      const status = evaluateAnalyzeApproval(changeDir);
      expect(status.state).toBe('missing');
    });

    it('returns valid when hash matches and head SHA unchanged', async () => {
      await seedAnalyzeArtifacts();
      const { hash } = computeAnalyzeContentHash(changeDir);
      writeApprovalRecord(changeDir, 'analyze', {
        approvedAt: '2026-06-10T12:00:00.000Z',
        contentHash: hash,
        headSha: 'deadbeef',
      });

      const status = evaluateAnalyzeApproval(changeDir, { headSha: 'deadbeef' });
      expect(status.state).toBe('valid');
    });

    it('returns stale with content-changed after artifact edit', async () => {
      await seedAnalyzeArtifacts();
      const { hash } = computeAnalyzeContentHash(changeDir);
      writeApprovalRecord(changeDir, 'analyze', {
        approvedAt: '2026-06-10T12:00:00.000Z',
        contentHash: hash,
      });

      await fs.appendFile(path.join(changeDir, 'analysis.md'), '\nedit', 'utf-8');

      const status = evaluateAnalyzeApproval(changeDir);
      expect(status.state).toBe('stale');
      expect(status.reason).toBe('content-changed');
    });

    it('returns stale with head-moved when head SHA differs', async () => {
      await seedAnalyzeArtifacts();
      const { hash } = computeAnalyzeContentHash(changeDir);
      writeApprovalRecord(changeDir, 'analyze', {
        approvedAt: '2026-06-10T12:00:00.000Z',
        contentHash: hash,
        headSha: 'old-sha',
      });

      const status = evaluateAnalyzeApproval(changeDir, { headSha: 'new-sha' });
      expect(status.state).toBe('stale');
      expect(status.reason).toBe('head-moved');
    });

    it('falls back to legacy analisis.md when analysis.md is absent', async () => {
      await fs.writeFile(path.join(changeDir, 'analisis.md'), 'legacy\n', 'utf-8');
      await fs.writeFile(
        path.join(changeDir, 'specs/cap-a/spec.md'),
        'spec\n',
        'utf-8'
      );

      const { artifacts } = computeAnalyzeContentHash(changeDir);
      expect(artifacts[0].relativePath).toBe('analisis.md');
    });
  });
});
