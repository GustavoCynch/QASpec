/**
 * Execute Commands
 *
 * Support commands for /qsx:execute (agent-driven browser runs of approved test cases).
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'node:fs';
import path from 'path';
import { getChangeDir, resolveCurrentPlanningHomeSync } from '../core/planning-home.js';
import { executeLogin } from '../core/execution-auth.js';
import { parseTestcaseDetails } from '../core/cases-validation.js';
import { evaluatePlan, parseObservations, type CaseEvaluation } from '../core/execution-check.js';
import {
  hashPlanBytes,
  parseJsonText,
  validatePlanAgainstTestcases,
  validatePlanShape,
  type ExecutionIssue,
  type ExecutionPlan,
} from '../core/execution-plan.js';
import { validateChangeExists } from './workflow/shared.js';
import type { ReadinessCheckRecord } from '../core/execution-readiness.js';
import {
  confirmRun,
  describeRunStatus,
  findRun,
  finishRun,
  listRuns,
  recordObservations,
  startRun,
  storePlan,
  type LedgerCounts,
  type RunLocation,
  type RunRecord,
  type StartBlocker,
} from '../core/execution-run.js';
import { answerFinding, triageCase, triageContext, type TriageContext } from '../core/execution-triage.js';

export interface ExecuteLoginCommandOptions {
  json?: boolean;
}

export async function executeLoginCommand(options: ExecuteLoginCommandOptions = {}): Promise<void> {
  const spinner = options.json ? undefined : ora('Running the login script...').start();

  try {
    const projectRoot = resolveCurrentPlanningHomeSync().root;
    const result = await executeLogin(projectRoot);
    const storageState = path.relative(projectRoot, result.storageStatePath);

    spinner?.stop();

    if (options.json) {
      console.log(JSON.stringify({ storageState, output: result.output }, null, 2));
      return;
    }
    if (result.output.trim()) {
      console.log(result.output.trimEnd());
    }
    console.log(chalk.green(`✓ Session saved to ${storageState} (ignored by git)`));
  } catch (error) {
    spinner?.stop();
    throw error;
  }
}

export interface ExecuteValidatePlanOptions {
  change?: string;
  json?: boolean;
}

export interface ExecuteCheckOptions {
  json?: boolean;
}

/** Reads a JSON input file. The hash covers the exact bytes; the parse drops a byte order mark. */
function readJsonInput(filePath: string, label: string): { sha256: string; json: ReturnType<typeof parseJsonText> } {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(path.resolve(filePath));
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'file not found' : (error as Error).message;
    throw new Error(`Cannot read ${label} "${filePath}": ${reason}`);
  }
  return { sha256: hashPlanBytes(bytes), json: parseJsonText(bytes.toString('utf-8')) };
}

function printIssues(issues: ExecutionIssue[]): void {
  for (const issue of issues) {
    console.log(chalk.red(`  • ${issue.message}`));
  }
}

function printEvaluation(plan: ExecutionPlan, evaluation: CaseEvaluation, sha256: string): void {
  console.log(`Case ${plan.case.id} "${plan.case.title}"`);
  for (const check of evaluation.checks) {
    const reason = check.reason ? `: ${check.reason}` : '';
    if (check.status === 'passed') {
      console.log(chalk.green(`  ✓ ${check.id} (step ${check.step})`));
    } else if (check.status === 'failed') {
      console.log(chalk.red(`  ✗ ${check.id} (step ${check.step})${reason}`));
    } else {
      console.log(chalk.yellow(`  ! ${check.id} (step ${check.step}, ${check.status})${reason}`));
    }
  }
  for (const item of evaluation.needsHuman) {
    console.log(chalk.yellow(`  ? step ${item.step} needs a person: ${item.reason}`));
  }
  const verdictLine = `Verdict: ${evaluation.verdict}`;
  console.log(evaluation.verdict === 'passed' ? chalk.green(verdictLine) : chalk.red(verdictLine));
  console.log(`sha256: ${sha256}`);
}

/**
 * Validates an execution plan against the Steps of its case in the change's testcases.md.
 * Validation errors print the errors and set exit code 1; nothing is executed.
 */
