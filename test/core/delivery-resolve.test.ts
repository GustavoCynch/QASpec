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

  it('upgrades commands-only to both when upstream opsx commands exist', async () => {
    const commandsDir = path.join(testDir, '.cursor', 'commands');
    await fs.mkdir(commandsDir, { recursive: true });
    await fs.writeFile(path.join(commandsDir, 'opsx-explore.md'), 'upstream');

    const delivery = await resolveEffectiveDelivery(
      testDir,
      'commands',
      ['explore', 'analyze', 'cases', 'publish', 'archive'],
      ['cursor']
    );

    expect(delivery).toBe('both');
  });

  it('keeps commands-only when no upstream signals are present', async () => {
    const delivery = await resolveEffectiveDelivery(
      testDir,
      'commands',
      ['explore', 'analyze', 'cases', 'publish', 'archive'],
      ['cursor']
    );
    expect(delivery).toBe('commands');
  });

  it('keeps commands-only on greenfield when no workflows are configured', async () => {
    const delivery = await resolveEffectiveDelivery(testDir, 'commands', [], ['cursor']);
    expect(delivery).toBe('commands');
  });

  it('keeps skills-only delivery unchanged', async () => {
    const delivery = await resolveEffectiveDelivery(testDir, 'skills', ['explore'], ['cursor']);
    expect(delivery).toBe('skills');
  });
});
