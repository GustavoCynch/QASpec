/**
 * Tests of /qsx:catch (T8, L28, L35). The agent writes a test file; the CLI validates it, stores its content in the run
 * folder and runs the parent gates on the parent worktree. The agent never decides a gate outcome:
 *
 *   catching (a mutant judged non-equivalent): the test passes on the parent in every one of gates.parentRuns runs
 *     (no-tests never counts), then fails once on the mutated parent. Otherwise it is discarded with the outcome that
 *     stopped it: parent-not-passing, flaky-parent, not-caught-by-test or inconclusive.
 *   functionality (analysis runs) and dodgy-diff (degraded runs): the parent outcome is recorded once, without a gate.
 *     Only a timeout or a runner error makes the test inconclusive; every other outcome is gated.
 *
 * Before each run the test is written into the parent's project folder and removed after it; the mutant is applied and
 * restored the same way (catch-mutant.ts). The worktree is at the parent between steps.
 */

import { existsSync, mkdirSync, promises as fs, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findIntentRequirement, type CatchIntentArtifact } from './catch-context.js';
import type { CatchRequirement } from './catch-intent.js';
import { type CatchMutant, decodeText, replaceOnce, restoreFile, runDetail, sha256 } from './catch-mutant.js';
import {
  type CatchRecordIssue,
  type CatchRunMode,
  INTENT_FILE,
  MUTANTS_DIRNAME,
  RUNNER_OUTPUT_DIRNAME,
  TESTS_DIRNAME,
  findCatchRun,
  nextRecordId,
  projectDirInWorktree,
  readCatchRun,
  readRecord,
  readRunJson,
  requireReadyRun,
  withRunLockAsync,
  writeRecord,
} from './catch-run.js';
import {
  type ProjectFolder,
  type RunOutcome,
  type RunResult,
  type RunnerContext,
  type TestRunnerAdapter,
  createRunnerContext,
  openProjectFolder,
  resolveProjectPaths,
  runnerFor,
} from './catch-runner.js';
import { readProjectConfig } from './project-config.js';
import { RUN_LOCK_TIMEOUT_MS, appendLedgerEntry, nowIso, writeFileAtomic } from './run-store.js';

export const CATCH_TEST_SCHEMA = 'qaspec.catch-test/v1' as const;

const TEST_COMMAND = 'qaspec catch test';
const TEST_KINDS: readonly string[] = ['catching', 'functionality', 'dodgy-diff'];
/** The fields a test file may carry, by kind. Any other field is refused. */
const TEST_FIELDS: Record<CatchTestKind, readonly string[]> = {
  catching: ['kind', 'mutant', 'path', 'content'],
  functionality: ['kind', 'requirement', 'scenario', 'path', 'content'],
  'dodgy-diff': ['kind', 'path', 'content'],
};
/** The statuses a functionality test may cover: behavior the PR adds or changes. */
const FUNCTIONALITY_STATUSES: readonly string[] = ['added', 'modified'];
const MUTANT_ID = /^M[1-9]\d*$/;

export type CatchTestKind = 'catching' | 'functionality' | 'dodgy-diff';

/** The outcome of the parent gates: gated tests go to the child phase; the others are discarded. */
export type CatchTestGate = 'gated' | 'parent-not-passing' | 'flaky-parent' | 'not-caught-by-test' | 'inconclusive';

export interface CatchTest {
  schema: typeof CATCH_TEST_SCHEMA;
  id: string;
  kind: CatchTestKind;
  /** The judged non-equivalent mutant a catching test must catch (M1, ...). */
  mutant?: string;
  /** The added or modified requirement a functionality test covers. */
  requirement?: string;
  scenario?: string;
  /** Project-relative path of the test file. */
  path: string;
  /** Run-folder relative path of the stored content. */
  content: string;
  contentSha256: string;
  outcome: CatchTestGate;
  reason: string;
  /** Parent runs: every run of a catching test, the single run of the other kinds. */
  parentOutcomes: RunOutcome[];
  /** The run of a catching test on the mutated parent; null for the other kinds. */
  mutantOutcome: RunOutcome | null;
  /** The adapter's bounded words on the run that decided the gate, when that run did not pass. */
  detail?: string;
  createdAt: string;
}

