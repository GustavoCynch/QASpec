/**
 * Maps skill directory names to workflow IDs.
 */

import { WORKFLOW_TO_SKILL_DIR } from './profile-sync-drift.js';
import { ALL_WORKFLOWS } from './profiles.js';
import type { WorkflowId } from './profiles.js';

/**
 * Resolves a skill directory name to its workflow ID, if known.
 */
export function workflowIdForSkillDir(dirName: string): WorkflowId | undefined {
  for (const workflow of ALL_WORKFLOWS) {
    if (WORKFLOW_TO_SKILL_DIR[workflow] === dirName) {
      return workflow;
    }
  }

  return undefined;
}
