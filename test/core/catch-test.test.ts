import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startCatchRun, type CatchRunRecord } from '../../src/core/catch-run.js';
import { findIntentRequirement, recordRisk } from '../../src/core/catch-context.js';
import { recordEquivalence, recordMutant } from '../../src/core/catch-mutant.js';
import { recordTest } from '../../src/core/catch-test.js';
import { CHANGE, makeProjectFixture, readRunsLog, type ProjectFixture } from '../fixtures/catch-jest/catch-project.js';

// Each test drives real git repositories and several runner processes; the default 10 s is too short under a full parallel suite.
vi.setConfig({ testTimeout: 30_000 });

let tmp: string;
let envBackup: NodeJS.ProcessEnv;

beforeEach(() => {
  envBackup = { ...process.env };
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qaspec-catch-test-'));
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

/** A run in state ready: the analysis run of the change, or the degraded run (no approved intent) when degraded. */
async function readyRun(fx: ProjectFixture, degraded = false): Promise<ReadyRun> {
  const outcome = await startCatchRun(
    degraded
      ? { projectRoot: fx.project, changesDir: fx.changesDir, changeName: CHANGE, withoutAnalysis: true, head: fx.head }
      : { projectRoot: fx.project, changesDir: fx.changesDir, changeName: CHANGE }
  );
  if (!outcome.started || outcome.run.state !== 'ready') {
    throw new Error('the run did not start ready');
  }
  return { fx, runId: outcome.run.runId, runDir: outcome.runDir, worktree: outcome.run.worktree as string, run: outcome.run };
}

const LABEL_ORIGINAL = "export const label = 'value';";
const LABEL_REPLACEMENT = "export const label = 'other';";

/**
 * Risk R1 and mutant M1 of src/app.ts, the given replacement, then the verdict. The mutant must survive the existing
 * tests (the label is not checked by them), so the verdict is the only way it can become a catching input.
 */
async function judgedMutant(ready: ReadyRun, original: string, replacement: string, equivalent = false): Promise<void> {
  const risk =
    ready.run.mode === 'analysis'
      ? { requirement: 'Currency', summary: 'The currency label changes' }
      : { file: 'src/app.ts', summary: 'The app changes' };
  expect(recordRisk({ changesDir: ready.fx.changesDir, runId: ready.runId, value: risk })).toMatchObject({ ok: true });
  const mutant = await recordMutant({
    projectRoot: ready.fx.project,
    changesDir: ready.fx.changesDir,
    runId: ready.runId,
    value: { risk: 'R1', file: 'src/app.ts', original, replacement },
  });
  expect(mutant).toMatchObject({ ok: true, mutant: { id: 'M1', outcome: 'surviving' } });
  expect(
    recordEquivalence({
      changesDir: ready.fx.changesDir,
      runId: ready.runId,
      mutant: 'M1',
      value: { equivalent, rationale: 'The mutant changes the label.' },
    })
  ).toMatchObject({ ok: true });
}

/** A test file of the contract runner: it covers src/app.ts and keeps each expectation it names. */
const spec = (...expectations: string[]): string =>
  ['// covers: src/app.ts', ...expectations.map((expected) => `// expect: ${expected}`)].join('\n') + '\n';

const testInput = (ready: ReadyRun, value: Record<string, unknown>) => ({
  projectRoot: ready.fx.project,
  changesDir: ready.fx.changesDir,
  runId: ready.runId,
  value,
});

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

describe('recordTest validation', () => {
  it('refuses an unknown kind, names it, and records nothing', async () => {
    const ready = await readyRun(makeProjectFixture({ root: tmp }));

    const outcome = await recordTest(testInput(ready, { kind: 'exploratory', path: 'test/catch-x.spec.ts', content: spec('x') }));

    expect(outcome).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'kind-invalid' })] });
    expect(fs.existsSync(path.join(ready.runDir, 'tests'))).toBe(false);
    expect(ledgerOf(ready.runDir).map((entry) => entry.stage)).toEqual(['started', 'setup', 'ready']);
  });

  it('refuses a catching test whose mutant is missing, unknown, or not judged non-equivalent', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const ready = await readyRun(fx);
    expect(recordRisk({ changesDir: fx.changesDir, runId: ready.runId, value: { requirement: 'Currency', summary: 'x' } })).toMatchObject({ ok: true });
    await recordMutant({
      projectRoot: fx.project,
      changesDir: fx.changesDir,
      runId: ready.runId,
      value: { risk: 'R1', file: 'src/app.ts', original: LABEL_ORIGINAL, replacement: LABEL_REPLACEMENT },
    });
    const runsBefore = readRunsLog(fx.recordPath).length;
    const content = spec("export const label = 'value';");

    const surviving = await recordTest(testInput(ready, { kind: 'catching', mutant: 'M1', path: 'test/catch-label.spec.ts', content }));
    const unknown = await recordTest(testInput(ready, { kind: 'catching', mutant: 'M9', path: 'test/catch-label.spec.ts', content }));
    const missing = await recordTest(testInput(ready, { kind: 'catching', path: 'test/catch-label.spec.ts', content }));

    expect(surviving).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'mutant-not-non-equivalent' })] });
    expect(unknown).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'mutant-unknown' })] });
    expect(missing).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'mutant-required' })] });
    expect(readRunsLog(fx.recordPath).length).toBe(runsBefore);
    expect(fs.existsSync(path.join(ready.runDir, 'tests'))).toBe(false);
  });

  it('refuses fields that do not belong to the kind, and names each of them', async () => {
    const ready = await readyRun(makeProjectFixture({ root: tmp }));
    await judgedMutant(ready, LABEL_ORIGINAL, LABEL_REPLACEMENT, false);

    const outcome = await recordTest(
      testInput(ready, {
        kind: 'catching',
        mutant: 'M1',
        requirement: 'Currency',
        scenario: 'Currency kept',
        path: 'test/catch-label.spec.ts',
        content: spec("export const label = 'value';"),
      })
    );

    expect(outcome).toMatchObject({ ok: false });
    expect((outcome as { issues: Array<{ code: string }> }).issues.filter((issue) => issue.code === 'unknown-field')).toHaveLength(2);
  });

  it('refuses a functionality test in a degraded run and a dodgy-diff test in an analysis run', async () => {
    const analysis = await readyRun(makeProjectFixture({ root: tmp }));
    const degradedRoot = path.join(tmp, 'degraded');
    fs.mkdirSync(degradedRoot);
    const degraded = await readyRun(makeProjectFixture({ root: degradedRoot }), true);

    const functionality = await recordTest(
      testInput(degraded, { kind: 'functionality', requirement: 'Currency', path: 'test/catch-currency.spec.ts', content: spec('x') })
    );
    const dodgy = await recordTest(testInput(analysis, { kind: 'dodgy-diff', path: 'test/catch-dodgy.spec.ts', content: spec('x') }));

    expect(functionality).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'kind-mode' })] });
    expect(dodgy).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'kind-mode' })] });
  });

  it('requires a functionality requirement that is added or modified, and a scenario of it', async () => {
    const ready = await readyRun(makeProjectFixture({ root: tmp }));
    const base = { kind: 'functionality', path: 'test/catch-currency.spec.ts', content: spec('x') };

    const preserved = await recordTest(testInput(ready, { ...base, requirement: 'Tax rounding' }));
    const unknown = await recordTest(testInput(ready, { ...base, requirement: 'Nope' }));
    const missing = await recordTest(testInput(ready, base));
    const scenario = await recordTest(testInput(ready, { ...base, requirement: 'Currency', scenario: 'Missing scenario' }));

    expect(preserved).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'requirement-status' })] });
    expect(unknown).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'requirement-unknown' })] });
    expect(missing).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'requirement-required' })] });
    expect(scenario).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'scenario-unknown' })] });
  });

  it('words the refused functionality requirement as a test, and keeps the message of an unknown name', async () => {
    const ready = await readyRun(makeProjectFixture({ root: tmp }));
    const base = { kind: 'functionality', path: 'test/catch-currency.spec.ts', content: spec('x') };

    const preserved = await recordTest(testInput(ready, { ...base, requirement: 'Tax rounding' }));
    const unknown = await recordTest(testInput(ready, { ...base, requirement: 'Nope' }));

    expect(preserved.ok).toBe(false);
    expect(unknown.ok).toBe(false);
    if (preserved.ok || unknown.ok) {
      throw new Error('both functionality tests should be refused');
    }
    expect(preserved.issues[0].message).toBe(
      '"Tax rounding" is preserved: a functionality test covers an added or modified requirement.'
    );
    expect(unknown.issues[0].message).toBe('"Nope" is not a requirement of this intent.');
  });

  it('refuses a path that exists on the parent, leaves the project, or is absolute', async () => {
    const ready = await readyRun(makeProjectFixture({ root: tmp }));
    const base = { kind: 'functionality', requirement: 'Currency', content: spec('x') };

    const existing = await recordTest(testInput(ready, { ...base, path: 'src/app.ts' }));
    const leaving = await recordTest(testInput(ready, { ...base, path: '../escape.spec.ts' }));
    const absolute = await recordTest(testInput(ready, { ...base, path: path.join(tmp, 'escape.spec.ts') }));

    expect(existing).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'path-exists' })] });
    expect(leaving).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'path-invalid' })] });
    expect(absolute).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'path-invalid' })] });
  });

  it('refuses a path under a file of the parent as a path, and stores nothing', async () => {
    const ready = await readyRun(makeProjectFixture({ root: tmp }));

    const outcome = await recordTest(
      testInput(ready, { kind: 'functionality', requirement: 'Currency', path: 'src/app.ts/catch.spec.ts', content: spec('x') })
    );

    expect(outcome).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'path-invalid' })] });
    expect(fs.existsSync(path.join(ready.runDir, 'tests'))).toBe(false);
  });

  it('refuses blank content', async () => {
    const ready = await readyRun(makeProjectFixture({ root: tmp }));

    const outcome = await recordTest(
      testInput(ready, { kind: 'functionality', requirement: 'Currency', path: 'test/catch-currency.spec.ts', content: ' \n' })
    );

    expect(outcome).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'content-missing' })] });
  });

  it('lists every problem of one input at once, and writes nothing', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const ready = await readyRun(fx);
    const runsBefore = readRunsLog(fx.recordPath).length;

    const outcome = await recordTest(
      testInput(ready, { kind: 'catching', mutant: 'M9', path: '../escape.spec.ts', content: '' })
    );

    expect(outcome.ok).toBe(false);
    const codes = (outcome as { issues: Array<{ code: string }> }).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(['mutant-unknown', 'path-invalid', 'content-missing']));
    expect(readRunsLog(fx.recordPath).length).toBe(runsBefore);
    expect(fs.existsSync(path.join(ready.runDir, 'tests'))).toBe(false);
  });
});

