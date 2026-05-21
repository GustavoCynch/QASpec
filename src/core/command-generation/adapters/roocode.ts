/**
 * RooCode Command Adapter
 *
 * Formats commands for RooCode following its workflow specification.
 * RooCode uses markdown headers instead of YAML frontmatter.
 */

import path from 'path';
import type { CommandContent, ToolCommandAdapter } from '../types.js';
import { qasCommandFileBase, qasCommandSubdir, qasSlashCommandId, qasSlashCommandName } from '../../qaspec-commands.js';

/**
 * RooCode adapter for command generation.
 * File path: .roo/commands/qsx-<id>.md
 * Format: Markdown header with description
 */
export const roocodeAdapter: ToolCommandAdapter = {
  toolId: 'roocode',

  getFilePath(commandId: string): string {
    return path.join('.roo', 'commands', `${qasCommandFileBase(commandId)}.md`);
  },

  formatFile(content: CommandContent): string {
    return `# ${content.name}

${content.description}

${content.body}
`;
  },
};
