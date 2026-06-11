import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  resolvePlanningDirName,
  getPlanningDir,
  hasPlanningHome,
  QASPEC_DIR_NAME,
} from '../../src/core/planning-dir.js';
import { InitCommand } from '../../src/core/init.js';
import { vi } from 'vitest';

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../src/ui/welcome-screen.js', () => ({
  showWelcomeScreen: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/prompts/searchable-multi-select.js', () => ({
  searchableMultiSelect: vi.fn(),
}));

describe('planning-dir resolver', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `qaspec-planning-dir-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('always resolves qaspec as the planning home directory name', async () => {
    await fs.mkdir(path.join(testDir, QASPEC_DIR_NAME), { recursive: true });
    expect(resolvePlanningDirName(testDir)).toBe(QASPEC_DIR_NAME);
    expect(getPlanningDir(testDir)).toBe(path.join(testDir, QASPEC_DIR_NAME));
  });

  it('does not treat legacy openspec/ as the planning home', async () => {
    await fs.mkdir(path.join(testDir, 'openspec'), { recursive: true });
    expect(resolvePlanningDirName(testDir)).toBe(QASPEC_DIR_NAME);
    expect(getPlanningDir(testDir)).toBe(path.join(testDir, QASPEC_DIR_NAME));
    expect(hasPlanningHome(testDir)).toBe(false);
  });

  it('defaults to qaspec when neither directory exists', () => {
    expect(resolvePlanningDirName(testDir)).toBe(QASPEC_DIR_NAME);
    expect(hasPlanningHome(testDir)).toBe(false);
  });

  it('init creates qaspec planning home on greenfield', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const initCommand = new InitCommand({ tools: 'claude', force: true });
    await initCommand.execute(testDir);
    expect(await directoryExists(path.join(testDir, QASPEC_DIR_NAME))).toBe(true);
    expect(resolvePlanningDirName(testDir)).toBe(QASPEC_DIR_NAME);
  });
});

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
