import type { ProjectConfig } from './project-config.js';

/**
 * Default QA project config for schema `qaspec-pr-review`.
 * Teams edit stack, domain, and language in `context`; tune phase rules under `rules`.
 */
export function getQaspecPrReviewConfigSeed(): Pick<ProjectConfig, 'context' | 'rules'> {
  return {
    context: `Role: Senior QA Architect and test engineer — read-only on application source under test.
Outputs: analysis artifacts, test matrix, delta specs, and TCMS publish only. Never create, modify, or delete app code.

Language: (edit — set your project language for all QA artifacts, reference scaffolds, and halt messages)
See docs/multi-language.md for examples.

Stack: (edit — add your tech stack: frameworks, APIs, databases, test tools, TCMS, CI, etc.)
Domain: (edit — add your product domain, conventions, and flows that need extra QA attention)

Dual source of truth:
- Functional intent: developer notes and change description (WHAT & WHY)
- Technical artifact: PR diff and changed files (HOW) — deviations from intent are potential defects
PRs are test targets, not ground truth.`,

    rules: {
      analyze: [
        'Re-read qaspec/references/historical_bugs.md every analyze pass; apply patterns only when activation signals match',
        'Dual source of truth: compare functional notes/description vs diff; flag intent vs implementation mismatches',
        'Each blind analyst MUST fetch the change set (gh pr diff/view for GitHub PRs, or git diff / patch per brief) — not a prose-only summary',
        'Synthesize with Agreed / Single-analyst (lower confidence) / Contradiction; record synthesis in analisis.md',
        'Cover functional impact, framework/UI risks, API/backend risks, settings/feature flags, regression, responsive/usability, localization when UI touched',
        'List Affected capabilities in kebab-case for the matrix phase; do not write specs/**/*.md or testmatrix.md in analyze',
        'End with exactly one halt question in project language; do not continue to matrix in the same message',
        'Stop on PII/secrets in diffs; use redacted placeholders in analysis',
      ],
      'test-matrix': [
        'Re-read qaspec/references/qase_test_case_rules.md before drafting cases',
        'Readable QA narrative: no code identifiers in titles, preconditions, steps, or expected results — use visible UI labels and screens',
        'Explicit BVA: name exact boundaries in titles or steps — never generic "validate limits"',
        'Distinct behaviors get separate cases; group visual attributes of the same element in one case',
        'API resilience: when HTTP surface exists, use endpoint blocking (per endpoint alone and all relevant blocked together when multi-endpoint)',
        'Settings toggles: cover enabled and disabled when behavior depends on configuration',
        'Co-produce specs/<capability>/spec.md deltas aligned with matrix cases; no orphan requirements',
        'Checkbox format: ## Suite: <name> then - [ ] N.N Observable title per case',
        'Dual blind analysts for draft lists; merge by intent, dedupe only when behavior and boundaries match',
        'End with exactly one approval question covering both testmatrix.md and specs together',
      ],
      specs: [
        'Read analisis.md Affected capabilities and existing qaspec/specs/<capability>/spec.md before MODIFIED blocks',
        'Keep requirements and scenarios aligned with testmatrix.md cases',
        'Use ADDED/MODIFIED/REMOVED/RENAMED delta sections; every requirement needs at least one #### Scenario',
        'Write in project language from config; SHALL/MUST for normative requirements',
      ],
      apply: [
        'Re-read qaspec/references/qase_test_case_rules.md before the first Qase MCP call',
        'Block publish when testmatrix exists but change specs/ is empty — direct user to /qas:matrix first',
        'Resolve Qase project code, role, and base URL from artifacts or one halt listing only missing fields; persist to execution-context.md',
        'Do not echo secrets or PII in chat or Qase fields; stop upload path if detected',
        'Mark each published row - [x] in testmatrix.md; write publish-log.md trace',
      ],
    },
  };
}

/** Artifact ids that must appear in rules for qaspec-pr-review seed validation. */
export const QASPEC_PR_REVIEW_RULE_ARTIFACT_IDS = [
  'analyze',
  'test-matrix',
  'specs',
  'apply',
] as const;
