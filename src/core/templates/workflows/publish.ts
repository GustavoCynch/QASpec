import type { SkillTemplate, CommandTemplate } from '../types.js';
import { QASPEC_COMMAND_CATEGORY } from '../../qaspec-commands.js';
import { getQasWorkflowConfigPreamble } from './qas-workflow-preamble.js';

const QAS_PUBLISH_BODY = `${getQasWorkflowConfigPreamble(['apply'])}

Run QASpec **publish** (Phase 3). Resolve TCMS target, run publish gate, get user confirmation via in-chat summary, then upload approved \`testcases.md\` via MCP.

## Steps

1. Run \`qaspec instructions apply --change "<name>" --json\` (publish phase for \`qaspec-pr-review\`).
2. Apply JSON \`context\` and \`rules\` from the apply instructions response; do not copy them into outputs.
3. Re-read \`qaspec/references/tcms_case_rules.md\`; confirm test cases approved and checkbox-formatted.
4. If \`testcases.md\` exists but no files under change \`specs/\` and apply requires \`specs\`, stop and direct user to complete \`/qsx:analyze\` (delta specs are co-produced there) — do not invoke the TCMS MCP.
5. Read completed \`specs/**/*.md\` for context when files exist.
6. Resolve TCMS target for the change: \`qaspec tcms show --change "<name>" --json\` (change \`.qaspec.yaml\` \`tcms\` block, with project-config \`tcms\` as user-managed defaults only).
7. When no usable target (provider + project): **default to proposing a new TCMS project** for this change — suggest a code derived from the change/PR (e.g. \`PR415\`). Discover existing projects via MCP listing tool only to present them as alternatives — never pick one yourself. Present create-new (recommended) plus existing-project alternatives in **one halt and wait for the user's choice**; reuse an existing project only when the user explicitly selects it. If the change has legacy \`execution-context.md\`, surface its project/baseUrl as one alternative. On create-new use the MCP creation tool when available, otherwise instruct the user to create it in the TCMS UI and confirm the code. After the user chooses, persist with \`qaspec tcms set --change "<name>" --provider <provider> --project <CODE> [--base-url <url>]\` and announce it. **Never write the \`tcms\` block in \`qaspec/config.yaml\`.** **Do not invoke the TCMS MCP for upload in this message.** Ignore legacy \`publish-plan.md\` and legacy \`publish-log.md\`.
8. Run \`qaspec publish-gate --change "<name>"\` before the publish summary. When it fails, report each precondition and resolving command — do not proceed. When it passes, note the gate token.
9. Present in-chat publish summary from \`testcases.md\` (target, suites with unchecked-case counts, warnings). Include the **full payload of one representative case** (all mapped TCMS fields). End with **exactly one** confirmation halt citing the gate token. **Do not invoke the TCMS MCP in this message.**
10. After user confirms (with gate token cited): re-read \`testcases.md\`; read **Preconditions** and **Steps** under each unchecked case; **omit-on-unmapped** — send only TCMS fields in the mapping table, never infer severity/priority/type; per case MCP create → mark that case \`- [x]\` in \`testcases.md\` immediately after the successful create call (no local TCMS IDs recorded); on re-run reconcile unchecked cases against the TCMS by title before creating — never blind-create, and cases already present in the TCMS are marked \`- [x]\` without a duplicate create call.
11. Stop on PII/secrets — do not echo in chat or the TCMS. Do not modify application source under test.

User-requested edits after the confirm halt: update \`testcases.md\` or note agreed exclusions, re-run \`qaspec publish-gate\`, re-present summary, ask again for confirm before MCP.

**Guardrails:** target resolution (steps 6–7), publish gate (step 8), and confirmation halt (step 9) are separate from MCP upload. Do not write \`execution-context.md\`, \`publish-plan.md\`, \`publish-log.md\`, or the \`tcms\` block in \`qaspec/config.yaml\`.`;

export function getQasPublishSkillTemplate(): SkillTemplate {
  return {
    name: 'qaspec-publish',
    description: 'QASpec publish — resolve TCMS target, confirm via in-chat summary, then TCMS MCP upload',
    instructions: QAS_PUBLISH_BODY,
    compatibility: 'Requires qaspec CLI and a TCMS MCP server.',
    metadata: { author: 'qaspec', version: '1.5' },
  };
}

export function getQasPublishCommandTemplate(): CommandTemplate {
  return {
    name: 'QAS: Publish',
    description: 'Resolve TCMS target, confirm with user, then publish to your TCMS',
    category: QASPEC_COMMAND_CATEGORY,
    tags: ['workflow', 'publish', 'qa'],
    content: QAS_PUBLISH_BODY,
  };
}
