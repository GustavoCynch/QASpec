/**
 * Mutants and equivalence verdicts of /qsx:catch (T7, L28, S5, S6). A mutant replaces one exact text of a file of
 * the parent. The gates run here, in order, and each outcome is recorded; the agent never decides one:
 *
 *   1. The comparable forms of the parent and the mutant (the adapter's normalizeSource) are equal:
 *      syntactic-equivalent. Discarded; nothing runs.
 *   2. The mutant is applied in the parent's worktree and the existing tests related to its file run through the
 *      adapter. The file is restored byte for byte afterwards, whatever happened. no-build and caught-by-existing
 *      are discarded. surviving: no related test, or the tests passed or executed nothing. inconclusive: timeout,
 *      runner error or a failed lookup. An inconclusive mutant is never a surviving one.
 *
 * A surviving mutant waits for a fresh-context verdict (qaspec catch equivalence): equivalent discards it
 * (judged-equivalent); not equivalent leaves it non-equivalent for the test stage.
 */

import { createHash } from 'node:crypto';
import { promises as fs, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import type { CatchRisk } from './catch-context.js';
import {
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
import type { ResolvedCatchConfig } from './catch-config.js';
import {
  CATCH_COMMAND,
  type CatchRecordIssue,
  MUTANTS_DIRNAME,
  RISKS_DIRNAME,
  RUNNER_OUTPUT_DIRNAME,
  findCatchRun,
  nextRecordId,
  projectDirInWorktree,
  readCatchRun,
  readRecord,
  requireReadyRun,
  withRunLockAsync,
  writeRecord,
} from './catch-run.js';
import { RUN_LOCK_TIMEOUT_MS, appendLedgerEntry, nowIso, withRunLock } from './run-store.js';

export const MUTANT_SCHEMA = 'qaspec.catch-mutant/v1' as const;

const MUTANT_COMMAND = 'qaspec catch mutant';
const EQUIVALENCE_COMMAND = 'qaspec catch equivalence';
const MUTANT_FIELDS: readonly string[] = ['risk', 'file', 'original', 'replacement'];
const VERDICT_FIELDS: readonly string[] = ['equivalent', 'rationale'];
const RISK_ID = /^R[1-9]\d*$/;
const MUTANT_ID = /^M[1-9]\d*$/;

export type MutantOutcome =
  | 'syntactic-equivalent'
  | 'no-build'
  | 'caught-by-existing'
  | 'surviving'
  | 'inconclusive'
  | 'judged-equivalent'
  | 'non-equivalent';

export interface CatchMutant {
  schema: typeof MUTANT_SCHEMA;
  id: string;
  risk: string;
  /** Project-relative file of the parent. */
  file: string;
  original: string;
  replacement: string;
  /** SHA-256 of the parent's file bytes the mutant was written against. */
  parentSha256: string;
  outcome: MutantOutcome;
  reason: string;
  /** The existing tests the gate ran, project-relative; empty when no test ran. */
  relatedTests: string[];
  /** What the test run reported; null when no test ran. */
  runOutcome: RunOutcome | null;
  equivalence?: { equivalent: boolean; rationale: string; judgedAt: string };
  createdAt: string;
}

export interface RecordMutantInput {
  projectRoot: string;
  changesDir: string;
  runId: string;
  /** The parsed mutant file: the caller read it with readJsonInput. */
  value: unknown;
  lockTimeoutMs?: number;
}

export type RecordMutantOutcome = { ok: true; mutant: CatchMutant } | { ok: false; issues: CatchRecordIssue[] };

export interface RecordEquivalenceInput {
  changesDir: string;
  runId: string;
  mutant: string;
  /** The parsed verdict: { equivalent, rationale }. */
  value: unknown;
  lockTimeoutMs?: number;
}

export type RecordEquivalenceOutcome = { ok: true; mutant: CatchMutant } | { ok: false; issues: CatchRecordIssue[] };

type JsonObject = Record<string, unknown>;

interface GateResult {
  outcome: MutantOutcome;
  reason: string;
  relatedTests: string[];
  runOutcome: RunOutcome | null;
}

interface MutantFields {
  risk: string;
  file: string;
  original: string;
  replacement: string;
}

type MutantCheck = { ok: true; fields: MutantFields } | { ok: false; issues: CatchRecordIssue[] };

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** The file as text, with a byte order mark kept as a character so that writing it back restores its bytes. */
function decodeText(bytes: Buffer): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** Occurrences of needle in text, overlapping ones included: "exactly once" must not be fooled by an overlap. */
function countOccurrences(text: string, needle: string): number {
  let count = 0;
  for (let index = text.indexOf(needle); index !== -1; index = text.indexOf(needle, index + 1)) {
    count++;
  }
  return count;
}

async function isFile(file: string): Promise<boolean> {
  return fs.stat(file).then(
    (stat) => stat.isFile(),
    () => false
  );
}

function checkMutantValue(value: unknown): MutantCheck {
  if (!isObject(value)) {
    return { ok: false, issues: [{ code: 'input-not-object', message: 'The mutant file must hold one JSON object.' }] };
  }
  const issues: CatchRecordIssue[] = Object.keys(value)
    .filter((key) => !MUTANT_FIELDS.includes(key))
    .map((key) => ({
      code: 'unknown-field',
      message: `"${key}" is not a mutant field; the fields are ${MUTANT_FIELDS.join(', ')}.`,
    }));
  const risk = typeof value.risk === 'string' && RISK_ID.test(value.risk) ? value.risk : undefined;
  if (risk === undefined) {
    issues.push({ code: 'input-invalid', message: 'risk must be the id of a risk of this run, such as R1.' });
  }
  const file = typeof value.file === 'string' && value.file.trim() !== '' ? value.file.trim() : undefined;
  if (file === undefined) {
    issues.push({ code: 'input-invalid', message: 'file must be a non-empty project-relative path.' });
  }
  const original = typeof value.original === 'string' && value.original !== '' ? value.original : undefined;
  if (original === undefined) {
    issues.push({ code: 'input-invalid', message: 'original must be a non-empty string: the exact text to replace.' });
  }
  const replacement = typeof value.replacement === 'string' ? value.replacement : undefined;
  if (replacement === undefined) {
    issues.push({ code: 'input-invalid', message: 'replacement must be a string; use "" to delete the original.' });
  }
  if (issues.length > 0 || risk === undefined || file === undefined || original === undefined || replacement === undefined) {
    return { ok: false, issues };
  }
  return { ok: true, fields: { risk, file, original, replacement } };
}

/** Maps the outcome of a test run on the mutant to a gate result. Only a pass that executed a test survives. */
function gateOf(run: RunResult, tests: string[]): GateResult {
  switch (run.outcome) {
    case 'pass':
      return {
        outcome: 'surviving',
        reason: 'Every related existing test passes on the mutant.',
        relatedTests: tests,
        runOutcome: run.outcome,
      };
    case 'fail':
      return {
        outcome: 'caught-by-existing',
        reason: 'A related existing test fails on the mutant.',
        relatedTests: tests,
        runOutcome: run.outcome,
      };
    case 'no-build':
      return { outcome: 'no-build', reason: 'The mutant does not build.', relatedTests: tests, runOutcome: run.outcome };
    case 'no-tests':
      return {
        outcome: 'surviving',
        reason: 'The related tests execute no test on the mutant.',
        relatedTests: tests,
        runOutcome: run.outcome,
      };
    default:
      return {
        outcome: 'inconclusive',
        reason: run.reason ?? `The test run ended with ${run.outcome}.`,
        relatedTests: tests,
        runOutcome: run.outcome,
      };
  }
}

/** Writes the original bytes back and proves they are back: a run never leaves the parent changed. */
function restoreFile(target: string, original: Buffer): void {
  writeFileSync(target, original);
  if (!readFileSync(target).equals(original)) {
    throw new Error(`Could not restore ${target} in the catch worktree: run qaspec catch finish and start a new run.`);
  }
}

interface MutantRunInput {
  adapter: TestRunnerAdapter;
  config: ResolvedCatchConfig;
  projectDir: string;
  scratchDir: string;
  target: string;
  relative: string;
  original: Buffer;
  mutated: string;
}

/**
 * Gate 2: applies the mutant, runs the existing tests related to its file on the mutated parent, and restores the
 * file in every case. An error of the adapter is an inconclusive result, never a surviving one.
 */
async function runAgainstMutant(input: MutantRunInput): Promise<GateResult> {
  const ctx: RunnerContext = createRunnerContext(input.config, {
    projectDir: input.projectDir,
    scratchDir: input.scratchDir,
  });
  let tests: string[] = [];
  let gate: GateResult;
  try {
    writeFileSync(input.target, input.mutated);
    tests = await input.adapter.relatedTests(ctx, [input.relative]);
    gate =
      tests.length === 0
        ? { outcome: 'surviving', reason: 'No existing test relates to the file.', relatedTests: [], runOutcome: null }
        : gateOf(await input.adapter.run(ctx, tests), tests);
  } catch (error) {
    gate = { outcome: 'inconclusive', reason: errorText(error), relatedTests: tests, runOutcome: null };
  } finally {
    restoreFile(input.target, input.original);
  }
  return gate;
}

/**
 * Records one mutant and runs its gates, in order. A refused mutant (a bad field, an unknown risk, a file outside the
 * parent, an original that does not occur exactly once) writes nothing and lists every problem it found.
 */
export async function recordMutant(input: RecordMutantInput): Promise<RecordMutantOutcome> {
  const location = findCatchRun(input.changesDir, input.runId);
  return withRunLockAsync(
    location.runDir,
    input.lockTimeoutMs ?? RUN_LOCK_TIMEOUT_MS,
    async (): Promise<RecordMutantOutcome> => {
      const run = readCatchRun(location.runDir);
      requireReadyRun(run, MUTANT_COMMAND);
      const checked = checkMutantValue(input.value);
      if (!checked.ok) {
        return { ok: false, issues: checked.issues };
      }
      const { risk, file, original, replacement } = checked.fields;
      const risksDir = path.join(location.runDir, RISKS_DIRNAME);
      const mutantsDir = path.join(location.runDir, MUTANTS_DIRNAME);
      const { adapter, config } = runnerFor(readProjectConfig(input.projectRoot)?.catch);
      const projectDir = projectDirInWorktree(input.projectRoot, run);
      const folder = await openProjectFolder(projectDir);

      const issues: CatchRecordIssue[] = [];
      if (readRecord<CatchRisk>(risksDir, risk) === undefined) {
        issues.push({ code: 'risk-unknown', message: `${risk} is not a risk of this run: record it with qaspec catch risk.` });
      }
      let relative: string | undefined;
      try {
        [relative] = await resolveProjectPaths(folder, [file]);
      } catch (error) {
        issues.push({ code: 'file-refused', message: errorText(error) });
      }
      if (relative === undefined) {
        return { ok: false, issues };
      }
      const target = path.join(folder.real, ...relative.split('/'));
      if (!(await isFile(target))) {
        issues.push({ code: 'file-missing', message: `${relative} does not exist in the parent.` });
      }
      if (issues.length > 0) {
        return { ok: false, issues };
      }

      const bytes = readFileSync(target);
      const text = decodeText(bytes);
      if (text === undefined) {
        return { ok: false, issues: [{ code: 'file-not-text', message: `${relative} is not UTF-8 text.` }] };
      }
      const occurrences = countOccurrences(text, original);
      if (occurrences !== 1) {
        issues.push({
          code: 'original-count',
          message: `"original" occurs ${occurrences} times in ${relative}; it must occur exactly once.`,
        });
      }
      if (original === replacement) {
        issues.push({ code: 'no-change', message: 'replacement equals original: the mutant changes nothing.' });
      }
      if (issues.length > 0) {
        return { ok: false, issues };
      }

      const index = text.indexOf(original);
      const mutated = `${text.slice(0, index)}${replacement}${text.slice(index + original.length)}`;
      const id = nextRecordId(mutantsDir, 'M');
      const gate: GateResult =
        adapter.normalizeSource(relative, text) === adapter.normalizeSource(relative, mutated)
          ? {
              outcome: 'syntactic-equivalent',
              reason: 'The mutant differs from the parent only in comments or whitespace.',
              relatedTests: [],
              runOutcome: null,
            }
          : await runAgainstMutant({
              adapter,
              config,
              projectDir,
              scratchDir: path.join(location.runDir, RUNNER_OUTPUT_DIRNAME),
              target,
              relative,
              original: bytes,
              mutated,
            });

      const createdAt = nowIso();
      const mutant: CatchMutant = {
        schema: MUTANT_SCHEMA,
        id,
        risk,
        file: relative,
        original,
        replacement,
        parentSha256: sha256(bytes),
        ...gate,
        createdAt,
      };
      writeRecord(mutantsDir, id, mutant);
      appendLedgerEntry(location.runDir, {
        stage: 'mutant',
        at: createdAt,
        mutant: id,
        risk,
        file: relative,
        outcome: mutant.outcome,
      });
      return { ok: true, mutant };
    }
  );
}

type VerdictCheck = { ok: true; equivalent: boolean; rationale: string } | { ok: false; issues: CatchRecordIssue[] };

function checkVerdict(value: unknown): VerdictCheck {
  if (!isObject(value)) {
    return { ok: false, issues: [{ code: 'input-not-object', message: 'The verdict file must hold one JSON object.' }] };
  }
  const issues: CatchRecordIssue[] = Object.keys(value)
    .filter((key) => !VERDICT_FIELDS.includes(key))
    .map((key) => ({
      code: 'unknown-field',
      message: `"${key}" is not a verdict field; the fields are ${VERDICT_FIELDS.join(', ')}.`,
    }));
  const equivalent = value.equivalent;
  if (typeof equivalent !== 'boolean') {
    issues.push({ code: 'equivalent-invalid', message: 'equivalent must be true or false.' });
  }
  const rationale = typeof value.rationale === 'string' && value.rationale.trim() !== '' ? value.rationale.trim() : undefined;
  if (rationale === undefined) {
    issues.push({ code: 'rationale-missing', message: 'rationale must say why the mutant is or is not equivalent.' });
  }
  if (issues.length > 0 || typeof equivalent !== 'boolean' || rationale === undefined) {
    return { ok: false, issues };
  }
  return { ok: true, equivalent, rationale };
}

/**
 * Records the fresh-context verdict on a surviving mutant, once. equivalent discards it (judged-equivalent); a verdict
 * of not equivalent makes it non-equivalent, eligible for the test stage.
 */
export function recordEquivalence(input: RecordEquivalenceInput): RecordEquivalenceOutcome {
  const location = findCatchRun(input.changesDir, input.runId);
  return withRunLock(
    location.runDir,
    (): RecordEquivalenceOutcome => {
      const run = readCatchRun(location.runDir);
      requireReadyRun(run, EQUIVALENCE_COMMAND);
      if (!MUTANT_ID.test(input.mutant)) {
        return { ok: false, issues: [{ code: 'mutant-id-invalid', message: `"${input.mutant}" is not a mutant id, such as M1.` }] };
      }
      const mutantsDir = path.join(location.runDir, MUTANTS_DIRNAME);
      const mutant = readRecord<CatchMutant>(mutantsDir, input.mutant);
      if (mutant === undefined) {
        return { ok: false, issues: [{ code: 'mutant-unknown', message: `${input.mutant} is not a mutant of this run.` }] };
      }
      const verdict = checkVerdict(input.value);
      if (!verdict.ok) {
        return { ok: false, issues: verdict.issues };
      }
      if (mutant.outcome !== 'surviving') {
        return {
          ok: false,
          issues: [
            {
              code: 'not-surviving',
              message: `${mutant.id} is ${mutant.outcome}: only a surviving mutant is judged, and only once.`,
            },
          ],
        };
      }
      const judgedAt = nowIso();
      const judged: CatchMutant = {
        ...mutant,
        outcome: verdict.equivalent ? 'judged-equivalent' : 'non-equivalent',
        equivalence: { equivalent: verdict.equivalent, rationale: verdict.rationale, judgedAt },
      };
      writeRecord(mutantsDir, judged.id, judged);
      appendLedgerEntry(location.runDir, {
        stage: 'equivalence',
        at: judgedAt,
        mutant: judged.id,
        equivalent: verdict.equivalent,
        outcome: judged.outcome,
      });
      return { ok: true, mutant: judged };
    },
    { command: CATCH_COMMAND, timeoutMs: input.lockTimeoutMs ?? RUN_LOCK_TIMEOUT_MS }
  );
}
