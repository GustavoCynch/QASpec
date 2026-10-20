import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { stringify } from 'yaml';
import { computeAnalyzeContentHash, writeApprovalRecord } from '../../src/core/approval-ledger.js';
import { createCatchWorktree } from '../../src/core/catch-git.js';
import {
  describeCatchRun,
  findCatchRun,
  finishCatchRun,
  listCatchRuns,
  nextRecordId,
  projectDirInWorktree,
  readRecord,
  requireReadyRun,
  startCatchRun,
  withRunLockAsync,
  writeRecord,
  type CatchBlocker,
  type CatchRunRecord,
  type CatchRunState,
  type FinishCatchRunInput,
  type StartCatchRunInput,
  type StartCatchRunOutcome,
} from '../../src/core/catch-run.js';
import { acquireRunLock } from '../../src/core/run-store.js';

vi.mock('../../src/core/catch-git.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/catch-git.js')>();
  return { ...actual, createCatchWorktree: vi.fn(actual.createCatchWorktree) };
});

const CHANGE = 'csv-export';
const RUN_ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{6}$/;
const SETUP_MARKER = 'setup-marker.txt';
const OUTPUT_MARKER = 'SETUP-OUTPUT-MARKER';
const APPROVED_AT = '2026-10-20T10:00:00.000Z';

/** A single-quoted shell word, for a command line written into the config. */
const shellWord = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;
const nodeEval = (code: string): string => `${shellWord(process.execPath)} -e ${shellWord(code)}`;
/** Harmless setup: writes a marker file into the folder setup runs in. */
const SETUP_OK = nodeEval(`require('fs').writeFileSync(${JSON.stringify(SETUP_MARKER)}, 'ok')`);
/** Failing setup whose output carries OUTPUT_MARKER, which the command text itself does not contain. */
const SETUP_FAILS = nodeEval(`console.log(['SETUP', 'OUTPUT', 'MARKER'].join('-')); process.exit(3)`);

const CSV_DELTA = [
  '## ADDED Requirements',
  '### Requirement: CSV export',
  'The system SHALL write a CSV file.',
  '#### Scenario: CSV header row',
  '- **WHEN** the file is built\n- **THEN** the first row holds the headers',
].join('\n\n') + '\n';

const CONTRADICTING_DELTA = [
  '## MODIFIED Requirements',
  '### Requirement: Currency',
  'The system SHALL keep each currency.',
  '## REMOVED Requirements',
  '### Requirement: Legacy export',
].join('\n\n') + '\n';

const DEFAULT_CATCH = {
  baseRef: 'main',
  setup: { commands: [SETUP_OK] },
  runner: { adapter: 'jest', command: 'npm test --' },
};

/** analysis.md with an Intent class section; intent null omits the line. */
function analysis(intent: string | null): string {
  return [
    '# Analysis',
    '## Affected capabilities',
    '- billing-export',
    '## Intent class',
    ...(intent === null ? [] : [intent]),
    '## Approval digest',
    'Pending.',
  ].join('\n\n') + '\n';
}

interface Fixture {
  repo: string;
  project: string;
  changesDir: string;
  /** Commit of main: the parent of the feature branch. */
  base: string;
  /** Commit of the feature branch: the PR head. */
  head: string;
}

let tmp: string;
let envBackup: NodeJS.ProcessEnv;

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

interface RepoOptions {
  subfolder?: string;
  /** The catch block; null omits it, undefined uses DEFAULT_CATCH. */
  catchBlock?: Record<string, unknown> | null;
}

/** A repository on main with the project (optionally in a subfolder) and a feature branch whose head changes src/app.ts. */
function makeRepo(options: RepoOptions = {}): Fixture {
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q');
  git(repo, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(repo, 'config', 'user.name', 'QASpec Test');
  git(repo, 'config', 'user.email', 'qaspec-test@example.com');
  git(repo, 'config', 'commit.gpgsign', 'false');

  const project = options.subfolder ? path.join(repo, options.subfolder) : repo;
  const catchBlock = options.catchBlock === undefined ? DEFAULT_CATCH : options.catchBlock;
  const config = { schema: 'qaspec-pr-review', ...(catchBlock === null ? {} : { catch: catchBlock }) };
  writeFiles(project, { 'qaspec/config.yaml': stringify(config), 'src/app.ts': 'export const value = 1;\n' });
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD');

  git(repo, 'checkout', '-q', '-b', 'feature');
  writeFiles(project, { 'src/app.ts': 'export const value = 2;\n' });
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'feature');
  const head = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '-q', 'main');

  return { repo, project, changesDir: path.join(project, 'qaspec', 'changes'), base, head };
}

