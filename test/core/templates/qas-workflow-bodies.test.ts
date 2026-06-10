import { describe, it, expect } from 'vitest';
import {
  getQasAnalyzeSkillTemplate,
  getQasAnalyzeCommandTemplate,
} from '../../../src/core/templates/workflows/analyze.js';
import {
  getQasCasesSkillTemplate,
  getQasCasesCommandTemplate,
} from '../../../src/core/templates/workflows/cases.js';
import { getQasPublishSkillTemplate } from '../../../src/core/templates/workflows/publish.js';

describe('qas workflow bodies (spec-first analyze)', () => {
  it('analyze body co-produces delta specs and reads capability baselines', () => {
    const body = getQasAnalyzeSkillTemplate().instructions;

    expect(body).toContain('qaspec instructions analyze --change');
    expect(body).toContain('qaspec instructions specs --change');
    expect(body).toMatch(/read `qaspec\/specs\/<capability>\/spec\.md` when present/i);
    expect(body).toMatch(/Draft delta specs/);
    expect(body).toMatch(/halt question covering both `analysis\.md` and the delta specs/);
    expect(body).toMatch(/\*\*and\*\* affected `specs\/\*\*\/\*\.md`/);
    expect(body).toContain('Do NOT write `testcases.md`');
    expect(body).not.toMatch(/Do NOT write `testcases\.md`, `specs/);
  });

  it('analyze skill and command share the same body', () => {
    expect(getQasAnalyzeCommandTemplate().content).toBe(getQasAnalyzeSkillTemplate().instructions);
  });

  it('cases body consumes approved specs and never writes them', () => {
    const body = getQasCasesSkillTemplate().instructions;

    expect(body).toContain('qaspec instructions test-cases --change');
    expect(body).not.toContain('qaspec instructions specs --change');
    expect(body).toMatch(/Read the change `specs\/\*\*\/\*\.md` files in full/);
    expect(body).toMatch(/every requirement scenario in the change delta specs covered by at least one case/i);
    expect(body).toMatch(/Do NOT create or update `specs\/\*\*\/\*\.md` in this step/);
    expect(body).not.toMatch(/Format specs/);
    expect(body).not.toMatch(/co-produced change delta specs/);
  });

  it('cases skill and command share the same body', () => {
    expect(getQasCasesCommandTemplate().content).toBe(getQasCasesSkillTemplate().instructions);
  });

  it('publish body directs missing specs to analyze, not cases', () => {
    const body = getQasPublishSkillTemplate().instructions;

    expect(body).toMatch(/direct user to complete `\/qsx:analyze`/);
    expect(body).not.toMatch(/direct user to complete `\/qsx:cases`/);
  });
});
