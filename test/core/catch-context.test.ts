import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finishCatchRun, startCatchRun } from '../../src/core/catch-run.js';
import { loadCatchContext, recordRisk, toProjectChangedFiles } from '../../src/core/catch-context.js';
import {
  CHANGE,
  SETUP_FAILS,
  makeProjectFixture,
  readRecordedStart,
  type ProjectFixture,
} from '../fixtures/catch-jest/catch-project.js';

let tmp: string;
let envBackup: NodeJS.ProcessEnv;

beforeEach(() => {
  envBackup = { ...process.env };
  // The worktrees and every catch file of a test live under this scratch folder, never under the real temp folder.
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qaspec-catch-context-'));
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

/** Starts an analysis run (or a degraded one) and returns its id and folder. */
async function startRun(fx: ProjectFixture, degraded = false) {
  const outcome = await startCatchRun(
    degraded
      ? { projectRoot: fx.project, changesDir: fx.changesDir, changeName: CHANGE, withoutAnalysis: true, head: fx.head }
      : { projectRoot: fx.project, changesDir: fx.changesDir, changeName: CHANGE }
  );
  if (!outcome.started) {
    throw new Error(`the run did not start: ${outcome.blockers.map((blocker) => blocker.code).join(', ')}`);
  }
  return { runId: outcome.run.runId, runDir: outcome.runDir, run: outcome.run };
}

const contextInput = (fx: ProjectFixture, runId: string) => ({
  projectRoot: fx.project,
  changesDir: fx.changesDir,
  runId,
});

const riskInput = (fx: ProjectFixture, runId: string, value: unknown) => ({ ...contextInput(fx, runId), value });

/** The ledger lines of a run folder. */
const ledgerOf = (runDir: string): Array<Record<string, unknown>> =>
  fs
    .readFileSync(path.join(runDir, 'ledger.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

describe('toProjectChangedFiles', () => {
  it('keeps the files inside the project as project-relative paths and drops the rest', () => {
    expect(
      toProjectChangedFiles('packages/app', [
        { status: 'M', path: 'packages/app/src/app.ts' },
        { status: 'D', path: 'packages/app/old.ts' },
        { status: 'M', path: 'README.md' },
        { status: 'A', path: 'packages/app-old/x.ts' },
      ])
    ).toEqual([
      { status: 'M', path: 'src/app.ts' },
      { status: 'D', path: 'old.ts' },
    ]);
  });

  it('keeps every file unchanged for a project at the checkout root', () => {
    const files = [
      { status: 'M', path: 'src/app.ts' },
      { status: 'A', path: 'test/new.spec.ts' },
    ];

    expect(toProjectChangedFiles('', files)).toEqual(files);
  });
});

describe('loadCatchContext', () => {
  it('returns the intent, the project-relative changed files, the diff and the related tests of a ready run', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId } = await startRun(fx);

    const context = await loadCatchContext(contextInput(fx, runId));

    expect(context).toMatchObject({
      schema: 'qaspec.catch-context/v1',
      change: CHANGE,
      mode: 'analysis',
      lowConfidence: false,
      changedFiles: [{ status: 'M', path: 'src/app.ts' }],
      relatedTests: { tests: ['test/app.spec.ts'] },
    });
    expect(context.intent.intentClass).toBe('behavior-change');
    const requirements = context.intent.capabilities.flatMap((capability) =>
      capability.requirements.map((requirement) => `${requirement.name}:${requirement.status}`)
    );
    expect(requirements.sort()).toEqual(
      ['Currency:modified', 'CSV export:added', 'Legacy export:removed', 'Tax rounding:preserved'].sort()
    );
    expect(context.diff).toContain('+export const value = 2;');
  });

  it('converts the changed files of a project in a subfolder and drops the files outside it', async () => {
    const fx = makeProjectFixture({ root: tmp, subfolder: 'packages/app' });
    const { runId } = await startRun(fx);

    const context = await loadCatchContext(contextInput(fx, runId));

    expect(context.projectPrefix).toBe('packages/app');
    expect(context.changedFiles).toEqual([{ status: 'M', path: 'src/app.ts' }]);
    expect(context.diff).toContain('README.md');
    expect(context.relatedTests.tests).toEqual(['test/app.spec.ts']);
  });

  it('computes the related tests once, on the parent worktree, and caches them in the run folder', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId, runDir, run } = await startRun(fx);

    const first = await loadCatchContext(contextInput(fx, runId));

    expect(first.relatedTests.tests).toEqual(['test/app.spec.ts']);
    expect(fs.realpathSync(readRecordedStart(fx.recordPath).cwd)).toBe(fs.realpathSync(run.worktree as string));
    expect(fs.existsSync(path.join(runDir, 'related-tests.json'))).toBe(true);

    // The cache answers the second call: the runner is not started again.
    fs.rmSync(fx.recordPath);
    const second = await loadCatchContext(contextInput(fx, runId));

    expect(second.relatedTests).toEqual(first.relatedTests);
    expect(fs.existsSync(fx.recordPath)).toBe(false);
  });

  it('refuses a run that is not ready and names its state', async () => {
    const fx = makeProjectFixture({ root: tmp, setupCommand: SETUP_FAILS });
    const { runId } = await startRun(fx);

    await expect(loadCatchContext(contextInput(fx, runId))).rejects.toThrow(
      /is setup-failed.*qaspec catch context needs a ready run/
    );
  });

  it('refuses a finished run, whose worktree is gone', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId } = await startRun(fx);
    await finishCatchRun({ projectRoot: fx.project, changesDir: fx.changesDir, runId });

    await expect(loadCatchContext(contextInput(fx, runId))).rejects.toThrow(/is finished/);
  });

  it('gives the context of a degraded run, with no intent and low confidence', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId } = await startRun(fx, true);

    const context = await loadCatchContext(contextInput(fx, runId));

    expect(context).toMatchObject({ mode: 'without-analysis', lowConfidence: true });
    expect(context.intent).toMatchObject({ intentClass: null, capabilities: [] });
    expect(context.changedFiles).toEqual([{ status: 'M', path: 'src/app.ts' }]);
  });

  it('refuses when the catch block no longer names a runner command, and caches nothing', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId, runDir } = await startRun(fx);
    fx.writeConfig({ baseRef: 'main', runner: { adapter: 'jest' } });

    await expect(loadCatchContext(contextInput(fx, runId))).rejects.toThrow(/runner\.command/);
    expect(fs.existsSync(path.join(runDir, 'related-tests.json'))).toBe(false);
  });
});

