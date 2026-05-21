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
5. Project phase policy lives in \`qaspec/config.yaml\` \`rules.<artifact-id>\`; skills orchestrate only.

**Read-only** on application source under test.`;
}

export const QAS_EXPLORE_CONFIG_PREAMBLE = `## Config (explore)

Read \`qaspec/config.yaml\` \`context\` (and \`rules\` when relevant) for project language and QA role constraints.
**Read-only** on application source under test.`;

export const QAS_DUAL_ANALYST_PROTOCOL = `## Dual blind analysts (mandatory when Task tool is available)

- Launch **two** parallel **Task** subagents with the **same** analyst brief; do not tell either that a peer exists.
- Each analyst MUST fetch the change set themselves (\`gh pr diff\` / \`gh pr view\` for GitHub PRs, or \`git diff\` / patch per brief).
- Read \`qaspec/references/historical_bugs.md\` before drafting (mandatory every run).
- Optional: inject \`## Project Standards (auto-resolved)\` from \`.atl/skill-registry.md\` into both prompts when the file exists.
- After **both** return: synthesize once — **Agreed** (keep stronger wording), **Single-analyst** (include with lower confidence), **Contradiction** (call out; prefer conservative test impact).
- **Forbidden:** solo-authored phase output without two analyst drafts when Task is available. If Task is unavailable, stop and tell the user.`;

export function getQasAnalystPromptBlock(phase: 'analyze' | 'matrix'): string {
  const phaseTask =
    phase === 'analyze'
      ? 'Produce structured PR/change analysis per schema template sections. Do NOT add the final user halt question.'
      : 'Produce draft test cases in Markdown (suites, checkbox lines, types). Do NOT add approval halt. Do NOT publish to Qase.';

  const extraRef =
    phase === 'matrix'
      ? '\n- Also read `qaspec/references/qase_test_case_rules.md`'
      : '';

  return `## Analyst Task prompt (copy identically to both parallel Task runs)

\`\`\`
You are a QA analyst executing one pass of the QASpec workflow.

**Repository write ban:** Do NOT create, modify, or delete repository files. Shell only for read-only gh/git.

## Mandatory references
- qaspec/references/historical_bugs.md${extraRef}
- Apply rules from the orchestrator brief (project config)

## Obtain the change set yourself
- GitHub PR: run gh pr diff and gh pr view (--repo if specified in brief)
- Otherwise: run git diff or read the patch path from the brief
- Read changed source files with read/search after you have the patch

## PR / change identity (orchestrator fills — identical for both analysts)
{PR number, URL, gh flags, developer notes, or non-GH fallback}

## Task
${phaseTask}

Return only your draft. End with: Skill Resolution: {injected|fallback-registry|fallback-path|none}
\`\`\``;
}
