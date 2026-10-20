import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finishCatchRun, startCatchRun, type CatchRunRecord } from '../../src/core/catch-run.js';
import { recordRisk } from '../../src/core/catch-context.js';
import { recordEquivalence, recordMutant, replaceOnce, restoreFile } from '../../src/core/catch-mutant.js';
import {
  BASE_APP,
  CHANGE,
  makeProjectFixture,
  readRecordedStart,
  readRunsLog,
  type ProjectFixture,
} from '../fixtures/catch-jest/catch-project.js';

let tmp: string;
let envBackup: NodeJS.ProcessEnv;

beforeEach(() => {
  envBackup = { ...process.env };
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qaspec-catch-mutant-'));
  process.env.TMPDIR = tmp;
  process.env.TMP = tmp;
  process.env.TEMP = tmp;
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) {
    if (!(key in envBackup)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, envBackup);
});

interface ReadyRun {
  fx: ProjectFixture;
  runId: string;
  runDir: string;
  run: CatchRunRecord;
  /** The parent checkout of the run: the catch worktree at the merge-base. */
  worktree: string;
}

/** A ready analysis run with the risk R1 on the Currency requirement. */
async function readyRunWithRisk(fx: ProjectFixture): Promise<ReadyRun> {
  const outcome = await startCatchRun({ projectRoot: fx.project, changesDir: fx.changesDir, changeName: CHANGE });
  if (!outcome.started) {
    throw new Error(`the run did not start: ${outcome.blockers.map((blocker) => blocker.code).join(', ')}`);
  }
  const { run, runDir } = outcome;
  const risk = recordRisk({
    projectRoot: fx.project,
    changesDir: fx.changesDir,
    runId: run.runId,
    value: { requirement: 'Currency', summary: 'The currency label changes' },
  });
  expect(risk).toMatchObject({ ok: true, risk: { id: 'R1' } });
  return { fx, runId: run.runId, runDir, run, worktree: run.worktree as string };
}

const mutantInput = (ready: ReadyRun, value: unknown) => ({
  projectRoot: ready.fx.project,
  changesDir: ready.fx.changesDir,
  runId: ready.runId,
  value,
});

/** A mutant of src/app.ts in the parent: the default risk R1, the given original and replacement. */
const appMutant = (original: string, replacement: string, file = 'src/app.ts') => ({
  risk: 'R1',
  file,
  original,
  replacement,
});

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

