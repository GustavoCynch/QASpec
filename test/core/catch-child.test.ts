import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startCatchRun, type CatchRunRecord } from '../../src/core/catch-run.js';
import { recordRisk } from '../../src/core/catch-context.js';
import { recordMutant } from '../../src/core/catch-mutant.js';
import { classifyChild, runChildPhase } from '../../src/core/catch-child.js';
import { recordTest } from '../../src/core/catch-test.js';
import {
  CHANGE,
  SETUP_FAILS_ON_HEAD,
  SETUP_OK,
  makeProjectFixture,
  readRunsLog,
  readSetupLog,
  setupLogging,
  type ProjectFixture,
} from '../fixtures/catch-jest/catch-project.js';

let tmp: string;
let envBackup: NodeJS.ProcessEnv;

beforeEach(() => {
  envBackup = { ...process.env };
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qaspec-catch-child-'));
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
  worktree: string;
  run: CatchRunRecord;
}

async function readyRun(fx: ProjectFixture): Promise<ReadyRun> {
  const outcome = await startCatchRun({ projectRoot: fx.project, changesDir: fx.changesDir, changeName: CHANGE });
  if (!outcome.started || outcome.run.state !== 'ready') {
    throw new Error('the run did not start ready');
  }
  return { fx, runId: outcome.run.runId, runDir: outcome.runDir, worktree: outcome.run.worktree as string, run: outcome.run };
}

const spec = (...expectations: string[]): string =>
  ['// covers: src/app.ts', ...expectations.map((expected) => `// expect: ${expected}`)].join('\n') + '\n';

const CURRENCY_TEST = 'test/catch-currency.spec.ts';

/** Records one functionality test on the Currency requirement and checks it is gated on the parent. */
async function gatedTest(ready: ReadyRun, content: string, testPath = CURRENCY_TEST): Promise<void> {
  const outcome = await recordTest({
    projectRoot: ready.fx.project,
    changesDir: ready.fx.changesDir,
    runId: ready.runId,
    value: { kind: 'functionality', requirement: 'Currency', path: testPath, content },
  });
  expect(outcome).toMatchObject({ ok: true, test: { outcome: 'gated' } });
}

const childInput = (ready: ReadyRun) => ({
  projectRoot: ready.fx.project,
  changesDir: ready.fx.changesDir,
  runId: ready.runId,
});

const ledgerOf = (runDir: string): Array<Record<string, unknown>> =>
  fs
    .readFileSync(path.join(runDir, 'ledger.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

const headOf = (worktree: string): string =>
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: worktree, encoding: 'utf8' }).trim();

describe('classifyChild (S5 Table 3)', () => {
  it.each([
    ['pass', 'pass', 'land'],
    ['pass', 'fail', 'report'],
    ['fail', 'pass', 'land'],
    ['no-build', 'pass', 'land'],
    ['no-build', 'fail', 'report'],
    ['pass', 'no-build', 'signal'],
    ['fail', 'no-build', 'signal'],
    ['no-build', 'no-build', 'signal'],
    ['fail', 'fail', 'discard'],
  ] as const)('a parent %s and a child %s give %s', (parent, child, action) => {
    expect(classifyChild(parent, [child]).action).toBe(action);
  });

  it('discards a test whose child runs disagree as flaky, whatever the parent is', () => {
    expect(classifyChild('pass', ['pass', 'fail', 'pass'])).toEqual({ action: 'discard', reason: 'flaky' });
    expect(classifyChild('fail', ['fail', 'pass'])).toEqual({ action: 'discard', reason: 'flaky' });
  });

  it('discards as vacuous a test with no test executed on either side', () => {
    expect(classifyChild('no-tests', ['pass'])).toEqual({ action: 'discard', reason: 'vacuous' });
    expect(classifyChild('pass', ['no-tests'])).toEqual({ action: 'discard', reason: 'vacuous' });
  });

  it('makes a timeout or a runner error on the child inconclusive, before any other rule', () => {
    expect(classifyChild('pass', ['timeout'])).toEqual({ action: 'discard', reason: 'inconclusive' });
    expect(classifyChild('fail', ['pass', 'runner-error'])).toEqual({ action: 'discard', reason: 'inconclusive' });
  });

  it('names the reason of a discarded fail on both sides, and of a signal', () => {
    expect(classifyChild('fail', ['fail'])).toEqual({ action: 'discard', reason: 'fails-on-both' });
    expect(classifyChild('pass', ['no-build'])).toEqual({ action: 'signal', reason: 'child-no-build' });
  });
});

describe('runChildPhase', () => {
  it('refuses a run with no gated test, before it switches the worktree or runs anything', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 } });
    const ready = await readyRun(fx);
    const runsBefore = readRunsLog(fx.recordPath).length;

    const outcome = await runChildPhase(childInput(ready));

    expect(outcome).toMatchObject({ status: 'refused', issues: [expect.objectContaining({ code: 'no-gated-test' })] });
    expect(readRunsLog(fx.recordPath).length).toBe(runsBefore);
    expect(headOf(ready.worktree)).toBe(ready.run.parentSha);
  });

  // The parent and the child outcome of each row come from the expectation alone: the base keeps value 1 and the head
  // keeps value 2, so the label test passes on both sides, value 1 passes only on the parent, and so on.
  it.each([
    ["export const label = 'value';", 'pass', 'pass', 'land'],
    ['export const value = 1;', 'pass', 'fail', 'report'],
    ['export const value = 2;', 'fail', 'pass', 'land'],
    ['export const value = 3;', 'fail', 'fail', 'discard'],
  ] as const)(
    'keeps %s on the parent and the child, and classifies the outcomes %s and %s as %s',
    async (expected, parent, child, action) => {
      const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 } });
      const ready = await readyRun(fx);
      await gatedTest(ready, spec(expected));

      const outcome = await runChildPhase(childInput(ready));

      expect(outcome).toMatchObject({
        status: 'classified',
        results: [expect.objectContaining({ test: 'T1', parent, child: [child, child], action })],
      });
    }
  );

  it('classifies a parent that does not build with a passing child as land, and with a failing child as report', async () => {
    const brokenBase = 'export const value = 1;\n// @@BROKEN@@\n';
    const landRoot = path.join(tmp, 'land');
    const reportRoot = path.join(tmp, 'report');
    fs.mkdirSync(landRoot);
    fs.mkdirSync(reportRoot);
    const readyLand = await readyRun(makeProjectFixture({ root: landRoot, gates: { parentRuns: 2, childRuns: 2 }, baseApp: brokenBase }));
    await gatedTest(readyLand, spec('export const value = 2;'));
    const readyReport = await readyRun(makeProjectFixture({ root: reportRoot, gates: { parentRuns: 2, childRuns: 2 }, baseApp: brokenBase }));
    await gatedTest(readyReport, spec('export const value = 1;'));

    const land = await runChildPhase(childInput(readyLand));
    const report = await runChildPhase(childInput(readyReport));

    expect(land).toMatchObject({ status: 'classified', results: [expect.objectContaining({ parent: 'no-build', child: ['pass', 'pass'], action: 'land' })] });
    expect(report).toMatchObject({ status: 'classified', results: [expect.objectContaining({ parent: 'no-build', child: ['fail', 'fail'], action: 'report' })] });
  });

  it('classifies a child that does not build as a signal, whatever the parent outcome', async () => {
    const fx = makeProjectFixture({
      root: tmp,
      gates: { parentRuns: 2, childRuns: 2 },
      headApp: 'export const value = 2;\n// @@BROKEN@@\n',
    });
    const ready = await readyRun(fx);
    await gatedTest(ready, spec('export const value = 1;'));

    const outcome = await runChildPhase(childInput(ready));

    expect(outcome).toMatchObject({
      status: 'classified',
      results: [expect.objectContaining({ parent: 'pass', child: ['no-build', 'no-build'], action: 'signal', reason: 'child-no-build' })],
    });
  });

  it('switches the worktree to the head once, runs the test there, and leaves the worktree at the head', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 } });
    const ready = await readyRun(fx);
    const content = spec('export const value = 2;');
    await gatedTest(ready, content);
    const runsBefore = readRunsLog(fx.recordPath).length;

    const outcome = await runChildPhase(childInput(ready));

    expect(outcome).toMatchObject({ status: 'classified', run: { state: 'classified', worktree: ready.worktree } });
    const childRuns = readRunsLog(fx.recordPath).slice(runsBefore);
    expect(childRuns).toHaveLength(2);
    for (const run of childRuns) {
      expect(run.find((entry) => entry.name.endsWith(CURRENCY_TEST))?.text).toBe(content);
    }
    expect(headOf(ready.worktree)).toBe(fx.head);
    expect(fs.existsSync(path.join(ready.worktree, ...CURRENCY_TEST.split('/')))).toBe(false);
  });

  it('stores each result in the run folder and writes one classified ledger line with the parent, child and action', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 } });
    const ready = await readyRun(fx);
    await gatedTest(ready, spec('export const value = 2;'));

    const outcome = await runChildPhase(childInput(ready));

    expect(outcome.status).toBe('classified');
    const stored = JSON.parse(fs.readFileSync(path.join(ready.runDir, 'results', 'T1.json'), 'utf8'));
    expect(stored).toMatchObject({ schema: 'qaspec.catch-result/v1', test: 'T1', parent: 'fail', child: ['pass', 'pass'], action: 'land' });
    expect(ledgerOf(ready.runDir).filter((entry) => entry.stage === 'classified')).toEqual([
      expect.objectContaining({ stage: 'classified', test: 'T1', parent: 'fail', child: ['pass', 'pass'], action: 'land' }),
    ]);
  });

  it('reinstalls on the child when a configured path changed between the parent and the head', async () => {
    const log = path.join(tmp, 'setup.log');
    const fx = makeProjectFixture({
      root: tmp,
      gates: { parentRuns: 2, childRuns: 2 },
      setupCommand: setupLogging(log),
      reinstallWhenChanged: ['src/app.ts'],
    });
    const ready = await readyRun(fx);
    await gatedTest(ready, spec('export const value = 2;'));

    const outcome = await runChildPhase(childInput(ready));

    expect(readSetupLog(log)).toHaveLength(2);
    expect(outcome).toMatchObject({ status: 'classified', run: { installedFor: fx.head } });
    expect(ledgerOf(ready.runDir).filter((entry) => entry.stage === 'setup')).toHaveLength(2);
  });

  it('does not reinstall on the child when no configured path changed', async () => {
    const log = path.join(tmp, 'setup.log');
    const fx = makeProjectFixture({
      root: tmp,
      gates: { parentRuns: 2, childRuns: 2 },
      setupCommand: setupLogging(log),
      reinstallWhenChanged: ['package.json'],
    });
    const ready = await readyRun(fx);
    await gatedTest(ready, spec('export const value = 2;'));

    const outcome = await runChildPhase(childInput(ready));

    expect(readSetupLog(log)).toHaveLength(1);
    expect(outcome).toMatchObject({ status: 'classified', run: { installedFor: ready.run.parentSha } });
  });

  it('reinstalls on every switch when no path is listed', async () => {
    const log = path.join(tmp, 'setup.log');
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 }, setupCommand: setupLogging(log) });
    const ready = await readyRun(fx);
    await gatedTest(ready, spec('export const value = 2;'));

    await runChildPhase(childInput(ready));

    expect(readSetupLog(log)).toHaveLength(2);
  });

  it('stops with child-setup-failed when the child reinstall fails: nothing is classified and the setup tail stays in the run folder', async () => {
    const fx = makeProjectFixture({
      root: tmp,
      gates: { parentRuns: 2, childRuns: 2 },
      setupCommand: SETUP_FAILS_ON_HEAD,
      reinstallWhenChanged: ['src/app.ts'],
    });
    const ready = await readyRun(fx);
    await gatedTest(ready, spec('export const value = 2;'));
    const runsBefore = readRunsLog(fx.recordPath).length;

    const outcome = await runChildPhase(childInput(ready));

    expect(outcome).toMatchObject({ status: 'setup-failed', run: { state: 'child-setup-failed', setup: { ok: false } } });
    expect(readRunsLog(fx.recordPath).length).toBe(runsBefore);
    expect(fs.existsSync(path.join(ready.runDir, 'results'))).toBe(false);
    expect(fs.existsSync(path.join(ready.runDir, 'child-setup-output.json'))).toBe(true);
    expect(ledgerOf(ready.runDir).map((entry) => entry.stage)).toContain('child-setup-failed');
    const setupOutput = JSON.parse(fs.readFileSync(path.join(ready.runDir, 'child-setup-output.json'), 'utf8'));
    expect(setupOutput.commands[0]).toMatchObject({ exitCode: 3 });
    expect(setupOutput.commands[0]).toHaveProperty('outputTail');
  });

  it('marks a test whose child runs disagree as flaky, and discards it', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 3 } });
    const ready = await readyRun(fx);
    await gatedTest(ready, `// fake: flaky on head\n${spec("export const label = 'value';")}`);

    const outcome = await runChildPhase(childInput(ready));

    expect(outcome).toMatchObject({
      status: 'classified',
      results: [expect.objectContaining({ parent: 'pass', child: ['fail', 'pass', 'fail'], action: 'discard', reason: 'flaky' })],
    });
  });

  it.each([
    ['times out', '// fake: sleep on head', 'timeout'],
    ['exits without a report', '// fake: exit3 on head', 'runner-error'],
  ] as const)('a child run that %s is inconclusive, never a finding', async (_label, directive, child) => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 3 }, timeoutSeconds: 1 });
    const ready = await readyRun(fx);
    await gatedTest(ready, `${directive}\n${spec("export const label = 'value';")}`);

    const outcome = await runChildPhase(childInput(ready));

    expect(outcome).toMatchObject({
      status: 'classified',
      results: [expect.objectContaining({ parent: 'pass', child: [child], action: 'discard', reason: 'inconclusive' })],
    });
  });

  it('discards as vacuous a test that executes no test on the parent', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 } });
    const ready = await readyRun(fx);
    await gatedTest(ready, spec());

    const outcome = await runChildPhase(childInput(ready));

    expect(outcome).toMatchObject({
      status: 'classified',
      results: [expect.objectContaining({ parent: 'no-tests', action: 'discard', reason: 'vacuous' })],
    });
  });

  it('never overwrites a file the head already has at the test path: the test is inconclusive and the head file stays', async () => {
    const headFile = 'export const headOnly = true;\n';
    const fx = makeProjectFixture({
      root: tmp,
      gates: { parentRuns: 2, childRuns: 2 },
      headFiles: { [CURRENCY_TEST]: headFile },
    });
    const ready = await readyRun(fx);
    await gatedTest(ready, spec('export const value = 2;'));

    const outcome = await runChildPhase(childInput(ready));

    expect(outcome).toMatchObject({
      status: 'classified',
      results: [expect.objectContaining({ test: 'T1', child: [], action: 'discard', reason: 'inconclusive' })],
    });
    expect(fs.readFileSync(path.join(ready.worktree, ...CURRENCY_TEST.split('/')), 'utf8')).toBe(headFile);
  });

  it('makes a test that cannot be written on the head inconclusive, and still classifies the run', async () => {
    const fx = makeProjectFixture({
      root: tmp,
      gates: { parentRuns: 2, childRuns: 2 },
      // The head holds a file where the test's folder must be, so the test cannot be written there.
      headFiles: { 'test/sub': 'a file, not a folder\n' },
    });
    const ready = await readyRun(fx);
    await gatedTest(ready, spec('export const value = 2;'), 'test/sub/catch-nested.spec.ts');

    const outcome = await runChildPhase(childInput(ready));

    expect(outcome).toMatchObject({
      status: 'classified',
      run: { state: 'classified' },
      results: [expect.objectContaining({ test: 'T1', parent: 'fail', child: ['runner-error'], action: 'discard', reason: 'inconclusive' })],
    });
    expect(fs.readFileSync(path.join(ready.worktree, 'test', 'sub'), 'utf8')).toBe('a file, not a folder\n');
  });

  it('refuses every parent-phase command and a second child run once the child phase classified the run', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 } });
    const ready = await readyRun(fx);
    await gatedTest(ready, spec('export const value = 2;'));
    await runChildPhase(childInput(ready));

    await expect(
      recordTest({
        projectRoot: fx.project,
        changesDir: fx.changesDir,
        runId: ready.runId,
        value: { kind: 'functionality', requirement: 'Currency', path: 'test/catch-late.spec.ts', content: spec('x') },
      })
    ).rejects.toThrow(/needs a ready run/);
    expect(() =>
      recordRisk({ changesDir: fx.changesDir, runId: ready.runId, value: { requirement: 'Currency', summary: 'late' } })
    ).toThrow(/needs a ready run/);
    await expect(
      recordMutant({
        projectRoot: fx.project,
        changesDir: fx.changesDir,
        runId: ready.runId,
        value: { risk: 'R1', file: 'src/app.ts', original: "export const label = 'value';", replacement: "export const label = 'other';" },
      })
    ).rejects.toThrow(/needs a ready run/);
    await expect(runChildPhase(childInput(ready))).rejects.toThrow(/needs a ready run/);
  });
});
