/**
 * Validate Cases Command
 */

import chalk from 'chalk';
import ora from 'ora';
import { resolveCurrentPlanningHomeSync, getChangeDir } from '../core/planning-home.js';
import { validateCases } from '../core/cases-validation.js';
import { validateChangeExists } from './workflow/shared.js';

export interface ValidateCasesOptions {
  change?: string;
  json?: boolean;
}

export async function validateCasesCommand(options: ValidateCasesOptions): Promise<void> {
  if (!options.change) {
    throw new Error('Missing required option --change');
  }

  const spinner = options.json ? undefined : ora('Validating cases...').start();

  try {
    const planningHome = resolveCurrentPlanningHomeSync();
    const projectRoot = planningHome.root;
    const changeName = await validateChangeExists(
      options.change,
      projectRoot,
      planningHome.changesDir
    );
    const changeDir = getChangeDir(planningHome, changeName);
    const result = validateCases(changeDir);

    spinner?.stop();

    if (options.json) {
      console.log(JSON.stringify({ change: changeName, ...result }, null, 2));
    } else if (result.valid) {
      console.log(chalk.green(`✓ Cases validation passed for "${changeName}"`));
      console.log(
        `Coverage: ${result.coverage.coveredRequirements}/${result.coverage.totalRequirements} requirements`
      );
      for (const [cap, stats] of Object.entries(result.coverage.byCapability)) {
        console.log(`  ${cap}: ${stats.covered}/${stats.total}`);
      }
      if (result.warnings.length > 0) {
        console.log();
        console.log(chalk.yellow('Warnings:'));
        for (const warning of result.warnings) {
          console.log(chalk.yellow(`  • ${warning.message}`));
        }
      }
    } else {
      console.log(chalk.red(`✗ Cases validation failed for "${changeName}"`));
      for (const error of result.errors) {
        const loc = error.line ? ` (line ${error.line})` : '';
        console.log(chalk.red(`  • ${error.message}${loc}`));
      }
      for (const warning of result.warnings) {
        console.log(chalk.yellow(`  ⚠ ${warning.message}`));
      }
    }

    if (!result.valid) {
      process.exitCode = 1;
    }
  } catch (error) {
    spinner?.stop();
    throw error;
  }
}
