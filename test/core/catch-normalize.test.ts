import { describe, expect, it } from 'vitest';
import { normalizeScriptSource, normalizeWhitespaceOnly } from '../../src/core/catch-normalize.js';

describe('normalizeScriptSource: comments', () => {
  it('removes line comments and block comments and keeps the code and its line breaks', () => {
    expect(normalizeScriptSource('const a = 1; // note\nconst b = 2; /* block */\n')).toBe(
      'const a = 1;\nconst b = 2;'
    );
  });

  it('makes a source that differs only by comments equal to the source without them', () => {
    expect(normalizeScriptSource('export const value = 1; // the value\n')).toBe(
      normalizeScriptSource('export const value = 1;\n')
    );
  });

  it('keeps // and /* inside a single- or double-quoted string', () => {
    expect(normalizeScriptSource("const url = 'http://example.test'; // note\n")).toBe(
      "const url = 'http://example.test';"
    );
    expect(normalizeScriptSource('const s = "/* not a comment */";')).toBe('const s = "/* not a comment */";');
  });

  it('keeps an escaped quote inside a string, so the text after it stays string content', () => {
    expect(normalizeScriptSource("const s = 'it\\'s // kept'; // gone")).toBe("const s = 'it\\'s // kept';");
  });

  it('keeps // and /* inside a template literal', () => {
    expect(normalizeScriptSource('const t = `a // b /* c */`;')).toBe('const t = `a // b /* c */`;');
  });

  it('keeps comment-like text inside nested template expressions and removes none of it', () => {
    const source = 'const t = `outer ${ `inner // ${value}` } // tail`;';
    expect(normalizeScriptSource(source)).toBe(source);
  });

  it('keeps // inside a regular expression literal, escaped or in a character class', () => {
    expect(normalizeScriptSource('const r = /https?:\\/\\//; // url\n')).toBe('const r = /https?:\\/\\//;');
    expect(normalizeScriptSource('const c = /[/]x/;')).toBe('const c = /[/]x/;');
  });

  it('keeps a regular expression that follows the return keyword', () => {
    const source = 'function f(s) { return /\\/\\//.test(s); }';
    expect(normalizeScriptSource(source)).toBe(source);
  });

  it('reads a slash after an identifier, a closing parenthesis or ++ as division, not as a regular expression', () => {
    expect(normalizeScriptSource('const half = total / 2; // half\n')).toBe('const half = total / 2;');
    expect(normalizeScriptSource('const r = (a + b) / 2 // note\n')).toBe('const r = (a + b) / 2');
    expect(normalizeScriptSource('const n = i++ / 2; // half\n')).toBe('const n = i++ / 2;');
  });
});

describe('normalizeScriptSource: whitespace and line breaks', () => {
  it('collapses runs of spaces and tabs and drops the spaces at the ends', () => {
    expect(normalizeScriptSource('const   a   =\t1;   ')).toBe('const a = 1;');
  });

  it('makes indentation differences equal', () => {
    expect(normalizeScriptSource('function f() {\n    return 1;\n}\n')).toBe(
      normalizeScriptSource('function f() {\n  return 1;\n}\n')
    );
  });

  it('treats CRLF and LF as the same line break, outside and inside a template literal', () => {
    expect(normalizeScriptSource('a();\r\nb();\r\n')).toBe(normalizeScriptSource('a();\nb();\n'));
    expect(normalizeScriptSource('`x\r\ny`')).toBe(normalizeScriptSource('`x\ny`'));
  });

  it('keeps a line break where automatic semicolon insertion makes it significant', () => {
    expect(normalizeScriptSource('return\nx')).not.toBe(normalizeScriptSource('return x'));
  });

  it('treats a block comment that spans a line break as a line break', () => {
    expect(normalizeScriptSource('return /*\n*/ x')).toBe(normalizeScriptSource('return\nx'));
  });
});

describe('normalizeWhitespaceOnly', () => {
  it('normalizes line endings and trailing whitespace, and keeps comments and inner spacing', () => {
    expect(normalizeWhitespaceOnly('key:   value # kept  \r\n\r\n')).toBe('key:   value # kept');
  });

  it('keeps leading indentation, because it can be significant in some languages', () => {
    expect(normalizeWhitespaceOnly('a\n  b')).toBe('a\n  b');
  });
});
