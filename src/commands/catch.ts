/**
 * Catch Commands
 *
 * Support commands for /qsx:catch (catching tests generated from the approved change intent).
 */

import chalk from 'chalk';
import path from 'node:path';
import { buildCatchIntent, CATCH_INTENT_SCHEMA, type CatchIntent, type CatchRequirement } from '../core/catch-intent.js';
import {
  CATCH_RUNS_DIRNAME,
  RESULTS_DIRNAME,
  catchPrecision,
  describeCatchFunnel,
  describeCatchRun,
  describeChangeRuns,
  findCatchRun,
  finishCatchRun,
  startCatchRun,
  type CatchBlocker,
  type CatchFunnel,
  type CatchRecordIssue,
  type CatchRunRecord,
  type CatchRunStatus,
} from '../core/catch-run.js';
import { loadCatchContext, recordRisk, type CatchContext, type CatchRisk } from '../core/catch-context.js';
import { recordEquivalence, recordMutant, type CatchMutant } from '../core/catch-mutant.js';
import { recordTest, type CatchTest } from '../core/catch-test.js';
import { runChildPhase, type CatchResult } from '../core/catch-child.js';
import { assessCatchRun, judgeCatchReport, type AssessedReport } from '../core/catch-assess.js';
import { answerCatchFinding, reportCatchFinding } from '../core/catch-findings.js';
import { getChangeDir, resolveCurrentPlanningHomeSync, type PlanningHome } from '../core/planning-home.js';
import { readJsonInput, readTextInput } from './shared/file-input.js';
import { validateChangeExists } from './workflow/shared.js';

export interface CatchIntentCommandOptions {
  change?: string;
  json?: boolean;
}

/** The repository's planning home: catch runs from a repository directory, not from a workspace root. */
function repositoryHome(): PlanningHome {
  const planningHome = resolveCurrentPlanningHomeSync();
  if (planningHome.kind !== 'repo') {
    throw new Error(
      'qaspec catch runs in a repository; run it from the repository directory, not from a workspace root'
    );
  }
  return planningHome;
}

function describeRequirement(requirement: CatchRequirement): string {
  const from = requirement.from ? ` (from "${requirement.from}")` : '';
  const count = requirement.scenarios.length;
  const scenarios = `${count} ${count === 1 ? 'scenario' : 'scenarios'}`;
  return `${requirement.status.padEnd(10)} ${requirement.name}${from} (${scenarios})`;
}

function printIntent(intent: CatchIntent): void {
  console.log(chalk.green(`✓ Intent for "${intent.change}": ${intent.intentClass}`));
  for (const capability of intent.capabilities) {
    console.log(capability.name);
    if (capability.requirements.length === 0) {
      console.log('  (no requirements)');
    }
    for (const requirement of capability.requirements) {
      console.log(`  ${describeRequirement(requirement)}`);
    }
  }
}

/**
 * Prints the intent of a change from its approved analysis and delta specs. Read-only: nothing is written.
 * Invalid intents print each issue and set exit code 1.
 */
export async function catchIntentCommand(options: CatchIntentCommandOptions): Promise<void> {
  if (!options.change) {
    throw new Error('Missing required option --change');
  }

  const planningHome = repositoryHome();
  const changeName = await validateChangeExists(options.change, planningHome.root, planningHome.changesDir);
  const outcome = buildCatchIntent(planningHome.root, changeName);

  if (outcome.ok) {
    if (options.json) {
      console.log(JSON.stringify(outcome.intent, null, 2));
    } else {
      printIntent(outcome.intent);
    }
    return;
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        { schema: CATCH_INTENT_SCHEMA, change: changeName, valid: false, errors: outcome.errors },
        null,
        2
      )
    );
  } else {
    console.log(chalk.red(`✗ Intent for "${changeName}" is invalid`));
    for (const error of outcome.errors) {
      console.log(chalk.red(`  • ${error.message}`));
    }
  }
  process.exitCode = 1;
}

/* Catch runs (T5b): start, status and finish. A refusal lists every blocker and creates nothing. */

