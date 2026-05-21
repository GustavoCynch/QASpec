import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  getQaspecPrReviewConfigSeed,
  QASPEC_PR_REVIEW_RULE_ARTIFACT_IDS,
} from '../../src/core/qa-config-seed.js';
import { serializeConfig } from '../../src/core/config-prompts.js';
import { validateConfigRules } from '../../src/core/project-config.js';
import { resolveSchema } from '../../src/core/artifact-graph/resolver.js';
import path from 'path';

describe('qa-config-seed', () => {
  it('seed rules keys match qaspec-pr-review artifact ids', () => {
    const seed = getQaspecPrReviewConfigSeed();
    expect(seed.rules).toBeDefined();
    const ruleKeys = Object.keys(seed.rules!);
    expect(ruleKeys.sort()).toEqual([...QASPEC_PR_REVIEW_RULE_ARTIFACT_IDS].sort());

    const repoRoot = path.resolve(import.meta.dirname, '../..');
    const schema = resolveSchema('qaspec-pr-review', repoRoot);
    const validIds = new Set([...schema.artifacts.map((a) => a.id), 'apply']);
    const warnings = validateConfigRules(seed.rules!, validIds, 'qaspec-pr-review');
    expect(warnings).toEqual([]);
  });

  it('serializeConfig for qaspec-pr-review emits parseable YAML with active rules', () => {
    const yaml = serializeConfig({ schema: 'qaspec-pr-review' });
    const parsed = parseYaml(yaml.replace(/^#.*\n/gm, '')) as {
      schema: string;
      context: string;
      rules: Record<string, string[]>;
    };

    expect(parsed.schema).toBe('qaspec-pr-review');
    expect(parsed.context).toContain('read-only');
    expect(parsed.rules.analyze.length).toBeGreaterThan(0);
    expect(parsed.rules['test-matrix'].length).toBeGreaterThan(0);
    expect(parsed.rules.specs.length).toBeGreaterThan(0);
    expect(parsed.rules.apply.length).toBeGreaterThan(0);
  });
});
