/**
 * Context and risks of /qsx:catch (T7, L28): what the agent reads before it writes risks, mutants and tests, and the
 * risks it records against the run's intent. The context reads the run's frozen artifacts (intent.json,
 * changed-files.json, diff.patch). The related existing tests are computed once, on the parent worktree, and cached
 * in the run folder. Every step that writes takes the run lock.
 */

import { existsSync, promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ChangedFile } from './catch-git.js';
import type { CatchCapability, CatchIntent, CatchRequirement, IntentClass } from './catch-intent.js';
import { createRunnerContext, runnerFor } from './catch-runner.js';
import { readProjectConfig } from './project-config.js';
import type { CatchRecordIssue, CatchRunMode, CatchRunRecord } from './catch-run.js';
import {
  CHANGED_FILES_FILE,
  DIFF_FILE,
  INTENT_FILE,
  RELATED_TESTS_FILE,
  RISKS_DIRNAME,
  RUNNER_OUTPUT_DIRNAME,
  findCatchRun,
  nextRecordId,
  projectDirInWorktree,
  readCatchRun,
  readRunJson,
  requireReadyRun,
  withCatchRunLock,
  withRunLockAsync,
  writeRecord,
  writeRunJson,
} from './catch-run.js';
import { RUN_LOCK_TIMEOUT_MS, appendLedgerEntry, nowIso } from './run-store.js';

export const CATCH_CONTEXT_SCHEMA = 'qaspec.catch-context/v1' as const;
export const CATCH_RISK_SCHEMA = 'qaspec.catch-risk/v1' as const;
export const RELATED_TESTS_SCHEMA = 'qaspec.catch-related-tests/v1' as const;

const CONTEXT_COMMAND = 'qaspec catch context';
const RISK_COMMAND = 'qaspec catch risk';
/** The statuses a risk may name: behavior the PR keeps, changes or adds. Removed and renamed ones are not risks. */
const RISK_STATUSES: readonly string[] = ['preserved', 'modified', 'added'];
const ANALYSIS_RISK_FIELDS: readonly string[] = ['requirement', 'scenario', 'summary'];
const DEGRADED_RISK_FIELDS: readonly string[] = ['file', 'summary'];

type JsonObject = Record<string, unknown>;

/** A changed file of the run, with its path relative to the project folder (not the repository). */
export interface CatchProjectFile {
  status: string;
  path: string;
}

export interface CatchRelatedTests {
  /** The changed files that exist on the parent, which the lookup was given. */
  sources: string[];
  /** The existing test files related to them: project-relative, sorted, unique. */
  tests: string[];
}

/** intent.json as the run stored it: the approved intent, or the degraded marker with no intent class. */
export type CatchIntentArtifact = Omit<CatchIntent, 'intentClass'> & {
  intentClass: IntentClass | null;
  mode?: string;
};

/** Everything an agent needs to write risks, mutants and tests for a ready run. */
export interface CatchContext {
  schema: typeof CATCH_CONTEXT_SCHEMA;
  run: string;
  change: string;
  mode: CatchRunMode;
  lowConfidence: boolean;
  projectPrefix: string;
  baseRef: string;
  baseSha: string;
  headSha: string;
  parentSha: string;
  intent: CatchIntentArtifact;
  changedFiles: CatchProjectFile[];
  /** The PR diff as recorded (diff.patch): its paths are repository-relative. */
  diff: string;
  relatedTests: CatchRelatedTests;
}

export interface CatchRisk {
  schema: typeof CATCH_RISK_SCHEMA;
  id: string;
  mode: CatchRunMode;
  /** The capability that lists the requirement (analysis mode). */
  capability?: string;
  requirement?: string;
  scenario?: string;
  /** The changed file the risk names (degraded mode). */
  file?: string;
  summary: string;
  createdAt: string;
}

export interface CatchContextInput {
  projectRoot: string;
  changesDir: string;
  runId: string;
  lockTimeoutMs?: number;
}

export interface RecordRiskInput {
  changesDir: string;
  runId: string;
  /** The parsed risk file: the caller read it with readJsonInput. */
  value: unknown;
  lockTimeoutMs?: number;
}

export type RecordRiskOutcome = { ok: true; risk: CatchRisk } | { ok: false; issues: CatchRecordIssue[] };

/** The changed files of a run as project-relative paths: files outside the project folder are dropped. */
export function toProjectChangedFiles(prefix: string, files: readonly ChangedFile[]): CatchProjectFile[] {
  const inside = prefix === '' ? '' : `${prefix}/`;
  return files.flatMap((file) =>
    file.path.startsWith(inside) ? [{ status: file.status, path: file.path.slice(inside.length) }] : []
  );
}

/**
 * The context of a ready run. The related tests are looked up on the parent worktree the first time and cached in
 * the run folder; later calls read the cache. A failed lookup writes nothing, so the next call tries again.
 */
