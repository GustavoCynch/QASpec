/**
 * QASpec slash-command naming for generated agent command files.
 */

export const QASPEC_COMMAND_PREFIX = 'qas';

export const QASPEC_COMMAND_CATEGORY = 'QASpec';

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