export interface CatchStartCommandOptions {
  change: string;
  base?: string;
  withoutAnalysis?: boolean;
  head?: string;
  json?: boolean;
}

export interface CatchStatusCommandOptions {
  run?: string;
  change?: string;
  json?: boolean;
}

export interface CatchFinishCommandOptions {
  run: string;
  json?: boolean;
}

const shortSha = (sha: string): string => sha.slice(0, 12);

function printBlockers(blockers: CatchBlocker[]): void {
  for (const blocker of blockers) {
    console.log(chalk.red(`  • ${blocker.message}`));
    console.log(`    Resolve: ${blocker.resolve}`);
  }
}

/** One setup command per line: its exit code or timeout, and its duration. Its output is never printed. */
function printSetupResults(run: CatchRunRecord): void {
  if (run.setup === null) {
    console.log('  Setup: not run');
    return;
  }
  console.log(`  Setup: ${run.setup.ok ? 'passed' : 'failed'}`);
  for (const entry of run.setup.commands) {
    const seconds = (entry.durationMs / 1000).toFixed(1);
    const failed = entry.timedOut || entry.exitCode !== 0;
    const outcome = entry.timedOut
      ? `timed out after ${seconds} s`
      : `exit ${entry.exitCode ?? 'unknown'}, ${seconds} s`;
    const mark = failed ? chalk.red('✗') : chalk.green('✓');
    console.log(`    ${mark} ${entry.command} (${outcome})`);
  }
}

function printStarted(run: CatchRunRecord, runFolder: string): void {
  if (run.state === 'ready') {
    console.log(chalk.green(`✓ Catch run ${run.runId} is ready for change "${run.change}"`));
  } else {
    console.log(chalk.red(`✗ Catch run ${run.runId} is ${run.state} for change "${run.change}"`));
  }
  if (run.lowConfidence) {
    console.log(chalk.yellow('  Low confidence: degraded mode (--without-analysis) has no approved intent'));
  }
  console.log(`  Mode: ${run.mode}`);
  console.log(
    `  Base ${run.baseRef} (${shortSha(run.baseSha)}), head ${shortSha(run.headSha)}, parent ${shortSha(run.parentSha)}`
  );
  if (run.failure) {
    console.log(chalk.red(`  ${run.failure}`));
  }
  printSetupResults(run);
  if (run.worktree !== null) {
    console.log(`  Worktree: ${run.worktree}`);
  }
  console.log(`  Run folder: ${runFolder}`);
  if (run.state === 'ready') {
    console.log(`Next: qaspec catch finish --run ${run.runId} when the run is done`);
  } else if (run.state === 'setup-failed') {
    console.log(`  Setup output is kept in the run folder: ${path.join(runFolder, 'setup-output.json')}`);
  }
}

function startPayload(run: CatchRunRecord, runFolder: string) {
  return {
    started: true,
    run: run.runId,
    change: run.change,
    state: run.state,
    mode: run.mode,
    lowConfidence: run.lowConfidence,
    baseRef: run.baseRef,
    baseSha: run.baseSha,
    headSha: run.headSha,
    parentSha: run.parentSha,
    projectPrefix: run.projectPrefix,
    runDir: runFolder,
    worktree: run.worktree,
    installedFor: run.installedFor,
    setup: run.setup,
    failure: run.failure ?? null,
  };
}

/**
 * Starts a catch run: every gate is checked first, and a refusal lists each blocker with how to resolve it and
 * creates nothing. A started run is ready, or setup-failed or worktree-failed with its reason (exit 1).
 */