describe('recordTest parent gates', () => {
  const LABEL_TEST = 'test/catch-label.spec.ts';

  it('gates a catching test that passes on the parent every run and fails on the mutant, and restores the parent', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 } });
    const ready = await readyRun(fx);
    await judgedMutant(ready, LABEL_ORIGINAL, LABEL_REPLACEMENT);
    const runsBefore = readRunsLog(fx.recordPath).length;

    const outcome = await recordTest(
      testInput(ready, { kind: 'catching', mutant: 'M1', path: LABEL_TEST, content: spec("export const label = 'value';") })
    );

    expect(outcome).toMatchObject({
      ok: true,
      test: {
        id: 'T1',
        kind: 'catching',
        mutant: 'M1',
        path: LABEL_TEST,
        outcome: 'gated',
        parentOutcomes: ['pass', 'pass'],
        mutantOutcome: 'fail',
      },
    });
    // Two parent runs and one run on the mutated parent.
    expect(readRunsLog(fx.recordPath).length - runsBefore).toBe(3);
    expect(changedInWorktree(ready.worktree, 'src/app.ts')).toBe(false);
    expect(ledgerOf(ready.runDir).filter((entry) => entry.stage === 'test')).toEqual([
      expect.objectContaining({ stage: 'test', test: 'T1', kind: 'catching', outcome: 'gated', mutantOutcome: 'fail' }),
    ]);
  });

  it('writes the test into the worktree before each run, and removes it after each run', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 } });
    const ready = await readyRun(fx);
    await judgedMutant(ready, LABEL_ORIGINAL, LABEL_REPLACEMENT);
    const content = spec("export const label = 'value';");
    const runsBefore = readRunsLog(fx.recordPath).length;

    const outcome = await recordTest(testInput(ready, { kind: 'catching', mutant: 'M1', path: LABEL_TEST, content }));

    expect(outcome).toMatchObject({ ok: true, test: { content: 'tests/T1/catch-label.spec.ts' } });
    const testRuns = readRunsLog(fx.recordPath)
      .slice(runsBefore)
      .map((run) => run.find((entry) => entry.name.endsWith(LABEL_TEST)));
    expect(testRuns).toHaveLength(3);
    for (const entry of testRuns) {
      expect(entry?.text).toBe(content);
    }
    expect(fs.existsSync(path.join(ready.worktree, ...LABEL_TEST.split('/')))).toBe(false);
    expect(fs.readFileSync(path.join(ready.runDir, 'tests', 'T1', 'catch-label.spec.ts'), 'utf8')).toBe(content);
  });

  it('stops a catching test whose parent does not pass, and never applies the mutant', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 } });
    const ready = await readyRun(fx);
    await judgedMutant(ready, LABEL_ORIGINAL, LABEL_REPLACEMENT);
    const runsBefore = readRunsLog(fx.recordPath).length;

    const outcome = await recordTest(
      testInput(ready, { kind: 'catching', mutant: 'M1', path: LABEL_TEST, content: spec('export const value = 2;') })
    );

    expect(outcome).toMatchObject({
      ok: true,
      test: { id: 'T1', outcome: 'parent-not-passing', parentOutcomes: ['fail', 'fail'], mutantOutcome: null },
    });
    expect(readRunsLog(fx.recordPath).length - runsBefore).toBe(2);
    expect(changedInWorktree(ready.worktree, 'src/app.ts')).toBe(false);
  });

  it('marks a catching test whose parent runs disagree as flaky-parent', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 } });
    const ready = await readyRun(fx);
    await judgedMutant(ready, LABEL_ORIGINAL, LABEL_REPLACEMENT);
    const content = `// fake: flaky on base\n${spec("export const label = 'value';")}`;

    const outcome = await recordTest(testInput(ready, { kind: 'catching', mutant: 'M1', path: LABEL_TEST, content }));

    expect(outcome).toMatchObject({
      ok: true,
      test: { outcome: 'flaky-parent', parentOutcomes: ['fail', 'pass'], mutantOutcome: null },
    });
  });

  it('marks a catching test that still passes on the mutant as not-caught-by-test', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 } });
    const ready = await readyRun(fx);
    await judgedMutant(ready, LABEL_ORIGINAL, LABEL_REPLACEMENT);

    const outcome = await recordTest(
      testInput(ready, { kind: 'catching', mutant: 'M1', path: LABEL_TEST, content: spec('export const value = 1;') })
    );

    expect(outcome).toMatchObject({
      ok: true,
      test: { outcome: 'not-caught-by-test', parentOutcomes: ['pass', 'pass'], mutantOutcome: 'pass' },
    });
    expect(changedInWorktree(ready.worktree, 'src/app.ts')).toBe(false);
  });

  it('does not count a mutant run that does not build as caught: the test is not-caught-by-test with no-build', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 } });
    const ready = await readyRun(fx);
    // The shadow string holds the head value, so only the mutated parent meets the head-side directive.
    await judgedMutant(ready, LABEL_ORIGINAL, `${LABEL_ORIGINAL}\nexport const shadow = 'export const value = 2;';`);
    const content = `// fake: broken on head\n${spec('export const value = 1;')}`;

    const outcome = await recordTest(testInput(ready, { kind: 'catching', mutant: 'M1', path: LABEL_TEST, content }));

    expect(outcome).toMatchObject({
      ok: true,
      test: { outcome: 'not-caught-by-test', parentOutcomes: ['pass', 'pass'], mutantOutcome: 'no-build' },
    });
    expect(changedInWorktree(ready.worktree, 'src/app.ts')).toBe(false);
  });

  it('marks a catching test whose parent run times out as inconclusive, and never applies the mutant', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 }, timeoutSeconds: 1 });
    const ready = await readyRun(fx);
    await judgedMutant(ready, LABEL_ORIGINAL, LABEL_REPLACEMENT);
    const runsBefore = readRunsLog(fx.recordPath).length;
    const content = `// fake: sleep on base\n${spec("export const label = 'value';")}`;

    const outcome = await recordTest(testInput(ready, { kind: 'catching', mutant: 'M1', path: LABEL_TEST, content }));

    expect(outcome).toMatchObject({ ok: true, test: { outcome: 'inconclusive', parentOutcomes: ['timeout'], mutantOutcome: null } });
    expect(readRunsLog(fx.recordPath).length - runsBefore).toBe(1);
  });

  it('marks a catching test whose mutant run times out as inconclusive, and restores the parent file', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 2, childRuns: 2 }, timeoutSeconds: 1 });
    const ready = await readyRun(fx);
    // The shadow string holds the head value, so only the mutated file reaches the head-side sleep directive.
    await judgedMutant(
      ready,
      LABEL_ORIGINAL,
      `${LABEL_ORIGINAL}\nexport const shadow = 'export const value = 2;';`
    );
    const content = `// fake: sleep on head\n${spec('export const value = 1;')}`;

    const outcome = await recordTest(testInput(ready, { kind: 'catching', mutant: 'M1', path: LABEL_TEST, content }));

    expect(outcome).toMatchObject({ ok: true, test: { outcome: 'inconclusive', parentOutcomes: ['pass', 'pass'], mutantOutcome: 'timeout' } });
    expect(changedInWorktree(ready.worktree, 'src/app.ts')).toBe(false);
  });
});

