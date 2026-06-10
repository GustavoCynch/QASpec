/**
 * Migration Utilities
 *
 * One-time migration logic for existing projects when profile system is introduced.
 * Called by both init and update commands before profile resolution.
 */

import chalk from 'chalk';
import type { AIToolOption } from './config.js';
import { getGlobalConfig, getGlobalConfigPath, saveGlobalConfig, type Delivery } from './global-config.js';
import { CommandAdapterRegistry } from './command-generation/index.js';
import { ALL_WORKFLOWS, isLegacyCoreWorkflowSet, RETIRED_QAS_WORKFLOW_IDS } from './profiles.js';
import { qaspecSkillDirName } from './qaspec-commands.js';
import { SKILL_NAMES } from './shared/tool-detection.js';
import { workflowIdForSkillDir } from './skill-paths.js';
import path from 'path';
import * as fs from 'fs';

interface InstalledWorkflowArtifacts {
  workflows: string[];
  hasSkills: boolean;
  hasCommands: boolean;
}

function scanInstalledWorkflowArtifacts(
  projectPath: string,
  tools: AIToolOption[]
): InstalledWorkflowArtifacts {
  const installed = new Set<string>();
  let hasSkills = false;
  let hasCommands = false;

  for (const tool of tools) {
    if (!tool.skillsDir) continue;
    const skillsDir = path.join(projectPath, tool.skillsDir, 'skills');

    for (const skillDirName of SKILL_NAMES) {
      const skillFile = path.join(skillsDir, skillDirName, 'SKILL.md');
      if (!fs.existsSync(skillFile)) {
        continue;
      }
      hasSkills = true;
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
        hasCommands = true;
      }
    }

    for (const workflowId of RETIRED_QAS_WORKFLOW_IDS) {
      const skillDirName = qaspecSkillDirName(workflowId);
      if (SKILL_NAMES.includes(skillDirName as (typeof SKILL_NAMES)[number])) {
        continue;
      }
      const skillFile = path.join(skillsDir, skillDirName, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        hasSkills = true;
        installed.add(workflowId);
      }
    }
  }

  const knownWorkflowOrder = [...ALL_WORKFLOWS, ...RETIRED_QAS_WORKFLOW_IDS];

  return {
    workflows: knownWorkflowOrder.filter((workflowId) => installed.has(workflowId)),
    hasSkills,
    hasCommands,
  };
}

/**
 * Scans installed workflow files across all detected tools and returns
 * the union of installed workflow IDs.
 */
export function scanInstalledWorkflows(projectPath: string, tools: AIToolOption[]): string[] {
  return scanInstalledWorkflowArtifacts(projectPath, tools).workflows;
}

function inferDelivery(artifacts: InstalledWorkflowArtifacts): Delivery {
  if (artifacts.hasSkills && artifacts.hasCommands) {
    return 'both';
  }
  if (artifacts.hasCommands) {
    return 'commands';
  }
  return 'skills';
}

/**
 * Upgrades global `custom` profiles frozen on the legacy OpenSpec core workflow set
 * to the current QASpec `core` profile.
 *
 * @returns true when config was migrated and saved
 */
export function migrateLegacyCoreProfileIfNeeded(): boolean {
  const config = getGlobalConfig();
  if (config.profile !== 'custom' || !isLegacyCoreWorkflowSet(config.workflows)) {
    return false;
  }

  config.profile = 'core';
  delete config.workflows;
  saveGlobalConfig(config);

  console.log(
    chalk.dim(
      'Migrated global profile from legacy OpenSpec core to QASpec core (analyze, cases, publish, archive).'
    )
  );
  return true;
}

/**
 * Performs one-time migration if the global config does not yet have a profile field.
 * Called by both init and update before profile resolution.
 *
 * - If no profile field exists and workflows are installed: sets profile to 'custom'
 *   with the detected workflows, preserving the user's existing setup.
 * - If no profile field exists and no workflows are installed: no-op (defaults apply).
 * - If profile field already exists: no-op.
 */
export function migrateIfNeeded(projectPath: string, tools: AIToolOption[]): void {
  const config = getGlobalConfig();

  // Check raw config file for profile field presence
  const configPath = getGlobalConfigPath();

  let rawConfig: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {
    return; // Can't read config, skip migration
  }

  // If profile is already explicitly set, no migration needed
  if (rawConfig.profile !== undefined) {
    return;
  }

  // Scan for installed workflows
  const artifacts = scanInstalledWorkflowArtifacts(projectPath, tools);
  const installedWorkflows = artifacts.workflows;

  if (installedWorkflows.length === 0) {
    // No workflows installed, new user — defaults will apply
    return;
  }

  // Migrate: set profile to custom with detected workflows
  config.profile = 'custom';
  config.workflows = installedWorkflows;
  if (rawConfig.delivery === undefined) {
    config.delivery = inferDelivery(artifacts);
  }
  saveGlobalConfig(config);

  console.log(`Migrated: custom profile with ${installedWorkflows.length} workflows`);
  console.log("Try 'qaspec config profile core' for the QASpec QA workflow (/qsx:analyze, /qsx:cases, /qsx:publish, /qsx:archive).");
}