export async function loadCatchContext(input: CatchContextInput): Promise<CatchContext> {
  const location = findCatchRun(input.changesDir, input.runId);
  return withRunLockAsync(location.runDir, input.lockTimeoutMs ?? RUN_LOCK_TIMEOUT_MS, async () => {
    const run = readCatchRun(location.runDir);
    requireReadyRun(run, CONTEXT_COMMAND);
    const changedFiles = toProjectChangedFiles(
      run.projectPrefix,
      readRunJson<ChangedFile[]>(location.runDir, CHANGED_FILES_FILE)
    );
    const relatedTests = await relatedTestsOf(input.projectRoot, location.runDir, run, changedFiles);
    return {
      schema: CATCH_CONTEXT_SCHEMA,
      run: run.runId,
      change: run.change,
      mode: run.mode,
      lowConfidence: run.lowConfidence,
      projectPrefix: run.projectPrefix,
      baseRef: run.baseRef,
      baseSha: run.baseSha,
      headSha: run.headSha,
      parentSha: run.parentSha,
      intent: readRunJson<CatchIntentArtifact>(location.runDir, INTENT_FILE),
      changedFiles,
      diff: readFileSync(path.join(location.runDir, DIFF_FILE), 'utf-8'),
      relatedTests,
    };
  });
}

/** The cached lookup of the run, or undefined when it was not computed yet. */
function cachedRelatedTests(runDir: string): CatchRelatedTests | undefined {
  if (!existsSync(path.join(runDir, RELATED_TESTS_FILE))) {
    return undefined;
  }
  const cached = readRunJson<{ schema?: unknown; sources: string[]; tests: string[] }>(runDir, RELATED_TESTS_FILE);
  if (cached.schema !== RELATED_TESTS_SCHEMA) {
    throw new Error(`${RELATED_TESTS_FILE} of this run is not a catch cache: remove it to compute the tests again`);
  }
  return { sources: cached.sources, tests: cached.tests };
}

/** The changed files that exist on the parent: an added file has no parent copy, so no test relates to it yet. */
async function existingFiles(projectDir: string, files: readonly string[]): Promise<string[]> {
  const present = await Promise.all(
    files.map(async (file) => {
      const stat = await fs.stat(path.join(projectDir, ...file.split('/'))).catch(() => undefined);
      return stat?.isFile() === true ? file : undefined;
    })
  );
  return present.filter((file): file is string => file !== undefined);
}

/** Looks up (or reads the cache of) the existing tests related to the changed files, on the parent worktree. */
async function relatedTestsOf(
  projectRoot: string,
  runDir: string,
  run: CatchRunRecord,
  changed: readonly CatchProjectFile[]
): Promise<CatchRelatedTests> {
  const cached = cachedRelatedTests(runDir);
  if (cached !== undefined) {
    return cached;
  }
  const { adapter, config } = runnerFor(readProjectConfig(projectRoot)?.catch);
  const projectDir = await projectDirInWorktree(projectRoot, run);
  const sources = await existingFiles(
    projectDir,
    changed.map((file) => file.path)
  );
  const ctx = createRunnerContext(config, { projectDir, scratchDir: path.join(runDir, RUNNER_OUTPUT_DIRNAME) });
  const tests = await adapter.relatedTests(ctx, sources);
  writeRunJson(runDir, RELATED_TESTS_FILE, {
    schema: RELATED_TESTS_SCHEMA,
    adapter: adapter.id,
    sources,
    tests,
    computedAt: nowIso(),
  });
  return { sources, tests };
}

/**
 * Records one risk. Analysis mode: the risk names a preserved, modified or added requirement of the intent, and
 * optionally one of its scenarios. Degraded mode: the risk names a changed file. Every problem is listed at once,
 * and a refused risk writes nothing.
 */
export function recordRisk(input: RecordRiskInput): RecordRiskOutcome {
  const location = findCatchRun(input.changesDir, input.runId);
  return withCatchRunLock(
    location.runDir,
    input.lockTimeoutMs ?? RUN_LOCK_TIMEOUT_MS,
    (): RecordRiskOutcome => {
      const run = readCatchRun(location.runDir);
      requireReadyRun(run, RISK_COMMAND);
      const intent = readRunJson<CatchIntentArtifact>(location.runDir, INTENT_FILE);
      const files = toProjectChangedFiles(
        run.projectPrefix,
        readRunJson<ChangedFile[]>(location.runDir, CHANGED_FILES_FILE)
      );
      const checked = checkRiskValue(input.value, { mode: run.mode, intent, files });
      if (!checked.ok) {
        return { ok: false, issues: checked.issues };
      }
      const risksDir = path.join(location.runDir, RISKS_DIRNAME);
      const id = nextRecordId(risksDir, 'R');
      const risk: CatchRisk = { schema: CATCH_RISK_SCHEMA, id, mode: run.mode, ...checked.fields, createdAt: nowIso() };
      writeRecord(risksDir, id, risk);
      appendLedgerEntry(location.runDir, {
        stage: 'risk',
        at: risk.createdAt,
        risk: id,
        mode: run.mode,
        requirement: risk.requirement ?? null,
        file: risk.file ?? null,
      });
      return { ok: true, risk };
    }
  );
}

