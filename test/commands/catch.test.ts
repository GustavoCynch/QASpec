import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { stringify } from 'yaml';
import { runCLI } from '../helpers/run-cli.js';
import * as fsSync from 'node:fs';
import { CHANGE, makeProjectFixture, type ProjectFixture } from '../fixtures/catch-jest/catch-project.js';

const ADD_EXPORT = 'add-export';

const CSV_DELTA = [
  '## ADDED Requirements',
  '### Requirement: CSV export',
  'The system SHALL write a CSV file.',
  '#### Scenario: CSV header row',
  '- **WHEN** the file is built\n- **THEN** the first row holds the headers',
].join('\n\n') + '\n';

const CONTRADICTING_DELTA = [
  '## MODIFIED Requirements',
  '### Requirement: Currency',
  'The system SHALL keep each currency.',
  '## REMOVED Requirements',
  '### Requirement: Legacy export',
].join('\n\n') + '\n';

/** analysis.md with an Intent class section; `intent` null omits the line. */
function analysis(intent: string | null): string {
  return [
    '# Analysis',
    '## Affected capabilities',
    '- billing-export',
    '## Intent class',
    ...(intent === null ? [] : [intent]),
    '## Approval digest',
    'Pending.',
  ].join('\n\n') + '\n';
}

/** Every file under the project root, keyed by its relative path. */
async function snapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const walk = async (current: string): Promise<void> => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        files[path.relative(root, full)] = await fs.readFile(full, 'utf-8');
      }
    }
  };
  await walk(root);
  return files;
}