/** A project that is not inside any git repository. */
function makePlainProject(): Fixture {
  const project = path.join(tmp, 'plain');
  writeFiles(project, { 'qaspec/config.yaml': stringify({ schema: 'qaspec-pr-review', catch: DEFAULT_CATCH }) });
  return { repo: project, project, changesDir: path.join(project, 'qaspec', 'changes'), base: '', head: '' };
}

/** Writes the change's analysis (with an intent class line unless null) and its delta spec. */
function writeChange(fx: Fixture, options: { intent?: string | null; delta?: string; name?: string } = {}): string {
  const changeDir = path.join(fx.changesDir, options.name ?? CHANGE);
  const intent = options.intent === undefined ? 'Intent class: additive' : options.intent;
  writeFiles(changeDir, {
    '.qaspec.yaml': 'schema: qaspec-pr-review\n',
    'analysis.md': analysis(intent),
    'specs/billing-export/spec.md': options.delta ?? CSV_DELTA,
  });
  return changeDir;
}

/** Records the analyze approval of the change's current content; the head defaults to the PR head. */
function approve(fx: Fixture, changeDir: string, record: { headSha?: string } = { headSha: fx.head }): void {
  writeApprovalRecord(
    changeDir,
    'analyze',
    { approvedAt: APPROVED_AT, contentHash: computeAnalyzeContentHash(changeDir).hash, ...record },
    fx.project
  );
}

function startInput(fx: Fixture, extra: Partial<StartCatchRunInput> = {}): StartCatchRunInput {
  return { projectRoot: fx.project, changesDir: fx.changesDir, changeName: CHANGE, ...extra };
}

function finishInput(fx: Fixture, runId: string, extra: Partial<FinishCatchRunInput> = {}): FinishCatchRunInput {
  return { projectRoot: fx.project, changesDir: fx.changesDir, runId, ...extra };
}

type Started = Extract<StartCatchRunOutcome, { started: true }>;

function startedOf(outcome: StartCatchRunOutcome): Started {
  if (!outcome.started) {
    throw new Error(`expected a started run, got blockers: ${outcome.blockers.map((b) => b.code).join(', ')}`);
  }
  return outcome;
}

function blockersOf(outcome: StartCatchRunOutcome): CatchBlocker[] {
  if (outcome.started) {
    throw new Error('expected a refusal, but the run started');
  }
  return outcome.blockers;
}

const codesOf = (outcome: StartCatchRunOutcome): string[] => blockersOf(outcome).map((blocker) => blocker.code);

