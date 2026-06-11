import { createHash, randomBytes } from 'node:crypto';
import * as path from 'node:path';
import type { ChangeMetadata } from './artifact-graph/types.js';
import {
  evaluateAnalyzeApproval,
  computeAnalyzeContentHash,
} from './approval-ledger.js';
import { validateCases } from './cases-validation.js';
import { resolveTcmsTarget, type TcmsTarget } from './tcms-target.js';
import {
  readChangeMetadata,
  writeChangeMetadata,
  ChangeMetadataError,
} from '../utils/change-metadata.js';

export interface PublishGateFailure {
  code: string;
  message: string;
  resolve: string;
}

export interface PublishGateResult {
  passed: boolean;
  token?: string;
  failures: PublishGateFailure[];
  casesSummary?: {
    coveredRequirements: number;
    totalRequirements: number;
  };
  tcms?: TcmsTarget;
}


function deriveGateToken(contentHash: string, nonce: string): string {
  const digest = createHash('sha256')
    .update(contentHash)
    .update(':')
    .update(nonce)
    .digest('hex');
  return `qaspec-gate:${digest.slice(0, 8)}`;
}

/**
 * Runs publish gate checks for a change.
 */
export function runPublishGate(
  changeDir: string,
  projectRoot: string,
  options: { headSha?: string } = {}
): PublishGateResult {
  const failures: PublishGateFailure[] = [];

  const approval = evaluateAnalyzeApproval(changeDir, {
    headSha: options.headSha,
    projectRoot,
  });

  if (approval.state === 'missing') {
    failures.push({
      code: 'approval-missing',
      message: 'Analyze phase has not been approved',
      resolve: 'qaspec approve analyze --change <name>',
    });
  } else if (approval.state === 'stale') {
    const detail =
      approval.reason === 'head-moved'
        ? 'PR head moved since approval'
        : 'Analyze artifacts changed since approval';
    failures.push({
      code: 'approval-stale',
      message: `Approval is stale: ${detail}`,
      resolve: 'Re-run /qsx:analyze halt and qaspec approve analyze --change <name>',
    });
  }

  const casesResult = validateCases(changeDir);
  if (!casesResult.valid) {
    failures.push({
      code: 'cases-validation-failed',
      message: `Cases validation failed (${casesResult.errors.length} error(s))`,
      resolve: 'qaspec validate cases --change <name>',
    });
  }

  const resolvedTcms = resolveTcmsTarget(changeDir, projectRoot);
  if (!resolvedTcms.usable) {
    failures.push({
      code: 'tcms-missing',
      message:
        'Change has no usable TCMS target (provider + project) in .openspec.yaml or config defaults',
      resolve:
        'qaspec tcms set --change <name> --provider qase --project <CODE> [--base-url <url>]',
    });
  }

  if (failures.length > 0) {
    return {
      passed: false,
      failures,
      casesSummary: {
        coveredRequirements: casesResult.coverage.coveredRequirements,
        totalRequirements: casesResult.coverage.totalRequirements,
      },
    };
  }

  const { hash } = computeAnalyzeContentHash(changeDir);
  const nonce = randomBytes(16).toString('hex');
  const token = deriveGateToken(hash, nonce);

  persistPublishGate(changeDir, { nonce, contentHash: hash }, projectRoot);

  return {
    passed: true,
    token,
    failures: [],
    casesSummary: {
      coveredRequirements: casesResult.coverage.coveredRequirements,
      totalRequirements: casesResult.coverage.totalRequirements,
    },
    tcms: resolvedTcms.target,
  };
}

function persistPublishGate(
  changeDir: string,
  gate: NonNullable<ChangeMetadata['publishGate']>,
  projectRoot?: string
): void {
  const metaPath = path.join(changeDir, '.openspec.yaml');
  const existing = readChangeMetadata(changeDir, projectRoot);
  if (!existing) {
    throw new ChangeMetadataError(
      'Change metadata not found; create the change before running publish gate',
      metaPath
    );
  }

  writeChangeMetadata(
    changeDir,
    {
      ...existing,
      publishGate: gate,
    },
    projectRoot
  );
}

export function readPublishGateToken(
  changeDir: string,
  projectRoot?: string
): string | null {
  const metadata = readChangeMetadata(changeDir, projectRoot);
  const gate = metadata?.publishGate;
  if (!gate?.nonce || !gate.contentHash) {
    return null;
  }
  return deriveGateToken(gate.contentHash, gate.nonce);
}
