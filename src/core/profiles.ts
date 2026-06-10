/**
 * Profile System
 *
 * Defines workflow profiles that control which workflows are installed.
 * Profiles determine WHICH workflows; delivery (in global config) determines HOW.
 */

import type { Profile } from './global-config.js';

/**
 * Core workflows included in the 'core' profile.
 * These provide the streamlined experience for new users.
 */
export const CORE_WORKFLOWS = ['analyze', 'cases', 'publish', 'archive'] as const;

/** Legacy QASpec workflow ids mapped to their new name at resolution (not retired). */
export const RENAMED_QAS_WORKFLOW_IDS: Record<string, string> = { matrix: 'cases' };

/**
 * Legacy OpenSpec core workflow set (pre-QASpec). Global configs still on this
 * custom profile should auto-migrate to {@link CORE_WORKFLOWS}.
 */
export const OLD_CORE_WORKFLOWS = ['propose', 'explore', 'apply', 'archive'] as const;

/**
 * Returns true when workflows are exactly the legacy OpenSpec core set (order-independent).
 */
export function isLegacyCoreWorkflowSet(workflows: readonly string[] | undefined): boolean {
  if (!workflows || workflows.length !== OLD_CORE_WORKFLOWS.length) {
    return false;
  }
  const set = new Set(workflows);
  return OLD_CORE_WORKFLOWS.every((workflow) => set.has(workflow));
}

/**
 * All QASpec workflow ids available for profile configuration.
 */
export const ALL_WORKFLOWS = [...CORE_WORKFLOWS] as const;

export type WorkflowId = (typeof ALL_WORKFLOWS)[number];
export type CoreWorkflowId = (typeof CORE_WORKFLOWS)[number];

const CORE_WORKFLOW_SET = new Set<string>(CORE_WORKFLOWS);

/** Retired QASpec workflow ids filtered from resolution (still valid in legacy detection inputs). */
export const RETIRED_QAS_WORKFLOW_IDS = ['explore'] as const;

const RETIRED_QAS_WORKFLOW_SET = new Set<string>(RETIRED_QAS_WORKFLOW_IDS);

function resolveWorkflowId(workflow: string): string {
  return RENAMED_QAS_WORKFLOW_IDS[workflow] ?? workflow;
}

function filterToQasWorkflows(workflows: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const workflow of workflows) {
    const resolved = resolveWorkflowId(workflow);
    if (!CORE_WORKFLOW_SET.has(resolved) || seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    result.push(resolved);
  }
  return result;
}

/**
 * Returns retired workflow ids present in a custom profile workflow list.
 */
export function getRetiredWorkflowIds(customWorkflows: readonly string[] | undefined): readonly string[] {
  if (!customWorkflows) {
    return [];
  }
  return customWorkflows.filter((workflow) => RETIRED_QAS_WORKFLOW_SET.has(workflow));
}

/**
 * One-line notice for each retired workflow id skipped during resolution.
 */
export function formatRetiredWorkflowNotice(retiredId: string): string {
  return `Skipped retired workflow id "${retiredId}" — investigation now starts with /qsx:analyze`;
}

/**
 * Returns legacy workflow ids in a custom profile that map to a renamed id.
 */
export function getRenamedWorkflowIds(
  customWorkflows: readonly string[] | undefined
): readonly string[] {
  if (!customWorkflows) {
    return [];
  }
  return customWorkflows.filter((workflow) => workflow in RENAMED_QAS_WORKFLOW_IDS);
}

/**
 * One-line notice for each legacy workflow id mapped during resolution.
 */
export function formatRenamedWorkflowNotice(legacyId: string): string {
  const newId = RENAMED_QAS_WORKFLOW_IDS[legacyId];
  return `Renamed workflow id "${legacyId}" → "${newId}" (use /qsx:${newId})`;
}

/**
 * Notices for renamed workflow ids in a custom profile (empty for core profile callers).
 */
export function getRenamedWorkflowNotices(
  profile: Profile,
  customWorkflows?: readonly string[]
): string[] {
  if (profile !== 'custom') {
    return [];
  }
  return getRenamedWorkflowIds(customWorkflows).map(formatRenamedWorkflowNotice);
}

/**
 * Notices for retired workflow ids in a custom profile (empty for core profile callers).
 */
export function getRetiredWorkflowNotices(
  profile: Profile,
  customWorkflows?: readonly string[]
): string[] {
  if (profile !== 'custom') {
    return [];
  }
  return getRetiredWorkflowIds(customWorkflows).map(formatRetiredWorkflowNotice);
}

/**
 * Resolves which workflows should be active for a given profile configuration.
 *
 * - 'core' profile always returns CORE_WORKFLOWS
 * - 'custom' profile returns only QASpec workflow ids from customWorkflows
 */
export function getProfileWorkflows(
  profile: Profile,
  customWorkflows?: string[]
): readonly string[] {
  if (profile === 'custom') {
    return filterToQasWorkflows(customWorkflows ?? []);
  }
  return CORE_WORKFLOWS;
}
