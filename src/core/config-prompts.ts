import { stringify as stringifyYaml } from 'yaml';
import type { ProjectConfig } from './project-config.js';
import { getQaspecPrReviewConfigSeed } from './qa-config-seed.js';

const CONFIG_HEADER = `# QASpec project config
# Edit context and rules for your team. See docs/customization.md and docs/multi-language.md
`;

/** Optional footer hints appended after the active qaspec-pr-review seed (not injected into prompts). */
const QASPEC_PR_REVIEW_CONFIG_FOOTER = `
# workflow.multipleSubagents.review — dual Task analysts for /qsx:analyze (default: false)
# workflow.multipleSubagents.matrix — dual Task analysts for /qsx:matrix (default: false)
# When false, the orchestrator does the phase with no Task subagents (not a single subagent).
#
# Extend context above with your own details (shown to AI on every artifact):
#   - Tech stack, architectures, integrations, test tools
#   - Conventions, style guides, environment names, doc links
#   - Domain knowledge and high-risk areas for this product
# Example (add inside context: | or replace the Stack/Domain lines):
#   Stack: TypeScript monorepo, REST APIs, Playwright, Qase
#   Domain: billing and subscriptions — stress refunds and proration
`;

/**
 * Serialize config to YAML string with helpful comments.
 *
 * @param config - Partial config object (schema required, context/rules optional)
 * @returns YAML string ready to write to file
 */
export function serializeConfig(config: Partial<ProjectConfig>): string {
  const schema = config.schema;
  if (!schema) {
    throw new Error('serializeConfig requires schema');
  }

  const merged: Partial<ProjectConfig> =
    schema === 'qaspec-pr-review'
      ? { ...getQaspecPrReviewConfigSeed(), ...config, schema }
      : { ...config, schema };

  if (merged.context || merged.rules || merged.workflow) {
    const body: Record<string, unknown> = { schema: merged.schema };
    if (merged.context) {
      body.context = merged.context;
    }
    if (merged.workflow) {
      body.workflow = merged.workflow;
    }
    if (merged.rules) {
      body.rules = merged.rules;
    }
    const yaml = CONFIG_HEADER + stringifyYaml(body);
    return schema === 'qaspec-pr-review' ? yaml + QASPEC_PR_REVIEW_CONFIG_FOOTER : yaml;
  }

  const lines: string[] = [];

  lines.push(`schema: ${schema}`);
  lines.push('');

  lines.push('# Project context (optional)');
  lines.push('# This is shown to AI when creating artifacts.');
  lines.push('# Add your tech stack, conventions, style guides, domain knowledge, etc.');
  lines.push('');

  lines.push('# Per-artifact rules (optional)');
  lines.push('# Add custom rules for specific artifacts.');
  lines.push('# Example:');
  lines.push('#   rules:');
  lines.push('#     proposal:');
  lines.push('#       - Keep proposals under 500 words');

  return lines.join('\n') + '\n';
}
