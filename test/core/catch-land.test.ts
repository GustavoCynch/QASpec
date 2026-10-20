import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { finishCatchRun, startCatchRun, type CatchRunState } from '../../src/core/catch-run.js';
import { runChildPhase } from '../../src/core/catch-child.js';
import { recordTest } from '../../src/core/catch-test.js';
import {
  prepareLanding,
  recordLanded,
  type LandPreparation,
  type PrepareLandingOutcome,
} from '../../src/core/catch-land.js';
import { readLedger } from '../../src/core/run-store.js';
import { catchLandCommand, catchLandedCommand } from '../../src/commands/catch-land.js';
import { CHANGE, git, makeProjectFixture, type ProjectFixture } from '../fixtures/catch-jest/catch-project.js';

/** Passes on the parent and on the head: the expectation the head keeps, so the test is landed. */
const LABEL_SPEC = "// covers: src/app.ts\n// expect: export const label = 'value';\n";
/** The same expectation without its final newline: the patch must carry the "no newline" marker. */
const CSV_SPEC = "// covers: src/app.ts\n// expect: export const label = 'value';";
/** Passes on the parent and fails on the head: reported, never landed. */
const VALUE_SPEC = '// covers: src/app.ts\n// expect: export const value = 1;\n';
const LABEL_PATH = 'test/catch-labels.spec.ts';
const CSV_PATH = 'test/catch-csv.spec.ts';

const originalCwd = process.cwd();
let tmp: string;
let envBackup: NodeJS.ProcessEnv;

beforeEach(() => {
  envBackup = { ...process.env };
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qaspec-catch-land-'));
  process.env.TMPDIR = tmp;
  process.env.TMP = tmp;
  process.env.TEMP = tmp;
});

afterEach(() => {
  process.chdir(originalCwd);
  process.exitCode = undefined;
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) {
    if (!(key in envBackup)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, envBackup);
});

interface TestSpec {
  path: string;
  content: string;
}

interface Classified {
  fx: ProjectFixture;
  runId: string;
  runDir: string;
}

/**
 * A run in state classified with the given functionality tests on Currency. Each test is gated on the parent and then
 * classified on the head by the real child phase: the expectations decide land or report.
 */
async function classifiedRun(tests: TestSpec[], subfolder?: string): Promise<Classified> {
  // Each run gets a fixture folder of its own, so one test can build several runs.
  const root = fs.mkdtempSync(path.join(tmp, 'fixture-'));
  const fx = makeProjectFixture({ root, subfolder, gates: { childRuns: 1 } });
  const started = await startCatchRun({ projectRoot: fx.project, changesDir: fx.changesDir, changeName: CHANGE });
  if (!started.started || started.run.state !== 'ready') {
    throw new Error('the run did not start ready');
  }
  const { runId } = started.run;
  for (const test of tests) {
    const recorded = await recordTest({
      projectRoot: fx.project,
      changesDir: fx.changesDir,
      runId,
      value: { kind: 'functionality', requirement: 'Currency', path: test.path, content: test.content },
    });
    if (!recorded.ok || recorded.test.outcome !== 'gated') {
      throw new Error(`the test ${test.path} was not gated`);
    }
  }
  const child = await runChildPhase({ projectRoot: fx.project, changesDir: fx.changesDir, runId });
  if (child.status !== 'classified') {
    throw new Error(`the child phase did not classify the run: ${child.status}`);
  }
  return { fx, runId, runDir: started.runDir };
}

const prepare = (run: Classified): Promise<PrepareLandingOutcome> =>
  prepareLanding({ projectRoot: run.fx.project, changesDir: run.fx.changesDir, runId: run.runId });

const record = (run: Classified) => recordLanded({ changesDir: run.fx.changesDir, runId: run.runId });

/** The prepared outcome, or a failure that shows what came back instead. */
function preparedOf(outcome: PrepareLandingOutcome): Extract<PrepareLandingOutcome, { status: 'prepared' }> {
  if (outcome.status !== 'prepared') {
    throw new Error(`expected a prepared landing, got ${JSON.stringify(outcome)}`);
  }
  return outcome;
}

/** The manifest the preparation keeps in the run folder. */
const manifestOf = (runDir: string): LandPreparation =>
  JSON.parse(fs.readFileSync(path.join(runDir, 'land.json'), 'utf8')) as LandPreparation;

/** Rewrites fields of a stored test record, to model a record that no longer matches what the run wrote. */
function editTestRecord(runDir: string, id: string, change: Record<string, unknown>): void {
  const file = path.join(runDir, 'tests', `${id}.json`);
  const record = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  fs.writeFileSync(file, `${JSON.stringify({ ...record, ...change }, null, 2)}\n`);
}