const stagesOf = (runDir: string): string[] =>
  fs
    .readFileSync(path.join(runDir, 'ledger.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => (JSON.parse(line) as { stage: string }).stage);

const readJson = (file: string): Record<string, unknown> => JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;

const worktreesOf = (repo: string): string[] =>
  git(repo, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree '));

/** Refusals and failures before a run exists leave no catch folder, no catch root and no worktree. */
function assertNothingCreated(fx: Fixture): void {
  expect(fs.existsSync(path.join(fx.changesDir, CHANGE, 'catch'))).toBe(false);
  expect(fs.existsSync(path.join(tmp, 'qaspec-catch'))).toBe(false);
  expect(worktreesOf(fx.repo)).toHaveLength(1);
}

beforeEach(() => {
  envBackup = { ...process.env };
  // The real temp folder is never touched: catch roots and worktrees of every test live under this scratch folder.
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qaspec-catch-run-'));
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
  vi.mocked(createCatchWorktree).mockClear();
});

describe('catch start refusals', () => {
  it('refuses a project outside a git work tree and names git as the reason', async () => {
    const fx = makePlainProject();
    approve(fx, writeChange(fx), { headSha: 'f'.repeat(40) });

    const outcome = await startCatchRun(startInput(fx));

    expect(codesOf(outcome)).toEqual(['not-git-work-tree']);
    expect(blockersOf(outcome)[0].message).toMatch(/git/);
    expect(fs.existsSync(path.join(fx.changesDir, CHANGE, 'catch'))).toBe(false);
  });

  it('refuses a project without a catch block and says where to add one', async () => {
    const fx = makeRepo({ catchBlock: null });
    approve(fx, writeChange(fx));

    const outcome = await startCatchRun(startInput(fx, { base: 'main' }));

    expect(codesOf(outcome)).toEqual(['catch-config-missing']);
    expect(blockersOf(outcome)[0].resolve).toMatch(/catch/);
  });

  it('refuses a catch block without runner.adapter', async () => {
    const fx = makeRepo({ catchBlock: { baseRef: 'main', runner: { command: 'npm test --' } } });
    approve(fx, writeChange(fx));

    expect(codesOf(await startCatchRun(startInput(fx)))).toEqual(['runner-adapter-missing']);
  });

  it('refuses a catch block without runner.command', async () => {
    const fx = makeRepo({ catchBlock: { baseRef: 'main', runner: { adapter: 'jest' } } });
    approve(fx, writeChange(fx));

    expect(codesOf(await startCatchRun(startInput(fx)))).toEqual(['runner-command-missing']);
  });

  it('refuses without a base when neither --base nor catch.baseRef is set', async () => {
    const fx = makeRepo({ catchBlock: { runner: { adapter: 'jest', command: 'npm test --' } } });
    approve(fx, writeChange(fx));

    const outcome = await startCatchRun(startInput(fx));

    expect(codesOf(outcome)).toEqual(['base-missing']);
    expect(blockersOf(outcome)[0].resolve).toMatch(/--base/);
  });

  it('refuses when the analyze approval is missing and gives the approve command', async () => {
    const fx = makeRepo();
    writeChange(fx);

    const outcome = await startCatchRun(startInput(fx));

    expect(codesOf(outcome)).toEqual(['approval-missing']);
    expect(blockersOf(outcome)[0].resolve).toContain(`qaspec approve analyze --change ${CHANGE} --head-sha <sha>`);
  });

  it('refuses a stale approval after the analysis changed', async () => {
    const fx = makeRepo();
    const changeDir = writeChange(fx);
    approve(fx, changeDir);
    writeFiles(changeDir, { 'analysis.md': analysis('Intent class: additive') + '\nLater edit.\n' });

    expect(codesOf(await startCatchRun(startInput(fx)))).toEqual(['approval-stale']);
  });

  it('refuses an approval without headSha and says to approve again with --head-sha', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx), {});

    const outcome = await startCatchRun(startInput(fx));

    expect(codesOf(outcome)).toEqual(['head-sha-missing']);
    expect(blockersOf(outcome)[0].resolve).toContain(`qaspec approve analyze --change ${CHANGE} --head-sha <sha>`);
  });

  it('relays the intent error when the intent class is missing', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx, { intent: null }));

    expect(codesOf(await startCatchRun(startInput(fx)))).toEqual(['intent-class-missing']);
  });

  it('relays every intent contradiction of buildCatchIntent', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx, { intent: 'Intent class: additive', delta: CONTRADICTING_DELTA }));

    const outcome = await startCatchRun(startInput(fx));
    const messages = blockersOf(outcome).map((blocker) => blocker.message).join('\n');

    expect(codesOf(outcome)).toEqual(['intent-class-contradiction', 'intent-class-contradiction']);
    expect(messages).toContain('Currency');
    expect(messages).toContain('Legacy export');
  });

  it('refuses an unknown base ref and names it', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx));

    const outcome = await startCatchRun(startInput(fx, { base: 'no-such-branch' }));

    expect(codesOf(outcome)).toEqual(['revisions-unresolved']);
    expect(blockersOf(outcome)[0].message).toContain('no-such-branch');
  });

  it('refuses an approved head that is not a commit in the repository', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx), { headSha: 'f'.repeat(40) });

    const outcome = await startCatchRun(startInput(fx));

    expect(codesOf(outcome)).toEqual(['revisions-unresolved']);
    expect(blockersOf(outcome)[0].message).toContain('is not a commit');
  });

  it('refuses when the parent equals the head, because there is nothing to catch', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx));

    expect(codesOf(await startCatchRun(startInput(fx, { base: fx.head })))).toEqual(['nothing-to-catch']);
  });

  it('refuses --head without --without-analysis', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx));

    expect(codesOf(await startCatchRun(startInput(fx, { head: fx.head })))).toEqual(['head-without-analysis']);
  });

  it('refuses --without-analysis without --head', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx));

    expect(codesOf(await startCatchRun(startInput(fx, { withoutAnalysis: true })))).toEqual(['head-required']);
  });

  it('lists every blocker at once, in gate order', async () => {
    const fx = makeRepo({ catchBlock: { setup: { commands: [SETUP_OK] }, runner: { command: 'npm test --' } } });
    writeChange(fx);

    expect(codesOf(await startCatchRun(startInput(fx)))).toEqual([
      'runner-adapter-missing',
      'base-missing',
      'approval-missing',
    ]);
  });

  it('creates nothing on a refusal: no run folder, no catch root and no worktree', async () => {
    const fx = makeRepo();
    const changeDir = writeChange(fx);
    approve(fx, changeDir);
    const before = git(fx.repo, 'status', '--porcelain');

    expect(codesOf(await startCatchRun(startInput(fx, { base: fx.head })))).toEqual(['nothing-to-catch']);
    expect(codesOf(await startCatchRun(startInput(fx, { head: fx.head })))).toEqual(['head-without-analysis']);
    expect(codesOf(await startCatchRun(startInput(fx, { base: 'no-such-branch' })))).toEqual(['revisions-unresolved']);

    assertNothingCreated(fx);
    expect(git(fx.repo, 'status', '--porcelain')).toBe(before);
    expect(vi.mocked(createCatchWorktree)).not.toHaveBeenCalled();
  });
});

