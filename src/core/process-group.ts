/**
 * Runs one child process in its own process group, so the processes it starts can be stopped with it.
 *
 * On POSIX the child leads its group. A timed-out child gets SIGTERM and then SIGKILL after
 * KILL_GRACE_MS; when the child ends, whatever it left running in the group is killed; and SIGINT,
 * SIGTERM or SIGHUP to QASpec stops the group, runs onInterrupt and ends QASpec with that signal. A
 * detached child does not get the terminal's Ctrl+C, so this is what keeps it from outliving QASpec.
 * Windows has no process groups: only the child itself is stopped.
 */

import { spawn, type StdioOptions } from 'node:child_process';

/** Time a timed-out child gets after SIGTERM before its group is killed. */
export const KILL_GRACE_MS = 2_000;

/** Time allowed for remaining output to drain after the child exits. */
const EXIT_GRACE_MS = 500;

/** Signals that would end QASpec while the child runs; on POSIX they no longer reach the child. */
const FORWARDED_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

interface ProcessGroupBase {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  /** When false, stdout and stderr are discarded and the result has no output. */
  captureOutput: boolean;
  /** Runs when a forwarded signal arrives, before the group is stopped and QASpec ends. */
  onInterrupt?: () => void;
}

/** Either a program with its arguments, or a command line for the shell. */
export type ProcessGroupOptions = ProcessGroupBase &
  (
    | { file: string; args?: string[]; command?: undefined; shell?: undefined }
    | { command: string; shell: true; file?: undefined; args?: undefined }
  );

export interface ProcessGroupResult {
  /** Null when the child was stopped by a signal. */
  exitCode: number | null;
  /** Captured stdout and stderr in arrival order; empty when capture is off. */
  output: string;
  /** True when the timeout stopped the child. */
  timedOut: boolean;
}

/** Rejects only when the child cannot be started at all. */
export function runInProcessGroup(options: ProcessGroupOptions): Promise<ProcessGroupResult> {
  return new Promise((resolve, reject) => {
    const ownGroup = process.platform !== 'win32';
    const stdio: StdioOptions = options.captureOutput ? ['ignore', 'pipe', 'pipe'] : 'ignore';
    const spawnOptions = { cwd: options.cwd, env: options.env, stdio, detached: ownGroup };
    const child =
      options.shell === true
        ? spawn(options.command, { ...spawnOptions, shell: true })
        : spawn(options.file, options.args ?? [], spawnOptions);

    let output = '';
    let timedOut = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    let exitGraceTimer: NodeJS.Timeout | undefined;
    // Decoding per stream keeps a multi-byte character split across chunks intact for redaction.
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => (output += chunk));
    child.stderr?.on('data', (chunk: string) => (output += chunk));

    const signalGroup = (signal: NodeJS.Signals) => {
      try {
        if (ownGroup && child.pid !== undefined) {
          process.kill(-child.pid, signal);
        } else {
          child.kill(signal);
        }
      } catch {
        // Already gone.
      }
    };

    const removeSignalForwarding = () => {
      for (const signal of FORWARDED_SIGNALS) {
        process.removeListener(signal, onParentSignal);
      }
    };
    const onParentSignal = (signal: NodeJS.Signals) => {
      removeSignalForwarding();
      signalGroup('SIGKILL');
      try {
        options.onInterrupt?.();
      } catch {
        // The cleanup is best effort; ending with the received signal must still happen.
      }
      process.kill(process.pid, signal);
    };
    if (ownGroup) {
      for (const signal of FORWARDED_SIGNALS) {
        process.on(signal, onParentSignal);
      }
    }

    // Whatever the child left running in its group is stopped here, so none of it outlives the command.
    const finish = (exitCode: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      removeSignalForwarding();
      clearTimeout(timer);
      clearTimeout(killTimer);
      clearTimeout(exitGraceTimer);
      signalGroup('SIGKILL');
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve({ exitCode, output, timedOut });
    };
    timer = setTimeout(() => {
      timedOut = true;
      signalGroup('SIGTERM');
      // Not unref'd: the escalation must still fire when the child has already exited.
      killTimer = setTimeout(() => signalGroup('SIGKILL'), KILL_GRACE_MS);
    }, options.timeoutMs);

    child.on('error', (error) => {
      settled = true;
      removeSignalForwarding();
      clearTimeout(timer);
      clearTimeout(killTimer);
      clearTimeout(exitGraceTimer);
      reject(error);
    });
    // 'close' waits for every output pipe, which a process started by the child can keep open after
    // the child exits; the child's own exit decides once the remaining output drains.
    child.on('exit', (exitCode) => {
      if (timedOut) {
        finish(exitCode);
      } else {
        exitGraceTimer = setTimeout(() => finish(exitCode), EXIT_GRACE_MS);
      }
    });
    child.on('close', (exitCode) => finish(exitCode));
  });
}