export async function catchStartCommand(options: CatchStartCommandOptions): Promise<void> {
  const planningHome = repositoryHome();
  const changeName = await validateChangeExists(options.change, planningHome.root, planningHome.changesDir);
  const outcome = await startCatchRun({
    projectRoot: planningHome.root,
    changesDir: planningHome.changesDir,
    changeName,
    base: options.base,
    withoutAnalysis: options.withoutAnalysis,
    head: options.head,
  });

  if (!outcome.started) {
    if (options.json) {
      console.log(JSON.stringify({ started: false, blockers: outcome.blockers }, null, 2));
    } else {
      console.log(chalk.red(`✗ Cannot start a catch run for change "${changeName}"`));
      printBlockers(outcome.blockers);
    }
    process.exitCode = 1;
    return;
  }

  const { run, runDir } = outcome;
  const runFolder = path.relative(planningHome.root, runDir);
  if (options.json) {
    console.log(JSON.stringify(startPayload(run, runFolder), null, 2));
  } else {
    printStarted(run, runFolder);
  }
  if (run.state !== 'ready') {
    process.exitCode = 1;
  }
}

/** A count per key as one short phrase: "surviving 2, no-build 1", or "none". */
function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  return entries.length === 0 ? 'none' : entries.map(([key, count]) => `${key} ${count}`).join(', ');
}

/** The funnel of a run on one line: risks, mutants and tests by outcome, classified, assessed and judged results, findings. */
function describeFunnel(funnel: CatchFunnel): string {
  const unreadable = funnel.unreadable > 0 ? `; unreadable ${funnel.unreadable}` : '';
  return (
    `Funnel: risks ${funnel.risks}; mutants ${formatCounts(funnel.mutants)}; ` +
    `tests ${formatCounts(funnel.tests)}; classified ${formatCounts(funnel.classified)}; ` +
    `assessed ${formatCounts(funnel.assessed)}; judged ${formatCounts(funnel.judged)}; ` +
    `reported ${funnel.reported.reported} (confirmed ${funnel.reported.confirmed}, dismissed ${funnel.reported.dismissed})` +
    unreadable
  );
}

/** The precision of the answered findings on one line: confirmed over confirmed plus dismissed, or none yet. */
function describePrecision(funnel: CatchFunnel): string {
  const { confirmed, dismissed } = funnel.reported;
  const precision = catchPrecision(funnel.reported);
  return precision === null
    ? 'Precision: none (no finding answered yet)'
    : `Precision: ${precision.toFixed(2)} (confirmed ${confirmed}, dismissed ${dismissed})`;
}

function statusPayload(status: CatchRunStatus, runFolder: string, funnel: CatchFunnel) {
  const { run } = status;
  return {
    run: run.runId,
    change: run.change,
    state: run.state,
    mode: run.mode,
    lowConfidence: run.lowConfidence,
    baseRef: run.baseRef,
    baseSha: run.baseSha,
    headSha: run.headSha,
    parentSha: run.parentSha,
    projectPrefix: run.projectPrefix,
    worktree: run.worktree,
    installedFor: run.installedFor,
    setup: run.setup,
    failure: run.failure ?? null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    finishedAt: run.finishedAt ?? null,
    runDir: runFolder,
    ledger: status.ledger,
    funnel,
    precision: catchPrecision(funnel.reported),
  };
}

function printStatus(status: CatchRunStatus, runFolder: string, funnel: CatchFunnel): void {
  const { run } = status;
  console.log(`Catch run ${run.runId} (change "${run.change}"): ${run.state}`);
  const confidence = run.lowConfidence ? ' (low confidence: no approved intent)' : '';
  console.log(`  Mode: ${run.mode}${confidence}`);
  console.log(
    `  Base ${run.baseRef} (${shortSha(run.baseSha)}), head ${shortSha(run.headSha)}, parent ${shortSha(run.parentSha)}`
  );
  console.log(`  Worktree: ${run.worktree ?? 'none'}`);
  console.log(`  Installed for: ${run.installedFor === null ? 'none' : shortSha(run.installedFor)}`);
  if (run.failure) {
    console.log(chalk.red(`  Failure: ${run.failure}`));
  }
  printSetupResults(run);
  const counts = Object.entries(status.ledger)
    .map(([stage, count]) => `${stage} ${count}`)
    .join(', ');
  console.log(`  Ledger: ${counts || 'empty'}`);
  console.log(`  ${describeFunnel(funnel)}`);
  console.log(`  ${describePrecision(funnel)}`);
  console.log(`  Run folder: ${runFolder}`);
}