export async function executeValidatePlanCommand(
  planPath: string,
  options: ExecuteValidatePlanOptions
): Promise<void> {
  if (!options.change) {
    throw new Error('Missing required option --change');
  }

  const spinner = options.json ? undefined : ora('Validating execution plan...').start();

  try {
    const planningHome = resolveCurrentPlanningHomeSync();
    const changeName = await validateChangeExists(options.change, planningHome.root, planningHome.changesDir);
    const changeDir = getChangeDir(planningHome, changeName);
    const plan = readJsonInput(planPath, 'plan file');
    const testcases = parseTestcaseDetails(changeDir);

    const issues: ExecutionIssue[] = [];
    if (testcases.path === null) {
      issues.push({ message: 'testcases.md not found in change directory' });
    }
    if (!plan.json.ok) {
      issues.push({ message: `Plan is not valid JSON: ${plan.json.message}` });
    } else {
      const shape = validatePlanShape(plan.json.value);
      issues.push(...shape.issues);
      if (shape.plan && testcases.path !== null) {
        issues.push(...validatePlanAgainstTestcases({ plan: shape.plan, changeName, cases: testcases.cases }));
      }
    }

    spinner?.stop();

    const valid = issues.length === 0;
    if (options.json) {
      console.log(
        JSON.stringify(
          { change: changeName, plan: planPath, planSha256: plan.sha256, valid, errors: issues },
          null,
          2
        )
      );
    } else if (valid) {
      console.log(chalk.green(`✓ Plan "${planPath}" is valid for change "${changeName}"`));
      console.log(`sha256: ${plan.sha256}`);
    } else {
      console.log(chalk.red(`✗ Plan "${planPath}" is invalid for change "${changeName}"`));
      printIssues(issues);
    }

    if (!valid) {
      process.exitCode = 1;
    }
  } catch (error) {
    spinner?.stop();
    throw error;
  }
}

/**
 * Evaluates captured observations against a plan and prints the case verdict. Validation errors
 * print no verdict, because an invalid plan or observation set cannot be evaluated. The exit code
 * is 1 for any verdict other than passed.
 */
export async function executeCheckCommand(
  planPath: string,
  observationsPath: string,
  options: ExecuteCheckOptions = {}
): Promise<void> {
  const spinner = options.json ? undefined : ora('Evaluating checks...').start();

  try {
    const planInput = readJsonInput(planPath, 'plan file');
    const issues: ExecutionIssue[] = [];
    let plan: ExecutionPlan | undefined;

    if (!planInput.json.ok) {
      issues.push({ message: `Plan is not valid JSON: ${planInput.json.message}` });
    } else {
      const shape = validatePlanShape(planInput.json.value);
      plan = shape.plan;
      issues.push(...shape.issues);
    }

    let evaluation: CaseEvaluation | undefined;
    if (plan && issues.length === 0) {
      const observationsInput = readJsonInput(observationsPath, 'observations file');
      if (!observationsInput.json.ok) {
        issues.push({ message: `Observations file is not valid JSON: ${observationsInput.json.message}` });
      } else {
        const parsed = parseObservations(observationsInput.json.value, plan);
        issues.push(...parsed.issues);
        if (issues.length === 0) {
          evaluation = evaluatePlan(plan, parsed.observations);
        }
      }
    }

    spinner?.stop();

    if (!plan || !evaluation) {
      if (options.json) {
        console.log(JSON.stringify({ valid: false, errors: issues, planSha256: planInput.sha256 }, null, 2));
      } else {
        console.log(chalk.red('✗ Cannot evaluate: the plan or the observations are invalid'));
        printIssues(issues);
      }
      process.exitCode = 1;
      return;
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            valid: true,
            errors: [],
            verdict: evaluation.verdict,
            case: { id: plan.case.id, title: plan.case.title },
            planSha256: planInput.sha256,
            checks: evaluation.checks,
            needsHuman: evaluation.needsHuman,
          },
          null,
          2
        )
      );
    } else {
      printEvaluation(plan, evaluation, planInput.sha256);
    }

    if (evaluation.verdict !== 'passed') {
      process.exitCode = 1;
    }
  } catch (error) {
    spinner?.stop();
    throw error;
  }
}

/* Run lifecycle (T6): start, confirm, plan, record, finish and status. Gate failures print nothing else. */

