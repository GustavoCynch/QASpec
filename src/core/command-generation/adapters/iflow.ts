/**
 * iFlow Command Adapter
 *
 * Formats commands for iFlow following its frontmatter specification.
 */

import path from 'path';
import type { CommandContent, ToolCommandAdapter } from '../types.js';

/**
 * iFlow adapter for command generation.
 * File path: .iflow/commands/qas-<id>.md
 * Frontmatter: name, id, category, description
 */
export const iflowAdapter: ToolCommandAdapter = {
  toolId: 'iflow',

  getFilePath(commandId: string): string {
    return path.join('.iflow', 'commands', `qas-${commandId}.md`);
  },

  formatFile(content: CommandContent): string {
    return `---
name: /qas:${content.id}
id: qas-${content.id}
category: ${content.category}
description: ${content.description}
---

${content.body}
`;
  },
};
