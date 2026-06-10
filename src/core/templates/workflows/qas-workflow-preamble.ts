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

- Launch **two** parallel **Task** subagents with the **same** analyst brief; do not tell either that a peer exists.
- Each analyst MUST fetch the change set themselves (\`gh pr diff\` / \`gh pr view\` for GitHub PRs, or \`git diff\` / patch per brief).
- Read \`qaspec/references/historical_bugs.md\` before drafting (mandatory every run).
- Optional: inject \`## Project Standards (auto-resolved)\` from \`.atl/skill-registry.md\` into both prompts when the file exists.
- After **both** return: synthesize once — **Agreed** (keep stronger wording), **Single-analyst** (include with lower confidence), **Contradiction** (call out; prefer conservative test impact).
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
  const phaseTask =
    phase === 'analyze'
      ? 'Produce structured PR/change analysis per schema template sections, plus proposed delta spec requirements (ADDED/MODIFIED/REMOVED/RENAMED per affected capability). Do NOT add the final user halt question.'
      : 'Produce draft test cases in Markdown (suites, checkbox lines, types). Do NOT add approval halt. Do NOT publish to Qase.';

  const extraRef =
    phase === 'cases'
      ? '\n- Also read `qaspec/references/qase_test_case_rules.md`'
      : '';

  const casesAuthority =
    phase === 'cases'
      ? `
## Validated analysis and specs (binding — orchestrator pastes full analysis.md and change delta specs)
{FULL analysis.md BODY plus change specs/**/*.md content — mandatory; overrides PR/diff when they conflict}

## Conflict rule (cases only)
- analysis.md and the delta specs win over gh/git diff and over current implementation
- Cover every requirement scenario in the delta specs with at least one case
- Defects in analysis → draft cases for corrected behavior, not for accepting the bug
`
      : '';

  return `## Analyst Task prompt (use only when ${phase === 'analyze' ? 'workflow.multipleSubagents.review' : 'workflow.multipleSubagents.cases'} is true — copy identically to both parallel Task runs)

\`\`\`
You are a QA analyst executing one pass of the QASpec workflow.

**Repository write ban:** Do NOT create, modify, or delete repository files. Shell only for read-only gh/git.

## Mandatory references
- qaspec/references/historical_bugs.md${extraRef}
- Apply rules from the orchestrator brief (project config)
${casesAuthority}
## Obtain the change set yourself
- GitHub PR: run gh pr diff and gh pr view (--repo if specified in brief)
- Otherwise: run git diff or read the patch path from the brief
- Read changed source files with read/search after you have the patch
${phase === 'cases' ? '- Use the diff only where analysis.md and the delta specs do not already decide expected vs defective behavior' : ''}

## PR / change identity (orchestrator fills — identical for both analysts)
{PR number, URL, gh flags, developer notes, or non-GH fallback}

## Task
${phaseTask}

Return only your draft. End with: Skill Resolution: {injected|fallback-registry|fallback-path|none}
\`\`\``;
}
