import type { SkillTemplate, CommandTemplate } from '../types.js';
import { QASPEC_COMMAND_CATEGORY } from '../../qaspec-commands.js';
import {
  getQasWorkflowConfigPreamble,
  QAS_MATRIX_ANALISIS_AUTHORITY,
  getQasSubagentModeWorkflowSection,
  getQasAnalystPromptBlock,
} from './qas-workflow-preamble.js';

const QAS_MATRIX_BODY = `${getQasWorkflowConfigPreamble(['test-matrix', 'specs'])}

Run QASpec **matrix** (Phase 2). Produce \`testmatrix.md\` with mandatory checkboxes and co-produced change delta specs under \`specs/**/*.md\`.

${QAS_MATRIX_ANALISIS_AUTHORITY}

${getQasSubagentModeWorkflowSection('matrix')}

${getQasAnalystPromptBlock('matrix')}

## Steps

1. Complete **Config and CLI** above (both test-matrix and specs instruction JSON); confirm \`workflow.multipleSubagents.matrix\` from config (or JSON \`instruction\` subagent mode block).
2. Read \`analisis.md\` in full (mandatory first read). If material clarifications exist only in chat (defect vs expected, scope cuts) and are missing from \`analisis.md\`, update \`analisis.md\` first (especially **Validated clarifications**) — do not draft matrix/specs until analysis reflects them.
3. Read \`qaspec/references/qase_test_case_rules.md\`.
4. For each capability in \`analisis.md\`, read \`qaspec/specs/<capability>/spec.md\` when present (baseline for MODIFIED deltas).
5. **If matrix flag is false (default):** fetch PR/diff as needed; draft \`testmatrix.md\` and aligned delta specs in the orchestrator (no Task subagents).
6. **If matrix flag is true:** run **two parallel blind Task** subagents; paste the **full** \`analisis.md\` into each prompt under **Validated analysis (binding)**; then fetch PR/diff per analyst brief. Merge into one matrix and aligned delta specs per \`rules.test-matrix\` and \`rules.specs\`.
7. **Merge rules (dual analysts only):** union by intent; dedupe only when behavior and boundaries match — not when titles merely look similar. Drop any analyst draft that contradicts \`analisis.md\`.
8. **Self-audit before output:** every case and requirement traceable to \`analisis.md\`; defects test corrected behavior; explicit BVA; no comma/group explosion; readable narrative; API blocking when applicable; every step traceable to a read source unless marked as a documented gap.
9. Format matrix: \`## Suite: <name>\` then per case \`- [ ] N.N Observable title\`, then **Preconditions** and **Steps** (Action + Expected table) indented below the checkbox line per \`templates/testmatrix.md\` and \`qase_test_case_rules.md\`. Build steps from sources in hand — not invented vague flows. Optional: \`<!-- req: capability/requirement-slug -->\` or \`<!-- gap: ... -->\` when detail is missing.
10. Format specs: \`specs/<capability>/spec.md\` using ADDED/MODIFIED/REMOVED/RENAMED delta sections; align with matrix cases and validated analysis (not raw diff alone).
11. End with **exactly one** approval halt covering **both** the case list, preconditions/steps, and requirements. Do NOT publish to Qase in this step.

User-requested edits after halt: if the change affects agreed behavior or defect vs expected, update \`analisis.md\` first, then \`testmatrix.md\` and affected \`specs/**/*.md\` in the same conversation.`;

export function getQasMatrixSkillTemplate(): SkillTemplate {
  return {
    name: 'qaspec-matrix',
    description: 'QASpec test matrix and delta specs — testmatrix.md + specs/**/*.md',
    instructions: QAS_MATRIX_BODY,
    compatibility:
      'Requires qaspec CLI; optional Cursor Task when workflow.multipleSubagents.matrix is true.',
    metadata: { author: 'qaspec', version: '1.2' },
  };
}

export function getQasMatrixCommandTemplate(): CommandTemplate {
  return {
    name: 'QAS: Matrix',
    description: 'Build approved testmatrix.md and change delta specs (orchestrator or dual-analyst per config)',
    category: QASPEC_COMMAND_CATEGORY,
    tags: ['workflow', 'matrix', 'qa'],
    content: QAS_MATRIX_BODY,
  };
}
