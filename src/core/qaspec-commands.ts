/**
 * QASpec naming for generated agent skills and slash commands.
 *
 * Skills use the product prefix (`qaspec-*`).
 * Commands use a short slash prefix (`qsx-*`, `/qsx:*`, like upstream `opsx`).
 */

export const QASPEC_SKILL_PREFIX = 'qaspec';

export const QASPEC_COMMAND_PREFIX = 'qsx';

export const QASPEC_COMMAND_CATEGORY = 'QASpec';

/** @deprecated Transitional bootstrap-era skill dirs; used for legacy cleanup only. */
export const LEGACY_QAS_SKILL_DIR_NAMES = [
  'qas-explore',
  'qas-analyze',
  'qas-matrix',
  'qas-publish',
  'qas-archive',
] as const;

export function qaspecSkillDirName(workflowId: string): string {
  return `${QASPEC_SKILL_PREFIX}-${workflowId}`;
}

export function qasCommandFileBase(commandId: string): string {
  return `${QASPEC_COMMAND_PREFIX}-${commandId}`;
}

export function qasSlashCommandName(commandId: string): string {
  return `/${QASPEC_COMMAND_PREFIX}:${commandId}`;
}

export function qasSlashCommandId(commandId: string): string {
  return `${QASPEC_COMMAND_PREFIX}-${commandId}`;
}

export function qasCommandSubdir(): string {
  return QASPEC_COMMAND_PREFIX;
}
