import type { ProjectConfig } from './project-config.js';

/** Resolved flags with false defaults when config or keys are absent. */
export interface MultipleSubagentsFlags {
  review: boolean;
  cases: boolean;
}

export const SUBAGENT_MODE_ORCHESTRATOR_MARKER =
  'Orchestrator-only subagent mode (do not invoke Task subagents for this phase)';

export const SUBAGENT_MODE_DUAL_ANALYST_MARKER =
  'Dual blind analyst subagent mode (two parallel Task subagents required)';

export function resolveMultipleSubagents(
  config: ProjectConfig | null | undefined
): MultipleSubagentsFlags {
  const ms = config?.workflow?.multipleSubagents;
  return {
    review: ms?.review ?? false,
    cases: ms?.cases ?? false,
  };
}

/**
 * Instruction appendix appended by the loader for qaspec-pr-review analyze / test-cases.
 */
export function getSubagentModeInstructionAppendix(
  artifactId: 'analyze' | 'test-cases',
  enabled: boolean
): string {
  const phaseLabel = artifactId === 'analyze' ? 'review (analyze)' : 'cases';
  const configKey =
    artifactId === 'analyze'
      ? 'workflow.multipleSubagents.review'
      : 'workflow.multipleSubagents.cases';

  if (!enabled) {
    return `## Subagent mode (${phaseLabel})

**${SUBAGENT_MODE_ORCHESTRATOR_MARKER}**

- \`${configKey}\` is **false** or omitted (default).
- The **orchestrator** (main agent) performs this phase: fetch the change set, read mandatory references, and write the artifact.
- **Do not** invoke Task subagents — not one analyst and not two.
- **Synthesis notes:** use \`Orchestrator-only (${configKey}: false)\` or N/A for Agreed / Contradiction tables when dual analysts were not used.`;
  }

  return `## Subagent mode (${phaseLabel})

**${SUBAGENT_MODE_DUAL_ANALYST_MARKER}**

- \`${configKey}\` is **true**.
- Launch **two** parallel blind **Task** subagents with the **same** analyst brief; do not tell either that a peer exists.
- Each analyst MUST fetch the change set (\`gh pr diff\` / \`gh pr view\` for GitHub PRs, or \`git diff\` / patch per brief).
- After **both** return: synthesize once — **Agreed**, **Single-analyst** (lower confidence), **Contradiction** in **Synthesis notes** (analyze) or merge drafts (cases).
- If the Task tool is unavailable, stop and ask the user to set \`${configKey}: false\` or retry when Task is available — do not fall back to a single subagent or solo output without both drafts.`;
}
