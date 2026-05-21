/**
 * Per-file coexistence when upstream OpenSpec is already installed.
 * Preserves existing openspec-* skills and opsx-* commands; still creates missing ones.
 */

import { FileSystemUtils } from '../utils/file-system.js';
import { SKILL_NAMES } from './shared/tool-detection.js';

/** Skill directory names owned by upstream OpenSpec (not QASpec). */
export const UPSTREAM_OPENSPEC_SKILL_NAMES = SKILL_NAMES.filter((name) =>
  name.startsWith('openspec-')
);

/** Workflow IDs whose opsx-* commands and openspec-* skills belong to upstream OpenSpec. */
export const UPSTREAM_LEGACY_WORKFLOW_IDS = [
  'new',
  'continue',
  'apply',
  'ff',
  'sync',
  'bulk-archive',
  'verify',
  'onboard',
  'propose',
] as const;

const upstreamSkillDirs = new Set<string>(UPSTREAM_OPENSPEC_SKILL_NAMES);
const upstreamWorkflowIds = new Set<string>(UPSTREAM_LEGACY_WORKFLOW_IDS);

export function formatUpstreamCoexistenceSummary(preservedSkills: number, preservedCommands: number): string {
  if (preservedSkills === 0 && preservedCommands === 0) {
    return '';
  }
  const parts: string[] = [];
  if (preservedSkills > 0) {
    parts.push(`${preservedSkills} existing openspec-* skill${preservedSkills === 1 ? '' : 's'}`);
  }
  if (preservedCommands > 0) {
    parts.push(`${preservedCommands} existing opsx-* command${preservedCommands === 1 ? '' : 's'}`);
  }
  return `Upstream OpenSpec detected — preserved ${parts.join(' and ')}`;
}

export async function shouldSkipUpstreamSkillWrite(
  skillFilePath: string,
  dirName: string,
  upstreamActive: boolean
): Promise<boolean> {
  if (!upstreamActive || !upstreamSkillDirs.has(dirName)) {
    return false;
  }
  return FileSystemUtils.fileExists(skillFilePath);
}

export async function shouldSkipUpstreamCommandWrite(
  commandFilePath: string,
  commandId: string,
  upstreamActive: boolean
): Promise<boolean> {
  if (!upstreamActive || !upstreamWorkflowIds.has(commandId)) {
    return false;
  }
  return FileSystemUtils.fileExists(commandFilePath);
}

export function isUpstreamOpenspecSkillDir(dirName: string): boolean {
  return upstreamSkillDirs.has(dirName);
}

export function isUpstreamLegacyWorkflow(workflow: string): boolean {
  return upstreamWorkflowIds.has(workflow);
}