/** Shows one run (--run, narrowed by --change when given) or lists the runs of a change (--change). */
export async function catchStatusCommand(options: CatchStatusCommandOptions): Promise<void> {
  if (!options.run && !options.change) {
    throw new Error('Missing required option --run or --change');
  }
  const planningHome = repositoryHome();

  if (options.run) {
    const changeName =
      options.change === undefined
        ? undefined
        : await validateChangeExists(options.change, planningHome.root, planningHome.changesDir);
    const location = findCatchRun(planningHome.changesDir, options.run, changeName);
    const status = describeCatchRun(location);
    const funnel = describeCatchFunnel(location.runDir);
    const runFolder = path.relative(planningHome.root, location.runDir);
    if (options.json) {
      console.log(JSON.stringify(statusPayload(status, runFolder, funnel), null, 2));
    } else {
      printStatus(status, runFolder, funnel);
    }
    return;
  }

  const changeName = await validateChangeExists(options.change, planningHome.root, planningHome.changesDir);
  const changeDir = getChangeDir(planningHome, changeName);
  const statuses = describeChangeRuns(changeDir);
  const runDirOf = (status: CatchRunStatus): string => path.join(changeDir, CATCH_RUNS_DIRNAME, status.run.runId);
  const runFolderOf = (status: CatchRunStatus): string => path.relative(planningHome.root, runDirOf(status));
  if (options.json) {
    const runs = statuses.map((status) => statusPayload(status, runFolderOf(status), describeCatchFunnel(runDirOf(status))));
    console.log(JSON.stringify({ change: changeName, runs }, null, 2));
  } else if (statuses.length === 0) {
    console.log(`No catch runs for change "${changeName}"`);
  } else {
    // Each run is printed as --run prints it, one block per run.
    statuses.forEach((status, index) => {
      if (index > 0) {
        console.log('');
      }
      printStatus(status, runFolderOf(status), describeCatchFunnel(runDirOf(status)));
    });
  }
}

/** Removes the run's worktree and marks the run finished. A second call reports it is already finished. */
export async function catchFinishCommand(options: CatchFinishCommandOptions): Promise<void> {
  const planningHome = repositoryHome();
  const { run, alreadyFinished, warning } = await finishCatchRun({
    projectRoot: planningHome.root,
    changesDir: planningHome.changesDir,
    runId: options.run,
  });
  if (options.json) {
    console.log(
      JSON.stringify(
        { run: run.runId, change: run.change, state: run.state, alreadyFinished, ...(warning ? { warning } : {}) },
        null,
        2
      )
    );
  } else if (alreadyFinished) {
    console.log(`Catch run ${run.runId} is already finished`);
  } else {
    console.log(chalk.green(`✓ Catch run ${run.runId} finished`));
    if (warning) {
      console.error(chalk.yellow(`Warning: ${warning}`));
    }
  }
}


/* Parent phase (T7): context, risks, mutants and equivalence verdicts. Each input is a JSON file (--input). */

export interface CatchContextCommandOptions {
  run: string;
  json?: boolean;
}

export interface CatchRecordCommandOptions {
  run: string;
  input: string;
  json?: boolean;
}

export interface CatchEquivalenceCommandOptions {
  run: string;
  mutant: string;
  input: string;
  json?: boolean;
}

type InputRead = { ok: true; value: unknown } | { ok: false; issues: CatchRecordIssue[] };

/** Reads a record's JSON file. Text that is not JSON is one refusal, like any other problem with the record. */
function readRecordInput(file: string, label: string): InputRead {
  const input = readJsonInput(file, label);
  if (!input.json.ok) {
    return { ok: false, issues: [{ code: 'input-not-json', message: `The ${label} is not valid JSON: ${input.json.message}` }] };
  }
  return { ok: true, value: input.json.value };
}

/** A refusal: every issue listed, nothing recorded, exit code 1. */
function printRefusal(run: string, headline: string, issues: CatchRecordIssue[], json: boolean | undefined): void {
  if (json) {
    console.log(JSON.stringify({ recorded: false, run, errors: issues }, null, 2));
  } else {
    console.log(chalk.red(`✗ ${headline} for run ${run}`));
    for (const issue of issues) {
      console.log(chalk.red(`  • ${issue.message}`));
    }
  }
  process.exitCode = 1;
}

