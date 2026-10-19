import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { InitCommand } from '../../src/core/init.js';
import { AI_TOOLS } from '../../src/core/config.js';
import { CommandAdapterRegistry } from '../../src/core/command-generation/index.js';
import { getToolsWithSkillsDir } from '../../src/core/shared/tool-detection.js';
import { qaspecSkillDirName } from '../../src/core/qaspec-commands.js';
import { PLAYWRIGHT_MCP_PACKAGE } from '../../src/core/execution-mcp.js';
import {
  getQasExecuteSkillTemplate,
  getQasExecuteCommandTemplate,
} from '../../src/core/templates/skill-templates.js';

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

/** Adopter-specific values that must never reach the generic core (S1). */
const ADOPTER_DENYLIST = /cynch|orderstorm|wsservice/i;

/** Every `qaspec execute` step of the run lifecycle that the workflow drives (L26, step 2 to 7). */
const CLI_STEPS = [
  'qaspec execute login',
  'qaspec execute start --change',
  'qaspec execute confirm --run',
  'qaspec execute plan --run',
  'qaspec execute record --run',
  'qaspec execute finish --run',
  'qaspec execute triage-context --run',
  'qaspec execute triage --run',
  'qaspec execute answer --run',
  'qaspec execute status --run',
  'qaspec execute results --run',
  'qaspec execute results-gate --run',
  'qaspec execute tcms-map --run',
];

describe('/qsx:execute workflow template', () => {
  let body: string;

  beforeEach(() => {
    body = getQasExecuteSkillTemplate().instructions;
  });

  it('uses the same body for the skill and the command', () => {
    expect(getQasExecuteCommandTemplate().content).toBe(body);
  });

  it('is named like the other QASpec workflows', () => {
    expect(getQasExecuteSkillTemplate().name).toBe('qaspec-execute');
    expect(getQasExecuteCommandTemplate().name).toBe('QAS: Execute');
  });

  it('names every CLI step of the run lifecycle', () => {
    for (const step of CLI_STEPS) {
      expect(body, step).toContain(step);
    }
  });

  it('checks the preconditions: approved cases, the browser server, and a judge subagent', () => {
    expect(body).toMatch(/approved/i);
    expect(body).toContain('qaspec-playwright');
    expect(body).toContain('qaspec update');
    expect(body).toMatch(/add it by hand to their agent tool's MCP configuration/);
    expect(body).toMatch(/cannot launch a subagent/i);
  });

  it('stores each plan before the case runs and never changes a stored plan', () => {
    expect(body).toMatch(/before the case runs/i);
    expect(body).toMatch(/never edit a stored plan/i);
    expect(body).toMatch(/never change an Expected/i);
  });

  it('drives the browser only through the qaspec-playwright server and never edits application source', () => {
    expect(body).toMatch(/only through the `qaspec-playwright`/i);
    expect(body).toMatch(/never edit the application/i);
    expect(body).toContain('qaspec/config.yaml');
    expect(body).toMatch(/read-only/i);
  });

  it('runs the control case at the start and at the end around every planned case', () => {
    expect(body).toMatch(/control case at the start/i);
    expect(body).toMatch(/control case at the end/i);
  });

  it('retries a failed case once from a clean state and tags test data with the run data tag', () => {
    expect(body).toMatch(/clean state/i);
    expect(body).toContain('dataTag');
    expect(body).toMatch(/Put the `<dataTag>` into every record you create/);
    expect(body).toMatch(/evidence\/<case>-<attempt>\//);
  });

  it('reads record JSON regardless of exit code and tells the judge where evidence paths start', () => {
    expect(body).toMatch(/`retry`, `needs-human` and `needs-triage` exit 1 by design/);
    expect(body).toMatch(/evidence paths in the judge input are relative to `<runDir>`/i);
  });

  it('gives the manual MCP setup inline instead of pointing at a repository docs path', () => {
    expect(body).not.toContain('docs/cli.md');
    expect(body).toContain(PLAYWRIGHT_MCP_PACKAGE);
  });

  it('judges each needs-triage case in a fresh subagent that did not drive the browser', () => {
    expect(body).toMatch(/fresh/i);
    expect(body).toMatch(/did not drive the browser/i);
    expect(body).toMatch(/`agent`/);
    expect(body).toMatch(/`environment`/);
    expect(body).toMatch(/`app`/);
  });

  it('stops with a clear message when no judge subagent can be launched and never judges in the browsing context', () => {
    expect(body).toMatch(/stop with a clear message/i);
    expect(body).toMatch(/never judge in the browsing context/i);
  });

  it('stops before triage when the run finishes as environment-noise', () => {
    expect(body).toMatch(/environment-noise/);
    expect(body).toMatch(/no findings/i);
  });

  it('reports each finding as a sense-check question and each needs-human step for the user to judge', () => {
    expect(body).toMatch(/Is this intended/);
    expect(body).toMatch(/needs-human/);
  });

  it('halts once before any TCMS write, citing the gate token, then matches results by exact title', () => {
    expect(body).toMatch(/gate token/i);
    expect(body).toMatch(/exact title/i);
    expect(body).toMatch(/omit/i);
    expect(body).toMatch(/PII/);
  });

  it('keeps the wording provider-neutral and free of adopter-specific values', () => {
    expect(body).not.toMatch(/qase/i);
    expect(body).not.toMatch(/testrail|xray|zephyr|testlink/i);
    expect(body).not.toMatch(ADOPTER_DENYLIST);
    expect(getQasExecuteCommandTemplate().content).not.toMatch(ADOPTER_DENYLIST);
  });
});

describe('/qsx:execute generated files', () => {
  let testDir: string;
  let configTempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-execute-workflow-'));
    originalEnv = { ...process.env };
    configTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-execute-config-'));
    process.env.XDG_CONFIG_HOME = configTempDir;
    // The Codex adapter writes global prompts; keep them out of the real home directory.
    process.env.CODEX_HOME = path.join(configTempDir, 'codex');
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

  it('writes no adopter-specific value into any generated execute file or the config seed for every tool', async () => {
    await new InitCommand({ tools: 'all', force: true }).execute(testDir);

    const toolIds = getToolsWithSkillsDir();
    expect(toolIds.length).toBeGreaterThan(0);

    const executeFiles: string[] = [];
    for (const toolId of toolIds) {
      const tool = AI_TOOLS.find((t) => t.value === toolId);
      if (tool?.skillsDir) {
        executeFiles.push(
          path.join(testDir, tool.skillsDir, 'skills', qaspecSkillDirName('execute'), 'SKILL.md')
        );
      }
      const adapter = CommandAdapterRegistry.get(toolId);
      if (adapter) {
        const commandPath = adapter.getFilePath('execute');
        executeFiles.push(path.isAbsolute(commandPath) ? commandPath : path.join(testDir, commandPath));
      }
    }

    expect(executeFiles.length).toBeGreaterThan(0);
    for (const file of executeFiles) {
      const content = await fs.readFile(file, 'utf-8');
      expect(content, file).toMatch(/qaspec execute/);
      expect(content, file).not.toMatch(ADOPTER_DENYLIST);
    }

    const config = await fs.readFile(path.join(testDir, 'qaspec', 'config.yaml'), 'utf-8');
    expect(config).not.toMatch(ADOPTER_DENYLIST);
  });
});
