import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeAnalyzeContentHash, writeApprovalRecord } from '../../src/core/approval-ledger.js';
import {
  buildResults,
  readTcmsMapping,
  recordTcmsMapping,
  runResultsGate,
  tcmsStatusOf,
} from '../../src/core/execution-results.js';
import {
  confirmRun,
  finishRun,
  findRun,
  recordObservations,
  startRun,
  storePlan,
  type RunLocation,
} from '../../src/core/execution-run.js';
import { triageCase } from '../../src/core/execution-triage.js';
import { writeTcmsTarget } from '../../src/core/tcms-target.js';
import { writeChangeMetadata } from '../../src/utils/change-metadata.js';

const CHANGE = 'pr-1';
const APPROVED_AT = '2026-10-19T12:00:00.000Z';
const TCMS_TARGET = { provider: 'example-tcms', project: 'QA' };

const TESTCASES = [
  '## Suite: Export',
  '',
  '- [ ] 1.1 Export totals',
  '  <!-- req: billing-export/export-totals -->',
  '',
  '  **Preconditions:**',
  '  1. Setup',
  '',
  '  **Steps:**',
  '  | # | Action | Expected |',
  '  |---|--------|----------|',
  '  | 1 | Navigate to the report | Report shown |',
  '  | 2 | Click save | Saved banner shown |',
  '',
  '- [ ] 1.2 Export by date',
  '  <!-- req: billing-export/export-totals -->',
  '',
  '  **Preconditions:**',
  '  1. Setup',
  '',
  '  **Steps:**',
  '  | # | Action | Expected |',
  '  |---|--------|----------|',
  '  | 1 | Pick a date | Date shown |',
  '',
  '- [ ] 1.3 Export as CSV',
  '  <!-- req: billing-export/export-totals -->',
  '',
  '  **Preconditions:**',
  '  1. Setup',
  '',
  '  **Steps:**',
  '  | # | Action | Expected |',
  '  |---|--------|----------|',
  '  | 1 | Pick CSV | CSV offered |',
  '',
].join('\n');

/** A second case with the title of 1.1, so a title matches more than one testcase. */
const DUPLICATE_TITLE_CASE = [
  '- [ ] 1.4 Export totals',
  '  <!-- req: billing-export/export-totals -->',
  '',
  '  **Preconditions:**',
  '  1. Setup',
  '',
  '  **Steps:**',
  '  | # | Action | Expected |',
  '  |---|--------|----------|',
  '  | 1 | Open the export | Export page shown |',
  '',
].join('\n');

const CONTROL_CASE = [
  '## Suite: Smoke',
  '',
  '- [ ] 9.1 Home page loads',
  '',
  '  **Steps:**',
  '  | # | Action | Expected |',
  '  |---|--------|----------|',
  '  | 1 | Open the home page | Home heading shown |',
  '',
].join('\n');

const BASE_EXECUTION = ['  app:', '    url: https://app.example.test/', '    readiness: manual', '  controlCase: qa/smoke/control.md', ''].join('\n');

const CONTROL_PLAN = {
  schema: 'qaspec.execution-plan/v1',
  change: CHANGE,
  case: { id: '9.1', title: 'Home page loads' },
  steps: [{ n: 1, checks: [{ id: 'home-heading', source: { kind: 'dom', target: 'page heading' }, op: 'equals', value: 'Home' }] }],
};

const CASE_1_PLAN = {
  schema: 'qaspec.execution-plan/v1',
  change: CHANGE,
  case: { id: '1.1', title: 'Export totals' },
  steps: [
    { n: 1, checks: [{ id: 'report-title', source: { kind: 'dom', target: 'report heading' }, op: 'contains', value: 'Report' }] },
    { n: 2, checks: [{ id: 'banner', source: { kind: 'dom', target: 'status banner' }, op: 'equals', value: 'Saved' }] },
  ],
};

/** A step a person must judge: no check can express its Expected cell. */
const CASE_2_PLAN = {
  schema: 'qaspec.execution-plan/v1',
  change: CHANGE,
  case: { id: '1.2', title: 'Export by date' },
  steps: [{ n: 1, checks: [], needsHuman: 'The date picker is a canvas control' }],
};

