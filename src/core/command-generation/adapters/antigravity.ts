/**
 * Antigravity Command Adapter
 *
 * Formats commands for Antigravity following its frontmatter specification.
 */

import path from 'path';
import type { CommandContent, ToolCommandAdapter } from '../types.js';
import { qasCommandFileBase, qasCommandSubdir, qasSlashCommandId, qasSlashCommandName } from '../../qaspec-commands.js';

/**
 * Antigravity adapter for command generation.
 * File path: .agent/workflows/qsx-<id>.md
 * Frontmatter: description
 */
export const antigravityAdapter: ToolCommandAdapter = {
  toolId: 'antigravity',

  getFilePath(commandId: string): string {
    return path.join('.agent', 'workflows', `${qasCommandFileBase(commandId)}.md`);
  },

  formatFile(content: CommandContent): string {
    return `---
description: ${content.description}
---

${content.body}
`;
  },
};
