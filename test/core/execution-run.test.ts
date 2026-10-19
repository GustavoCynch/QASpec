import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeAnalyzeContentHash, writeApprovalRecord } from '../../src/core/approval-ledger.js';
import {
  acquireRunLock,
  confirmRun,
  describeRunStatus,
  findRun,
  finishRun,
  generateRunId,
  isValidRunId,
  listRuns,
  parseCaseArg,
  recordObservations,
  startRun,
  storePlan,
} from '../../src/core/execution-run.js';
import { writeChangeMetadata } from '../../src/utils/change-metadata.js';

const NODE = JSON.stringify(process.execPath);
const CHANGE = 'pr-1';
const APPROVED_AT = '2026-10-19T12:00:00.000Z';
const RUN_ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{6}$/;

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
  steps: [
    {
      n: 1,
      checks: [
        {
          id: 'home-heading',
          source: { kind: 'dom', target: 'page heading' },
          op: 'equals',
          value: 'Home',
        },
      ],
    },
  ],
};

const CASE_PLAN = {
  schema: 'qaspec.execution-plan/v1',
  change: CHANGE,
  case: { id: '1.1', title: 'Export totals' },
  steps: [
    {
      n: 1,
      checks: [
        {
          id: 'report-title',
          source: { kind: 'dom', target: 'report heading' },
          op: 'contains',
          value: 'Report',
        },
      ],
    },
    {
      n: 2,
      checks: [
        {
          id: 'banner',
          source: { kind: 'dom', target: 'status banner' },
          op: 'equals',
          value: 'Saved',
        },
      ],
    },
  ],
};

const observations = (entries: Array<{ check: string; after: unknown }>) => ({
  schema: 'qaspec.execution-observations/v1',
  observations: entries,
});

const CONTROL_PASS = observations([{ check: 'home-heading', after: 'Home' }]);
const CONTROL_FAIL = observations([{ check: 'home-heading', after: 'Error page' }]);
const CASE_PASS = observations([
  { check: 'report-title', after: 'Report' },
  { check: 'banner', after: 'Saved' },
]);
const CASE_FAIL = observations([
  { check: 'report-title', after: 'Report' },
  { check: 'banner', after: 'Error' },
]);

const BASE_EXECUTION = [
  '  app:',
  '    url: https://app.example.test/',
  '    readiness: manual',
  '  controlCase: qa/smoke/control.md',
  '',
].join('\n');

const sha256 = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