export interface RecordTestInput {
  projectRoot: string;
  changesDir: string;
  runId: string;
  /** The parsed test file: the caller read it with readJsonInput. */
  value: unknown;
  lockTimeoutMs?: number;
}

export type RecordTestOutcome = { ok: true; test: CatchTest } | { ok: false; issues: CatchRecordIssue[] };

/** The verdict of the gates of one test, as the record keeps it. */
interface GateVerdict {
  outcome: CatchTestGate;
  reason: string;
  parentOutcomes: RunOutcome[];
  mutantOutcome: RunOutcome | null;
  detail?: string;
}

/** A detail as a record property: present only when the run said something that did not pass. */
const withDetail = (detail: string | undefined): { detail?: string } => (detail === undefined ? {} : { detail });

type JsonObject = Record<string, unknown>;

/** The fields a test file names, as far as they could be read. */
interface TestFields {
  kind?: CatchTestKind;
  path?: string;
  content?: string;
  mutant?: string;
  /** The judged mutant the file names, read from its record. */
  mutantRecord?: CatchMutant;
  requirement?: string;
  scenario?: string;
}

interface RecordContext {
  mode: CatchRunMode;
  intent: CatchIntentArtifact;
  mutantsDir: string;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const nonBlank = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

const isInconclusive = (outcome: RunOutcome): boolean => outcome === 'timeout' || outcome === 'runner-error';

/** The one requirement with this name when it is an added or modified requirement of the intent. */
function findFunctionalityRequirement(
  intent: CatchIntentArtifact,
  name: string
): { ok: true; requirement: CatchRequirement } | { ok: false; issue: CatchRecordIssue } {
  const found = findIntentRequirement(intent, name, 'test');
  if (!found.ok) {
    return found;
  }
  if (!FUNCTIONALITY_STATUSES.includes(found.requirement.status)) {
    return {
      ok: false,
      issue: {
        code: 'requirement-status',
        message: `"${name}" is ${found.requirement.status}: a functionality test covers an added or modified requirement.`,
      },
    };
  }
  return { ok: true, requirement: found.requirement };
}

/** The kind-specific fields of a catching test: a judged non-equivalent mutant of this run. */
function checkCatching(value: JsonObject, context: RecordContext, fields: TestFields, issues: CatchRecordIssue[]): void {
  const mutant = nonBlank(value.mutant);
  if (mutant === undefined || !MUTANT_ID.test(mutant)) {
    issues.push({ code: 'mutant-required', message: 'A catching test names the mutant it must catch: mutant is an id such as M1.' });
    return;
  }
  const record = readRecord<CatchMutant>(context.mutantsDir, mutant);
  if (record === undefined) {
    issues.push({ code: 'mutant-unknown', message: `${mutant} is not a mutant of this run.` });
    return;
  }
  if (record.outcome !== 'non-equivalent') {
    issues.push({
      code: 'mutant-not-non-equivalent',
      message: `${mutant} is ${record.outcome}: a catching test needs a mutant judged non-equivalent (qaspec catch equivalence).`,
    });
    return;
  }
  fields.mutant = mutant;
  fields.mutantRecord = record;
}

/** The kind-specific fields of a functionality test: an added or modified requirement, and a scenario of it. */
function checkFunctionality(value: JsonObject, context: RecordContext, fields: TestFields, issues: CatchRecordIssue[]): void {
  const name = nonBlank(value.requirement);
  if (name === undefined) {
    issues.push({
      code: 'requirement-required',
      message: 'A functionality test names an added or modified requirement of the intent: requirement is its name.',
    });
    return;
  }
  const found = findFunctionalityRequirement(context.intent, name);
  if (!found.ok) {
    issues.push(found.issue);
    return;
  }
  fields.requirement = name;
  if ('scenario' in value) {
    const title = nonBlank(value.scenario);
    if (title === undefined) {
      issues.push({ code: 'scenario-invalid', message: 'scenario must be the non-empty title of a scenario.' });
    } else if (!found.requirement.scenarios.some((scenario) => scenario.title === title)) {
      issues.push({ code: 'scenario-unknown', message: `"${title}" is not a scenario of "${name}".` });
    } else {
      fields.scenario = title;
    }
  }
}

/**
 * Validates the parsed test file without touching the worktree: the kind, the fields it allows, the mode, the mutant
 * or the requirement, and the content. Every problem is listed; the path is checked on the parent afterwards.
 */
function checkTestValue(value: unknown, context: RecordContext): { issues: CatchRecordIssue[]; fields: TestFields } {
  if (!isObject(value)) {
    return { issues: [{ code: 'input-not-object', message: 'The test file must hold one JSON object.' }], fields: {} };
  }
  const kind = value.kind;
  if (typeof kind !== 'string' || !TEST_KINDS.includes(kind)) {
    return { issues: [{ code: 'kind-invalid', message: 'kind must be catching, functionality or dodgy-diff.' }], fields: {} };
  }
  const testKind = kind as CatchTestKind;
  const fields: TestFields = { kind: testKind };
  const allowed = TEST_FIELDS[testKind];
  const issues: CatchRecordIssue[] = Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map((key) => ({
      code: 'unknown-field',
      message: `"${key}" is not a field of a ${testKind} test; the fields are ${allowed.join(', ')}.`,
    }));

  const degraded = context.mode === 'without-analysis';
  if (testKind === 'functionality' && degraded) {
    issues.push({
      code: 'kind-mode',
      message: 'A functionality test needs an analysis run: this run is degraded (no approved intent), so write dodgy-diff tests.',
    });
  } else if (testKind === 'dodgy-diff' && !degraded) {
    issues.push({
      code: 'kind-mode',
      message: 'A dodgy-diff test is for the degraded mode (--without-analysis) only; this run is an analysis run.',
    });
  } else if (testKind === 'catching') {
    checkCatching(value, context, fields, issues);
  } else if (testKind === 'functionality') {
    checkFunctionality(value, context, fields, issues);
  }

  fields.path = nonBlank(value.path);
  if (fields.path === undefined) {
    issues.push({ code: 'path-invalid', message: 'path must be the project-relative path of the test file.' });
  }
  fields.content = typeof value.content === 'string' && value.content.trim() !== '' ? value.content : undefined;
  if (fields.content === undefined) {
    issues.push({ code: 'content-missing', message: 'content must be the non-empty text of the test file.' });
  }
  return { issues, fields };
}

/**
 * The first folder above the path that exists and is a file, or undefined when every existing folder above it is a
 * folder: a test cannot be written under a file.
 */
async function fileAbove(absolute: string, projectReal: string): Promise<string | undefined> {
  for (let dir = path.dirname(absolute); dir !== projectReal && dir.startsWith(projectReal); dir = path.dirname(dir)) {
    const stat = await fs.stat(dir).catch(() => undefined);
    if (stat !== undefined) {
      return stat.isDirectory() ? undefined : dir;
    }
  }
  return undefined;
}

/**
 * Where a project-relative test path may be written in a project folder: inside it (symlinks followed, a name that does
 * not exist yet included) and under folders only. The parent gates check it on the parent; the child phase checks it
 * again on the head before it writes there, because the head may link a folder of the project outside it.
 */
export async function testPlacement(
  folder: ProjectFolder,
  testPath: string
): Promise<{ ok: true; relative: string; absolute: string } | { ok: false; message: string }> {
  let relative: string;
  try {
    [relative] = await resolveProjectPaths(folder, [testPath]);
  } catch (error) {
    return { ok: false, message: errorText(error) };
  }
  const absolute = path.join(folder.real, ...relative.split('/'));
  const blocker = await fileAbove(absolute, folder.real);
  if (blocker !== undefined) {
    const above = path.relative(folder.real, blocker).split(path.sep).join('/');
    return { ok: false, message: `${relative} lies under ${above}, which is a file, not a folder.` };
  }
  return { ok: true, relative, absolute };
}

/** The project-relative path of a new test file: inside the project, under folders, and absent on the parent. */
async function checkTestPath(
  folder: ProjectFolder,
  testPath: string
): Promise<{ ok: true; relative: string } | { ok: false; issue: CatchRecordIssue }> {
  const placed = await testPlacement(folder, testPath);
  if (!placed.ok) {
    return { ok: false, issue: { code: 'path-invalid', message: placed.message } };
  }
  const exists = await fs.lstat(placed.absolute).then(
    () => true,
    () => false
  );
  if (exists) {
    return { ok: false, issue: { code: 'path-exists', message: `${placed.relative} exists on the parent: a catch test is a new file.` } };
  }
  return { ok: true, relative: placed.relative };
}

/** A mutant applied to its parent file: the file, its original bytes, and the mutated text. */
interface MutantApplication {
  target: string;
  original: Buffer;
  mutated: string;
}

/**
 * The parent file of a judged mutant with the mutant applied. Refuses a file that is no longer the one the mutant was
 * written against (its hash), so a test never runs against text the mutant was not recorded for.
 */
async function applyMutantToParent(
  folder: ProjectFolder,
  mutant: CatchMutant
): Promise<{ ok: true; application: MutantApplication } | { ok: false; issue: CatchRecordIssue }> {
  let relative: string;
  try {
    [relative] = await resolveProjectPaths(folder, [mutant.file]);
  } catch (error) {
    return { ok: false, issue: { code: 'mutant-file-refused', message: errorText(error) } };
  }
  const target = path.join(folder.real, ...relative.split('/'));
  let original: Buffer;
  try {
    original = readFileSync(target);
  } catch {
    return { ok: false, issue: { code: 'mutant-file-missing', message: `${relative} does not exist in the parent.` } };
  }
  if (sha256(original) !== mutant.parentSha256) {
    return {
      ok: false,
      issue: { code: 'mutant-stale', message: `${relative} changed since ${mutant.id} was recorded: start a new run.` },
    };
  }
  const text = decodeText(original);
  if (text === undefined) {
    return { ok: false, issue: { code: 'file-not-text', message: `${relative} is not UTF-8 text.` } };
  }
  return { ok: true, application: { target, original, mutated: replaceOnce(text, mutant.original, mutant.replacement) } };
}

/**
 * Writes a test file into a project folder for one run and returns the function that removes it again, along with the
 * folders the write had to create. A file that already exists is never overwritten; a failed write takes back only
 * the folders it created.
 */
function placeTestFile(projectDir: string, relative: string, bytes: Buffer): () => void {
  const target = path.join(projectDir, ...relative.split('/'));
  const created: string[] = [];
  const removeCreated = (): void => {
    for (const dir of [...created].reverse()) {
      try {
        rmdirSync(dir);
      } catch {
        // Not empty: something else is in it, so the folder stays.
      }
    }
  };
  try {
    const missing: string[] = [];
    for (let dir = path.dirname(target); !existsSync(dir); dir = path.dirname(dir)) {
      missing.unshift(dir);
    }
    for (const dir of missing) {
      mkdirSync(dir);
      created.push(dir);
    }
    writeFileSync(target, bytes, { flag: 'wx' });
  } catch (error) {
    removeCreated();
    throw error;
  }
  return (): void => {
    rmSync(target, { force: true });
    removeCreated();
  };
}

export interface PlacedTestRun {
  adapter: TestRunnerAdapter;
  ctx: RunnerContext;
  /** The real path of the project folder the file is written into. */
  projectReal: string;
  relative: string;
  bytes: Buffer;
}

/**
 * One run of a test file: it is written into the project folder, run through the adapter, and removed again, whatever
 * the run did. A test that cannot be written, and an error of the adapter, are runner errors: never a pass, and never
 * an exception that would leave a phase half done.
 */
export async function runPlacedTest(input: PlacedTestRun): Promise<RunResult> {
  let remove: (() => void) | undefined;
  try {
    remove = placeTestFile(input.projectReal, input.relative, input.bytes);
    return await input.adapter.run(input.ctx, [input.relative]);
  } catch (error) {
    return { outcome: 'runner-error', files: [], durationMs: 0, reason: errorText(error), outputTail: '' };
  } finally {
    remove?.();
  }
}

/**
 * The gates of a catching test: every parent run must pass, then one run on the mutated parent must fail. The mutant is
 * restored in every case. A timeout or a runner error ends the gate as inconclusive at once.
 */
async function gateCatchingTest(
  runTest: () => Promise<RunResult>,
  parentRuns: number,
  mutant: MutantApplication
): Promise<GateVerdict> {
  const parentOutcomes: RunOutcome[] = [];
  // The words of the first parent run that did not pass: the one that says why the parent is not passing.
  let parentDetail: string | undefined;
  for (let run = 0; run < parentRuns; run++) {
    const result = await runTest();
    parentOutcomes.push(result.outcome);
    parentDetail ??= runDetail(result);
    if (isInconclusive(result.outcome)) {
      return {
        outcome: 'inconclusive',
        reason: `A parent run ended with ${result.outcome}.`,
        parentOutcomes,
        mutantOutcome: null,
        ...withDetail(runDetail(result)),
      };
    }
  }
  if (!parentOutcomes.every((outcome) => outcome === 'pass')) {
    const [first] = parentOutcomes;
    return parentOutcomes.every((outcome) => outcome === first)
      ? {
          outcome: 'parent-not-passing',
          reason: `Every parent run ended with ${first}: a catching test must pass on the parent.`,
          parentOutcomes,
          mutantOutcome: null,
          ...withDetail(parentDetail),
        }
      : {
          outcome: 'flaky-parent',
          reason: 'The parent runs disagree: a catching test must pass on every run.',
          parentOutcomes,
          mutantOutcome: null,
          ...withDetail(parentDetail),
        };
  }

  let result: RunResult;
  try {
    writeFileSync(mutant.target, mutant.mutated);
    result = await runTest();
  } finally {
    restoreFile(mutant.target, mutant.original);
  }
  if (result.outcome === 'fail') {
    return {
      outcome: 'gated',
      reason: 'Passes on the parent every run and fails on the mutated parent.',
      parentOutcomes,
      mutantOutcome: result.outcome,
      ...withDetail(runDetail(result)),
    };
  }
  if (isInconclusive(result.outcome)) {
    return {
      outcome: 'inconclusive',
      reason: `The mutant run ended with ${result.outcome}.`,
      parentOutcomes,
      mutantOutcome: result.outcome,
      ...withDetail(runDetail(result)),
    };
  }
  return {
    outcome: 'not-caught-by-test',
    reason: `The test ${result.outcome} on the mutated parent: the mutant is not caught.`,
    parentOutcomes,
    mutantOutcome: result.outcome,
    ...withDetail(runDetail(result)),
  };
}

/** The gate of a functionality or dodgy-diff test: the parent outcome, recorded once. */
async function gateRecordedTest(runTest: () => Promise<RunResult>): Promise<GateVerdict> {
  const result = await runTest();
  if (isInconclusive(result.outcome)) {
    return {
      outcome: 'inconclusive',
      reason: `The parent run ended with ${result.outcome}.`,
      parentOutcomes: [result.outcome],
      mutantOutcome: null,
      ...withDetail(runDetail(result)),
    };
  }
  return {
    outcome: 'gated',
    reason: `Recorded on the parent: ${result.outcome}.`,
    parentOutcomes: [result.outcome],
    mutantOutcome: null,
    ...withDetail(runDetail(result)),
  };
}

/**
 * Records one test from its parsed file and runs its parent gates. A refused test writes nothing and lists every
 * problem it found. A recorded test is stored with its content and ledger line, whatever its gate outcome.
 */
export async function recordTest(input: RecordTestInput): Promise<RecordTestOutcome> {
  const location = findCatchRun(input.changesDir, input.runId);
  return withRunLockAsync(
    location.runDir,
    input.lockTimeoutMs ?? RUN_LOCK_TIMEOUT_MS,
    async (): Promise<RecordTestOutcome> => {
      const run = readCatchRun(location.runDir);
      requireReadyRun(run, TEST_COMMAND);
      const testsDir = path.join(location.runDir, TESTS_DIRNAME);
      const mutantsDir = path.join(location.runDir, MUTANTS_DIRNAME);
      const intent = readRunJson<CatchIntentArtifact>(location.runDir, INTENT_FILE);
      const checked = checkTestValue(input.value, { mode: run.mode, intent, mutantsDir });
      const { adapter, config } = runnerFor(readProjectConfig(input.projectRoot)?.catch);
      const projectDir = await projectDirInWorktree(input.projectRoot, run);
      const folder = await openProjectFolder(projectDir);

      const issues = [...checked.issues];
      const { fields } = checked;
      let relative: string | undefined;
      if (fields.path !== undefined) {
        const checkedPath = await checkTestPath(folder, fields.path);
        if (checkedPath.ok) {
          relative = checkedPath.relative;
        } else {
          issues.push(checkedPath.issue);
        }
      }
      let application: MutantApplication | undefined;
      if (fields.mutantRecord !== undefined) {
        const applied = await applyMutantToParent(folder, fields.mutantRecord);
        if (applied.ok) {
          application = applied.application;
        } else {
          issues.push(applied.issue);
        }
      }
      const { kind, content } = fields;
      if (issues.length > 0 || kind === undefined || relative === undefined || content === undefined) {
        return { ok: false, issues };
      }
      const testPath = relative;

      const id = nextRecordId(testsDir, 'T');
      const contentName = path.posix.basename(testPath);
      const contentFile = path.join(testsDir, id, contentName);
      mkdirSync(path.dirname(contentFile), { recursive: true });
      writeFileAtomic(contentFile, content);
      const bytes = Buffer.from(content, 'utf8');

      const ctx = createRunnerContext(config, {
        projectDir,
        scratchDir: path.join(location.runDir, RUNNER_OUTPUT_DIRNAME),
      });
      const runTest = (): Promise<RunResult> =>
        runPlacedTest({ adapter, ctx, projectReal: folder.real, relative: testPath, bytes });
      // Only a catching test names a mutant, so only it has an application to gate.
      const verdict =
        application === undefined
          ? await gateRecordedTest(runTest)
          : await gateCatchingTest(runTest, config.gates.parentRuns, application);

      const createdAt = nowIso();
      const test: CatchTest = {
        schema: CATCH_TEST_SCHEMA,
        id,
        kind,
        ...(fields.mutant === undefined ? {} : { mutant: fields.mutant }),
        ...(fields.requirement === undefined ? {} : { requirement: fields.requirement }),
        ...(fields.scenario === undefined ? {} : { scenario: fields.scenario }),
        path: testPath,
        content: `${TESTS_DIRNAME}/${id}/${contentName}`,
        contentSha256: sha256(bytes),
        ...verdict,
        createdAt,
      };
      writeRecord(testsDir, id, test);
      appendLedgerEntry(location.runDir, {
        stage: 'test',
        at: createdAt,
        test: id,
        kind: test.kind,
        outcome: test.outcome,
        parentOutcomes: test.parentOutcomes,
        mutantOutcome: test.mutantOutcome,
        ...(test.mutant === undefined ? {} : { mutant: test.mutant }),
      });
      return { ok: true, test };
    }
  );
}