/** Sets the state of a run record, for the states a run reaches only through failures. */
function setRunState(runDir: string, state: CatchRunState): void {
  const file = path.join(runDir, 'run.json');
  const run = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  fs.writeFileSync(file, `${JSON.stringify({ ...run, state }, null, 2)}\n`);
}

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Every folder and file under root, keyed by its path relative to root: folders by name, files by the hash of their
 * bytes, links by their target. The folder named by skip is left out, so a before and an after snapshot compare the
 * writes made outside it.
 */
function snapshot(root: string, skip: string): Record<string, string> {
  const entries: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      if (full === skip) {
        continue;
      }
      const relative = path.relative(root, full);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) {
        entries[relative] = `link:${fs.readlinkSync(full)}`;
      } else if (stat.isDirectory()) {
        entries[`${relative}/`] = 'dir';
        walk(full);
      } else {
        entries[relative] = `file:${sha256(fs.readFileSync(full))}`;
      }
    }
  };
  walk(root);
  return entries;
}

/** A detached checkout of the PR head in a folder of its own: the place the patch has to apply to. */
function headCheckout(run: Classified, dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const checkout = path.join(dir, 'checkout');
  git(dir, 'clone', '-q', run.fx.repo, checkout);
  git(checkout, 'checkout', '-q', '--detach', run.fx.head);
  return checkout;
}

const landedLines = (runDir: string) => readLedger(runDir).filter((entry) => entry.stage === 'landed');

// Every test here builds a real classified run (git repositories, worktrees and processes): slower than a unit test.
const SLOW_RUNS = { timeout: 30_000 };

