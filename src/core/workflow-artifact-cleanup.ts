/**
 * Removes retired, renamed, and deselected QASpec workflow artifacts from user projects.
 */

import fs from 'node:fs';
import path from 'path';
import { CommandAdapterRegistry } from './command-generation/index.js';
import { qasCommandSubdir, qaspecSkillDirName } from './qaspec-commands.js';
import { RETIRED_QAS_WORKFLOW_IDS, RENAMED_QAS_WORKFLOW_IDS } from './profiles.js';

export async function removeRetiredQaspecSkillDirs(skillsDir: string): Promise<number> {
  let removed = 0;
  for (const workflowId of RETIRED_QAS_WORKFLOW_IDS) {
    const skillDir = path.join(skillsDir, qaspecSkillDirName(workflowId));
    try {
      if (fs.existsSync(skillDir)) {
        await fs.promises.rm(skillDir, { recursive: true, force: true });
        removed++;
      }
    } catch {
      // Ignore errors
    }
  }
  return removed;
}

export async function removeRenamedQaspecSkillDirs(skillsDir: string): Promise<number> {
  let removed = 0;
  for (const legacyId of Object.keys(RENAMED_QAS_WORKFLOW_IDS)) {
    const skillDir = path.join(skillsDir, qaspecSkillDirName(legacyId));
    try {
      if (fs.existsSync(skillDir)) {
        await fs.promises.rm(skillDir, { recursive: true, force: true });
        removed++;
      }
    } catch {
      // Ignore errors
    }
  }
  return removed;
}

export async function removeRenamedQaspecCommandFiles(
  projectPath: string,
  toolId: string
): Promise<number> {
  let removed = 0;
  const adapter = CommandAdapterRegistry.get(toolId);
  if (!adapter) return 0;

  for (const legacyId of Object.keys(RENAMED_QAS_WORKFLOW_IDS)) {
    const cmdPath = adapter.getFilePath(legacyId);
    const fullPath = path.isAbsolute(cmdPath) ? cmdPath : path.join(projectPath, cmdPath);
    try {
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
        removed++;
      }
    } catch {
      // Ignore errors
    }
  }
  return removed;
}

export async function removeRetiredQaspecCommandFiles(
  projectPath: string,
  toolId: string
): Promise<number> {
  let removed = 0;
  const adapter = CommandAdapterRegistry.get(toolId);
  if (!adapter) return 0;

  for (const workflowId of RETIRED_QAS_WORKFLOW_IDS) {
    const cmdPath = adapter.getFilePath(workflowId);
    const fullPath = path.isAbsolute(cmdPath) ? cmdPath : path.join(projectPath, cmdPath);
    try {
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
        removed++;
      }
    } catch {
      // Ignore errors
    }
  }
  return removed;
}

export async function removeDeselectedQasSubdirCommands(
  projectPath: string,
  desiredWorkflows: readonly string[]
): Promise<number> {
  const desired = new Set(desiredWorkflows);
  const subdir = qasCommandSubdir();
  const qasCommandDirs = [
    path.join(projectPath, '.cursor', 'commands', subdir),
    path.join(projectPath, '.claude', 'commands', subdir),
  ];

  let removed = 0;
  for (const qasCommandsDir of qasCommandDirs) {
    if (!fs.existsSync(qasCommandsDir)) {
      continue;
    }

    for (const entry of await fs.promises.readdir(qasCommandsDir)) {
      if (!entry.endsWith('.md')) continue;
      const workflowId = entry.slice(0, -3);
      if (desired.has(workflowId)) continue;
      try {
        await fs.promises.unlink(path.join(qasCommandsDir, entry));
        removed++;
      } catch {
        // Ignore errors
      }
    }
  }

  return removed;
}
