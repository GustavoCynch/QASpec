import type { SkillTemplate, CommandTemplate } from '../types.js';
import { QASPEC_COMMAND_CATEGORY } from '../../qaspec-commands.js';
import { QAS_EXPLORE_CONFIG_PREAMBLE } from './qas-workflow-preamble.js';

const QAS_ARCHIVE_BODY = `${QAS_EXPLORE_CONFIG_PREAMBLE}

Archive a completed QASpec change.

1. Run \`qaspec list --json\`; let the user pick the change if unclear.
2. Run \`qaspec status --change "<name>" --json\` — warn on incomplete artifacts.
3. For \`qaspec-pr-review\`, check \`testcases.md\` checkboxes if publish was expected; for \`spec-driven\`, check \`tasks.md\`.
4. Run \`qaspec archive <name>\` (or follow CLI prompts).`;

export function getQasArchiveSkillTemplate(): SkillTemplate {
  return {
    name: 'qaspec-archive',
    description: 'Archive a completed QASpec QA change',
    instructions: QAS_ARCHIVE_BODY,
    compatibility: 'Requires qaspec CLI.',
    metadata: { author: 'qaspec', version: '1.1' },
  };
}

export function getQasArchiveCommandTemplate(): CommandTemplate {
  return {
    name: 'QAS: Archive',
    description: 'Archive a completed QASpec change',
    category: QASPEC_COMMAND_CATEGORY,
    tags: ['workflow', 'archive', 'qa'],
    content: QAS_ARCHIVE_BODY,
  };
}
