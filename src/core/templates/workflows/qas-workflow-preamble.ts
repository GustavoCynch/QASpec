/**
 * Shared instructions for generated QASpec workflow skills/commands.
 */

export function getQasWorkflowConfigPreamble(instructionArtifacts: string[]): string {
  const instructionRuns = instructionArtifacts
    .map((id) => `   - Run \`qaspec instructions ${id} --change "<name>" --json\``)
    .join('\n');

  return `## Config and CLI (mandatory)

1. Resolve change name; run \`qaspec status --change "<name>" --json\`.
2. Load artifact contract:
${instructionRuns}
3. Apply JSON \`context\` and \`rules\` as binding constraints — **do NOT** copy them into artifact files.
4. Use JSON \`instruction\`, \`template\`, and \`resolvedOutputPath\` when writing outputs.
5. Read \`workflow.multipleSubagents\` in \`qaspec/config.yaml\` before choosing subagent mode (defaults: review **false**, cases **false**).
6. Project phase policy lives in \`qaspec/config.yaml\` \`rules.<artifact-id>\`; skills orchestrate only.

**Read-only** on application source under test.`;
}

export const QAS_BASE_CONFIG_PREAMBLE = `## Config

Read \`qaspec/config.yaml\` \`context\` (and \`rules\` when relevant) for project language and QA role constraints.
**Read-only** on application source under test.`;

export const QAS_CASES_ANALYSIS_AUTHORITY = `## analysis.md and delta specs are source of truth (cases phase)

- \`analysis.md\` and the change delta specs under \`specs/**/*.md\` are user-validated output from \`/qsx:analyze\`; read both **in full** before \`gh pr diff\` / \`git diff\`.
- **Binding sections:** Validated clarifications, Functional intent vs implementation, Affected capabilities, Risks for cases phase, Synthesis notes, and every requirement/scenario in the delta specs.
- When they conflict with the diff or current code, **the validated artifacts win**. Use the diff only to decide *how* to test agreed behavior.
- Items marked defect/bug in analysis → test cases verify the **correct** behavior (fail today / pass after fix); the defect is never an accepted SHALL/MUST.`;

/** @deprecated Use getQasDualAnalystProtocol() — kept for imports during transition */
export const QAS_DUAL_ANALYST_PROTOCOL = getQasDualAnalystProtocol();

export function getQasOrchestratorOnlyProtocol(phase: 'analyze' | 'cases'): string {
  const configKey =
    phase === 'analyze'
      ? 'workflow.multipleSubagents.review'
      : 'workflow.multipleSubagents.cases';
  const phaseName = phase === 'analyze' ? 'analyze (review)' : 'cases';

  return `## Orchestrator-only (${phaseName})

- \`${configKey}\` is **false** or omitted (default).
- **You** (orchestrator) fetch the change set, read mandatory references, and write phase output — **no** Task subagents.
- **Forbidden:** delegating to one subagent as a substitute for dual analysts or for orchestrator work.`;
}

export function getQasDualAnalystProtocol(): string {
  return `## Dual blind analysts (when workflow flag is true)

**Analyze (heterogeneous briefs):**
- Analyst A (intent-first): PR description, developer notes, linked issues, baseline \`qaspec/specs\` — **no diff**.
- Analyst B (implementation-first): diff/code only — **no description**.
- Synthesis: structural comparison of predicted vs reconstructed behavior; each divergence is an intent-vs-implementation candidate; unique findings trigger targeted verification instead of automatic confidence downgrade.

**Cases (keyed merge):**
- Both analysts receive the same binding \`analysis.md\` and delta specs.
- Each returns draft cases **grouped by requirement slug** (\`capability/requirement-slug\`).
- Merge as keyed union: keep one case per slug key; record discards when analysts disagree — not semantic dedup by title alone.

**Shared:**
- Launch **two** parallel **Task** subagents; do not tell either that a peer exists.
- Read \`qaspec/references/historical_bugs.md\` before drafting (mandatory every run).
- If Task is unavailable while the flag is **true**, stop and ask the user to set the flag **false** or retry when Task exists — do not fall back to a single subagent.`;
}

export function getQasSubagentModeWorkflowSection(phase: 'analyze' | 'cases'): string {
  const configKey =
    phase === 'analyze'
      ? 'workflow.multipleSubagents.review'
      : 'workflow.multipleSubagents.cases';

  return `## Subagent mode (read \`qaspec/config.yaml\`)

Before this phase, read \`${configKey}\`. Default **false** when omitted.

${getQasOrchestratorOnlyProtocol(phase)}

When \`${configKey}\` is **true**:

${getQasDualAnalystProtocol()}`;
}

export function getQasAnalystPromptBlock(phase: 'analyze' | 'cases'): string {
  if (phase === 'analyze') {
    return `## Analyst Task prompts (use only when workflow.multipleSubagents.review is true)

**Analyst A — intent-first (no diff):**
\`\`\`
You are QA analyst A (intent-first). Repository write ban — read-only gh/git for notes only, no diff.
Read: PR description, developer notes, linked issues, qaspec/specs for affected capabilities, historical_bugs.md.
Do NOT read the PR diff or changed source files.
Produce predicted behavior per schema template sections and proposed delta spec requirements.
Return only your draft. No halt question.
\`\`\`

**Analyst B — implementation-first (no description):**
\`\`\`
You are QA analyst B (implementation-first). Repository write ban — read-only.
Read: gh pr diff / git diff, changed source files, historical_bugs.md.
Do NOT read PR description, developer notes, or linked issues.
Produce reconstructed behavior from the diff and proposed delta spec requirements.
Return only your draft. No halt question.
\`\`\`

Orchestrator synthesizes predicted vs reconstructed behavior after both return.`;
  }

  const phaseTask =
    'Produce draft test cases grouped by requirement slug (capability/requirement-slug headers). Each case: suite, checkbox line, mandatory <!-- req: ... --> annotation, Preconditions, Steps. Do NOT add approval halt. Do NOT publish to Qase.';

  return `## Analyst Task prompt (use only when workflow.multipleSubagents.cases is true — copy to both parallel Task runs)

\`\`\`
You are a QA analyst executing one pass of the QASpec cases workflow.

**Repository write ban:** Do NOT create, modify, or delete repository files. Shell only for read-only gh/git.

## Mandatory references
- qaspec/references/historical_bugs.md
- qaspec/references/qase_test_case_rules.md
- Apply rules from the orchestrator brief (project config)

## Validated analysis and specs (binding — orchestrator pastes full analysis.md and change delta specs)
{FULL analysis.md BODY plus change specs/**/*.md content — mandatory; overrides PR/diff when they conflict}

## Conflict rule
- analysis.md and the delta specs win over gh/git diff and over current implementation
- Cover every requirement with at least one case; group output by requirement slug

## Obtain the change set yourself
- GitHub PR: run gh pr diff and gh pr view (--repo if specified in brief)
- Otherwise: run git diff or read the patch path from the brief
- Use the diff only where analysis.md and the delta specs do not already decide expected vs defective behavior

## PR / change identity (orchestrator fills)
{PR number, URL, gh flags, or non-GH fallback}

## Task
${phaseTask}

Return drafts grouped by requirement slug. End with: Skill Resolution: {injected|fallback-registry|fallback-path|none}
\`\`\``;
}
