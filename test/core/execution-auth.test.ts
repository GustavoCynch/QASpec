import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, promises as fs, statSync } from 'fs';
import os from 'os';
import path from 'path';
import { executeLogin } from '../../src/core/execution-auth.js';

const USERNAME = 'qa-user@example.test';
const PASSWORD = 'S3cret-Pa55word';

const WRITE_SESSION_SCRIPT = `
import { writeFileSync } from 'node:fs';
console.log('logging in as ' + process.env.QA_USERNAME + ' with ' + process.env.QA_PASSWORD);
writeFileSync(process.env.QASPEC_STORAGE_STATE, JSON.stringify({
  cookies: [],
  origins: [{ origin: process.env.QASPEC_APP_URL, localStorage: [{ name: 'user', value: process.env.QA_USERNAME }] }],
}));
writeFileSync('login-ran.marker', 'yes');
`;

const AUTH_CONFIG = `schema: qaspec-pr-review
execution:
  app:
    url: https://app.example.test
  auth:
    envFile: .env.qa
    requiredVariables: [QA_USERNAME, QA_PASSWORD]
    loginScript: scripts/login.mjs
    storageState: .qaspec/auth/storage-state.json
`;

describe('execution-auth', () => {
  let projectRoot: string;

  const write = async (relativePath: string, content: string) => {
    const target = path.join(projectRoot, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  };

  const git = (...args: string[]) => execFileSync('git', args, { cwd: projectRoot, stdio: 'pipe' });

  const setUpProject = async (
    options: { config?: string; gitignore?: string; env?: string; script?: string; gitInit?: boolean } = {}
  ) => {
    if (options.gitInit !== false) {
      git('init', '-q');
    }
    await write(path.join('qaspec', 'config.yaml'), options.config ?? AUTH_CONFIG);
    await write('.gitignore', options.gitignore ?? '.env.qa\n.qaspec/auth/\n');
    await write('.env.qa', options.env ?? `QA_USERNAME=${USERNAME}\nQA_PASSWORD=${PASSWORD}\n`);
    await write(path.join('scripts', 'login.mjs'), options.script ?? WRITE_SESSION_SCRIPT);
  };

  const sessionPath = () => path.join(projectRoot, '.qaspec', 'auth', 'storage-state.json');
  const loginRan = () => existsSync(path.join(projectRoot, 'login-ran.marker'));

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-execution-auth-'));
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('saves the session and passes credentials and the session path to the login script', async () => {
    await setUpProject();

    const result = await executeLogin(projectRoot);

    expect(result.storageStatePath).toBe(sessionPath());
    const session = JSON.parse(await fs.readFile(sessionPath(), 'utf-8'));
    expect(session.origins[0]).toEqual({
      origin: 'https://app.example.test',
      localStorage: [{ name: 'user', value: USERNAME }],
    });
    if (process.platform !== 'win32') {
      expect(statSync(sessionPath()).mode & 0o777).toBe(0o600);
    }
  });

  it('redacts credential values from the login script output', async () => {
    await setUpProject();

    const result = await executeLogin(projectRoot);

    expect(result.output).toContain('logging in as [redacted] with [redacted]');
    expect(result.output).not.toContain(PASSWORD);
    expect(result.output).not.toContain(USERNAME);
  });

  it('refuses to run when the credentials file is not ignored by git', async () => {
    await setUpProject({ gitignore: '.qaspec/auth/\n' });

    await expect(executeLogin(projectRoot)).rejects.toThrow(/\.env\.qa is not ignored by git/);
    expect(loginRan()).toBe(false);
  });

  it('refuses to run when the session file is not ignored by git', async () => {
    await setUpProject({ gitignore: '.env.qa\n' });

    await expect(executeLogin(projectRoot)).rejects.toThrow(
      /\.qaspec\/auth\/storage-state\.json is not ignored by git/
    );
    expect(loginRan()).toBe(false);
  });

  it('refuses to run when the credentials file is tracked by git', async () => {
    await setUpProject();
    git('add', '--force', '.env.qa');

    await expect(executeLogin(projectRoot)).rejects.toThrow(/\.env\.qa is tracked by git/);
    expect(loginRan()).toBe(false);
  });

  it('refuses to run outside a git repository', async () => {
    await setUpProject({ gitInit: false });

    await expect(executeLogin(projectRoot)).rejects.toThrow(/not inside a git repository/);
    expect(loginRan()).toBe(false);
  });

  it('lists the auth settings that are missing', async () => {
    await setUpProject({
      config: `schema: qaspec-pr-review
execution:
  auth:
    envFile: .env.qa
`,
    });

    const failure = executeLogin(projectRoot);

    await expect(failure).rejects.toThrow(/execution\.auth\.loginScript/);
    await expect(executeLogin(projectRoot)).rejects.toThrow(/execution\.auth\.storageState/);
    expect(loginRan()).toBe(false);
  });

  it('reports missing required variables without revealing values', async () => {
    await setUpProject({ env: `QA_USERNAME=${USERNAME}\n` });

    const error = await executeLogin(projectRoot).catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/QA_PASSWORD/);
    expect((error as Error).message).not.toContain(USERNAME);
    expect(loginRan()).toBe(false);
  });

  it('reports a missing credentials file', async () => {
    await setUpProject();
    await fs.rm(path.join(projectRoot, '.env.qa'));

    await expect(executeLogin(projectRoot)).rejects.toThrow(/\.env\.qa was not found/);
    expect(loginRan()).toBe(false);
  });

  it('fails with redacted output when the login script exits with an error', async () => {
    await setUpProject({
      script: `console.error('bad password ' + process.env.QA_PASSWORD); process.exit(3);`,
    });

    const error = await executeLogin(projectRoot).catch((caught: Error) => caught);

    expect((error as Error).message).toMatch(/exited with code 3/);
    expect((error as Error).message).toContain('bad password [redacted]');
    expect((error as Error).message).not.toContain(PASSWORD);
  });

  it('fails when the login script does not write a valid session', async () => {
    await setUpProject({ script: `console.log('done');` });

    await expect(executeLogin(projectRoot)).rejects.toThrow(/did not write a valid storage state/);
  });

  it('fails when the login script exceeds the timeout', async () => {
    await setUpProject({ script: `setInterval(() => {}, 1000);` });

    await expect(executeLogin(projectRoot, { timeoutMs: 300 })).rejects.toThrow(/timed out/);
  });

  it('stops a login script that ignores the termination signal', async () => {
    await setUpProject({ script: `process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);` });
    const started = Date.now();

    await expect(executeLogin(projectRoot, { timeoutMs: 300 })).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(8_000);
  }, 15_000);

  it.skipIf(process.platform === 'win32')(
    'stops waiting when a process started by the login script keeps its output open',
    async () => {
      await setUpProject({
        script: `import { spawn } from 'node:child_process';
spawn('sleep', ['12'], { stdio: 'inherit' });
setInterval(() => {}, 1000);`,
      });
      const started = Date.now();

      await expect(executeLogin(projectRoot, { timeoutMs: 300 })).rejects.toThrow(/timed out/);
      expect(Date.now() - started).toBeLessThan(8_000);
    },
    15_000
  );

  it('removes the session when the login script fails after writing it', async () => {
    await setUpProject({
      script: `import { writeFileSync } from 'node:fs';
writeFileSync(process.env.QASPEC_STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
process.exit(3);`,
    });

    await expect(executeLogin(projectRoot)).rejects.toThrow(/exited with code 3/);
    expect(existsSync(sessionPath())).toBe(false);
  });

  it('does not accept a session left by an earlier login', async () => {
    await setUpProject({ script: `console.log('done');` });
    await write(
      path.join('.qaspec', 'auth', 'storage-state.json'),
      JSON.stringify({ cookies: [], origins: [] })
    );

    await expect(executeLogin(projectRoot)).rejects.toThrow(/did not write a valid storage state/);
    expect(existsSync(sessionPath())).toBe(false);
  });

  it('refuses to run when the session file is tracked by git', async () => {
    await setUpProject();
    await write(path.join('.qaspec', 'auth', 'storage-state.json'), '{}');
    git('add', '--force', '.qaspec/auth/storage-state.json');

    await expect(executeLogin(projectRoot)).rejects.toThrow(/storage-state\.json is tracked by git/);
    expect(loginRan()).toBe(false);
  });

  it('refuses a session path that points at the credentials file', async () => {
    await setUpProject({
      config: AUTH_CONFIG.replace('.qaspec/auth/storage-state.json', './.env.qa'),
    });

    await expect(executeLogin(projectRoot)).rejects.toThrow(
      /storageState must not be the same file as execution\.auth\.envFile/
    );
    expect(await fs.readFile(path.join(projectRoot, '.env.qa'), 'utf-8')).toContain(PASSWORD);
    expect(loginRan()).toBe(false);
  });

  it('redacts credentials the login script prints in escaped form', async () => {
    const password = 'p"ss\\word';
    await setUpProject({
      env: `QA_USERNAME=${USERNAME}\nQA_PASSWORD='${password}'\n`,
      script: `import { writeFileSync } from 'node:fs';
console.log(JSON.stringify({ password: process.env.QA_PASSWORD }));
writeFileSync(process.env.QASPEC_STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));`,
    });

    const result = await executeLogin(projectRoot);

    expect(result.output).toContain('{"password":"[redacted]"}');
    expect(result.output).not.toContain('ss\\\\word');
  });

  it('rejects login scripts that node cannot run', async () => {
    await setUpProject({ config: AUTH_CONFIG.replace('scripts/login.mjs', 'scripts/login.sh') });

    await expect(executeLogin(projectRoot)).rejects.toThrow(/\.js, \.mjs or \.cjs/);
  });
});
