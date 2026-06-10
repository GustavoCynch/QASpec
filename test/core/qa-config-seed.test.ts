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

  it('seed includes workflow.multipleSubagents defaults false', () => {
    const seed = getQaspecPrReviewConfigSeed();
    expect(seed.workflow?.multipleSubagents?.review).toBe(false);
    expect(seed.workflow?.multipleSubagents?.cases).toBe(false);
  });

  it('serializeConfig for qaspec-pr-review emits parseable YAML with active rules', () => {
    const yaml = serializeConfig({ schema: 'qaspec-pr-review' });
    const parsed = parseYaml(yaml.replace(/^#.*\n/gm, '')) as {
      schema: string;
      context: string;
      workflow?: { multipleSubagents?: { review?: boolean; cases?: boolean } };
      rules: Record<string, string[]>;
    };

    expect(parsed.schema).toBe('qaspec-pr-review');
    expect(parsed.workflow?.multipleSubagents?.review).toBe(false);
    expect(parsed.workflow?.multipleSubagents?.cases).toBe(false);
    expect(parsed.context).toContain('read-only');
    expect(parsed.context).toContain('Language: (edit');
    expect(parsed.context).not.toContain('<!--');
    expect(parsed.rules.analyze.length).toBeGreaterThan(0);
    expect(parsed.rules['test-cases'].length).toBeGreaterThan(0);
    expect(parsed.rules.specs.length).toBeGreaterThan(0);
    expect(parsed.rules.apply.length).toBeGreaterThan(0);
  });

  it('apply seed rules require tcms target and confirmation before MCP', () => {
    const seed = getQaspecPrReviewConfigSeed();
    const applyRules = seed.rules!.apply.join('\n');

    expect(applyRules).toContain('tcms');
    expect(applyRules).not.toMatch(/write.*publish-plan\.md/i);
    expect(applyRules).not.toMatch(/persist to execution-context\.md/i);
    expect(applyRules).toMatch(/confirmation halt/i);
    expect(applyRules).toMatch(/never upload in the same message/i);
    expect(applyRules).toMatch(/in-chat publish summary/i);
  });

  it('serializeConfig for qaspec-pr-review includes commented tcms example', () => {
    const yaml = serializeConfig({ schema: 'qaspec-pr-review' });

    expect(yaml).toMatch(/# tcms:/);
    expect(yaml).toContain('provider: qase');
    expect(yaml).toContain('YOUR_PROJECT_CODE');
    expect(yaml).toContain('https://app.qase.io');
    expect(yaml).toMatch(/first run/i);
  });

  it('test-cases seed rules require enriched case bodies', () => {
    const seed = getQaspecPrReviewConfigSeed();
    const matrixRules = seed.rules!['test-cases'].join('\n');

    expect(matrixRules).toMatch(/Preconditions/i);
    expect(matrixRules).toMatch(/Steps/i);
    expect(matrixRules).toMatch(/do not invent vague flows/i);
  });

  it('testmatrix template includes Preconditions and Steps blocks', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../..');
    const templatePath = path.join(
      repoRoot,
      'schemas',
      'qaspec-pr-review',
      'templates',
      'testcases.md'
    );
    const content = fs.readFileSync(templatePath, 'utf-8');

    expect(content).toContain('**Preconditions:**');
    expect(content).toContain('**Steps:**');
    expect(content).toMatch(/\| # \| Action \| Expected \|/);
  });

  it('qaspec-pr-review schema references multipleSubagents config flags', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../..');
    const schemaPath = path.join(repoRoot, 'schemas', 'qaspec-pr-review', 'schema.yaml');
    const content = fs.readFileSync(schemaPath, 'utf-8');

    expect(content).toContain('workflow.multipleSubagents.review');
    expect(content).toContain('workflow.multipleSubagents.cases');
  });

  it('qaspec-pr-review schema test-cases instruction requires enriched case body', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../..');
    const schemaPath = path.join(repoRoot, 'schemas', 'qaspec-pr-review', 'schema.yaml');
    const content = fs.readFileSync(schemaPath, 'utf-8');

    expect(content).toMatch(/Enriched case body/i);
    expect(content).toMatch(/Preconditions/i);
    expect(content).toMatch(/Build from sources/i);
  });

  it('qaspec-pr-review schema apply instruction requires tcms target and confirm before MCP', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../..');
    const schemaPath = path.join(repoRoot, 'schemas', 'qaspec-pr-review', 'schema.yaml');
    const content = fs.readFileSync(schemaPath, 'utf-8');

    expect(content).toContain('tcms');
    expect(content).not.toMatch(/Write or update `publish-plan\.md`/);
    expect(content).toMatch(/Do not write `execution-context\.md` or `publish-plan\.md`/);
    expect(content).toMatch(/confirmation halt/i);
    expect(content).toMatch(/Do not invoke Qase MCP/i);
    expect(content).toMatch(/Preconditions.*Steps/s);

    const templatesDir = path.join(repoRoot, 'schemas', 'qaspec-pr-review', 'templates');
    expect(fs.existsSync(path.join(templatesDir, 'publish-log.md'))).toBe(true);
    expect(fs.existsSync(path.join(templatesDir, 'execution-context.md'))).toBe(false);
    expect(fs.existsSync(path.join(templatesDir, 'publish-plan.md'))).toBe(false);
  });
});
