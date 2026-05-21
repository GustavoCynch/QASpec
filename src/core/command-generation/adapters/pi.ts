/**
 * Pi Command Adapter
 *
 * Formats commands for Pi (pi.dev) following its prompt template specification.
 * Pi prompt templates live in .pi/prompts/*.md with description frontmatter.
 */

import path from 'path';
import type { CommandContent, ToolCommandAdapter } from '../types.js';
import { qasCommandFileBase, qasCommandSubdir, qasSlashCommandId, qasSlashCommandName } from '../../qaspec-commands.js';
import { transformToHyphenCommands } from '../../../utils/command-references.js';

const PI_INPUT_HEADING = /^\*\*Input\*\*:[^\n]*$/m;

function injectPiArgs(body: string): string {
  if (body.includes('$@') || body.includes('$ARGUMENTS')) {
    return body;
  }

  return body.replace(
    PI_INPUT_HEADING,
    (heading) => `${heading}\n**Provided arguments**: $@`
  );
}

/**
 * Escapes a string value for safe YAML output.
 * Quotes the string if it contains special YAML characters.
 */
function escapeYamlValue(value: string): string {
  // Check if value needs quoting (contains special YAML characters or starts/ends with whitespace)
  const needsQuoting = /[:\n\r#{}[\],&*!|>'"%@`]|^\s|\s$/.test(value);
  if (needsQuoting) {
    // Use double quotes and escape internal double quotes and backslashes
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    return `"${escaped}"`;
  }
  return value;
}

/**
 * Pi adapter for prompt template generation.
 * File path: .pi/prompts/qsx-<id>.md
 * Frontmatter: description
 *
 * Pi uses the filename (minus .md) as the slash command name, so
 * opsx-propose.md → /qsx-propose. Command references in the body
 * are transformed from /qsx: to /qsx- for consistency.
 */
export const piAdapter: ToolCommandAdapter = {
  toolId: 'pi',

  getFilePath(commandId: string): string {
    return path.join('.pi', 'prompts', `${qasCommandFileBase(commandId)}.md`);
  },

  formatFile(content: CommandContent): string {
    // Transform /qsx: references to /qsx- and inject $@ for template args
    const transformedBody = transformToHyphenCommands(content.body);

    return `---
description: ${escapeYamlValue(content.description)}
---

${injectPiArgs(transformedBody)}
`;
  },
};
