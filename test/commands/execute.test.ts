import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawn } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, promises as fs, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureCliBuilt, runCLI } from '../helpers/run-cli.js';

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