const ledgerOf = (runDir: string): Array<Record<string, unknown>> =>
  fs
    .readFileSync(path.join(runDir, 'ledger.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

/** Whether git reports the tracked file as changed in the worktree. */
const changedInWorktree = (worktree: string, file: string): boolean => {
  try {
    execFileSync('git', ['diff', '--quiet', '--', file], { cwd: worktree, stdio: 'ignore' });
    return false;
  } catch {
    return true;
  }
};

describe('recordMutant gates', () => {
  it('records a comment-only mutant as syntactic-equivalent, without touching the parent or starting the runner', async () => {
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp }));
    const appPath = path.join(ready.worktree, 'src', 'app.ts');
    const before = fs.readFileSync(appPath);

    const outcome = await recordMutant(
      mutantInput(ready, appMutant('export const value = 1;', 'export const value = 1; // the value'))
    );

    expect(outcome).toMatchObject({ ok: true, mutant: { id: 'M1', outcome: 'syntactic-equivalent', risk: 'R1' } });
    expect(fs.readFileSync(appPath).equals(before)).toBe(true);
    expect(fs.existsSync(ready.fx.recordPath)).toBe(false);
  });

  it('records a mutant that breaks an existing expectation as caught-by-existing, and restores the parent file', async () => {
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp }));
    const appPath = path.join(ready.worktree, 'src', 'app.ts');

    const outcome = await recordMutant(
      mutantInput(ready, appMutant('export const value = 1;', 'export const value = 2;'))
    );

    expect(outcome).toMatchObject({
      ok: true,
      mutant: { id: 'M1', outcome: 'caught-by-existing', relatedTests: ['test/app.spec.ts'], runOutcome: 'fail' },
    });
    expect(fs.readFileSync(appPath, 'utf8')).toBe(BASE_APP);
    expect(changedInWorktree(ready.worktree, 'src/app.ts')).toBe(false);
  });

  it('records a mutant that keeps every expectation as surviving, with the related tests it ran', async () => {
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp }));

    const outcome = await recordMutant(
      mutantInput(ready, appMutant("export const label = 'value';", "export const label = 'other';"))
    );

    expect(outcome).toMatchObject({
      ok: true,
      mutant: { id: 'M1', outcome: 'surviving', relatedTests: ['test/app.spec.ts'], runOutcome: 'pass' },
    });
    expect(changedInWorktree(ready.worktree, 'src/app.ts')).toBe(false);
  });

  it('records a mutant whose source does not build as no-build', async () => {
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp }));

    const outcome = await recordMutant(
      mutantInput(ready, appMutant("export const label = 'value';", 'export const label = @@BROKEN@@;'))
    );

    expect(outcome).toMatchObject({ ok: true, mutant: { id: 'M1', outcome: 'no-build', runOutcome: 'no-build' } });
  });

  it('records a mutant of a file that no existing test relates to as surviving, after the lookup alone', async () => {
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp }));

    const outcome = await recordMutant(
      mutantInput(ready, appMutant('export const util = 1;', 'export const util = 2;', 'src/util.ts'))
    );

    expect(outcome).toMatchObject({ ok: true, mutant: { id: 'M1', outcome: 'surviving', relatedTests: [] } });
    const args = readRecordedStart(ready.fx.recordPath).args;
    expect(args).toContain('--findRelatedTests');
    expect(args).not.toContain('--runTestsByPath');
  });

  it.each([
    ['times out', ':sleep', /timed out/],
    ['exits without a report', ':exit3', /boom|exit|report|3/],
  ] as const)(
    'ends a mutant as baseline-not-passing when its related tests %s on the unmutated parent, and restores the parent',
    async (_label, runnerVariant, detail) => {
      const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp, runnerVariant, timeoutSeconds: 1 }));
      const appPath = path.join(ready.worktree, 'src', 'app.ts');

      const outcome = await recordMutant(
        mutantInput(ready, appMutant('export const value = 1;', 'export const value = 2;'))
      );

      expect(outcome).toMatchObject({ ok: true, mutant: { id: 'M1', outcome: 'baseline-not-passing', runOutcome: null } });
      expect((outcome as { mutant: { detail?: string } }).mutant.detail).toMatch(detail);
      expect(fs.readFileSync(appPath, 'utf8')).toBe(BASE_APP);
    }
  );

  it.each([
    ['crashes', 'crash-once'],
    ['times out', 'sleep-once'],
  ] as const)(
    'does not cache a baseline that %s, so the next mutant of the same test set runs the baseline again and is gated normally',
    async (_label, directive) => {
      const fx = makeProjectFixture({
        root: tmp,
        timeoutSeconds: 1,
        baseFiles: { 'test/app.spec.ts': `// covers: src/app.ts\n// expect: export const value = 1;\n// fake: ${directive} on base\n` },
      });
      const ready = await readyRunWithRisk(fx);

      const first = await recordMutant(
        mutantInput(ready, appMutant("export const label = 'value';", "export const label = 'other';"))
      );
      expect(first).toMatchObject({ ok: true, mutant: { id: 'M1', outcome: 'baseline-not-passing', runOutcome: null } });

      const second = await recordMutant(mutantInput(ready, appMutant('export const value = 1;', 'export const value = 2;')));
      expect(second).toMatchObject({ ok: true, mutant: { id: 'M2', outcome: 'caught-by-existing', runOutcome: 'fail' } });
      expect(fs.readFileSync(path.join(ready.worktree, 'src', 'app.ts'), 'utf8')).toBe(BASE_APP);
    }
  );

  it('caches a stable baseline, so the second mutant of the same test set runs no baseline again', async () => {
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp }));

    await recordMutant(mutantInput(ready, appMutant("export const label = 'value';", "export const label = 'other';")));
    const second = await recordMutant(mutantInput(ready, appMutant('export const value = 1;', 'export const value = 2;')));

    expect(second).toMatchObject({ ok: true, mutant: { id: 'M2', outcome: 'caught-by-existing' } });
    // One run of the baseline and one run per mutant.
    expect(readRunsLog(ready.fx.recordPath)).toHaveLength(3);
  });

  it.each([
    ['sleeps', 'sleep', 'timeout', /timed out/],
    ['exits without a report', 'exit3', 'runner-error', /boom|exit|report|3/],
  ] as const)(
    'records a mutant whose run %s on the mutated parent as inconclusive, never as surviving, and restores the parent',
    async (_label, directive, runOutcome, detail) => {
      // The head-side directive reaches only the mutated parent: the unmutated parent passes every related test.
      const ready = await readyRunWithRisk(
        makeProjectFixture({
          root: tmp,
          timeoutSeconds: 1,
          baseFiles: { 'test/head-fault.spec.ts': `// covers: src/app.ts\n// fake: ${directive} on head\n// expect: export const label = 'value';\n` },
        })
      );
      const appPath = path.join(ready.worktree, 'src', 'app.ts');

      const outcome = await recordMutant(
        mutantInput(ready, appMutant('export const value = 1;', 'export const value = 2;'))
      );

      expect(outcome).toMatchObject({ ok: true, mutant: { id: 'M1', outcome: 'inconclusive', runOutcome } });
      expect((outcome as { mutant: { reason: string } }).mutant.reason).toMatch(detail);
      expect(fs.readFileSync(appPath, 'utf8')).toBe(BASE_APP);
    }
  );

  it('records a mutant whose related-test lookup fails as inconclusive, never as surviving', async () => {
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp, runnerVariant: ':list-fail' }));
    const appPath = path.join(ready.worktree, 'src', 'app.ts');

    const outcome = await recordMutant(
      mutantInput(ready, appMutant('export const value = 1;', 'export const value = 2;'))
    );

    expect(outcome).toMatchObject({ ok: true, mutant: { id: 'M1', outcome: 'inconclusive' } });
    expect((outcome as { mutant: { reason: string } }).mutant.reason).toMatch(/Finding related tests failed/);
    expect(fs.readFileSync(appPath, 'utf8')).toBe(BASE_APP);
  });

  it('restores a source with a byte order mark and CRLF line endings byte for byte after a mutant run', async () => {
    const baseApp = '﻿export const value = 1;\r\nexport const label = \'value\';\r\n';
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp, baseApp }));
    const appPath = path.join(ready.worktree, 'src', 'app.ts');
    const before = fs.readFileSync(appPath);

    const outcome = await recordMutant(
      mutantInput(ready, appMutant('export const value = 1;', 'export const value = 2;'))
    );

    expect(outcome).toMatchObject({ ok: true, mutant: { outcome: 'caught-by-existing' } });
    expect(sha256(fs.readFileSync(appPath))).toBe(sha256(before));
  });

  it('numbers the mutants M1 and M2 and appends one mutant ledger line for each', async () => {
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp }));

    await recordMutant(mutantInput(ready, appMutant('export const value = 1;', 'export const value = 1; // same')));
    await recordMutant(mutantInput(ready, appMutant('export const value = 1;', 'export const value = 2;')));

    expect(
      ledgerOf(ready.runDir)
        .filter((line) => line.stage === 'mutant')
        .map((line) => [line.mutant, line.risk, line.file, line.outcome])
    ).toEqual([
      ['M1', 'R1', 'src/app.ts', 'syntactic-equivalent'],
      ['M2', 'R1', 'src/app.ts', 'caught-by-existing'],
    ]);
  });

  it('refuses a mutant on a finished run', async () => {
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp }));
    await finishCatchRun({ projectRoot: ready.fx.project, changesDir: ready.fx.changesDir, runId: ready.runId });

    await expect(
      recordMutant(mutantInput(ready, appMutant('export const value = 1;', 'export const value = 2;')))
    ).rejects.toThrow(/is finished/);
  });

  it('refuses a mutant whose recorded worktree is now a plain folder, and starts no runner', async () => {
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp }));
    // The recorded path holds a plain folder under the catch root: it is no catch worktree of this project.
    fs.rmSync(ready.worktree, { recursive: true, force: true });
    fs.mkdirSync(ready.worktree);

    await expect(
      recordMutant(mutantInput(ready, appMutant('export const value = 1;', 'export const value = 2;')))
    ).rejects.toThrow(/not a catch worktree of this project/);
    expect(fs.existsSync(ready.fx.recordPath)).toBe(false);
  });

  it.each([
    ['an unknown risk', { ...appMutant('export const value = 1;', 'x'), risk: 'R9' }, 'risk-unknown'],
    ['a file that leaves the project', appMutant('export const value = 1;', 'x', '../secret.ts'), 'file-refused'],
    ['an absolute file', appMutant('export const value = 1;', 'x', '/etc/hosts'), 'file-refused'],
    ['a file that is not in the parent', appMutant('export const value = 1;', 'x', 'src/missing.ts'), 'file-missing'],
    ['an original that does not occur', appMutant('export const nothing = 0;', 'x'), 'original-count'],
    ['an original that occurs twice', appMutant('export const', 'export let'), 'original-count'],
    ['an empty original', appMutant('', 'x'), 'input-invalid'],
    ['a replacement equal to the original', appMutant('export const value = 1;', 'export const value = 1;'), 'no-change'],
    ['an unknown field', { ...appMutant('export const value = 1;', 'x'), extra: true }, 'unknown-field'],
    ['an input that is not an object', ['not', 'an', 'object'], 'input-not-object'],
  ])('refuses %s without writing anything', async (_label, value, code) => {
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp }));
    const appPath = path.join(ready.worktree, 'src', 'app.ts');
    const before = fs.readFileSync(appPath);
    const ledgerBefore = ledgerOf(ready.runDir).length;

    const outcome = await recordMutant(mutantInput(ready, value));

    expect(outcome).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code })]) });
    expect(fs.readFileSync(appPath).equals(before)).toBe(true);
    expect(fs.existsSync(path.join(ready.runDir, 'mutants'))).toBe(false);
    expect(ledgerOf(ready.runDir)).toHaveLength(ledgerBefore);
    expect(fs.existsSync(ready.fx.recordPath)).toBe(false);
  });
});

