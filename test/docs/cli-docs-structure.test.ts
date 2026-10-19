import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CLI_DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'cli.md');

/** Line numbers of Markdown headings that a code fence swallows, plus whether a fence is left open. */
function headingsInsideFences(markdown: string): { swallowed: number[]; unclosed: boolean } {
  let inside = false;
  const swallowed: number[] = [];
  markdown.split('\n').forEach((line, index) => {
    if (line.startsWith('```')) {
      // Only a bare fence closes a block; text after the backticks keeps it open.
      if (!inside) {
        inside = true;
      } else if (line.trim() === '```') {
        inside = false;
      }
      return;
    }
    if (inside && /^#{2,6} /.test(line)) {
      swallowed.push(index + 1);
    }
  });
  return { swallowed, unclosed: inside };
}

describe('docs/cli.md structure', () => {
  it('closes every code fence before the next heading', () => {
    expect(headingsInsideFences(readFileSync(CLI_DOCS, 'utf-8'))).toEqual({ swallowed: [], unclosed: false });
  });
});
