import { describe, expect, it } from 'vitest';
import { getFeedbackSkillTemplate } from '../../../src/core/templates/skill-templates.js';
import { findOpenspecCliInstructionViolations } from '../../../src/core/branding.js';

describe('feedback skill template', () => {
  it('submits via qaspec feedback with no openspec CLI instruction', () => {
    const template = getFeedbackSkillTemplate();

    expect(template.instructions).toContain('qaspec feedback');
    expect(template.compatibility).toBe('Requires qaspec CLI.');
    expect(template.metadata?.author).toBe('qaspec');
    expect(findOpenspecCliInstructionViolations(template.instructions, 'feedback')).toEqual([]);
    if (template.compatibility) {
      expect(findOpenspecCliInstructionViolations(template.compatibility, 'feedback')).toEqual([]);
    }
  });
});
