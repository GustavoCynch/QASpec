import { stringify as stringifyYaml } from 'yaml';
import type { ProjectConfig } from './project-config.js';
import { getQaspecPrReviewConfigSeed } from './qa-config-seed.js';

const CONFIG_HEADER = `# QASpec project config
# Edit context and rules for your team. See docs/customization.md and docs/multi-language.md
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

  if (merged.context || merged.rules) {
    const body: Record<string, unknown> = { schema: merged.schema };
    if (merged.context) {
      body.context = merged.context;
    }
    if (merged.rules) {
      body.rules = merged.rules;
    }
    return CONFIG_HEADER + stringifyYaml(body);
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
