/**
 * Catch landing commands (T11, S9, D4). `qaspec catch land` prepares the landing of a classified run and prints the
 * patch against the head; `qaspec catch landed` records it once, after the person applied the patch in the checkout.
 * Like the other catch commands they run in the repository, print JSON with --json, and a refusal lists every reason
 * and exits with code 1. Neither command touches the user's checkout.
 */

import chalk from 'chalk';
import { prepareLanding, recordLanded, type LandedTest, type RefusedLandTest } from '../core/catch-land.js';
import type { CatchRecordIssue } from '../core/catch-run.js';
import { resolveCurrentPlanningHomeSync, type PlanningHome } from '../core/planning-home.js';

export interface CatchLandCommandOptions {
  run: string;
  json?: boolean;
}

export interface CatchLandedCommandOptions {
  run: string;
  json?: boolean;
}

/** The repository's planning home: catch runs from a repository directory, not from a workspace root (as catch.ts). */
function repositoryHome(): PlanningHome {
  const planningHome = resolveCurrentPlanningHomeSync();
  if (planningHome.kind !== 'repo') {
    throw new Error('qaspec catch runs in a repository; run it from the repository directory, not from a workspace root');
  }
  return planningHome;
}

/** A refusal: every issue listed, nothing written, exit code 1. */
function printRefusal(run: string, headline: string, issues: CatchRecordIssue[], json: boolean | undefined): void {
  if (json) {
    console.log(JSON.stringify({ run, status: 'refused', errors: issues }, null, 2));
  } else {
    console.log(chalk.red(`✗ ${headline} for run ${run}`));
    for (const issue of issues) {
      console.log(chalk.red(`  • ${issue.message}`));
    }
  }
  process.exitCode = 1;
}

const describeLanded = (test: LandedTest): string => `  ${test.test} (${test.kind}): ${test.path}`;

function describeRefused(test: RefusedLandTest): string {
  const subject = test.path === null ? '' : ` (${test.path})`;
  return `  Not landed: ${test.test}${subject}: ${test.reason}`;
}

/**
 * Prepares the landing of a classified run: the copies and the patch against the head, inside the run folder. A run with
 * no test to land is an outcome, not a refusal, and exits with code 0. Only a run that cannot be landed is refused.
 */
export async function catchLandCommand(options: CatchLandCommandOptions): Promise<void> {
  const planningHome = repositoryHome();
  const outcome = await prepareLanding({
    projectRoot: planningHome.root,
    changesDir: planningHome.changesDir,
    runId: options.run,
  });
  if (outcome.status === 'refused') {
    printRefusal(options.run, 'Nothing was prepared to land', outcome.issues, options.json);
    return;
  }

  const { landing, patchPath } = outcome;
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          run: landing.run,
          change: landing.change,
          status: 'prepared',
          headSha: landing.headSha,
          patch: patchPath,
          tests: landing.tests,
          refused: landing.refused,
        },
        null,
        2
      )
    );
    return;
  }

  const head = landing.headSha.slice(0, 12);
  if (landing.tests.length === 0) {
    console.log(`No test of run ${landing.run} is prepared to land against head ${head}`);
  } else {
    const count = `${landing.tests.length} test(s) of run ${landing.run}`;
    console.log(chalk.green(`✓ ${count} prepared to land against head ${head}`));
    for (const test of landing.tests) {
      console.log(describeLanded(test));
    }
    console.log(`  Patch: ${patchPath}`);
    console.log('  Apply it from the repository root (git apply --check first), then run:');
    console.log(`  qaspec catch landed --run ${landing.run}`);
  }
  for (const test of landing.refused) {
    console.log(describeRefused(test));
  }
}

/** Records the landing once, after the patch was applied in the checkout: one landed ledger line per prepared test. */
export async function catchLandedCommand(options: CatchLandedCommandOptions): Promise<void> {
  const planningHome = repositoryHome();
  const outcome = await recordLanded({ changesDir: planningHome.changesDir, runId: options.run });
  if (outcome.status === 'refused') {
    printRefusal(options.run, 'Landing was not recorded', outcome.issues, options.json);
    return;
  }

  if (options.json) {
    console.log(
      JSON.stringify({ run: outcome.run, change: outcome.change, status: 'recorded', landed: outcome.landed }, null, 2)
    );
    return;
  }
  console.log(chalk.green(`✓ Landing of run ${outcome.run} recorded: ${outcome.landed.length} test(s)`));
  for (const test of outcome.landed) {
    console.log(`  ${test.test} (${test.kind}): ${test.path}`);
  }
}
