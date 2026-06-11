/**
 * QASpec product branding and documentation links.
 */

export const PRODUCT_DISPLAY_NAME = 'QASpec';
export const PRODUCT_DISPLAY_NAME_ALT = 'QA Spec';

export const GITHUB_OWNER = 'GustavoCynch';
export const GITHUB_REPO = 'QASpec';
export const GITHUB_REPO_SLUG = `${GITHUB_OWNER}/${GITHUB_REPO}`;

export const DOCS_URL = `https://github.com/${GITHUB_REPO_SLUG}`;
export const FEEDBACK_URL = `https://github.com/${GITHUB_REPO_SLUG}/issues`;

/**
 * Lines containing "OpenSpec" are permitted in branding scans when they match
 * lineage attribution, this repo's `openspec/` planning-home paths, or
 * branding-module self references.
 */
export const OPENSPEC_PRODUCT_STRING_ALLOWLIST: RegExp[] = [
  /Inspired by\s+\[OpenSpec\]/i,
  /Inspired by OpenSpec/i,
  /inspired by OpenSpec/i,
  /QASpec is inspired by OpenSpec/i,
  /Fission-AI\/OpenSpec/i,
  /fork of OpenSpec/i,
  /openspec\/changes\//,
  /openspec\/specs\//,
  /openspec\/schemas\//,
  /`openspec\//,
  /OPENSPEC_PRODUCT_STRING_ALLOWLIST/,
  /OPENSPEC_CLI_INSTRUCTION/,
];

/**
 * Agent instructions to run an `openspec <subcommand>` CLI (the feedback-skill bug class).
 */
export const OPENSPEC_CLI_INSTRUCTION_PATTERN = /\bopenspec\s+[a-z][-a-z]*/i;

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
    violations.push(`${source}:${i + 1}: ${line.trim()}`);
  }
  return violations;
}