describe('prepareLanding', SLOW_RUNS, () => {
  it('refuses every state before classified and finished, and writes nothing', async () => {
    const run = await classifiedRun([{ path: LABEL_PATH, content: LABEL_SPEC }]);
    const before = snapshot(tmp, run.runDir);

    for (const state of ['ready', 'setting-up', 'worktree-failed', 'setup-failed', 'child-setup-failed', 'finished'] as const) {
      setRunState(run.runDir, state);
      const outcome = await prepare(run);
      expect(outcome, `state ${state}`).toMatchObject({ status: 'refused', issues: [{ code: 'run-state' }] });
    }

    expect(fs.existsSync(path.join(run.runDir, 'land'))).toBe(false);
    expect(fs.existsSync(path.join(run.runDir, 'land.patch'))).toBe(false);
    expect(fs.existsSync(path.join(run.runDir, 'land.json'))).toBe(false);
    expect(snapshot(tmp, run.runDir)).toEqual(before);
  });

  it('a run with no test to land prepares an explicit empty landing: no patch file, no patch path', async () => {
    const run = await classifiedRun([{ path: LABEL_PATH, content: VALUE_SPEC }]);

    const landing = preparedOf(await prepare(run));

    expect(landing.landing.tests).toEqual([]);
    expect(landing.landing.refused).toEqual([]);
    expect(landing.landing.patch).toBeNull();
    expect(landing.patchPath).toBeNull();
    expect(fs.existsSync(path.join(run.runDir, 'land.patch'))).toBe(false);
    expect(manifestOf(run.runDir).tests).toEqual([]);
  });

  it('refuses a land test whose path exists on the head and prepares the other tests', async () => {
    const run = await classifiedRun([
      { path: LABEL_PATH, content: LABEL_SPEC },
      { path: CSV_PATH, content: CSV_SPEC },
    ]);
    // The stored path of T1 now names a file that the head holds: it must not land.
    editTestRecord(run.runDir, 'T1', { path: 'test/app.spec.ts' });

    const landing = preparedOf(await prepare(run));

    expect(landing.landing.tests.map((test) => test.test)).toEqual(['T2']);
    expect(landing.landing.refused).toEqual([
      expect.objectContaining({ test: 'T1', path: 'test/app.spec.ts', reason: expect.stringMatching(/exists on the head/) }),
    ]);
    expect(fs.existsSync(path.join(run.runDir, 'land', 'test', 'app.spec.ts'))).toBe(false);
    const patch = fs.readFileSync(path.join(run.runDir, 'land.patch'), 'utf8');
    expect(patch).toContain(`diff --git a/${CSV_PATH} b/${CSV_PATH}`);
    expect(patch).not.toContain('test/app.spec.ts');
  });

  it('writes the stored content of each land test under land/ and one patch that adds them', async () => {
    const run = await classifiedRun([{ path: LABEL_PATH, content: LABEL_SPEC }]);

    const landing = preparedOf(await prepare(run));

    expect(landing.patchPath).toBe(path.join(run.runDir, 'land.patch'));
    expect(landing.landing.headSha).toBe(run.fx.head);
    expect(landing.landing.tests).toEqual([
      {
        test: 'T1',
        kind: 'functionality',
        path: LABEL_PATH,
        repoPath: LABEL_PATH,
        file: `land/${LABEL_PATH}`,
        contentSha256: sha256(Buffer.from(LABEL_SPEC, 'utf8')),
      },
    ]);
    expect(fs.readFileSync(path.join(run.runDir, 'land', LABEL_PATH), 'utf8')).toBe(LABEL_SPEC);
    const patch = fs.readFileSync(path.join(run.runDir, 'land.patch'), 'utf8');
    expect(patch).toBe(
      [
        `diff --git a/${LABEL_PATH} b/${LABEL_PATH}`,
        'new file mode 100644',
        '--- /dev/null',
        `+++ b/${LABEL_PATH}`,
        '@@ -0,0 +1,2 @@',
        '+// covers: src/app.ts',
        "+// expect: export const label = 'value';",
        '',
      ].join('\n')
    );
  });

  it('the patch applies with git apply --check at the head and adds exactly the landed files', async () => {
    const run = await classifiedRun([
      { path: LABEL_PATH, content: LABEL_SPEC },
      { path: CSV_PATH, content: CSV_SPEC },
    ]);
    const landing = preparedOf(await prepare(run));
    const checkout = headCheckout(run, path.join(tmp, 'apply'));

    git(checkout, 'apply', '--check', landing.patchPath as string);
    git(checkout, 'apply', landing.patchPath as string);

    expect(git(checkout, 'ls-files', '--others', '--exclude-standard').split('\n').sort()).toEqual(
      [CSV_PATH, LABEL_PATH].sort()
    );
    expect(fs.readFileSync(path.join(checkout, LABEL_PATH), 'utf8')).toBe(LABEL_SPEC);
    expect(fs.readFileSync(path.join(checkout, CSV_PATH), 'utf8')).toBe(CSV_SPEC);
  });

  it('a project in a subfolder lands at its repository path, and the patch applies from the repository root', async () => {
    const run = await classifiedRun([{ path: LABEL_PATH, content: LABEL_SPEC }], 'packages/app');
    const repoPath = `packages/app/${LABEL_PATH}`;

    const landing = preparedOf(await prepare(run));
    const checkout = headCheckout(run, path.join(tmp, 'apply'));

    expect(landing.landing.tests[0]).toMatchObject({ path: LABEL_PATH, repoPath, file: `land/${LABEL_PATH}` });
    expect(fs.readFileSync(path.join(run.runDir, 'land.patch'), 'utf8')).toContain(
      `diff --git a/${repoPath} b/${repoPath}`
    );
    git(checkout, 'apply', '--check', landing.patchPath as string);
    git(checkout, 'apply', landing.patchPath as string);
    expect(git(checkout, 'ls-files', '--others', '--exclude-standard').split('\n')).toEqual([repoPath]);
  });

  it('checks the head at the repository path of a subfolder project: a path it holds there is refused', async () => {
    // The head holds packages/app/test/app.spec.ts, not test/app.spec.ts: only the prefixed path is a conflict.
    const run = await classifiedRun([{ path: LABEL_PATH, content: LABEL_SPEC }], 'packages/app');
    editTestRecord(run.runDir, 'T1', { path: 'test/app.spec.ts' });

    const landing = preparedOf(await prepare(run));

    expect(landing.landing.tests).toEqual([]);
    expect(landing.landing.refused).toEqual([
      expect.objectContaining({ test: 'T1', path: 'test/app.spec.ts', reason: expect.stringMatching(/exists on the head/) }),
    ]);
  });

  it('is idempotent: a second prepare writes the same files and returns the same landing', async () => {
    const run = await classifiedRun([{ path: LABEL_PATH, content: LABEL_SPEC }]);

    const first = preparedOf(await prepare(run));
    const firstPatch = fs.readFileSync(path.join(run.runDir, 'land.patch'));
    const second = preparedOf(await prepare(run));

    expect(second.landing).toEqual({ ...first.landing, preparedAt: second.landing.preparedAt });
    expect(second.patchPath).toBe(first.patchPath);
    expect(fs.readFileSync(path.join(run.runDir, 'land.patch'))).toEqual(firstPatch);
    expect(landedLines(run.runDir)).toEqual([]);
  });

  it('a second prepare removes the copy of a test it no longer lands', async () => {
    const run = await classifiedRun([
      { path: LABEL_PATH, content: LABEL_SPEC },
      { path: CSV_PATH, content: CSV_SPEC },
    ]);
    preparedOf(await prepare(run));
    expect(fs.existsSync(path.join(run.runDir, 'land', CSV_PATH))).toBe(true);
    // T2 now names a file the head holds: its copy from the first preparation must not stay in land/.
    editTestRecord(run.runDir, 'T2', { path: 'test/app.spec.ts' });

    const landing = preparedOf(await prepare(run));

    expect(landing.landing.tests.map((test) => test.test)).toEqual(['T1']);
    expect(fs.existsSync(path.join(run.runDir, 'land', CSV_PATH))).toBe(false);
    expect(fs.existsSync(path.join(run.runDir, 'land', LABEL_PATH))).toBe(true);
  });

  it('writes nothing outside the run folder', async () => {
    const run = await classifiedRun([{ path: LABEL_PATH, content: LABEL_SPEC }]);
    const before = snapshot(tmp, run.runDir);

    preparedOf(await prepare(run));
    expect(snapshot(tmp, run.runDir)).toEqual(before);

    await record(run);
    expect(snapshot(tmp, run.runDir)).toEqual(before);
  });

  it('refuses a stored path that leaves the project, and writes nothing outside the run folder', async () => {
    const run = await classifiedRun([{ path: LABEL_PATH, content: LABEL_SPEC }]);
    editTestRecord(run.runDir, 'T1', { path: '../escape.spec.ts' });
    const before = snapshot(tmp, run.runDir);

    const landing = preparedOf(await prepare(run));

    expect(landing.landing.tests).toEqual([]);
    expect(landing.landing.refused).toEqual([
      expect.objectContaining({ test: 'T1', reason: expect.stringMatching(/project-relative/) }),
    ]);
    expect(snapshot(tmp, run.runDir)).toEqual(before);
  });

  it('refuses every land test that names a path another land test names: one file cannot land twice', async () => {
    const run = await classifiedRun([
      { path: LABEL_PATH, content: LABEL_SPEC },
      { path: LABEL_PATH, content: CSV_SPEC },
    ]);

    const landing = preparedOf(await prepare(run));

    expect(landing.landing.tests).toEqual([]);
    expect(landing.landing.refused).toEqual([
      expect.objectContaining({ test: 'T1', path: LABEL_PATH, reason: expect.stringMatching(/one file cannot land twice/) }),
      expect.objectContaining({ test: 'T2', path: LABEL_PATH, reason: expect.stringMatching(/one file cannot land twice/) }),
    ]);
    expect(fs.existsSync(path.join(run.runDir, 'land.patch'))).toBe(false);
  });

  it('refuses a land test whose stored content no longer matches its recorded hash', async () => {
    const run = await classifiedRun([{ path: LABEL_PATH, content: LABEL_SPEC }]);
    fs.writeFileSync(path.join(run.runDir, 'tests', 'T1', 'catch-labels.spec.ts'), VALUE_SPEC);

    const landing = preparedOf(await prepare(run));

    expect(landing.landing.tests).toEqual([]);
    expect(landing.landing.refused).toEqual([
      expect.objectContaining({ test: 'T1', path: LABEL_PATH, reason: expect.stringMatching(/no longer matches/) }),
    ]);
    expect(fs.existsSync(path.join(run.runDir, 'land', LABEL_PATH))).toBe(false);
  });

  it('refuses a run whose recorded head is not a commit id, before git sees it, and writes nothing', async () => {
    const run = await classifiedRun([{ path: LABEL_PATH, content: LABEL_SPEC }]);
    const runFile = path.join(run.runDir, 'run.json');
    const record = JSON.parse(fs.readFileSync(runFile, 'utf8')) as Record<string, unknown>;
    fs.writeFileSync(runFile, `${JSON.stringify({ ...record, headSha: '--output=escape' }, null, 2)}\n`);
    const before = snapshot(tmp, run.runDir);

    const outcome = await prepare(run);

    expect(outcome).toMatchObject({ status: 'refused', issues: [{ code: 'head-invalid' }] });
    expect(fs.existsSync(path.join(run.runDir, 'land'))).toBe(false);
    expect(snapshot(tmp, run.runDir)).toEqual(before);
  });

  it('still lands the tests of a run that assess has moved on from classified', async () => {
    // The assess step (T9) moves a classified run to assessed: the landing stays open until the run is finished.
    const run = await classifiedRun([{ path: LABEL_PATH, content: LABEL_SPEC }]);
    setRunState(run.runDir, 'assessed');

    const landing = preparedOf(await prepare(run));

    expect(landing.landing.tests.map((test) => test.test)).toEqual(['T1']);
  });
});

