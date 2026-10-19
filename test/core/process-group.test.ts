import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInProcessGroup } from '../../src/core/process-group.js';

const NODE = process.execPath;

describe('runInProcessGroup', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-process-group-'));
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it('returns the exit code and the captured output of a program', async () => {
    const result = await runInProcessGroup({
      file: NODE,
      args: ['-e', "console.log('hello'); process.exit(4)"],
      cwd,
      timeoutMs: 10_000,
      captureOutput: true,
    });

    expect(result).toEqual({ exitCode: 4, output: 'hello\n', timedOut: false });
  });

  it('runs a shell command when shell is requested', async () => {
    const result = await runInProcessGroup({
      command: `${JSON.stringify(NODE)} -e "console.log('from shell')"`,
      shell: true,
      cwd,
      timeoutMs: 10_000,
      captureOutput: true,
    });

    expect(result).toEqual({ exitCode: 0, output: 'from shell\n', timedOut: false });
  });

  it('runs the program from the working directory it is given', async () => {
    await fs.writeFile(path.join(cwd, 'marker.txt'), 'x');

    const result = await runInProcessGroup({
      file: NODE,
      args: ['-e', "process.exit(require('node:fs').existsSync('marker.txt') ? 0 : 1)"],
      cwd,
      timeoutMs: 10_000,
      captureOutput: false,
    });

    expect(result.exitCode).toBe(0);
  });

  it('passes the environment it is given', async () => {
    const result = await runInProcessGroup({
      file: NODE,
      args: ['-e', 'console.log(process.env.QASPEC_TEST_VALUE)'],
      cwd,
      env: { ...process.env, QASPEC_TEST_VALUE: 'visible' },
      timeoutMs: 10_000,
      captureOutput: true,
    });

    expect(result.output).toBe('visible\n');
  });

  it('drops the output when capture is off', async () => {
    const result = await runInProcessGroup({
      file: NODE,
      args: ['-e', "console.log('not kept')"],
      cwd,
      timeoutMs: 10_000,
      captureOutput: false,
    });

    expect(result).toEqual({ exitCode: 0, output: '', timedOut: false });
  });

  it('reports a timeout and stops the program', async () => {
    const started = Date.now();

    const result = await runInProcessGroup({
      file: NODE,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd,
      timeoutMs: 300,
      captureOutput: true,
    });

    expect(result.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(8_000);
  });

  it('rejects when the program cannot be started', async () => {
    await expect(
      runInProcessGroup({
        file: path.join(cwd, 'missing-program'),
        cwd,
        timeoutMs: 10_000,
        captureOutput: false,
      })
    ).rejects.toThrow();
  });
});
