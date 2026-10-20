import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { InitCommand } from '../../src/core/init.js';
import { AI_TOOLS } from '../../src/core/config.js';
import { CommandAdapterRegistry } from '../../src/core/command-generation/index.js';
import { getToolsWithSkillsDir } from '../../src/core/shared/tool-detection.js';
import { qaspecSkillDirName } from '../../src/core/qaspec-commands.js';
import {
  getQasCatchSkillTemplate,
  getQasCatchCommandTemplate,
} from '../../src/core/templates/skill-templates.js';
import { runCLI } from '../helpers/run-cli.js';

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

/** Adopter-specific values that must never reach the generic core (S1, odd/tasks/qsx-catch.md). */
const ADOPTER_DENYLIST = /cynch|orderstorm|wsservice/i;

/** Every lifecycle command the template runs, in the order the run needs them (design: odd/tasks/qsx-catch.md, L39). */
const LIFECYCLE = [
  'qaspec catch start --change',
  'qaspec catch context --run',
  'qaspec catch risk --run',
  'qaspec catch mutant --run',
  'qaspec catch equivalence --run',
  'qaspec catch test --run',
  'qaspec catch child --run',
  'qaspec catch assess --run',
  'qaspec catch judge --run',
  'qaspec catch report --run',
  'qaspec catch answer --run',
  'qaspec catch land --run',
  'qaspec catch landed --run',
  'qaspec catch finish --run',
];

/** Run states, mutant, test, child and assessor outcomes, and record names the template relies on (L46 names included). */
const STATES_AND_OUTCOMES = [
  'ready',
  'setup-failed',
  'child-setup-failed',
  'child-running',
  'child-failed',
  'classified',
  'assessed',
  'baseline-not-passing',
  'syntactic-equivalent',
  'no-build',
  'caught-by-existing',
  'surviving',
  'inconclusive',
  'judged-equivalent',
  'non-equivalent',
  'gated',
  'parent-not-passing',
  'flaky-parent',
  'not-caught-by-test',
  'land',
  'report',
  'signal',
  'discard',
  'kept',
  'rule-filtered',
  'judge-filtered',
  'unexpected-for-intent',
  'possibly-intended',
  'caughtBy',
  'setup-output.json',
];

/** The only flags a catch command line may carry: identifiers, file inputs and switches, never text. */
const ALLOWED_FLAGS = new Set([
  '--run',
  '--change',
  '--base',
  '--head',
  '--input',
  '--note-file',
  '--test',
  '--mutant',
  '--finding',
  '--intended',
  '--json',
  '--without-analysis',
]);
const SWITCH_FLAGS = new Set(['--json', '--without-analysis']);

/** A value is an id, a path or a placeholder: no free text (quoted or not). */
function isIdOrPathValue(value: string): boolean {
  return /^(<[^<>"]+>|[\w.\-/|])+$/.test(value.replace(/^"|"$/g, ''));
}

/** Every backticked `qaspec catch <subcommand> ...` invocation of a template body, with its arguments. */
function catchInvocations(body: string): RegExpMatchArray[] {
  return [...body.matchAll(/`qaspec catch ([a-z][a-z-]*)([^`]*)`/g)];
}

describe('/qsx:catch workflow template', () => {
  let body: string;

  beforeEach(() => {
    body = getQasCatchSkillTemplate().instructions;
  });

  it('uses the same body for the skill and the command', () => {
    expect(getQasCatchCommandTemplate().content).toBe(body);
  });

  it('is named like the other QASpec workflows', () => {
    expect(getQasCatchSkillTemplate().name).toBe('qaspec-catch');
    expect(getQasCatchCommandTemplate().name).toBe('QAS: Catch');
  });

  it('names every lifecycle command in code formatting, in the order the run needs them', () => {
    const positions = LIFECYCLE.map((command) => {
      const index = body.indexOf(`\`${command}`);
      expect(index, command).toBeGreaterThanOrEqual(0);
      return index;
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(body).toContain('`qaspec catch status --run');
    expect(body).toContain('`qaspec catch intent --change');
  });

  it('checks the preconditions: an approved analysis with an intent class and a head sha, or the explicit degraded mode', () => {
    expect(body).toMatch(/approved analysis/);
    expect(body).toContain('Intent class');
    expect(body).toContain('headSha');
    expect(body).toContain('--without-analysis --head "<sha>"');
    expect(body).toMatch(/only when the person asks for it/);
  });

  it('relays every start blocker with its resolve text and stops when the run is refused', () => {
    expect(body).toContain('`started: false`');
    expect(body).toContain('`blockers`');
    expect(body).toContain('`resolve`');
  });

  it('stops when no fresh-context subagent can judge, and never judges in the context that wrote the code', () => {
    expect(body).toMatch(/fresh-context/);
    expect(body).toMatch(/cannot launch a subagent/i);
    expect(body).toMatch(/stop with a clear message/i);
    expect(body).toMatch(/never judge in the context that wrote the code/i);
  });

  it('says once that agent-written mutants and tests run with the developer permissions and no sandbox', () => {
    expect(body).toMatch(/developer's permissions/);
    expect(body).toMatch(/no network or filesystem sandbox/);
    expect(body.match(/developer's permissions/g)).toHaveLength(1);
  });

  it('marks every finding of a degraded run as low confidence', () => {
    expect(body).toMatch(/every finding of a degraded run is low confidence/i);
  });

  it('lets the CLI decide every gate and keeps every input in a file', () => {
    expect(body).toMatch(/the CLI decides every gate outcome/);
    expect(body).toMatch(/never put application code, a diff, test content, a finding text or a note on a command line/i);
    expect(body).toContain('--input "<runDir>/drafts/');
    expect(body).toContain('--note-file "<runDir>/drafts/');
  });

  it('never puts free text on a catch command line: every flag is an allowed one and every value an id, a path or a placeholder', () => {
    const invocations = catchInvocations(body);
    expect(invocations.length).toBeGreaterThan(0);

    for (const invocation of invocations) {
      const tokens = invocation[2].match(/"[^"]*"|\S+/g) ?? [];
      for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (!token.startsWith('--')) {
          expect.fail(`${invocation[0]}: unexpected argument ${token}`);
        }
        expect(ALLOWED_FLAGS.has(token), `${invocation[0]}: ${token}`).toBe(true);
        if (SWITCH_FLAGS.has(token)) {
          continue;
        }
        index += 1;
        expect(tokens[index], `${invocation[0]}: ${token} has no value`).toBeDefined();
        expect(isIdOrPathValue(tokens[index]), `${invocation[0]}: ${token} ${tokens[index]}`).toBe(true);
      }
    }
  });

  it('names every run state, outcome and record it relies on, in code formatting', () => {
    for (const name of STATES_AND_OUTCOMES) {
      expect(body, name).toContain(`\`${name}\``);
    }
  });

  it('lands the patch from the repository root, after the head check and git apply --check, and never commits', () => {
    expect(body).toMatch(/repository root/);
    expect(body).toContain('`git rev-parse HEAD`');
    expect(body).toContain('`git apply --check');
    expect(body).toContain('`git apply');
    expect(body).toMatch(/silently skips/);
    expect(body).toMatch(/never stage, commit or push/i);
  });

  it('finishes the run after every outcome, also after an error, once the run exists', () => {
    expect(body).toMatch(/Run `finish` always, also after an error/);
  });

  it('says a finished run takes no more records, except answers to its findings, which the person may give later', () => {
    expect(body).toContain(
      'A finished run takes no more records, except answers to its findings, which the person may give later with `qaspec catch answer`.'
    );
    expect(body).not.toContain('A finished run takes no more records.');
  });

  it('keeps the wording free of adopter-specific values', () => {
    expect(body).not.toMatch(ADOPTER_DENYLIST);
    expect(getQasCatchCommandTemplate().content).not.toMatch(ADOPTER_DENYLIST);
  });
});

