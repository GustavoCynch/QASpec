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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until the process is gone; false when it still runs after the timeout. */
async function waitUntilStopped(pid: number, timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isAlive(pid)) {
    if (Date.now() >= deadline) {
      return false;
    }
    await sleep(50);
  }
  return true;
}

/** Stops a process a test left running, so a failed assertion does not leak it. */
function stopIfAlive(pid: number): void {
  if (isAlive(pid)) {
    process.kill(pid, 'SIGKILL');
  }
}

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
  /** A second case, so two plan or record commands can target one run at the same time. */
  const SECOND_CASE = [
    '- [ ] 1.2 Export by date',
    '  <!-- req: billing-export/export-totals -->',
    '',
    '  **Preconditions:**',
    '  1. Setup',
    '',
    '  **Steps:**',
    '  | # | Action | Expected |',
    '  |---|--------|----------|',
    '  | 1 | Pick a date | Date shown |',
    '',
  ].join('\n');
  const TWO_CASES = [CASES, SECOND_CASE].join('\n');
  const SECOND_CASE_PLAN = {
    schema: 'qaspec.execution-plan/v1',
    change: 'pr-1',
    case: { id: '1.2', title: 'Export by date' },
    steps: [
      {
        n: 1,
        checks: [{ id: 'date-shown', source: { kind: 'dom', target: 'date field' }, op: 'equals', value: 'Today' }],
      },
    ],
  };
  const SECOND_CASE_PASS = observed([{ check: 'date-shown', after: 'Today' }]);

  const MANUAL_EXECUTION = '  app:\n    url: https://app.example.test/\n    readiness: manual\n  controlCase: qa/smoke/control.md\n';

  let workDir: string;

  const write = async (relativePath: string, content: string) => {
    const target = path.join(workDir, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  };

  const writeJson = (relativePath: string, value: unknown) => write(relativePath, `${JSON.stringify(value, null, 2)}\n`);

  const cli = (args: string[]) => runCLI(['execute', ...args], { cwd: workDir });

  const setUp = async (execution = MANUAL_EXECUTION, { approved = true, cases = CASES } = {}) => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-execute-run-'));
    execFileSync('git', ['init', '-q'], { cwd: workDir });
    await write(path.join('qaspec', 'config.yaml'), `execution:\n${execution}`);
    await write('qa/smoke/control.md', CONTROL);
    await write(path.join('qaspec', 'changes', 'pr-1', 'analysis.md'), '# Analysis\n');
    await write(
      path.join('qaspec', 'changes', 'pr-1', 'specs', 'billing-export', 'spec.md'),
      '## ADDED Requirements\n\n### Requirement: Export totals\n'
    );
    await write(path.join('qaspec', 'changes', 'pr-1', 'testcases.md'), cases);
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

  it('does not report a blocked run as started and names the readiness check that failed', async () => {
    await setUp(
      MANUAL_EXECUTION +
        `  readinessChecks:\n    - name: backend deployed\n      command: '${JSON.stringify(process.execPath)} -e "process.exit(3)"'\n`
    );

    const result = await cli(['start', '--change', 'pr-1']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).not.toContain('started for change');
    expect(result.stdout).toContain('is blocked-by-environment');
    expect(result.stdout).toContain('backend deployed');
  });

  it('stores the configured text of each readiness command in the run and its status', async () => {
    const command = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;
    await setUp(MANUAL_EXECUTION + `  readinessChecks:\n    - name: backend deployed\n      command: '${command}'\n`);

    const started = await cli(['start', '--change', 'pr-1', '--json']);
    const { run } = JSON.parse(started.stdout);
    const status = await cli(['status', '--run', run, '--json']);

    expect(JSON.parse(started.stdout).readiness.checks).toEqual([
      expect.objectContaining({ name: 'backend deployed', command }),
    ]);
    expect(JSON.parse(status.stdout).readiness.checks).toEqual([
      expect.objectContaining({ name: 'backend deployed', command }),
    ]);
  });

  it.skipIf(process.platform === 'win32')(
    'stops a readiness command when the start command is interrupted',
    async () => {
      await ensureCliBuilt();
      await setUp(
        MANUAL_EXECUTION +
          `  readinessChecks:\n    - name: slow\n      command: '${JSON.stringify(process.execPath)} readiness.cjs'\n`
      );
      await write(
        'readiness.cjs',
        "require('node:fs').writeFileSync('readiness.pid', String(process.pid));\nsetInterval(() => {}, 1000);\n"
      );
      const start = spawn(process.execPath, [CLI_ENTRY, 'execute', 'start', '--change', 'pr-1'], {
        cwd: workDir,
        stdio: 'ignore',
      });
      const exited = new Promise<NodeJS.Signals | null>((resolve) =>
        start.on('exit', (_code, signal) => resolve(signal))
      );
      const pidFile = path.join(workDir, 'readiness.pid');
      const deadline = Date.now() + 15_000;
      while (!existsSync(pidFile) && Date.now() < deadline) {
        await sleep(50);
      }
      const commandPid = Number(await fs.readFile(pidFile, 'utf-8'));

      try {
        start.kill('SIGINT');

        expect(await exited).toBe('SIGINT');
        expect(await waitUntilStopped(commandPid)).toBe(true);
      } finally {
        stopIfAlive(commandPid);
      }
    },
    30_000
  );

  it('keeps the plan of every case when two plan commands run at the same time on one run', async () => {
    await setUp(MANUAL_EXECUTION, { cases: TWO_CASES });
    const run = await startConfirmedRun();
    await writeJson('control-plan.json', CONTROL_PLAN);
    await writeJson('control-pass.json', CONTROL_PASS);
    await writeJson('case-plan.json', CASE_PLAN);
    await writeJson('second-case-plan.json', SECOND_CASE_PLAN);
    expect((await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json'])).exitCode).toBe(0);
    expect((await cli(['record', '--run', run, '--case', 'control', 'control-pass.json'])).exitCode).toBe(0);

    const plans = await Promise.all([
      cli(['plan', '--run', run, '--case', '1.1', 'case-plan.json']),
      cli(['plan', '--run', run, '--case', '1.2', 'second-case-plan.json']),
    ]);

    expect(plans.map((result) => result.exitCode)).toEqual([0, 0]);
    const status = JSON.parse((await cli(['status', '--run', run, '--json'])).stdout);
    expect(status.cases['1.1']).toMatchObject({ status: 'planned', plan: { path: path.join('plans', '1.1.json') } });
    expect(status.cases['1.2']).toMatchObject({ status: 'planned', plan: { path: path.join('plans', '1.2.json') } });
    const runDir = path.join(workDir, 'qaspec', 'changes', 'pr-1', 'runs', run);
    expect(existsSync(path.join(runDir, 'plans', '1.1.json'))).toBe(true);
    expect(existsSync(path.join(runDir, 'plans', '1.2.json'))).toBe(true);
  }, 60_000);

  it('keeps the result of every case when two record commands run at the same time on one run', async () => {
    await setUp(MANUAL_EXECUTION, { cases: TWO_CASES });
    const run = await startConfirmedRun();
    await writeJson('control-plan.json', CONTROL_PLAN);
    await writeJson('control-pass.json', CONTROL_PASS);
    await writeJson('case-plan.json', CASE_PLAN);
    await writeJson('case-pass.json', CASE_PASS);
    await writeJson('second-case-plan.json', SECOND_CASE_PLAN);
    await writeJson('second-case-pass.json', SECOND_CASE_PASS);
    await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json']);
    await cli(['record', '--run', run, '--case', 'control', 'control-pass.json']);
    await cli(['plan', '--run', run, '--case', '1.1', 'case-plan.json']);
    await cli(['plan', '--run', run, '--case', '1.2', 'second-case-plan.json']);

    const records = await Promise.all([
      cli(['record', '--run', run, '--case', '1.1', 'case-pass.json']),
      cli(['record', '--run', run, '--case', '1.2', 'second-case-pass.json']),
    ]);

    expect(records.map((result) => result.exitCode)).toEqual([0, 0]);
    const status = JSON.parse((await cli(['status', '--run', run, '--json'])).stdout);
    expect(status.cases['1.1']).toMatchObject({ status: 'passed', attempts: [{ attempt: 1, verdict: 'passed' }] });
    expect(status.cases['1.2']).toMatchObject({ status: 'passed', attempts: [{ attempt: 1, verdict: 'passed' }] });
    const runDir = path.join(workDir, 'qaspec', 'changes', 'pr-1', 'runs', run);
    for (const key of ['1.1', '1.2']) {
      expect(existsSync(path.join(runDir, 'observations', `${key}-1.json`))).toBe(true);
      expect(existsSync(path.join(runDir, 'results', `${key}-1.json`))).toBe(true);
    }
  }, 60_000);

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
    const failed = await cli(['record', '--run', run, '--case', 'control', 'control-fail.json', '--json']);
    expect(failed.exitCode).toBe(1);
    expect(JSON.parse(failed.stdout)).toMatchObject({ attempt: 1, verdict: 'failed', outcome: 'needs-triage' });

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

  const runFolder = (run: string) => path.join(workDir, 'qaspec', 'changes', 'pr-1', 'runs', run);

  /** A confirmed run whose control case passed and whose case 1.1 failed twice, so it needs triage. */
  const runNeedingTriage = async (): Promise<string> => {
    const run = await startConfirmedRun();
    await writeJson('control-plan.json', CONTROL_PLAN);
    await writeJson('control-pass.json', CONTROL_PASS);
    await writeJson('case-plan.json', CASE_PLAN);
    await writeJson('case-fail.json', CASE_FAIL);
    await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json']);
    await cli(['record', '--run', run, '--case', 'control', 'control-pass.json']);
    await cli(['plan', '--run', run, '--case', '1.1', 'case-plan.json']);
    await cli(['record', '--run', run, '--case', '1.1', 'case-fail.json']);
    await cli(['record', '--run', run, '--case', '1.1', 'case-fail.json']);
    return run;
  };

  const ledgerText = (run: string) => readFileSync(path.join(runFolder(run), 'ledger.jsonl'), 'utf-8');

  it('triages a failed case, answers its finding and shows the evidence in status', async () => {
    await setUp();
    const run = await runNeedingTriage();
    await write(path.join('qaspec', 'changes', 'pr-1', 'runs', run, 'evidence', '1.1-2', 'console.log'), 'TypeError');

    const context = await cli(['triage-context', '--run', run, '--case', '1.1', '--json']);
    expect(context.exitCode).toBe(0);
    expect(JSON.parse(context.stdout)).toMatchObject({
      schema: 'qaspec.execution-triage-context/v1',
      run,
      case: '1.1',
      caseStatus: 'needs-triage',
      testcase: { id: '1.1', title: 'Export totals' },
      attempts: [
        { attempt: 1, verdict: 'failed', evidence: [] },
        { attempt: 2, verdict: 'failed', evidence: [path.join('evidence', '1.1-2', 'console.log')] },
      ],
    });

    const judged = await cli([
      'triage',
      '--run',
      run,
      '--case',
      '1.1',
      '--classification',
      'app',
      '--rationale',
      'The banner reports an error after a valid save',
      '--expected',
      'Saved banner shown',
      '--observed',
      'Error banner shown',
      '--json',
    ]);
    expect(judged.exitCode).toBe(0);
    expect(JSON.parse(judged.stdout)).toMatchObject({
      run,
      case: '1.1',
      classification: 'app',
      finding: {
        id: 'F1',
        case: '1.1',
        question: 'Case 1.1 expects: Saved banner shown. The run observed: Error banner shown. Is this intended?',
      },
    });

    const answered = await cli([
      'answer',
      '--run',
      run,
      '--finding',
      'F1',
      '--intended',
      'no',
      '--note',
      'The banner must say Saved',
      '--json',
    ]);
    expect(answered.exitCode).toBe(0);
    expect(JSON.parse(answered.stdout)).toMatchObject({
      run,
      finding: 'F1',
      intended: 'no',
      stage: 'confirmed',
      note: 'The banner must say Saved',
      secondsToAnswer: expect.any(Number),
    });

    const status = JSON.parse((await cli(['status', '--run', run, '--json'])).stdout);
    expect(status.cases['1.1'].status).toBe('needs-triage');
    expect(status.ledger).toEqual({ candidates: 1, environmentNoise: 0 });
    expect(ledgerText(run).trim().split('\n').map((line) => JSON.parse(line).stage)).toEqual([
      'candidate',
      'judged',
      'reported',
      'confirmed',
    ]);
    expect(readFileSync(path.join(runFolder(run), 'findings.md'), 'utf-8')).toContain('Is this intended?');
  }, 60_000);

  it('triage-context exits 1 with the reason when the case does not need triage', async () => {
    await setUp();
    const run = await startConfirmedRun();
    await writeJson('control-plan.json', CONTROL_PLAN);
    await writeJson('control-pass.json', CONTROL_PASS);
    await writeJson('case-plan.json', CASE_PLAN);
    await writeJson('case-fail.json', CASE_FAIL);
    await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json']);
    await cli(['record', '--run', run, '--case', 'control', 'control-pass.json']);
    await cli(['plan', '--run', run, '--case', '1.1', 'case-plan.json']);
    await cli(['record', '--run', run, '--case', '1.1', 'case-fail.json']);

    const result = await cli(['triage-context', '--run', run, '--case', '1.1', '--json']);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      valid: false,
      errors: [{ message: 'Case 1.1 is retry: only a case that needs triage can be triaged', case: '1.1' }],
    });
  }, 60_000);

  it('triage exits 1, names the missing --expected, and records nothing', async () => {
    await setUp();
    const run = await runNeedingTriage();

    const result = await cli([
      'triage',
      '--run',
      run,
      '--case',
      '1.1',
      '--classification',
      'app',
      '--rationale',
      'Banner',
      '--observed',
      'Error banner shown',
    ]);

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('An app judgement needs --expected');
    expect(existsSync(path.join(runFolder(run), 'findings.json'))).toBe(false);
    expect(ledgerText(run)).not.toContain('"judged"');
  }, 60_000);

  it('triage exits 1 when --expected is given for an agent judgement', async () => {
    await setUp();
    const run = await runNeedingTriage();

    const result = await cli([
      'triage',
      '--run',
      run,
      '--case',
      '1.1',
      '--classification',
      'agent',
      '--rationale',
      'Mis-click',
      '--expected',
      'Saved banner shown',
    ]);

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('--expected and --observed apply only to app judgements');
    expect(ledgerText(run)).not.toContain('"judged"');
  }, 60_000);

  it('answer exits 1 for a second answer and for an unknown finding, and keeps the first answer', async () => {
    await setUp();
    const run = await runNeedingTriage();
    await cli([
      'triage',
      '--run',
      run,
      '--case',
      '1.1',
      '--classification',
      'app',
      '--rationale',
      'Banner',
      '--expected',
      'Saved banner shown',
      '--observed',
      'Error banner shown',
    ]);
    expect((await cli(['answer', '--run', run, '--finding', 'F1', '--intended', 'yes'])).exitCode).toBe(0);

    const again = await cli(['answer', '--run', run, '--finding', 'F1', '--intended', 'no']);
    const unknown = await cli(['answer', '--run', run, '--finding', 'F7', '--intended', 'no']);

    expect(again.exitCode).toBe(1);
    expect(`${again.stdout}${again.stderr}`).toContain('was already answered');
    expect(unknown.exitCode).toBe(1);
    expect(`${unknown.stdout}${unknown.stderr}`).toContain('Finding F7 does not exist');
    expect(ledgerText(run).split('\n').filter((line) => line.includes('"dismissed"') || line.includes('"confirmed"'))).toHaveLength(1);
  }, 60_000);

  it('status --json lists the evidence files of each attempt and never a symbolic link', async () => {
    await setUp();
    const run = await runNeedingTriage();
    await write(path.join('qaspec', 'changes', 'pr-1', 'runs', run, 'evidence', '1.1-1', 'console.log'), 'log');
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-execute-outside-'));
    try {
      await fs.writeFile(path.join(outside, 'secret.txt'), 'outside the run');
      await fs.symlink(path.join(outside, 'secret.txt'), path.join(runFolder(run), 'evidence', '1.1-1', 'secret.txt'));

      const status = await cli(['status', '--run', run, '--json']);

      expect(status.exitCode).toBe(0);
      expect(JSON.parse(status.stdout).cases['1.1'].attempts.map((attempt: { evidence: string[] }) => attempt.evidence)).toEqual([
        [path.join('evidence', '1.1-1', 'console.log')],
        [],
      ]);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps both findings when two triage commands run at the same time on one run', async () => {
    await setUp(MANUAL_EXECUTION, { cases: TWO_CASES });
    const run = await startConfirmedRun();
    await writeJson('control-plan.json', CONTROL_PLAN);
    await writeJson('control-pass.json', CONTROL_PASS);
    await writeJson('case-plan.json', CASE_PLAN);
    await writeJson('case-fail.json', CASE_FAIL);
    await writeJson('second-case-plan.json', SECOND_CASE_PLAN);
    await writeJson('second-case-fail.json', observed([{ check: 'date-shown', after: 'Yesterday' }]));
    await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json']);
    await cli(['record', '--run', run, '--case', 'control', 'control-pass.json']);
    await cli(['plan', '--run', run, '--case', '1.1', 'case-plan.json']);
    await cli(['record', '--run', run, '--case', '1.1', 'case-fail.json']);
    await cli(['record', '--run', run, '--case', '1.1', 'case-fail.json']);
    await cli(['plan', '--run', run, '--case', '1.2', 'second-case-plan.json']);
    await cli(['record', '--run', run, '--case', '1.2', 'second-case-fail.json']);
    await cli(['record', '--run', run, '--case', '1.2', 'second-case-fail.json']);

    const judged = await Promise.all([
      cli([
        'triage',
        '--run',
        run,
        '--case',
        '1.1',
        '--classification',
        'app',
        '--rationale',
        'Banner',
        '--expected',
        'Saved banner shown',
        '--observed',
        'Error banner shown',
      ]),
      cli([
        'triage',
        '--run',
        run,
        '--case',
        '1.2',
        '--classification',
        'app',
        '--rationale',
        'Date',
        '--expected',
        'Today',
        '--observed',
        'Yesterday',
      ]),
    ]);

    expect(judged.map((result) => result.exitCode)).toEqual([0, 0]);
    const findings = JSON.parse(readFileSync(path.join(runFolder(run), 'findings.json'), 'utf-8'));
    expect(findings.map((finding: { id: string }) => finding.id).sort()).toEqual(['F1', 'F2']);
    expect(findings.map((finding: { case: string }) => finding.case).sort()).toEqual(['1.1', '1.2']);
    const stages = ledgerText(run)
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).stage);
    expect(stages.filter((stage) => stage === 'judged')).toHaveLength(2);
    expect(stages.filter((stage) => stage === 'reported')).toHaveLength(2);
  }, 60_000);

  it('triage and triage-context exit 1 with environment-noise once the run finished as environment-noise', async () => {
    await setUp();
    const run = await runNeedingTriage();
    await writeJson('control-fail.json', CONTROL_FAIL);
    await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json']);
    await cli(['record', '--run', run, '--case', 'control', 'control-fail.json']);
    expect((await cli(['finish', '--run', run])).exitCode).toBe(1);

    const context = await cli(['triage-context', '--run', run, '--case', '1.1', '--json']);
    const judged = await cli(['triage', '--run', run, '--case', '1.1', '--classification', 'agent', '--rationale', 'x']);

    expect(context.exitCode).toBe(1);
    expect(JSON.parse(context.stdout).errors[0].message).toContain('environment-noise');
    expect(judged.exitCode).toBe(1);
    expect(`${judged.stdout}${judged.stderr}`).toContain('environment-noise');
    expect(ledgerText(run)).not.toContain('"judged"');
  }, 60_000);

  it('lists the triage and answer subcommands in help', async () => {
    const result = await runCLI(['execute', '--help']);

    expect(result.exitCode).toBe(0);
    for (const name of ['triage-context', 'triage', 'answer']) {
      expect(result.stdout).toMatch(new RegExp(`^\\s+${name}\\s`, 'm'));
    }
  });

  it('lists the run lifecycle subcommands in help', async () => {
    const result = await runCLI(['execute', '--help']);

    expect(result.exitCode).toBe(0);
    for (const name of ['start', 'confirm', 'plan', 'record', 'finish', 'status']) {
      expect(result.stdout).toMatch(new RegExp(`^\\s+${name}\\b`, 'm'));
    }
  });

  describe('results, results-gate and tcms-map', () => {
    const runTcms = (args: string[]) => runCLI(args, { cwd: workDir });
    const readRunFile = (run: string) => JSON.parse(readFileSync(path.join(runFolder(run), 'run.json'), 'utf-8'));

    /** A confirmed run whose control case passed at the start and at the end, and whose case 1.1 passed. */
    const runFinished = async (): Promise<string> => {
      const run = await startConfirmedRun();
      await writeJson('control-plan.json', CONTROL_PLAN);
      await writeJson('control-pass.json', CONTROL_PASS);
      await writeJson('case-plan.json', CASE_PLAN);
      await writeJson('case-pass.json', CASE_PASS);
      await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json']);
      await cli(['record', '--run', run, '--case', 'control', 'control-pass.json']);
      await cli(['plan', '--run', run, '--case', '1.1', 'case-plan.json']);
      await cli(['record', '--run', run, '--case', '1.1', 'case-pass.json']);
      await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json']);
      await cli(['record', '--run', run, '--case', 'control', 'control-pass.json']);
      expect((await cli(['finish', '--run', run])).exitCode).toBe(0);
      return run;
    };

    it('results prints one entry per testcase of a finished run as JSON', async () => {
      await setUp(MANUAL_EXECUTION, { cases: TWO_CASES });
      const run = await runFinished();

      const result = await cli(['results', '--run', run, '--json']);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        schema: 'qaspec.execution-results/v1',
        run,
        change: 'pr-1',
        state: 'completed',
        results: [
          { case: '1.1', title: 'Export totals', status: 'passed', attempts: 1, comment: 'Verdict passed (attempts: 1).' },
          { case: '1.2', title: 'Export by date', status: 'skipped', attempts: 0 },
        ],
      });
    }, 60_000);

    it('results prints each testcase with its status and comment as text, then the next step', async () => {
      await setUp(MANUAL_EXECUTION, { cases: TWO_CASES });
      const run = await runFinished();

      const result = await cli(['results', '--run', run]);
      const text = result.stdout.replace(/\x1b\[[0-9;]*m/g, '');

      expect(result.exitCode).toBe(0);
      expect(text).toContain(`Results of run ${run} for change "pr-1": completed`);
      expect(text).toMatch(/passed\s+1\.1 Export totals\n {2}Verdict passed \(attempts: 1\)\./);
      expect(text).toMatch(/skipped\s+1\.2 Export by date\n {2}No verdict \(attempts: 0\)\. Skipped: never planned\./);
      expect(text).toContain(`Next: qaspec execute results-gate --run ${run}`);
    }, 60_000);

    it('results exits 1 and names the state while the run is not finished', async () => {
      await setUp();
      const run = await startConfirmedRun();

      const result = await cli(['results', '--run', run]);

      expect(result.exitCode).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain('only for a finished run');
    });

    it('results-gate exits 0, prints its token and stores the token in the run', async () => {
      await setUp();
      const run = await runFinished();
      expect(
        (await runTcms(['tcms', 'set', '--change', 'pr-1', '--provider', 'example-tcms', '--project', 'QA'])).exitCode
      ).toBe(0);

      const gate = await cli(['results-gate', '--run', run, '--json']);

      expect(gate.exitCode).toBe(0);
      const parsed = JSON.parse(gate.stdout);
      expect(parsed).toMatchObject({ run, change: 'pr-1', passed: true, failures: [] });
      expect(parsed.token).toMatch(/^results-gate:[0-9a-f]{8}$/);
      expect(readRunFile(run).resultsGate).toMatchObject({ token: parsed.token });
    }, 60_000);

    it('results-gate exits 1, lists the missing TCMS target and stores no token', async () => {
      await setUp();
      const run = await runFinished();

      const gate = await cli(['results-gate', '--run', run, '--json']);

      expect(gate.exitCode).toBe(1);
      const parsed = JSON.parse(gate.stdout);
      expect(parsed).toMatchObject({ passed: false, failures: [{ code: 'tcms-missing' }] });
      expect(parsed.token).toBeUndefined();
      expect(readRunFile(run).resultsGate).toBeUndefined();
    }, 60_000);

    it('tcms-map records the title to TCMS id mapping, and status --json shows it', async () => {
      await setUp();
      const run = await startConfirmedRun();
      const empty = JSON.parse((await cli(['status', '--run', run, '--json'])).stdout);
      expect(empty.tcms).toEqual({ schema: 'qaspec.execution-tcms/v1', run, tcmsRun: null, cases: {} });

      const mapped = await cli([
        'tcms-map',
        '--run',
        run,
        '--title',
        'Export totals',
        '--tcms-id',
        '42',
        '--tcms-run',
        '7',
        '--json',
      ]);

      expect(mapped.exitCode).toBe(0);
      const status = JSON.parse((await cli(['status', '--run', run, '--json'])).stdout);
      expect(status.tcms).toMatchObject({ tcmsRun: '7', cases: { 'Export totals': { tcmsId: '42' } } });
    });

    it('tcms-map exits 1 for a title that is not a testcase and records nothing', async () => {
      await setUp();
      const run = await startConfirmedRun();

      const result = await cli(['tcms-map', '--run', run, '--title', 'Export total', '--tcms-id', '42']);

      expect(result.exitCode).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain('is not a testcase of change "pr-1"');
      expect(JSON.parse((await cli(['status', '--run', run, '--json'])).stdout).tcms.cases).toEqual({});
    });

    it('two tcms-map commands at the same time on one run both persist their mapping', async () => {
      await setUp(MANUAL_EXECUTION, { cases: TWO_CASES });
      const run = await startConfirmedRun();

      const mapped = await Promise.all([
        cli(['tcms-map', '--run', run, '--title', 'Export totals', '--tcms-id', '42']),
        cli(['tcms-map', '--run', run, '--title', 'Export by date', '--tcms-id', '43']),
      ]);

      expect(mapped.map((result) => result.exitCode)).toEqual([0, 0]);
      const status = JSON.parse((await cli(['status', '--run', run, '--json'])).stdout);
      expect(status.tcms.cases).toEqual({
        'Export totals': { tcmsId: '42', recordedAt: expect.any(String) },
        'Export by date': { tcmsId: '43', recordedAt: expect.any(String) },
      });
    }, 60_000);

    it('runs the whole flow through the CLI: triage, finish, results, results-gate and tcms-map', async () => {
      await setUp(MANUAL_EXECUTION, { cases: TWO_CASES });
      const run = await startConfirmedRun();
      await writeJson('control-plan.json', CONTROL_PLAN);
      await writeJson('control-pass.json', CONTROL_PASS);
      await writeJson('case-plan.json', CASE_PLAN);
      await writeJson('case-fail.json', CASE_FAIL);
      await writeJson('second-case-plan.json', SECOND_CASE_PLAN);
      await writeJson('second-case-pass.json', SECOND_CASE_PASS);
      await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json']);
      await cli(['record', '--run', run, '--case', 'control', 'control-pass.json']);
      await cli(['plan', '--run', run, '--case', '1.1', 'case-plan.json']);
      await cli(['record', '--run', run, '--case', '1.1', 'case-fail.json']);
      await cli(['record', '--run', run, '--case', '1.1', 'case-fail.json']);
      await cli(['plan', '--run', run, '--case', '1.2', 'second-case-plan.json']);
      await cli(['record', '--run', run, '--case', '1.2', 'second-case-pass.json']);
      await cli(['plan', '--run', run, '--case', 'control', 'control-plan.json']);
      await cli(['record', '--run', run, '--case', 'control', 'control-pass.json']);
      const judged = await cli([
        'triage',
        '--run',
        run,
        '--case',
        '1.1',
        '--classification',
        'app',
        '--rationale',
        'The banner reports an error after a valid save',
        '--expected',
        'Saved banner shown',
        '--observed',
        'Error banner shown',
      ]);
      expect(judged.exitCode).toBe(0);
      expect((await cli(['finish', '--run', run])).exitCode).toBe(0);

      const results = await cli(['results', '--run', run, '--json']);

      expect(results.exitCode).toBe(0);
      expect(JSON.parse(results.stdout).results).toEqual([
        {
          case: '1.1',
          title: 'Export totals',
          status: 'failed',
          comment: expect.stringContaining('Finding F1: Case 1.1 expects: Saved banner shown.'),
          attempts: 2,
          evidence: [],
        },
        {
          case: '1.2',
          title: 'Export by date',
          status: 'passed',
          comment: 'Verdict passed (attempts: 1).',
          attempts: 1,
          evidence: [],
        },
      ]);
      expect(
        (await runTcms(['tcms', 'set', '--change', 'pr-1', '--provider', 'example-tcms', '--project', 'QA'])).exitCode
      ).toBe(0);
      const gate = await cli(['results-gate', '--run', run, '--json']);
      expect(gate.exitCode).toBe(0);
      expect(JSON.parse(gate.stdout).token).toMatch(/^results-gate:[0-9a-f]{8}$/);
      expect((await cli(['tcms-map', '--run', run, '--title', 'Export totals', '--tcms-id', '42'])).exitCode).toBe(0);
      expect(
        (await cli(['tcms-map', '--run', run, '--title', 'Export by date', '--tcms-id', '43', '--tcms-run', '7'])).exitCode
      ).toBe(0);
      const status = JSON.parse((await cli(['status', '--run', run, '--json'])).stdout);
      expect(status.tcms).toMatchObject({
        tcmsRun: '7',
        cases: { 'Export totals': { tcmsId: '42' }, 'Export by date': { tcmsId: '43' } },
      });
    }, 90_000);

    it('lists the results and TCMS subcommands in help', async () => {
      const result = await runCLI(['execute', '--help']);

      expect(result.exitCode).toBe(0);
      for (const name of ['results', 'results-gate', 'tcms-map']) {
        expect(result.stdout).toMatch(new RegExp(`^\\s+${name}\\s`, 'm'));
      }
    });
  });
});
