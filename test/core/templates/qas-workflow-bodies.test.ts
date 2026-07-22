import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getQasAnalyzeSkillTemplate,
  getQasAnalyzeCommandTemplate,
} from '../../../src/core/templates/workflows/analyze.js';
import {
  getQasCasesSkillTemplate,
  getQasCasesCommandTemplate,
} from '../../../src/core/templates/workflows/cases.js';
import { getQasPublishSkillTemplate } from '../../../src/core/templates/workflows/publish.js';
import { resolveSchema } from '../../../src/core/artifact-graph/resolver.js';

describe('qas workflow bodies (hardened pipeline)', () => {
  it('analyze body includes digest halt, approve command, and ABSENT-intent guard', () => {
    const body = getQasAnalyzeSkillTemplate().instructions;

    expect(body).toContain('qaspec instructions analyze --change');
    expect(body).toContain('qaspec instructions specs --change');
    expect(body).toMatch(/Unvalidated assumptions/i);
    expect(body).toMatch(/approval digest/i);
    expect(body).toMatch(/qaspec approve analyze --change/);
    expect(body).toMatch(/ABSENT-intent guard/i);
    expect(body).toMatch(/zero to three/i);
    expect(body).toContain('Do NOT write `testcases.md`');
    expect(getQasAnalyzeSkillTemplate().metadata?.version).toBe('1.5');
  });

  it('analyze skill and command share the same body', () => {
    expect(getQasAnalyzeCommandTemplate().content).toBe(getQasAnalyzeSkillTemplate().instructions);
  });

  it('cases body checks approval, requires req annotations, and validates before halt', () => {
    const body = getQasCasesSkillTemplate().instructions;

    expect(body).toContain('qaspec instructions test-cases --change');
    expect(body).toMatch(/approval\.analyze/);
    expect(body).toMatch(/qaspec validate cases --change/);
    expect(body).toMatch(/Mandatory traceability/);
    expect(body).toMatch(/Do NOT create or update `specs\/\*\*\/\*\.md` in this step/);
    expect(getQasCasesSkillTemplate().metadata?.version).toBe('1.5');
  });

  it('cases skill and command share the same body', () => {
    expect(getQasCasesCommandTemplate().content).toBe(getQasCasesSkillTemplate().instructions);
  });

  it('publish body runs publish-gate, marks checkboxes per case, and omit-on-unmapped', () => {
    const body = getQasPublishSkillTemplate().instructions;

    expect(body).toMatch(/qaspec publish-gate --change/);
    expect(body).toMatch(/gate token/i);
    expect(body).toMatch(/mark that case `?- \[x\]`? in `?testcases\.md/i);
    expect(body).toMatch(/reconcil(e|ing).*by title/i);
    expect(body).toMatch(/omit-on-unmapped/i);
    expect(body).toMatch(/representative case/i);
    expect(body).toMatch(/direct user to complete `\/qsx:analyze`/);
    expect(body).toMatch(/ignore legacy `publish-plan\.md` and legacy `publish-log\.md`/i);
    expect(body).not.toMatch(/writes? `publish-log\.md`(?! ,? or)/i);
    expect(body).not.toMatch(/publish-log row/i);
  });

  it('analyze body guardrail is provider-neutral (no Qase MCP)', () => {
    const body = getQasAnalyzeSkillTemplate().instructions;

    expect(body).not.toContain('Qase');
    expect(body).toMatch(/no TCMS MCP/i);
  });

  it('cases body wording is provider-neutral (no Qase MCP, no publish to Qase)', () => {
    const body = getQasCasesSkillTemplate().instructions;

    expect(body).not.toContain('Qase');
    expect(body).toMatch(/tcms_case_rules\.md/);
    expect(body).toMatch(/do not publish to (your )?tcms/i);
  });

  it('publish body wording is provider-neutral (no Qase MCP, no Qase fields, no v1 Qase-only)', () => {
    const body = getQasPublishSkillTemplate().instructions;

    expect(body).not.toContain('Qase');
    expect(body).toMatch(/tcms mcp/i);
    expect(body).toMatch(/mapped tcms fields/i);
    expect(body).not.toMatch(/v1 tcms is qase only/i);
  });

  it('schema instructions include digest halt, validate gate, and publish gate', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../../..');
    const schemaPath = path.join(repoRoot, 'schemas', 'qaspec-pr-review', 'schema.yaml');
    const content = fs.readFileSync(schemaPath, 'utf-8');

    expect(content).toMatch(/Approval digest halt/i);
    expect(content).toMatch(/qaspec approve analyze/);
    expect(content).toMatch(/qaspec validate cases/);
    expect(content).toMatch(/Publish gate/i);
    expect(content).toMatch(/Unvalidated assumptions/i);
  });

  it('templates contain Unvalidated assumptions section and no publish-log template', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../../..');
    const templatesDir = path.join(repoRoot, 'schemas', 'qaspec-pr-review', 'templates');

    const analysis = fs.readFileSync(path.join(templatesDir, 'analysis.md'), 'utf-8');
    expect(analysis).toMatch(/## Unvalidated assumptions/);
    expect(analysis).not.toMatch(/Do not write specs/);

    const testcases = fs.readFileSync(path.join(templatesDir, 'testcases.md'), 'utf-8');
    expect(testcases).toMatch(/<!-- req:/);

    expect(fs.existsSync(path.join(templatesDir, 'publish-log.md'))).toBe(false);
  });
});
