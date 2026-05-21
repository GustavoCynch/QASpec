import type { SkillTemplate, CommandTemplate } from '../types.js';
import { QASPEC_COMMAND_CATEGORY } from '../../qaspec-commands.js';
import { getQasWorkflowConfigPreamble } from './qas-workflow-preamble.js';

const QAS_PUBLISH_BODY = `${getQasWorkflowConfigPreamble(['apply'])}

Run QASpec **publish** (Phase 3). Prepare Qase publish artifacts, get user confirmation, then upload approved \`testmatrix.md\` via MCP.

## Steps

1. Run \`qaspec instructions apply --change "<name>" --json\` (publish phase for \`qaspec-pr-review\`).
2. Apply JSON \`context\` and \`rules\` from the apply instructions response; do not copy them into outputs.
3. Re-read \`qaspec/references/qase_test_case_rules.md\`; confirm matrix approved and checkbox-formatted.
4. If \`testmatrix.md\` exists but no files under change \`specs/\` and apply requires \`specs\`, stop and direct user to complete \`/qsx:matrix\` — do not invoke Qase MCP.
5. Read completed \`specs/**/*.md\` for context when files exist.
6. Resolve Qase prerequisites (project code, role, base URL) from artifacts, \`execution-context.md\`, or chat; if missing, **one** halt with only missing fields — then persist to \`execution-context.md\`.
7. Write or update \`execution-context.md\` and \`publish-plan.md\` from unchecked cases in \`testmatrix.md\`, including each case's **Preconditions** and **Steps** blocks when present (not title-only summaries). Use schema templates when creating new files.
8. End with **exactly one** confirmation halt: user may edit \`execution-context.md\` and \`publish-plan.md\` or confirm publish. **Do not invoke Qase MCP in this message.**
9. After user confirms: read **Preconditions** and **Steps** under each case to publish; map to Qase fields per rules — do not invent steps from titles when a **Steps** block exists. Read Qase MCP tool schemas (\`create_suite\`, \`create_case\`, \`bulk_create_cases\` if present); validate matrix against rules; MCP upload; write \`publish-log.md\`; mark each published row \`- [x]\` in \`testmatrix.md\`.
10. Stop on PII/secrets — do not echo in chat or Qase. Do not modify application source under test.

User-requested edits after the confirm halt: update \`execution-context.md\` and/or \`publish-plan.md\` in chat, then ask again for confirm before MCP.

**Guardrails:** prerequisite halt (step 6) only when fields are missing; confirmation halt (step 8) is mandatory before MCP; v1 TCMS is Qase only.`;

export function getQasPublishSkillTemplate(): SkillTemplate {
  return {
    name: 'qaspec-publish',
    description: 'QASpec publish — prepare plan and context, confirm, then Qase MCP upload',
    instructions: QAS_PUBLISH_BODY,
    compatibility: 'Requires qaspec CLI and Qase MCP.',
    metadata: { author: 'qaspec', version: '1.2' },
  };
}

export function getQasPublishCommandTemplate(): CommandTemplate {
  return {
    name: 'QAS: Publish',
    description: 'Prepare publish plan, confirm with user, then publish to Qase',
    category: QASPEC_COMMAND_CATEGORY,
    tags: ['workflow', 'publish', 'qa'],
    content: QAS_PUBLISH_BODY,
  };
}
