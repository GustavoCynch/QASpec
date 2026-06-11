/**
 * Scans user projects for installed QASpec workflow skills and commands.
 */

import path from 'path';
import * as fs from 'fs';
import type { AIToolOption } from './config.js';
import { CommandAdapterRegistry } from './command-generation/index.js';
import { ALL_WORKFLOWS, RETIRED_QAS_WORKFLOW_IDS } from './profiles.js';
import { qaspecSkillDirName } from './qaspec-commands.js';
import { SKILL_NAMES } from './shared/tool-detection.js';
import { workflowIdForSkillDir } from './skill-paths.js';

function scanInstalledWorkflowArtifacts(
  projectPath: string,
  tools: AIToolOption[]
): string[] {
  const installed = new Set<string>();

  for (const tool of tools) {
    if (!tool.skillsDir) continue;
    const skillsDir = path.join(projectPath, tool.skillsDir, 'skills');

    for (const skillDirName of SKILL_NAMES) {
      const skillFile = path.join(skillsDir, skillDirName, 'SKILL.md');
      if (!fs.existsSync(skillFile)) {
        continue;
      }
      const workflowId = workflowIdForSkillDir(skillDirName);
      if (workflowId) {
        installed.add(workflowId);
      }
    }

    const adapter = CommandAdapterRegistry.get(tool.value);
    if (!adapter) continue;

    for (const workflowId of [...ALL_WORKFLOWS, ...RETIRED_QAS_WORKFLOW_IDS]) {
      const commandPath = adapter.getFilePath(workflowId);
      const fullPath = path.isAbsolute(commandPath)
        ? commandPath
        : path.join(projectPath, commandPath);
      if (fs.existsSync(fullPath)) {
        installed.add(workflowId);
      }
    }

    for (const workflowId of RETIRED_QAS_WORKFLOW_IDS) {
      const skillDirName = qaspecSkillDirName(workflowId);
      if (SKILL_NAMES.includes(skillDirName as (typeof SKILL_NAMES)[number])) {
        continue;
      }
      const skillFile = path.join(skillsDir, skillDirName, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        installed.add(workflowId);
      }
    }
  }

  const knownWorkflowOrder = [...ALL_WORKFLOWS, ...RETIRED_QAS_WORKFLOW_IDS];
  return knownWorkflowOrder.filter((workflowId) => installed.has(workflowId));
}

export function scanInstalledWorkflows(projectPath: string, tools: AIToolOption[]): string[] {
  return scanInstalledWorkflowArtifacts(projectPath, tools);
}
