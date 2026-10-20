import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { judgeCatchReport, assessCatchRun } from '../../src/core/catch-assess.js';
import { answerCatchFinding, composeFindingQuestion, reportCatchFinding } from '../../src/core/catch-findings.js';
import { runChildPhase } from '../../src/core/catch-child.js';
import { finishCatchRun, startCatchRun } from '../../src/core/catch-run.js';
import { recordTest } from '../../src/core/catch-test.js';
import { CHANGE, makeProjectFixture, type ProjectFixture } from '../fixtures/catch-jest/catch-project.js';

let tmp: string;
let envBackup: NodeJS.ProcessEnv;

beforeEach(() => {
  envBackup = { ...process.env };
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qaspec-catch-findings-'));
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

describe('the finding question (S8)', () => {
  it('puts the before text, the now text and the THEN text of the scenario into one question', () => {
    expect(
      composeFindingQuestion({
        before: 'the tax is rounded to cents',
        after: 'the tax keeps three decimals',
        then: ['the amount is rounded to cents'],
      })
    ).toBe(
      'Before: the tax is rounded to cents. Now: the tax keeps three decimals. The scenario says: the amount is rounded to cents. Is this intended?'
    );
  });

  it('says that no scenario covers the change when the risk has no scenario', () => {
    expect(composeFindingQuestion({ before: 'the total is 10', after: 'the total is 11' })).toBe(
      'Before: the total is 10. Now: the total is 11. The scenario says: no scenario covers it. Is this intended?'
    );
  });

  it('joins several THEN lines with and, and does not add a full stop a text already ends with', () => {
    expect(
      composeFindingQuestion({
        before: 'It fails.',
        after: 'It passes!',
        then: ['the list shows 3 items.', 'the order is stable'],
      })
    ).toBe('Before: It fails. Now: It passes! The scenario says: the list shows 3 items and the order is stable. Is this intended?');
  });
});

/** Gates the functionality tests of Currency in one run; each report is judged or left as it is. */
async function reportRun(
  fx: ProjectFixture,
  tests: Array<{ path: string; content: string; scenario?: string }>
): Promise<{ runId: string; runDir: string }> {
  const started = await startCatchRun({ projectRoot: fx.project, changesDir: fx.changesDir, changeName: CHANGE });
  if (!started.started) {
    throw new Error('the run did not start');
  }
  const runId = started.run.runId;
  for (const test of tests) {
    const outcome = await recordTest({
      projectRoot: fx.project,
      changesDir: fx.changesDir,
      runId,
      value: { kind: 'functionality', requirement: 'Currency', ...test },
    });
    if (!outcome.ok) {
      throw new Error(JSON.stringify(outcome.issues));
    }
  }
  return { runId, runDir: started.runDir };
}

const VALUE_ONE = '// covers: src/app.ts\n// expect: export const value = 1;\n';

const verdict = (judge: string, keep: boolean, confidence: 'high' | 'medium' | 'low' = 'high') => ({
  judge,
  keep,
  confidence,
  rationale: 'The judgement of the test.',
});

/** Classifies and assesses the run, then judges each named test: keep for true, discard for false. */
async function judgedRun(fx: ProjectFixture, runId: string, decisions: Record<string, boolean>): Promise<void> {
  expect((await runChildPhase({ projectRoot: fx.project, changesDir: fx.changesDir, runId })).status).toBe('classified');
  expect((await assessCatchRun({ projectRoot: fx.project, changesDir: fx.changesDir, runId })).ok).toBe(true);
  for (const [test, keep] of Object.entries(decisions)) {
    const verdicts = keep
      ? [verdict('a', true), verdict('b', true), verdict('c', true)]
      : [verdict('a', false, 'high'), verdict('b', false, 'high'), verdict('c', false, 'high')];
    const outcome = await judgeCatchReport({ projectRoot: fx.project, changesDir: fx.changesDir, runId, test, value: { verdicts } });
    expect(outcome.ok).toBe(true);
  }
}

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));

