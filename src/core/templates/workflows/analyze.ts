import type { SkillTemplate, CommandTemplate } from '../types.js';
import { QASPEC_COMMAND_CATEGORY } from '../../qaspec-commands.js';
import {
  getQasWorkflowConfigPreamble,
  getQasSubagentModeWorkflowSection,
  getQasAnalystPromptBlock,
} from './qas-workflow-preamble.js';

const QAS_ANALYZE_BODY = `${getQasWorkflowConfigPreamble(['analyze', 'specs'])}

Run QASpec **analyze** (Phase 1). Produce \`analysis.md\` at \`resolvedOutputPath\` plus co-produced change delta specs under \`specs/**/*.md\`.

${getQasSubagentModeWorkflowSection('analyze')}

${getQasAnalystPromptBlock('analyze')}

## Gather change set

- **GitHub PR:** \`gh pr diff\` and \`gh pr view --json title,body,state,files,baseRefName,headRefName\` (add \`--repo owner/repo\` when needed). Ask once for PR number/URL if missing — not for a patch export.
- **Fallback:** \`git diff <base>...HEAD\` or user-supplied \`.diff\` / \`.patch\`.
- Read affected \`.ts\`, \`.html\`, and related files after you know paths from the diff.

## Steps

1. Complete **Config and CLI** above (both analyze and specs instruction JSON); confirm \`workflow.multipleSubagents.review\` from config (or JSON \`instruction\` subagent mode block).
2. Read \`qaspec/references/historical_bugs.md\` (mandatory; re-read this run).
3. For each affected capability, read \`qaspec/specs/<capability>/spec.md\` when present (previously agreed behavior; baseline for MODIFIED deltas).
4. **If review flag is false (default):** fetch the change set yourself; write \`analysis.md\` per template (orchestrator-only; no Task subagents).
5. **If review flag is true:** run **two parallel blind Task** subagents using the analyst prompt; wait for both; synthesize into one \`analysis.md\` (include **Synthesis notes** for Agreed / Single-analyst / Contradiction).
6. Include **Affected capabilities** (kebab-case).
7. Apply \`rules.analyze\` from config for depth (intent vs implementation, risks, regression, responsive, i18n, settings).
8. Draft delta specs: \`specs/<capability>/spec.md\` using ADDED/MODIFIED/REMOVED/RENAMED delta sections per the specs instruction JSON and \`templates/spec.md\`; copy the full requirement block from \`qaspec/specs/<capability>/spec.md\` before editing MODIFIED; encode agreed intent — never a known defect as accepted SHALL/MUST.
9. End chat with **exactly one** halt question covering both \`analysis.md\` and the delta specs. Do NOT write \`testcases.md\` or continue to cases in the same message.
10. When the user answers the halt or adds clarifications (defect vs expected, scope, env): update \`analysis.md\` — especially **Validated clarifications** and **Functional intent vs implementation** — **and** affected \`specs/**/*.md\` before suggesting \`/qsx:cases\`. Chat-only approvals are not visible to cases.

**Guardrails:** no Qase MCP; no app code edits; one message for this phase unless updating \`analysis.md\` or delta specs after user halt response.`;

export function getQasAnalyzeSkillTemplate(): SkillTemplate {
  return {
    name: 'qaspec-analyze',
    description: 'QASpec analyze — analysis.md plus change delta specs under specs/**/*.md',
    instructions: QAS_ANALYZE_BODY,
    compatibility:
      'Requires qaspec CLI; gh or git for diffs; optional Cursor Task when workflow.multipleSubagents.review is true.',
    metadata: { author: 'qaspec', version: '1.4' },
  };
}

export function getQasAnalyzeCommandTemplate(): CommandTemplate {
  return {
    name: 'QAS: Analyze',
    description: 'Analyze change and write analysis.md plus delta specs (orchestrator or dual-analyst per config)',
    category: QASPEC_COMMAND_CATEGORY,
    tags: ['workflow', 'analyze', 'qa'],
    content: QAS_ANALYZE_BODY,
  };
}