function printContext(context: CatchContext, runFolder: string): void {
  const confidence = context.lowConfidence ? ' (degraded: low confidence, no approved intent)' : '';
  console.log(`Catch run ${context.run} (change "${context.change}")${confidence}`);
  if (context.intent.intentClass === null) {
    console.log('  Intent: none (degraded mode)');
  } else {
    console.log(`  Intent class: ${context.intent.intentClass}`);
    for (const capability of context.intent.capabilities) {
      console.log(`  ${capability.name}`);
      for (const requirement of capability.requirements) {
        console.log(`    ${describeRequirement(requirement)}`);
      }
    }
  }
  console.log('  Changed files (project-relative):');
  if (context.changedFiles.length === 0) {
    console.log('    (none inside the project)');
  }
  for (const file of context.changedFiles) {
    console.log(`    ${file.status} ${file.path}`);
  }
  const tests = context.relatedTests.tests;
  console.log(`  Related existing tests: ${tests.length === 0 ? 'none' : tests.join(', ')}`);
  console.log(`  Diff: ${path.join(runFolder, 'diff.patch')}`);
}

/** Prints the context of a ready run: the intent, the changed files, the diff and the related existing tests. */
export async function catchContextCommand(options: CatchContextCommandOptions): Promise<void> {
  const planningHome = repositoryHome();
  const context = await loadCatchContext({
    projectRoot: planningHome.root,
    changesDir: planningHome.changesDir,
    runId: options.run,
  });
  if (options.json) {
    console.log(JSON.stringify(context, null, 2));
    return;
  }
  const runFolder = path.relative(
    planningHome.root,
    path.join(planningHome.changesDir, context.change, CATCH_RUNS_DIRNAME, context.run)
  );
  printContext(context, runFolder);
}

function describeRisk(risk: CatchRisk): string {
  if (risk.requirement !== undefined) {
    return `${risk.requirement}${risk.scenario === undefined ? '' : ` / ${risk.scenario}`}`;
  }
  return risk.file ?? '';
}

/** Records a risk from --input: a requirement of the intent (analysis run) or a changed file (degraded run). */
export async function catchRiskCommand(options: CatchRecordCommandOptions): Promise<void> {
  const planningHome = repositoryHome();
  const input = readRecordInput(options.input, 'risk file');
  if (!input.ok) {
    printRefusal(options.run, 'Risk was not recorded', input.issues, options.json);
    return;
  }
  const outcome = recordRisk({ changesDir: planningHome.changesDir, runId: options.run, value: input.value });
  if (!outcome.ok) {
    printRefusal(options.run, 'Risk was not recorded', outcome.issues, options.json);
    return;
  }
  if (options.json) {
    console.log(JSON.stringify({ recorded: true, run: options.run, risk: outcome.risk }, null, 2));
  } else {
    console.log(chalk.green(`✓ Risk ${outcome.risk.id} recorded for run ${options.run}`));
    console.log(`  ${describeRisk(outcome.risk)}`);
  }
}

/** Records a mutant from --input and runs its gates on the parent. Exit code 1 only for a refused mutant. */
export async function catchMutantCommand(options: CatchRecordCommandOptions): Promise<void> {
  const planningHome = repositoryHome();
  const input = readRecordInput(options.input, 'mutant file');
  if (!input.ok) {
    printRefusal(options.run, 'Mutant was not recorded', input.issues, options.json);
    return;
  }
  const outcome = await recordMutant({
    projectRoot: planningHome.root,
    changesDir: planningHome.changesDir,
    runId: options.run,
    value: input.value,
  });
  if (!outcome.ok) {
    printRefusal(options.run, 'Mutant was not recorded', outcome.issues, options.json);
    return;
  }
  const { mutant } = outcome;
  if (options.json) {
    console.log(JSON.stringify({ recorded: true, run: options.run, mutant }, null, 2));
  } else {
    console.log(describeMutantLine(mutant));
    console.log(`  ${mutant.reason}`);
    if (mutant.relatedTests.length > 0) {
      console.log(`  Related existing tests: ${mutant.relatedTests.join(', ')}`);
    }
  }
}

