import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { InitCommand } from '../../src/core/init.js';
import { saveGlobalConfig, getGlobalConfig } from '../../src/core/global-config.js';

const { confirmMock, showWelcomeScreenMock, searchableMultiSelectMock } = vi.hoisted(() => ({
  confirmMock: vi.fn(),
  showWelcomeScreenMock: vi.fn().mockResolvedValue(undefined),
  searchableMultiSelectMock: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({
  confirm: confirmMock,
}));

vi.mock('../../src/ui/welcome-screen.js', () => ({
  showWelcomeScreen: showWelcomeScreenMock,
}));

vi.mock('../../src/prompts/searchable-multi-select.js', () => ({
  searchableMultiSelect: searchableMultiSelectMock,
}));

describe('InitCommand', () => {
  let testDir: string;
  let configTempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `openspec-init-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    originalEnv = { ...process.env };
    // Use a temp dir for global config to avoid reading real config
    configTempDir = path.join(os.tmpdir(), `openspec-config-init-${Date.now()}`);
    await fs.mkdir(configTempDir, { recursive: true });
    process.env.XDG_CONFIG_HOME = configTempDir;

    // Mock console.log to suppress output during tests
    vi.spyOn(console, 'log').mockImplementation(() => { });
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(true);
    showWelcomeScreenMock.mockClear();
    searchableMultiSelectMock.mockReset();
  });

  afterEach(async () => {
    process.env = originalEnv;
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(configTempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('execute with --tools flag', () => {
    it('should create QASpec directory structure', async () => {
      const initCommand = new InitCommand({ tools: 'claude', force: true });

      await initCommand.execute(testDir);

      const openspecPath = path.join(testDir, 'qaspec');
      expect(await directoryExists(openspecPath)).toBe(true);
      expect(await directoryExists(path.join(openspecPath, 'specs'))).toBe(true);
      expect(await directoryExists(path.join(openspecPath, 'changes'))).toBe(true);
      expect(await directoryExists(path.join(openspecPath, 'changes', 'archive'))).toBe(true);
    });

    it('should create config.yaml with default schema', async () => {
      const initCommand = new InitCommand({ tools: 'claude', force: true });

      await initCommand.execute(testDir);

      const configPath = path.join(testDir, 'qaspec', 'config.yaml');
      expect(await fileExists(configPath)).toBe(true);

      const content = await fs.readFile(configPath, 'utf-8');
      expect(content).toContain('schema: qaspec-pr-review');
      expect(content).toContain('Language: (edit');
      expect(content).toContain('Stack: (edit');
      expect(content).toContain('Domain: (edit');
      expect(content).toContain('read-only');
      expect(content).toContain('rules:');
      expect(content).toContain('analyze:');
    });

    it('should create core profile skills for Claude Code by default', async () => {
      const initCommand = new InitCommand({ tools: 'claude', force: true });

      await initCommand.execute(testDir);

      // Core profile: explore, analyze, matrix, publish, archive
      const coreSkillNames = [
        'qas-explore',
        'qas-analyze',
        'qas-matrix',
        'qas-publish',
        'qas-archive',
      ];

      for (const skillName of coreSkillNames) {
        const skillFile = path.join(testDir, '.claude', 'skills', skillName, 'SKILL.md');
        expect(await fileExists(skillFile)).toBe(true);

        const content = await fs.readFile(skillFile, 'utf-8');
        expect(content).toContain('---');
        expect(content).toContain('name:');
        expect(content).toContain('description:');
      }

      // Non-core skills should NOT be created
      const nonCoreSkillNames = [
        'openspec-new-change',
        'openspec-continue-change',
        'openspec-ff-change',
        'openspec-bulk-archive-change',
        'openspec-verify-change',
      ];

      for (const skillName of nonCoreSkillNames) {
        const skillFile = path.join(testDir, '.claude', 'skills', skillName, 'SKILL.md');
        expect(await fileExists(skillFile)).toBe(false);
      }
    });

    it('should create core profile commands for Claude Code by default', async () => {
      const initCommand = new InitCommand({ tools: 'claude', force: true });

      await initCommand.execute(testDir);

      // Core profile: explore, analyze, matrix, publish, archive
      const coreCommandNames = [
        'qas/explore.md',
        'qas/analyze.md',
        'qas/matrix.md',
        'qas/publish.md',
        'qas/archive.md',
      ];

      for (const cmdName of coreCommandNames) {
        const cmdFile = path.join(testDir, '.claude', 'commands', cmdName);
        expect(await fileExists(cmdFile)).toBe(true);
      }

      // Non-core commands should NOT be created
      const nonCoreCommandNames = [
        'qas/new.md',
        'qas/continue.md',
        'qas/ff.md',
        'qas/bulk-archive.md',
        'qas/verify.md',
      ];

      for (const cmdName of nonCoreCommandNames) {
        const cmdFile = path.join(testDir, '.claude', 'commands', cmdName);
        expect(await fileExists(cmdFile)).toBe(false);
      }
    });

    it('migrates legacy global custom profile and installs qas-publish', async () => {
      saveGlobalConfig({
        featureFlags: {},
        profile: 'custom',
        delivery: 'both',
        workflows: ['propose', 'explore', 'apply', 'archive'],
      });

      const initCommand = new InitCommand({ tools: 'cursor', force: true });
      await initCommand.execute(testDir);

      expect(getGlobalConfig().profile).toBe('core');

      const publishSkill = path.join(testDir, '.cursor', 'skills', 'qas-publish', 'SKILL.md');
      const publishCommand = path.join(testDir, '.cursor', 'commands', 'qas-publish.md');
      expect(await fileExists(publishSkill)).toBe(true);
      expect(await fileExists(publishCommand)).toBe(true);

      const logCalls = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .flat()
        .map(String);
      expect(logCalls.some((entry) => entry.includes('/qas:publish'))).toBe(true);
    });

    it('should not generate opsx-propose command for Cursor on fresh init', async () => {
      const initCommand = new InitCommand({ tools: 'cursor', force: true });
      await initCommand.execute(testDir);

      expect(await fileExists(path.join(testDir, '.cursor', 'commands', 'qas-analyze.md'))).toBe(true);
      expect(await fileExists(path.join(testDir, '.cursor', 'commands', 'opsx-propose.md'))).toBe(false);
    });

    it('should create skills in Cursor skills directory', async () => {
      const initCommand = new InitCommand({ tools: 'cursor', force: true });

      await initCommand.execute(testDir);

      const skillFile = path.join(testDir, '.cursor', 'skills', 'qas-explore', 'SKILL.md');
      expect(await fileExists(skillFile)).toBe(true);
    });

    it('should create skills in Windsurf skills directory', async () => {
      const initCommand = new InitCommand({ tools: 'windsurf', force: true });

      await initCommand.execute(testDir);

      const skillFile = path.join(testDir, '.windsurf', 'skills', 'qas-explore', 'SKILL.md');
      expect(await fileExists(skillFile)).toBe(true);
    });

    it('should support Kimi CLI as an adapterless skills-only tool', async () => {
      saveGlobalConfig({
        featureFlags: {},
        profile: 'core',
        delivery: 'both',
      });

      const initCommand = new InitCommand({ tools: 'kimi', force: true });
      await initCommand.execute(testDir);

      const skillFile = path.join(testDir, '.kimi', 'skills', 'qas-explore', 'SKILL.md');
      expect(await fileExists(skillFile)).toBe(true);

      const commandsDir = path.join(testDir, '.kimi', 'commands');
      expect(await directoryExists(commandsDir)).toBe(false);

      const logCalls = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls.flat().map(String);
      expect(
        logCalls.some(
          (entry) => entry.includes('Commands skipped for: kimi') && entry.includes('(no adapter)'),
        ),
      ).toBe(true);
    });

    it('should create skills for multiple tools at once', async () => {
      const initCommand = new InitCommand({ tools: 'claude,cursor', force: true });

      await initCommand.execute(testDir);

      const claudeSkill = path.join(testDir, '.claude', 'skills', 'qas-explore', 'SKILL.md');
      const cursorSkill = path.join(testDir, '.cursor', 'skills', 'qas-explore', 'SKILL.md');

      expect(await fileExists(claudeSkill)).toBe(true);
      expect(await fileExists(cursorSkill)).toBe(true);
    });

    it('should select all tools with --tools all option', async () => {
      const initCommand = new InitCommand({ tools: 'all', force: true });

      await initCommand.execute(testDir);

      // Check a few representative tools
      const claudeSkill = path.join(testDir, '.claude', 'skills', 'qas-explore', 'SKILL.md');
      const cursorSkill = path.join(testDir, '.cursor', 'skills', 'qas-explore', 'SKILL.md');
      const windsurfSkill = path.join(testDir, '.windsurf', 'skills', 'qas-explore', 'SKILL.md');

      expect(await fileExists(claudeSkill)).toBe(true);
      expect(await fileExists(cursorSkill)).toBe(true);
      expect(await fileExists(windsurfSkill)).toBe(true);
    });

    it('should skip tool configuration with --tools none option', async () => {
      const initCommand = new InitCommand({ tools: 'none', force: true });

      await initCommand.execute(testDir);

      // Should create OpenSpec structure but no skills
      const openspecPath = path.join(testDir, 'qaspec');
      expect(await directoryExists(openspecPath)).toBe(true);

      // No tool-specific directories should be created
      const claudeSkillsDir = path.join(testDir, '.claude', 'skills');
      expect(await directoryExists(claudeSkillsDir)).toBe(false);
    });

    it('should throw error for invalid tool names', async () => {
      const initCommand = new InitCommand({ tools: 'invalid-tool', force: true });

      await expect(initCommand.execute(testDir)).rejects.toThrow(/Invalid tool\(s\): invalid-tool/);
    });

    it('should handle comma-separated tool names with spaces', async () => {
      const initCommand = new InitCommand({ tools: 'claude, cursor', force: true });

      await initCommand.execute(testDir);

      const claudeSkill = path.join(testDir, '.claude', 'skills', 'qas-explore', 'SKILL.md');
      const cursorSkill = path.join(testDir, '.cursor', 'skills', 'qas-explore', 'SKILL.md');

      expect(await fileExists(claudeSkill)).toBe(true);
      expect(await fileExists(cursorSkill)).toBe(true);
    });

    it('should reject combining reserved keywords with explicit tool ids', async () => {
      const initCommand = new InitCommand({ tools: 'all,claude', force: true });

      await expect(initCommand.execute(testDir)).rejects.toThrow(
        /Cannot combine reserved values "all" or "none" with specific tool IDs/
      );
    });

    it('should not create config.yaml if it already exists', async () => {
      // Pre-create config.yaml
      const openspecDir = path.join(testDir, 'qaspec');
      await fs.mkdir(openspecDir, { recursive: true });
      const configPath = path.join(openspecDir, 'config.yaml');
      const existingContent = 'schema: custom-schema\n';
      await fs.writeFile(configPath, existingContent);

      const initCommand = new InitCommand({ tools: 'claude', force: true });
      await initCommand.execute(testDir);

      const content = await fs.readFile(configPath, 'utf-8');
      expect(content).toBe(existingContent);
    });

    it('should handle non-existent target directory', async () => {
      const newDir = path.join(testDir, 'new-project');
      const initCommand = new InitCommand({ tools: 'claude', force: true });

      await initCommand.execute(newDir);

      const openspecPath = path.join(newDir, 'qaspec');
      expect(await directoryExists(openspecPath)).toBe(true);
    });

    it('should work in extend mode (re-running init)', async () => {
      const initCommand1 = new InitCommand({ tools: 'claude', force: true });
      await initCommand1.execute(testDir);

      // Run init again with a different tool
      const initCommand2 = new InitCommand({ tools: 'cursor', force: true });
      await initCommand2.execute(testDir);

      // Both tools should have skills
      const claudeSkill = path.join(testDir, '.claude', 'skills', 'qas-explore', 'SKILL.md');
      const cursorSkill = path.join(testDir, '.cursor', 'skills', 'qas-explore', 'SKILL.md');

      expect(await fileExists(claudeSkill)).toBe(true);
      expect(await fileExists(cursorSkill)).toBe(true);
    });

    it('should refresh skills on re-run for the same tool', async () => {
      const initCommand1 = new InitCommand({ tools: 'claude', force: true });
      await initCommand1.execute(testDir);

      const skillFile = path.join(testDir, '.claude', 'skills', 'qas-explore', 'SKILL.md');
      const originalContent = await fs.readFile(skillFile, 'utf-8');

      // Modify the file
      await fs.writeFile(skillFile, '# Modified content\n');

      // Run init again
      const initCommand2 = new InitCommand({ tools: 'claude', force: true });
      await initCommand2.execute(testDir);

      const newContent = await fs.readFile(skillFile, 'utf-8');
      expect(newContent).toBe(originalContent);
    });
  });

  describe('skill content validation', () => {
    it('should generate valid SKILL.md with YAML frontmatter', async () => {
      const initCommand = new InitCommand({ tools: 'claude', force: true });
      await initCommand.execute(testDir);

      const skillFile = path.join(testDir, '.claude', 'skills', 'qas-explore', 'SKILL.md');
      const content = await fs.readFile(skillFile, 'utf-8');

      // Should have YAML frontmatter
      expect(content).toMatch(/^---\n/);
      expect(content).toContain('name: qas-explore');
      expect(content).toContain('description:');
      expect(content).toContain('license:');
      expect(content).toContain('compatibility:');
      expect(content).toContain('metadata:');
      expect(content).toMatch(/---\n\n/); // End of frontmatter
    });

    it('should include explore mode instructions', async () => {
      const initCommand = new InitCommand({ tools: 'claude', force: true });
      await initCommand.execute(testDir);

      const skillFile = path.join(testDir, '.claude', 'skills', 'qas-explore', 'SKILL.md');
      const content = await fs.readFile(skillFile, 'utf-8');

      expect(content).toContain('QASpec explore mode');
    });

    it('should include analyze skill instructions', async () => {
      const initCommand = new InitCommand({ tools: 'claude', force: true });
      await initCommand.execute(testDir);

      const skillFile = path.join(testDir, '.claude', 'skills', 'qas-analyze', 'SKILL.md');
      const content = await fs.readFile(skillFile, 'utf-8');

      expect(content).toContain('name: qas-analyze');
      expect(content).toContain('analisis.md');
      expect(content).toContain('instructions analyze');
      expect(content).toContain('historical_bugs.md');
      expect(content).toContain('parallel blind Task');
      expect(content).toContain('**do NOT** copy');
    });

    it('should include publish skill instructions', async () => {
      const initCommand = new InitCommand({ tools: 'claude', force: true });
      await initCommand.execute(testDir);

      const skillFile = path.join(testDir, '.claude', 'skills', 'qas-publish', 'SKILL.md');
      const content = await fs.readFile(skillFile, 'utf-8');

      expect(content).toContain('name: qas-publish');
      expect(content).toContain('Qase');
    });

    it('should embed generatedBy version in skill files', async () => {
      const initCommand = new InitCommand({ tools: 'claude', force: true });
      await initCommand.execute(testDir);

      const skillFile = path.join(testDir, '.claude', 'skills', 'qas-explore', 'SKILL.md');
      const content = await fs.readFile(skillFile, 'utf-8');

      // Should contain generatedBy field with a version string
      expect(content).toMatch(/generatedBy:\s*["']?\d+\.\d+\.\d+["']?/);
    });
  });

  describe('command generation', () => {
    it('should generate Claude Code commands with correct format', async () => {
      const initCommand = new InitCommand({ tools: 'claude', force: true });
      await initCommand.execute(testDir);

      const cmdFile = path.join(testDir, '.claude', 'commands', 'qas', 'explore.md');
      const content = await fs.readFile(cmdFile, 'utf-8');

      // Claude commands use YAML frontmatter
      expect(content).toMatch(/^---\n/);
      expect(content).toContain('name:');
      expect(content).toContain('description:');
    });

    it('should generate Cursor commands with correct format', async () => {
      const initCommand = new InitCommand({ tools: 'cursor', force: true });
      await initCommand.execute(testDir);

      const cmdFile = path.join(testDir, '.cursor', 'commands', 'qas-explore.md');
      expect(await fileExists(cmdFile)).toBe(true);

      const content = await fs.readFile(cmdFile, 'utf-8');
      expect(content).toMatch(/^---\n/);
    });
  });

  describe('error handling', () => {
    it('should provide helpful error for insufficient permissions', async () => {
      // Mock the permission check to fail
      const readOnlyDir = path.join(testDir, 'readonly');
      await fs.mkdir(readOnlyDir);

      const originalWriteFile = fs.writeFile;
      vi.spyOn(fs, 'writeFile').mockImplementation(
        async (filePath: any, ...args: any[]) => {
          if (
            typeof filePath === 'string' &&
            filePath.includes('.openspec-test-')
          ) {
            throw new Error('EACCES: permission denied');
          }
          return originalWriteFile.call(fs, filePath, ...args);
        }
      );

      const initCommand = new InitCommand({ tools: 'claude', force: true });
      await expect(initCommand.execute(readOnlyDir)).rejects.toThrow(/Insufficient permissions/);
    });

    it('should throw error in non-interactive mode without --tools flag and no detected tools', async () => {
      const initCommand = new InitCommand({ interactive: false });

      await expect(initCommand.execute(testDir)).rejects.toThrow(/No tools detected and no --tools flag/);
    });
  });

  describe('tool-specific adapters', () => {
    it('should generate Gemini CLI commands as TOML files', async () => {
      const initCommand = new InitCommand({ tools: 'gemini', force: true });
      await initCommand.execute(testDir);

      const cmdFile = path.join(testDir, '.gemini', 'commands', 'qas', 'explore.toml');
      expect(await fileExists(cmdFile)).toBe(true);

      const content = await fs.readFile(cmdFile, 'utf-8');
      expect(content).toContain('description =');
      expect(content).toContain('prompt =');
    });

    it('should generate Windsurf commands', async () => {
      const initCommand = new InitCommand({ tools: 'windsurf', force: true });
      await initCommand.execute(testDir);

      const cmdFile = path.join(testDir, '.windsurf', 'workflows', 'qas-explore.md');
      expect(await fileExists(cmdFile)).toBe(true);
    });

    it('should generate Continue prompt files', async () => {
      const initCommand = new InitCommand({ tools: 'continue', force: true });
      await initCommand.execute(testDir);

      const cmdFile = path.join(testDir, '.continue', 'prompts', 'qas-explore.prompt');
      expect(await fileExists(cmdFile)).toBe(true);

      const content = await fs.readFile(cmdFile, 'utf-8');
      expect(content).toContain('name: qas-explore');
      expect(content).toContain('invokable: true');
    });

    it('should generate Cline workflow files', async () => {
      const initCommand = new InitCommand({ tools: 'cline', force: true });
      await initCommand.execute(testDir);

      const cmdFile = path.join(testDir, '.clinerules', 'workflows', 'qas-explore.md');
      expect(await fileExists(cmdFile)).toBe(true);
    });

    it('should generate GitHub Copilot prompt files', async () => {
      const initCommand = new InitCommand({ tools: 'github-copilot', force: true });
      await initCommand.execute(testDir);

      const cmdFile = path.join(testDir, '.github', 'prompts', 'qas-explore.prompt.md');
      expect(await fileExists(cmdFile)).toBe(true);
    });
  });
});

describe('InitCommand - profile and detection features', () => {
  let testDir: string;
  let configTempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `openspec-init-profile-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    originalEnv = { ...process.env };
    // Use a temp dir for global config to avoid polluting real config
    configTempDir = path.join(os.tmpdir(), `openspec-config-test-${Date.now()}`);
    await fs.mkdir(configTempDir, { recursive: true });
    process.env.XDG_CONFIG_HOME = configTempDir;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(true);
    showWelcomeScreenMock.mockClear();
    searchableMultiSelectMock.mockReset();
  });

  afterEach(async () => {
    process.env = originalEnv;
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(configTempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should use --profile flag to override global config', async () => {
    // Set global config to custom profile
    saveGlobalConfig({
      featureFlags: {},
      profile: 'custom',
      delivery: 'both',
      workflows: ['explore', 'new', 'apply'],
    });

    // Override with --profile core
    const initCommand = new InitCommand({ tools: 'claude', force: true, profile: 'core' });
    await initCommand.execute(testDir);

    // Core profile skills should be created
    const analyzeSkill = path.join(testDir, '.claude', 'skills', 'qas-analyze', 'SKILL.md');
    expect(await fileExists(analyzeSkill)).toBe(true);

    // Non-core skills (from the custom profile) should NOT be created
    const newChangeSkill = path.join(testDir, '.claude', 'skills', 'openspec-new-change', 'SKILL.md');
    expect(await fileExists(newChangeSkill)).toBe(false);
  });

  it('should reject invalid --profile values', async () => {
    const initCommand = new InitCommand({
      tools: 'claude',
      force: true,
      profile: 'invalid-profile',
    });

    await expect(initCommand.execute(testDir)).rejects.toThrow(
      /Invalid profile "invalid-profile"/
    );
  });

  it('should use detected tools in non-interactive mode when no --tools flag', async () => {
    // Create a .claude directory to simulate detected tool
    await fs.mkdir(path.join(testDir, '.claude'), { recursive: true });

    const initCommand = new InitCommand({ interactive: false, force: true });
    await initCommand.execute(testDir);

    // Should have used claude (detected)
    const skillFile = path.join(testDir, '.claude', 'skills', 'qas-explore', 'SKILL.md');
    expect(await fileExists(skillFile)).toBe(true);
  });

  it('should auto-cleanup legacy artifacts in non-interactive mode without --force', async () => {
    // Create legacy OpenCode command files (singular 'command' path, pre-skill openspec-* format)
    const legacyDir = path.join(testDir, '.opencode', 'command');
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(path.join(legacyDir, 'openspec-propose.md'), 'legacy content');

    // Run init in non-interactive mode without --force
    const initCommand = new InitCommand({ tools: 'opencode' });
    await initCommand.execute(testDir);

    // Legacy files should be cleaned up automatically
    expect(await fileExists(path.join(legacyDir, 'openspec-propose.md'))).toBe(false);

    // New commands should be at the correct plural path
    const newCommandsDir = path.join(testDir, '.opencode', 'commands');
    expect(await directoryExists(newCommandsDir)).toBe(true);
  });

  it('should not cleanup upstream OpenSpec when openspec is already installed', async () => {
    await fs.mkdir(path.join(testDir, 'openspec'), { recursive: true });
    await fs.writeFile(path.join(testDir, 'openspec', 'config.yaml'), 'schema: spec-driven\n');
    await fs.writeFile(path.join(testDir, 'openspec', 'AGENTS.md'), '# OpenSpec agents\n');

    const cursorCommandsDir = path.join(testDir, '.cursor', 'commands');
    await fs.mkdir(cursorCommandsDir, { recursive: true });
    const opsxFiles = ['opsx-propose.md', 'opsx-apply.md', 'opsx-archive.md', 'opsx-explore.md'];
    for (const fileName of opsxFiles) {
      await fs.writeFile(path.join(cursorCommandsDir, fileName), 'upstream openspec');
    }

    const consoleLogSpy = vi.spyOn(console, 'log');
    const initCommand = new InitCommand({ tools: 'cursor' });
    await initCommand.execute(testDir);

    for (const fileName of opsxFiles) {
      expect(await fileExists(path.join(cursorCommandsDir, fileName))).toBe(true);
    }
    expect(await fileExists(path.join(testDir, 'openspec', 'AGENTS.md'))).toBe(true);

    const logCalls = consoleLogSpy.mock.calls.map((call) => String(call[0] ?? ''));
    expect(logCalls.some((line) => line.includes('Upgrading to the new QASpec'))).toBe(false);
    expect(logCalls.some((line) => line.includes('Cleaning up old QASpec setup'))).toBe(false);
    expect(confirmMock).not.toHaveBeenCalled();

    expect(await directoryExists(path.join(testDir, 'qaspec'))).toBe(true);
  });

  it('should not overwrite upstream openspec-propose and openspec-apply-change skills', async () => {
    const upstreamMarker = 'UPSTREAM_OPENSPEC_SKILL_CONTENT_DO_NOT_REPLACE';

    await fs.mkdir(path.join(testDir, 'openspec'), { recursive: true });
    await fs.writeFile(path.join(testDir, 'openspec', 'config.yaml'), 'schema: spec-driven\n');

    const cursorSkillsDir = path.join(testDir, '.cursor', 'skills');
    for (const skillName of ['openspec-propose', 'openspec-apply-change'] as const) {
      const skillDir = path.join(cursorSkillsDir, skillName);
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---\nname: ${skillName}\nmetadata:\n  author: openspec\n---\n\n${upstreamMarker}\n`
      );
    }

    saveGlobalConfig({
      featureFlags: {},
      profile: 'custom',
      delivery: 'both',
      workflows: ['explore', 'propose', 'apply'],
    });

    const initCommand = new InitCommand({ tools: 'cursor', force: true });
    await initCommand.execute(testDir);

    for (const skillName of ['openspec-propose', 'openspec-apply-change'] as const) {
      const content = await fs.readFile(
        path.join(cursorSkillsDir, skillName, 'SKILL.md'),
        'utf-8'
      );
      expect(content).toContain(upstreamMarker);
      expect(content).not.toContain('generatedBy:');
    }

    expect(await fileExists(path.join(cursorSkillsDir, 'qas-explore', 'SKILL.md'))).toBe(true);
    expect(await fileExists(path.join(cursorSkillsDir, 'qas-analyze', 'SKILL.md'))).toBe(true);
  });

  it('should create missing upstream openspec skills without overwriting existing ones', async () => {
    const existingMarker = 'EXISTING_OPENSPEC_PROPOSE_SKILL';
    const missingMarkerCheck = 'generatedBy:';

    await fs.mkdir(path.join(testDir, 'openspec'), { recursive: true });
    await fs.writeFile(path.join(testDir, 'openspec', 'config.yaml'), 'schema: spec-driven\n');

    const cursorSkillsDir = path.join(testDir, '.cursor', 'skills');
    const proposeDir = path.join(cursorSkillsDir, 'openspec-propose');
    await fs.mkdir(proposeDir, { recursive: true });
    await fs.writeFile(
      path.join(proposeDir, 'SKILL.md'),
      `---\nname: openspec-propose\n---\n\n${existingMarker}\n`
    );

    saveGlobalConfig({
      featureFlags: {},
      profile: 'custom',
      delivery: 'both',
      workflows: ['explore', 'propose', 'apply'],
    });

    const initCommand = new InitCommand({ tools: 'cursor', force: true });
    await initCommand.execute(testDir);

    const proposeContent = await fs.readFile(path.join(proposeDir, 'SKILL.md'), 'utf-8');
    expect(proposeContent).toContain(existingMarker);
    expect(proposeContent).not.toContain(missingMarkerCheck);

    const applyFile = path.join(cursorSkillsDir, 'openspec-apply-change', 'SKILL.md');
    expect(await fileExists(applyFile)).toBe(false);

    expect(await fileExists(path.join(cursorSkillsDir, 'qas-explore', 'SKILL.md'))).toBe(true);
  });

  it('should preselect configured tools but not directory-detected tools in extend mode', async () => {
    // Simulate existing OpenSpec project (extend mode).
    await fs.mkdir(path.join(testDir, 'qaspec'), { recursive: true });

    // Configured with OpenSpec
    const claudeSkillDir = path.join(testDir, '.claude', 'skills', 'qas-explore');
    await fs.mkdir(claudeSkillDir, { recursive: true });
    await fs.writeFile(path.join(claudeSkillDir, 'SKILL.md'), 'configured');

    // Directory detected only (not configured with OpenSpec)
    await fs.mkdir(path.join(testDir, '.github'), { recursive: true });
    await fs.writeFile(path.join(testDir, '.github', 'copilot-instructions.md'), '');

    searchableMultiSelectMock.mockResolvedValue(['claude']);

    const initCommand = new InitCommand({ force: true });
    vi.spyOn(initCommand as any, 'canPromptInteractively').mockReturnValue(true);

    await initCommand.execute(testDir);

    expect(searchableMultiSelectMock).toHaveBeenCalledTimes(1);
    const [{ choices }] = searchableMultiSelectMock.mock.calls[0] as [{ choices: Array<{ value: string; preSelected?: boolean; detected?: boolean }> }];

    const claude = choices.find((choice) => choice.value === 'claude');
    const githubCopilot = choices.find((choice) => choice.value === 'github-copilot');

    expect(claude?.preSelected).toBe(true);
    expect(githubCopilot?.preSelected).toBe(false);
    expect(githubCopilot?.detected).toBe(true);
  });

  it('should preselect detected tools for first-time interactive setup', async () => {
    // First-time init: no openspec/ directory and no configured OpenSpec skills.
    await fs.mkdir(path.join(testDir, '.github'), { recursive: true });
    await fs.writeFile(path.join(testDir, '.github', 'copilot-instructions.md'), '');

    searchableMultiSelectMock.mockResolvedValue(['github-copilot']);

    const initCommand = new InitCommand({ force: true });
    vi.spyOn(initCommand as any, 'canPromptInteractively').mockReturnValue(true);

    await initCommand.execute(testDir);

    expect(searchableMultiSelectMock).toHaveBeenCalledTimes(1);
    const [{ choices }] = searchableMultiSelectMock.mock.calls[0] as [{ choices: Array<{ value: string; preSelected?: boolean }> }];
    const githubCopilot = choices.find((choice) => choice.value === 'github-copilot');

    expect(githubCopilot?.preSelected).toBe(true);
  });

  it('should respect custom profile from global config', async () => {
    saveGlobalConfig({
      featureFlags: {},
      profile: 'custom',
      delivery: 'both',
      workflows: ['explore', 'new'],
    });

    const initCommand = new InitCommand({ tools: 'claude', force: true });
    await initCommand.execute(testDir);

    const exploreSkill = path.join(testDir, '.claude', 'skills', 'qas-explore', 'SKILL.md');
    expect(await fileExists(exploreSkill)).toBe(true);

    const newChangeSkill = path.join(testDir, '.claude', 'skills', 'openspec-new-change', 'SKILL.md');
    expect(await fileExists(newChangeSkill)).toBe(false);
  });

  it('should migrate commands-only extend mode without injecting extra workflows', async () => {
    await fs.mkdir(path.join(testDir, 'qaspec'), { recursive: true });
    await fs.mkdir(path.join(testDir, '.claude', 'commands', 'qas'), { recursive: true });
    await fs.writeFile(path.join(testDir, '.claude', 'commands', 'qas', 'explore.md'), '# explore\n');

    const initCommand = new InitCommand({ tools: 'claude', force: true });
    await initCommand.execute(testDir);

    const config = getGlobalConfig();
    expect(config.delivery).toBe('commands');
    expect(config.workflows).toEqual(['explore']);

    const exploreCommand = path.join(testDir, '.claude', 'commands', 'qas', 'explore.md');
    const proposeCommand = path.join(testDir, '.claude', 'commands', 'qas', 'propose.md');
    expect(await fileExists(exploreCommand)).toBe(true);
    expect(await fileExists(proposeCommand)).toBe(false);

    const exploreSkill = path.join(testDir, '.claude', 'skills', 'qas-explore', 'SKILL.md');
    const proposeSkill = path.join(testDir, '.claude', 'skills', 'openspec-propose', 'SKILL.md');
    expect(await fileExists(exploreSkill)).toBe(false);
    expect(await fileExists(proposeSkill)).toBe(false);
  });

  it('should not prompt for confirmation when applying custom profile in interactive init', async () => {
    saveGlobalConfig({
      featureFlags: {},
      profile: 'custom',
      delivery: 'both',
      workflows: ['explore', 'new'],
    });

    const initCommand = new InitCommand({ force: true });
    vi.spyOn(initCommand as any, 'canPromptInteractively').mockReturnValue(true);
    vi.spyOn(initCommand as any, 'getSelectedTools').mockResolvedValue(['claude']);

    await initCommand.execute(testDir);

    expect(showWelcomeScreenMock).toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();

    const exploreSkill = path.join(testDir, '.claude', 'skills', 'qas-explore', 'SKILL.md');
    expect(await fileExists(exploreSkill)).toBe(true);

    const logCalls = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls.flat().map(String);
    expect(logCalls.some((entry) => entry.includes('Applying custom profile'))).toBe(false);
  });

  it('should respect delivery=skills setting (no commands)', async () => {
    saveGlobalConfig({
      featureFlags: {},
      profile: 'core',
      delivery: 'skills',
    });

    const initCommand = new InitCommand({ tools: 'claude', force: true });
    await initCommand.execute(testDir);

    // Skills should exist
    const skillFile = path.join(testDir, '.claude', 'skills', 'qas-explore', 'SKILL.md');
    expect(await fileExists(skillFile)).toBe(true);

    // Commands should NOT exist
    const cmdFile = path.join(testDir, '.claude', 'commands', 'qas', 'explore.md');
    expect(await fileExists(cmdFile)).toBe(false);
  });

  it('should respect delivery=commands setting when no workflows are configured', async () => {
    saveGlobalConfig({
      featureFlags: {},
      profile: 'custom',
      delivery: 'commands',
      workflows: [],
    });

    const initCommand = new InitCommand({ tools: 'claude', force: true });
    await initCommand.execute(testDir);

    const skillFile = path.join(testDir, '.claude', 'skills', 'qas-explore', 'SKILL.md');
    expect(await fileExists(skillFile)).toBe(false);
  });

  it('should remove commands on re-init when delivery changes to skills', async () => {
    saveGlobalConfig({
      featureFlags: {},
      profile: 'core',
      delivery: 'both',
    });

    const initCommand1 = new InitCommand({ tools: 'claude', force: true });
    await initCommand1.execute(testDir);

    const cmdFile = path.join(testDir, '.claude', 'commands', 'qas', 'explore.md');
    expect(await fileExists(cmdFile)).toBe(true);

    saveGlobalConfig({
      featureFlags: {},
      profile: 'core',
      delivery: 'skills',
    });

    const initCommand2 = new InitCommand({ tools: 'claude', force: true });
    await initCommand2.execute(testDir);

    expect(await fileExists(cmdFile)).toBe(false);

    const skillFile = path.join(testDir, '.claude', 'skills', 'qas-explore', 'SKILL.md');
    expect(await fileExists(skillFile)).toBe(true);
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

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
