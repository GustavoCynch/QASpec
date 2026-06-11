/**
 * Approve Command
 *
 * Records phase approval in the change's .qaspec.yaml approval ledger.
 */

import chalk from 'chalk';
import ora from 'ora';
import { resolveCurrentPlanningHomeSync, getChangeDir } from '../core/planning-home.js';
import {
  computeAnalyzeContentHash,
  writeApprovalRecord,
  type ApprovalPhase,
} from '../core/approval-ledger.js';
import { validateChangeExists } from './workflow/shared.js';

export interface ApproveOptions {
  change?: string;
  headSha?: string;
  json?: boolean;
}

const SUPPORTED_PHASES = new Set<ApprovalPhase>(['analyze']);

export async function approveCommand(
  phase: string,
  options: ApproveOptions
): Promise<void> {
  if (!SUPPORTED_PHASES.has(phase as ApprovalPhase)) {
    throw new Error(
      `Unknown approval phase "${phase}". Supported: ${[...SUPPORTED_PHASES].join(', ')}`
    );
  }

  if (!options.change) {
    throw new Error('Missing required option --change');
  }

  const spinner = options.json ? undefined : ora('Recording approval...').start();

  try {
    const planningHome = resolveCurrentPlanningHomeSync();
    const projectRoot = planningHome.root;
    const changeName = await validateChangeExists(
      options.change,
      projectRoot,
      planningHome.changesDir
    );
    const changeDir = getChangeDir(planningHome, changeName);

    const { hash, artifacts } = computeAnalyzeContentHash(changeDir);

    if (artifacts.length === 0) {
      throw new Error(
        'No analyze artifacts found to approve. Create analysis.md and delta specs first.'
      );
    }

    const record = {
      approvedAt: new Date().toISOString(),
      contentHash: hash,
      ...(options.headSha ? { headSha: options.headSha } : {}),
    };

    writeApprovalRecord(changeDir, phase as ApprovalPhase, record, projectRoot);

    spinner?.stop();

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            change: changeName,
            phase,
            approval: record,
            hashedArtifacts: artifacts.map((a) => a.relativePath),
          },
          null,
          2
        )
      );
      return;
    }

    console.log(chalk.green(`✓ Approved ${phase} phase for change "${changeName}"`));
    console.log();
    console.log(`Content hash: ${hash}`);
    if (options.headSha) {
      console.log(`PR head SHA:  ${options.headSha}`);
    }
    console.log();
    console.log('Hashed artifacts:');
    for (const artifact of artifacts) {
      console.log(`  • ${artifact.relativePath}`);
    }
  } catch (error) {
    spinner?.stop();
    throw error;
  }
}