describe('recordTest functionality and dodgy-diff tests', () => {
  it('records the parent outcome of a functionality test once, without gating it on the parent', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const ready = await readyRun(fx);
    const runsBefore = readRunsLog(fx.recordPath).length;

    const outcome = await recordTest(
      testInput(ready, {
        kind: 'functionality',
        requirement: 'Currency',
        scenario: 'Currency kept',
        path: 'test/catch-currency.spec.ts',
        content: spec('export const value = 2;'),
      })
    );

    expect(outcome).toMatchObject({
      ok: true,
      test: { id: 'T1', kind: 'functionality', requirement: 'Currency', scenario: 'Currency kept', outcome: 'gated', parentOutcomes: ['fail'], mutantOutcome: null },
    });
    expect(readRunsLog(fx.recordPath).length - runsBefore).toBe(1);
  });

  it('gates a functionality test whose parent executes no test, with the outcome no-tests', async () => {
    const ready = await readyRun(makeProjectFixture({ root: tmp }));

    const outcome = await recordTest(
      testInput(ready, { kind: 'functionality', requirement: 'Currency', path: 'test/catch-currency.spec.ts', content: spec() })
    );

    expect(outcome).toMatchObject({ ok: true, test: { outcome: 'gated', parentOutcomes: ['no-tests'] } });
  });

  it('marks a functionality test whose parent run times out as inconclusive', async () => {
    const ready = await readyRun(makeProjectFixture({ root: tmp, timeoutSeconds: 1 }));
    const content = `// fake: sleep on base\n${spec('export const value = 1;')}`;

    const outcome = await recordTest(
      testInput(ready, { kind: 'functionality', requirement: 'Currency', path: 'test/catch-currency.spec.ts', content })
    );

    expect(outcome).toMatchObject({ ok: true, test: { outcome: 'inconclusive', parentOutcomes: ['timeout'] } });
  });

  it('records a dodgy-diff test of a degraded run as gated, with its parent outcome', async () => {
    const degraded = await readyRun(makeProjectFixture({ root: tmp }), true);

    const outcome = await recordTest(
      testInput(degraded, { kind: 'dodgy-diff', path: 'test/catch-dodgy.spec.ts', content: spec('export const value = 1;') })
    );

    expect(outcome).toMatchObject({ ok: true, test: { id: 'T1', kind: 'dodgy-diff', outcome: 'gated', parentOutcomes: ['pass'] } });
  });

  it('numbers the stored tests T1, then T2, each with its own content folder', async () => {
    const ready = await readyRun(makeProjectFixture({ root: tmp }));
    const base = { kind: 'functionality', requirement: 'Currency', content: spec() };

    const first = await recordTest(testInput(ready, { ...base, path: 'test/catch-a.spec.ts' }));
    const second = await recordTest(testInput(ready, { ...base, path: 'test/catch-b.spec.ts' }));

    expect(first).toMatchObject({ ok: true, test: { id: 'T1', content: 'tests/T1/catch-a.spec.ts' } });
    expect(second).toMatchObject({ ok: true, test: { id: 'T2', content: 'tests/T2/catch-b.spec.ts' } });
  });
});