describe('recordRisk in analysis mode', () => {
  it('records a risk with the next id, its requirement and capability, and appends a risk ledger line', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId, runDir } = await startRun(fx);

    const first = recordRisk(riskInput(fx, runId, { requirement: 'Currency', summary: 'The currency code is dropped' }));
    const second = recordRisk(riskInput(fx, runId, { requirement: 'Tax rounding', summary: 'Rounding is skipped' }));

    expect(first).toMatchObject({
      ok: true,
      risk: { id: 'R1', mode: 'analysis', capability: 'billing-export', requirement: 'Currency' },
    });
    expect(second).toMatchObject({ ok: true, risk: { id: 'R2', requirement: 'Tax rounding' } });
    expect(ledgerOf(runDir).filter((line) => line.stage === 'risk').map((line) => line.risk)).toEqual(['R1', 'R2']);
  });

  it.each([
    ['preserved', 'Tax rounding'],
    ['modified', 'Currency'],
    ['added', 'CSV export'],
  ])('accepts a %s requirement of the intent', async (_status, requirement) => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId } = await startRun(fx);

    expect(recordRisk(riskInput(fx, runId, { requirement, summary: 'a risk' }))).toMatchObject({ ok: true });
  });

  it('accepts a scenario the requirement has, and refuses one it does not have', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId } = await startRun(fx);

    expect(
      recordRisk(riskInput(fx, runId, { requirement: 'Tax rounding', scenario: 'Tax rounded', summary: 'a risk' }))
    ).toMatchObject({ ok: true, risk: { scenario: 'Tax rounded' } });
    expect(
      recordRisk(riskInput(fx, runId, { requirement: 'Tax rounding', scenario: 'Never written', summary: 'a risk' }))
    ).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'scenario-unknown' })] });
  });

  it('refuses a removed requirement and names its status', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId, runDir } = await startRun(fx);

    const outcome = recordRisk(riskInput(fx, runId, { requirement: 'Legacy export', summary: 'a risk' }));

    expect(outcome).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'requirement-status' })] });
    expect((outcome as { issues: Array<{ message: string }> }).issues[0].message).toContain('removed');
    expect(fs.existsSync(path.join(runDir, 'risks'))).toBe(false);
  });

  it('refuses a requirement the intent does not have', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId } = await startRun(fx);

    expect(recordRisk(riskInput(fx, runId, { requirement: 'Invented', summary: 'a risk' }))).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'requirement-unknown' })],
    });
  });

  it('refuses a requirement name that two capabilities share, instead of guessing one', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId, runDir } = await startRun(fx);
    fs.writeFileSync(
      path.join(runDir, 'intent.json'),
      JSON.stringify({
        schema: 'qaspec.catch-intent/v1',
        change: CHANGE,
        intentClass: 'behavior-change',
        capabilities: [
          { name: 'billing-export', requirements: [{ name: 'Currency', status: 'modified', scenarios: [] }] },
          { name: 'invoice-export', requirements: [{ name: 'Currency', status: 'preserved', scenarios: [] }] },
        ],
      })
    );

    expect(recordRisk(riskInput(fx, runId, { requirement: 'Currency', summary: 'a risk' }))).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'requirement-ambiguous' })],
    });
  });

  it('refuses a file in analysis mode, and reports every problem of the input at once', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId } = await startRun(fx);

    const outcome = recordRisk(riskInput(fx, runId, { requirement: 'Invented', file: 'src/app.ts', extra: true }));

    expect(outcome).toMatchObject({ ok: false });
    const codes = (outcome as { issues: Array<{ code: string }> }).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(['unknown-field', 'summary-missing', 'requirement-unknown']));
  });

  it('refuses an input that is not a JSON object', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId } = await startRun(fx);

    expect(recordRisk(riskInput(fx, runId, ['not', 'an', 'object']))).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'input-not-object' })],
    });
  });

  it('refuses a risk on a finished run', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId } = await startRun(fx);
    await finishCatchRun({ projectRoot: fx.project, changesDir: fx.changesDir, runId });

    expect(() => recordRisk(riskInput(fx, runId, { requirement: 'Currency', summary: 'a risk' }))).toThrow(
      /is finished/
    );
  });
});

describe('recordRisk in degraded mode', () => {
  it('records a risk on a changed file and refuses a file that did not change', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId, runDir } = await startRun(fx, true);

    const accepted = recordRisk(riskInput(fx, runId, { file: 'src/app.ts', summary: 'The label is lost' }));
    const refused = recordRisk(riskInput(fx, runId, { file: 'src/util.ts', summary: 'Not changed' }));

    expect(accepted).toMatchObject({
      ok: true,
      risk: { id: 'R1', mode: 'without-analysis', file: 'src/app.ts' },
    });
    expect(refused).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'file-not-changed' })] });
    expect(ledgerOf(runDir).filter((line) => line.stage === 'risk')).toHaveLength(1);
  });

  it('refuses a requirement in degraded mode, where a risk names a changed file', async () => {
    const fx = makeProjectFixture({ root: tmp });
    const { runId } = await startRun(fx, true);

    expect(recordRisk(riskInput(fx, runId, { requirement: 'Currency', summary: 'a risk' }))).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'unknown-field' }), expect.objectContaining({ code: 'file-required' })],
    });
  });
});
