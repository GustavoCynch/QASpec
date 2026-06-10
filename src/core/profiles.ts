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
export const CORE_WORKFLOWS = ['analyze', 'matrix', 'publish', 'archive'] as const;

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

function filterToQasWorkflows(workflows: readonly string[]): readonly string[] {
  return workflows.filter((workflow) => CORE_WORKFLOW_SET.has(workflow));
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
