import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { InitCommand } from '../../src/core/init.js';
import { saveGlobalConfig } from '../../src/core/global-config.js';

vi.mock('../../src/ui/welcome-screen.js', () => ({
  showWelcomeScreen: vi.fn().mockResolvedValue(undefined),
}));

describe('InitCommand upstream coexistence skills', () => {
  let testDir: string;
  let configHome: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `init-upstream-skills-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(path.join(testDir, 'qaspec'), { recursive: true });

    originalEnv = { ...process.env };
    configHome = path.join(os.tmpdir(), `init-upstream-config-${Date.now()}`);
    await fs.mkdir(configHome, { recursive: true });
    process.env.XDG_CONFIG_HOME = configHome;

    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    process.env = originalEnv;
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(configHome, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('installs qaspec-* skills when upstream opsx commands exist without creating openspec-* skills', async () => {
    saveGlobalConfig({
      featureFlags: {},
      profile: 'core',
      delivery: 'commands',
    });

    const cursorCommandsDir = path.join(testDir, '.cursor', 'commands');
    await fs.mkdir(cursorCommandsDir, { recursive: true });
    await fs.writeFile(path.join(cursorCommandsDir, 'opsx-explore.md'), 'opsx explore');
    await fs.writeFile(path.join(cursorCommandsDir, 'opsx-archive.md'), 'opsx archive');

    const cursorSkillsDir = path.join(testDir, '.cursor', 'skills');
    const exploreDir = path.join(cursorSkillsDir, 'openspec-explore');
    await fs.mkdir(exploreDir, { recursive: true });
    await fs.writeFile(path.join(exploreDir, 'SKILL.md'), '---\nname: openspec-explore\n---\n\nkeep\n');

    const initCommand = new InitCommand({ tools: 'cursor', force: true });
    await initCommand.execute(testDir);

    expect(await fs.readFile(path.join(exploreDir, 'SKILL.md'), 'utf-8')).toContain('keep');
    expect(await fileExists(path.join(cursorSkillsDir, 'openspec-propose', 'SKILL.md'))).toBe(false);
    expect(await fileExists(path.join(cursorSkillsDir, 'qaspec-analyze', 'SKILL.md'))).toBe(true);
    expect(await fileExists(path.join(cursorSkillsDir, 'qaspec-publish', 'SKILL.md'))).toBe(true);
  });

  it('creates qaspec-* skills when all upstream openspec-* skills exist (fork scenario)', async () => {
    saveGlobalConfig({
      featureFlags: {},
      profile: 'core',
      delivery: 'commands',
    });

    const cursorCommandsDir = path.join(testDir, '.cursor', 'commands');
    await fs.mkdir(cursorCommandsDir, { recursive: true });
    await fs.writeFile(path.join(cursorCommandsDir, 'opsx-explore.md'), 'upstream opsx');

    const cursorSkillsDir = path.join(testDir, '.cursor', 'skills');
    for (const dirName of [
      'openspec-explore',
      'openspec-archive-change',
      'openspec-propose',
      'openspec-apply-change',
    ]) {
      await fs.mkdir(path.join(cursorSkillsDir, dirName), { recursive: true });
      await fs.writeFile(
        path.join(cursorSkillsDir, dirName, 'SKILL.md'),
        `---\nname: ${dirName}\nmetadata:\n  author: openspec\n---\n\nupstream\n`
      );
    }

    const initCommand = new InitCommand({ tools: 'cursor', force: true });
    await initCommand.execute(testDir);

    for (const dirName of [
      'openspec-explore',
      'openspec-archive-change',
      'openspec-propose',
      'openspec-apply-change',
    ]) {
      const content = await fs.readFile(path.join(cursorSkillsDir, dirName, 'SKILL.md'), 'utf-8');
      expect(content).toContain('upstream');
      expect(content).not.toContain('generatedBy:');
    }

    expect(await fileExists(path.join(cursorSkillsDir, 'qaspec-analyze', 'SKILL.md'))).toBe(true);
    expect(await fileExists(path.join(cursorSkillsDir, 'qaspec-analyze', 'SKILL.md'))).toBe(true);
    expect(await fileExists(path.join(cursorSkillsDir, 'qaspec-cases', 'SKILL.md'))).toBe(true);
    expect(await fileExists(path.join(cursorSkillsDir, 'qaspec-publish', 'SKILL.md'))).toBe(true);
    expect(await fileExists(path.join(cursorSkillsDir, 'qaspec-archive', 'SKILL.md'))).toBe(true);
  });

  it('creates qaspec-* skills with custom legacy profile when all openspec-* exist', async () => {
    saveGlobalConfig({
      featureFlags: {},
      profile: 'custom',
      delivery: 'both',
      workflows: ['explore', 'propose', 'apply', 'archive'],
    });

    const cursorSkillsDir = path.join(testDir, '.cursor', 'skills');
    for (const dirName of [
      'openspec-explore',
      'openspec-archive-change',
      'openspec-propose',
      'openspec-apply-change',
    ]) {
      await fs.mkdir(path.join(cursorSkillsDir, dirName), { recursive: true });
      await fs.writeFile(
        path.join(cursorSkillsDir, dirName, 'SKILL.md'),
        `---\nname: ${dirName}\n---\n\nupstream\n`
      );
    }

    const initCommand = new InitCommand({ tools: 'cursor', force: true });
    await initCommand.execute(testDir);

    expect(await fileExists(path.join(cursorSkillsDir, 'qaspec-analyze', 'SKILL.md'))).toBe(true);
    expect(await fileExists(path.join(cursorSkillsDir, 'qaspec-analyze', 'SKILL.md'))).toBe(true);
    expect(await fileExists(path.join(cursorSkillsDir, 'qaspec-cases', 'SKILL.md'))).toBe(true);
    expect(await fileExists(path.join(cursorSkillsDir, 'qaspec-publish', 'SKILL.md'))).toBe(true);
    expect(await fileExists(path.join(cursorSkillsDir, 'qaspec-archive', 'SKILL.md'))).toBe(true);
  });
});

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
