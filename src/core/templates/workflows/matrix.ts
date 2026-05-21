import type { SkillTemplate, CommandTemplate } from '../types.js';
import { QASPEC_COMMAND_CATEGORY } from '../../qaspec-commands.js';
import {
  getQasWorkflowConfigPreamble,
  QAS_DUAL_ANALYST_PROTOCOL,
  getQasAnalystPromptBlock,
} from './qas-workflow-preamble.js';

const QAS_MATRIX_BODY = `${getQasWorkflowConfigPreamble(['test-matrix', 'specs'])}

Run QASpec **matrix** (Phase 2). Produce \`testmatrix.md\` with mandatory checkboxes and co-produced change delta specs under \`specs/**/*.md\`.

${QAS_DUAL_ANALYST_PROTOCOL}

${getQasAnalystPromptBlock('matrix')}

## Steps

1. Complete **Config and CLI** above (both test-matrix and specs instruction JSON).
2. Read \`qaspec/references/qase_test_case_rules.md\` and \`analisis.md\` (**Affected capabilities**).
3. For each capability in \`analisis.md\`, read \`qaspec/specs/<capability>/spec.md\` when present (baseline for MODIFIED deltas).
4. Run **two parallel blind Task** subagents for draft case lists; merge into one matrix and aligned delta specs per \`rules.test-matrix\` and \`rules.specs\`.
5. **Merge rules:** union by intent; dedupe only when behavior and boundaries match — not when titles merely look similar.
6. **Self-audit before output:** explicit BVA; no comma/group explosion in suite lines; readable narrative (no code symbols in case text); API blocking coverage when applicable.
7. Format matrix: \`## Suite: <name>\` then \`- [ ] 1.1 Observable title\` per case. Optional: \`<!-- req: capability/requirement-slug -->\`.
8. Format specs: \`specs/<capability>/spec.md\` using ADDED/MODIFIED/REMOVED/RENAMED delta sections; align with matrix cases.
9. End with **exactly one** approval halt covering **both** the case list and requirements. Do NOT publish to Qase in this step.

User-requested edits after halt: update \`testmatrix.md\` and affected \`specs/**/*.md\` in chat without a separate slash command.`;

export function getQasMatrixSkillTemplate(): SkillTemplate {
  return {
    name: 'qas-matrix',
    description: 'QASpec test matrix and delta specs — testmatrix.md + specs/**/*.md',
    instructions: QAS_MATRIX_BODY,
    compatibility: 'Requires qaspec CLI; Cursor Task for dual analysts.',
    metadata: { author: 'qaspec', version: '1.1' },
  };
}

export function getQasMatrixCommandTemplate(): CommandTemplate {
  return {
    name: 'QAS: Matrix',
    description: 'Build approved testmatrix.md and change delta specs in one phase',
    category: QASPEC_COMMAND_CATEGORY,
    tags: ['workflow', 'matrix', 'qa'],
    content: QAS_MATRIX_BODY,
  };
}
