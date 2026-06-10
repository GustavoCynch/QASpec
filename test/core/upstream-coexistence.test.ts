import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  shouldSkipUpstreamSkillWrite,
  shouldSkipUpstreamCommandWrite,
  formatUpstreamCoexistenceSummary,
} from '../../src/core/upstream-coexistence.js';

describe('upstream-coexistence per-file skip', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `upstream-coexistence-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('skips write for existing upstream openspec-propose skill', async () => {
    const skillFile = path.join(testDir, 'openspec-propose', 'SKILL.md');
    await fs.mkdir(path.dirname(skillFile), { recursive: true });
    await fs.writeFile(skillFile, 'existing');

    expect(await shouldSkipUpstreamSkillWrite(skillFile, 'openspec-propose', true)).toBe(true);
  });

  it('allows write for missing upstream openspec-apply-change skill', async () => {
    const skillFile = path.join(testDir, 'openspec-apply-change', 'SKILL.md');
    expect(await shouldSkipUpstreamSkillWrite(skillFile, 'openspec-apply-change', true)).toBe(false);
  });

  it('always writes qaspec-* skills even when upstream is active', async () => {
    const skillFile = path.join(testDir, 'qaspec-analyze', 'SKILL.md');
    await fs.mkdir(path.dirname(skillFile), { recursive: true });
    await fs.writeFile(skillFile, 'existing');
    expect(await shouldSkipUpstreamSkillWrite(skillFile, 'qaspec-analyze', true)).toBe(false);
  });

  it('skips write for existing opsx-propose command', async () => {
    const commandFile = path.join(testDir, 'opsx-propose.md');
    await fs.writeFile(commandFile, 'existing');
    expect(await shouldSkipUpstreamCommandWrite(commandFile, 'propose', true)).toBe(true);
  });

  it('allows write for missing opsx-apply command', async () => {
    const commandFile = path.join(testDir, 'opsx-apply.md');
    expect(await shouldSkipUpstreamCommandWrite(commandFile, 'apply', true)).toBe(false);
  });

  it('formats coexistence summary when items were preserved', () => {
    expect(formatUpstreamCoexistenceSummary(2, 1)).toContain('preserved');
    expect(formatUpstreamCoexistenceSummary(0, 0)).toBe('');
  });
});
