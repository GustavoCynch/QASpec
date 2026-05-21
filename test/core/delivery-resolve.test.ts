import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { resolveEffectiveDelivery } from '../../src/core/delivery-resolve.js';

describe('resolveEffectiveDelivery', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `delivery-resolve-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('upgrades commands-only to both when upstream openspec skills exist (all legacy templates present)', async () => {
    const skillsDir = path.join(testDir, '.cursor', 'skills');
    for (const dirName of ['openspec-explore', 'openspec-propose', 'openspec-apply-change']) {
      await fs.mkdir(path.join(skillsDir, dirName), { recursive: true });
      await fs.writeFile(path.join(skillsDir, dirName, 'SKILL.md'), 'existing');
    }

    const delivery = await resolveEffectiveDelivery(
      testDir,
      'commands',
      ['explore', 'propose', 'apply'],
      ['cursor']
    );

    expect(delivery).toBe('both');
  });

  it('upgrades commands-only to both when qas-* skills are missing beside upstream openspec', async () => {
    const skillsDir = path.join(testDir, '.cursor', 'skills');
    await fs.mkdir(path.join(skillsDir, 'openspec-explore'), { recursive: true });
    await fs.writeFile(path.join(skillsDir, 'openspec-explore', 'SKILL.md'), 'existing');

    const delivery = await resolveEffectiveDelivery(
      testDir,
      'commands',
      ['explore', 'analyze', 'matrix', 'publish', 'archive'],
      ['cursor']
    );

    expect(delivery).toBe('both');
  });

  it('keeps commands-only on greenfield when no upstream signals and no skill templates', async () => {
    const delivery = await resolveEffectiveDelivery(testDir, 'commands', [], ['cursor']);
    expect(delivery).toBe('commands');
  });

  it('upgrades to both when skill templates are missing and no upstream', async () => {
    const delivery = await resolveEffectiveDelivery(
      testDir,
      'commands',
      ['explore', 'propose'],
      ['cursor']
    );
    expect(delivery).toBe('both');
  });
});