export interface ExecuteStartCommandOptions {
  change: string;
  json?: boolean;
}

export interface ExecuteRunCommandOptions {
  run: string;
  json?: boolean;
}

export interface ExecuteCaseCommandOptions extends ExecuteRunCommandOptions {
  case: string;
}

export interface ExecuteStatusOptions {
  run?: string;
  change?: string;
  json?: boolean;
}

/** Reads an input file as raw bytes: a stored plan or observation keeps exactly what the file held. */
function readInputBytes(filePath: string, label: string): Buffer {
  try {
    return fs.readFileSync(path.resolve(filePath));
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'file not found' : (error as Error).message;
    throw new Error(`Cannot read ${label} "${filePath}": ${reason}`);
  }
}

function resolveRun(runId: string): RunLocation {
  return findRun(resolveCurrentPlanningHomeSync().changesDir, runId);
}

function printReadinessCheck(record: ReadinessCheckRecord): void {
  const seconds = (record.durationMs / 1000).toFixed(1);
  if (record.status === 'passed') {
    console.log(chalk.green(`  ✓ ${record.name} (exit 0, ${seconds} s)`));
  } else if (record.status === 'timed-out') {
    console.log(chalk.red(`  ✗ ${record.name} (timed out after ${seconds} s)`));
  } else {
    console.log(chalk.red(`  ✗ ${record.name} (exit ${record.exitCode ?? 'unknown'}, ${seconds} s)`));
  }
}

function printBlockers(blockers: StartBlocker[]): void {
  for (const blocker of blockers) {
    console.log(chalk.red(`  • ${blocker.message}`));
    console.log(`    Resolve: ${blocker.resolve}`);
  }
}

/** The readiness checks and probe that block a run, each with the reason it blocks. */
function blockReasons(readiness: RunRecord['readiness']): string[] {
  const reasons = readiness.checks
    .filter((check) => check.status !== 'passed')
    .map((check) => {
      if (check.status === 'timed-out') {
        return `readiness check "${check.name}" timed out`;
      }
      const exit = check.exitCode === null ? 'without an exit code' : `with exit code ${check.exitCode}`;
      return `readiness check "${check.name}" failed ${exit}`;
    });
  if (readiness.probe && !readiness.probe.ok) {
    const { probe } = readiness;
    const result = probe.httpStatus ? `answered HTTP ${probe.httpStatus}` : `failed (${probe.error ?? 'no answer'})`;
    reasons.push(`probe ${probe.url} ${result}`);
  }
  return reasons;
}

/** A blocked run keeps its evidence, but it is never reported as started: no case runs. */
function printBlocked(run: RunRecord, runFolder: string): void {
  const reasons = blockReasons(run.readiness).join('; ') || 'the environment did not pass its readiness';
  console.log(chalk.red(`✗ Run ${run.id} is blocked-by-environment: ${reasons}`));
  console.log(`  Run folder: ${runFolder}`);
  console.log(chalk.red('Cases are not run. Fix the environment, then start a new run.'));
}

function printStarted(run: RunRecord, dataTag: string, runFolder: string): void {
  if (run.state === 'blocked-by-environment') {
    printBlocked(run, runFolder);
    return;
  }
  console.log(chalk.green(`✓ Run ${run.id} started for change "${run.change}"`));
  console.log(`  Data tag: ${dataTag}`);
  if (run.controlCase) {
    console.log(`  Control case: ${run.controlCase.source}`);
  }
  console.log(`  Run folder: ${runFolder}`);
  if (run.readiness.probe) {
    const { probe } = run.readiness;
    const result = probe.ok ? `answered ${probe.httpStatus}` : probe.httpStatus ? `HTTP ${probe.httpStatus}` : probe.error;
    console.log(`  Probe ${probe.url}: ${result}`);
  }
  if (run.state === 'awaiting-confirmation') {
    console.log(
      chalk.yellow(
        `Ask the user to confirm the app serves this change's code, then run: qaspec execute confirm --run ${run.id}`
      )
    );
  } else if (run.state === 'ready') {
    console.log(`Ready. Store the control case plan first: qaspec execute plan --run ${run.id} --case control <plan.json>`);
  }
}

