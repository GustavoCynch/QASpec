/**
 * Execute Commands
 *
 * Support commands for /qsx:execute (agent-driven browser runs of approved test cases).
 */

import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { resolveCurrentPlanningHomeSync } from '../core/planning-home.js';
import { executeLogin } from '../core/execution-auth.js';

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
