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
export const CORE_WORKFLOWS = ['explore', 'analyze', 'matrix', 'publish', 'archive'] as const;

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
 * All available workflows in the system.
 */
export const ALL_WORKFLOWS = [
  'propose',
  'explore',
  'analyze',
  'matrix',
  'publish',
  'new',
  'continue',
  'apply',
  'ff',
  'sync',
  'archive',
  'bulk-archive',
  'verify',
  'onboard',
] as const;

export type WorkflowId = (typeof ALL_WORKFLOWS)[number];
export type CoreWorkflowId = (typeof CORE_WORKFLOWS)[number];

/**
 * Resolves which workflows should be active for a given profile configuration.
 *
 * - 'core' profile always returns CORE_WORKFLOWS
 * - 'custom' profile returns the provided customWorkflows, or empty array if not provided
 */
export function getProfileWorkflows(
  profile: Profile,
  customWorkflows?: string[]
): readonly string[] {
  if (profile === 'custom') {
    return customWorkflows ?? [];
  }
  return CORE_WORKFLOWS;
}