/** Starts a run after the approval, cases, execution, git and control gates; readiness runs here. */
export async function executeStartCommand(options: ExecuteStartCommandOptions): Promise<void> {
  const planningHome = resolveCurrentPlanningHomeSync();
  const changeName = await validateChangeExists(options.change, planningHome.root, planningHome.changesDir);
  const changeDir = getChangeDir(planningHome, changeName);

  const outcome = await startRun({
    changeName,
    changeDir,
    projectRoot: planningHome.root,
    hooks: options.json
      ? undefined
      : {
          beforeReadinessCheck: (check) => console.log(`Running readiness check "${check.name}": ${check.command}`),
          afterReadinessCheck: printReadinessCheck,
        },
  });

  if (!outcome.started) {
    if (options.json) {
      console.log(JSON.stringify({ started: false, blockers: outcome.blockers }, null, 2));
    } else {
      console.log(chalk.red(`✗ Cannot start a run for change "${changeName}"`));
      printBlockers(outcome.blockers);
    }
    process.exitCode = 1;
    return;
  }

  const { run, runDir, dataTag } = outcome;
  const runFolder = path.relative(planningHome.root, runDir);
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          run: run.id,
          change: changeName,
          state: run.state,
          dataTag,
          runDir: runFolder,
          controlCase: run.controlCase?.source ?? null,
          readiness: run.readiness,
        },
        null,
        2
      )
    );
  } else {
    printStarted(run, dataTag, runFolder);
  }
  if (run.state === 'blocked-by-environment') {
    process.exitCode = 1;
  }
}

export async function executeConfirmCommand(options: ExecuteRunCommandOptions): Promise<void> {
  const location = resolveRun(options.run);
  const run = confirmRun(location);
  if (options.json) {
    console.log(JSON.stringify({ run: run.id, state: run.state, confirmedAt: run.readiness.confirmedAt }, null, 2));
    return;
  }
  console.log(chalk.green(`✓ Run ${run.id} is ready: the user confirmed the app serves this change's code`));
  console.log(`Store the control case plan first: qaspec execute plan --run ${run.id} --case control <plan.json>`);
}

function printReportedIssues(issues: ExecutionIssue[], json: boolean | undefined, headline: string): void {
  if (json) {
    console.log(JSON.stringify({ valid: false, errors: issues }, null, 2));
  } else {
    console.log(chalk.red(`✗ ${headline}`));
    printIssues(issues);
  }
  process.exitCode = 1;
}

/** Stores the plan for one case (or the control case) before the case runs. Plans cannot be replaced. */
export async function executePlanCommand(planPath: string, options: ExecuteCaseCommandOptions): Promise<void> {
  const location = resolveRun(options.run);
  const outcome = storePlan(location, options.case, readInputBytes(planPath, 'plan file'));
  if (!outcome.ok) {
    printReportedIssues(outcome.issues, options.json, `Plan "${planPath}" was not stored for case ${options.case}`);
    return;
  }
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          run: location.run.id,
          case: outcome.caseKey,
          path: outcome.path,
          planSha256: outcome.planSha256,
          storedAt: outcome.storedAt,
        },
        null,
        2
      )
    );
    return;
  }
  console.log(chalk.green(`✓ Plan stored for case ${outcome.caseKey}`));
  console.log(`sha256: ${outcome.planSha256}`);
}

function printRecordedChecks(evaluation: CaseEvaluation): void {
  for (const check of evaluation.checks) {
    const reason = check.reason ? `: ${check.reason}` : '';
    if (check.status === 'passed') {
      console.log(chalk.green(`  ✓ ${check.id} (step ${check.step})`));
    } else if (check.status === 'failed') {
      console.log(chalk.red(`  ✗ ${check.id} (step ${check.step})${reason}`));
    } else {
      console.log(chalk.yellow(`  ! ${check.id} (step ${check.step}, ${check.status})${reason}`));
    }
  }
  for (const item of evaluation.needsHuman) {
    console.log(chalk.yellow(`  ? step ${item.step} needs a person: ${item.reason}`));
  }
}

/**
 * Evaluates observations against the stored plan. A failed or incomplete verdict asks for one retry
 * and the second marks the case needs-triage; needs-human is final at once. Exit code 1 for any
 * verdict other than passed.
 */
