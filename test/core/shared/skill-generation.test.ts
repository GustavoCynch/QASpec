import { describe, it, expect } from 'vitest';
import { CORE_WORKFLOWS } from '../../../src/core/profiles.js';
import {
  getSkillTemplates,
  getCoexistenceSkillTemplates,
  getCommandTemplates,
  getCommandContents,
  generateSkillContent,
} from '../../../src/core/shared/skill-generation.js';

describe('skill-generation', () => {
  describe('getSkillTemplates', () => {
    it('should return four QASpec skills when unfiltered', () => {
      const templates = getSkillTemplates();
      expect(templates).toHaveLength(4);
    });

    it('should return QASpec core skills for CORE_WORKFLOWS', () => {
      const templates = getSkillTemplates(CORE_WORKFLOWS);
      expect(templates).toHaveLength(4);
      const dirNames = templates.map((t) => t.dirName);
      expect(dirNames).toEqual(
        expect.arrayContaining([
          'qaspec-analyze',
          'qaspec-cases',
          'qaspec-publish',
          'qaspec-archive',
        ])
      );
    });

    it('should have unique directory names when unfiltered', () => {
      const templates = getSkillTemplates();
      const dirNames = templates.map((t) => t.dirName);
      const uniqueDirNames = new Set(dirNames);
      expect(uniqueDirNames.size).toBe(templates.length);
    });

    it('should not include legacy openspec skill dirs', () => {
      const templates = getSkillTemplates();
      const dirNames = templates.map((t) => t.dirName);
      expect(dirNames).not.toContain('openspec-new-change');
      expect(dirNames).not.toContain('openspec-propose');
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

    it('should ignore legacy and retired workflow ids in filter', () => {
      const filtered = getSkillTemplates(['propose', 'explore', 'apply', 'archive']);
      expect(filtered).toHaveLength(1);
      const dirNames = filtered.map((t) => t.dirName);
      expect(dirNames).toContain('qaspec-archive');
    });

    it('should include cases skill when filter lists resolved cases id', () => {
      const filtered = getSkillTemplates(['analyze', 'cases', 'publish', 'archive']);
      expect(filtered.map((t) => t.workflowId).sort()).toEqual(
        ['analyze', 'archive', 'cases', 'publish'].sort()
      );
      expect(filtered.filter((t) => t.workflowId === 'cases')).toHaveLength(1);
      expect(filtered.filter((t) => t.dirName === 'qaspec-cases')).toHaveLength(1);
    });
  });

  describe('getCoexistenceSkillTemplates', () => {
    it('returns full QASpec core skill set regardless of legacy profile ids', () => {
      const merged = getCoexistenceSkillTemplates(['propose', 'explore', 'apply', 'archive']);
      const dirNames = merged.map((t) => t.dirName);
      expect(dirNames).toContain('qaspec-analyze');
      expect(dirNames).toContain('qaspec-cases');
      expect(dirNames).toContain('qaspec-publish');
      expect(dirNames).toContain('qaspec-archive');
      expect(merged).toHaveLength(4);
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

    it('should return empty array when filter has propose only', () => {
      const filtered = getSkillTemplates(['propose']);
      expect(filtered).toHaveLength(0);
    });
  });

  describe('getCommandTemplates', () => {
    it('should return four QASpec commands when unfiltered', () => {
      const templates = getCommandTemplates();
      expect(templates).toHaveLength(4);
    });

    it('should return four QASpec commands for CORE_WORKFLOWS', () => {
      const templates = getCommandTemplates(CORE_WORKFLOWS);
      expect(templates).toHaveLength(4);
      expect(templates.map((t) => t.id).sort()).toEqual(
        ['analyze', 'archive', 'cases', 'publish'].sort()
      );
    });

    it('should have unique IDs when unfiltered', () => {
      const templates = getCommandTemplates();
      const ids = templates.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(templates.length);
    });

    it('should not include legacy command ids when unfiltered', () => {
      const templates = getCommandTemplates();
      const ids = templates.map((t) => t.id);
      expect(ids).not.toContain('propose');
      expect(ids).not.toContain('new');
    });

    it('should filter to QASpec commands only for mixed legacy filter', () => {
      const filtered = getCommandTemplates(['propose', 'explore', 'apply', 'archive']);
      expect(filtered).toHaveLength(1);
      expect(filtered.map((t) => t.id).sort()).toEqual(['archive']);
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
    it('should return four command contents when unfiltered', () => {
      const contents = getCommandContents();
      expect(contents).toHaveLength(4);
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

    it('should filter to analyze only when requested', () => {
      const filtered = getCommandContents(['analyze']);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('analyze');
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

    it('qaspec-analyze template includes config preamble and dual analysts', () => {
      const templates = getSkillTemplates(CORE_WORKFLOWS);
      const analyze = templates.find((t) => t.dirName === 'qaspec-analyze');
      expect(analyze).toBeDefined();
      const body = analyze!.template.instructions;
      expect(body).toContain('instructions analyze');
      expect(body).toContain('historical_bugs.md');
      expect(body).toContain('parallel blind Task');
      expect(body).toContain('**do NOT** copy');
    });

    it('should apply transformInstructions callback when provided', () => {
      const template = {
        name: 'transform-test',
        description: 'Test transform callback',
        instructions: 'Use /qsx:new to start and /qsx:apply to implement.',
      };

      const transformer = (text: string) => text.replace(/\/(qsx|qas|opsx):/g, '/$1-');
      const content = generateSkillContent(template, '0.23.0', transformer);

      expect(content).toContain('/qsx-new');
      expect(content).toContain('/qsx-apply');
      expect(content).not.toContain('/qsx:new');
    });
  });
});