function describeMutantLine(mutant: CatchMutant): string {
  return `Mutant ${mutant.id} (${mutant.risk}, ${mutant.file}): ${mutant.outcome}`;
}

/** Records the fresh-context verdict on a surviving mutant from --input, once. */
export async function catchEquivalenceCommand(options: CatchEquivalenceCommandOptions): Promise<void> {
  const planningHome = repositoryHome();
  const input = readRecordInput(options.input, 'verdict file');
  if (!input.ok) {
    printRefusal(options.run, 'Equivalence verdict was not recorded', input.issues, options.json);
    return;
  }
  const outcome = recordEquivalence({
    changesDir: planningHome.changesDir,
    runId: options.run,
    mutant: options.mutant,
    value: input.value,
  });
  if (!outcome.ok) {
    printRefusal(options.run, 'Equivalence verdict was not recorded', outcome.issues, options.json);
    return;
  }
  if (options.json) {
    console.log(JSON.stringify({ recorded: true, run: options.run, mutant: outcome.mutant }, null, 2));
  } else {
    console.log(describeMutantLine(outcome.mutant));
    console.log(`  ${outcome.mutant.equivalence?.rationale ?? ''}`);
  }
}

/* Child phase (T8): tests from --input, their parent gates, then every gated test on the head. */

export interface CatchTestCommandOptions {
  run: string;
  input: string;
  json?: boolean;
}

export interface CatchChildCommandOptions {
  run: string;
  json?: boolean;
}

function describeTestLine(test: CatchTest): string {
  const subject = test.mutant === undefined ? test.kind : `${test.kind}, ${test.mutant}`;
  return `Test ${test.id} (${subject}, ${test.path}): ${test.outcome}`;
}

/**
 * Records a test from --input and runs its parent gates. The recorded test is kept whatever its gate outcome; exit code
 * 1 is only for a refused test.
 */
export async function catchTestCommand(options: CatchTestCommandOptions): Promise<void> {
  const planningHome = repositoryHome();
  const input = readRecordInput(options.input, 'test file');
  if (!input.ok) {
    printRefusal(options.run, 'Test was not recorded', input.issues, options.json);
    return;
  }
  const outcome = await recordTest({
    projectRoot: planningHome.root,
    changesDir: planningHome.changesDir,
    runId: options.run,
    value: input.value,
  });
  if (!outcome.ok) {
    printRefusal(options.run, 'Test was not recorded', outcome.issues, options.json);
    return;
  }
  const { test } = outcome;
  if (options.json) {
    console.log(JSON.stringify({ recorded: true, run: options.run, test }, null, 2));
  } else {
    console.log(describeTestLine(test));
    console.log(`  ${test.reason}`);
  }
}

/** A result without its per-run messages: the classification, which the run folder keeps in full. */
function compactResult(result: CatchResult) {
  return {
    test: result.test,
    kind: result.kind,
    parent: result.parent,
    child: result.child,
    action: result.action,
    ...(result.reason === undefined ? {} : { reason: result.reason }),
    ...(result.detail === undefined ? {} : { detail: result.detail }),
  };
}

function describeResult(result: CatchResult): string {
  const reason = result.reason === undefined ? '' : ` (${result.reason})`;
  const child = result.child.length === 0 ? 'not run' : result.child.join(', ');
  return `${result.test} (${result.kind}): ${result.action}${reason}; parent ${result.parent}, child ${child}`;
}

/**
 * Runs every gated test on the PR head and classifies it (Table 3). A refused child phase changes nothing; a failed
 * reinstall ends the run in child-setup-failed with its setup output kept in the run folder only (exit code 1).
 */