describe('recordLanded', SLOW_RUNS, () => {
  it('refuses when prepareLanding was never run, and records nothing', async () => {
    const run = await classifiedRun([{ path: LABEL_PATH, content: LABEL_SPEC }]);

    const outcome = await record(run);

    expect(outcome).toMatchObject({ status: 'refused', issues: [{ code: 'not-prepared' }] });
    expect(landedLines(run.runDir)).toEqual([]);
  });

  it('appends one landed line per prepared test, and only once', async () => {
    const run = await classifiedRun([
      { path: LABEL_PATH, content: LABEL_SPEC },
      { path: CSV_PATH, content: CSV_SPEC },
    ]);
    await prepare(run);

    const first = await record(run);

    expect(first).toMatchObject({
      status: 'recorded',
      landed: [
        { test: 'T1', kind: 'functionality', path: LABEL_PATH },
        { test: 'T2', kind: 'functionality', path: CSV_PATH },
      ],
    });
    expect(landedLines(run.runDir)).toEqual([
      expect.objectContaining({ test: 'T1', kind: 'functionality', path: LABEL_PATH }),
      expect.objectContaining({ test: 'T2', kind: 'functionality', path: CSV_PATH }),
    ]);

    const second = await record(run);

    expect(second).toMatchObject({ status: 'refused', issues: [{ code: 'already-recorded' }] });
    expect(landedLines(run.runDir)).toHaveLength(2);
  });

  it('refuses to record a landing with no test to land', async () => {
    const empty = await classifiedRun([{ path: LABEL_PATH, content: VALUE_SPEC }]);
    await prepare(empty);

    expect(await record(empty)).toMatchObject({ status: 'refused', issues: [{ code: 'nothing-to-land' }] });
    expect(landedLines(empty.runDir)).toEqual([]);
  });

  it('refuses to prepare or record the landing of a finished run', async () => {
    const finished = await classifiedRun([{ path: LABEL_PATH, content: LABEL_SPEC }]);
    preparedOf(await prepare(finished));
    await finishCatchRun({ projectRoot: finished.fx.project, changesDir: finished.fx.changesDir, runId: finished.runId });

    expect(await record(finished)).toMatchObject({ status: 'refused', issues: [{ code: 'run-state' }] });
    expect(await prepare(finished)).toMatchObject({ status: 'refused', issues: [{ code: 'run-state' }] });
    expect(landedLines(finished.runDir)).toEqual([]);
  });
});

