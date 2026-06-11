import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import fg from 'fast-glob';
import { LEGACY_GENERATES_ALIASES } from './artifact-graph/outputs.js';
import type { ChangeMetadata } from './artifact-graph/types.js';
import {
  readChangeMetadata,
  writeChangeMetadata,
  ChangeMetadataError,
} from '../utils/change-metadata.js';

export type ApprovalPhase = 'analyze';

export interface ApprovalRecord {
  approvedAt: string;
  contentHash: string;
  headSha?: string;
}

export interface HashedArtifact {
  /** POSIX relative path from the change directory */
  relativePath: string;
  absolutePath: string;
}

const ANALYSIS_FILENAME = 'analysis.md';

/**
 * Normalizes file content for deterministic hashing (CRLF → LF).
 */
export function normalizeContentForHash(content: string): string {
  return content.replace(/\r\n?/g, '\n');
}

/**
 * Converts a path relative to changeDir to a POSIX path for hashing.
 */
export function toHashRelativePath(changeDir: string, absolutePath: string): string {
  const relative = path.relative(changeDir, absolutePath);
  return relative.split(path.sep).join('/');
}

function resolveSingleFile(changeDir: string, filename: string): string | null {
  const fullPath = path.join(changeDir, filename);
  try {
    return fs.statSync(fullPath).isFile() ? fullPath : null;
  } catch {
    return null;
  }
}

/**
 * Resolves analysis.md, falling back to legacy analisis.md when needed.
 */
export function resolveAnalysisFile(changeDir: string): string | null {
  const primary = resolveSingleFile(changeDir, ANALYSIS_FILENAME);
  if (primary) {
    return primary;
  }
  const legacyName = LEGACY_GENERATES_ALIASES[ANALYSIS_FILENAME];
  return legacyName ? resolveSingleFile(changeDir, legacyName) : null;
}

/**
 * Lists artifacts included in the analyze-phase content hash, in hash order.
 */
export function listAnalyzeHashedArtifacts(changeDir: string): HashedArtifact[] {
  const artifacts: HashedArtifact[] = [];

  const analysisPath = resolveAnalysisFile(changeDir);
  if (analysisPath) {
    artifacts.push({
      relativePath: toHashRelativePath(changeDir, analysisPath),
      absolutePath: analysisPath,
    });
  }

  const specMatches = fg
    .sync('specs/**/*.md', { cwd: changeDir, onlyFiles: true, absolute: true })
    .sort((a, b) =>
      toHashRelativePath(changeDir, a).localeCompare(toHashRelativePath(changeDir, b))
    );

  for (const specPath of specMatches) {
    artifacts.push({
      relativePath: toHashRelativePath(changeDir, specPath),
      absolutePath: specPath,
    });
  }

  return artifacts;
}

/**
 * Computes the canonical SHA-256 hash for analyze-phase artifacts.
 */
export function computeAnalyzeContentHash(changeDir: string): {
  hash: string;
  artifacts: HashedArtifact[];
} {
  const artifacts = listAnalyzeHashedArtifacts(changeDir);
  const hash = createHash('sha256');

  for (const artifact of artifacts) {
    const raw = fs.readFileSync(artifact.absolutePath, 'utf-8');
    const normalized = normalizeContentForHash(raw);
    hash.update(`${artifact.relativePath}\n`);
    hash.update(normalized);
  }

  return { hash: `sha256:${hash.digest('hex')}`, artifacts };
}

export function readApprovalRecord(
  changeDir: string,
  phase: ApprovalPhase,
  projectRoot?: string
): ApprovalRecord | null {
  const metadata = readChangeMetadata(changeDir, projectRoot);
  return metadata?.approvals?.[phase] ?? null;
}

export function writeApprovalRecord(
  changeDir: string,
  phase: ApprovalPhase,
  record: ApprovalRecord,
  projectRoot?: string
): void {
  const metaPath = path.join(changeDir, '.openspec.yaml');
  const existing = readChangeMetadata(changeDir, projectRoot);
  if (!existing) {
    throw new ChangeMetadataError(
      'Change metadata not found; create the change before recording approval',
      metaPath
    );
  }

  const updated: ChangeMetadata = {
    ...existing,
    approvals: {
      ...existing.approvals,
      [phase]: record,
    },
  };

  writeChangeMetadata(changeDir, updated, projectRoot);
}

export type ApprovalState = 'valid' | 'stale' | 'missing';
export type ApprovalStaleReason = 'content-changed' | 'head-moved';

export interface ApprovalStatus {
  state: ApprovalState;
  reason?: ApprovalStaleReason;
  record?: ApprovalRecord;
  currentHash?: string;
}

/**
 * Evaluates approval status for the analyze phase.
 */
export function evaluateAnalyzeApproval(
  changeDir: string,
  options: { headSha?: string; projectRoot?: string } = {}
): ApprovalStatus {
  const record = readApprovalRecord(changeDir, 'analyze', options.projectRoot);
  if (!record) {
    return { state: 'missing' };
  }

  const { hash: currentHash } = computeAnalyzeContentHash(changeDir);

  if (record.contentHash !== currentHash) {
    return { state: 'stale', reason: 'content-changed', record, currentHash };
  }

  if (
    options.headSha &&
    record.headSha &&
    record.headSha !== options.headSha
  ) {
    return { state: 'stale', reason: 'head-moved', record, currentHash };
  }

  return { state: 'valid', record, currentHash };
}