describe('recordMutant baseline, cache and diagnostics (T14-F2)', () => {
  /** The existing expectation (value 1) already fails on the parent: the related tests are not passing before a mutant. */
  const FAILING_BASE = "export const value = 0;\nexport const label = 'value';\n";
  const LABEL = appMutant("export const label = 'value';", "export const label = 'other';");
  const VALUE = appMutant('export const value = 1;', 'export const value = 2;');

  it('ends a mutant as baseline-not-passing when a related test already fails on the unmutated parent, and runs no mutant', async () => {
    const fx = makeProjectFixture({ root: tmp, baseApp: FAILING_BASE });
    const ready = await readyRunWithRisk(fx);

    const outcome = await recordMutant(mutantInput(ready, LABEL));

    expect(outcome).toMatchObject({
      ok: true,
      mutant: { id: 'M1', outcome: 'baseline-not-passing', runOutcome: null, caughtBy: [] },
    });
    expect((outcome as { mutant: { detail?: string } }).mutant.detail).toMatch(/no longer kept: export const value = 1;/);
    expect(readRunsLog(fx.recordPath)).toHaveLength(1);
  });

  it('reuses a failing baseline for every later mutant of the same set, so no later mutant runs', async () => {
    const fx = makeProjectFixture({ root: tmp, baseApp: FAILING_BASE });
    const ready = await readyRunWithRisk(fx);
    await recordMutant(mutantInput(ready, LABEL));

    const second = await recordMutant(
      mutantInput(ready, appMutant("export const label = 'value';", "export const label = 'again';"))
    );

    expect(second).toMatchObject({ ok: true, mutant: { id: 'M2', outcome: 'baseline-not-passing' } });
    expect(readRunsLog(fx.recordPath)).toHaveLength(1);
  });

  it('runs the related tests on the parent before the first mutant of a set, and reuses that passing outcome for later mutants', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const ready = await readyRunWithRisk(fx);

    const first = await recordMutant(mutantInput(ready, LABEL));
    const second = await recordMutant(mutantInput(ready, VALUE));

    expect(first).toMatchObject({ ok: true, mutant: { id: 'M1', outcome: 'surviving', runOutcome: 'pass' } });
    expect(second).toMatchObject({ ok: true, mutant: { id: 'M2', outcome: 'caught-by-existing', runOutcome: 'fail' } });
    // Baseline and mutant of M1, then the mutant of M2: the baseline is not run again.
    expect(readRunsLog(fx.recordPath)).toHaveLength(3);
  });

  it('keeps today\'s gate when the related tests execute no test on the parent: the mutant still runs and can be caught', async () => {
    // An empty spec covers src/app.ts and names no expectation: its file executes no test, so the baseline is no-tests.
    const fx = makeProjectFixture({ root: tmp, baseFiles: { 'test/empty.spec.ts': '// covers: src/app.ts\n' } });
    const ready = await readyRunWithRisk(fx);

    const outcome = await recordMutant(mutantInput(ready, VALUE));

    expect(outcome).toMatchObject({
      ok: true,
      mutant: { id: 'M1', outcome: 'caught-by-existing', runOutcome: 'fail', caughtBy: ['test/app.spec.ts'] },
    });
  });

  it('keeps one baseline per set of related tests: a mutant of another file runs its own baseline', async () => {
    const fx = makeProjectFixture({
      root: tmp,
      baseFiles: { 'test/util.spec.ts': '// covers: src/util.ts\n// expect: export const util = 1;\n' },
    });
    const ready = await readyRunWithRisk(fx);

    await recordMutant(mutantInput(ready, LABEL));
    const util = await recordMutant(
      mutantInput(ready, appMutant('export const util = 1;', 'export const util = 2;', 'src/util.ts'))
    );

    expect(util).toMatchObject({
      ok: true,
      mutant: { id: 'M2', outcome: 'caught-by-existing', relatedTests: ['test/util.spec.ts'], caughtBy: ['test/util.spec.ts'] },
    });
    // The app set: baseline and mutant. The util set: its own baseline and mutant.
    expect(readRunsLog(fx.recordPath)).toHaveLength(4);
  });

  it('lists in caughtBy only the related test files that fail on the mutant', async () => {
    const fx = makeProjectFixture({
      root: tmp,
      baseFiles: { 'test/label.spec.ts': "// covers: src/app.ts\n// expect: export const label = 'value';\n" },
    });
    const ready = await readyRunWithRisk(fx);

    const outcome = await recordMutant(mutantInput(ready, VALUE));

    expect(outcome).toMatchObject({
      ok: true,
      mutant: {
        id: 'M1',
        outcome: 'caught-by-existing',
        relatedTests: ['test/app.spec.ts', 'test/label.spec.ts'],
        caughtBy: ['test/app.spec.ts'],
      },
    });
  });

  it('keeps the adapter messages of a mutant caught by an existing test, and of a mutant that does not build', async () => {
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp }));
    const caught = await recordMutant(mutantInput(ready, VALUE));
    expect((caught as { mutant: { detail?: string } }).mutant.detail).toMatch(/no longer kept: export const value = 1;/);

    const broken = await recordMutant(
      mutantInput(ready, appMutant("export const label = 'value';", 'export const label = @@BROKEN@@;'))
    );
    expect(broken).toMatchObject({ ok: true, mutant: { id: 'M2', outcome: 'no-build', caughtBy: [] } });
    expect((broken as { mutant: { detail?: string } }).mutant.detail).toMatch(/SyntaxError: the source does not build/);
  });

  it('keeps no detail on a mutant that survives, because its related tests passed', async () => {
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp }));

    const outcome = await recordMutant(mutantInput(ready, LABEL));

    expect(outcome).toMatchObject({ ok: true, mutant: { id: 'M1', outcome: 'surviving', caughtBy: [] } });
    expect(outcome).not.toMatchObject({ mutant: { detail: expect.anything() } });
  });
});

