import type { ProjectConfig } from './project-config.js';

/**
 * Default QA project config for schema `qaspec-pr-review`.
 * Teams edit stack, domain, and language in `context`; tune phase rules under `rules`.
 */
export function getQaspecPrReviewConfigSeed(): Pick<ProjectConfig, 'context' | 'rules' | 'workflow'> {
  return {
    workflow: {
      multipleSubagents: {
        review: false,
        cases: false,
      },
    },
    context: `Role: Senior QA Architect and test engineer — read-only on application source under test.
Outputs: analysis artifacts, test cases, delta specs, and TCMS publish only. Never create, modify, or delete app code.

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
        'ABSENT-intent guard: when PR description and developer notes are missing or non-substantive, write Functional intent: ABSENT — do not reconstruct intent from the diff alone',
        'Default: orchestrator-only (workflow.multipleSubagents.review: false) — fetch change set yourself; no Task subagents',
        'When workflow.multipleSubagents.review is true: two parallel blind Task analysts with heterogeneous briefs (intent-first without diff / implementation-first without description); synthesize predicted vs reconstructed behavior',
        'Cover functional impact, framework/UI risks, API/backend risks, settings/feature flags, regression, responsive/usability, localization when UI touched',
        'List Affected capabilities in kebab-case; maintain Unvalidated assumptions section (risk-ordered, confidence-marked)',
        'Co-produce specs/<capability>/spec.md deltas with analysis.md in this phase; encode agreed intent — never a known defect as accepted SHALL/MUST',
        'Do not write testcases.md in analyze',
        'End with approval digest and zero to three targeted questions; do not fabricate a question when none exists',
        'After halt: persist only user-explicit facts in Validated clarifications; run qaspec approve analyze --change <name> after approval',
        'Stop on PII/secrets in diffs; use redacted placeholders in analysis',
      ],
      'test-cases': [
        'Check qaspec status --json approval.analyze before drafting; halt on stale or missing and request re-approval via /qsx:analyze',
        'Read analysis.md and the change delta specs (specs/**/*.md) in full before PR diff; they win when they conflict with diff or current code',
        'Re-read qaspec/references/qase_test_case_rules.md before drafting cases',
        'Mandatory traceability: every case carries <!-- req: capability/slug -->, assumption:<id>, or gap',
        'Each case: one - [ ] checkbox line, then **Preconditions** and **Steps** (Action + Expected per step) under that line',
        'Build preconditions and steps from analysis.md, the delta specs, diff, requirements, qaspec/specs, and observable UI/API from sources — do not invent vague flows',
        'Defects in analysis → cases for corrected behavior; never treat a known bug as accepted behavior',
        'Do not create or update specs/**/*.md in this phase; when a clarification changes agreed behavior, update analysis.md and affected specs first',
        'When workflow.multipleSubagents.cases is true: dual analysts return drafts grouped by requirement slug; merge as keyed union',
        'Run qaspec validate cases --change <name> before halt; fix errors and re-run after edits; include coverage summary in halt',
        'End with approval question covering the case list',
      ],
      specs: [
        'Read analysis.md in full first; analysis.md overrides diff when they conflict',
        'Read Affected capabilities and existing qaspec/specs/<capability>/spec.md before MODIFIED blocks',
        'Co-produced with analysis.md in the analyze phase; keep requirements aligned with agreed behavior in analysis.md',
        'Every requirement scenario must be covered by at least one case in testcases.md during the cases phase',
        'Use ADDED/MODIFIED/REMOVED/RENAMED delta sections; every requirement needs at least one #### Scenario',
        'Write in project language from config; SHALL/MUST for normative requirements',
      ],
      apply: [
        'Re-read qaspec/references/qase_test_case_rules.md before the first Qase MCP call',
        'Resolve TCMS target per change (qaspec tcms show); when missing, propose creating a new TCMS project as the default and halt for the user choice — reuse an existing project only when the user explicitly selects it',
        'Persist the chosen target with qaspec tcms set --change <name>; never write the tcms block in qaspec/config.yaml',
        'Run qaspec publish-gate --change <name> before publish summary; cite gate token with user confirmation before first MCP call',
        'Read Preconditions and Steps from each case block in testcases.md for Qase payloads — do not derive steps from title alone',
        'Omit-on-unmapped: send only Qase fields in the mapping table; never infer severity/priority/type',
        'Write publish-log.md rows as pending before first MCP call; per case: in-flight → done; reconcile pending/in-flight on re-run before creating',
        'Present in-chat publish summary with one representative full case payload; do not write prepare files',
        'End with exactly one confirmation halt after the summary; invoke Qase MCP only after user confirms publish — never upload in the same message as target selection or tcms persistence',
        'Do not echo secrets or PII in chat or Qase fields; stop upload path if detected',
        'Mark each published row - [x] in testcases.md; write publish-log.md trace',
      ],
    },
  };
}

/** Artifact ids that must appear in rules for qaspec-pr-review seed validation. */
export const QASPEC_PR_REVIEW_RULE_ARTIFACT_IDS = [
  'analyze',
  'test-cases',
  'specs',
  'apply',
] as const;
