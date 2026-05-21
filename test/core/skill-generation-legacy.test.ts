import { describe, it, expect } from 'vitest';
import { getSkillTemplates, getCommandTemplates } from '../../src/core/shared/skill-generation.js';

describe('legacy OpenSpec profile templates', () => {
  it('uses openspec-explore and openspec-archive-change for legacy-only workflows', () => {
    const workflows = ['explore', 'archive', 'propose', 'apply'];
    const skills = getSkillTemplates(workflows);
    const commands = getCommandTemplates(workflows);

    expect(skills.map((s) => s.dirName)).toEqual(
      expect.arrayContaining(['openspec-explore', 'openspec-archive-change', 'openspec-propose', 'openspec-apply-change'])
    );
    expect(skills.map((s) => s.dirName)).not.toContain('qas-explore');
    expect(skills.map((s) => s.dirName)).not.toContain('qas-archive');

    expect(commands.map((c) => c.id)).toEqual(
      expect.arrayContaining(['explore', 'archive', 'propose', 'apply'])
    );
  });
});
