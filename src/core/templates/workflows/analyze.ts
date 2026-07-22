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
4. **ABSENT-intent guard:** When PR description and developer notes are missing or non-substantive, write \`Functional intent: ABSENT — no independent intent source\` in **Functional intent vs implementation**, do not reconstruct intent from the diff alone, and make obtaining intent the first halt question.
5. **If review flag is false (default):** fetch the change set yourself; write \`analysis.md\` per template (orchestrator-only; no Task subagents).
6. **If review flag is true:** run **two parallel blind Task** subagents with heterogeneous briefs (intent-first without diff / implementation-first without description); synthesize predicted vs reconstructed behavior in **Synthesis notes**.
7. Include **Affected capabilities** (kebab-case) and **Unvalidated assumptions** (risk-ordered, confidence-marked).
8. Apply \`rules.analyze\` from config for depth (intent vs implementation, risks, regression, responsive, i18n, settings).
9. Draft delta specs: \`specs/<capability>/spec.md\` using ADDED/MODIFIED/REMOVED/RENAMED delta sections per the specs instruction JSON and \`templates/spec.md\`; copy the full requirement block from \`qaspec/specs/<capability>/spec.md\` before editing MODIFIED; encode agreed intent — never a known defect as accepted SHALL/MUST.
10. End with an **approval digest** (requirement one-liners + **Unvalidated assumptions**) and **zero to three** targeted questions. Do not fabricate a question when none exists — state no blocking question and request digest approval. Do NOT write \`testcases.md\` or continue to cases in the same message.
11. When the user approves: persist only facts they **explicitly addressed** in **Validated clarifications**; keep unconfirmed inferences in **Unvalidated assumptions**; update affected \`specs/**/*.md\` as needed.
12. After approval, run \`qaspec approve analyze --change "<name>" [--head-sha <sha>]\` and confirm hashed artifacts in the output.

**Guardrails:** no TCMS MCP; no app code edits; one message for this phase unless updating \`analysis.md\` or delta specs after user halt response.`;

export function getQasAnalyzeSkillTemplate(): SkillTemplate {
  return {
    name: 'qaspec-analyze',
    description: 'QASpec analyze — analysis.md plus change delta specs under specs/**/*.md',
    instructions: QAS_ANALYZE_BODY,
    compatibility:
      'Requires qaspec CLI; gh or git for diffs; optional Cursor Task when workflow.multipleSubagents.review is true.',
    metadata: { author: 'qaspec', version: '1.5' },
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
