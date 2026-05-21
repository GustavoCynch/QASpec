import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  getQaspecPrReviewConfigSeed,
  QASPEC_PR_REVIEW_RULE_ARTIFACT_IDS,
} from '../../src/core/qa-config-seed.js';
import { serializeConfig } from '../../src/core/config-prompts.js';
import { validateConfigRules } from '../../src/core/project-config.js';
import { resolveSchema } from '../../src/core/artifact-graph/resolver.js';

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
    expect(parsed.context).toContain('Language: (edit');
    expect(parsed.context).not.toContain('<!--');
    expect(parsed.rules.analyze.length).toBeGreaterThan(0);
    expect(parsed.rules['test-matrix'].length).toBeGreaterThan(0);
    expect(parsed.rules.specs.length).toBeGreaterThan(0);
    expect(parsed.rules.apply.length).toBeGreaterThan(0);
  });

  it('apply seed rules require publish-plan and confirmation before MCP', () => {
    const seed = getQaspecPrReviewConfigSeed();
    const applyRules = seed.rules!.apply.join('\n');

    expect(applyRules).toContain('publish-plan.md');
    expect(applyRules).toMatch(/confirmation halt/i);
    expect(applyRules).toMatch(/do not upload in the same message/i);
  });

  it('qaspec-pr-review schema apply instruction requires prepare and confirm before MCP', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../..');
    const schemaPath = path.join(repoRoot, 'schemas', 'qaspec-pr-review', 'schema.yaml');
    const content = fs.readFileSync(schemaPath, 'utf-8');

    expect(content).toContain('publish-plan.md');
    expect(content).toMatch(/confirmation halt/i);
    expect(content).toMatch(/Do not invoke Qase MCP/i);

    const planTemplate = path.join(
      repoRoot,
      'schemas',
      'qaspec-pr-review',
      'templates',
      'publish-plan.md'
    );
    expect(fs.existsSync(planTemplate)).toBe(true);
  });
});
