import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawn } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, promises as fs, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureCliBuilt, runCLI } from '../helpers/run-cli.js';
import { computeAnalyzeContentHash, writeApprovalRecord } from '../../src/core/approval-ledger.js';
import { writeChangeMetadata } from '../../src/utils/change-metadata.js';

const CLI_ENTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

const PASSWORD = 'S3cret-Pa55word';

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('qaspec execute login', () => {
  let projectRoot: string;

  const write = async (relativePath: string, content: string) => {
    const target = path.join(projectRoot, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  };

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-execute-cli-'));
    execFileSync('git', ['init', '-q'], { cwd: projectRoot });
    await write(
      path.join('qaspec', 'config.yaml'),
      `schema: qaspec-pr-review
execution:
  auth:
    envFile: .env.qa
    requiredVariables: [QA_PASSWORD]
    loginScript: scripts/login.mjs
    storageState: .qaspec/auth/storage-state.json
`
    );
    await write('.env.qa', `QA_PASSWORD=${PASSWORD}\n`);
    await write(
      path.join('scripts', 'login.mjs'),
      `import { writeFileSync } from 'node:fs';
console.log('password is ' + process.env.QA_PASSWORD);
writeFileSync(process.env.QASPEC_STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
`
    );
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('saves the session and prints redacted script output', async () => {
    await write('.gitignore', '.env.qa\n.qaspec/auth/\n');

    const result = await runCLI(['execute', 'login'], { cwd: projectRoot });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('password is [redacted]');
    expect(result.stdout).toContain('Session saved to');
    expect(`${result.stdout}${result.stderr}`).not.toContain(PASSWORD);
  });

  it('prints the session path as JSON', async () => {
    await write('.gitignore', '.env.qa\n.qaspec/auth/\n');

    const result = await runCLI(['execute', 'login', '--json'], { cwd: projectRoot });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      storageState: path.join('.qaspec', 'auth', 'storage-state.json'),
      output: 'password is [redacted]\n',
    });
  });

  it.skipIf(process.platform === 'win32')(
    'stops the login script and removes the session when the command is interrupted',
    async () => {
      await ensureCliBuilt();
      await write('.gitignore', '.env.qa\n.qaspec/auth/\n');
      await write(
        path.join('scripts', 'login.mjs'),
        `import { writeFileSync } from 'node:fs';
writeFileSync('script.pid', String(process.pid));
setInterval(() => {}, 1000);`
      );
      const cli = spawn(process.execPath, [CLI_ENTRY, 'execute', 'login'], {
        cwd: projectRoot,
        stdio: 'ignore',
      });
      const exited = new Promise<NodeJS.Signals | null>((resolve) =>
        cli.on('exit', (_code, signal) => resolve(signal))
      );
      const pidFile = path.join(projectRoot, 'script.pid');
      const deadline = Date.now() + 10_000;
      while (!existsSync(pidFile) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const scriptPid = Number(await fs.readFile(pidFile, 'utf-8'));

      cli.kill('SIGINT');

      expect(await exited).toBe('SIGINT');
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(isAlive(scriptPid)).toBe(false);
      expect(existsSync(path.join(projectRoot, '.qaspec', 'auth', 'storage-state.json'))).toBe(false);
    },
    20_000
  );

  it.skipIf(process.platform === 'win32')(
    'still exits with the interrupt signal when the session cannot be removed',
    async () => {
      await ensureCliBuilt();
      await write('.gitignore', '.env.qa\n.qaspec/auth/\n');
      await write(
        path.join('scripts', 'login.mjs'),
        `import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
rmSync(process.env.QASPEC_STORAGE_STATE, { force: true });
mkdirSync(process.env.QASPEC_STORAGE_STATE);
writeFileSync('script.pid', String(process.pid));
setInterval(() => {}, 1000);`
      );
      const cli = spawn(process.execPath, [CLI_ENTRY, 'execute', 'login'], {
        cwd: projectRoot,
        stdio: 'ignore',
      });
      const exited = new Promise<NodeJS.Signals | null>((resolve) =>
        cli.on('exit', (_code, signal) => resolve(signal))
      );
      const pidFile = path.join(projectRoot, 'script.pid');
      const deadline = Date.now() + 10_000;
      while (!existsSync(pidFile) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const scriptPid = Number(await fs.readFile(pidFile, 'utf-8'));

      cli.kill('SIGINT');

      expect(await exited).toBe('SIGINT');
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(isAlive(scriptPid)).toBe(false);
    },
    20_000
  );

  it('exits with code 1 when the credentials file is not ignored by git', async () => {
    await write('.gitignore', '.qaspec/auth/\n');

    const result = await runCLI(['execute', 'login'], { cwd: projectRoot });

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('.env.qa is not ignored by git');
  });
});

describe('qaspec execute validate-plan and check', () => {
  const TESTCASES = [
    '## Suite: Export',
    '',
    '- [ ] 1.1 Export totals',
    '  <!-- req: billing-export/export-totals -->',
    '',
    '  **Preconditions:**',
    '  1. Setup',
    '',
    '  **Steps:**',
    '  | # | Action | Expected |',
    '  |---|--------|----------|',
    '  | 1 | Navigate to the report |  |',
    '  | 2 | Click save | Saved banner shown |',
    '',
  ].join('\n');

  const PLAN = {
    schema: 'qaspec.execution-plan/v1',
    change: 'pr-1',
    case: { id: '1.1', title: 'Export totals' },
    steps: [
      {
        n: 2,
        checks: [
          {
            id: 'banner',
            source: { kind: 'dom', target: 'status banner text' },
            op: 'equals',
            value: 'Saved',
          },
        ],
      },
    ],
  };

  const observations = (after: unknown) => ({
    schema: 'qaspec.execution-observations/v1',
    observations: [{ check: 'banner', after }],
  });

  let workDir: string;

  const write = async (relativePath: string, content: string) => {
    const target = path.join(workDir, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  };

  const writeJson = (relativePath: string, value: unknown) =>
    write(relativePath, `${JSON.stringify(value, null, 2)}\n`);

  const sha256Of = (relativePath: string) =>
    createHash('sha256').update(readFileSync(path.join(workDir, relativePath))).digest('hex');

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-execute-plan-'));
    await write(path.join('qaspec', 'config.yaml'), 'schema: qaspec-pr-review\n');
    await write(path.join('qaspec', 'changes', 'pr-1', 'testcases.md'), TESTCASES);
    await writeJson('plan.json', PLAN);
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('validate-plan exits 0 and reports the plan as valid', async () => {
    const result = await runCLI(['execute', 'validate-plan', '--change', 'pr-1', 'plan.json'], { cwd: workDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('is valid for change "pr-1"');
  });

  it('validate-plan prints the plan hash and no errors as JSON', async () => {
    const result = await runCLI(['execute', 'validate-plan', '--change', 'pr-1', 'plan.json', '--json'], {
      cwd: workDir,
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      change: 'pr-1',
      plan: 'plan.json',
      planSha256: sha256Of('plan.json'),
      valid: true,
      errors: [],
    });
  });

  it('validate-plan exits 1 and names the step that has no row in JSON', async () => {
    await writeJson('unknown-step.json', {
      ...PLAN,
      steps: [...PLAN.steps, { n: 7, checks: [] }],
    });

    const result = await runCLI(['execute', 'validate-plan', '--change', 'pr-1', 'unknown-step.json', '--json'], {
      cwd: workDir,
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      valid: false,
      errors: [expect.objectContaining({ message: expect.stringContaining('step 7'), case: '1.1', step: 7 })],
    });
  });

  it('validate-plan exits 1 and reports a plan that is not valid JSON', async () => {
    await write('broken.json', '{"schema":');

    const result = await runCLI(['execute', 'validate-plan', '--change', 'pr-1', 'broken.json', '--json'], {
      cwd: workDir,
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      valid: false,
      errors: [expect.objectContaining({ message: expect.stringContaining('not valid JSON') })],
    });
  });

  it('validate-plan exits 1 when the change has no testcases.md', async () => {
    await fs.rm(path.join(workDir, 'qaspec', 'changes', 'pr-1', 'testcases.md'));

    const result = await runCLI(['execute', 'validate-plan', '--change', 'pr-1', 'plan.json', '--json'], {
      cwd: workDir,
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      valid: false,
      errors: [expect.objectContaining({ message: 'testcases.md not found in change directory' })],
    });
  });

  it('validate-plan exits 1 when the change does not exist', async () => {
    const result = await runCLI(['execute', 'validate-plan', '--change', 'nope', 'plan.json'], { cwd: workDir });

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('nope');
  });

  it('check exits 0 and reports a passed verdict with the plan hash as JSON', async () => {
    await writeJson('observations.json', observations('Saved'));

    const result = await runCLI(['execute', 'check', 'plan.json', 'observations.json', '--json'], { cwd: workDir });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      valid: true,
      errors: [],
      verdict: 'passed',
      case: { id: '1.1', title: 'Export totals' },
      planSha256: sha256Of('plan.json'),
      checks: [{ id: 'banner', step: 2, op: 'equals', status: 'passed' }],
      needsHuman: [],
    });
  });

  it('check exits 1 and reports a failed verdict with the failing check as JSON', async () => {
    await writeJson('observations.json', observations('Draft'));

    const result = await runCLI(['execute', 'check', 'plan.json', 'observations.json', '--json'], { cwd: workDir });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      verdict: 'failed',
      checks: [{ id: 'banner', step: 2, op: 'equals', status: 'failed', reason: expect.any(String) }],
    });
  });

  it('check prints the verdict in text output and exits 1 when it is not passed', async () => {
    await writeJson('observations.json', observations('Draft'));

    const result = await runCLI(['execute', 'check', 'plan.json', 'observations.json'], { cwd: workDir });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Verdict: failed');
  });

  it('check exits 1 with no verdict when the observations file is invalid', async () => {
    await writeJson('observations.json', observations({ text: 'Saved' }));

    const result = await runCLI(['execute', 'check', 'plan.json', 'observations.json', '--json'], { cwd: workDir });

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({ valid: false, errors: [expect.objectContaining({ check: 'banner' })] });
    expect(output).not.toHaveProperty('verdict');
  });

  it('check exits 1 with an incomplete verdict when an observation is missing', async () => {
    await writeJson('observations.json', { schema: 'qaspec.execution-observations/v1', observations: [] });

    const result = await runCLI(['execute', 'check', 'plan.json', 'observations.json', '--json'], { cwd: workDir });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      verdict: 'incomplete',
      checks: [{ id: 'banner', status: 'missing' }],
    });
  });

  it('check exits 1 with a needs-human verdict for a step that needs a person', async () => {
    await writeJson('needs-human.json', {
      ...PLAN,
      steps: [{ n: 2, checks: [], needsHuman: 'Read the banner colour' }],
    });
    await writeJson('observations.json', { schema: 'qaspec.execution-observations/v1', observations: [] });

    const result = await runCLI(['execute', 'check', 'needs-human.json', 'observations.json', '--json'], {
      cwd: workDir,
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      verdict: 'needs-human',
      needsHuman: [{ step: 2, reason: 'Read the banner colour' }],
    });
  });
});

