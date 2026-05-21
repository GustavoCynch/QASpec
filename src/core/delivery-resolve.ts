/**
 * Corrects delivery mode when skills are required but missing on disk.
 */

import path from 'path';
import { FileSystemUtils } from '../utils/file-system.js';
import { AI_TOOLS } from './config.js';
import type { Delivery } from './global-config.js';
import { hasActiveUpstreamOpenSpec } from './legacy-cleanup.js';
import { getSkillTemplates } from './shared/skill-generation.js';

/**
 * Upgrades `commands`-only delivery when QASpec must coexist with upstream OpenSpec.
 *
 * When upstream OpenSpec is present, always use `both`: QASpec installs `qas-*` skills
 * while preserving existing `openspec-*` skills (per-file skip). Returning `commands`
 * because all *openspec* template files exist would skip *qas-*` skills entirely.
 */
export async function resolveEffectiveDelivery(
  projectPath: string,
  delivery: Delivery,
  workflows: readonly string[],
  toolIds: readonly string[]
): Promise<Delivery> {
  if (delivery !== 'commands') {
    return delivery;
  }

  if (await hasActiveUpstreamOpenSpec(projectPath)) {
    return 'both';
  }

  const skillTemplates = getSkillTemplates(workflows);
  if (skillTemplates.length === 0) {
    return delivery;
  }

  for (const toolId of toolIds) {
    const tool = AI_TOOLS.find((t) => t.value === toolId);
    if (!tool?.skillsDir) {
      continue;
    }

    const skillsDir = path.join(projectPath, tool.skillsDir, 'skills');
    for (const { dirName } of skillTemplates) {
      const skillFile = path.join(skillsDir, dirName, 'SKILL.md');
      if (!(await FileSystemUtils.fileExists(skillFile))) {
        return 'both';
      }
    }
  }

  return delivery;
}