export async function executeRecordCommand(observationsPath: string, options: ExecuteCaseCommandOptions): Promise<void> {
  const location = resolveRun(options.run);
  const outcome = recordObservations(location, options.case, readInputBytes(observationsPath, 'observations file'));
  if (!outcome.ok) {
    printReportedIssues(outcome.issues, options.json, `Observations were not recorded for case ${options.case}`);
    return;
  }

  const { caseKey, attempt, verdict, evaluation } = outcome;
  const next = outcome.outcome;
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          run: location.run.id,
          case: caseKey,
          attempt,
          verdict,
          outcome: next,
          planSha256: outcome.planSha256,
          observationsSha256: outcome.observationsSha256,
          checks: evaluation.checks,
          needsHuman: evaluation.needsHuman,
        },
        null,
        2
      )
    );
  } else {
    printRecordedChecks(evaluation);
    const headline = `Case ${caseKey} attempt ${attempt}: ${verdict}`;
    console.log(verdict === 'passed' ? chalk.green(headline) : chalk.red(headline));
    if (next === 'retry') {
      console.log(chalk.yellow('Outcome: retry. Run the case once more from a clean state, then record attempt 2.'));
    } else if (next === 'needs-triage') {
      console.log(chalk.red('Outcome: needs-triage. A candidate line was added to ledger.jsonl.'));
    } else if (next === 'needs-human') {
      console.log(chalk.yellow('Outcome: needs-human. A person must judge the steps listed above; no retry.'));
    }
  }
  if (verdict !== 'passed') {
    process.exitCode = 1;
  }
}

/** Closes the run: completed when the control case passed at the start and the end, otherwise environment-noise. */
export async function executeFinishCommand(options: ExecuteRunCommandOptions): Promise<void> {
  const location = resolveRun(options.run);
  const outcome = finishRun(location);
  if (options.json) {
    console.log(JSON.stringify({ run: location.run.id, state: outcome.state, reasons: outcome.reasons }, null, 2));
  } else if (outcome.state === 'completed') {
    console.log(chalk.green(`✓ Run ${location.run.id} completed: the control case passed at the start and at the end`));
  } else {
    console.log(chalk.red(`✗ Run ${location.run.id} is environment-noise: its candidates produce no findings`));
    for (const reason of outcome.reasons) {
      console.log(chalk.red(`  • ${reason}`));
    }
  }
  if (outcome.state !== 'completed') {
    process.exitCode = 1;
  }
}

function printRunStatus(run: RunRecord, ledger: LedgerCounts): void {
  console.log(`Run ${run.id} (change "${run.change}"): ${run.state}`);
  console.log(`  Data tag: ${run.dataTag}`);
  const checks = run.readiness.checks.map((check) => `${check.name} ${check.status}`).join(', ');
  console.log(`  Readiness (${run.readiness.mode}): ${checks || 'no readiness commands'}`);
  if (run.readiness.probe) {
    const { probe } = run.readiness;
    console.log(`  Probe ${probe.url}: ${probe.ok ? 'ok' : 'failed'} (${probe.httpStatus ?? probe.error})`);
  }
  if (run.controlCase) {
    const start = run.cases['control-start']?.status ?? 'missing';
    const end = run.cases['control-end']?.status ?? 'missing';
    console.log(`  Control case: start ${start}, end ${end}`);
  }
  console.log('  Cases:');
  for (const [key, record] of Object.entries(run.cases)) {
    if (key.startsWith('control-')) {
      continue;
    }
    const verdicts = record.attempts.map((attempt) => attempt.verdict).join(', ') || '-';
    console.log(`    ${key}  ${record.status}  attempts: ${verdicts}`);
  }
  console.log(`  Ledger: ${ledger.candidates} candidate(s), ${ledger.environmentNoise} marked environment-noise`);
}