describe('findIntentRequirement, the one requirement lookup of risks and tests (T10)', () => {
  const intent = {
    schema: 'qaspec.catch-intent/v1' as const,
    change: CHANGE,
    intentClass: 'behavior-change' as const,
    capabilities: [
      { name: 'billing', requirements: [{ name: 'Currency', status: 'modified' as const, scenarios: [] }] },
      {
        name: 'reports',
        requirements: [
          { name: 'Currency', status: 'added' as const, scenarios: [] },
          { name: 'Totals', status: 'preserved' as const, scenarios: [] },
        ],
      },
    ],
  };

  it('returns the one requirement with the name, with the capability that lists it', () => {
    expect(findIntentRequirement(intent, 'Totals', 'risk')).toMatchObject({
      ok: true,
      capability: 'reports',
      requirement: { name: 'Totals', status: 'preserved' },
    });
  });

  it('refuses an unknown name with one message for a risk and a test alike', () => {
    expect(findIntentRequirement(intent, 'Nope', 'risk')).toEqual({
      ok: false,
      issue: { code: 'requirement-unknown', message: '"Nope" is not a requirement of this intent.' },
    });
    expect(findIntentRequirement(intent, 'Nope', 'test')).toEqual({
      ok: false,
      issue: { code: 'requirement-unknown', message: '"Nope" is not a requirement of this intent.' },
    });
  });

  it('names the subject that cannot name an ambiguous requirement: a risk or a test', () => {
    expect(findIntentRequirement(intent, 'Currency', 'risk')).toEqual({
      ok: false,
      issue: {
        code: 'requirement-ambiguous',
        message: '"Currency" is a requirement of more than one capability (billing, reports), so the risk cannot name one.',
      },
    });
    expect(findIntentRequirement(intent, 'Currency', 'test')).toMatchObject({
      ok: false,
      issue: { message: expect.stringMatching(/so the test cannot name one\.$/) },
    });
  });
});