describe('catch start degraded mode (--without-analysis)', () => {
  it('starts without an approval or an intent and marks the run low confidence', async () => {
    const fx = makeRepo();
    writeChange(fx, { intent: null });

    const { run } = startedOf(await startCatchRun(startInput(fx, { withoutAnalysis: true, head: fx.head })));

    expect(run).toMatchObject({
      mode: 'without-analysis',
      lowConfidence: true,
      state: 'ready',
      headSha: fx.head,
      baseSha: fx.base,
      parentSha: fx.base,
    });
  });

  it('ignores a stale approval: the head comes from --head only', async () => {
    const fx = makeRepo();
    const changeDir = writeChange(fx);
    approve(fx, changeDir, { headSha: 'f'.repeat(40) });
    writeFiles(changeDir, { 'analysis.md': analysis('Intent class: additive') + '\nLater edit.\n' });

    const { run } = startedOf(await startCatchRun(startInput(fx, { withoutAnalysis: true, head: fx.head })));

    expect(run.headSha).toBe(fx.head);
    expect(run.lowConfidence).toBe(true);
  });

  it('writes the degraded intent marker to intent.json', async () => {
    const fx = makeRepo();
    writeChange(fx, { intent: null });

    const { runDir } = startedOf(await startCatchRun(startInput(fx, { withoutAnalysis: true, head: fx.head })));

    expect(readJson(path.join(runDir, 'intent.json'))).toEqual({
      schema: 'qaspec.catch-intent/v1',
      change: CHANGE,
      mode: 'without-analysis',
      intentClass: null,
      capabilities: [],
    });
  });

  it('refuses an unknown --head in degraded mode with the same revision check', async () => {
    const fx = makeRepo();
    writeChange(fx);

    const outcome = await startCatchRun(startInput(fx, { withoutAnalysis: true, head: 'f'.repeat(40) }));

    expect(codesOf(outcome)).toEqual(['revisions-unresolved']);
  });
});

