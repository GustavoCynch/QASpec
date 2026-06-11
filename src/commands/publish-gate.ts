/**
 * Publish Gate Command
 */

import chalk from 'chalk';
import ora from 'ora';
import { resolveCurrentPlanningHomeSync, getChangeDir } from '../core/planning-home.js';
import { runPublishGate } from '../core/publish-gate.js';
import { validateChangeExists } from './workflow/shared.js';

export interface PublishGateOptions {
  change?: string;
  headSha?: string;
  json?: boolean;
}

export async function publishGateCommand(options: PublishGateOptions): Promise<void> {
  if (!options.change) {
    throw new Error('Missing required option --change');
  }

  const spinner = options.json ? undefined : ora('Running publish gate...').start();

  try {
    const planningHome = resolveCurrentPlanningHomeSync();
    const projectRoot = planningHome.root;
    const changeName = await validateChangeExists(
      options.change,
      projectRoot,
      planningHome.changesDir
    );
    const changeDir = getChangeDir(planningHome, changeName);
    const result = runPublishGate(changeDir, projectRoot, { headSha: options.headSha });

    spinner?.stop();

    if (options.json) {
      console.log(JSON.stringify({ change: changeName, ...result }, null, 2));
    } else if (result.passed && result.token) {
      console.log(chalk.green(`✓ Publish gate passed for "${changeName}"`));
      console.log(`Token: ${result.token}`);
      if (result.casesSummary) {
        console.log(
          `Cases coverage: ${result.casesSummary.coveredRequirements}/${result.casesSummary.totalRequirements} requirements`
        );
      }
    } else {
      console.log(chalk.red(`✗ Publish gate failed for "${changeName}"`));
      for (const failure of result.failures) {
        console.log(chalk.red(`  • ${failure.message}`));
        console.log(`    Resolve: ${failure.resolve}`);
      }
    }

    if (!result.passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    spinner?.stop();
    throw error;
  }
}