const ledgerOf = (runDir: string): Array<Record<string, unknown>> =>
  fs
    .readFileSync(path.join(runDir, 'ledger.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

describe('qaspec catch report and answer on a real run (S8, S10)', () => {
  it('writes findings.json and findings.md with the question, the test, the signals and the failure, and logs the report', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 1, childRuns: 1 } });
    const { runId, runDir } = await reportRun(fx, [{ path: 'test/catch-currency.spec.ts', content: VALUE_ONE, scenario: 'Currency kept' }]);
    await judgedRun(fx, runId, { T1: true });

    const outcome = await reportCatchFinding({
      changesDir: fx.changesDir,
      runId,
      test: 'T1',
      value: { before: 'the amount keeps its currency', after: 'the amount drops its currency' },
    });

    expect(outcome).toMatchObject({
      ok: true,
      run: runId,
      finding: {
        id: 'F1',
        test: 'T1',
        path: 'test/catch-currency.spec.ts',
        question:
          'Before: the amount keeps its currency. Now: the amount drops its currency. The scenario says: its currency code is kept. Is this intended?',
        scenario: 'Currency kept',
        signals: ['possibly-intended'],
        lowConfidence: false,
      },
    });
    const findings = readJson(path.join(runDir, 'findings.json')) as Array<Record<string, unknown>>;
    expect(findings).toEqual([expect.objectContaining({ id: 'F1', test: 'T1', failure: expect.stringContaining('no longer kept: export const value = 1;') })]);
    const markdown = fs.readFileSync(path.join(runDir, 'findings.md'), 'utf8');
    expect(markdown).toContain('## F1: test T1');
    expect(markdown).toContain(`qaspec catch answer --run ${runId} --finding <id> --intended yes|no`);
    expect(ledgerOf(runDir)).toEqual(expect.arrayContaining([expect.objectContaining({ stage: 'reported', finding: 'F1', test: 'T1' })]));
  });

  it('marks the finding of a degraded run low confidence, and says that no scenario covers it', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 1, childRuns: 1 } });
    const started = await startCatchRun({
      projectRoot: fx.project,
      changesDir: fx.changesDir,
      changeName: CHANGE,
      withoutAnalysis: true,
      head: fx.head,
    });
    if (!started.started) {
      throw new Error('the degraded run did not start');
    }
    const runId = started.run.runId;
    await recordTest({
      projectRoot: fx.project,
      changesDir: fx.changesDir,
      runId,
      value: { kind: 'dodgy-diff', path: 'test/catch-dodgy.spec.ts', content: VALUE_ONE },
    });
    await judgedRun(fx, runId, { T1: true });

    expect(await reportCatchFinding({ changesDir: fx.changesDir, runId, test: 'T1', value: { before: 'a', after: 'b' } })).toMatchObject({
      ok: true,
      finding: {
        lowConfidence: true,
        scenario: null,
        question: 'Before: a. Now: b. The scenario says: no scenario covers it. Is this intended?',
      },
    });
  });

  it('refuses a report that is not judged, a report of a judge-filtered test, an invalid input and a second report, and writes nothing for a refusal', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 1, childRuns: 1 } });
    const { runId, runDir } = await reportRun(fx, [
      { path: 'test/catch-currency.spec.ts', content: VALUE_ONE },
      { path: 'test/catch-currency-two.spec.ts', content: VALUE_ONE },
    ]);
    const report = (test: string, value: unknown) => reportCatchFinding({ changesDir: fx.changesDir, runId, test, value });
    const valid = { before: 'the amount is kept', after: 'the amount changes' };

    expect(await report('T1', valid)).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'run-state' })] });
    await judgedRun(fx, runId, { T1: true, T2: false });

    expect(await report('T2', valid)).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'judge-filtered' })] });
    expect(await report('T9', valid)).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'test-unknown' })] });
    expect(await report('T1', { before: '  ', after: 'x' })).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'input-invalid', message: expect.stringMatching(/before/) })],
    });
    expect(fs.existsSync(path.join(runDir, 'findings.json'))).toBe(false);

    expect(await report('T1', valid)).toMatchObject({ ok: true, finding: { id: 'F1' } });
    expect(await report('T1', valid)).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'already-reported' })] });
    expect((readJson(path.join(runDir, 'findings.json')) as unknown[]).length).toBe(1);
  });

  it('records no as confirmed and yes as dismissed, with the seconds from the report to the answer', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 1, childRuns: 1 } });
    const { runId, runDir } = await reportRun(fx, [
      { path: 'test/catch-currency.spec.ts', content: VALUE_ONE },
      { path: 'test/catch-currency-two.spec.ts', content: VALUE_ONE },
    ]);
    await judgedRun(fx, runId, { T1: true, T2: true });
    const first = await reportCatchFinding({ changesDir: fx.changesDir, runId, test: 'T1', value: { before: 'a', after: 'b' } });
    const second = await reportCatchFinding({ changesDir: fx.changesDir, runId, test: 'T2', value: { before: 'c', after: 'd' } });
    if (!first.ok || !second.ok) {
      throw new Error('the reports should be recorded');
    }
    const after = (finding: { reportedAt: string }, seconds: number) => new Date(Date.parse(finding.reportedAt) + seconds * 1000);

    const confirmed = await answerCatchFinding({
      changesDir: fx.changesDir,
      runId,
      finding: 'F1',
      intended: 'no',
      now: after(first.finding, 12.5),
      note: '  the amount must keep its currency  ',
    });
    const dismissed = await answerCatchFinding({
      changesDir: fx.changesDir,
      runId,
      finding: 'F2',
      intended: 'yes',
      now: after(second.finding, 3),
    });

    expect(confirmed).toEqual({
      ok: true,
      run: runId,
      finding: 'F1',
      intended: 'no',
      stage: 'confirmed',
      note: 'the amount must keep its currency',
      answeredAt: after(first.finding, 12.5).toISOString(),
      secondsToAnswer: 12.5,
    });
    expect(dismissed).toMatchObject({ ok: true, stage: 'dismissed', intended: 'yes', secondsToAnswer: 3 });
    expect(ledgerOf(runDir)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'confirmed', finding: 'F1', secondsToAnswer: 12.5 }),
        expect.objectContaining({ stage: 'dismissed', finding: 'F2', secondsToAnswer: 3 }),
      ])
    );
  });

  it('refuses an unknown finding, a second answer and an intended value other than yes or no, and records nothing', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 1, childRuns: 1 } });
    const { runId, runDir } = await reportRun(fx, [{ path: 'test/catch-currency.spec.ts', content: VALUE_ONE }]);
    await judgedRun(fx, runId, { T1: true });
    const reported = await reportCatchFinding({ changesDir: fx.changesDir, runId, test: 'T1', value: { before: 'a', after: 'b' } });
    if (!reported.ok) {
      throw new Error('the report should be recorded');
    }
    const answer = (finding: string, intended: string) =>
      answerCatchFinding({ changesDir: fx.changesDir, runId, finding, intended, now: new Date(Date.parse(reported.finding.reportedAt) + 1000) });
    expect(await answer('F1', 'yes')).toMatchObject({ ok: true, stage: 'dismissed' });
    const linesBefore = ledgerOf(runDir).length;

    expect(await answer('F9', 'no')).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'finding-unknown' })] });
    expect(await answer('F1', 'no')).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'finding-answered' })] });
    expect(await answer('F1', 'maybe')).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'intended-invalid' })] });
    expect(ledgerOf(runDir).length).toBe(linesBefore);
  });

  it('accepts the answer to a finding of a finished run, because the person may answer after finish', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 1, childRuns: 1 } });
    const { runId, runDir } = await reportRun(fx, [{ path: 'test/catch-currency.spec.ts', content: VALUE_ONE }]);
    await judgedRun(fx, runId, { T1: true });
    const reported = await reportCatchFinding({ changesDir: fx.changesDir, runId, test: 'T1', value: { before: 'a', after: 'b' } });
    if (!reported.ok) {
      throw new Error('the report should be recorded');
    }
    const finished = await finishCatchRun({ projectRoot: fx.project, changesDir: fx.changesDir, runId });
    expect(finished.run.state).toBe('finished');

    const answer = answerCatchFinding({
      changesDir: fx.changesDir,
      runId,
      finding: 'F1',
      intended: 'yes',
      now: new Date(Date.parse(reported.finding.reportedAt) + 5000),
    });

    expect(answer).toMatchObject({ ok: true, run: runId, finding: 'F1', intended: 'yes', stage: 'dismissed', secondsToAnswer: 5 });
    expect(ledgerOf(runDir)).toEqual(expect.arrayContaining([expect.objectContaining({ stage: 'dismissed', finding: 'F1' })]));
  });

  it('refuses an intended value other than yes or no with the reason and message of the shared answer core, and records nothing', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 1, childRuns: 1 } });
    const { runId, runDir } = await reportRun(fx, [{ path: 'test/catch-currency.spec.ts', content: VALUE_ONE }]);
    await judgedRun(fx, runId, { T1: true });
    const reported = await reportCatchFinding({ changesDir: fx.changesDir, runId, test: 'T1', value: { before: 'a', after: 'b' } });
    if (!reported.ok) {
      throw new Error('the report should be recorded');
    }
    const linesBefore = ledgerOf(runDir).length;

    expect(
      answerCatchFinding({
        changesDir: fx.changesDir,
        runId,
        finding: 'F1',
        intended: 'maybe',
        now: new Date(Date.parse(reported.finding.reportedAt) + 1000),
      })
    ).toEqual({ ok: false, issues: [{ code: 'intended-invalid', message: '--intended must be yes or no' }] });
    expect(ledgerOf(runDir).length).toBe(linesBefore);
  });
});