describe('catch start success', () => {
  it('writes the run folder files and a started ledger line before the worktree is created', async () => {
    const fx = makeRepo();
    const changeDir = writeChange(fx);
    approve(fx, changeDir);

    const { run, runDir } = startedOf(await startCatchRun(startInput(fx)));

    for (const file of ['run.json', 'intent.json', 'diff.patch', 'changed-files.json', 'ledger.jsonl']) {
      expect(fs.existsSync(path.join(runDir, file))).toBe(true);
    }
    expect(path.dirname(runDir)).toBe(path.join(changeDir, 'catch'));
    expect(path.basename(runDir)).toBe(run.runId);
    expect(run.runId).toMatch(RUN_ID_PATTERN);
    expect(stagesOf(runDir)).toEqual(['started', 'setup', 'ready']);
  });

  it('records the run fields in run.json', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx));

    const { run, runDir } = startedOf(await startCatchRun(startInput(fx)));

    expect(readJson(path.join(runDir, 'run.json'))).toMatchObject({
      schema: 'qaspec.catch-run/v1',
      change: CHANGE,
      runId: run.runId,
      mode: 'analysis',
      lowConfidence: false,
      baseRef: 'main',
      headSha: fx.head,
      baseSha: fx.base,
      parentSha: fx.base,
      projectPrefix: '',
      state: 'ready',
      installedFor: fx.base,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(run.worktree).not.toBeNull();
    expect(fs.existsSync(run.worktree as string)).toBe(true);
    expect(run.setup).toEqual({
      ok: true,
      commands: [expect.objectContaining({ command: SETUP_OK, exitCode: 0, timedOut: false })],
    });
    expect(run.setup?.commands[0]).not.toHaveProperty('outputTail');
  });

  it('stores changed files as repository-relative paths and the diff against the parent', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx));

    const { runDir } = startedOf(await startCatchRun(startInput(fx)));

    expect(JSON.parse(fs.readFileSync(path.join(runDir, 'changed-files.json'), 'utf8'))).toEqual([
      { status: 'M', path: 'src/app.ts' },
    ]);
    expect(fs.readFileSync(path.join(runDir, 'diff.patch'), 'utf8')).toContain('+export const value = 2;');
  });

  it('stores the buildCatchIntent output as intent.json in analysis mode', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx));

    const { runDir } = startedOf(await startCatchRun(startInput(fx)));
    const intent = readJson(path.join(runDir, 'intent.json'));

    expect(intent).toMatchObject({ schema: 'qaspec.catch-intent/v1', change: CHANGE, intentClass: 'additive' });
    expect(intent).toHaveProperty('capabilities');
  });

  it('writes catch/.gitignore with * when it is missing, and keeps an existing one', async () => {
    const fx = makeRepo();
    const changeDir = writeChange(fx);
    approve(fx, changeDir);

    startedOf(await startCatchRun(startInput(fx)));
    expect(fs.readFileSync(path.join(changeDir, 'catch', '.gitignore'), 'utf8').trim()).toBe('*');

    fs.writeFileSync(path.join(changeDir, 'catch', '.gitignore'), 'custom\n');
    startedOf(await startCatchRun(startInput(fx)));
    expect(fs.readFileSync(path.join(changeDir, 'catch', '.gitignore'), 'utf8')).toBe('custom\n');
  });

  it('creates the worktree at the parent and runs catch.setup in it', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx));

    const { run } = startedOf(await startCatchRun(startInput(fx)));
    const worktree = run.worktree as string;

    expect(git(worktree, 'rev-parse', 'HEAD')).toBe(fx.base);
    expect(fs.existsSync(path.join(worktree, SETUP_MARKER))).toBe(true);
    expect(run.installedFor).toBe(fx.base);
    expect(worktreesOf(fx.repo)).toHaveLength(2);
  });

  it('runs setup in the project folder of a project inside a subfolder', async () => {
    const fx = makeRepo({ subfolder: 'packages/app' });
    approve(fx, writeChange(fx));

    const { run, runDir } = startedOf(await startCatchRun(startInput(fx)));
    const worktree = run.worktree as string;

    expect(run.projectPrefix).toBe('packages/app');
    expect(fs.existsSync(path.join(worktree, 'packages', 'app', SETUP_MARKER))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(runDir, 'changed-files.json'), 'utf8'))).toEqual([
      { status: 'M', path: 'packages/app/src/app.ts' },
    ]);
  });

  it('takes the base from --base over catch.baseRef', async () => {
    const fx = makeRepo({ catchBlock: { ...DEFAULT_CATCH, baseRef: 'no-such-branch' } });
    approve(fx, writeChange(fx));

    const { run } = startedOf(await startCatchRun(startInput(fx, { base: 'main' })));

    expect(run).toMatchObject({ baseRef: 'main', parentSha: fx.base, state: 'ready' });
  });

  it('never changes the user checkout: HEAD, branches and status stay the same', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx));
    const before = {
      head: git(fx.repo, 'rev-parse', 'HEAD'),
      branches: git(fx.repo, 'branch', '--format=%(refname)'),
      status: git(fx.repo, 'status', '--porcelain'),
    };

    startedOf(await startCatchRun(startInput(fx)));

    expect({
      head: git(fx.repo, 'rev-parse', 'HEAD'),
      branches: git(fx.repo, 'branch', '--format=%(refname)'),
      status: git(fx.repo, 'status', '--porcelain'),
    }).toEqual(before);
  });
});

