import { describe, it, expect } from 'vitest';
import { transformToHyphenCommands } from '../../src/utils/command-references.js';

describe('transformToHyphenCommands', () => {
  describe('basic transformations', () => {
    it('should transform single command reference', () => {
      expect(transformToHyphenCommands('/qsx:new')).toBe('/qsx-new');
    });

    it('should transform multiple command references', () => {
      const input = '/qsx:new and /qsx:apply';
      const expected = '/qsx-new and /qsx-apply';
      expect(transformToHyphenCommands(input)).toBe(expected);
    });

    it('should transform command reference in context', () => {
      const input = 'Use /qsx:apply to implement tasks';
      const expected = 'Use /qsx-apply to implement tasks';
      expect(transformToHyphenCommands(input)).toBe(expected);
    });

    it('should handle backtick-quoted commands', () => {
      const input = 'Run `/qsx:continue` to proceed';
      const expected = 'Run `/qsx-continue` to proceed';
      expect(transformToHyphenCommands(input)).toBe(expected);
    });

    it('should still transform legacy /qas: references', () => {
      expect(transformToHyphenCommands('/qas:matrix')).toBe('/qas-matrix');
    });
  });

  describe('edge cases', () => {
    it('should return unchanged text with no command references', () => {
      const input = 'This is plain text without commands';
      expect(transformToHyphenCommands(input)).toBe(input);
    });

    it('should return empty string unchanged', () => {
      expect(transformToHyphenCommands('')).toBe('');
    });

    it('should not transform similar but non-matching patterns', () => {
      const input = '/ops:new opsx: /other:command';
      expect(transformToHyphenCommands(input)).toBe(input);
    });

    it('should handle multiple occurrences on same line', () => {
      const input = '/qsx:new /qsx:continue /qsx:apply';
      const expected = '/qsx-new /qsx-continue /qsx-apply';
      expect(transformToHyphenCommands(input)).toBe(expected);
    });
  });

  describe('multiline content', () => {
    it('should transform references across multiple lines', () => {
      const input = `Use /qsx:new to start
Then /qsx:continue to proceed
Finally /qsx:apply to implement`;
      const expected = `Use /qsx-new to start
Then /qsx-continue to proceed
Finally /qsx-apply to implement`;
      expect(transformToHyphenCommands(input)).toBe(expected);
    });
  });

  describe('all known commands', () => {
    const commands = [
      'new',
      'continue',
      'apply',
      'ff',
      'sync',
      'archive',
      'bulk-archive',
      'verify',
      'explore',
      'onboard',
    ];

    for (const cmd of commands) {
      it(`should transform /qsx:${cmd}`, () => {
        expect(transformToHyphenCommands(`/qsx:${cmd}`)).toBe(`/qsx-${cmd}`);
      });
    }
  });
});
