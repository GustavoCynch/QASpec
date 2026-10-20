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
  describeCatchRun,
  describeChangeRuns,
  findCatchRun,
  finishCatchRun,
  startCatchRun,
  type CatchBlocker,
  type CatchRecordIssue,
  type CatchRunRecord,
  type CatchRunStatus,
} from '../core/catch-run.js';
import { loadCatchContext, recordRisk, type CatchContext, type CatchRisk } from '../core/catch-context.js';
import { recordEquivalence, recordMutant, type CatchMutant } from '../core/catch-mutant.js';
import { getChangeDir, resolveCurrentPlanningHomeSync, type PlanningHome } from '../core/planning-home.js';
import { readJsonInput } from './shared/file-input.js';
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

function statusPayload(status: CatchRunStatus, runFolder: string) {
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
  };
}

function printStatus(status: CatchRunStatus, runFolder: string): void {
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
    const runFolder = path.relative(planningHome.root, location.runDir);
    if (options.json) {
      console.log(JSON.stringify(statusPayload(status, runFolder), null, 2));
    } else {
      printStatus(status, runFolder);
    }
    return;
  }

  const changeName = await validateChangeExists(options.change, planningHome.root, planningHome.changesDir);
  const changeDir = getChangeDir(planningHome, changeName);
  const statuses = describeChangeRuns(changeDir);
  const runFolderOf = (status: CatchRunStatus): string =>
    path.relative(planningHome.root, path.join(changeDir, CATCH_RUNS_DIRNAME, status.run.runId));
  if (options.json) {
    const runs = statuses.map((status) => statusPayload(status, runFolderOf(status)));
    console.log(JSON.stringify({ change: changeName, runs }, null, 2));
  } else if (statuses.length === 0) {
    console.log(`No catch runs for change "${changeName}"`);
  } else {
    // Each run is printed as --run prints it, one block per run.
    statuses.forEach((status, index) => {
      if (index > 0) {
        console.log('');
      }
      printStatus(status, runFolderOf(status));
    });
  }
}

/** Removes the run's worktree and marks the run finished. A second call reports it is already finished. */
export async function catchFinishCommand(options: CatchFinishCommandOptions): Promise<void> {
  const planningHome = repositoryHome();
  const { run, alreadyFinished } = await finishCatchRun({
    projectRoot: planningHome.root,
    changesDir: planningHome.changesDir,
    runId: options.run,
  });
  if (options.json) {
    console.log(
      JSON.stringify({ run: run.runId, change: run.change, state: run.state, alreadyFinished }, null, 2)
    );
  } else if (alreadyFinished) {
    console.log(`Catch run ${run.runId} is already finished`);
  } else {
    console.log(chalk.green(`✓ Catch run ${run.runId} finished`));
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
