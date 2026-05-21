/**
 * Continue Command Adapter
 *
 * Formats commands for Continue following its .prompt specification.
 */

import path from 'path';
import type { CommandContent, ToolCommandAdapter } from '../types.js';
import { qasCommandFileBase, qasCommandSubdir, qasSlashCommandId, qasSlashCommandName } from '../../qaspec-commands.js';

/**
 * Continue adapter for command generation.
 * File path: .continue/prompts/qsx-<id>.prompt
 * Frontmatter: name, description, invokable
 */
export const continueAdapter: ToolCommandAdapter = {
  toolId: 'continue',

  getFilePath(commandId: string): string {
    return path.join('.continue', 'prompts', `${qasCommandFileBase(commandId)}.prompt`);
  },

  formatFile(content: CommandContent): string {
    return `---
name: ${qasSlashCommandId(content.id)}
description: ${content.description}
invokable: true
---

${content.body}
`;
  },
};
