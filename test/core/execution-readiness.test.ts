import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { probeAppUrl, runReadinessCheck } from '../../src/core/execution-readiness.js';

const NODE = JSON.stringify(process.execPath);

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Polls until the process is gone; false when it still runs after the timeout. */
async function waitUntilStopped(pid: number, timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isAlive(pid)) {
    if (Date.now() >= deadline) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

async function listen(handler: Parameters<typeof createServer>[0]): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

describe('runReadinessCheck', () => {
  let projectRoot: string;
  /** Process ids written by test programs; any still running after a test is stopped. */
  let startedPids: number[];

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-readiness-'));
    startedPids = [];
  });

  afterEach(async () => {
    for (const pid of startedPids) {
      if (isAlive(pid)) {
        process.kill(pid, 'SIGKILL');
      }
    }
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  const readPid = async (file: string) => {
    const pid = Number(await fs.readFile(path.join(projectRoot, file), 'utf-8'));
    startedPids.push(pid);
    return pid;
  };

  it('passes with exit code 0 and records a duration', async () => {
    const command = `${NODE} -e "process.exit(0)"`;

    const record = await runReadinessCheck({ name: 'backend deployed', command }, { projectRoot });

    expect(record).toEqual({
      name: 'backend deployed',
      command,
      status: 'passed',
      exitCode: 0,
      durationMs: expect.any(Number),
    });
  });

  it('fails with the exit code of a non-zero exit', async () => {
    const command = `${NODE} -e "process.exit(3)"`;

    const record = await runReadinessCheck({ name: 'backend deployed', command }, { projectRoot });

    expect(record).toEqual({
      name: 'backend deployed',
      command,
      status: 'failed',
      exitCode: 3,
      durationMs: expect.any(Number),
    });
  });

  it('stops a process that ignores SIGTERM when the command times out', async () => {
    await fs.writeFile(
      path.join(projectRoot, 'leader.cjs'),
      [
        "const { spawn } = require('node:child_process');",
        "const { writeFileSync } = require('node:fs');",
        "const member = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);\"], { stdio: 'ignore' });",
        "writeFileSync('member.pid', String(member.pid));",
        'setInterval(() => {}, 1000);',
      ].join('\n')
    );

    const record = await runReadinessCheck(
      { name: 'slow member', command: `${NODE} leader.cjs` },
      { projectRoot, timeoutMs: 2_000 }
    );

    expect(record.status).toBe('timed-out');
    // Stopped when the command ends, not by a later escalation timer (the grace is 2 seconds).
    expect(await waitUntilStopped(await readPid('member.pid'), 1_000)).toBe(true);
  }, 20_000);

  it('stops a process that the command leaves running after it exits', async () => {
    await fs.writeFile(
      path.join(projectRoot, 'background.cjs'),
      [
        "const { spawn } = require('node:child_process');",
        "const { writeFileSync } = require('node:fs');",
        "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], { stdio: 'ignore' });",
        'child.unref();',
        "writeFileSync('background.pid', String(child.pid));",
      ].join('\n')
    );

    const record = await runReadinessCheck(
      { name: 'background start', command: `${NODE} background.cjs` },
      { projectRoot }
    );

    expect(record.status).toBe('passed');
    expect(await waitUntilStopped(await readPid('background.pid'), 1_000)).toBe(true);
  }, 20_000);

  it('runs the command from the project root', async () => {
    await fs.writeFile(path.join(projectRoot, 'marker.txt'), 'x');

    const record = await runReadinessCheck(
      {
        name: 'project root',
        command: `${NODE} -e "process.exit(require('fs').existsSync('marker.txt') ? 0 : 1)"`,
      },
      { projectRoot }
    );

    expect(record.status).toBe('passed');
  });

  it('stops a command that outlives the timeout and reports timed-out', async () => {
    const started = Date.now();
    const command = `${NODE} -e "setTimeout(() => {}, 60000)"`;

    const record = await runReadinessCheck({ name: 'slow backend', command }, { projectRoot, timeoutMs: 300 });

    expect(record).toEqual({
      name: 'slow backend',
      command,
      status: 'timed-out',
      exitCode: null,
      durationMs: expect.any(Number),
    });
    expect(Date.now() - started).toBeLessThan(15_000);
  });
});

describe('probeAppUrl', () => {
  let status = 200;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    status = 200;
    ({ server, baseUrl } = await listen((_request, response) => {
      response.statusCode = status;
      response.end('ok');
    }));
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('passes when the URL answers with a 2xx status', async () => {
    const record = await probeAppUrl(`${baseUrl}/health`);

    expect(record).toEqual({
      url: `${baseUrl}/health`,
      ok: true,
      httpStatus: 200,
      durationMs: expect.any(Number),
    });
  });

  it('fails on a non-2xx status and keeps the status code', async () => {
    status = 503;

    const record = await probeAppUrl(`${baseUrl}/health`);

    expect(record).toEqual({
      url: `${baseUrl}/health`,
      ok: false,
      httpStatus: 503,
      durationMs: expect.any(Number),
    });
  });

  it('fails when nothing listens on the URL', async () => {
    const closed = await listen((_request, response) => response.end());
    await new Promise((resolve) => closed.server.close(resolve));

    const record = await probeAppUrl(`${closed.baseUrl}/`);

    expect(record.ok).toBe(false);
    expect(record.httpStatus).toBeNull();
    expect(record.error).toEqual(expect.any(String));
  });

  it('fails a probe that does not answer within the timeout', async () => {
    const silent = await listen(() => {
      // Never responds.
    });

    const record = await probeAppUrl(`${silent.baseUrl}/`, { timeoutMs: 200 });
    silent.server.closeAllConnections();
    await new Promise((resolve) => silent.server.close(resolve));

    expect(record.ok).toBe(false);
    expect(record.httpStatus).toBeNull();
    expect(record.error).toMatch(/timed out/);
  });

  it('records the URL without its query string or fragment', async () => {
    const record = await probeAppUrl(`${baseUrl}/health?token=secret-value#top`);

    expect(record.url).toBe(`${baseUrl}/health`);
    expect(JSON.stringify(record)).not.toContain('secret-value');
  });
});