const observed = (entries: Array<{ check: string; after: unknown }>) => ({
  schema: 'qaspec.execution-observations/v1',
  observations: entries,
});
const CONTROL_PASS = observed([{ check: 'home-heading', after: 'Home' }]);
const CONTROL_FAIL = observed([{ check: 'home-heading', after: 'Error page' }]);
const CASE_1_PASS = observed([
  { check: 'report-title', after: 'Report' },
  { check: 'banner', after: 'Saved' },
]);
const CASE_1_FAIL = observed([
  { check: 'report-title', after: 'Report' },
  { check: 'banner', after: 'Error' },
]);
/** A failing verdict whose observed value must never reach a results comment. */
const CASE_1_FAIL_RAW = observed([
  { check: 'report-title', after: 'Report' },
  { check: 'banner', after: 'S3cret-Raw-Banner-Value' },
]);
const NO_OBSERVATIONS = observed([]);

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const planBytes = (plan: unknown) => Buffer.from(json(plan));
const obsBytes = (value: unknown) => Buffer.from(json(value));

describe('execution results (T8)', () => {
  let projectRoot: string;
  let changesDir: string;
  let changeDir: string;

  const write = async (relativePath: string, content: string) => {
    const target = path.join(projectRoot, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  };

  /** An analyze-approved change with its testcases and the control case of the execution block. */
  const setUpChange = async (testcases: string = TESTCASES) => {
    await write(path.join('qaspec', 'config.yaml'), `execution:\n${BASE_EXECUTION}`);
    await write('qa/smoke/control.md', CONTROL_CASE);
    await write(path.join('qaspec', 'changes', CHANGE, 'analysis.md'), '# Analysis\n');
    await write(
      path.join('qaspec', 'changes', CHANGE, 'specs', 'billing-export', 'spec.md'),
      '## ADDED Requirements\n\n### Requirement: Export totals\n'
    );
    await write(path.join('qaspec', 'changes', CHANGE, 'testcases.md'), testcases);
    writeChangeMetadata(changeDir, { schema: 'qaspec-pr-review', created: '2026-10-19' });
    const { hash } = computeAnalyzeContentHash(changeDir);
    writeApprovalRecord(changeDir, 'analyze', { approvedAt: APPROVED_AT, contentHash: hash });
  };

  const locate = (runId: string): RunLocation => findRun(changesDir, runId);
  const runDirOf = (runId: string) => locate(runId).runDir;
  const readRunFile = (runId: string) => JSON.parse(readFileSync(path.join(runDirOf(runId), 'run.json'), 'utf-8'));

  const writeEvidence = async (runId: string, relativePath: string, content = 'evidence') => {
    const target = path.join(runDirOf(runId), 'evidence', relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  };

  /** Starts a run that is confirmed and has no plans yet. */
  const startOnly = async (): Promise<string> => {
    const outcome = await startRun({ changeName: CHANGE, changeDir, projectRoot });
    if (!outcome.started) {
      throw new Error(`start was refused: ${outcome.blockers.map((blocker) => blocker.code).join(', ')}`);
    }
    return outcome.run.id;
  };

  /** Starts a run and records a passing control case at the start. */
  const startWithControl = async (): Promise<string> => {
    const runId = await startOnly();
    confirmRun(locate(runId));
    storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN));
    recordObservations(locate(runId), 'control', obsBytes(CONTROL_PASS));
    return runId;
  };

  const planCase = (runId: string, caseArg: string, plan: unknown) => storePlan(locate(runId), caseArg, planBytes(plan));

  const recordCase = (runId: string, caseArg: string, observation: unknown) =>
    recordObservations(locate(runId), caseArg, obsBytes(observation));

  /** Plans a case and records a failing verdict twice, so the case needs triage. */
  const failCaseTwice = (runId: string, caseArg: string, plan: unknown, observation: unknown) => {
    planCase(runId, caseArg, plan);
    recordCase(runId, caseArg, observation);
    recordCase(runId, caseArg, observation);
  };

  /** Plans and records the control case at the end, then finishes the run. */
  const finishWithControl = (runId: string, controlEnd: unknown = CONTROL_PASS) => {
    storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN));
    recordObservations(locate(runId), 'control', obsBytes(controlEnd));
    return finishRun(locate(runId));
  };

  /** The payload of a run whose results are built; a refusal fails the test with its message. */
  const payloadOf = (runId: string) => {
    const outcome = buildResults(locate(runId));
    if (!outcome.ok) {
      throw new Error(`results refused: ${outcome.issues.map((issue) => issue.message).join('; ')}`);
    }
    return outcome.payload;
  };

  const entryOf = (runId: string, caseId: string) => payloadOf(runId).results.find((item) => item.case === caseId);

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-results-'));
    changesDir = path.join(projectRoot, 'qaspec', 'changes');
    changeDir = path.join(changesDir, CHANGE);
    execFileSync('git', ['init', '-q'], { cwd: projectRoot });
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  describe('buildResults', () => {
    it('refuses to build results before the run finishes', async () => {
      await setUpChange();
      const runId = await startWithControl();

      const outcome = buildResults(locate(runId));

      expect(outcome).toMatchObject({
        ok: false,
        issues: [{ message: expect.stringContaining('only for a finished run') }],
      });
    });

    it('maps a passed case to passed, with its verdict, attempt count and evidence files', async () => {
      await setUpChange();
      const runId = await startWithControl();
      planCase(runId, '1.1', CASE_1_PLAN);
      recordCase(runId, '1.1', CASE_1_PASS);
      await writeEvidence(runId, path.join('1.1-1', 'console.log'), 'no errors');
      finishWithControl(runId);

      expect(entryOf(runId, '1.1')).toEqual({
        case: '1.1',
        title: 'Export totals',
        status: 'passed',
        comment: 'Verdict passed (attempts: 1).',
        attempts: 1,
        evidence: [path.join('evidence', '1.1-1', 'console.log')],
      });
    });

    it('maps a case judged app to failed, and its comment names the finding and its sense-check question', async () => {
      await setUpChange();
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      triageCase(locate(runId), '1.1', {
        classification: 'app',
        rationale: 'The banner reports an error after a valid save',
        expected: 'Saved banner shown',
        observed: 'Error banner shown',
      });
      finishWithControl(runId);

      expect(entryOf(runId, '1.1')).toMatchObject({
        status: 'failed',
        attempts: 2,
        comment:
          'Verdict failed (attempts: 2). Finding F1: Case 1.1 expects: Saved banner shown. The run observed: Error banner shown. Is this intended?',
      });
    });

    it.each([
      ['agent', 'Blocked: judged agent.'],
      ['environment', 'Blocked: judged environment.'],
    ] as const)('maps a case judged %s to blocked, with no finding', async (classification, reason) => {
      await setUpChange();
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      triageCase(locate(runId), '1.1', { classification, rationale: 'The test account had no data' });
      finishWithControl(runId);

      expect(entryOf(runId, '1.1')).toMatchObject({ status: 'blocked', comment: `Verdict failed (attempts: 2). ${reason}` });
      expect(JSON.stringify(payloadOf(runId))).not.toContain('Finding F');
    });

    it('maps a case that needs triage and has no judgement yet to blocked, awaiting triage', async () => {
      await setUpChange();
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      finishWithControl(runId);

      expect(entryOf(runId, '1.1')).toMatchObject({
        status: 'blocked',
        comment: 'Verdict failed (attempts: 2). Blocked: awaiting triage.',
      });
    });

    it('maps a needs-human case to blocked, since it is final at once and a person must judge it', async () => {
      await setUpChange();
      const runId = await startWithControl();
      planCase(runId, '1.2', CASE_2_PLAN);
      recordCase(runId, '1.2', NO_OBSERVATIONS);
      finishWithControl(runId);

      expect(entryOf(runId, '1.2')).toMatchObject({
        status: 'blocked',
        attempts: 1,
        comment: 'Verdict needs-human (attempts: 1). Blocked: a step needs a person.',
      });
    });

    it('maps a case that was never planned to skipped', async () => {
      await setUpChange();
      const runId = await startWithControl();
      finishWithControl(runId);

      expect(entryOf(runId, '1.3')).toEqual({
        case: '1.3',
        title: 'Export as CSV',
        status: 'skipped',
        comment: 'No verdict (attempts: 0). Skipped: never planned.',
        attempts: 0,
        evidence: [],
      });
    });

    it('reports every case of an environment-noise run as blocked, with the reason the run finished', async () => {
      await setUpChange();
      const runId = await startWithControl();
      planCase(runId, '1.1', CASE_1_PLAN);
      recordCase(runId, '1.1', CASE_1_PASS);
      const finished = finishWithControl(runId, CONTROL_FAIL);
      const reason = 'Blocked: run is environment-noise (control case at the end is needs-triage).';

      expect(finished.state).toBe('environment-noise');
      expect(buildResults(locate(runId))).toMatchObject({
        ok: true,
        payload: { state: 'environment-noise', finishReasons: ['control case at the end is needs-triage'] },
      });
      expect(payloadOf(runId).results).toEqual([
        { case: '1.1', title: 'Export totals', status: 'blocked', comment: `Verdict passed (attempts: 1). ${reason}`, attempts: 1, evidence: [] },
        { case: '1.2', title: 'Export by date', status: 'blocked', comment: `No verdict (attempts: 0). ${reason}`, attempts: 0, evidence: [] },
        { case: '1.3', title: 'Export as CSV', status: 'blocked', comment: `No verdict (attempts: 0). ${reason}`, attempts: 0, evidence: [] },
      ]);
    });

    it('leaves the control cases out of the results', async () => {
      await setUpChange();
      const runId = await startWithControl();
      finishWithControl(runId);

      expect(payloadOf(runId).results.map((item) => item.case)).toEqual(['1.1', '1.2', '1.3']);
      expect(JSON.stringify(payloadOf(runId))).not.toContain('Home page loads');
    });

    it('uses the checkbox text after the case number as the title, in testcases.md order', async () => {
      await setUpChange();
      const runId = await startWithControl();
      finishWithControl(runId);

      expect(payloadOf(runId).results.map((item) => item.title)).toEqual(['Export totals', 'Export by date', 'Export as CSV']);
    });

    it('keeps raw observed values out of the comments', async () => {
      await setUpChange();
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL_RAW);
      finishWithControl(runId);

      expect(JSON.stringify(payloadOf(runId))).not.toContain('S3cret-Raw-Banner-Value');
      expect(entryOf(runId, '1.1')?.comment).toBe('Verdict failed (attempts: 2). Blocked: awaiting triage.');
    });

    it('lists the evidence files of every attempt, relative to the run', async () => {
      await setUpChange();
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      await writeEvidence(runId, path.join('1.1-1', 'console.log'), 'TypeError');
      await writeEvidence(runId, path.join('1.1-2', 'shot.png'), 'png');
      finishWithControl(runId);

      expect(entryOf(runId, '1.1')?.evidence).toEqual([
        path.join('evidence', '1.1-1', 'console.log'),
        path.join('evidence', '1.1-2', 'shot.png'),
      ]);
    });

    it('refuses to build results when testcases.md is missing, because titles cannot be matched', async () => {
      await setUpChange();
      const runId = await startWithControl();
      finishWithControl(runId);
      await fs.rm(path.join(changeDir, 'testcases.md'));

      expect(buildResults(locate(runId))).toMatchObject({
        ok: false,
        issues: [{ message: expect.stringContaining('testcases.md') }],
      });
    });
  });

  describe('tcmsStatusOf', () => {
    it.each([
      ['passed', undefined, 'passed'],
      ['needs-triage', 'app', 'failed'],
      ['needs-triage', 'agent', 'blocked'],
      ['needs-triage', 'environment', 'blocked'],
      ['needs-triage', undefined, 'blocked'],
      ['needs-human', undefined, 'blocked'],
      ['blocked-by-environment', undefined, 'blocked'],
      ['planned', undefined, 'blocked'],
      ['retry', undefined, 'blocked'],
      ['pending', undefined, 'skipped'],
      [undefined, undefined, 'skipped'],
    ] as const)('maps status %s with judgement %s to %s', (status, judged, expected) => {
      expect(tcmsStatusOf(status, judged)).toBe(expected);
    });
  });

  describe('runResultsGate', () => {
    it('refuses while the run is not finished, and stores no token', async () => {
      await setUpChange();
      const runId = await startWithControl();
      writeTcmsTarget(changeDir, TCMS_TARGET, projectRoot);

      const gate = runResultsGate(locate(runId), projectRoot);

      expect(gate.passed).toBe(false);
      expect(gate.token).toBeUndefined();
      expect(gate.failures.map((failure) => failure.code)).toEqual(['run-not-finished']);
      expect(readRunFile(runId).resultsGate).toBeUndefined();
    });

    it('reports an unfinished run and a missing TCMS target together', async () => {
      await setUpChange();
      const runId = await startWithControl();

      const gate = runResultsGate(locate(runId), projectRoot);

      expect(gate.failures.map((failure) => failure.code)).toEqual(['run-not-finished', 'tcms-missing']);
    });

    it('refuses a finished run whose case needs triage and has no judgement, and names the case', async () => {
      await setUpChange();
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      finishWithControl(runId);
      writeTcmsTarget(changeDir, TCMS_TARGET, projectRoot);

      const gate = runResultsGate(locate(runId), projectRoot);

      expect(gate.passed).toBe(false);
      expect(gate.failures).toEqual([expect.objectContaining({ code: 'triage-pending', message: expect.stringContaining('1.1') })]);
      expect(readRunFile(runId).resultsGate).toBeUndefined();
    });

    it('refuses testcases whose titles repeat, since TCMS matching by title would be ambiguous', async () => {
      await setUpChange(TESTCASES.replace('1.2 Export by date', '1.2 Export totals'));
      const runId = await startWithControl();
      finishWithControl(runId);
      writeTcmsTarget(changeDir, TCMS_TARGET, projectRoot);

      const gate = runResultsGate(locate(runId), projectRoot);

      expect(gate.passed).toBe(false);
      expect(gate.failures).toEqual([
        expect.objectContaining({ code: 'duplicate-titles', message: expect.stringContaining('Export totals') }),
      ]);
      expect(readRunFile(runId).resultsGate).toBeUndefined();
    });

    it('refuses a change with no usable TCMS target', async () => {
      await setUpChange();
      const runId = await startWithControl();
      finishWithControl(runId);

      const gate = runResultsGate(locate(runId), projectRoot);

      expect(gate.passed).toBe(false);
      expect(gate.token).toBeUndefined();
      expect(gate.failures.map((failure) => failure.code)).toEqual(['tcms-missing']);
    });

    it('passes a finished run with a usable TCMS target and stores its token in the run', async () => {
      await setUpChange();
      const runId = await startWithControl();
      planCase(runId, '1.1', CASE_1_PLAN);
      recordCase(runId, '1.1', CASE_1_PASS);
      finishWithControl(runId);
      writeTcmsTarget(changeDir, TCMS_TARGET, projectRoot);

      const gate = runResultsGate(locate(runId), projectRoot);

      expect(gate).toMatchObject({ passed: true, failures: [], tcms: TCMS_TARGET });
      expect(gate.token).toMatch(/^results-gate:[0-9a-f]{8}$/);
      expect(readRunFile(runId).resultsGate).toMatchObject({
        token: gate.token,
        resultsSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        storedAt: expect.any(String),
      });
    });

    it('passes an environment-noise run with an unjudged needs-triage case, since every case is reported as blocked', async () => {
      await setUpChange();
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      finishWithControl(runId, CONTROL_FAIL);
      writeTcmsTarget(changeDir, TCMS_TARGET, projectRoot);

      const gate = runResultsGate(locate(runId), projectRoot);

      expect(gate).toMatchObject({ passed: true, failures: [] });
      expect(readRunFile(runId).resultsGate.token).toBe(gate.token);
    });
  });

  describe('recordTcmsMapping', () => {
    it('reads an empty mapping before any title is recorded', async () => {
      await setUpChange();
      const runId = await startOnly();

      expect(readTcmsMapping(runDirOf(runId))).toEqual({
        schema: 'qaspec.execution-tcms/v1',
        run: runId,
        tcmsRun: null,
        cases: {},
      });
    });

    it('records the title to TCMS id mapping and the TCMS run id in tcms.json, and reads them back', async () => {
      await setUpChange();
      const runId = await startOnly();

      const outcome = recordTcmsMapping(locate(runId), { title: 'Export totals', tcmsId: '42', tcmsRun: '7' });

      expect(outcome).toMatchObject({ ok: true });
      expect(readTcmsMapping(runDirOf(runId))).toEqual({
        schema: 'qaspec.execution-tcms/v1',
        run: runId,
        tcmsRun: '7',
        cases: { 'Export totals': { tcmsId: '42', recordedAt: expect.any(String) } },
      });
    });

    it('rejects a title that is not a testcase of the change and writes nothing', async () => {
      await setUpChange();
      const runId = await startOnly();

      const outcome = recordTcmsMapping(locate(runId), { title: 'Export total', tcmsId: '42' });

      expect(outcome).toMatchObject({
        ok: false,
        issues: [{ message: expect.stringContaining('is not a testcase of change "pr-1"') }],
      });
      expect(existsSync(path.join(runDirOf(runId), 'tcms.json'))).toBe(false);
    });

    it('rejects a title that matches more than one testcase', async () => {
      await setUpChange(`${TESTCASES}\n${DUPLICATE_TITLE_CASE}`);
      const runId = await startOnly();

      const outcome = recordTcmsMapping(locate(runId), { title: 'Export totals', tcmsId: '42' });

      expect(outcome).toMatchObject({ ok: false, issues: [{ message: expect.stringContaining('matches 2 testcases') }] });
      expect(existsSync(path.join(runDirOf(runId), 'tcms.json'))).toBe(false);
    });

    it('refuses a second TCMS id for a title that is already mapped, and keeps the first', async () => {
      await setUpChange();
      const runId = await startOnly();
      recordTcmsMapping(locate(runId), { title: 'Export totals', tcmsId: '42' });

      const outcome = recordTcmsMapping(locate(runId), { title: 'Export totals', tcmsId: '43' });

      expect(outcome).toMatchObject({
        ok: false,
        issues: [{ message: expect.stringContaining('already mapped to TCMS id 42') }],
      });
      expect(readTcmsMapping(runDirOf(runId)).cases['Export totals'].tcmsId).toBe('42');
    });

    it('accepts the same mapping again and leaves the stored file unchanged', async () => {
      await setUpChange();
      const runId = await startOnly();
      recordTcmsMapping(locate(runId), { title: 'Export totals', tcmsId: '42' });
      const before = readFileSync(path.join(runDirOf(runId), 'tcms.json'), 'utf-8');

      const outcome = recordTcmsMapping(locate(runId), { title: 'Export totals', tcmsId: '42' });

      expect(outcome).toMatchObject({ ok: true });
      expect(readFileSync(path.join(runDirOf(runId), 'tcms.json'), 'utf-8')).toBe(before);
    });

    it('keeps the TCMS run id when a later mapping does not repeat it', async () => {
      await setUpChange();
      const runId = await startOnly();
      recordTcmsMapping(locate(runId), { title: 'Export totals', tcmsId: '42', tcmsRun: '7' });

      const outcome = recordTcmsMapping(locate(runId), { title: 'Export by date', tcmsId: '43' });

      expect(outcome).toMatchObject({ ok: true });
      expect(readTcmsMapping(runDirOf(runId))).toMatchObject({
        tcmsRun: '7',
        cases: {
          'Export totals': { tcmsId: '42' },
          'Export by date': { tcmsId: '43' },
        },
      });
    });

    it('refuses a TCMS run id that differs from the one already stored', async () => {
      await setUpChange();
      const runId = await startOnly();
      recordTcmsMapping(locate(runId), { title: 'Export totals', tcmsId: '42', tcmsRun: '7' });

      const outcome = recordTcmsMapping(locate(runId), { title: 'Export by date', tcmsId: '43', tcmsRun: '8' });

      expect(outcome).toMatchObject({
        ok: false,
        issues: [{ message: expect.stringContaining('already mapped to TCMS run 7') }],
      });
      expect(Object.keys(readTcmsMapping(runDirOf(runId)).cases)).toEqual(['Export totals']);
    });

    it('refuses an empty title or TCMS id', async () => {
      await setUpChange();
      const runId = await startOnly();

      expect(recordTcmsMapping(locate(runId), { title: '   ', tcmsId: '42' })).toMatchObject({
        ok: false,
        issues: [{ message: '--title must not be empty' }],
      });
      expect(recordTcmsMapping(locate(runId), { title: 'Export totals', tcmsId: ' ' })).toMatchObject({
        ok: false,
        issues: [{ message: '--tcms-id must not be empty' }],
      });
    });

    it('refuses to write while another command holds the run lock, and keeps the mapping it had', async () => {
      await setUpChange();
      const runId = await startOnly();
      recordTcmsMapping(locate(runId), { title: 'Export totals', tcmsId: '42' });
      const lockDir = path.join(runDirOf(runId), '.lock');
      await fs.mkdir(lockDir);
      await fs.writeFile(
        path.join(lockDir, 'owner.json'),
        json({ pid: process.pid, token: 'held', acquiredAt: APPROVED_AT })
      );

      expect(() =>
        recordTcmsMapping(locate(runId), { title: 'Export by date', tcmsId: '43', lockTimeoutMs: 300 })
      ).toThrow(/is busy/);
      expect(Object.keys(readTcmsMapping(runDirOf(runId)).cases)).toEqual(['Export totals']);
    });
  });
});
