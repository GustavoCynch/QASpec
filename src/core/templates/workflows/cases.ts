import type { SkillTemplate, CommandTemplate } from '../types.js';
import { QASPEC_COMMAND_CATEGORY } from '../../qaspec-commands.js';
import {
  getQasWorkflowConfigPreamble,
  QAS_CASES_ANALYSIS_AUTHORITY,
  getQasSubagentModeWorkflowSection,
  getQasAnalystPromptBlock,
} from './qas-workflow-preamble.js';

const QAS_CASES_BODY = `${getQasWorkflowConfigPreamble(['test-cases'])}

Run QASpec **cases** (Phase 2). Produce \`testcases.md\` with mandatory checkboxes covering the approved change delta specs under \`specs/**/*.md\`.

${QAS_CASES_ANALYSIS_AUTHORITY}

${getQasSubagentModeWorkflowSection('cases')}

${getQasAnalystPromptBlock('cases')}

## Steps

1. Run \`qaspec status --change "<name>" --json\` and check \`approval.analyze\`. When \`stale\` or \`missing\`, halt and ask the user to re-approve via \`/qsx:analyze\` — do not draft \`testcases.md\` in that message.
2. Complete **Config and CLI** above (test-cases instruction JSON); confirm \`workflow.multipleSubagents.cases\` from config (or JSON \`instruction\` subagent mode block).
3. Read \`analysis.md\` in full (mandatory first read). If material clarifications exist only in chat and are missing from \`analysis.md\`, update \`analysis.md\` and affected \`specs/**/*.md\` first — do not draft cases until they reflect them.
4. Read the change \`specs/**/*.md\` files in full (mandatory; binding input for the case list).
5. Read \`qaspec/references/qase_test_case_rules.md\`.
6. For each capability in \`analysis.md\`, read \`qaspec/specs/<capability>/spec.md\` when present (context for regression cases).
7. **If cases flag is false (default):** fetch PR/diff as needed; draft \`testcases.md\` in the orchestrator (no Task subagents).
8. **If cases flag is true:** run **two parallel blind Task** subagents; paste the **full** \`analysis.md\` and the change delta specs into each prompt; analysts return drafts **grouped by requirement slug**; merge as keyed union with recorded discards.
9. **Mandatory traceability:** Every case MUST carry \`<!-- req: capability/requirement-slug -->\`, \`<!-- req: assumption:<id> -->\`, or \`<!-- req: gap -->\`.
10. Format cases: \`## Suite: <name>\` then per case \`- [ ] N.N Observable title\`, then **Preconditions** and **Steps** (Action + Expected table) indented below the checkbox line per \`templates/testcases.md\` and \`qase_test_case_rules.md\`.
11. Run \`qaspec validate cases --change "<name>"\` before the approval halt; fix all errors and re-run after edits. Include the validator coverage summary in the halt message. The halt is forbidden until validation passes.
12. End with an approval halt covering the case list. Do NOT create or update \`specs/**/*.md\` in this step. Do NOT publish to Qase.

User-requested edits after halt: update artifacts as needed, re-run \`qaspec validate cases\`, then present halt again.`;

export function getQasCasesSkillTemplate(): SkillTemplate {
  return {
    name: 'qaspec-cases',
    description: 'QASpec test cases — testcases.md covering the approved delta specs',
    instructions: QAS_CASES_BODY,
    compatibility:
      'Requires qaspec CLI; optional Cursor Task when workflow.multipleSubagents.cases is true.',
    metadata: { author: 'qaspec', version: '1.5' },
  };
}

export function getQasCasesCommandTemplate(): CommandTemplate {
  return {
    name: 'QAS: Cases',
    description: 'Build approved testcases.md covering the delta specs (orchestrator or dual-analyst per config)',
    category: QASPEC_COMMAND_CATEGORY,
    tags: ['workflow', 'cases', 'qa'],
    content: QAS_CASES_BODY,
  };
}