describe('execution run lifecycle', () => {
  let projectRoot: string;
  let changesDir: string;
  let changeDir: string;
  let servers: Server[];

  const write = async (relativePath: string, content: string) => {
    const target = path.join(projectRoot, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  };

  const writeConfig = (execution = BASE_EXECUTION) => write(path.join('qaspec', 'config.yaml'), `execution:\n${execution}`);

  const approve = () => {
    const { hash } = computeAnalyzeContentHash(changeDir);
    writeApprovalRecord(changeDir, 'analyze', { approvedAt: APPROVED_AT, contentHash: hash });
  };

  const writeChange = async (testcases = TESTCASES, { approved = true } = {}) => {
    await write(path.join('qaspec', 'changes', CHANGE, 'analysis.md'), '# Analysis\n');
    await write(
      path.join('qaspec', 'changes', CHANGE, 'specs', 'billing-export', 'spec.md'),
      '## ADDED Requirements\n\n### Requirement: Export totals\n'
    );
    await write(path.join('qaspec', 'changes', CHANGE, 'testcases.md'), testcases);
    writeChangeMetadata(changeDir, { schema: 'qaspec-pr-review', created: '2026-10-19' });
    if (approved) {
      approve();
    }
  };

  const start = (options: Partial<Parameters<typeof startRun>[0]> = {}) =>
    startRun({ changeName: CHANGE, changeDir, projectRoot, ...options });

  const locate = (runId: string) => findRun(changesDir, runId);

  const readRunFile = (runId: string) =>
    JSON.parse(readFileSync(path.join(locate(runId).runDir, 'run.json'), 'utf-8'));

  const ledgerLines = (runId: string): Array<Record<string, unknown>> => {
    const text = readFileSync(path.join(locate(runId).runDir, 'ledger.jsonl'), 'utf-8');
    return text
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
  };

  const startedId = async (options: Parameters<typeof start>[0] = {}) => {
    const outcome = await start(options);
    if (!outcome.started) {
      throw new Error(`start was refused: ${outcome.blockers.map((b) => b.code).join(', ')}`);
    }
    return outcome.run.id;
  };

  const startConfirmed = async () => {
    const runId = await startedId();
    confirmRun(locate(runId));
    return runId;
  };

  const planBytes = (plan: unknown) => Buffer.from(json(plan));
  const obsBytes = (value: unknown) => Buffer.from(json(value));

  const listen = async (handler: Parameters<typeof createServer>[0]) => {
    const server = createServer(handler);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-run-'));
    changesDir = path.join(projectRoot, 'qaspec', 'changes');
    changeDir = path.join(changesDir, CHANGE);
    servers = [];
    execFileSync('git', ['init', '-q'], { cwd: projectRoot });
    await write('.gitignore', '.env.qa\n.qaspec/auth/\n');
    await writeConfig();
    await write('qa/smoke/control.md', CONTROL_CASE);
    await writeChange();
  });

  afterEach(async () => {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  describe('start gates', () => {
    it('refuses to start without a valid analyze approval and creates nothing', async () => {
      await writeChange(TESTCASES, { approved: false });

      const outcome = await start();

      expect(outcome.started).toBe(false);
      expect(outcome.started === false && outcome.blockers.map((b) => b.code)).toEqual(['approval-missing']);
      expect(existsSync(path.join(changeDir, 'runs'))).toBe(false);
    });

    it('refuses to start when the analyze artifacts changed after approval', async () => {
      await write(path.join('qaspec', 'changes', CHANGE, 'analysis.md'), '# Analysis changed\n');

      const outcome = await start();

      expect(outcome.started === false && outcome.blockers.map((b) => b.code)).toEqual(['approval-stale']);
    });

    it('refuses to start when testcases.md does not validate', async () => {
      await writeChange(TESTCASES.replace('<!-- req: billing-export/export-totals -->', ''));

      const outcome = await start();

      expect(outcome.started === false && outcome.blockers.map((b) => b.code)).toEqual([
        'cases-validation-failed',
      ]);
    });

    it('refuses to start when qaspec/config.yaml has no execution block', async () => {
      await write(path.join('qaspec', 'config.yaml'), 'schema: qaspec-pr-review\n');

      const outcome = await start();

      expect(outcome.started === false && outcome.blockers.map((b) => b.code)).toEqual(['execution-missing']);
    });

    it('refuses to start without app.url', async () => {
      await writeConfig('  app:\n    readiness: manual\n  controlCase: qa/smoke/control.md\n');

      const outcome = await start();

      expect(outcome.started === false && outcome.blockers.map((b) => b.code)).toEqual(['app-url-missing']);
    });

    it('refuses to start without app.readiness', async () => {
      await writeConfig('  app:\n    url: https://app.example.test/\n  controlCase: qa/smoke/control.md\n');

      const outcome = await start();

      expect(outcome.started === false && outcome.blockers.map((b) => b.code)).toEqual(['readiness-missing']);
    });

    it('refuses probe readiness without a probeUrl', async () => {
      await writeConfig(
        '  app:\n    url: https://app.example.test/\n    readiness: probe\n  controlCase: qa/smoke/control.md\n'
      );

      const outcome = await start();

      expect(outcome.started === false && outcome.blockers.map((b) => b.code)).toEqual(['probe-url-missing']);
    });

    it('refuses to start when the credentials file is not ignored by git', async () => {
      await write('.gitignore', '.qaspec/auth/\n');
      await writeConfig(
        BASE_EXECUTION +
          '  auth:\n    envFile: .env.qa\n    loginScript: scripts/login.mjs\n    storageState: .qaspec/auth/storage-state.json\n'
      );
      await write('.qaspec/auth/storage-state.json', '{}');

      const outcome = await start();

      expect(outcome.started === false && outcome.blockers.map((b) => b.code)).toEqual(['auth-env-not-ignored']);
    });

    it('refuses to start when the session file is not ignored by git', async () => {
      await write('.gitignore', '.env.qa\n');
      await writeConfig(
        BASE_EXECUTION +
          '  auth:\n    envFile: .env.qa\n    loginScript: scripts/login.mjs\n    storageState: .qaspec/auth/storage-state.json\n'
      );
      await write('.qaspec/auth/storage-state.json', '{}');

      const outcome = await start();

      expect(outcome.started === false && outcome.blockers.map((b) => b.code)).toEqual([
        'auth-session-not-ignored',
      ]);
    });

    it('refuses to start when the session file does not exist and says to log in', async () => {
      await writeConfig(
        BASE_EXECUTION +
          '  auth:\n    envFile: .env.qa\n    loginScript: scripts/login.mjs\n    storageState: .qaspec/auth/storage-state.json\n'
      );

      const outcome = await start();

      expect(outcome.started === false && outcome.blockers.map((b) => b.code)).toEqual(['auth-session-missing']);
      expect(outcome.started === false && outcome.blockers[0].resolve).toContain('qaspec execute login');
    });

    it('starts when the git-ignored session file exists', async () => {
      await writeConfig(
        BASE_EXECUTION +
          '  auth:\n    envFile: .env.qa\n    loginScript: scripts/login.mjs\n    storageState: .qaspec/auth/storage-state.json\n'
      );
      await write('.qaspec/auth/storage-state.json', '{"cookies":[],"origins":[]}');

      const outcome = await start();

      expect(outcome.started).toBe(true);
    });

    it('refuses to start without execution.controlCase, since the run could never finish', async () => {
      await writeConfig(BASE_EXECUTION.replace('  controlCase: qa/smoke/control.md\n', ''));

      const outcome = await start();

      expect(outcome.started === false && outcome.blockers.map((b) => b.code)).toEqual(['control-case-required']);
      expect(existsSync(path.join(changeDir, 'runs'))).toBe(false);
    });

    it('refuses to start when the control case file is missing', async () => {
      await fs.rm(path.join(projectRoot, 'qa', 'smoke', 'control.md'));

      const outcome = await start();

      expect(outcome.started === false && outcome.blockers.map((b) => b.code)).toEqual(['control-case-missing']);
    });
  });

  describe('start and confirmation', () => {
    it('creates the run layout with a data tag and waits for the user to confirm a manual readiness', async () => {
      const outcome = await start();

      expect(outcome.started).toBe(true);
      if (!outcome.started) return;
      const { run, runDir, dataTag } = outcome;
      expect(run.id).toMatch(RUN_ID_PATTERN);
      expect(runDir).toBe(path.join(changeDir, 'runs', run.id));
      expect(dataTag).toBe(`QASPEC-${run.id}`);
      expect(run.state).toBe('awaiting-confirmation');
      expect(run.controlCase).toEqual({
        source: 'qa/smoke/control.md',
        snapshot: path.join('control', 'testcases.md'),
        sha256: sha256(CONTROL_CASE),
      });
      expect(readFileSync(path.join(runDir, 'control', 'testcases.md'), 'utf-8')).toBe(CONTROL_CASE);
      for (const folder of ['plans', 'observations', 'results']) {
        expect(existsSync(path.join(runDir, folder))).toBe(true);
      }
      expect(readFileSync(path.join(runDir, 'ledger.jsonl'), 'utf-8')).toBe('');
      expect(Object.keys(run.cases).sort()).toEqual(['1.1', '1.2', 'control-end', 'control-start']);
      expect(run.cases['1.1']).toEqual({ status: 'pending', attempts: [] });
    });

    it('keeps every run out of git with a self-ignoring .gitignore in runs/', async () => {
      const runId = await startedId();

      expect(readFileSync(path.join(changeDir, 'runs', '.gitignore'), 'utf-8')).toBe('*\n');
      const runFile = path.join('qaspec', 'changes', CHANGE, 'runs', runId, 'run.json');
      expect(() => execFileSync('git', ['check-ignore', '-q', '--', runFile], { cwd: projectRoot })).not.toThrow();
      const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: projectRoot }).toString();
      expect(status).not.toContain('/runs/');
    });

    it('leaves an existing runs/.gitignore unchanged', async () => {
      await write(path.join('qaspec', 'changes', CHANGE, 'runs', '.gitignore'), '# team rule\n*\n!README.md\n');

      await startedId();

      expect(readFileSync(path.join(changeDir, 'runs', '.gitignore'), 'utf-8')).toBe('# team rule\n*\n!README.md\n');
    });

    it('uses execution.dataPrefix in the data tag', async () => {
      await writeConfig(BASE_EXECUTION + '  dataPrefix: ACME\n');

      const outcome = await start();

      expect(outcome.started && outcome.dataTag).toBe(`ACME-${outcome.started ? outcome.run.id : ''}`);
    });

    it('moves a confirmed run to ready and records the confirmation time', async () => {
      const runId = await startedId();

      const confirmed = confirmRun(locate(runId));

      expect(confirmed.state).toBe('ready');
      expect(confirmed.readiness.confirmedAt).toEqual(expect.any(String));
      expect(readRunFile(runId).state).toBe('ready');
    });

    it('refuses to confirm a run that is not awaiting confirmation', async () => {
      const runId = await startConfirmed();

      expect(() => confirmRun(locate(runId))).toThrow(/only a run awaiting confirmation/);
    });
  });

  describe('readiness', () => {
    it('blocks the run and marks its cases blocked-by-environment when a readiness command exits non-zero', async () => {
      await writeConfig(
        BASE_EXECUTION +
          `  readinessChecks:\n    - name: backend deployed\n      command: '${NODE} -e "process.exit(3)"'\n`
      );

      const outcome = await start();

      expect(outcome.started).toBe(true);
      if (!outcome.started) return;
      expect(outcome.run.state).toBe('blocked-by-environment');
      expect(outcome.run.readiness.checks).toEqual([
        {
          name: 'backend deployed',
          command: `${NODE} -e "process.exit(3)"`,
          status: 'failed',
          exitCode: 3,
          durationMs: expect.any(Number),
        },
      ]);
      expect(readRunFile(outcome.run.id).readiness.checks[0].command).toBe(`${NODE} -e "process.exit(3)"`);
      expect(outcome.run.cases['1.1']).toEqual({ status: 'blocked-by-environment', attempts: [] });
      expect(outcome.run.cases['control-start'].status).toBe('blocked-by-environment');
    });

    it('blocks the run when a readiness command outlives its timeout', async () => {
      await writeConfig(
        BASE_EXECUTION +
          `  readinessChecks:\n    - name: slow deploy\n      command: '${NODE} -e "setTimeout(() => {}, 60000)"'\n`
      );

      const outcome = await start({ readinessTimeoutMs: 300 });

      expect(outcome.started && outcome.run.state).toBe('blocked-by-environment');
      expect(outcome.started && outcome.run.readiness.checks[0].status).toBe('timed-out');
    });

    it('runs readiness commands in order and reports each one before it runs', async () => {
      await writeConfig(
        BASE_EXECUTION +
          `  readinessChecks:\n    - name: first\n      command: '${NODE} -e "process.exit(0)"'\n    - name: second\n      command: '${NODE} -e "process.exit(0)"'\n`
      );
      const seen: string[] = [];

      const outcome = await start({
        hooks: {
          beforeReadinessCheck: (check) => seen.push(`before:${check.name}`),
          afterReadinessCheck: (record) => seen.push(`after:${record.name}:${record.status}`),
        },
      });

      expect(seen).toEqual(['before:first', 'after:first:passed', 'before:second', 'after:second:passed']);
      expect(outcome.started && outcome.run.state).toBe('awaiting-confirmation');
    });

    it('becomes ready when the probe answers 2xx', async () => {
      const base = await listen((_request, response) => response.end('ok'));
      await writeConfig(
        `  app:\n    url: https://app.example.test/\n    readiness: probe\n    probeUrl: ${base}/health\n  controlCase: qa/smoke/control.md\n`
      );

      const outcome = await start();

      expect(outcome.started && outcome.run.state).toBe('ready');
      expect(outcome.started && outcome.run.readiness.probe).toEqual({
        url: `${base}/health`,
        ok: true,
        httpStatus: 200,
        durationMs: expect.any(Number),
      });
    });

    it('blocks the run when the probe does not answer 2xx', async () => {
      const base = await listen((_request, response) => {
        response.statusCode = 503;
        response.end('down');
      });
      await writeConfig(
        `  app:\n    url: https://app.example.test/\n    readiness: probe\n    probeUrl: ${base}/health\n  controlCase: qa/smoke/control.md\n`
      );

      const outcome = await start();

      expect(outcome.started && outcome.run.state).toBe('blocked-by-environment');
      expect(outcome.started && outcome.run.readiness.probe?.httpStatus).toBe(503);
    });
  });

  describe('plans', () => {
    it('stores the plan byte for byte with its SHA-256 and a timestamp', async () => {
      const runId = await startConfirmed();
      const bytes = planBytes(CONTROL_PLAN);

      const stored = storePlan(locate(runId), 'control', bytes);

      expect(stored.ok).toBe(true);
      if (!stored.ok) return;
      expect(stored.caseKey).toBe('control-start');
      expect(stored.planSha256).toBe(sha256(bytes.toString('utf-8')));
      expect(stored.storedAt).toEqual(expect.any(String));
      const copy = readFileSync(path.join(locate(runId).runDir, 'plans', 'control-start.json'));
      expect(copy.equals(bytes)).toBe(true);
      expect(readRunFile(runId).cases['control-start']).toEqual({
        status: 'planned',
        plan: { path: path.join('plans', 'control-start.json'), sha256: stored.planSha256, storedAt: stored.storedAt },
        attempts: [],
      });
    });

    it('refuses to replace a stored plan and leaves the copy unchanged', async () => {
      const runId = await startConfirmed();
      const first = planBytes(CONTROL_PLAN);
      storePlan(locate(runId), 'control', first);

      expect(() => storePlan(locate(runId), 'control', planBytes({ ...CONTROL_PLAN, steps: [] }))).toThrow(
        /already stored/
      );
      expect(readFileSync(path.join(locate(runId).runDir, 'plans', 'control-start.json')).equals(first)).toBe(true);
    });

    it('validates the control plan against the control case file it snapshotted at start', async () => {
      const runId = await startConfirmed();
      const wrongCase = { ...CONTROL_PLAN, case: { id: '1.1', title: 'Export totals' } };

      const stored = storePlan(locate(runId), 'control', planBytes(wrongCase));

      expect(stored.ok).toBe(false);
      if (stored.ok) return;
      expect(stored.issues.map((issue) => issue.message)).toEqual([
        'Case "1.1" is not in testcases.md',
      ]);
      expect(existsSync(path.join(locate(runId).runDir, 'plans', 'control-start.json'))).toBe(false);
      expect(readRunFile(runId).cases['control-start'].status).toBe('pending');
    });

    it('validates a case plan against the Steps of the change testcases.md', async () => {
      const runId = await startConfirmed();
      storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN));
      recordObservations(locate(runId), 'control', obsBytes(CONTROL_PASS));
      const badStep = { ...CASE_PLAN, steps: [{ ...CASE_PLAN.steps[0], n: 9 }] };

      const stored = storePlan(locate(runId), '1.1', planBytes(badStep));

      expect(stored.ok).toBe(false);
      if (stored.ok) return;
      expect(stored.issues.map((issue) => issue.message)).toEqual([
        'Case 1.1, step 9: the Steps table has no row 9',
        'Case 1.1, step 1: the Expected result needs at least one check or a needsHuman reason',
        'Case 1.1, step 2: the Expected result needs at least one check or a needsHuman reason',
      ]);
    });

    it('refuses a case plan whose case id differs from the case argument', async () => {
      const runId = await startConfirmed();
      storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN));
      recordObservations(locate(runId), 'control', obsBytes(CONTROL_PASS));

      const stored = storePlan(locate(runId), '1.2', planBytes(CASE_PLAN));

      expect(stored.ok).toBe(false);
      if (stored.ok) return;
      expect(stored.issues.map((issue) => issue.message)).toEqual([
        'Case 1.2: the plan declares case "1.1", which does not match --case 1.2',
      ]);
    });

    it('refuses other cases until the control case at the start has a verdict', async () => {
      const runId = await startConfirmed();

      expect(() => storePlan(locate(runId), '1.1', planBytes(CASE_PLAN))).toThrow(/before other cases/);
    });

    it('refuses to plan a run that is not ready', async () => {
      const runId = await startedId();

      expect(() => storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN))).toThrow(/awaiting-confirmation/);
    });
  });

  describe('record, retry and triage', () => {
    it('records observations against the stored plan and passes on the first attempt', async () => {
      const runId = await startConfirmed();
      const planHash = storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN));
      expect(planHash.ok).toBe(true);

      const recorded = recordObservations(locate(runId), 'control', obsBytes(CONTROL_PASS));

      expect(recorded.ok && recorded.outcome).toBe('passed');
      const runDir = locate(runId).runDir;
      expect(JSON.parse(readFileSync(path.join(runDir, 'observations', 'control-start-1.json'), 'utf-8'))).toEqual(
        CONTROL_PASS
      );
      expect(JSON.parse(readFileSync(path.join(runDir, 'results', 'control-start-1.json'), 'utf-8'))).toMatchObject({
        case: 'control-start',
        attempt: 1,
        verdict: 'passed',
      });
      expect(readRunFile(runId).cases['control-start'].status).toBe('passed');
      expect(ledgerLines(runId)).toEqual([]);
    });

    it('returns retry for a first failed verdict and needs-triage with a ledger candidate for the second', async () => {
      const runId = await startConfirmed();
      storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN));
      recordObservations(locate(runId), 'control', obsBytes(CONTROL_PASS));
      const casePlan = planBytes(CASE_PLAN);
      storePlan(locate(runId), '1.1', casePlan);

      const first = recordObservations(locate(runId), '1.1', obsBytes(CASE_FAIL));
      expect(first.ok && first.outcome).toBe('retry');
      expect(readRunFile(runId).cases['1.1'].status).toBe('retry');
      expect(ledgerLines(runId)).toEqual([]);

      const second = recordObservations(locate(runId), '1.1', obsBytes(CASE_FAIL));
      expect(second.ok && second.outcome).toBe('needs-triage');
      expect(readRunFile(runId).cases['1.1'].status).toBe('needs-triage');
      expect(ledgerLines(runId)).toEqual([
        {
          stage: 'candidate',
          case: '1.1',
          attempts: 2,
          verdicts: ['failed', 'failed'],
          planSha256: sha256(casePlan.toString('utf-8')),
          at: expect.any(String),
        },
      ]);
    });

    it('makes a needs-human verdict final on the first attempt, without a retry or a ledger candidate', async () => {
      const runId = await startConfirmed();
      storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN));
      recordObservations(locate(runId), 'control', obsBytes(CONTROL_PASS));
      const humanPlan = {
        ...CASE_PLAN,
        steps: CASE_PLAN.steps.map((step, index) =>
          index === 0 ? { ...step, needsHuman: 'The chart layout must be judged by a person' } : step
        ),
      };
      storePlan(locate(runId), '1.1', planBytes(humanPlan));

      const first = recordObservations(locate(runId), '1.1', obsBytes(CASE_PASS));

      expect(first.ok && first.outcome).toBe('needs-human');
      expect(readRunFile(runId).cases['1.1'].status).toBe('needs-human');
      expect(existsSync(path.join(locate(runId).runDir, 'ledger.jsonl')) ? ledgerLines(runId) : []).toEqual([]);
      expect(() => recordObservations(locate(runId), '1.1', obsBytes(CASE_PASS))).toThrow(/final verdict/);
    });

    it('rejects a third record for a case that already has a final verdict', async () => {
      const runId = await startConfirmed();
      storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN));
      recordObservations(locate(runId), 'control', obsBytes(CONTROL_PASS));
      storePlan(locate(runId), '1.1', planBytes(CASE_PLAN));
      recordObservations(locate(runId), '1.1', obsBytes(CASE_FAIL));
      recordObservations(locate(runId), '1.1', obsBytes(CASE_FAIL));

      expect(() => recordObservations(locate(runId), '1.1', obsBytes(CASE_PASS))).toThrow(/final verdict/);
      expect(readRunFile(runId).cases['1.1'].attempts).toHaveLength(2);
    });

    it('rejects observations for checks the stored plan does not declare and keeps the attempt', async () => {
      const runId = await startConfirmed();
      storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN));

      const recorded = recordObservations(locate(runId), 'control', obsBytes(observations([{ check: 'other', after: 1 }])));

      expect(recorded.ok).toBe(false);
      if (recorded.ok) return;
      expect(recorded.issues[0].message).toMatch(/does not declare this check/);
      expect(existsSync(path.join(locate(runId).runDir, 'observations', 'control-start-1.json'))).toBe(false);
      expect(readRunFile(runId).cases['control-start'].status).toBe('planned');
    });

    it('refuses to record a case that has no stored plan', async () => {
      const runId = await startConfirmed();
      storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN));
      recordObservations(locate(runId), 'control', obsBytes(CONTROL_PASS));

      expect(() => recordObservations(locate(runId), '1.2', obsBytes(CASE_PASS))).toThrow(/no stored plan/);
    });

    it('fails when the stored plan copy no longer matches its recorded SHA-256', async () => {
      const runId = await startConfirmed();
      storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN));
      await fs.writeFile(path.join(locate(runId).runDir, 'plans', 'control-start.json'), json({ tampered: true }));

      expect(() => recordObservations(locate(runId), 'control', obsBytes(CONTROL_PASS))).toThrow(/does not match/);
    });
  });

  describe('control case and finish', () => {
    const runCase = async (runId: string, caseArg: string, plan: unknown, observed: unknown) => {
      storePlan(locate(runId), caseArg, planBytes(plan));
      return recordObservations(locate(runId), caseArg, obsBytes(observed));
    };

    it('completes the run when the control case passes at the start and at the end', async () => {
      const runId = await startConfirmed();
      await runCase(runId, 'control', CONTROL_PLAN, CONTROL_PASS);
      await runCase(runId, '1.1', CASE_PLAN, CASE_PASS);
      await runCase(runId, 'control', CONTROL_PLAN, CONTROL_PASS);

      const finished = finishRun(locate(runId));

      expect(finished).toEqual({ state: 'completed', reasons: [] });
      expect(readRunFile(runId).state).toBe('completed');
      expect(readRunFile(runId).finishedAt).toEqual(expect.any(String));
    });

    it('marks the run environment-noise and keeps its candidates marked when the control case fails', async () => {
      const runId = await startConfirmed();
      storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN));
      expect(recordObservations(locate(runId), 'control', obsBytes(CONTROL_FAIL))).toMatchObject({
        outcome: 'needs-triage',
      });
      expect(readRunFile(runId).cases['control-start'].status).toBe('needs-triage');
      await runCase(runId, 'control', CONTROL_PLAN, CONTROL_PASS);

      const finished = finishRun(locate(runId));

      expect(finished.state).toBe('environment-noise');
      expect(finished.reasons).toEqual(['control case at the start is needs-triage']);
      expect(readRunFile(runId).state).toBe('environment-noise');
      expect(ledgerLines(runId)).toEqual([
        expect.objectContaining({ stage: 'candidate', case: 'control-start', environmentNoise: true }),
      ]);
    });

    it('makes a failed control verdict final at once, with a candidate line and no retry', async () => {
      const runId = await startConfirmed();
      storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN));

      const recorded = recordObservations(locate(runId), 'control', obsBytes(CONTROL_FAIL));

      expect(recorded.ok && recorded.outcome).toBe('needs-triage');
      expect(readRunFile(runId).cases['control-start']).toMatchObject({
        status: 'needs-triage',
        attempts: [expect.objectContaining({ attempt: 1, verdict: 'failed' })],
      });
      expect(ledgerLines(runId)).toEqual([
        expect.objectContaining({ stage: 'candidate', case: 'control-start', attempts: 1, verdicts: ['failed'] }),
      ]);
      expect(() => recordObservations(locate(runId), 'control', obsBytes(CONTROL_PASS))).toThrow(
        /No control case plan awaits a record/
      );
    });

    it('says that a planned case still awaits its verdict before the control case at the end', async () => {
      const runId = await startConfirmed();
      await runCase(runId, 'control', CONTROL_PLAN, CONTROL_PASS);
      storePlan(locate(runId), '1.1', planBytes(CASE_PLAN));

      expect(() => storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN))).toThrow(
        /Case 1\.1 still awaits a verdict \(status planned\): record its observations before the control case at the end/
      );
    });

    it('refuses to finish when the control case was never recorded', async () => {
      const runId = await startConfirmed();
      await runCase(runId, 'control', CONTROL_PLAN, CONTROL_PASS);

      expect(() => finishRun(locate(runId))).toThrow(/control case at the end has no verdict yet/);
    });

    it('refuses to plan the control case at the end while a case still awaits its retry', async () => {
      const runId = await startConfirmed();
      await runCase(runId, 'control', CONTROL_PLAN, CONTROL_PASS);
      await runCase(runId, '1.1', CASE_PLAN, CASE_FAIL);

      expect(() => storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN))).toThrow(/still awaits a verdict/);
    });

    it('refuses to finish a run whose readiness blocked it', async () => {
      await writeConfig(
        BASE_EXECUTION +
          `  readinessChecks:\n    - name: backend deployed\n      command: '${NODE} -e "process.exit(1)"'\n`
      );
      const runId = await startedId();

      expect(() => finishRun(locate(runId))).toThrow(/blocked-by-environment/);
    });

    it('describes the run with readiness, control, case attempts and ledger counts', async () => {
      const runId = await startConfirmed();
      await runCase(runId, 'control', CONTROL_PLAN, CONTROL_PASS);
      await runCase(runId, '1.1', CASE_PLAN, CASE_FAIL);

      const status = describeRunStatus(locate(runId));

      expect(status.run.state).toBe('ready');
      expect(status.run.cases['1.1'].status).toBe('retry');
      expect(status.run.cases['1.1'].attempts.map((attempt) => attempt.verdict)).toEqual(['failed']);
      expect(status.ledger).toEqual({ candidates: 0, environmentNoise: 0 });
    });
  });

  describe('run lock', () => {
    const lockDir = (runId: string) => path.join(locate(runId).runDir, '.lock');
    const lockOwner = (runId: string) => JSON.parse(readFileSync(path.join(lockDir(runId), 'owner.json'), 'utf-8'));

    it('waits for a live owner, gives up after its timeout and leaves that lock in place', async () => {
      const runId = await startedId();
      await fs.mkdir(lockDir(runId));
      await fs.writeFile(
        path.join(lockDir(runId), 'owner.json'),
        json({ pid: process.pid, token: 'held', acquiredAt: APPROVED_AT })
      );

      expect(() => acquireRunLock(locate(runId).runDir, 300)).toThrow(/is busy/);
      expect(lockOwner(runId)).toEqual({ pid: process.pid, token: 'held', acquiredAt: APPROVED_AT });
    });

    it('takes over a lock whose owner process has exited', async () => {
      const runId = await startedId();
      const exitedPid = spawnSync(process.execPath, ['-e', '']).pid;
      await fs.mkdir(lockDir(runId));
      await fs.writeFile(
        path.join(lockDir(runId), 'owner.json'),
        json({ pid: exitedPid, token: 'stale', acquiredAt: APPROVED_AT })
      );

      const release = acquireRunLock(locate(runId).runDir, 2_000);

      expect(lockOwner(runId)).toMatchObject({ pid: process.pid });
      release();
      expect(existsSync(lockDir(runId))).toBe(false);
    });

    it('does not remove a lock that another owner took after this one was acquired', async () => {
      const runId = await startedId();
      const release = acquireRunLock(locate(runId).runDir);
      await fs.writeFile(
        path.join(lockDir(runId), 'owner.json'),
        json({ pid: process.pid, token: 'other', acquiredAt: APPROVED_AT })
      );

      release();

      expect(lockOwner(runId).token).toBe('other');
    });

    it('releases the lock when a write is refused by the run state', async () => {
      const runId = await startedId();

      expect(() => storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN))).toThrow(/awaiting-confirmation/);
      expect(existsSync(lockDir(runId))).toBe(false);
    });
  });

  describe('identifiers and locations', () => {
    it('generates a UTC timestamp id with a short random suffix', () => {
      const id = generateRunId(new Date('2026-10-19T16:30:00.123Z'), Buffer.from([0xab, 0xcd, 0xef]));

      expect(id).toBe('20261019T163000Z-abcdef');
      expect(isValidRunId(id)).toBe(true);
    });

    it('rejects run ids that could leave the runs directory', () => {
      expect(isValidRunId('../../x')).toBe(false);
      expect(isValidRunId('20261019T163000Z-abcdef/..')).toBe(false);
      expect(() => findRun(changesDir, '../../x')).toThrow(/Invalid run id/);
    });

    it('accepts testcase ids and control, and rejects anything else', () => {
      expect(parseCaseArg('1.1')).toBe('1.1');
      expect(parseCaseArg('12')).toBe('12');
      expect(parseCaseArg('control')).toBe('control');
      expect(() => parseCaseArg('../x')).toThrow(/Invalid case id/);
      expect(() => parseCaseArg('1.x')).toThrow(/Invalid case id/);
    });

    it('lists the runs of a change in creation order', async () => {
      const first = await startedId();
      const second = await startedId();

      const runs = listRuns(changeDir);

      expect(runs.map((run) => run.id)).toEqual([first, second].sort());
      expect(runs.find((run) => run.id === first)).toEqual({
        id: first,
        state: 'awaiting-confirmation',
        createdAt: expect.any(String),
      });
    });
  });

  describe('evidence in status', () => {
    const evidenceRoot = (runId: string) => path.join(locate(runId).runDir, 'evidence');

    const writeEvidence = async (runId: string, relativePath: string) => {
      const target = path.join(evidenceRoot(runId), relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, 'evidence');
    };

    /** A passing control case, then case 1.1 failed twice: two recorded attempts. */
    const runWithTwoAttempts = async () => {
      const runId = await startConfirmed();
      storePlan(locate(runId), 'control', planBytes(CONTROL_PLAN));
      recordObservations(locate(runId), 'control', obsBytes(CONTROL_PASS));
      storePlan(locate(runId), '1.1', planBytes(CASE_PLAN));
      recordObservations(locate(runId), '1.1', obsBytes(CASE_FAIL));
      recordObservations(locate(runId), '1.1', obsBytes(CASE_FAIL));
      return runId;
    };

    it('lists the regular evidence files of each attempt, relative to the run', async () => {
      const runId = await runWithTwoAttempts();
      await writeEvidence(runId, path.join('1.1-1', 'console.log'));
      await writeEvidence(runId, path.join('1.1-1', 'network', 'requests.json'));

      const attempts = describeRunStatus(locate(runId)).cases['1.1'].attempts;

      expect(attempts).toMatchObject([{ attempt: 1, verdict: 'failed' }, { attempt: 2, verdict: 'failed' }]);
      expect(attempts.map((attempt) => attempt.evidence)).toEqual([
        [path.join('evidence', '1.1-1', 'console.log'), path.join('evidence', '1.1-1', 'network', 'requests.json')],
        [],
      ]);
    });

    it('never lists a symbolic link, even one that points outside the run', async () => {
      const runId = await runWithTwoAttempts();
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-run-outside-'));
      try {
        await fs.writeFile(path.join(outside, 'secret.txt'), 'outside the run');
        await writeEvidence(runId, path.join('1.1-1', 'shot.png'));
        await fs.symlink(path.join(outside, 'secret.txt'), path.join(evidenceRoot(runId), '1.1-1', 'leaked.txt'));
        await fs.symlink(outside, path.join(evidenceRoot(runId), '1.1-1', 'linked-folder'));
        await fs.symlink(outside, path.join(evidenceRoot(runId), '1.1-2'));

        const attempts = describeRunStatus(locate(runId)).cases['1.1'].attempts;

        expect(attempts.map((attempt) => attempt.evidence)).toEqual([[path.join('evidence', '1.1-1', 'shot.png')], []]);
      } finally {
        await fs.rm(outside, { recursive: true, force: true });
      }
    });

    it('lists nothing when the evidence folder itself is a symbolic link', async () => {
      const runId = await runWithTwoAttempts();
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-run-outside-'));
      try {
        await fs.mkdir(path.join(outside, '1.1-1'));
        await fs.writeFile(path.join(outside, '1.1-1', 'shot.png'), 'outside the run');
        await fs.symlink(outside, evidenceRoot(runId));

        const attempts = describeRunStatus(locate(runId)).cases['1.1'].attempts;

        expect(attempts.map((attempt) => attempt.evidence)).toEqual([[], []]);
      } finally {
        await fs.rm(outside, { recursive: true, force: true });
      }
    });
  });
});
