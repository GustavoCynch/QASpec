import type { SkillTemplate, CommandTemplate } from '../types.js';
import { QASPEC_COMMAND_CATEGORY } from '../../qaspec-commands.js';
import {
  getQasWorkflowConfigPreamble,
  QAS_CASES_ANALISIS_AUTHORITY,
  getQasSubagentModeWorkflowSection,
  getQasAnalystPromptBlock,
} from './qas-workflow-preamble.js';

const QAS_CASES_BODY = `${getQasWorkflowConfigPreamble(['test-cases', 'specs'])}

Run QASpec **cases** (Phase 2). Produce \`testcases.md\` with mandatory checkboxes and co-produced change delta specs under \`specs/**/*.md\`.

${QAS_CASES_ANALISIS_AUTHORITY}

${getQasSubagentModeWorkflowSection('cases')}

${getQasAnalystPromptBlock('cases')}

## Steps

1. Complete **Config and CLI** above (both test-cases and specs instruction JSON); confirm \`workflow.multipleSubagents.cases\` from config (or JSON \`instruction\` subagent mode block).
2. Read \`analisis.md\` in full (mandatory first read). If material clarifications exist only in chat (defect vs expected, scope cuts) and are missing from \`analisis.md\`, update \`analisis.md\` first (especially **Validated clarifications**) — do not draft cases/specs until analysis reflects them.
3. Read \`qaspec/references/qase_test_case_rules.md\`.
4. For each capability in \`analisis.md\`, read \`qaspec/specs/<capability>/spec.md\` when present (baseline for MODIFIED deltas).
5. **If cases flag is false (default):** fetch PR/diff as needed; draft \`testcases.md\` and aligned delta specs in the orchestrator (no Task subagents).
6. **If cases flag is true:** run **two parallel blind Task** subagents; paste the **full** \`analisis.md\` into each prompt under **Validated analysis (binding)**; then fetch PR/diff per analyst brief. Merge into one case list and aligned delta specs per \`rules.test-cases\` and \`rules.specs\`.
7. **Merge rules (dual analysts only):** union by intent; dedupe only when behavior and boundaries match — not when titles merely look similar. Drop any analyst draft that contradicts \`analisis.md\`.
8. **Self-audit before output:** every case and requirement traceable to \`analisis.md\`; defects test corrected behavior; explicit BVA; no comma/group explosion; readable narrative; API blocking when applicable; every step traceable to a read source unless marked as a documented gap.
9. Format cases: \`## Suite: <name>\` then per case \`- [ ] N.N Observable title\`, then **Preconditions** and **Steps** (Action + Expected table) indented below the checkbox line per \`templates/testcases.md\` and \`qase_test_case_rules.md\`. Build steps from sources in hand — not invented vague flows. Optional: \`<!-- req: capability/requirement-slug -->\` or \`<!-- gap: ... -->\` when detail is missing.
10. Format specs: \`specs/<capability>/spec.md\` using ADDED/MODIFIED/REMOVED/RENAMED delta sections; align with test cases and validated analysis (not raw diff alone).
11. End with **exactly one** approval halt covering **both** the case list, preconditions/steps, and requirements. Do NOT publish to Qase in this step.

User-requested edits after halt: if the change affects agreed behavior or defect vs expected, update \`analisis.md\` first, then \`testcases.md\` and affected \`specs/**/*.md\` in the same conversation.`;

export function getQasCasesSkillTemplate(): SkillTemplate {
  return {
    name: 'qaspec-cases',
    description: 'QASpec test cases and delta specs — testcases.md + specs/**/*.md',
    instructions: QAS_CASES_BODY,
    compatibility:
      'Requires qaspec CLI; optional Cursor Task when workflow.multipleSubagents.cases is true.',
    metadata: { author: 'qaspec', version: '1.2' },
  };
}

export function getQasCasesCommandTemplate(): CommandTemplate {
  return {
    name: 'QAS: Cases',
    description: 'Build approved testcases.md and change delta specs (orchestrator or dual-analyst per config)',
    category: QASPEC_COMMAND_CATEGORY,
    tags: ['workflow', 'cases', 'qa'],
    content: QAS_CASES_BODY,
  };
}
