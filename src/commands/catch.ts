/**
 * Catch Commands
 *
 * Support commands for /qsx:catch (catching tests generated from the approved change intent).
 */

import chalk from 'chalk';
import { buildCatchIntent, CATCH_INTENT_SCHEMA, type CatchIntent, type CatchRequirement } from '../core/catch-intent.js';
import { resolveCurrentPlanningHomeSync } from '../core/planning-home.js';
import { validateChangeExists } from './workflow/shared.js';

export interface CatchIntentCommandOptions {
  change?: string;
  json?: boolean;
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

  const planningHome = resolveCurrentPlanningHomeSync();
  if (planningHome.kind !== 'repo') {
    throw new Error(
      'qaspec catch runs in a repository; run it from the repository directory, not from a workspace root'
    );
  }
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