describe('catch start failures after the run exists', () => {
  it('a failing setup command ends in setup-failed: the worktree is removed and the output stays in the run folder', async () => {
    const fx = makeRepo({ catchBlock: { ...DEFAULT_CATCH, setup: { commands: [SETUP_FAILS] } } });
    approve(fx, writeChange(fx));

    const { run, runDir } = startedOf(await startCatchRun(startInput(fx)));

    expect(run).toMatchObject({ state: 'setup-failed', worktree: null, installedFor: null });
    expect(run.setup).toMatchObject({ ok: false, commands: [{ command: SETUP_FAILS, exitCode: 3, timedOut: false }] });
    expect(run.setup?.commands[0]).not.toHaveProperty('outputTail');
    expect(fs.readFileSync(path.join(runDir, 'setup-output.json'), 'utf8')).toContain(OUTPUT_MARKER);
    expect(fs.readFileSync(path.join(runDir, 'run.json'), 'utf8')).not.toContain(OUTPUT_MARKER);
    expect(fs.readFileSync(path.join(runDir, 'ledger.jsonl'), 'utf8')).not.toContain(OUTPUT_MARKER);
    expect(stagesOf(runDir)).toEqual(['started', 'setup', 'setup-failed']);
    expect(worktreesOf(fx.repo)).toHaveLength(1);
  });

  it('a worktree that cannot be created ends in worktree-failed with no worktree and no setup', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx));
    vi.mocked(createCatchWorktree).mockRejectedValueOnce(new Error('worktree add refused'));

    const { run, runDir } = startedOf(await startCatchRun(startInput(fx)));

    expect(run).toMatchObject({ state: 'worktree-failed', worktree: null, setup: null, installedFor: null });
    expect(run.failure).toContain('worktree add refused');
    expect(stagesOf(runDir)).toEqual(['started', 'worktree-failed']);
  });
});

