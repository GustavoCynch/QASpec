/**
 * TCMS Target Command
 *
 * Persists and inspects the per-change TCMS publish target stored in the
 * change's .qaspec.yaml. Project config `tcms` only supplies defaults and
 * is never written by this command.
 */

import chalk from 'chalk';
import ora from 'ora';
import { resolveCurrentPlanningHomeSync, getChangeDir } from '../core/planning-home.js';
import {
  resolveTcmsTarget,
  writeTcmsTarget,
  type TcmsTarget,
} from '../core/tcms-target.js';
import { validateChangeExists } from './workflow/shared.js';

export interface TcmsSetOptions {
  change?: string;
  provider?: string;
  project?: string;
  baseUrl?: string;
  json?: boolean;
}

export interface TcmsShowOptions {
  change?: string;
  json?: boolean;
}

async function resolveChangeDir(change?: string) {
  if (!change) {
    throw new Error('Missing required option --change');
  }
  const planningHome = resolveCurrentPlanningHomeSync();
  const projectRoot = planningHome.root;
  const changeName = await validateChangeExists(
    change,
    projectRoot,
    planningHome.changesDir
  );
  return { changeDir: getChangeDir(planningHome, changeName), projectRoot, changeName };
}

export async function tcmsSetCommand(options: TcmsSetOptions): Promise<void> {
  const fields: TcmsTarget = {
    ...(options.provider ? { provider: options.provider } : {}),
    ...(options.project ? { project: options.project } : {}),
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
  };

  if (Object.keys(fields).length === 0) {
    throw new Error(
      'Nothing to set. Provide at least one of --provider, --project, --base-url'
    );
  }

  const spinner = options.json ? undefined : ora('Saving TCMS target...').start();

  try {
    const { changeDir, projectRoot, changeName } = await resolveChangeDir(
      options.change
    );
    const target = writeTcmsTarget(changeDir, fields, projectRoot);
    const resolved = resolveTcmsTarget(changeDir, projectRoot);

    spinner?.stop();

    if (options.json) {
      console.log(
        JSON.stringify(
          { change: changeName, tcms: target, usable: resolved.usable },
          null,
          2
        )
      );
      return;
    }

    console.log(chalk.green(`✓ TCMS target saved for change "${changeName}"`));
    printTarget(target);
    if (!resolved.usable) {
      console.log(
        chalk.yellow(
          'Target is not usable yet: provider and project are both required for publish.'
        )
      );
    }
  } catch (error) {
    spinner?.stop();
    throw error;
  }
}

export async function tcmsShowCommand(options: TcmsShowOptions): Promise<void> {
  const { changeDir, projectRoot, changeName } = await resolveChangeDir(
    options.change
  );
  const resolved = resolveTcmsTarget(changeDir, projectRoot);

  if (options.json) {
    console.log(JSON.stringify({ change: changeName, ...resolved }, null, 2));
    return;
  }

  if (Object.keys(resolved.target).length === 0) {
    console.log(chalk.yellow(`No TCMS target resolved for change "${changeName}"`));
    console.log(
      'Set one with: qaspec tcms set --change <name> --provider <provider> --project <CODE> [--base-url <url>]'
    );
    return;
  }

  console.log(`TCMS target for change "${changeName}":`);
  printTarget(resolved.target, resolved.sources);
  if (!resolved.usable) {
    console.log(
      chalk.yellow('Target is not usable yet: provider and project are both required.')
    );
  }
}

function printTarget(
  target: TcmsTarget,
  sources?: Partial<Record<keyof TcmsTarget, 'change' | 'config'>>
): void {
  for (const field of ['provider', 'project', 'baseUrl'] as const) {
    if (target[field]) {
      const origin = sources?.[field] ? ` (${sources[field]})` : '';
      console.log(`  ${field}: ${target[field]}${origin}`);
    }
  }
}
