import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { runCLI } from '../helpers/run-cli.js';

const PASSWORD = 'S3cret-Pa55word';

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

  it('exits with code 1 when the credentials file is not ignored by git', async () => {
    await write('.gitignore', '.qaspec/auth/\n');

    const result = await runCLI(['execute', 'login'], { cwd: projectRoot });

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('.env.qa is not ignored by git');
  });
});