export async function catchChildCommand(options: CatchChildCommandOptions): Promise<void> {
  const planningHome = repositoryHome();
  const outcome = await runChildPhase({
    projectRoot: planningHome.root,
    changesDir: planningHome.changesDir,
    runId: options.run,
  });

  if (outcome.status === 'refused') {
    if (options.json) {
      console.log(JSON.stringify({ status: 'refused', run: options.run, errors: outcome.issues }, null, 2));
    } else {
      console.log(chalk.red(`✗ The child phase did not run for run ${options.run}`));
      for (const issue of outcome.issues) {
        console.log(chalk.red(`  • ${issue.message}`));
      }
    }
    process.exitCode = 1;
    return;
  }

  const { run } = outcome;
  const runFolder = path.relative(planningHome.root, path.join(planningHome.changesDir, run.change, CATCH_RUNS_DIRNAME, run.runId));
  if (outcome.status === 'setup-failed') {
    if (options.json) {
      console.log(
        JSON.stringify(
          { status: 'setup-failed', run: run.runId, change: run.change, state: run.state, failure: run.failure ?? null, setup: run.setup },
          null,
          2
        )
      );
    } else {
      console.log(chalk.red(`✗ Catch run ${run.runId} stopped: catch.setup failed on the PR head`));
      if (run.failure) {
        console.log(chalk.red(`  ${run.failure}`));
      }
      console.log(`  Setup output is kept in the run folder: ${path.join(runFolder, 'setup-output.json')}`);
    }
    process.exitCode = 1;
    return;
  }

  const { results } = outcome;
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          status: 'classified',
          run: run.runId,
          change: run.change,
          state: run.state,
          installedFor: run.installedFor,
          results: results.map(compactResult),
        },
        null,
        2
      )
    );
  } else {
    console.log(chalk.green(`✓ Catch run ${run.runId} is classified: ${results.length} gated test(s) run on the head`));
    for (const result of results) {
      console.log(`  ${describeResult(result)}`);
    }
    console.log(`  Results: ${path.join(runFolder, RESULTS_DIRNAME)}`);
  }
}

/* Assessors and findings (T9, T10): assess once, judge each kept report, report it once and answer its finding. */

export interface CatchAssessCommandOptions {
  run: string;
  json?: boolean;
}

export interface CatchJudgeCommandOptions {
  run: string;
  test: string;
  input: string;
  json?: boolean;
}

export interface CatchReportCommandOptions {
  run: string;
  test: string;
  input: string;
  json?: boolean;
}

export interface CatchAnswerCommandOptions {
  run: string;
  finding: string;
  intended: string;
  noteFile?: string;
  json?: boolean;
}

function describeAssessedReport(report: AssessedReport): string {
  const rule = report.rule === undefined ? '' : ` (rule ${report.rule})`;
  const signals = report.signals.length === 0 ? '' : `; signals ${report.signals.join(', ')}`;
  return `${report.test}: ${report.outcome}${rule}${signals}`;
}

/**
 * Assesses the reports of a classified run, once: the generic and per-project rules discard the false positives, and the
 * reports that survive carry their signals. A refusal creates nothing; the run moves to assessed on success.
 */
export async function catchAssessCommand(options: CatchAssessCommandOptions): Promise<void> {
  const planningHome = repositoryHome();
  const outcome = assessCatchRun({
    projectRoot: planningHome.root,
    changesDir: planningHome.changesDir,
    runId: options.run,
  });
  if (!outcome.ok) {
    printRefusal(options.run, 'Assessment was not recorded', outcome.issues, options.json);
    return;
  }
  const { assessment } = outcome;
  const kept = assessment.reports.filter((report) => report.outcome === 'kept').length;
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          recorded: true,
          run: options.run,
          state: 'assessed',
          lowConfidence: assessment.lowConfidence,
          rulesFile: assessment.rulesFile,
          reports: assessment.reports,
        },
        null,
        2
      )
    );
    return;
  }
  console.log(
    chalk.green(`✓ Run ${options.run} assessed: ${kept} report(s) kept, ${assessment.reports.length - kept} discarded by the rules`)
  );
  for (const report of assessment.reports) {
    console.log(`  ${describeAssessedReport(report)}`);
  }
  console.log(`Judge each kept report with: qaspec catch judge --run ${options.run} --test <id> --input <file>`);
}

