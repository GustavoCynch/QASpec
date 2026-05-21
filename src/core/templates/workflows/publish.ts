import type { SkillTemplate, CommandTemplate } from '../types.js';
import { QASPEC_COMMAND_CATEGORY } from '../../qaspec-commands.js';
import { getQasWorkflowConfigPreamble } from './qas-workflow-preamble.js';

const QAS_PUBLISH_BODY = `${getQasWorkflowConfigPreamble(['apply'])}

Run QASpec **publish** (Phase 3). Upload approved \`testmatrix.md\` to Qase via MCP.

## Steps

1. Run \`qaspec instructions apply --change "<name>" --json\` (publish phase for \`qaspec-pr-review\`).
2. Apply JSON \`context\` and \`rules\` from the apply instructions response; do not copy them into outputs.
3. Re-read \`qaspec/references/qase_test_case_rules.md\`; confirm matrix approved and checkbox-formatted.
4. If \`testmatrix.md\` exists but no files under change \`specs/\` and apply requires \`specs\`, stop and direct user to complete \`/qas:matrix\` — do not invoke Qase MCP.
5. Read completed \`specs/**/*.md\` for context before MCP when files exist.
6. Resolve Qase prerequisites (project code, role, base URL) from artifacts, \`execution-context.md\`, or chat; if missing, **one** halt with only missing fields — then persist to \`execution-context.md\`.
7. Read Qase MCP tool schemas (\`create_suite\`, \`create_case\`, \`bulk_create_cases\` if present) before first call.
8. Validate matrix against rules; then MCP upload; write \`publish-log.md\`; mark each published row \`- [x]\` in \`testmatrix.md\`.
9. Stop on PII/secrets — do not echo in chat or Qase. Do not modify application source under test.

**Guardrails:** no second halt after prerequisites are complete; v1 TCMS is Qase only.`;

export function getQasPublishSkillTemplate(): SkillTemplate {
  return {
    name: 'qas-publish',
    description: 'QASpec publish — Qase MCP upload and testmatrix checkbox updates',
    instructions: QAS_PUBLISH_BODY,
    compatibility: 'Requires qaspec CLI and Qase MCP.',
    metadata: { author: 'qaspec', version: '1.1' },
  };
}

export function getQasPublishCommandTemplate(): CommandTemplate {
  return {
    name: 'QAS: Publish',
    description: 'Publish approved test matrix to Qase and update checkboxes',
    category: QASPEC_COMMAND_CATEGORY,
    tags: ['workflow', 'publish', 'qa'],
    content: QAS_PUBLISH_BODY,
  };
}
