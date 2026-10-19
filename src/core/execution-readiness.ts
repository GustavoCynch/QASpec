/**
 * Environment readiness for /qsx:execute runs (S4, S9).
 *
 * A readiness command comes from the project config and runs from the project root. Its output is
 * not kept or printed, because it can contain environment values; the configured command text is kept
 * with its result. A probe is one HTTP GET whose 2xx answer passes. The recorded probe URL keeps only
 * the origin and path, never a query string.
 */

import { runInProcessGroup, type ProcessGroupResult } from './process-group.js';

export const READINESS_COMMAND_TIMEOUT_MS = 120_000;
export const PROBE_TIMEOUT_MS = 10_000;

export interface ReadinessCommand {
  name: string;
  command: string;
}

export type ReadinessCheckStatus = 'passed' | 'failed' | 'timed-out';

export interface ReadinessCheckRecord {
  name: string;
  /** The command text as configured. */
  command: string;
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
 * Runs one readiness command through the shell, in its own process group on POSIX: a timed-out
 * command and the processes it started are stopped, and so is any process it leaves running when it
 * ends. Interrupting QASpec stops the command too.
 */
export async function runReadinessCheck(check: ReadinessCommand, options: ReadinessOptions): Promise<ReadinessCheckRecord> {
  const started = Date.now();
  let outcome: ProcessGroupResult;
  try {
    outcome = await runInProcessGroup({
      command: check.command,
      shell: true,
      cwd: options.projectRoot,
      timeoutMs: options.timeoutMs ?? READINESS_COMMAND_TIMEOUT_MS,
      captureOutput: false,
    });
  } catch {
    // The shell could not start the command.
    return { name: check.name, command: check.command, status: 'failed', exitCode: null, durationMs: Date.now() - started };
  }

  let status: ReadinessCheckStatus = 'failed';
  if (outcome.timedOut) {
    status = 'timed-out';
  } else if (outcome.exitCode === 0) {
    status = 'passed';
  }
  return {
    name: check.name,
    command: check.command,
    status,
    exitCode: outcome.exitCode,
    durationMs: Date.now() - started,
  };
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
