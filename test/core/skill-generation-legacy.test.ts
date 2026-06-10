import { describe, it, expect } from 'vitest';
import { getSkillTemplates, getCommandTemplates } from '../../src/core/shared/skill-generation.js';

describe('QASpec-only profile templates', () => {
  it('filters legacy workflow ids to QASpec skills only', () => {
    const workflows = ['analyze', 'archive', 'propose', 'apply'];
    const skills = getSkillTemplates(workflows);
    const commands = getCommandTemplates(workflows);

    expect(skills.map((s) => s.dirName)).toEqual(
      expect.arrayContaining(['qaspec-analyze', 'qaspec-archive'])
    );
    expect(skills.map((s) => s.dirName)).not.toContain('openspec-propose');

    expect(commands.map((c) => c.id)).toEqual(
      expect.arrayContaining(['analyze', 'archive'])
    );
    expect(commands.map((c) => c.id)).not.toContain('propose');
  });
});