describe('catch status', () => {
  it('describes a run: state, mode, revisions, setup results and ledger counts', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx));
    const { run } = startedOf(await startCatchRun(startInput(fx)));

    const status = describeCatchRun(findCatchRun(fx.changesDir, run.runId));

    expect(status.run).toMatchObject({
      state: 'ready',
      mode: 'analysis',
      lowConfidence: false,
      headSha: fx.head,
      baseSha: fx.base,
      parentSha: fx.base,
    });
    expect(status.run.setup?.commands).toHaveLength(1);
    expect(status.run.setup?.commands[0]).not.toHaveProperty('outputTail');
    expect(status.ledger).toEqual({ started: 1, setup: 1, ready: 1 });
  });

  it('finds a run by id across changes, and only inside the named change when one is given', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx));
    const { run } = startedOf(await startCatchRun(startInput(fx)));

    expect(findCatchRun(fx.changesDir, run.runId).changeName).toBe(CHANGE);
    expect(findCatchRun(fx.changesDir, run.runId, CHANGE).run.runId).toBe(run.runId);
    expect(() => findCatchRun(fx.changesDir, run.runId, 'other-change')).toThrow(/not found/);
  });

  it('lists the runs of a change with their state and mode', async () => {
    const fx = makeRepo();
    const changeDir = writeChange(fx);
    approve(fx, changeDir);
    const analysisRun = startedOf(await startCatchRun(startInput(fx))).run;
    const degradedRun = startedOf(
      await startCatchRun(startInput(fx, { withoutAnalysis: true, head: fx.head }))
    ).run;

    const listed = listCatchRuns(path.join(changeDir));

    expect(listed.map((entry) => entry.run)).toEqual([analysisRun.runId, degradedRun.runId].sort());
    expect(listed.find((entry) => entry.run === degradedRun.runId)).toMatchObject({
      state: 'ready',
      mode: 'without-analysis',
    });
  });

  it('refuses an invalid run id before it builds any path', () => {
    const fx = makeRepo();

    expect(() => findCatchRun(fx.changesDir, '../../escape')).toThrow(/Invalid catch run id/);
  });

  it('reports a valid run id that no change holds', () => {
    const fx = makeRepo();

    expect(() => findCatchRun(fx.changesDir, '20261020T100000Z-000000')).toThrow(/not found/);
  });
});

describe('catch finish', () => {
  it('removes the worktree, marks the run finished and appends a finished line', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx));
    const { run, runDir } = startedOf(await startCatchRun(startInput(fx)));
    const worktree = run.worktree as string;

    const outcome = await finishCatchRun(finishInput(fx, run.runId));

    expect(outcome.alreadyFinished).toBe(false);
    expect(outcome.run).toMatchObject({ state: 'finished', worktree: null, installedFor: null });
    expect(outcome.run.finishedAt).toEqual(expect.any(String));
    expect(fs.existsSync(worktree)).toBe(false);
    expect(worktreesOf(fx.repo)).toHaveLength(1);
    expect(stagesOf(runDir)).toEqual(['started', 'setup', 'ready', 'finished']);
  });

  it('reports an already finished run on a second finish and changes nothing', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx));
    const { run, runDir } = startedOf(await startCatchRun(startInput(fx)));
    await finishCatchRun(finishInput(fx, run.runId));
    const ledgerBefore = fs.readFileSync(path.join(runDir, 'ledger.jsonl'), 'utf8');

    const second = await finishCatchRun(finishInput(fx, run.runId));

    expect(second.alreadyFinished).toBe(true);
    expect(second.run.state).toBe('finished');
    expect(fs.readFileSync(path.join(runDir, 'ledger.jsonl'), 'utf8')).toBe(ledgerBefore);
  });

  it('closes a setup-failed run without a git removal', async () => {
    const fx = makeRepo({ catchBlock: { ...DEFAULT_CATCH, setup: { commands: [SETUP_FAILS] } } });
    approve(fx, writeChange(fx));
    const { run, runDir } = startedOf(await startCatchRun(startInput(fx)));

    const outcome = await finishCatchRun(finishInput(fx, run.runId));

    expect(outcome).toMatchObject({ alreadyFinished: false, run: { state: 'finished', worktree: null } });
    expect(stagesOf(runDir).slice(-1)).toEqual(['finished']);
  });
});

describe('catch run lock', () => {
  it('refuses a finish while another qaspec catch command holds the run lock', async () => {
    const fx = makeRepo();
    approve(fx, writeChange(fx));
    const { run, runDir } = startedOf(await startCatchRun(startInput(fx)));
    const lockDir = path.join(runDir, '.lock');
    fs.mkdirSync(lockDir);
    fs.writeFileSync(
      path.join(lockDir, 'owner.json'),
      JSON.stringify({ pid: process.pid, token: 'held-by-test', acquiredAt: APPROVED_AT })
    );

    await expect(finishCatchRun(finishInput(fx, run.runId, { lockTimeoutMs: 200 }))).rejects.toThrow(
      /another qaspec catch command holds its lock/
    );
    expect(readJson(path.join(runDir, 'run.json')).state).toBe('ready');
  });
});