describe('recordEquivalence', () => {
  /** Records one surviving mutant (M1) on the label, which the spec does not keep. */
  async function survivingMutant(): Promise<ReadyRun> {
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp }));
    const outcome = await recordMutant(
      mutantInput(ready, appMutant("export const label = 'value';", "export const label = 'other';"))
    );
    expect(outcome).toMatchObject({ ok: true, mutant: { id: 'M1', outcome: 'surviving' } });
    return ready;
  }

  const verdict = (ready: ReadyRun, mutant: string, value: unknown) => ({
    changesDir: ready.fx.changesDir,
    runId: ready.runId,
    mutant,
    value,
  });

  it('records an equivalent verdict on a surviving mutant as judged-equivalent, with its rationale', async () => {
    const ready = await survivingMutant();

    const outcome = recordEquivalence(verdict(ready, 'M1', { equivalent: true, rationale: 'The label is never read' }));

    expect(outcome).toMatchObject({
      ok: true,
      mutant: {
        id: 'M1',
        outcome: 'judged-equivalent',
        equivalence: { equivalent: true, rationale: 'The label is never read' },
      },
    });
    expect(ledgerOf(ready.runDir).filter((line) => line.stage === 'equivalence')).toEqual([
      expect.objectContaining({ mutant: 'M1', equivalent: true, outcome: 'judged-equivalent' }),
    ]);
  });

  it('records a non-equivalent verdict as non-equivalent, eligible for the next stage', async () => {
    const ready = await survivingMutant();

    const outcome = recordEquivalence(verdict(ready, 'M1', { equivalent: false, rationale: 'The label is shown' }));

    expect(outcome).toMatchObject({ ok: true, mutant: { id: 'M1', outcome: 'non-equivalent' } });
  });

  it('judges each mutant once: a second verdict on the same mutant is refused as not surviving', async () => {
    const ready = await survivingMutant();
    recordEquivalence(verdict(ready, 'M1', { equivalent: false, rationale: 'The label is shown' }));

    const second = recordEquivalence(verdict(ready, 'M1', { equivalent: true, rationale: 'Changed my mind' }));

    expect(second).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'not-surviving' })] });
    expect(ledgerOf(ready.runDir).filter((line) => line.stage === 'equivalence')).toHaveLength(1);
  });

  it('refuses a verdict for a mutant that a gate already settled', async () => {
    const ready = await readyRunWithRisk(makeProjectFixture({ root: tmp }));
    await recordMutant(mutantInput(ready, appMutant('export const value = 1;', 'export const value = 2;')));

    expect(recordEquivalence(verdict(ready, 'M1', { equivalent: true, rationale: 'Looks equal' }))).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'not-surviving' })],
    });
  });

  it('refuses an unknown mutant id and a malformed one', async () => {
    const ready = await survivingMutant();

    expect(recordEquivalence(verdict(ready, 'M9', { equivalent: true, rationale: 'x' }))).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'mutant-unknown' })],
    });
    expect(recordEquivalence(verdict(ready, 'X1', { equivalent: true, rationale: 'x' }))).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'mutant-id-invalid' })],
    });
  });

  it('refuses an invalid verdict and names every problem, and writes nothing', async () => {
    const ready = await survivingMutant();

    const outcome = recordEquivalence(verdict(ready, 'M1', { equivalent: 'yes', rationale: '', extra: 1 }));

    expect(outcome).toMatchObject({ ok: false });
    const codes = (outcome as { issues: Array<{ code: string }> }).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(['equivalent-invalid', 'rationale-missing', 'unknown-field']));
    expect(ledgerOf(ready.runDir).filter((line) => line.stage === 'equivalence')).toHaveLength(0);
  });
});

describe('mutant helpers shared with the test stage (T8)', () => {
  it('replaceOnce replaces the one occurrence of the original text and keeps every other character', () => {
    expect(replaceOnce('const a = 1;\nconst b = 2;\n', 'const b = 2;', 'const b = 3;')).toBe('const a = 1;\nconst b = 3;\n');
  });

  it('restoreFile writes the original bytes back, byte for byte', () => {
    const file = path.join(tmp, 'app.ts');
    fs.writeFileSync(file, 'changed');
    const original = Buffer.from('﻿export const value = 1;\r\n');

    restoreFile(file, original);

    expect(fs.readFileSync(file).equals(original)).toBe(true);
  });
});
