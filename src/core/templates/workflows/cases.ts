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

1. Complete **Config and CLI** above (test-cases instruction JSON); confirm \`workflow.multipleSubagents.cases\` from config (or JSON \`instruction\` subagent mode block).
2. Read \`analysis.md\` in full (mandatory first read). If material clarifications exist only in chat (defect vs expected, scope cuts) and are missing from \`analysis.md\`, update \`analysis.md\` and affected \`specs/**/*.md\` first (especially **Validated clarifications**) — do not draft cases until they reflect them.
3. Read the change \`specs/**/*.md\` files in full (mandatory; binding input for the case list).
4. Read \`qaspec/references/qase_test_case_rules.md\`.
5. For each capability in \`analysis.md\`, read \`qaspec/specs/<capability>/spec.md\` when present (context for regression cases).
6. **If cases flag is false (default):** fetch PR/diff as needed; draft \`testcases.md\` in the orchestrator (no Task subagents).
7. **If cases flag is true:** run **two parallel blind Task** subagents; paste the **full** \`analysis.md\` and the change delta specs into each prompt under **Validated analysis and specs (binding)**; then fetch PR/diff per analyst brief. Merge into one case list per \`rules.test-cases\`.
8. **Merge rules (dual analysts only):** union by intent; dedupe only when behavior and boundaries match — not when titles merely look similar. Drop any analyst draft that contradicts \`analysis.md\` or the delta specs.
9. **Self-audit before output:** every requirement scenario in the change delta specs covered by at least one case; every case traceable to \`analysis.md\` or the specs; defects test corrected behavior; explicit BVA; no comma/group explosion; readable narrative; API blocking when applicable; every step traceable to a read source unless marked as a documented gap.
10. Format cases: \`## Suite: <name>\` then per case \`- [ ] N.N Observable title\`, then **Preconditions** and **Steps** (Action + Expected table) indented below the checkbox line per \`templates/testcases.md\` and \`qase_test_case_rules.md\`. Build steps from sources in hand — not invented vague flows. Optional: \`<!-- req: capability/requirement-slug -->\` or \`<!-- gap: ... -->\` when detail is missing.
11. End with **exactly one** approval halt covering the case list and preconditions/steps. Do NOT create or update \`specs/**/*.md\` in this step. Do NOT publish to Qase.

User-requested edits after halt: if the change affects agreed behavior or defect vs expected, update \`analysis.md\` and affected \`specs/**/*.md\` first, then \`testcases.md\` in the same conversation.`;

export function getQasCasesSkillTemplate(): SkillTemplate {
  return {
    name: 'qaspec-cases',
    description: 'QASpec test cases — testcases.md covering the approved delta specs',
    instructions: QAS_CASES_BODY,
    compatibility:
      'Requires qaspec CLI; optional Cursor Task when workflow.multipleSubagents.cases is true.',
    metadata: { author: 'qaspec', version: '1.4' },
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