describe('qaspec catch intent', () => {
  let projectRoot: string;

  const write = async (root: string, relativePath: string, content: string) => {
    const target = path.join(root, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf-8');
  };

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-catch-cli-'));
    await write(projectRoot, path.join('qaspec', 'config.yaml'), 'schema: qaspec-pr-review\n');

    await write(projectRoot, path.join('qaspec', 'changes', ADD_EXPORT, 'analysis.md'), analysis('Intent class: additive'));
    await write(projectRoot, path.join('qaspec', 'changes', ADD_EXPORT, 'specs', 'billing-export', 'spec.md'), CSV_DELTA);

    await write(projectRoot, path.join('qaspec', 'changes', 'no-class', 'analysis.md'), analysis(null));

    await write(projectRoot, path.join('qaspec', 'changes', 'contradiction', 'analysis.md'), analysis('Intent class: additive'));
    await write(
      projectRoot,
      path.join('qaspec', 'changes', 'contradiction', 'specs', 'billing-export', 'spec.md'),
      CONTRADICTING_DELTA
    );
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('exits 0 and prints the intent class and the requirement map', async () => {
    const result = await runCLI(['catch', 'intent', '--change', ADD_EXPORT], { cwd: projectRoot });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('additive');
    expect(result.stdout).toContain('billing-export');
    expect(result.stdout).toContain('CSV export');
  });

  it('prints the intent as JSON with the qaspec.catch-intent/v1 schema', async () => {
    const result = await runCLI(['catch', 'intent', '--change', ADD_EXPORT, '--json'], { cwd: projectRoot });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      schema: 'qaspec.catch-intent/v1',
      change: ADD_EXPORT,
      intentClass: 'additive',
      capabilities: [
        {
          name: 'billing-export',
          requirements: [
            {
              name: 'CSV export',
              status: 'added',
              scenarios: [
                {
                  title: 'CSV header row',
                  when: ['the file is built'],
                  then: ['the first row holds the headers'],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('exits 1 with the analyze approval hint when the intent class is missing', async () => {
    const result = await runCLI(['catch', 'intent', '--change', 'no-class'], { cwd: projectRoot });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Intent class');
    expect(result.stdout).toMatch(/approve/i);
  });

  it('exits 1 and lists every contradiction as JSON', async () => {
    const result = await runCLI(['catch', 'intent', '--change', 'contradiction', '--json'], { cwd: projectRoot });

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({ schema: 'qaspec.catch-intent/v1', change: 'contradiction', valid: false });
    expect(output.errors.map((error: { requirement?: string }) => error.requirement)).toEqual([
      'Currency',
      'Legacy export',
    ]);
  });

  it('exits 1 when the change does not exist', async () => {
    const result = await runCLI(['catch', 'intent', '--change', 'missing-change'], { cwd: projectRoot });

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/not found/i);
  });

  it('exits 1 when --change is missing', async () => {
    const result = await runCLI(['catch', 'intent'], { cwd: projectRoot });

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain('--change');
  });

  it('exits 1 from a workspace root, where catch has no repository changes', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-catch-workspace-'));
    try {
      await write(workspaceRoot, path.join('.qaspec-workspace', 'workspace.yaml'), 'name: demo\n');

      const result = await runCLI(['catch', 'intent', '--change', ADD_EXPORT], { cwd: workspaceRoot });

      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toMatch(/repository/i);
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('is read-only: no file in the project changes for text, JSON, valid or invalid runs', async () => {
    const before = await snapshot(projectRoot);

    const valid = await runCLI(['catch', 'intent', '--change', ADD_EXPORT], { cwd: projectRoot });
    const validJson = await runCLI(['catch', 'intent', '--change', ADD_EXPORT, '--json'], { cwd: projectRoot });
    const invalid = await runCLI(['catch', 'intent', '--change', 'contradiction', '--json'], { cwd: projectRoot });

    expect([valid.exitCode, validJson.exitCode, invalid.exitCode]).toEqual([0, 0, 1]);
    expect(await snapshot(projectRoot)).toEqual(before);
  });
});

const RUN_ID = /^\d{8}T\d{6}Z-[0-9a-f]{6}$/;
const SETUP_MARKER = 'setup-marker.txt';
const OUTPUT_MARKER = 'SETUP-OUTPUT-MARKER';
const shellWord = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;
const nodeEval = (code: string): string => `${shellWord(process.execPath)} -e ${shellWord(code)}`;
const SETUP_OK = nodeEval(`require('fs').writeFileSync(${JSON.stringify(SETUP_MARKER)}, 'ok')`);
/** Prints OUTPUT_MARKER, which the command text does not contain, then fails. */
const SETUP_FAILS = nodeEval(`console.log(['SETUP', 'OUTPUT', 'MARKER'].join('-')); process.exit(3)`);

/** A qaspec/config.yaml with a catch block whose only setup command is setupCommand. */
function catchConfig(setupCommand: string): string {
  return stringify({
    schema: 'qaspec-pr-review',
    catch: {
      baseRef: 'main',
      setup: { commands: [setupCommand] },
      runner: { adapter: 'jest', command: 'npm test --' },
    },
  });
}

describe('qaspec catch start, status and finish', () => {
  let tmp: string;
  let repo: string;
  /** The PR head: the feature branch commit, while the checkout stays on main. */
  let head: string;
  const changeDir = () => path.join(repo, 'qaspec', 'changes', ADD_EXPORT);
  /** Scratch temp folder for every catch command of the test: the real temp folder is never touched. */
  const env = () => ({ TMPDIR: tmp, TMP: tmp, TEMP: tmp });

  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  const writeFile = async (relativePath: string, content: string) => {
    const target = path.join(repo, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf-8');
  };

  /** The run folders of the change: the entries of catch/ whose names are run ids (.gitignore is not one). */
  const runFolders = async (): Promise<string[]> => {
    try {
      return (await fs.readdir(path.join(changeDir(), 'catch'))).filter((name) => RUN_ID.test(name));
    } catch {
      return [];
    }
  };

  const worktreeCount = (): number => git('worktree', 'list', '--porcelain').split('\n').filter((line) => line.startsWith('worktree ')).length;

  /** Records the analyze approval through the CLI, with the PR head. */
  const approveHead = async (): Promise<void> => {
    const result = await runCLI(['approve', 'analyze', '--change', ADD_EXPORT, '--head-sha', head, '--json'], {
      cwd: repo,
      env: env(),
    });
    expect(result.exitCode).toBe(0);
  };

  const startJson = async (extra: string[] = []) =>
    runCLI(['catch', 'start', '--change', ADD_EXPORT, '--json', ...extra], { cwd: repo, env: env() });

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-catch-cli-run-'));
    repo = path.join(tmp, 'repo');
    await fs.mkdir(repo);
    git('init', '-q');
    git('symbolic-ref', 'HEAD', 'refs/heads/main');
    git('config', 'user.name', 'QASpec Test');
    git('config', 'user.email', 'qaspec-test@example.com');
    git('config', 'commit.gpgsign', 'false');

    await writeFile(path.join('qaspec', 'config.yaml'), catchConfig(SETUP_OK));
    await writeFile(path.join('src', 'app.ts'), 'export const value = 1;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');

    git('checkout', '-q', '-b', 'feature');
    await writeFile(path.join('src', 'app.ts'), 'export const value = 2;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'feature');
    head = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'main');

    await writeFile(path.join('qaspec', 'changes', ADD_EXPORT, '.qaspec.yaml'), 'schema: qaspec-pr-review\n');
    await writeFile(path.join('qaspec', 'changes', ADD_EXPORT, 'analysis.md'), analysis('Intent class: additive'));
    await writeFile(path.join('qaspec', 'changes', ADD_EXPORT, 'specs', 'billing-export', 'spec.md'), CSV_DELTA);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('start exits 1, prints each blocker with its resolution and creates nothing', async () => {
    const result = await runCLI(['catch', 'start', '--change', ADD_EXPORT], { cwd: repo, env: env() });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Cannot start a catch run');
    expect(result.stdout).toContain(`qaspec approve analyze --change ${ADD_EXPORT} --head-sha <sha>`);
    expect(await runFolders()).toEqual([]);
    expect(worktreeCount()).toBe(1);
  });

  it('start --json prints the refusal as { started: false, blockers } and exits 1', async () => {
    const result = await startJson();

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({ started: false });
    expect(output.blockers).toEqual([
      expect.objectContaining({ code: 'approval-missing', resolve: expect.stringContaining('--head-sha <sha>') }),
    ]);
  });

  it('start exits 0 and prints the run id and the ready state', async () => {
    await approveHead();

    const result = await runCLI(['catch', 'start', '--change', ADD_EXPORT], { cwd: repo, env: env() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Catch run \d{8}T\d{6}Z-[0-9a-f]{6} is ready/);
    expect(await runFolders()).toHaveLength(1);
  });

  it('start --json prints the run record without setup output and exits 0', async () => {
    await approveHead();

    const result = await startJson();

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({
      started: true,
      run: expect.stringMatching(RUN_ID),
      change: ADD_EXPORT,
      state: 'ready',
      mode: 'analysis',
      lowConfidence: false,
      headSha: head,
      worktree: expect.any(String),
    });
    expect(output.setup.commands[0]).not.toHaveProperty('outputTail');
    expect(result.stdout).not.toContain('outputTail');
  });

  it('start --without-analysis --head runs in degraded mode and says it is low confidence', async () => {
    const result = await startJson(['--without-analysis', '--head', head]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: 'without-analysis', lowConfidence: true, state: 'ready' });
  });

  it('start exits 1 when setup fails, and keeps the setup output out of the terminal and the run record', async () => {
    await writeFile(path.join('qaspec', 'config.yaml'), catchConfig(SETUP_FAILS));
    await approveHead();

    const result = await runCLI(['catch', 'start', '--change', ADD_EXPORT], { cwd: repo, env: env() });

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(OUTPUT_MARKER);
    const [runId] = await runFolders();
    const runDir = path.join(changeDir(), 'catch', runId);
    expect(JSON.parse(await fs.readFile(path.join(runDir, 'run.json'), 'utf-8')).state).toBe('setup-failed');
    expect(await fs.readFile(path.join(runDir, 'setup-output.json'), 'utf-8')).toContain(OUTPUT_MARKER);
    expect(worktreeCount()).toBe(1);
  });

  it('status --run prints the state, mode, setup results and ledger counts', async () => {
    await approveHead();
    const runId = JSON.parse((await startJson()).stdout).run;

    const result = await runCLI(['catch', 'status', '--run', runId], { cwd: repo, env: env() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(runId);
    expect(result.stdout).toContain('ready');
    expect(result.stdout).toContain('analysis');
    expect(result.stdout).toContain(SETUP_OK);
    expect(result.stdout).toContain('started 1');
    expect(result.stdout).toContain('setup 1');
  });

  it('status --json returns the run with ledger counts per stage', async () => {
    await approveHead();
    const runId = JSON.parse((await startJson()).stdout).run;

    const result = await runCLI(['catch', 'status', '--run', runId, '--change', ADD_EXPORT, '--json'], {
      cwd: repo,
      env: env(),
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      run: runId,
      change: ADD_EXPORT,
      state: 'ready',
      mode: 'analysis',
      ledger: { started: 1, setup: 1, ready: 1 },
    });
  });

  it('status --change lists the runs of the change; status without --run or --change exits 1', async () => {
    await approveHead();
    const runId = JSON.parse((await startJson()).stdout).run;

    const listed = await runCLI(['catch', 'status', '--change', ADD_EXPORT, '--json'], { cwd: repo, env: env() });
    expect(listed.exitCode).toBe(0);
    expect(JSON.parse(listed.stdout)).toEqual({
      change: ADD_EXPORT,
      runs: [expect.objectContaining({ run: runId, state: 'ready', mode: 'analysis' })],
    });

    const missing = await runCLI(['catch', 'status'], { cwd: repo, env: env() });
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout + missing.stderr).toContain('--run or --change');
  });

  it('finish removes the worktree, and a second finish exits 0 and reports it is already finished', async () => {
    await approveHead();
    const runId = JSON.parse((await startJson()).stdout).run;

    const first = await runCLI(['catch', 'finish', '--run', runId, '--json'], { cwd: repo, env: env() });
    expect(first.exitCode).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({ run: runId, state: 'finished', alreadyFinished: false });
    expect(worktreeCount()).toBe(1);

    const second = await runCLI(['catch', 'finish', '--run', runId, '--json'], { cwd: repo, env: env() });
    expect(second.exitCode).toBe(0);
    expect(JSON.parse(second.stdout)).toMatchObject({ run: runId, state: 'finished', alreadyFinished: true });
  });

  it('catch --help lists start, status and finish next to intent', async () => {
    const result = await runCLI(['catch', '--help'], { cwd: repo, env: env() });

    expect(result.exitCode).toBe(0);
    for (const command of ['intent', 'start', 'status', 'finish']) {
      expect(result.stdout).toMatch(new RegExp(`^\\s+${command}\\b`, 'm'));
    }
  });

  it('catch intent prints the same output before and after a catch run exists for the change', async () => {
    const before = await runCLI(['catch', 'intent', '--change', ADD_EXPORT, '--json'], { cwd: repo, env: env() });
    await approveHead();
    const started = await startJson();
    expect(started.exitCode).toBe(0);

    const after = await runCLI(['catch', 'intent', '--change', ADD_EXPORT, '--json'], { cwd: repo, env: env() });

    expect(before.exitCode).toBe(0);
    expect(after.exitCode).toBe(0);
    expect(after.stdout).toBe(before.stdout);
  });
});

describe('qaspec catch context, risk, mutant and equivalence (T7)', () => {
  let tmp: string;
  let fx: ProjectFixture;
  const env = () => ({ TMPDIR: tmp, TMP: tmp, TEMP: tmp });
  const cli = (args: string[]) => runCLI(['catch', ...args], { cwd: fx.project, env: env() });

  /** Writes a JSON input outside the repository and returns its path. */
  const inputFile = (name: string, value: unknown): string => {
    const file = path.join(tmp, 'inputs', name);
    fsSync.mkdirSync(path.dirname(file), { recursive: true });
    fsSync.writeFileSync(file, JSON.stringify(value));
    return file;
  };

  /** Starts the run through the CLI, approved with its head, and returns its id. */
  const startRun = async (): Promise<string> => {
    const started = await cli(['start', '--change', CHANGE, '--json']);
    expect(started.exitCode).toBe(0);
    return JSON.parse(started.stdout).run as string;
  };

  beforeEach(() => {
    tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), 'qaspec-catch-cli-parent-'));
    fx = makeProjectFixture({ root: tmp });
  });

  afterEach(() => {
    fsSync.rmSync(tmp, { recursive: true, force: true });
  });

  it('catch --help lists context, risk, mutant and equivalence next to the existing commands', async () => {
    const result = await runCLI(['catch', '--help'], { cwd: fx.project, env: env() });

    expect(result.exitCode).toBe(0);
    for (const command of ['context', 'risk', 'mutant', 'equivalence']) {
      expect(result.stdout).toMatch(new RegExp(`^\\s+${command}\\b`, 'm'));
    }
  });

  it('catch context prints the run and its related tests, and --json prints the context record', async () => {
    const runId = await startRun();

    const text = await cli(['context', '--run', runId]);
    const json = await cli(['context', '--run', runId, '--json']);

    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain(`Catch run ${runId}`);
    expect(text.stdout).toContain('test/app.spec.ts');
    expect(json.exitCode).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({
      schema: 'qaspec.catch-context/v1',
      run: runId,
      changedFiles: [{ status: 'M', path: 'src/app.ts' }],
      relatedTests: { tests: ['test/app.spec.ts'] },
    });
  });

  it('catch context exits 1 for a finished run and says why', async () => {
    const runId = await startRun();
    expect((await cli(['finish', '--run', runId])).exitCode).toBe(0);

    const result = await cli(['context', '--run', runId]);

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toMatch(/is finished/);
  });

  it('catch risk records the risk from --input and --json reports its id', async () => {
    const runId = await startRun();
    const input = inputFile('risk.json', { requirement: 'Currency', summary: 'The currency code is dropped' });

    const result = await cli(['risk', '--run', runId, '--input', input, '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ recorded: true, run: runId, risk: { id: 'R1', requirement: 'Currency' } });
  });

  it('catch risk refuses an invalid input, lists each error in --json and exits 1', async () => {
    const runId = await startRun();
    const input = inputFile('risk.json', { requirement: 'Invented', summary: 'a risk' });

    const result = await cli(['risk', '--run', runId, '--input', input, '--json']);

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({ recorded: false });
    expect(output.errors).toEqual([expect.objectContaining({ code: 'requirement-unknown' })]);
  });

  it('catch risk without --input exits 1', async () => {
    const runId = await startRun();

    expect((await cli(['risk', '--run', runId])).exitCode).toBe(1);
  });

  it('catch mutant records the outcome of the gates from --input and exits 0', async () => {
    const runId = await startRun();
    expect((await cli(['risk', '--run', runId, '--input', inputFile('risk.json', { requirement: 'Currency', summary: 'x' })])).exitCode).toBe(0);
    const input = inputFile('mutant.json', {
      risk: 'R1',
      file: 'src/app.ts',
      original: 'export const value = 1;',
      replacement: 'export const value = 2;',
    });

    const result = await cli(['mutant', '--run', runId, '--input', input, '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ recorded: true, mutant: { id: 'M1', outcome: 'caught-by-existing' } });
  });

  it('catch mutant refuses an invalid input and exits 1 with the errors', async () => {
    const runId = await startRun();
    expect((await cli(['risk', '--run', runId, '--input', inputFile('risk.json', { requirement: 'Currency', summary: 'x' })])).exitCode).toBe(0);
    const input = inputFile('mutant.json', {
      risk: 'R1',
      file: 'src/app.ts',
      original: 'export const nothing = 0;',
      replacement: 'x',
    });

    const result = await cli(['mutant', '--run', runId, '--input', input, '--json']);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ recorded: false, errors: [expect.objectContaining({ code: 'original-count' })] });
  });

  it('catch equivalence records the verdict on a surviving mutant from --input and exits 0', async () => {
    const runId = await startRun();
    await cli(['risk', '--run', runId, '--input', inputFile('risk.json', { requirement: 'Currency', summary: 'x' })]);
    await cli([
      'mutant',
      '--run',
      runId,
      '--input',
      inputFile('mutant.json', {
        risk: 'R1',
        file: 'src/app.ts',
        original: "export const label = 'value';",
        replacement: "export const label = 'other';",
      }),
    ]);
    const verdict = inputFile('verdict.json', { equivalent: false, rationale: 'The label is shown to the user' });

    const result = await cli(['equivalence', '--run', runId, '--mutant', 'M1', '--input', verdict, '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ recorded: true, mutant: { id: 'M1', outcome: 'non-equivalent' } });
  });

  it('catch equivalence without --mutant exits 1', async () => {
    const runId = await startRun();

    const result = await cli(['equivalence', '--run', runId, '--input', inputFile('verdict.json', { equivalent: true, rationale: 'x' })]);

    expect(result.exitCode).toBe(1);
  });

  it('catch start --json keeps its record keys (existing command, T7 pin)', async () => {
    const result = await cli(['start', '--change', CHANGE, '--json']);

    expect(result.exitCode).toBe(0);
    expect(Object.keys(JSON.parse(result.stdout)).sort()).toEqual(
      [
        'started', 'run', 'change', 'state', 'mode', 'lowConfidence', 'baseRef', 'baseSha', 'headSha', 'parentSha',
        'projectPrefix', 'runDir', 'worktree', 'installedFor', 'setup', 'failure',
      ].sort()
    );
  });

  it('catch status --json keeps its keys and the ledger counts of the parent phase (existing command, T7 pin)', async () => {
    const runId = await startRun();

    const result = await cli(['status', '--run', runId, '--json']);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(Object.keys(output).sort()).toEqual(
      [
        'run', 'change', 'state', 'mode', 'lowConfidence', 'baseRef', 'baseSha', 'headSha', 'parentSha', 'projectPrefix',
        'worktree', 'installedFor', 'setup', 'failure', 'createdAt', 'updatedAt', 'finishedAt', 'runDir', 'ledger',
      ].sort()
    );
    expect(output.ledger).toEqual({ started: 1, setup: 1, ready: 1 });
  });

  it('catch finish --json keeps its keys, and a second finish changes nothing (existing command, T7 pin)', async () => {
    const runId = await startRun();

    const first = await cli(['finish', '--run', runId, '--json']);
    const second = await cli(['finish', '--run', runId, '--json']);

    expect(first.exitCode).toBe(0);
    expect(Object.keys(JSON.parse(first.stdout)).sort()).toEqual(['alreadyFinished', 'change', 'run', 'state'].sort());
    expect(JSON.parse(second.stdout)).toMatchObject({ run: runId, state: 'finished', alreadyFinished: true });
  });

  it('catch intent --json keeps its keys (existing command, T7 pin)', async () => {
    const result = await cli(['intent', '--change', CHANGE, '--json']);

    expect(result.exitCode).toBe(0);
    expect(Object.keys(JSON.parse(result.stdout)).sort()).toEqual(['capabilities', 'change', 'intentClass', 'schema']);
  });
});
