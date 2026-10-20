import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  finishCatchRun,
  readCatchRun,
  startCatchRun,
  writeRunRecord,
  type CatchRunRecord,
} from '../../src/core/catch-run.js';
import { loadCatchContext, recordRisk } from '../../src/core/catch-context.js';
import { recordEquivalence, recordMutant } from '../../src/core/catch-mutant.js';
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
  shellWord,
  worktreesOf,
  type ProjectFixture,
} from '../fixtures/catch-jest/catch-project.js';

const nodeEval = (code: string): string => `${shellWord(process.execPath)} -e ${shellWord(code)}`;

// Each test drives real git repositories and several runner processes; the default 10 s is too short under a full parallel suite.
vi.setConfig({ testTimeout: 30_000 });

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
    expect(ledgerOf(ready.runDir).map((entry) => entry.stage)).toContain('child-setup-failed');
    const setupOutput = JSON.parse(fs.readFileSync(path.join(ready.runDir, 'setup-output.json'), 'utf8'));
    expect(setupOutput.child.commands[0]).toMatchObject({ exitCode: 3 });
    expect(setupOutput.child.commands[0]).toHaveProperty('outputTail');
    expect(setupOutput.parent.ok).toBe(true);
    expect(fs.existsSync(path.join(ready.runDir, 'child-setup-output.json'))).toBe(false);
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

  it('refuses a test whose folder is a file on the head before any run, and still classifies the run', async () => {
    const fx = makeProjectFixture({
      root: tmp,
      gates: { parentRuns: 2, childRuns: 2 },
      // The head holds a file where the test's folder must be, so the test cannot be written there.
      headFiles: { 'test/sub': 'a file, not a folder\n' },
    });
    const ready = await readyRun(fx);
    await gatedTest(ready, spec('export const value = 2;'), 'test/sub/catch-nested.spec.ts');
    const runsBefore = readRunsLog(fx.recordPath).length;

    const outcome = await runChildPhase(childInput(ready));

    expect(outcome).toMatchObject({
      status: 'classified',
      run: { state: 'classified' },
      results: [
        expect.objectContaining({
          test: 'T1',
          parent: 'fail',
          child: [],
          action: 'discard',
          reason: 'inconclusive',
          detail: expect.stringMatching(/which is a file, not a folder\. The test was not run on the head\./),
        }),
      ],
    });
    expect(readRunsLog(fx.recordPath).length).toBe(runsBefore);
    expect(fs.readFileSync(path.join(ready.worktree, 'test', 'sub'), 'utf8')).toBe('a file, not a folder\n');
  });

  it('refuses a test whose folder is a symlink on the head that leads outside the project, and writes nothing outside', async () => {
    const outside = path.join(tmp, 'outside');
    fs.mkdirSync(outside);
    const fx = makeProjectFixture({
      root: tmp,
      gates: { parentRuns: 2, childRuns: 2 },
      // The PR head links a folder of the project to a folder outside it: the parent has no such link.
      headSymlinks: { 'test/linked': outside },
    });
    const ready = await readyRun(fx);
    await gatedTest(ready, spec('export const value = 2;'), 'test/linked/catch-linked.spec.ts');
    const runsBefore = readRunsLog(fx.recordPath).length;

    const outcome = await runChildPhase(childInput(ready));

    expect(outcome).toMatchObject({
      status: 'classified',
      run: { state: 'classified' },
      results: [
        expect.objectContaining({
          test: 'T1',
          child: [],
          action: 'discard',
          reason: 'inconclusive',
          detail: expect.stringMatching(/^Refusing "test\/linked\/catch-linked\.spec\.ts": .*stay inside it\. The test was not run on the head\.$/),
        }),
      ],
    });
    expect(readRunsLog(fx.recordPath).length).toBe(runsBefore);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  /** A gated test whose stored content is gone: the child phase fails reading it, after the switch to the head. */
  async function failingAfterSwitch(): Promise<{ fx: ProjectFixture; ready: ReadyRun }> {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 } });
    const ready = await readyRun(fx);
    await gatedTest(ready, spec('export const value = 2;'));
    fs.rmSync(path.join(ready.runDir, 'tests', 'T1'), { recursive: true });
    return { fx, ready };
  }

  it('ends the run in child-failed when a step fails after the worktree moved to the head, and parent-phase commands refuse it', async () => {
    const { fx, ready } = await failingAfterSwitch();

    await expect(runChildPhase(childInput(ready))).rejects.toThrow(/Catch run \S+ is child-failed/);

    expect(readCatchRun(ready.runDir)).toMatchObject({ state: 'child-failed', worktree: ready.worktree });
    expect(readCatchRun(ready.runDir).failure).toMatch(/moved to the head/);
    expect(headOf(ready.worktree)).toBe(fx.head);
    expect(ledgerOf(ready.runDir).map((entry) => entry.stage)).toEqual(expect.arrayContaining(['child-running', 'child-failed']));
    expect(() =>
      recordRisk({ changesDir: fx.changesDir, runId: ready.runId, value: { requirement: 'Currency', summary: 'late' } })
    ).toThrow(/is child-failed: qaspec catch risk needs a ready run/);
    await expect(
      recordTest({
        projectRoot: fx.project,
        changesDir: fx.changesDir,
        runId: ready.runId,
        value: { kind: 'functionality', requirement: 'Currency', path: 'test/catch-late.spec.ts', content: spec('x') },
      })
    ).rejects.toThrow(/is child-failed: qaspec catch test needs a ready run/);
    await expect(
      recordMutant({
        projectRoot: fx.project,
        changesDir: fx.changesDir,
        runId: ready.runId,
        value: { risk: 'R1', file: 'src/app.ts', original: "export const label = 'value';", replacement: "export const label = 'other';" },
      })
    ).rejects.toThrow(/is child-failed: qaspec catch mutant needs a ready run/);
    await expect(loadCatchContext({ projectRoot: fx.project, changesDir: fx.changesDir, runId: ready.runId })).rejects.toThrow(
      /is child-failed: qaspec catch context needs a ready run/
    );
    expect(() =>
      recordEquivalence({
        changesDir: fx.changesDir,
        runId: ready.runId,
        mutant: 'M1',
        value: { equivalent: true, rationale: 'late' },
      })
    ).toThrow(/is child-failed: qaspec catch equivalence needs a ready run/);
  });

  it('finish removes the worktree of a child-failed run and marks the run finished', async () => {
    const { fx, ready } = await failingAfterSwitch();
    await expect(runChildPhase(childInput(ready))).rejects.toThrow(/child-failed/);

    const finished = await finishCatchRun({ projectRoot: fx.project, changesDir: fx.changesDir, runId: ready.runId });

    expect(finished).toMatchObject({ alreadyFinished: false, run: { state: 'finished', worktree: null } });
    expect(fs.existsSync(ready.worktree)).toBe(false);
    expect(worktreesOf(fx.repo)).not.toContain(ready.worktree);
  });

  it('finish also cleans a child-running run left behind by an interrupted child phase', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 } });
    const ready = await readyRun(fx);
    // The state an interrupted child phase leaves: child-running, with the worktree of the run still in place.
    writeRunRecord(ready.runDir, { ...ready.run, state: 'child-running' });

    const finished = await finishCatchRun({ projectRoot: fx.project, changesDir: fx.changesDir, runId: ready.runId });

    expect(finished).toMatchObject({ alreadyFinished: false, run: { state: 'finished', worktree: null } });
    expect(fs.existsSync(ready.worktree)).toBe(false);
  });

  it('records child-running before the worktree moves to the head, so a setup run on the head sees that state', async () => {
    const stateLog = path.join(tmp, 'states.log');
    const catchDir = path.join(tmp, 'repo', 'qaspec', 'changes', CHANGE, 'catch');
    // Setup runs at the parent while the run is setting-up, and again on the head after the switch.
    const logState = nodeEval(
      [
        'const fs = require("fs"); const path = require("path");',
        `const dir = ${JSON.stringify(catchDir)};`,
        'const id = fs.readdirSync(dir).find((name) => fs.existsSync(path.join(dir, name, "run.json")));',
        'const run = JSON.parse(fs.readFileSync(path.join(dir, id, "run.json"), "utf8"));',
        `fs.appendFileSync(${JSON.stringify(stateLog)}, run.state + "\\n");`,
      ].join(' ')
    );
    const fx = makeProjectFixture({
      root: tmp,
      gates: { parentRuns: 2, childRuns: 2 },
      setupCommand: logState,
      reinstallWhenChanged: ['src/app.ts'],
    });
    const ready = await readyRun(fx);
    await gatedTest(ready, spec('export const value = 2;'));

    const outcome = await runChildPhase(childInput(ready));

    expect(outcome).toMatchObject({ status: 'classified' });
    expect(fs.readFileSync(stateLog, 'utf8').trim().split('\n')).toEqual(['setting-up', 'child-running']);
  });

  it('keeps the setup output of the start and of the child reinstall in setup-output.json, keyed by phase', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 }, reinstallWhenChanged: ['src/app.ts'] });
    const ready = await readyRun(fx);
    await gatedTest(ready, spec('export const value = 2;'));

    await runChildPhase(childInput(ready));

    const setupOutput = JSON.parse(fs.readFileSync(path.join(ready.runDir, 'setup-output.json'), 'utf8'));
    expect(setupOutput).toMatchObject({ parent: { ok: true }, child: { ok: true } });
    expect(setupOutput.child.commands[0]).toHaveProperty('outputTail');
    expect(fs.existsSync(path.join(ready.runDir, 'child-setup-output.json'))).toBe(false);
  });

  it('stamps each classified ledger line with the time the test was classified, after its child runs', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 } });
    const ready = await readyRun(fx);
    // Each child run takes one second, so the classification comes at least two seconds after the child phase starts.
    await gatedTest(ready, `// fake: pause on head\n${spec('export const value = 2;')}`);
    const startedAt = Date.now();

    await runChildPhase(childInput(ready));

    const [classified] = ledgerOf(ready.runDir).filter((entry) => entry.stage === 'classified');
    expect(Date.parse(String(classified.at)) - startedAt).toBeGreaterThanOrEqual(1_500);
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