describe('/qsx:catch generated files', () => {
  let testDir: string;
  let configTempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-catch-workflow-'));
    originalEnv = { ...process.env };
    configTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-catch-config-'));
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

  it('installs the catch skill and command for every tool and writes no adopter-specific value into them or the config seed', async () => {
    await new InitCommand({ tools: 'all', force: true }).execute(testDir);

    const toolIds = getToolsWithSkillsDir();
    expect(toolIds.length).toBeGreaterThan(0);

    const catchFiles: string[] = [];
    for (const toolId of toolIds) {
      const tool = AI_TOOLS.find((t) => t.value === toolId);
      if (tool?.skillsDir) {
        catchFiles.push(
          path.join(testDir, tool.skillsDir, 'skills', qaspecSkillDirName('catch'), 'SKILL.md')
        );
      }
      const adapter = CommandAdapterRegistry.get(toolId);
      if (adapter) {
        const commandPath = adapter.getFilePath('catch');
        catchFiles.push(path.isAbsolute(commandPath) ? commandPath : path.join(testDir, commandPath));
      }
    }

    expect(catchFiles.length).toBeGreaterThan(0);
    for (const file of catchFiles) {
      const content = await fs.readFile(file, 'utf-8');
      expect(content, file).toMatch(/qaspec catch/);
      expect(content, file).not.toMatch(ADOPTER_DENYLIST);
    }

    const config = await fs.readFile(path.join(testDir, 'qaspec', 'config.yaml'), 'utf-8');
    expect(config).toMatch(/catch/);
    expect(config).not.toMatch(ADOPTER_DENYLIST);
  });
});

describe('/qsx:catch template and the built CLI', () => {
  it('names only qaspec catch subcommands and flags that the built CLI accepts', async () => {
    const body = getQasCatchSkillTemplate().instructions;
    const flagsBySubcommand = new Map<string, Set<string>>();
    for (const invocation of catchInvocations(body)) {
      const flags = flagsBySubcommand.get(invocation[1]) ?? new Set<string>();
      for (const flag of invocation[2].matchAll(/--[a-z][a-z-]*/g)) {
        flags.add(flag[0]);
      }
      flagsBySubcommand.set(invocation[1], flags);
    }
    expect([...flagsBySubcommand.keys()]).toEqual(
      expect.arrayContaining(LIFECYCLE.map((command) => command.split(' ')[2]).concat(['status', 'intent']))
    );

    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-catch-surface-'));
    try {
      const env = { HOME: home, XDG_CONFIG_HOME: home, CODEX_HOME: path.join(home, 'codex') };
      // An unknown subcommand prints the parent help, so membership is checked in the parent's command list.
      const catchHelp = await runCLI(['catch', '--help'], { env });
      expect(catchHelp.exitCode).toBe(0);
      for (const subcommand of flagsBySubcommand.keys()) {
        expect(catchHelp.stdout, `qaspec catch ${subcommand} is a subcommand`).toMatch(new RegExp(`^\\s{2}${subcommand}\\s`, 'm'));
      }
      for (const [subcommand, flags] of flagsBySubcommand) {
        const help = await runCLI(['catch', subcommand, '--help'], { env });
        expect(help.exitCode, `qaspec catch ${subcommand}`).toBe(0);
        for (const flag of flags) {
          // A flag is matched as a whole word: --note must not pass on the strength of --note-file.
          expect(help.stdout, `qaspec catch ${subcommand} ${flag}`).toMatch(new RegExp(`${flag}(?![\\w-])`));
        }
      }
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  }, 120_000);
});