describe('catch land and catch landed commands', SLOW_RUNS, () => {
  it('catchLandCommand prints the landing as JSON and exits 0; a run that is not classified exits 1', async () => {
    const run = await classifiedRun([{ path: LABEL_PATH, content: LABEL_SPEC }]);
    process.chdir(run.fx.project);
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });

    await catchLandCommand({ run: run.runId, json: true });

    const landed = JSON.parse(lines.join('\n')) as { status: string; tests: Array<{ test: string }>; patch: string };
    expect(landed).toMatchObject({ status: 'prepared', tests: [{ test: 'T1' }] });
    expect(path.isAbsolute(landed.patch)).toBe(true);
    expect(fs.existsSync(landed.patch)).toBe(true);
    expect(process.exitCode ?? 0).toBe(0);

    lines.length = 0;
    setRunState(run.runDir, 'ready');
    await catchLandCommand({ run: run.runId, json: true });

    expect(JSON.parse(lines.join('\n'))).toMatchObject({ status: 'refused', errors: [{ code: 'run-state' }] });
    expect(process.exitCode).toBe(1);
  });

  it('catchLandedCommand records the landing once and exits 1 on a second call', async () => {
    const run = await classifiedRun([{ path: LABEL_PATH, content: LABEL_SPEC }]);
    process.chdir(run.fx.project);
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
    await catchLandCommand({ run: run.runId, json: true });
    lines.length = 0;

    await catchLandedCommand({ run: run.runId, json: true });

    expect(JSON.parse(lines.join('\n'))).toMatchObject({ status: 'recorded', landed: [{ test: 'T1' }] });
    expect(process.exitCode ?? 0).toBe(0);

    lines.length = 0;
    await catchLandedCommand({ run: run.runId, json: true });

    expect(JSON.parse(lines.join('\n'))).toMatchObject({ status: 'refused', errors: [{ code: 'already-recorded' }] });
    expect(process.exitCode).toBe(1);
  });
});
