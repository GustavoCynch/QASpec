import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import {
  resolveTcmsTarget,
  writeTcmsTarget,
} from '../../src/core/tcms-target.js';
import {
  readChangeMetadata,
  writeChangeMetadata,
} from '../../src/utils/change-metadata.js';

describe('tcms-target', () => {
  let testDir: string;
  let projectRoot: string;
  let changeDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `qaspec-tcms-${randomUUID()}`);
    projectRoot = testDir;
    changeDir = path.join(testDir, 'openspec', 'changes', 'pr-target');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.mkdir(path.join(testDir, 'qaspec'), { recursive: true });
    writeChangeMetadata(changeDir, { schema: 'qaspec-pr-review', created: '2026-06-10' });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function writeConfigDefaults(yaml: string) {
    await fs.writeFile(path.join(testDir, 'qaspec/config.yaml'), yaml, 'utf-8');
  }

  describe('writeTcmsTarget', () => {
    it('persists target fields in change metadata', () => {
      writeTcmsTarget(changeDir, { provider: 'qase', project: 'PR415' }, projectRoot);
      const metadata = readChangeMetadata(changeDir, projectRoot);
      expect(metadata?.tcms).toEqual({ provider: 'qase', project: 'PR415' });
      expect(metadata?.schema).toBe('qaspec-pr-review');
    });

    it('upserts without dropping existing fields', () => {
      writeTcmsTarget(changeDir, { provider: 'qase', project: 'PR415' }, projectRoot);
      writeTcmsTarget(changeDir, { baseUrl: 'https://example.test' }, projectRoot);
      const metadata = readChangeMetadata(changeDir, projectRoot);
      expect(metadata?.tcms).toEqual({
        provider: 'qase',
        project: 'PR415',
        baseUrl: 'https://example.test',
      });
    });

    it('throws when change metadata is missing', async () => {
      const orphanDir = path.join(testDir, 'openspec', 'changes', 'no-meta');
      await fs.mkdir(orphanDir, { recursive: true });
      expect(() =>
        writeTcmsTarget(orphanDir, { project: 'X1' }, projectRoot)
      ).toThrow(/metadata not found/i);
    });
  });

  describe('resolveTcmsTarget', () => {
    it('reports unusable empty target when nothing is configured', () => {
      const resolved = resolveTcmsTarget(changeDir, projectRoot);
      expect(resolved.target).toEqual({});
      expect(resolved.usable).toBe(false);
    });

    it('resolves change-level target as usable', () => {
      writeTcmsTarget(changeDir, { provider: 'qase', project: 'PR415' }, projectRoot);
      const resolved = resolveTcmsTarget(changeDir, projectRoot);
      expect(resolved.usable).toBe(true);
      expect(resolved.target).toEqual({ provider: 'qase', project: 'PR415' });
      expect(resolved.sources).toEqual({ provider: 'change', project: 'change' });
    });

    it('fills missing fields from config defaults', async () => {
      await writeConfigDefaults(
        'schema: qaspec-pr-review\ntcms:\n  provider: qase\n  baseUrl: https://defaults.test\n'
      );
      writeTcmsTarget(changeDir, { project: 'PR415' }, projectRoot);
      const resolved = resolveTcmsTarget(changeDir, projectRoot);
      expect(resolved.usable).toBe(true);
      expect(resolved.target).toEqual({
        provider: 'qase',
        project: 'PR415',
        baseUrl: 'https://defaults.test',
      });
      expect(resolved.sources).toEqual({
        provider: 'config',
        project: 'change',
        baseUrl: 'config',
      });
    });

    it('change-level fields win over config defaults', async () => {
      await writeConfigDefaults(
        'schema: qaspec-pr-review\ntcms:\n  provider: qase\n  project: MAIN\n'
      );
      writeTcmsTarget(changeDir, { project: 'PR415' }, projectRoot);
      const resolved = resolveTcmsTarget(changeDir, projectRoot);
      expect(resolved.target.project).toBe('PR415');
      expect(resolved.sources.project).toBe('change');
    });

    it('config-only defaults still produce a usable target', async () => {
      await writeConfigDefaults(
        'schema: qaspec-pr-review\ntcms:\n  provider: qase\n  project: MAIN\n'
      );
      const resolved = resolveTcmsTarget(changeDir, projectRoot);
      expect(resolved.usable).toBe(true);
      expect(resolved.sources).toEqual({ provider: 'config', project: 'config' });
    });
  });
});
