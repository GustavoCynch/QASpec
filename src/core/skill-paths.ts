/**
 * Maps skill directory names to workflow IDs, including upstream OpenSpec names.
 */

import { WORKFLOW_TO_SKILL_DIR } from './profile-sync-drift.js';
import { ALL_WORKFLOWS } from './profiles.js';
import type { WorkflowId } from './profiles.js';

/** Upstream OpenSpec skill dirs that differ from QASpec's WORKFLOW_TO_SKILL_DIR mapping. */
const OPENSPEC_ALT_SKILL_DIR_TO_WORKFLOW: Record<string, WorkflowId> = {
  'openspec-explore': 'explore',
  'openspec-archive-change': 'archive',
};

/**
 * Resolves a skill directory name to its workflow ID, if known.
 */
export function workflowIdForSkillDir(dirName: string): WorkflowId | undefined {
  const alt = OPENSPEC_ALT_SKILL_DIR_TO_WORKFLOW[dirName];
  if (alt) {
    return alt;
  }

  for (const workflow of ALL_WORKFLOWS) {
    if (WORKFLOW_TO_SKILL_DIR[workflow] === dirName) {
      return workflow;
    }
  }

  return undefined;
}
