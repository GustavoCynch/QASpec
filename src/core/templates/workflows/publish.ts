import type { SkillTemplate, CommandTemplate } from '../types.js';
import { QASPEC_COMMAND_CATEGORY } from '../../qaspec-commands.js';
import { getQasWorkflowConfigPreamble } from './qas-workflow-preamble.js';

const QAS_PUBLISH_BODY = `${getQasWorkflowConfigPreamble(['apply'])}

Run QASpec **publish** (Phase 3). Resolve TCMS target, get user confirmation via in-chat summary, then upload approved \`testcases.md\` via MCP.

## Steps

1. Run \`qaspec instructions apply --change "<name>" --json\` (publish phase for \`qaspec-pr-review\`).
2. Apply JSON \`context\` and \`rules\` from the apply instructions response; do not copy them into outputs.
3. Re-read \`qaspec/references/qase_test_case_rules.md\`; confirm test cases approved and checkbox-formatted.
4. If \`testcases.md\` exists but no files under change \`specs/\` and apply requires \`specs\`, stop and direct user to complete \`/qsx:analyze\` (delta specs are co-produced there) — do not invoke Qase MCP.
5. Read completed \`specs/**/*.md\` for context when files exist.
6. Resolve TCMS target (provider, project code, base URL) from \`tcms\` block in \`qaspec/config.yaml\`.
7. When config has no usable \`tcms\` block: if change has legacy \`execution-context.md\`, read project code and base URL and offer persisting to config; otherwise discover Qase projects via MCP (or ask for project code when list/create tools are missing), offer create-new when supported, persist chosen target to \`qaspec/config.yaml\` \`tcms\` block and announce the edit. **Do not invoke Qase MCP for upload in this message.** Ignore legacy \`publish-plan.md\`.
8. Present in-chat publish summary from \`testcases.md\` (target, suites with unchecked-case counts, warnings). End with **exactly one** confirmation halt. **Do not invoke Qase MCP in this message.**
9. After user confirms: read **Preconditions** and **Steps** under each unchecked case; map to Qase fields per rules — do not invent steps from titles when a **Steps** block exists. Read Qase MCP tool schemas (\`create_suite\`, \`create_case\`, \`bulk_create_cases\` if present); validate cases against rules; MCP upload; write \`publish-log.md\`; mark each published row \`- [x]\` in \`testcases.md\`.
10. Stop on PII/secrets — do not echo in chat or Qase. Do not modify application source under test.

User-requested edits after the confirm halt: update \`testcases.md\` or note agreed exclusions, re-present summary, ask again for confirm before MCP.

**Guardrails:** target resolution (steps 6–7) and confirmation halt (step 8) are separate from MCP upload; v1 TCMS is Qase only. Do not write \`execution-context.md\` or \`publish-plan.md\`.`;

export function getQasPublishSkillTemplate(): SkillTemplate {
  return {
    name: 'qaspec-publish',
    description: 'QASpec publish — resolve TCMS target, confirm via in-chat summary, then Qase MCP upload',
    instructions: QAS_PUBLISH_BODY,
    compatibility: 'Requires qaspec CLI and Qase MCP.',
    metadata: { author: 'qaspec', version: '1.3' },
  };
}

export function getQasPublishCommandTemplate(): CommandTemplate {
  return {
    name: 'QAS: Publish',
    description: 'Resolve TCMS target, confirm with user, then publish to Qase',
    category: QASPEC_COMMAND_CATEGORY,
    tags: ['workflow', 'publish', 'qa'],
    content: QAS_PUBLISH_BODY,
  };
}
