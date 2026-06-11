import { readProjectConfig } from './project-config.js';
import {
  readChangeMetadata,
  writeChangeMetadata,
  ChangeMetadataError,
} from '../utils/change-metadata.js';

export interface TcmsTarget {
  provider?: string;
  project?: string;
  baseUrl?: string;
}

export type TcmsFieldSource = 'change' | 'config';

export interface ResolvedTcmsTarget {
  target: TcmsTarget;
  /** Where each present field came from (change metadata wins over config defaults). */
  sources: Partial<Record<keyof TcmsTarget, TcmsFieldSource>>;
  /** True when provider and project are both present after merging. */
  usable: boolean;
}

const TCMS_FIELDS: (keyof TcmsTarget)[] = ['provider', 'project', 'baseUrl'];

/**
 * Resolves the TCMS publish target for a change.
 *
 * The change's `.openspec.yaml` `tcms` block is authoritative; the project
 * config `tcms` block only fills missing fields (user-managed defaults for
 * teams with a fixed target). Publish flows must never write the project
 * config block — per-change persistence goes through writeTcmsTarget.
 */
export function resolveTcmsTarget(
  changeDir: string,
  projectRoot: string
): ResolvedTcmsTarget {
  let changeTcms: TcmsTarget = {};
  try {
    changeTcms = readChangeMetadata(changeDir, projectRoot)?.tcms ?? {};
  } catch {
    // Unreadable metadata is reported elsewhere; treat as no change-level target
  }
  const configTcms: TcmsTarget = readProjectConfig(projectRoot)?.tcms ?? {};

  const target: TcmsTarget = {};
  const sources: ResolvedTcmsTarget['sources'] = {};

  for (const field of TCMS_FIELDS) {
    if (changeTcms[field]) {
      target[field] = changeTcms[field];
      sources[field] = 'change';
    } else if (configTcms[field]) {
      target[field] = configTcms[field];
      sources[field] = 'config';
    }
  }

  return {
    target,
    sources,
    usable: !!(target.provider && target.project),
  };
}

/**
 * Persists (upserts) the TCMS target into the change's `.openspec.yaml`.
 * Fields not provided keep their existing change-level values.
 */
export function writeTcmsTarget(
  changeDir: string,
  target: TcmsTarget,
  projectRoot?: string
): TcmsTarget {
  const existing = readChangeMetadata(changeDir, projectRoot);
  if (!existing) {
    throw new ChangeMetadataError(
      'Change metadata not found; create the change before setting a TCMS target',
      changeDir
    );
  }

  const merged: TcmsTarget = { ...existing.tcms };
  for (const field of TCMS_FIELDS) {
    if (target[field]) {
      merged[field] = target[field];
    }
  }

  writeChangeMetadata(changeDir, { ...existing, tcms: merged }, projectRoot);
  return merged;
}
