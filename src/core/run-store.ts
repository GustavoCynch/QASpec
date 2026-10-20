/**
 * Storage shared by the run commands: /qsx:execute today, /qsx:catch from T5b (design in L19, S11).
 *
 * A run is a folder with a ledger.jsonl and a write lock. This module holds what every run command needs and
 * knows nothing about a run's state or its cases: run ids, atomic file writes, the write lock, and the ledger
 * lines. The lock's busy message names the command that holds it, so each caller names its own command.
 */

import { randomBytes } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const LEDGER_FILE = 'ledger.jsonl';
const RUN_ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{6}$/;

/** Run id: UTC timestamp plus a short random suffix. Anything else is refused before it names a path. */
export function generateRunId(now: Date = new Date(), suffix: Uint8Array = randomBytes(3)): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${stamp}-${Buffer.from(suffix).toString('hex')}`;
}

export function isValidRunId(runId: string): boolean {
  return RUN_ID_PATTERN.test(runId);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Writes a file through a temporary sibling and a rename, so a reader sees the old file or the new one. */
export function writeFileAtomic(filePath: string, text: string): void {
  const temp = `${filePath}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(temp, text, { flag: 'wx' });
  renameSync(temp, filePath);
}

/** Write lock of a run: a folder created atomically, whose owner.json holds the owner's pid and time. */
const LOCK_DIRNAME = '.lock';
const LOCK_OWNER_FILE = 'owner.json';
/** How long a write waits for another command on the same run before it fails. */
export const RUN_LOCK_TIMEOUT_MS = 10_000;
/** Pause between attempts to take the lock. */
const LOCK_RETRY_MS = 25;
/** The command named in the busy message when a caller names none. */
const DEFAULT_LOCK_COMMAND = 'qaspec';

/** Who takes a run lock: the command named in the busy message, and how long to wait for another holder. */
export interface RunLockOptions {
  /** The command that holds the lock, for example "qaspec execute". */
  command: string;
  /** Defaults to RUN_LOCK_TIMEOUT_MS. */
  timeoutMs?: number;
}

interface LockOwner {
  pid: number;
  token: string;
  acquiredAt: string;
}

/** Waits synchronously: the run commands are synchronous, so their lock wait is too. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readLockOwner(lockDir: string): LockOwner | undefined {
  try {
    const owner = JSON.parse(readFileSync(path.join(lockDir, LOCK_OWNER_FILE), 'utf-8')) as Partial<LockOwner>;
    return typeof owner.pid === 'number' && typeof owner.token === 'string' ? (owner as LockOwner) : undefined;
  } catch {
    return undefined;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * A lock is stale when its owner has exited. A folder whose owner file never appeared (a crash between
 * creating the folder and writing the file) is stale once it is older than the lock timeout.
 */
function isStaleLock(lockDir: string): boolean {
  const owner = readLockOwner(lockDir);
  if (owner) {
    return !isProcessAlive(owner.pid);
  }
  try {
    return Date.now() - statSync(lockDir).mtimeMs > RUN_LOCK_TIMEOUT_MS;
  } catch {
    // Released meanwhile: the caller creates the lock again.
    return false;
  }
}

/**
 * Removes a stale lock without deleting a live lock that replaced it in the meantime: the folder is
 * moved aside first, and moved back when its owner is not the stale one.
 */
function removeStaleLock(lockDir: string): void {
  const staleToken = readLockOwner(lockDir)?.token;
  const parked = `${lockDir}.stale-${randomBytes(4).toString('hex')}`;
  try {
    renameSync(lockDir, parked);
  } catch {
    // Another command removed it first.
    return;
  }
  if (readLockOwner(parked)?.token === staleToken) {
    rmSync(parked, { recursive: true, force: true });
    return;
  }
  try {
    renameSync(parked, lockDir);
  } catch {
    // Another command took the path meanwhile; the moved folder stays beside it for manual removal.
  }
}

function busyLockError(runDir: string, owner: LockOwner | undefined, command: string): Error {
  const holder = owner ? ` (pid ${owner.pid}, since ${owner.acquiredAt})` : '';
  return new Error(
    `Run ${path.basename(runDir)} is busy: another ${command} command holds its lock${holder}. ` +
      `Retry when it finishes; if no qaspec command is running, delete the ${LOCK_DIRNAME} folder in the run folder.`
  );
}

/**
 * Takes the write lock of a run and returns its release. Only one command holds the lock at a time: a
 * command waits with short backoff while a live owner holds it, takes over a stale one, and fails with
 * a clear message after the timeout. Reads do not take the lock.
 */
export function acquireRunLock(
  runDir: string,
  timeoutMs: number = RUN_LOCK_TIMEOUT_MS,
  command: string = DEFAULT_LOCK_COMMAND
): () => void {
  const lockDir = path.join(runDir, LOCK_DIRNAME);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      mkdirSync(lockDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw busyLockError(runDir, readLockOwner(lockDir), command);
      }
      if (isStaleLock(lockDir)) {
        removeStaleLock(lockDir);
      } else {
        sleepSync(LOCK_RETRY_MS);
      }
      continue;
    }

    const token = randomBytes(8).toString('hex');
    try {
      writeFileSync(
        path.join(lockDir, LOCK_OWNER_FILE),
        `${JSON.stringify({ pid: process.pid, token, acquiredAt: nowIso() })}\n`,
        { flag: 'wx' }
      );
    } catch (error) {
      rmSync(lockDir, { recursive: true, force: true });
      throw error;
    }
    return () => releaseRunLock(lockDir, token);
  }
}

/** Removes the lock only while this command still owns it. */
function releaseRunLock(lockDir: string, token: string): void {
  if (readLockOwner(lockDir)?.token === token) {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

/**
 * Runs one write of a run under its lock; the lock is released even when the write throws. The wait is
 * bounded by options.timeoutMs, which defaults to RUN_LOCK_TIMEOUT_MS.
 */
export function withRunLock<T>(runDir: string, write: () => T, options: RunLockOptions): T {
  const release = acquireRunLock(runDir, options.timeoutMs, options.command);
  try {
    return write();
  } finally {
    release();
  }
}

export function readLedger(runDir: string): Array<Record<string, unknown>> {
  const file = path.join(runDir, LEDGER_FILE);
  if (!existsSync(file)) {
    return [];
  }
  return readFileSync(file, 'utf-8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Appends one line to ledger.jsonl; each stage of a case or a finding is one line. */
export function appendLedgerEntry(runDir: string, entry: Record<string, unknown>): void {
  appendFileSync(path.join(runDir, LEDGER_FILE), `${JSON.stringify(entry)}\n`);
}
