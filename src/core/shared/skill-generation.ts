/**
 * Skill Generation Utilities
 *
 * Shared utilities for generating skill and command files.
 */

import {
  getExploreSkillTemplate,
  getNewChangeSkillTemplate,
  getContinueChangeSkillTemplate,
  getApplyChangeSkillTemplate,
  getFfChangeSkillTemplate,
  getSyncSpecsSkillTemplate,
  getArchiveChangeSkillTemplate,
  getBulkArchiveChangeSkillTemplate,
  getVerifyChangeSkillTemplate,
  getOnboardSkillTemplate,
  getOpsxProposeSkillTemplate,
  getOpsxExploreCommandTemplate,
  getOpsxNewCommandTemplate,
  getOpsxContinueCommandTemplate,
  getOpsxApplyCommandTemplate,
  getOpsxFfCommandTemplate,
  getOpsxSyncCommandTemplate,
  getOpsxArchiveCommandTemplate,
  getOpsxBulkArchiveCommandTemplate,
  getOpsxVerifyCommandTemplate,
  getOpsxOnboardCommandTemplate,
  getOpsxProposeCommandTemplate,
  getQasExploreSkillTemplate,
  getQasExploreCommandTemplate,
  getQasAnalyzeSkillTemplate,
  getQasAnalyzeCommandTemplate,
  getQasMatrixSkillTemplate,
  getQasMatrixCommandTemplate,
  getQasPublishSkillTemplate,
  getQasPublishCommandTemplate,
  getQasArchiveSkillTemplate,
  getQasArchiveCommandTemplate,
  type SkillTemplate,
} from '../templates/skill-templates.js';
import type { CommandContent } from '../command-generation/index.js';
import { CORE_WORKFLOWS } from '../profiles.js';

/**
 * Skill template with directory name and workflow ID mapping.
 */
export interface SkillTemplateEntry {
  template: SkillTemplate;
  dirName: string;
  workflowId: string;
}

/**
 * Command template with ID mapping.
 */
export interface CommandTemplateEntry {
  template: ReturnType<typeof getOpsxExploreCommandTemplate>;
  id: string;
}

const QAS_WORKFLOW_ENTRIES: SkillTemplateEntry[] = [
  { template: getQasExploreSkillTemplate(), dirName: 'qas-explore', workflowId: 'explore' },
  { template: getQasAnalyzeSkillTemplate(), dirName: 'qas-analyze', workflowId: 'analyze' },
  { template: getQasMatrixSkillTemplate(), dirName: 'qas-matrix', workflowId: 'matrix' },
  { template: getQasPublishSkillTemplate(), dirName: 'qas-publish', workflowId: 'publish' },
  { template: getQasArchiveSkillTemplate(), dirName: 'qas-archive', workflowId: 'archive' },
];

/** explore/archive for legacy OpenSpec profiles (opsx surface, not QAS). */
const LEGACY_SHARED_SKILL_ENTRIES: SkillTemplateEntry[] = [
  { template: getExploreSkillTemplate(), dirName: 'openspec-explore', workflowId: 'explore' },
  { template: getArchiveChangeSkillTemplate(), dirName: 'openspec-archive-change', workflowId: 'archive' },
];

const LEGACY_SHARED_COMMAND_ENTRIES: CommandTemplateEntry[] = [
  { template: getOpsxExploreCommandTemplate(), id: 'explore' },
  { template: getOpsxArchiveCommandTemplate(), id: 'archive' },
];

const LEGACY_WORKFLOW_ENTRIES: SkillTemplateEntry[] = [
  { template: getNewChangeSkillTemplate(), dirName: 'openspec-new-change', workflowId: 'new' },
  { template: getContinueChangeSkillTemplate(), dirName: 'openspec-continue-change', workflowId: 'continue' },
  { template: getApplyChangeSkillTemplate(), dirName: 'openspec-apply-change', workflowId: 'apply' },
  { template: getFfChangeSkillTemplate(), dirName: 'openspec-ff-change', workflowId: 'ff' },
  { template: getSyncSpecsSkillTemplate(), dirName: 'openspec-sync-specs', workflowId: 'sync' },
  { template: getBulkArchiveChangeSkillTemplate(), dirName: 'openspec-bulk-archive-change', workflowId: 'bulk-archive' },
  { template: getVerifyChangeSkillTemplate(), dirName: 'openspec-verify-change', workflowId: 'verify' },
  { template: getOnboardSkillTemplate(), dirName: 'openspec-onboard', workflowId: 'onboard' },
  { template: getOpsxProposeSkillTemplate(), dirName: 'openspec-propose', workflowId: 'propose' },
];

const QAS_COMMAND_ENTRIES: CommandTemplateEntry[] = [
  { template: getQasExploreCommandTemplate(), id: 'explore' },
  { template: getQasAnalyzeCommandTemplate(), id: 'analyze' },
  { template: getQasMatrixCommandTemplate(), id: 'matrix' },
  { template: getQasPublishCommandTemplate(), id: 'publish' },
  { template: getQasArchiveCommandTemplate(), id: 'archive' },
];

