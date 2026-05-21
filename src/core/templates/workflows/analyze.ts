import type { SkillTemplate, CommandTemplate } from '../types.js';
import { QASPEC_COMMAND_CATEGORY } from '../../qaspec-commands.js';
import {
  getQasWorkflowConfigPreamble,
  getQasSubagentModeWorkflowSection,
  getQasAnalystPromptBlock,
} from './qas-workflow-preamble.js';

const QAS_ANALYZE_BODY = `${getQasWorkflowConfigPreamble(['analyze'])}

Run QASpec **analyze** (Phase 1). Produce \`analisis.md\` at \`resolvedOutputPath\`.

${getQasSubagentModeWorkflowSection('analyze')}

${getQasAnalystPromptBlock('analyze')}

## Gather change set

- **GitHub PR:** \`gh pr diff\` and \`gh pr view --json title,body,state,files,baseRefName,headRefName\` (add \`--repo owner/repo\` when needed). Ask once for PR number/URL if missing — not for a patch export.
- **Fallback:** \`git diff <base>...HEAD\` or user-supplied \`.diff\` / \`.patch\`.
- Read affected \`.ts\`, \`.html\`, and related files after you know paths from the diff.

## Steps

1. Complete **Config and CLI** above; confirm \`workflow.multipleSubagents.review\` from config (or JSON \`instruction\` subagent mode block).
2. Read \`qaspec/references/historical_bugs.md\` (mandatory; re-read this run).
3. **If review flag is false (default):** fetch the change set yourself; write \`analisis.md\` per template (orchestrator-only; no Task subagents).
4. **If review flag is true:** run **two parallel blind Task** subagents using the analyst prompt; wait for both; synthesize into one \`analisis.md\` (include **Synthesis notes** for Agreed / Single-analyst / Contradiction).
5. Include **Affected capabilities** (kebab-case) for the matrix phase.
6. Apply \`rules.analyze\` from config for depth (intent vs implementation, risks, regression, responsive, i18n, settings).
7. End chat with **exactly one** halt question. Do NOT write \`testmatrix.md\`, \`specs/**/*.md\`, or continue to matrix in the same message.
8. When the user answers the halt or adds clarifications (defect vs expected, scope, env): update \`analisis.md\` — especially **Validated clarifications** and **Functional intent vs implementation** — before suggesting \`/qsx:matrix\`. Chat-only approvals are not visible to matrix.

**Guardrails:** no Qase MCP; no app code edits; one message for this phase unless updating \`analisis.md\` after user halt response.`;

export function getQasAnalyzeSkillTemplate(): SkillTemplate {
  return {
    name: 'qaspec-analyze',
    description: 'QASpec analyze — PR/requirements analysis and risks into analisis.md',
    instructions: QAS_ANALYZE_BODY,
    compatibility:
      'Requires qaspec CLI; gh or git for diffs; optional Cursor Task when workflow.multipleSubagents.review is true.',
    metadata: { author: 'qaspec', version: '1.2' },
  };
}

export function getQasAnalyzeCommandTemplate(): CommandTemplate {
  return {
    name: 'QAS: Analyze',
    description: 'Analyze change and write analisis.md (orchestrator or dual-analyst per config)',
    category: QASPEC_COMMAND_CATEGORY,
    tags: ['workflow', 'analyze', 'qa'],
    content: QAS_ANALYZE_BODY,
  };
}