describe('catch run helpers of the parent phase (T7)', () => {
  const runWith = (state: CatchRunState, overrides: Partial<CatchRunRecord> = {}): CatchRunRecord =>
    ({ runId: '20261020T100000Z-abcdef', state, ...overrides }) as CatchRunRecord;

  it('requireReadyRun passes a ready run, and names the state and the action of any other run', () => {
    expect(() => requireReadyRun(runWith('ready'), 'qaspec catch risk')).not.toThrow();
    expect(() => requireReadyRun(runWith('setup-failed'), 'qaspec catch risk')).toThrow(
      /is setup-failed.*qaspec catch risk needs a ready run/
    );
    expect(() => requireReadyRun(runWith('finished'), 'qaspec catch mutant')).toThrow(/is finished/);
  });

  it('nextRecordId numbers records from 1 and continues after the highest id, ignoring temporary files', () => {
    const dir = path.join(tmp, 'risks');
    expect(nextRecordId(dir, 'R')).toBe('R1');

    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'R1.json'), '{}');
    fs.writeFileSync(path.join(dir, 'R3.json'), '{}');
    fs.writeFileSync(path.join(dir, 'R4.json.abcdef12.tmp'), '');
    expect(nextRecordId(dir, 'R')).toBe('R4');
    expect(nextRecordId(dir, 'M')).toBe('M1');
  });

  it('writeRecord stores a record as JSON under its id, and readRecord returns it or undefined', () => {
    const dir = path.join(tmp, 'mutants');

    writeRecord(dir, 'M1', { id: 'M1', outcome: 'surviving' });

    expect(fs.readFileSync(path.join(dir, 'M1.json'), 'utf8')).toBe('{\n  "id": "M1",\n  "outcome": "surviving"\n}\n');
    expect(readRecord(dir, 'M1')).toEqual({ id: 'M1', outcome: 'surviving' });
    expect(readRecord(dir, 'M2')).toBeUndefined();
  });

  it('withRunLockAsync holds the run lock while its async step runs, and releases it afterwards', async () => {
    const runDir = path.join(tmp, 'run');
    fs.mkdirSync(runDir);

    const seen = await withRunLockAsync(runDir, 1_000, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(() => acquireRunLock(runDir, 50, 'qaspec catch')).toThrow(/another qaspec catch command holds its lock/);
      return 'done';
    });

    expect(seen).toBe('done');
    expect(fs.existsSync(path.join(runDir, '.lock'))).toBe(false);
  });

  it('projectDirInWorktree returns the worktree at a checkout root, or its project subfolder', () => {
    const project = path.join(tmp, 'project');
    const worktree = path.join(tmp, 'worktree');
    fs.mkdirSync(project);
    fs.mkdirSync(path.join(worktree, 'packages', 'app'), { recursive: true });

    expect(projectDirInWorktree(project, runWith('ready', { worktree, projectPrefix: '' }))).toBe(worktree);
    expect(projectDirInWorktree(project, runWith('ready', { worktree, projectPrefix: 'packages/app' }))).toBe(
      path.join(worktree, 'packages', 'app')
    );
  });

  it('projectDirInWorktree refuses a prefix that leaves the worktree, a missing worktree and a worktree inside the project', () => {
    const project = path.join(tmp, 'project');
    const worktree = path.join(tmp, 'worktree');
    fs.mkdirSync(path.join(project, 'nested'), { recursive: true });
    fs.mkdirSync(worktree);

    expect(() => projectDirInWorktree(project, runWith('ready', { worktree, projectPrefix: '../escape' }))).toThrow(
      /leaves the catch worktree/
    );
    expect(() => projectDirInWorktree(project, runWith('ready', { worktree: null, projectPrefix: '' }))).toThrow(
      /has no worktree/
    );
    expect(() =>
      projectDirInWorktree(project, runWith('ready', { worktree: path.join(tmp, 'gone'), projectPrefix: '' }))
    ).toThrow(/is missing/);
    expect(() =>
      projectDirInWorktree(project, runWith('ready', { worktree: path.join(project, 'nested'), projectPrefix: '' }))
    ).toThrow(/inside the project/);
  });
});