const LEGACY_COMMAND_ENTRIES: CommandTemplateEntry[] = [
  { template: getOpsxNewCommandTemplate(), id: 'new' },
  { template: getOpsxContinueCommandTemplate(), id: 'continue' },
  { template: getOpsxApplyCommandTemplate(), id: 'apply' },
  { template: getOpsxFfCommandTemplate(), id: 'ff' },
  { template: getOpsxSyncCommandTemplate(), id: 'sync' },
  { template: getOpsxBulkArchiveCommandTemplate(), id: 'bulk-archive' },
  { template: getOpsxVerifyCommandTemplate(), id: 'verify' },
  { template: getOpsxOnboardCommandTemplate(), id: 'onboard' },
  { template: getOpsxProposeCommandTemplate(), id: 'propose' },
];

function usesQasWorkflowSurface(workflowFilter?: readonly string[]): boolean {
  if (!workflowFilter) return false;
  const set = new Set(workflowFilter);
  return set.has('analyze') || set.has('matrix') || set.has('publish');
}

/**
 * Gets skill templates with their directory names, optionally filtered by workflow IDs.
 */
export function getSkillTemplates(workflowFilter?: readonly string[]): SkillTemplateEntry[] {
  const filterSet = workflowFilter ? new Set(workflowFilter) : null;

  const pick = (entries: SkillTemplateEntry[]) =>
    filterSet ? entries.filter((entry) => filterSet.has(entry.workflowId)) : entries;

  if (!workflowFilter) {
    return [...QAS_WORKFLOW_ENTRIES, ...LEGACY_WORKFLOW_ENTRIES];
  }

  if (usesQasWorkflowSurface(workflowFilter)) {
    return pick(QAS_WORKFLOW_ENTRIES);
  }

  const legacy = pick(LEGACY_WORKFLOW_ENTRIES);
  const legacyShared = pick(LEGACY_SHARED_SKILL_ENTRIES);
  return [...legacyShared, ...legacy];
}

/**
 * Profile skill templates plus QASpec `qas-*` skills when upstream OpenSpec is installed.
 *
 * Legacy/custom profiles only list `openspec-*` skills; coexistence must still install
 * `qas-*` from the core profile without overwriting existing upstream skills.
 */
export function getCoexistenceSkillTemplates(
  profileWorkflows: readonly string[]
): SkillTemplateEntry[] {
  const primary = getSkillTemplates(profileWorkflows);
  const qasEntries = getSkillTemplates([...CORE_WORKFLOWS]).filter((entry) =>
    entry.dirName.startsWith('qas-')
  );
  const byDir = new Map<string, SkillTemplateEntry>();
  for (const entry of primary) {
    byDir.set(entry.dirName, entry);
  }
  for (const entry of qasEntries) {
    byDir.set(entry.dirName, entry);
  }
  return [...byDir.values()];
}

/**
 * Gets command templates with their IDs, optionally filtered by workflow IDs.
 */
export function getCommandTemplates(workflowFilter?: readonly string[]): CommandTemplateEntry[] {
  const filterSet = workflowFilter ? new Set(workflowFilter) : null;

  const pickCmd = (entries: CommandTemplateEntry[]) =>
    filterSet ? entries.filter((entry) => filterSet.has(entry.id)) : entries;

  if (!workflowFilter) {
    return [...QAS_COMMAND_ENTRIES, ...LEGACY_COMMAND_ENTRIES];
  }

  if (usesQasWorkflowSurface(workflowFilter)) {
    return pickCmd(QAS_COMMAND_ENTRIES);
  }

  const legacy = pickCmd(LEGACY_COMMAND_ENTRIES);
  const legacyShared = pickCmd(LEGACY_SHARED_COMMAND_ENTRIES);
  return [...legacyShared, ...legacy];
}

/**
 * Converts command templates to CommandContent array, optionally filtered by workflow IDs.
 */
export function getCommandContents(workflowFilter?: readonly string[]): CommandContent[] {
  const commandTemplates = getCommandTemplates(workflowFilter);
  return commandTemplates.map(({ template, id }) => ({
    id,
    name: template.name,
    description: template.description,
    category: template.category,
    tags: template.tags,
    body: template.content,
  }));
}

/**
 * Generates skill file content with YAML frontmatter.
 */
export function generateSkillContent(
  template: SkillTemplate,
  generatedByVersion: string,
  transformInstructions?: (instructions: string) => string
): string {
  const instructions = transformInstructions
    ? transformInstructions(template.instructions)
    : template.instructions;

  return `---
name: ${template.name}
description: ${template.description}
license: ${template.license || 'MIT'}
compatibility: ${template.compatibility || 'Requires openspec CLI.'}
metadata:
  author: ${template.metadata?.author || 'openspec'}
  version: "${template.metadata?.version || '1.0'}"
  generatedBy: "${generatedByVersion}"
---

${instructions}
`;
}
