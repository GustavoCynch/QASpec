/**
 * QASpec product branding and documentation links.
 *
 * Naming matrix (user-facing copy):
 * | Context | Use | Example |
 * | Product title in prose | QA Spec or QASpec | "QASpec helps teams…" |
 * | CLI / commands | qaspec | `qaspec init` |
 * | Technical / package | QASpec | `@qaspec/cli` |
 * | Upstream tool detection | upstream OpenSpec | "upstream OpenSpec install" |
 * | Legacy opsx workflow | legacy OpenSpec workflow | `/opsx:new` hints |
 * | Path literals | openspec/ or qaspec/ | "legacy openspec/ layout" |
 * | Lineage | OpenSpec (once) | README inspired-by line |
 */

export const PRODUCT_DISPLAY_NAME = 'QASpec';
export const PRODUCT_DISPLAY_NAME_ALT = 'QA Spec';

export const GITHUB_OWNER = 'GustavoCynch';
export const GITHUB_REPO = 'QASpec';
export const GITHUB_REPO_SLUG = `${GITHUB_OWNER}/${GITHUB_REPO}`;

export const DOCS_URL = `https://github.com/${GITHUB_REPO_SLUG}`;
export const FEEDBACK_URL = `https://github.com/${GITHUB_REPO_SLUG}/issues`;

/** Category for legacy upstream `opsx-*` slash commands. */
export const LEGACY_OPENSPEC_COMMAND_CATEGORY = 'OpenSpec';

/**
 * Lines containing "OpenSpec" are permitted in branding scans when they match
 * upstream detection, marker format, identifiers, or lineage (see design.md).
 */
export const OPENSPEC_PRODUCT_STRING_ALLOWLIST: RegExp[] = [
  /upstream\s+OpenSpec/i,
  /legacy\s+OpenSpec/i,
  /legacy OpenSpec workflow/i,
  /Inspired by\s+\[OpenSpec\]/i,
  /Inspired by OpenSpec/i,
  /openspec\.dev/i,
  /inspired by OpenSpec on the development side/i,
  /QASpec is inspired by OpenSpec/i,
  /Fission-AI\/OpenSpec/i,
  /\bhasOpenSpec\w*/i,
  /\bisOnlyOpenSpec\w*/i,
  /\bhasActiveUpstreamOpenSpec\b/,
  /\bupstreamOpenSpecActive\b/,
  /\bOpenSpecConfig\b/,
  /\bOPENSPEC_/,
  /OpenSpec markers?/i,
  /OpenSpec-managed/i,
  /OpenSpec Instructions/i,
  /OpenSpec content/i,
  /# OpenSpec agents/i,
  /Removed OpenSpec markers/i,
  /removing OpenSpec markers/i,
  /LEGACY_OPENSPEC_COMMAND_CATEGORY/,
  /OPENSPEC_PRODUCT_STRING_ALLOWLIST/,
  /fork of OpenSpec/i,
  /category:\s*LEGACY_OPENSPEC_COMMAND_CATEGORY/,
  /category:\s*['"]OpenSpec['"]/,
  /'OpenSpec'/,
  /"OpenSpec"/,
  /Guided onboarding for OpenSpec/i,
  /OpenSpec workflow cycle/i,
  /OpenSpec Quick Reference/i,
  /Welcome to OpenSpec!/i,
  /first OpenSpec run-through/i,
  /full OpenSpec cycle/i,
  /"change" in OpenSpec/i,
  /OpenSpec Awareness/i,
  /Creating OpenSpec artifacts/i,
  /OpenSpec CLI is not installed/i,
  /OpenSpec Explore/i,
  /openspec\/changes\//,
  /openspec\/specs\//,
  /openspec\/schemas\//,
  /`openspec\/changes\//,
  /`openspec\/specs\//,
  /legacy `openspec\/`/,
  /legacy openspec\/ planning home/,
  /or legacy `openspec\/`/,
  /or `openspec\/changes\//,
  /repo `openspec\/`/,
  /without repo-local `openspec\/`/,
  /In-repo specification tree.*`openspec\//,
];

/**
 * Agent instructions to run an `openspec <subcommand>` CLI (the feedback-skill bug class).
 */
export const OPENSPEC_CLI_INSTRUCTION_PATTERN = /\bopenspec\s+[a-z][-a-z]*/i;

/**
 * Legitimate upstream-coexistence prose in generated skill/command bodies.
 */
export const OPENSPEC_CLI_INSTRUCTION_ALLOWLIST: RegExp[] = [
  /leave `openspec-\*` skills untouched/i,
  /`openspec-\*` skills/i,
  /openspec-\* skill/i,
];

export function isAllowedOpenspecCliInstructionLine(line: string): boolean {
  return OPENSPEC_CLI_INSTRUCTION_ALLOWLIST.some((pattern) => pattern.test(line));
}

export function findOpenspecCliInstructionViolations(
  body: string,
  source: string
): string[] {
  const violations: string[] = [];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!OPENSPEC_CLI_INSTRUCTION_PATTERN.test(line)) {
      continue;
    }
    if (isAllowedOpenspecCliInstructionLine(line)) {
      continue;
    }
    violations.push(`${source}:${i + 1}: ${line.trim()}`);
  }
  return violations;
}