/** Records the verdicts of the judges on one kept report, from --input: one verdict per judge of catch.judges. */
export async function catchJudgeCommand(options: CatchJudgeCommandOptions): Promise<void> {
  const planningHome = repositoryHome();
  const input = readRecordInput(options.input, 'verdict file');
  if (!input.ok) {
    printRefusal(options.run, 'Judgement was not recorded', input.issues, options.json);
    return;
  }
  const outcome = judgeCatchReport({
    projectRoot: planningHome.root,
    changesDir: planningHome.changesDir,
    runId: options.run,
    test: options.test,
    value: input.value,
  });
  if (!outcome.ok) {
    printRefusal(options.run, 'Judgement was not recorded', outcome.issues, options.json);
    return;
  }
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          recorded: true,
          run: options.run,
          test: outcome.test,
          outcome: outcome.outcome,
          median: outcome.median,
          scores: outcome.scores,
        },
        null,
        2
      )
    );
    return;
  }
  if (outcome.outcome === 'kept') {
    console.log(chalk.green(`✓ ${outcome.test} kept by the judges (median ${outcome.median})`));
  } else {
    console.log(chalk.yellow(`✓ ${outcome.test} discarded by the judges (median ${outcome.median})`));
  }
}

/** Records the finding of one kept report, from --input: { before, after }; the question is composed by the CLI. */
export async function catchReportCommand(options: CatchReportCommandOptions): Promise<void> {
  const planningHome = repositoryHome();
  const input = readRecordInput(options.input, 'report file');
  if (!input.ok) {
    printRefusal(options.run, 'Finding was not recorded', input.issues, options.json);
    return;
  }
  const outcome = reportCatchFinding({
    changesDir: planningHome.changesDir,
    runId: options.run,
    test: options.test,
    value: input.value,
  });
  if (!outcome.ok) {
    printRefusal(options.run, 'Finding was not recorded', outcome.issues, options.json);
    return;
  }
  const { finding } = outcome;
  if (options.json) {
    console.log(JSON.stringify({ recorded: true, run: options.run, finding }, null, 2));
    return;
  }
  console.log(chalk.green(`✓ Finding ${finding.id} recorded for ${finding.test}`));
  console.log(`  ${finding.question}`);
  console.log(`  Answer it with: qaspec catch answer --run ${options.run} --finding ${finding.id} --intended yes|no`);
}

/**
 * Records the person's answer to one finding, once: yes (intended) dismisses it, no confirms it. The note comes from
 * --note-file only, so text never travels on the command line.
 */
export async function catchAnswerCommand(options: CatchAnswerCommandOptions): Promise<void> {
  const planningHome = repositoryHome();
  let note: string | undefined;
  if (options.noteFile !== undefined) {
    const file = readTextInput(options.noteFile, 'note file');
    if (!file.ok) {
      const issues = file.issues.map((issue) => ({ code: 'note-invalid', message: issue.message }));
      printRefusal(options.run, `Answer not recorded for finding ${options.finding}`, issues, options.json);
      return;
    }
    note = file.text;
  }
  const outcome = answerCatchFinding({
    changesDir: planningHome.changesDir,
    runId: options.run,
    finding: options.finding,
    intended: options.intended,
    ...(note === undefined ? {} : { note }),
  });
  if (!outcome.ok) {
    printRefusal(options.run, `Answer not recorded for finding ${options.finding}`, outcome.issues, options.json);
    return;
  }
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          run: outcome.run,
          finding: outcome.finding,
          intended: outcome.intended,
          stage: outcome.stage,
          note: outcome.note ?? null,
          answeredAt: outcome.answeredAt,
          secondsToAnswer: outcome.secondsToAnswer,
        },
        null,
        2
      )
    );
    return;
  }
  const meaning = outcome.intended === 'yes' ? 'intended (dismissed)' : 'not intended (confirmed)';
  console.log(chalk.green(`✓ Finding ${outcome.finding} recorded: ${meaning}, ${outcome.secondsToAnswer} s after it was reported`));
}
