import type { SkillTemplate, CommandTemplate } from '../types.js';
import { QASPEC_COMMAND_CATEGORY } from '../../qaspec-commands.js';

const QAS_MATRIX_BODY = `Run QASpec **matrix** (Phase 2). Produce \`testmatrix.md\` with mandatory checkboxes.

**Language:** Case titles, suites, and halt use project language from \`openspec/config.yaml\`.

**Read-only** on application source under test.

**Steps**

1. Resolve change; run \`openspec instructions test-matrix --change "<name>" --json\` (artifact id \`test-matrix\`).
2. Read \`qaspec/references/qase_test_case_rules.md\` and \`analisis.md\`.
3. Run **two parallel blind Task subagents** for draft case lists; merge into one matrix.
4. Format: \`## Suite: <name>\` then \`- [ ] 1.1 Observable title\` per case (progress parser requires checkboxes).
5. Plain-language titles; no code identifiers in case text; include BVA/negative/regression when risks warrant.
6. End with **exactly one** approval halt. Do NOT publish to Qase in this step.

User-requested edits after halt: update \`testmatrix.md\` in chat without a separate revise command.`;

export function getQasMatrixSkillTemplate(): SkillTemplate {
  return {
    name: 'qas-matrix',
    description: 'QASpec test matrix — checkbox test cases in testmatrix.md',
    instructions: QAS_MATRIX_BODY,
    compatibility: 'Requires openspec CLI.',
    metadata: { author: 'qaspec', version: '1.0' },
  };
}

export function getQasMatrixCommandTemplate(): CommandTemplate {
  return {
    name: 'QAS: Matrix',
    description: 'Build approved testmatrix.md with checkboxes',
    category: QASPEC_COMMAND_CATEGORY,
    tags: ['workflow', 'matrix', 'qa'],
    content: QAS_MATRIX_BODY,
  };
}
