/**
 * Environment readiness for /qsx:execute runs (S4, S9).
 *
 * A readiness command comes from the project config and runs from the project root. Its output is
 * not kept or printed, because it can contain environment values. A probe is one HTTP GET whose 2xx
 * answer passes. The recorded probe URL keeps only the origin and path, never a query string.
 */

import { spawn } from 'node:child_process';

export const READINESS_COMMAND_TIMEOUT_MS = 120_000;
export const PROBE_TIMEOUT_MS = 10_000;

/** Time a timed-out command gets after SIGTERM before its process group is killed. */
const KILL_GRACE_MS = 2_000;

export interface ReadinessCommand {
  name: string;
  command: string;
}

export type ReadinessCheckStatus = 'passed' | 'failed' | 'timed-out';

export interface ReadinessCheckRecord {
  name: string;
  status: ReadinessCheckStatus;
  /** Null when the command was stopped by a signal or could not start. */
  exitCode: number | null;
  durationMs: number;
}

export interface ProbeRecord {
  url: string;
  ok: boolean;
  httpStatus: number | null;
  durationMs: number;
  error?: string;
}

export interface ReadinessOptions {
  projectRoot: string;
  timeoutMs?: number;
}

/**
 * Runs one readiness command through the shell. On POSIX it leads its own process group, so a
 * timed-out command and the processes it started are stopped together: SIGTERM, then SIGKILL.
 */
export function runReadinessCheck(check: ReadinessCommand, options: ReadinessOptions): Promise<ReadinessCheckRecord> {
  return new Promise((resolve) => {
    const started = Date.now();
    const ownGroup = process.platform !== 'win32';
    const timeoutMs = options.timeoutMs ?? READINESS_COMMAND_TIMEOUT_MS;
    let timedOut = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const finish = (status: ReadinessCheckStatus, exitCode: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ name: check.name, status, exitCode, durationMs: Date.now() - started });
    };

    // Output is ignored on purpose: nothing from the command reaches the terminal or the run record.
    const child = spawn(check.command, {
      cwd: options.projectRoot,
      shell: true,
      stdio: 'ignore',
      detached: ownGroup,
    });

    const signalCommand = (signal: NodeJS.Signals) => {
      try {
        if (ownGroup && child.pid !== undefined) {
          process.kill(-child.pid, signal);
        } else {
          child.kill(signal);
        }
      } catch {
        // The command has already exited.
      }
    };

    timer = setTimeout(() => {
      timedOut = true;
      signalCommand('SIGTERM');
      killTimer = setTimeout(() => signalCommand('SIGKILL'), KILL_GRACE_MS);
      killTimer.unref();
    }, timeoutMs);

    child.on('error', () => finish('failed', null));
    child.on('exit', (exitCode) => {
      if (timedOut) {
        finish('timed-out', exitCode);
      } else {
        finish(exitCode === 0 ? 'passed' : 'failed', exitCode);
      }
    });
  });
}

/** Keeps the origin and path of a URL; the query string and fragment can carry secrets. */
export function redactProbeUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

function describeProbeError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return `timed out after ${timeoutMs} ms`;
  }
  const code = (error as { cause?: { code?: unknown } } | undefined)?.cause?.code;
  return typeof code === 'string' ? `request failed (${code})` : 'request failed';
}

/** One HTTP GET; a 2xx answer passes, anything else or no answer in time fails. */
export async function probeAppUrl(value: string, options: { timeoutMs?: number } = {}): Promise<ProbeRecord> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
  const url = redactProbeUrl(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(value, { method: 'GET', signal: controller.signal });
    await response.body?.cancel().catch(() => undefined);
    return {
      url,
      ok: response.status >= 200 && response.status < 300,
      httpStatus: response.status,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      url,
      ok: false,
      httpStatus: null,
      durationMs: Date.now() - started,
      error: describeProbeError(error, timeoutMs),
    };
  } finally {
    clearTimeout(timer);
  }
}
