import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawn } from 'child_process';
import { existsSync, promises as fs } from 'fs';
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

  it('exits with code 1 when the credentials file is not ignored by git', async () => {
    await write('.gitignore', '.qaspec/auth/\n');

    const result = await runCLI(['execute', 'login'], { cwd: projectRoot });

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('.env.qa is not ignored by git');
  });
});
