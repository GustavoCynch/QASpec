import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeAnalyzeContentHash, writeApprovalRecord } from '../../src/core/approval-ledger.js';
import {
  confirmRun,
  finishRun,
  findRun,
  recordObservations,
  startRun,
  storePlan,
} from '../../src/core/execution-run.js';
import { answerFinding, triageCase, triageContext } from '../../src/core/execution-triage.js';
import { writeChangeMetadata } from '../../src/utils/change-metadata.js';

const CHANGE = 'pr-1';
const APPROVED_AT = '2026-10-19T12:00:00.000Z';
const T0 = new Date('2026-10-19T12:00:00.000Z');
/** A clock reading the given number of seconds after T0, so answer times are exact. */
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

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

const CASE_2_PLAN = {
  schema: 'qaspec.execution-plan/v1',
  change: CHANGE,
  case: { id: '1.2', title: 'Export by date' },
  steps: [{ n: 1, checks: [{ id: 'date-shown', source: { kind: 'dom', target: 'date field' }, op: 'equals', value: 'Today' }] }],
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
const CASE_2_FAIL = observed([{ check: 'date-shown', after: 'Yesterday' }]);

const BASE_EXECUTION = ['  app:', '    url: https://app.example.test/', '    readiness: manual', '  controlCase: qa/smoke/control.md', ''].join('\n');

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const planBytes = (plan: unknown) => Buffer.from(json(plan));
const obsBytes = (value: unknown) => Buffer.from(json(value));

describe('execution triage (T7)', () => {
  let projectRoot: string;
  let changesDir: string;
  let changeDir: string;

  const write = async (relativePath: string, content: string) => {
    const target = path.join(projectRoot, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  };

  const writeChange = async () => {
    await write(path.join('qaspec', 'config.yaml'), `execution:\n${BASE_EXECUTION}`);
    await write('qa/smoke/control.md', CONTROL_CASE);
    await write(path.join('qaspec', 'changes', CHANGE, 'analysis.md'), '# Analysis\n');
    await write(
      path.join('qaspec', 'changes', CHANGE, 'specs', 'billing-export', 'spec.md'),
      '## ADDED Requirements\n\n### Requirement: Export totals\n'
    );
    await write(path.join('qaspec', 'changes', CHANGE, 'testcases.md'), TESTCASES);
    writeChangeMetadata(changeDir, { schema: 'qaspec-pr-review', created: '2026-10-19' });
    const { hash } = computeAnalyzeContentHash(changeDir);
    writeApprovalRecord(changeDir, 'analyze', { approvedAt: APPROVED_AT, contentHash: hash });
  };

  const locate = (runId: string) => findRun(changesDir, runId);

  const readRunJson = (runId: string) => JSON.parse(readFileSync(path.join(locate(runId).runDir, 'run.json'), 'utf-8'));

  const ledgerLines = (runId: string): Array<Record<string, unknown>> => {
    const file = path.join(locate(runId).runDir, 'ledger.jsonl');
    return readFileSync(file, 'utf-8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
  };

  const findingsJson = (runId: string) => JSON.parse(readFileSync(path.join(locate(runId).runDir, 'findings.json'), 'utf-8'));

  const findingsMd = (runId: string) => readFileSync(path.join(locate(runId).runDir, 'findings.md'), 'utf-8');

  const writeEvidence = async (runId: string, relativePath: string, content = 'evidence') => {
    const target = path.join(locate(runId).runDir, 'evidence', relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  };

  /** Starts a confirmed run and records a passing control case at the start. */
  const startWithControl = async (): Promise<string> => {
    const outcome = await startRun({ changeName: CHANGE, changeDir, projectRoot });
    if (!outcome.started) {
      throw new Error(`start was refused: ${outcome.blockers.map((blocker) => blocker.code).join(', ')}`);
    }
    const runId = outcome.run.id;
    confirmRun(locate(runId));
    storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN));
    recordObservations(locate(runId), 'control', obsBytes(CONTROL_PASS));
    return runId;
  };

  const planCase = (runId: string, caseArg: string, plan: unknown) =>
    storePlan(locate(runId), caseArg, planBytes(plan));

  const recordCase = (runId: string, caseArg: string, observation: unknown) =>
    recordObservations(locate(runId), caseArg, obsBytes(observation));

  /** Plans a case and records a failing verdict twice, so the case needs triage. */
  const failCaseTwice = (runId: string, caseArg: string, plan: unknown, observation: unknown) => {
    planCase(runId, caseArg, plan);
    recordCase(runId, caseArg, observation);
    recordCase(runId, caseArg, observation);
  };

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-triage-'));
    changesDir = path.join(projectRoot, 'qaspec', 'changes');
    changeDir = path.join(changesDir, CHANGE);
    execFileSync('git', ['init', '-q'], { cwd: projectRoot });
    await write('.gitignore', '.env.qa\n.qaspec/auth/\n');
    await writeChange();
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  describe('triage-context', () => {
    it('returns the case text, the stored plan, both attempts with their evidence and the readiness results', async () => {
      const runId = await startWithControl();
      planCase(runId, '1.1', CASE_1_PLAN);
      recordCase(runId, '1.1', CASE_1_FAIL);
      recordCase(runId, '1.1', CASE_1_FAIL);
      await writeEvidence(runId, path.join('1.1-1', 'console.log'), 'TypeError at save');
      await writeEvidence(runId, path.join('1.1-2', 'shot.png'), 'png');
      await writeEvidence(runId, path.join('1.1-2', 'network', 'requests.json'), '[]');

      const outcome = triageContext(locate(runId), '1.1');

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) {
        return;
      }
      expect(outcome.context).toMatchObject({
        schema: 'qaspec.execution-triage-context/v1',
        run: runId,
        change: CHANGE,
        state: 'ready',
        case: '1.1',
        caseStatus: 'needs-triage',
        testcase: { id: '1.1', title: 'Export totals', source: 'testcases.md' },
        plan: { path: path.join('plans', '1.1.json'), sha256: sha256(json(CASE_1_PLAN)), content: CASE_1_PLAN },
        readiness: { mode: 'manual', checks: [] },
      });
      expect(outcome.context.testcase.text).toContain('**Preconditions:**');
      expect(outcome.context.testcase.text).toContain('| 2 | Click save | Saved banner shown |');
      expect(outcome.context.testcase.text).not.toContain('Export by date');
      expect(outcome.context.attempts).toEqual([
        {
          attempt: 1,
          verdict: 'failed',
          recordedAt: expect.any(String),
          observations: { path: path.join('observations', '1.1-1.json'), content: CASE_1_FAIL },
          result: {
            path: path.join('results', '1.1-1.json'),
            content: expect.objectContaining({ case: '1.1', attempt: 1, verdict: 'failed' }),
          },
          evidence: [path.join('evidence', '1.1-1', 'console.log')],
        },
        {
          attempt: 2,
          verdict: 'failed',
          recordedAt: expect.any(String),
          observations: { path: path.join('observations', '1.1-2.json'), content: CASE_1_FAIL },
          result: {
            path: path.join('results', '1.1-2.json'),
            content: expect.objectContaining({ case: '1.1', attempt: 2, verdict: 'failed' }),
          },
          evidence: [path.join('evidence', '1.1-2', 'network', 'requests.json'), path.join('evidence', '1.1-2', 'shot.png')],
        },
      ]);
    });

    it('reads the control case from the run snapshot when a control case needs triage', async () => {
      const outcome0 = await startRun({ changeName: CHANGE, changeDir, projectRoot });
      if (!outcome0.started) {
        throw new Error('start was refused');
      }
      const runId = outcome0.run.id;
      confirmRun(locate(runId));
      planCase(runId, 'control', CONTROL_PLAN);
      recordCase(runId, 'control', CONTROL_FAIL);

      const outcome = triageContext(locate(runId), 'control');

      expect(outcome).toMatchObject({
        ok: true,
        context: {
          case: 'control-start',
          caseStatus: 'needs-triage',
          testcase: { id: '9.1', title: 'Home page loads', source: 'control/testcases.md' },
          attempts: [{ attempt: 1, verdict: 'failed' }],
        },
      });
      expect(outcome.ok && outcome.context.testcase.text).toContain('Home heading shown');
    });

    it('refuses a case that does not need triage', async () => {
      const runId = await startWithControl();
      planCase(runId, '1.1', CASE_1_PLAN);
      recordCase(runId, '1.1', CASE_1_FAIL);

      const outcome = triageContext(locate(runId), '1.1');

      expect(outcome.ok).toBe(false);
      expect(outcome.ok === false && outcome.issues.map((issue) => issue.message)).toEqual([
        'Case 1.1 is retry: only a case that needs triage can be triaged',
      ]);
    });

    it('refuses a run that finished as environment-noise', async () => {
      const outcome0 = await startRun({ changeName: CHANGE, changeDir, projectRoot });
      if (!outcome0.started) {
        throw new Error('start was refused');
      }
      const runId = outcome0.run.id;
      confirmRun(locate(runId));
      planCase(runId, 'control', CONTROL_PLAN);
      recordCase(runId, 'control', CONTROL_FAIL);
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      planCase(runId, 'control', CONTROL_PLAN);
      recordCase(runId, 'control', CONTROL_PASS);
      expect(finishRun(locate(runId)).state).toBe('environment-noise');

      const outcome = triageContext(locate(runId), '1.1');

      expect(outcome.ok === false && outcome.issues.map((issue) => issue.message)).toEqual([
        `Run ${runId} is environment-noise: its cases produce no findings, so they are not triaged`,
      ]);
    });
  });

  describe('judgements', () => {
    it('records an agent judgement as one judged ledger line and produces no finding', async () => {
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);

      const outcome = triageCase(locate(runId), '1.1', {
        classification: 'agent',
        rationale: 'The agent clicked the wrong button',
        now: at(0),
      });

      expect(outcome).toEqual({
        ok: true,
        run: runId,
        caseKey: '1.1',
        classification: 'agent',
        rationale: 'The agent clicked the wrong button',
        judgedAt: at(0).toISOString(),
      });
      expect(ledgerLines(runId).filter((line) => line.stage !== 'candidate')).toEqual([
        { stage: 'judged', case: '1.1', classification: 'agent', rationale: 'The agent clicked the wrong button', at: at(0).toISOString() },
      ]);
      expect(existsSync(path.join(locate(runId).runDir, 'findings.json'))).toBe(false);
      expect(existsSync(path.join(locate(runId).runDir, 'findings.md'))).toBe(false);
      expect(readRunJson(runId).cases['1.1'].status).toBe('needs-triage');
    });

    it('records an environment judgement as one judged ledger line and produces no finding', async () => {
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);

      const outcome = triageCase(locate(runId), '1.1', {
        classification: 'environment',
        rationale: 'The backend answered with a maintenance page',
        now: at(0),
      });

      expect(outcome.ok && outcome.classification).toBe('environment');
      expect(ledgerLines(runId).filter((line) => line.stage !== 'candidate')).toEqual([
        expect.objectContaining({ stage: 'judged', case: '1.1', classification: 'environment' }),
      ]);
      expect(existsSync(path.join(locate(runId).runDir, 'findings.json'))).toBe(false);
    });

    it('turns an app judgement into finding F1 in findings.json and findings.md, with judged and reported ledger lines', async () => {
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);

      const outcome = triageCase(locate(runId), '1.1', {
        classification: 'app',
        rationale: 'The banner reports an error after a valid save',
        expected: 'Saved banner shown',
        observed: 'Error banner shown',
        now: at(0),
      });

      const finding = {
        id: 'F1',
        case: '1.1',
        expected: 'Saved banner shown',
        observed: 'Error banner shown',
        question: 'Case 1.1 expects: Saved banner shown. The run observed: Error banner shown. Is this intended?',
        reportedAt: at(0).toISOString(),
      };
      expect(outcome).toEqual({
        ok: true,
        run: runId,
        caseKey: '1.1',
        classification: 'app',
        rationale: 'The banner reports an error after a valid save',
        judgedAt: at(0).toISOString(),
        finding,
      });
      expect(findingsJson(runId)).toEqual([finding]);
      expect(findingsMd(runId)).toContain('F1');
      expect(findingsMd(runId)).toContain(finding.question);
      expect(ledgerLines(runId).filter((line) => line.stage !== 'candidate')).toEqual([
        {
          stage: 'judged',
          case: '1.1',
          classification: 'app',
          rationale: 'The banner reports an error after a valid save',
          at: at(0).toISOString(),
        },
        {
          stage: 'reported',
          finding: 'F1',
          case: '1.1',
          expected: 'Saved banner shown',
          observed: 'Error banner shown',
          at: at(0).toISOString(),
        },
      ]);
    });

    it('numbers findings in creation order across cases', async () => {
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      failCaseTwice(runId, '1.2', CASE_2_PLAN, CASE_2_FAIL);

      triageCase(locate(runId), '1.1', { classification: 'app', rationale: 'Banner', expected: 'Saved', observed: 'Error', now: at(0) });
      triageCase(locate(runId), '1.2', { classification: 'app', rationale: 'Date', expected: 'Today', observed: 'Yesterday', now: at(1) });

      expect(findingsJson(runId).map((finding: { id: string; case: string }) => [finding.id, finding.case])).toEqual([
        ['F1', '1.1'],
        ['F2', '1.2'],
      ]);
      expect(findingsMd(runId).indexOf('F1')).toBeLessThan(findingsMd(runId).indexOf('F2'));
    });

    it('requires --expected and --observed for app and writes nothing when one is missing', async () => {
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);

      const missingObserved = triageCase(locate(runId), '1.1', {
        classification: 'app',
        rationale: 'Banner',
        expected: 'Saved banner shown',
        now: at(0),
      });
      const missingExpected = triageCase(locate(runId), '1.1', {
        classification: 'app',
        rationale: 'Banner',
        observed: 'Error banner shown',
        now: at(0),
      });

      expect(missingObserved.ok === false && missingObserved.issues.map((issue) => issue.message)).toEqual([
        'An app judgement needs --observed',
      ]);
      expect(missingExpected.ok === false && missingExpected.issues.map((issue) => issue.message)).toEqual([
        'An app judgement needs --expected',
      ]);
      expect(ledgerLines(runId).filter((line) => line.stage !== 'candidate')).toEqual([]);
      expect(existsSync(path.join(locate(runId).runDir, 'findings.json'))).toBe(false);

      const recovered = triageCase(locate(runId), '1.1', {
        classification: 'app',
        rationale: 'Banner',
        expected: 'Saved banner shown',
        observed: 'Error banner shown',
        now: at(0),
      });
      expect(recovered.ok).toBe(true);
    });

    it('refuses --expected and --observed for agent and environment', async () => {
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);

      const agent = triageCase(locate(runId), '1.1', { classification: 'agent', rationale: 'Mis-click', expected: 'x' });
      const environment = triageCase(locate(runId), '1.1', { classification: 'environment', rationale: 'Maintenance', observed: 'y' });

      expect(agent.ok === false && agent.issues.map((issue) => issue.message)).toEqual([
        '--expected and --observed apply only to app judgements',
      ]);
      expect(environment.ok === false && environment.issues.map((issue) => issue.message)).toEqual([
        '--expected and --observed apply only to app judgements',
      ]);
      expect(ledgerLines(runId).filter((line) => line.stage !== 'candidate')).toEqual([]);
    });

    it('refuses an unknown classification and an empty rationale', async () => {
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);

      const unknown = triageCase(locate(runId), '1.1', { classification: 'agent-error', rationale: 'Mis-click' });
      const empty = triageCase(locate(runId), '1.1', { classification: 'agent', rationale: '   ' });

      expect(unknown.ok === false && unknown.issues.map((issue) => issue.message)).toEqual([
        'Classification must be agent, environment or app',
      ]);
      expect(empty.ok === false && empty.issues.map((issue) => issue.message)).toEqual(['--rationale must not be empty']);
      expect(ledgerLines(runId).filter((line) => line.stage !== 'candidate')).toEqual([]);
    });

    it('judges a case once: a second judgement is refused and adds nothing', async () => {
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      triageCase(locate(runId), '1.1', { classification: 'agent', rationale: 'Mis-click', now: at(0) });

      const again = triageCase(locate(runId), '1.1', {
        classification: 'app',
        rationale: 'Banner',
        expected: 'Saved',
        observed: 'Error',
        now: at(1),
      });

      expect(again.ok === false && again.issues.map((issue) => issue.message)).toEqual([
        `Case 1.1 was already judged in run ${runId}: a case is judged once`,
      ]);
      expect(ledgerLines(runId).filter((line) => line.stage === 'judged')).toHaveLength(1);
      expect(existsSync(path.join(locate(runId).runDir, 'findings.json'))).toBe(false);
    });

    it('refuses to judge a case that does not need triage', async () => {
      const runId = await startWithControl();

      const outcome = triageCase(locate(runId), '1.2', { classification: 'agent', rationale: 'Not yet run' });

      expect(outcome.ok === false && outcome.issues.map((issue) => issue.message)).toEqual([
        'Case 1.2 is pending: only a case that needs triage can be triaged',
      ]);
    });

    it('refuses a case that is not part of the run', async () => {
      const runId = await startWithControl();

      const outcome = triageCase(locate(runId), '1.9', { classification: 'agent', rationale: 'Not a case' });

      expect(outcome.ok === false && outcome.issues).toEqual([{ message: `Case 1.9 is not part of run ${runId}`, case: '1.9' }]);
    });

    it('judges the control case at the start first, then the one at the end, and no longer resolves control once both are judged', async () => {
      const outcome0 = await startRun({ changeName: CHANGE, changeDir, projectRoot });
      if (!outcome0.started) {
        throw new Error('start was refused');
      }
      const runId = outcome0.run.id;
      confirmRun(locate(runId));
      planCase(runId, 'control', CONTROL_PLAN);
      recordCase(runId, 'control', CONTROL_FAIL);
      planCase(runId, 'control', CONTROL_PLAN);
      recordCase(runId, 'control', CONTROL_FAIL);

      const start = triageCase(locate(runId), 'control', { classification: 'environment', rationale: 'Server down', now: at(0) });
      const end = triageCase(locate(runId), 'control', { classification: 'environment', rationale: 'Still down', now: at(1) });
      const again = triageCase(locate(runId), 'control', { classification: 'agent', rationale: 'Nothing left' });

      expect(start).toMatchObject({ ok: true, caseKey: 'control-start' });
      expect(end).toMatchObject({ ok: true, caseKey: 'control-end' });
      expect(again.ok === false && again.issues.map((issue) => issue.message)).toEqual([
        `Case control-start was already judged in run ${runId}: a case is judged once`,
      ]);
    });

    it('refuses to judge in an environment-noise run', async () => {
      const outcome0 = await startRun({ changeName: CHANGE, changeDir, projectRoot });
      if (!outcome0.started) {
        throw new Error('start was refused');
      }
      const runId = outcome0.run.id;
      confirmRun(locate(runId));
      planCase(runId, 'control', CONTROL_PLAN);
      recordCase(runId, 'control', CONTROL_FAIL);
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      planCase(runId, 'control', CONTROL_PLAN);
      recordCase(runId, 'control', CONTROL_PASS);
      finishRun(locate(runId));

      const outcome = triageCase(locate(runId), '1.1', { classification: 'agent', rationale: 'Mis-click' });

      expect(outcome.ok === false && outcome.issues.map((issue) => issue.message)).toEqual([
        `Run ${runId} is environment-noise: its cases produce no findings, so they are not triaged`,
      ]);
      expect(ledgerLines(runId).filter((line) => line.stage === 'judged')).toEqual([]);
    });

    it('refuses an app judgement for the control case, because a control failure produces no findings', async () => {
      const outcome0 = await startRun({ changeName: CHANGE, changeDir, projectRoot });
      if (!outcome0.started) {
        throw new Error('start was refused');
      }
      const runId = outcome0.run.id;
      confirmRun(locate(runId));
      planCase(runId, 'control', CONTROL_PLAN);
      recordCase(runId, 'control', CONTROL_FAIL);

      const app = triageCase(locate(runId), 'control', {
        classification: 'app',
        rationale: 'Home is broken',
        expected: 'Home heading shown',
        observed: 'Error page',
      });
      const environment = triageCase(locate(runId), 'control', { classification: 'environment', rationale: 'Dev server down' });

      expect(app.ok === false && app.issues.map((issue) => issue.message)).toEqual([
        'A control case produces no findings: a failed control case makes its run environment-noise (S8)',
      ]);
      expect(environment).toMatchObject({ ok: true, caseKey: 'control-start', classification: 'environment' });
      expect(ledgerLines(runId).filter((line) => line.stage === 'judged')).toEqual([
        expect.objectContaining({ case: 'control-start', classification: 'environment' }),
      ]);
    });

    it('marks the triage lines of a run that finishes as environment-noise, so they produce no findings', async () => {
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      triageCase(locate(runId), '1.1', {
        classification: 'app',
        rationale: 'Banner',
        expected: 'Saved banner shown',
        observed: 'Error banner shown',
      });
      planCase(runId, 'control', CONTROL_PLAN);
      recordCase(runId, 'control', CONTROL_FAIL);

      expect(finishRun(locate(runId)).state).toBe('environment-noise');

      const triageLines = ledgerLines(runId).filter((line) => ['judged', 'reported'].includes(line.stage as string));
      expect(triageLines.map((line) => [line.stage, line.environmentNoise])).toEqual([
        ['judged', true],
        ['reported', true],
      ]);
    });
  });

  describe('answers', () => {
    it('records intended=no as confirmed and intended=yes as dismissed, with the seconds from the report', async () => {
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      failCaseTwice(runId, '1.2', CASE_2_PLAN, CASE_2_FAIL);
      triageCase(locate(runId), '1.1', {
        classification: 'app',
        rationale: 'Banner is wrong',
        expected: 'Saved banner shown',
        observed: 'Error banner shown',
        now: at(0),
      });
      triageCase(locate(runId), '1.2', { classification: 'app', rationale: 'Date is wrong', expected: 'Today', observed: 'Yesterday', now: at(1) });

      const confirmed = answerFinding(locate(runId), {
        finding: 'F1',
        intended: 'no',
        note: 'The banner must say Saved',
        now: at(12.5),
      });
      const dismissed = answerFinding(locate(runId), { finding: 'F2', intended: 'yes', now: at(4) });

      expect(confirmed).toEqual({
        ok: true,
        run: runId,
        finding: 'F1',
        intended: 'no',
        stage: 'confirmed',
        note: 'The banner must say Saved',
        answeredAt: at(12.5).toISOString(),
        secondsToAnswer: 12.5,
      });
      expect(dismissed).toEqual({
        ok: true,
        run: runId,
        finding: 'F2',
        intended: 'yes',
        stage: 'dismissed',
        answeredAt: at(4).toISOString(),
        secondsToAnswer: 3,
      });
      expect(ledgerLines(runId).filter((line) => line.stage === 'confirmed' || line.stage === 'dismissed')).toEqual([
        {
          stage: 'confirmed',
          finding: 'F1',
          intended: 'no',
          note: 'The banner must say Saved',
          at: at(12.5).toISOString(),
          secondsToAnswer: 12.5,
        },
        { stage: 'dismissed', finding: 'F2', intended: 'yes', at: at(4).toISOString(), secondsToAnswer: 3 },
      ]);
      expect(findingsJson(runId).map((finding: { id: string }) => finding.id)).toEqual(['F1', 'F2']);
    });

    it('refuses a second answer to the same finding and adds no ledger line', async () => {
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      triageCase(locate(runId), '1.1', { classification: 'app', rationale: 'Banner', expected: 'Saved', observed: 'Error', now: at(0) });
      answerFinding(locate(runId), { finding: 'F1', intended: 'no', now: at(2) });
      const before = ledgerLines(runId).length;

      const again = answerFinding(locate(runId), { finding: 'F1', intended: 'yes', now: at(3) });

      expect(again.ok === false && again.issues.map((issue) => issue.message)).toEqual([
        `Finding F1 was already answered in run ${runId}: an answer is recorded once`,
      ]);
      expect(ledgerLines(runId)).toHaveLength(before);
    });

    it('refuses an unknown finding', async () => {
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      triageCase(locate(runId), '1.1', { classification: 'app', rationale: 'Banner', expected: 'Saved', observed: 'Error', now: at(0) });

      const outcome = answerFinding(locate(runId), { finding: 'F9', intended: 'yes', now: at(1) });

      expect(outcome.ok === false && outcome.issues.map((issue) => issue.message)).toEqual([
        `Finding F9 does not exist in run ${runId}`,
      ]);
      expect(ledgerLines(runId).filter((line) => line.stage === 'dismissed')).toEqual([]);
    });

    it('refuses an intended value other than yes or no', async () => {
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      triageCase(locate(runId), '1.1', { classification: 'app', rationale: 'Banner', expected: 'Saved', observed: 'Error', now: at(0) });

      const outcome = answerFinding(locate(runId), { finding: 'F1', intended: 'maybe', now: at(1) });

      expect(outcome.ok === false && outcome.issues.map((issue) => issue.message)).toEqual([
        '--intended must be yes or no',
      ]);
      expect(ledgerLines(runId).filter((line) => line.stage === 'confirmed' || line.stage === 'dismissed')).toEqual([]);
    });

    it('refuses to answer a finding of a run that finished as environment-noise', async () => {
      const runId = await startWithControl();
      failCaseTwice(runId, '1.1', CASE_1_PLAN, CASE_1_FAIL);
      triageCase(locate(runId), '1.1', { classification: 'app', rationale: 'Banner', expected: 'Saved', observed: 'Error', now: at(0) });
      planCase(runId, 'control', CONTROL_PLAN);
      recordCase(runId, 'control', CONTROL_FAIL);
      expect(finishRun(locate(runId)).state).toBe('environment-noise');

      const outcome = answerFinding(locate(runId), { finding: 'F1', intended: 'no', now: at(5) });

      expect(outcome.ok === false && outcome.issues.map((issue) => issue.message)).toEqual([
        `Run ${runId} is environment-noise: its findings are void, so they are not answered`,
      ]);
    });
  });
});
