import { describe, it, expect } from 'vitest';
import { CORE_WORKFLOWS } from '../../../src/core/profiles.js';
import {
  getSkillTemplates,
  getCoexistenceSkillTemplates,
  getCommandTemplates,
  getCommandContents,
  generateSkillContent,
} from '../../../src/core/shared/skill-generation.js';

const LEGACY_ONLY_WORKFLOWS = ['propose', 'new', 'continue', 'apply', 'ff', 'sync', 'bulk-archive', 'verify', 'onboard'] as const;

describe('skill-generation', () => {
  describe('getSkillTemplates', () => {
    it('should return merged QASpec and legacy skill templates when unfiltered', () => {
      const templates = getSkillTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(14);
    });

    it('should return QASpec core skills for CORE_WORKFLOWS', () => {
      const templates = getSkillTemplates(CORE_WORKFLOWS);
      expect(templates).toHaveLength(5);
      const dirNames = templates.map((t) => t.dirName);
      expect(dirNames).toEqual(
        expect.arrayContaining([
          'qas-explore',
          'qas-analyze',
          'qas-matrix',
          'qas-publish',
          'qas-archive',
        ])
      );
    });

    it('should have unique directory names when unfiltered', () => {
      const templates = getSkillTemplates();
      const dirNames = templates.map((t) => t.dirName);
      const uniqueDirNames = new Set(dirNames);
      expect(uniqueDirNames.size).toBe(templates.length);
    });

    it('should include legacy skills when unfiltered', () => {
      const templates = getSkillTemplates();
      const dirNames = templates.map((t) => t.dirName);

      expect(dirNames).toContain('openspec-new-change');
      expect(dirNames).toContain('openspec-propose');
    });

    it('should have valid template structure', () => {
      const templates = getSkillTemplates();

      for (const { template, dirName, workflowId } of templates) {
        expect(template.name).toBeTruthy();
        expect(template.description).toBeTruthy();
        expect(template.instructions).toBeTruthy();
        expect(dirName).toBeTruthy();
        expect(workflowId).toBeTruthy();
      }
    });

    it('should have unique workflow IDs when unfiltered', () => {
      const templates = getSkillTemplates();
      const ids = templates.map((t) => t.workflowId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(templates.length);
    });

    it('should filter legacy and shared openspec workflows when filter has no QASpec-only ids', () => {
      const filtered = getSkillTemplates(['propose', 'explore', 'apply', 'archive']);
      expect(filtered).toHaveLength(4);
      const dirNames = filtered.map((t) => t.dirName);
      expect(dirNames).toContain('openspec-propose');
      expect(dirNames).toContain('openspec-explore');
      expect(dirNames).toContain('openspec-apply-change');
      expect(dirNames).toContain('openspec-archive-change');
    });
  });

  describe('getCoexistenceSkillTemplates', () => {
    it('merges legacy openspec skills with core qas skills', () => {
      const merged = getCoexistenceSkillTemplates(['propose', 'explore', 'apply', 'archive']);
      const dirNames = merged.map((t) => t.dirName);
      expect(dirNames).toContain('openspec-propose');
      expect(dirNames).toContain('openspec-explore');
      expect(dirNames).toContain('qas-analyze');
      expect(dirNames).toContain('qas-matrix');
      expect(dirNames).toContain('qas-publish');
      expect(merged.length).toBe(9);
    });
  });

  describe('getSkillTemplates (continued)', () => {
    it('should return all templates when filter is undefined', () => {
      const all = getSkillTemplates();
      const noFilter = getSkillTemplates(undefined);
      expect(noFilter).toHaveLength(all.length);
    });

    it('should return empty array when filter matches nothing', () => {
      const filtered = getSkillTemplates(['nonexistent']);
      expect(filtered).toHaveLength(0);
    });

    it('should return single legacy template when filter has propose only', () => {
      const filtered = getSkillTemplates(['propose']);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].workflowId).toBe('propose');
      expect(filtered[0].dirName).toBe('openspec-propose');
    });
  });

  describe('getCommandTemplates', () => {
    it('should return merged command templates when unfiltered', () => {
      const templates = getCommandTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(14);
    });

    it('should return five QASpec commands for CORE_WORKFLOWS', () => {
      const templates = getCommandTemplates(CORE_WORKFLOWS);
      expect(templates).toHaveLength(5);
      expect(templates.map((t) => t.id).sort()).toEqual(
        ['analyze', 'archive', 'explore', 'matrix', 'publish'].sort()
      );
    });

    it('should have unique IDs when unfiltered', () => {
      const templates = getCommandTemplates();
      const ids = templates.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(templates.length);
    });

    it('should include legacy command ids when unfiltered', () => {
      const templates = getCommandTemplates();
      const ids = templates.map((t) => t.id);

      for (const id of LEGACY_ONLY_WORKFLOWS) {
        if (id === 'explore' || id === 'archive' || id === 'apply') continue;
        expect(ids).toContain(id);
      }
      expect(ids).toContain('propose');
    });

    it('should filter legacy commands when filter has no QASpec ids', () => {
      const filtered = getCommandTemplates(['propose', 'explore', 'apply', 'archive']);
      expect(filtered).toHaveLength(4);
    });

    it('should return all templates when filter is undefined', () => {
      const all = getCommandTemplates();
      const noFilter = getCommandTemplates(undefined);
      expect(noFilter).toHaveLength(all.length);
    });

    it('should return empty array when filter matches nothing', () => {
      const filtered = getCommandTemplates(['nonexistent']);
      expect(filtered).toHaveLength(0);
    });
  });

  describe('getCommandContents', () => {
    it('should return merged command contents when unfiltered', () => {
      const contents = getCommandContents();
      expect(contents.length).toBeGreaterThanOrEqual(14);
    });

    it('should have valid content structure', () => {
      const contents = getCommandContents();

      for (const content of contents) {
        expect(content.id).toBeTruthy();
        expect(content.name).toBeTruthy();
        expect(content.description).toBeTruthy();
        expect(content.body).toBeTruthy();
      }
    });

    it('should have matching IDs with command templates', () => {
      const templates = getCommandTemplates();
      const contents = getCommandContents();

      const templateIds = templates.map((t) => t.id).sort();
      const contentIds = contents.map((c) => c.id).sort();

      expect(contentIds).toEqual(templateIds);
    });

    it('should filter legacy contents when filter has propose and explore only', () => {
      const filtered = getCommandContents(['propose', 'explore']);
      expect(filtered).toHaveLength(2);
      const ids = filtered.map((c) => c.id);
      expect(ids).toContain('propose');
      expect(ids).toContain('explore');
    });

    it('should return all contents when filter is undefined', () => {
      const all = getCommandContents();
      const noFilter = getCommandContents(undefined);
      expect(noFilter).toHaveLength(all.length);
    });
  });

  describe('generateSkillContent', () => {
    it('should generate valid YAML frontmatter', () => {
      const template = {
        name: 'test-skill',
        description: 'Test description',
        instructions: 'Test instructions',
        license: 'MIT',
        compatibility: 'Test compatibility',
        metadata: {
          author: 'test-author',
          version: '2.0',
        },
      };

      const content = generateSkillContent(template, '0.23.0');

      expect(content).toMatch(/^---\n/);
      expect(content).toContain('name: test-skill');
      expect(content).toContain('description: Test description');
      expect(content).toContain('license: MIT');
      expect(content).toContain('compatibility: Test compatibility');
      expect(content).toContain('author: test-author');
      expect(content).toContain('version: "2.0"');
      expect(content).toContain('generatedBy: "0.23.0"');
      expect(content).toContain('Test instructions');
    });

    it('should apply transformInstructions callback when provided', () => {
      const template = {
        name: 'transform-test',
        description: 'Test transform callback',
        instructions: 'Use /qas:new to start and /qas:apply to implement.',
      };

      const transformer = (text: string) => text.replace(/\/(qas|opsx):/g, '/$1-');
      const content = generateSkillContent(template, '0.23.0', transformer);

      expect(content).toContain('/qas-new');
      expect(content).toContain('/qas-apply');
      expect(content).not.toContain('/qas:new');
    });
  });
});
