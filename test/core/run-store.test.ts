import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, promises as fs, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  acquireRunLock,
  appendLedgerEntry,
  generateRunId,
  isValidRunId,
  readLedger,
  withRunLock,
  writeFileAtomic,
} from '../../src/core/run-store.js';

const LOCKED_AT = '2026-10-19T12:00:00.000Z';

/** The message a thrown error carries, so the test compares the whole text and not a fragment. */
const thrownMessage = (action: () => unknown): string => {
  try {
    action();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the action to throw');
};

describe('run store', () => {
  let runDir: string;
  let lockDir: string;

  beforeEach(async () => {
    runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-run-store-'));
    lockDir = path.join(runDir, '.lock');
  });

  afterEach(async () => {
    await fs.rm(runDir, { recursive: true, force: true });
  });

  const holdLock = async (owner: Record<string, unknown>) => {
    await fs.mkdir(lockDir);
    await fs.writeFile(path.join(lockDir, 'owner.json'), `${JSON.stringify(owner)}\n`);
  };

  const lockOwner = () => JSON.parse(readFileSync(path.join(lockDir, 'owner.json'), 'utf-8'));

  const busyMessage = (command: string, pid: number) =>
    `Run ${path.basename(runDir)} is busy: another ${command} command holds its lock (pid ${pid}, since ${LOCKED_AT}). ` +
    'Retry when it finishes; if no qaspec command is running, delete the .lock folder in the run folder.';

  describe('run ids', () => {
    it('generates a UTC timestamp id with a short random suffix', () => {
      expect(generateRunId(new Date('2026-10-19T16:30:00.123Z'), Buffer.from([0xab, 0xcd, 0xef]))).toBe(
        '20261019T163000Z-abcdef'
      );
    });

    it('generates ids that pass the same validation', () => {
      expect(isValidRunId(generateRunId())).toBe(true);
    });

    it('accepts only the timestamp and six lowercase hex digits', () => {
      expect(isValidRunId('20261019T163000Z-abcdef')).toBe(true);

      for (const id of [
        '../../x',
        '20261019T163000Z-abcdef/..',
        '20261019T163000Z-ABCDEF',
        '20261019T163000Z-abcde',
        '20261019T163000-abcdef',
        '20261019T163000Z-abcdef\n',
      ]) {
        expect(isValidRunId(id), id).toBe(false);
      }
    });
  });

  describe('writeFileAtomic', () => {
    it('replaces the file with the new text and leaves no temporary sibling', () => {
      const file = path.join(runDir, 'run.json');

      writeFileAtomic(file, '{"state":"ready"}\n');
      writeFileAtomic(file, '{"state":"completed"}\n');

      expect(readFileSync(file, 'utf-8')).toBe('{"state":"completed"}\n');
      expect(readdirSync(runDir)).toEqual(['run.json']);
    });
  });

  describe('run lock', () => {
    it('writes the owner pid, a token and the time, and removes the lock on release', () => {
      const release = acquireRunLock(runDir);

      const owner = lockOwner();
      expect(owner).toEqual({
        pid: process.pid,
        token: expect.stringMatching(/^[0-9a-f]{16}$/),
        acquiredAt: expect.any(String),
      });
      expect(new Date(owner.acquiredAt).toISOString()).toBe(owner.acquiredAt);

      release();
      expect(existsSync(lockDir)).toBe(false);
    });

    it('waits for a live owner, fails after the timeout and leaves its lock in place', async () => {
      await holdLock({ pid: process.pid, token: 'held', acquiredAt: LOCKED_AT });

      expect(thrownMessage(() => acquireRunLock(runDir, 300, 'qaspec catch'))).toBe(
        busyMessage('qaspec catch', process.pid)
      );
      expect(lockOwner()).toEqual({ pid: process.pid, token: 'held', acquiredAt: LOCKED_AT });
    });

    it('names the generic qaspec command when the caller names none', async () => {
      await holdLock({ pid: process.pid, token: 'held', acquiredAt: LOCKED_AT });

      expect(thrownMessage(() => acquireRunLock(runDir, 300))).toBe(busyMessage('qaspec', process.pid));
    });

    it('names qaspec execute in the busy message byte for byte', async () => {
      await holdLock({ pid: process.pid, token: 'held', acquiredAt: LOCKED_AT });

      expect(thrownMessage(() => withRunLock(runDir, () => 'unused', { command: 'qaspec execute', timeoutMs: 100 }))).toBe(
        busyMessage('qaspec execute', process.pid)
      );
    });

    it('takes over a lock whose owner process has exited', async () => {
      const exitedPid = spawnSync(process.execPath, ['-e', '']).pid as number;
      await holdLock({ pid: exitedPid, token: 'stale', acquiredAt: LOCKED_AT });

      const release = acquireRunLock(runDir, 2_000);

      expect(lockOwner()).toMatchObject({ pid: process.pid });
      release();
      expect(existsSync(lockDir)).toBe(false);
    });

    it('takes over a lock without an owner file once it is older than the lock timeout', async () => {
      await fs.mkdir(lockDir);
      const past = new Date(Date.now() - 60_000);
      utimesSync(lockDir, past, past);

      const release = acquireRunLock(runDir, 2_000);

      expect(lockOwner()).toMatchObject({ pid: process.pid });
      release();
      expect(existsSync(lockDir)).toBe(false);
    });

    it('does not remove a lock that another owner took after this one was acquired', async () => {
      const release = acquireRunLock(runDir);
      await fs.writeFile(
        path.join(lockDir, 'owner.json'),
        `${JSON.stringify({ pid: process.pid, token: 'other', acquiredAt: LOCKED_AT })}\n`
      );

      release();

      expect(lockOwner().token).toBe('other');
    });

    it('returns the result of the write and releases the lock when the write throws', () => {
      expect(withRunLock(runDir, () => 42, { command: 'qaspec catch' })).toBe(42);
      expect(existsSync(lockDir)).toBe(false);

      expect(() =>
        withRunLock(
          runDir,
          () => {
            throw new Error('write refused');
          },
          { command: 'qaspec catch' }
        )
      ).toThrow('write refused');
      expect(existsSync(lockDir)).toBe(false);
    });
  });

  describe('ledger', () => {
    it('reads no entries while the ledger does not exist', () => {
      expect(readLedger(runDir)).toEqual([]);
    });

    it('appends one JSON line per entry and reads the entries back in order', () => {
      appendLedgerEntry(runDir, { stage: 'candidate', case: '1.1' });
      appendLedgerEntry(runDir, { stage: 'judged', case: '1.1', classification: 'app' });

      expect(readFileSync(path.join(runDir, 'ledger.jsonl'), 'utf-8')).toBe(
        '{"stage":"candidate","case":"1.1"}\n{"stage":"judged","case":"1.1","classification":"app"}\n'
      );
      expect(readLedger(runDir)).toEqual([
        { stage: 'candidate', case: '1.1' },
        { stage: 'judged', case: '1.1', classification: 'app' },
      ]);
    });

    it('skips blank lines when it reads the ledger', () => {
      writeFileSync(path.join(runDir, 'ledger.jsonl'), '{"stage":"candidate"}\n\n   \n{"stage":"reported"}\n');

      expect(readLedger(runDir)).toEqual([{ stage: 'candidate' }, { stage: 'reported' }]);
    });
  });
});
