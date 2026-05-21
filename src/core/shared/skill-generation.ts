/**
 * Skill Generation Utilities
 *
 * Shared utilities for generating skill and command files.
 */

import {
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
  template: ReturnType<typeof getQasExploreCommandTemplate>;
  id: string;
}

const QAS_WORKFLOW_ENTRIES: SkillTemplateEntry[] = [
  { template: getQasExploreSkillTemplate(), dirName: 'qas-explore', workflowId: 'explore' },
  { template: getQasAnalyzeSkillTemplate(), dirName: 'qas-analyze', workflowId: 'analyze' },
  { template: getQasMatrixSkillTemplate(), dirName: 'qas-matrix', workflowId: 'matrix' },
  { template: getQasPublishSkillTemplate(), dirName: 'qas-publish', workflowId: 'publish' },
  { template: getQasArchiveSkillTemplate(), dirName: 'qas-archive', workflowId: 'archive' },
];

const QAS_COMMAND_ENTRIES: CommandTemplateEntry[] = [
  { template: getQasExploreCommandTemplate(), id: 'explore' },
  { template: getQasAnalyzeCommandTemplate(), id: 'analyze' },
  { template: getQasMatrixCommandTemplate(), id: 'matrix' },
  { template: getQasPublishCommandTemplate(), id: 'publish' },
  { template: getQasArchiveCommandTemplate(), id: 'archive' },
];

const CORE_WORKFLOW_SET = new Set<string>(CORE_WORKFLOWS);

export function usesQasWorkflowSurface(workflowFilter?: readonly string[]): boolean {
  if (!workflowFilter || workflowFilter.length === 0) {
    return false;
  }
  return workflowFilter.some((id) => CORE_WORKFLOW_SET.has(id));
}

/**
 * Gets skill templates with their directory names, optionally filtered by workflow IDs.
 */
export function getSkillTemplates(workflowFilter?: readonly string[]): SkillTemplateEntry[] {
  if (!workflowFilter) {
    return [...QAS_WORKFLOW_ENTRIES];
  }

  const filterSet = new Set(workflowFilter);
  return QAS_WORKFLOW_ENTRIES.filter((entry) => filterSet.has(entry.workflowId));
}

/**
 * When upstream OpenSpec is active, install the full QASpec core skill set alongside upstream.
 */
export function getCoexistenceSkillTemplates(_profileWorkflows: readonly string[]): SkillTemplateEntry[] {
  return getSkillTemplates([...CORE_WORKFLOWS]);
}

/**
 * Gets command templates with their IDs, optionally filtered by workflow IDs.
 */
export function getCommandTemplates(workflowFilter?: readonly string[]): CommandTemplateEntry[] {
  if (!workflowFilter) {
    return [...QAS_COMMAND_ENTRIES];
  }

  const filterSet = new Set(workflowFilter);
  return QAS_COMMAND_ENTRIES.filter((entry) => filterSet.has(entry.id));
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
compatibility: ${template.compatibility || 'Requires qaspec CLI.'}
metadata:
  author: ${template.metadata?.author || 'qaspec'}
  version: "${template.metadata?.version || '1.0'}"
  generatedBy: "${generatedByVersion}"
---

${instructions}
`;
}