type RiskFields = Pick<CatchRisk, 'summary'> & Partial<Pick<CatchRisk, 'capability' | 'requirement' | 'scenario' | 'file'>>;

type RiskCheck = { ok: true; fields: RiskFields } | { ok: false; issues: CatchRecordIssue[] };

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A non-blank string, trimmed; undefined for anything else. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * The one requirement with this name across the capabilities of the intent, for a risk or a test (the subject is named
 * in the ambiguity message). Refused when no capability lists it, or when more than one does. Each caller then checks
 * the status its own record allows, so the lookup is one step and the messages stay per record.
 */
export function findIntentRequirement(
  intent: CatchIntentArtifact,
  name: string,
  subject: 'risk' | 'test'
): { ok: true; capability: string; requirement: CatchRequirement } | { ok: false; issue: CatchRecordIssue } {
  const matches = intent.capabilities.flatMap((capability: CatchCapability) =>
    capability.requirements
      .filter((requirement) => requirement.name === name)
      .map((requirement) => ({ capability: capability.name, requirement }))
  );
  if (matches.length === 0) {
    return { ok: false, issue: { code: 'requirement-unknown', message: `"${name}" is not a requirement of this intent.` } };
  }
  if (matches.length > 1) {
    const capabilities = matches.map((match) => match.capability).join(', ');
    return {
      ok: false,
      issue: {
        code: 'requirement-ambiguous',
        message: `"${name}" is a requirement of more than one capability (${capabilities}), so the ${subject} cannot name one.`,
      },
    };
  }
  const [match] = matches;
  return { ok: true, capability: match.capability, requirement: match.requirement };
}

/** The requirement a risk names: found in the intent, and a preserved, modified or added one. */
function riskRequirement(
  intent: CatchIntentArtifact,
  name: string
): { ok: true; capability: string; requirement: CatchRequirement } | { ok: false; issue: CatchRecordIssue } {
  const found = findIntentRequirement(intent, name, 'risk');
  if (!found.ok || RISK_STATUSES.includes(found.requirement.status)) {
    return found;
  }
  return {
    ok: false,
    issue: {
      code: 'requirement-status',
      message: `"${name}" is ${found.requirement.status}: a risk names a preserved, modified or added requirement.`,
    },
  };
}

/** Validates the parsed risk file against the run's intent and changed files. Lists every problem it finds. */
function checkRiskValue(
  value: unknown,
  context: { mode: CatchRunMode; intent: CatchIntentArtifact; files: CatchProjectFile[] }
): RiskCheck {
  if (!isObject(value)) {
    return { ok: false, issues: [{ code: 'input-not-object', message: 'The risk file must hold one JSON object.' }] };
  }
  const degraded = context.mode === 'without-analysis';
  const allowed = degraded ? DEGRADED_RISK_FIELDS : ANALYSIS_RISK_FIELDS;
  const issues: CatchRecordIssue[] = Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map((key) => ({
      code: 'unknown-field',
      message: `"${key}" is not a risk field in this run; the fields are ${allowed.join(', ')}.`,
    }));

  const summary = text(value.summary);
  if (summary === undefined) {
    issues.push({ code: 'summary-missing', message: 'summary must be a non-empty string that says what the risk is.' });
  }
  const fields: RiskFields = { summary: summary ?? '' };

  if (degraded) {
    const file = text(value.file);
    if (file === undefined) {
      issues.push({ code: 'file-required', message: 'A risk of a degraded run names a changed file: file is required.' });
    } else {
      const relative = path.posix.normalize(file.split('\\').join('/')).replace(/\/+$/, '');
      if (context.files.some((changed) => changed.path === relative)) {
        fields.file = relative;
      } else {
        issues.push({ code: 'file-not-changed', message: `${file} is not a changed file of this run.` });
      }
    }
  } else {
    const requirementName = text(value.requirement);
    if (requirementName === undefined) {
      issues.push({
        code: 'requirement-required',
        message: 'A risk of this run names a requirement of the intent: requirement must be a non-empty string.',
      });
    } else {
      const found = riskRequirement(context.intent, requirementName);
      if (found.ok) {
        fields.capability = found.capability;
        fields.requirement = requirementName;
        if ('scenario' in value) {
          const scenarioTitle = text(value.scenario);
          if (scenarioTitle === undefined) {
            issues.push({ code: 'scenario-invalid', message: 'scenario must be the non-empty title of a scenario.' });
          } else if (!found.requirement.scenarios.some((scenario) => scenario.title === scenarioTitle)) {
            issues.push({
              code: 'scenario-unknown',
              message: `"${scenarioTitle}" is not a scenario of "${requirementName}".`,
            });
          } else {
            fields.scenario = scenarioTitle;
          }
        }
      } else {
        issues.push(found.issue);
      }
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, fields };
}