/** Shows one run (--run) or lists the runs of a change (--change). */
export async function executeStatusCommand(options: ExecuteStatusOptions): Promise<void> {
  if (!options.run && !options.change) {
    throw new Error('Missing required option --run or --change');
  }

  if (options.run) {
    const { run, ledger, cases } = describeRunStatus(resolveRun(options.run));
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            run: run.id,
            change: run.change,
            state: run.state,
            dataTag: run.dataTag,
            createdAt: run.createdAt,
            finishedAt: run.finishedAt ?? null,
            finishReasons: run.finishReasons ?? [],
            readiness: run.readiness,
            controlCase: run.controlCase ?? null,
            cases,
            ledger,
          },
          null,
          2
        )
      );
    } else {
      printRunStatus(run, ledger);
    }
    return;
  }

  const planningHome = resolveCurrentPlanningHomeSync();
  const changeName = await validateChangeExists(options.change, planningHome.root, planningHome.changesDir);
  const runs = listRuns(getChangeDir(planningHome, changeName)).map((entry) => ({
    run: entry.id,
    state: entry.state,
    createdAt: entry.createdAt,
  }));
  if (options.json) {
    console.log(JSON.stringify({ change: changeName, runs }, null, 2));
  } else if (runs.length === 0) {
    console.log(`No runs for change "${changeName}"`);
  } else {
    for (const entry of runs) {
      console.log(`${entry.run}  ${entry.state}  ${entry.createdAt}`);
    }
  }
}

/* Triage (T7): the judge's input, one judgement per case, and the person's answers to the findings. */

export interface ExecuteTriageOptions extends ExecuteCaseCommandOptions {
  classification: string;
  rationale: string;
  expected?: string;
  observed?: string;
}

export interface ExecuteAnswerOptions extends ExecuteRunCommandOptions {
  finding: string;
  intended: string;
  note?: string;
}

function printTriageSummary(context: TriageContext): void {
  console.log(`Case ${context.case} of run ${context.run} needs triage: "${context.testcase.title}"`);
  for (const attempt of context.attempts) {
    console.log(`  attempt ${attempt.attempt}: ${attempt.verdict}, ${attempt.evidence.length} evidence file(s)`);
  }
  console.log('Print the full judge input with --json.');
}

/** Prints the judge's input for a case that needs triage: the full input as JSON, a summary otherwise. */
export async function executeTriageContextCommand(options: ExecuteCaseCommandOptions): Promise<void> {
  const location = resolveRun(options.run);
  const outcome = triageContext(location, options.case);
  if (!outcome.ok) {
    printReportedIssues(outcome.issues, options.json, `Triage context not shown for case ${options.case}`);
    return;
  }
  if (options.json) {
    console.log(JSON.stringify(outcome.context, null, 2));
    return;
  }
  printTriageSummary(outcome.context);
}

/** Records the judge's classification of one case, once. Only app creates a finding. */
export async function executeTriageCommand(options: ExecuteTriageOptions): Promise<void> {
  const location = resolveRun(options.run);
  const outcome = triageCase(location, options.case, {
    classification: options.classification,
    rationale: options.rationale,
    expected: options.expected,
    observed: options.observed,
  });
  if (!outcome.ok) {
    printReportedIssues(outcome.issues, options.json, `Judgement not recorded for case ${options.case}`);
    return;
  }
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          run: location.run.id,
          case: outcome.caseKey,
          classification: outcome.classification,
          rationale: outcome.rationale,
          judgedAt: outcome.judgedAt,
          finding: outcome.finding ?? null,
        },
        null,
        2
      )
    );
    return;
  }
  console.log(chalk.green(`✓ Case ${outcome.caseKey} judged as ${outcome.classification}`));
  if (outcome.finding) {
    console.log(chalk.yellow(`Finding ${outcome.finding.id}: ${outcome.finding.question}`));
    console.log(
      `Ask the person, then run: qaspec execute answer --run ${location.run.id} --finding ${outcome.finding.id} --intended yes|no`
    );
  } else {
    console.log('No finding: this classification is not reported as an app defect.');
  }
}

/** Records the person's answer to one finding, once: yes (intended) dismisses it, no confirms it. */
export async function executeAnswerCommand(options: ExecuteAnswerOptions): Promise<void> {
  const location = resolveRun(options.run);
  const outcome = answerFinding(location, {
    finding: options.finding,
    intended: options.intended,
    note: options.note,
  });
  if (!outcome.ok) {
    printReportedIssues(outcome.issues, options.json, `Answer not recorded for finding ${options.finding}`);
    return;
  }
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          run: location.run.id,
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