describe('qaspec execute start, confirm, plan, record, finish and status', () => {
  const CASES = [
    '## Suite: Export',
    '',
    '- [ ] 1.1 Export totals',
    '  <!-- req: billing-export/export-totals -->',
    '',
    '  **Preconditions:**',
    '  1. Setup',
    '',
    '  **Steps:**',
    '  | # | Action | Expected |',
    '  |---|--------|----------|',
    '  | 1 | Navigate to the report | Report shown |',
    '  | 2 | Click save | Saved banner shown |',
    '',
  ].join('\n');

  const CONTROL = [
    '## Suite: Smoke',
    '',
    '- [ ] 9.1 Home page loads',
    '',
    '  **Steps:**',
    '  | # | Action | Expected |',
    '  |---|--------|----------|',
    '  | 1 | Open the home page | Home heading shown |',
    '',
  ].join('\n');

  const CONTROL_PLAN = {
    schema: 'qaspec.execution-plan/v1',
    change: 'pr-1',
    case: { id: '9.1', title: 'Home page loads' },
    steps: [
      {
        n: 1,
        checks: [{ id: 'home-heading', source: { kind: 'dom', target: 'page heading' }, op: 'equals', value: 'Home' }],
      },
    ],
  };

  const CASE_PLAN = {
    schema: 'qaspec.execution-plan/v1',
    change: 'pr-1',
    case: { id: '1.1', title: 'Export totals' },
    steps: [
      {
        n: 1,
        checks: [{ id: 'report-title', source: { kind: 'dom', target: 'report heading' }, op: 'contains', value: 'Report' }],
      },
      {
        n: 2,
        checks: [{ id: 'banner', source: { kind: 'dom', target: 'status banner' }, op: 'equals', value: 'Saved' }],
      },
    ],
  };

  const observed = (entries: Array<{ check: string; after: unknown }>) => ({
    schema: 'qaspec.execution-observations/v1',
    observations: entries,
  });
  const CONTROL_PASS = observed([{ check: 'home-heading', after: 'Home' }]);
  const CONTROL_FAIL = observed([{ check: 'home-heading', after: 'Error page' }]);
  const CASE_PASS = observed([
    { check: 'report-title', after: 'Report' },
    { check: 'banner', after: 'Saved' },
  ]);
  const CASE_FAIL = observed([
    { check: 'report-title', after: 'Report' },
    { check: 'banner', after: 'Error' },
  ]);

  const MANUAL_EXECUTION = '  app:\n    url: https://app.example.test/\n    readiness: manual\n  controlCase: qa/smoke/control.md\n';

  let workDir: string;

  const write = async (relativePath: string, content: string) => {
    const target = path.join(workDir, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  };

  const writeJson = (relativePath: string, value: unknown) => write(relativePath, `${JSON.stringify(value, null, 2)}\n`);

  const cli = (args: string[]) => runCLI(['execute', ...args], { cwd: workDir });

  const setUp = async (execution = MANUAL_EXECUTION, { approved = true } = {}) => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-execute-run-'));
    execFileSync('git', ['init', '-q'], { cwd: workDir });
    await write(path.join('qaspec', 'config.yaml'), `execution:\n${execution}`);
    await write('qa/smoke/control.md', CONTROL);
    await write(path.join('qaspec', 'changes', 'pr-1', 'analysis.md'), '# Analysis\n');
    await write(
      path.join('qaspec', 'changes', 'pr-1', 'specs', 'billing-export', 'spec.md'),
      '## ADDED Requirements\n\n### Requirement: Export totals\n'
    );
    await write(path.join('qaspec', 'changes', 'pr-1', 'testcases.md'), CASES);
    const changeDir = path.join(workDir, 'qaspec', 'changes', 'pr-1');
    writeChangeMetadata(changeDir, { schema: 'qaspec-pr-review', created: '2026-10-19' });
    if (approved) {
      const { hash } = computeAnalyzeContentHash(changeDir);
      writeApprovalRecord(changeDir, 'analyze', { approvedAt: '2026-10-19T12:00:00.000Z', contentHash: hash });
    }
  };

  const startRun = async (): Promise<string> => {
    const result = await cli(['start', '--change', 'pr-1', '--json']);
    expect(result.exitCode).toBe(0);
    return JSON.parse(result.stdout).run;
  };

  const startConfirmedRun = async (): Promise<string> => {
    const run = await startRun();
    expect((await cli(['confirm', '--run', run])).exitCode).toBe(0);
    return run;
  };

  afterEach(async () => {
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  });

  it('runs a full lifecycle through the CLI and completes the run', async () => {
    await setUp();
    await writeJson('control-plan.json', CONTROL_PLAN);
    await writeJson('case-plan.json', CASE_PLAN);
    await writeJson('control-pass.json', CONTROL_PASS);
    await writeJson('case-pass.json', CASE_PASS);
    const started = await cli(['start', '--change', 'pr-1', '--json']);
    expect(started.exitCode).toBe(0);
    const { run, state, dataTag } = JSON.parse(started.stdout);
    expect(state).toBe('awaiting-confirmation');
    expect(dataTag).toBe(`QASPEC-${run}`);

    expect((await cli(['confirm', '--run', run])).exitCode).toBe(0);
    expect((await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json'])).exitCode).toBe(0);
    expect((await cli(['record', '--run', run, '--case', 'control', 'control-pass.json'])).exitCode).toBe(0);
    expect((await cli(['plan', '--run', run, '--case', '1.1', 'case-plan.json'])).exitCode).toBe(0);
    expect((await cli(['record', '--run', run, '--case', '1.1', 'case-pass.json'])).exitCode).toBe(0);
    expect((await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json'])).exitCode).toBe(0);
    expect((await cli(['record', '--run', run, '--case', 'control', 'control-pass.json'])).exitCode).toBe(0);

    const finished = await cli(['finish', '--run', run, '--json']);
    expect(finished.exitCode).toBe(0);
    expect(JSON.parse(finished.stdout)).toMatchObject({ state: 'completed' });
    const status = await cli(['status', '--run', run, '--json']);
    expect(status.exitCode).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      run,
      state: 'completed',
      cases: { '1.1': { status: 'passed' }, 'control-end': { status: 'passed' } },
    });
  }, 30_000);

  it('prints the run id, data tag, control case path and the confirmation step when the run starts', async () => {
    await setUp();

    const result = await cli(['start', '--change', 'pr-1']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Run \d{8}T\d{6}Z-[0-9a-f]{6}/);
    expect(result.stdout).toMatch(/QASPEC-\d{8}T\d{6}Z-[0-9a-f]{6}/);
    expect(result.stdout).toContain('qa/smoke/control.md');
    expect(result.stdout).toContain('qaspec execute confirm --run');
  });

  it('exits 1, names the missing approval and creates no run', async () => {
    await setUp(MANUAL_EXECUTION, { approved: false });

    const result = await cli(['start', '--change', 'pr-1']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Analyze phase has not been approved');
    expect(result.stdout).toContain('qaspec approve analyze --change pr-1');
    expect(existsSync(path.join(workDir, 'qaspec', 'changes', 'pr-1', 'runs'))).toBe(false);
  });

  it('exits 1 and keeps the run blocked-by-environment when a readiness command fails', async () => {
    await setUp(
      MANUAL_EXECUTION +
        `  readinessChecks:\n    - name: backend deployed\n      command: '${JSON.stringify(process.execPath)} -e "process.exit(3)"'\n`
    );

    const result = await cli(['start', '--change', 'pr-1', '--json']);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      state: 'blocked-by-environment',
      readiness: { checks: [{ name: 'backend deployed', status: 'failed', exitCode: 3 }] },
    });
  });

  it('exits 1 with the retry outcome for a first failed verdict', async () => {
    await setUp();
    const run = await startConfirmedRun();
    await writeJson('control-plan.json', CONTROL_PLAN);
    await writeJson('case-plan.json', CASE_PLAN);
    await writeJson('control-pass.json', CONTROL_PASS);
    await writeJson('case-fail.json', CASE_FAIL);
    await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json']);
    await cli(['record', '--run', run, '--case', 'control', 'control-pass.json']);
    await cli(['plan', '--run', run, '--case', '1.1', 'case-plan.json']);

    const result = await cli(['record', '--run', run, '--case', '1.1', 'case-fail.json', '--json']);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ attempt: 1, verdict: 'failed', outcome: 'retry' });
  });

  it('exits 1 and finishes as environment-noise when the control case fails at the end', async () => {
    await setUp();
    const run = await startConfirmedRun();
    await writeJson('control-plan.json', CONTROL_PLAN);
    await writeJson('case-plan.json', CASE_PLAN);
    await writeJson('control-pass.json', CONTROL_PASS);
    await writeJson('control-fail.json', CONTROL_FAIL);
    await writeJson('case-pass.json', CASE_PASS);
    await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json']);
    await cli(['record', '--run', run, '--case', 'control', 'control-pass.json']);
    await cli(['plan', '--run', run, '--case', '1.1', 'case-plan.json']);
    await cli(['record', '--run', run, '--case', '1.1', 'case-pass.json']);
    await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json']);
    expect((await cli(['record', '--run', run, '--case', 'control', 'control-fail.json'])).exitCode).toBe(1);
    expect((await cli(['record', '--run', run, '--case', 'control', 'control-fail.json'])).exitCode).toBe(1);

    const finished = await cli(['finish', '--run', run, '--json']);

    expect(finished.exitCode).toBe(1);
    expect(JSON.parse(finished.stdout)).toMatchObject({ state: 'environment-noise' });
  });

  it('lists the runs of a change with status --change', async () => {
    await setUp();
    const run = await startRun();

    const result = await cli(['status', '--change', 'pr-1', '--json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      change: 'pr-1',
      runs: [{ run, state: 'awaiting-confirmation', createdAt: expect.any(String) }],
    });
  });

  it('rejects a run id that tries to leave the runs directory', async () => {
    await setUp();

    const result = await cli(['status', '--run', '../../x']);

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('Invalid run id');
  });

  it('rejects a case id that is neither a testcase id nor control', async () => {
    await setUp();
    const run = await startRun();
    await writeJson('case-plan.json', CASE_PLAN);

    const result = await cli(['plan', '--run', run, '--case', '../x', 'case-plan.json']);

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('Invalid case id');
  });

  it('prints the run state, control verdicts and case status as text', async () => {
    await setUp();
    const run = await startConfirmedRun();
    await writeJson('control-plan.json', CONTROL_PLAN);
    await writeJson('control-pass.json', CONTROL_PASS);
    await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json']);
    await cli(['record', '--run', run, '--case', 'control', 'control-pass.json']);

    const result = await cli(['status', '--run', run]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Run ${run} (change "pr-1"): ready`);
    expect(result.stdout).toContain('Control case: start passed, end pending');
    expect(result.stdout).toContain('1.1  pending  attempts: -');
    expect(result.stdout).toContain('Ledger: 0 candidate(s), 0 marked environment-noise');
  });

  it('lists the run lifecycle subcommands in help', async () => {
    const result = await runCLI(['execute', '--help']);

    expect(result.exitCode).toBe(0);
    for (const name of ['start', 'confirm', 'plan', 'record', 'finish', 'status']) {
      expect(result.stdout).toMatch(new RegExp(`^\\s+${name}\\b`, 'm'));
    }
  });
});
