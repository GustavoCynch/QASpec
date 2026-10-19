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
