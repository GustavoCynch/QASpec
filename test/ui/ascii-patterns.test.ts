import { describe, it, expect } from 'vitest';
import { getQaSpecWordmarkLines, QA_SPEC_LABEL } from '../../src/ui/ascii-patterns.js';

describe('getQaSpecWordmarkLines', () => {
  it('returns three lines with centered label', () => {
    const lines = getQaSpecWordmarkLines();

    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(QA_SPEC_LABEL);
    expect(lines[0]).toMatch(/^  [╭+]/);
    expect(lines[2]).toMatch(/^  [╰+]/);
  });
});
