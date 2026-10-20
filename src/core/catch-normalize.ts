/**
 * Source normalization for the mutant equivalence filter (S6, T7): a mutant whose file equals the parent's once
 * comments and insignificant whitespace are removed is syntactically equivalent, and it never runs.
 *
 * The filter may discard only what is certainly insignificant, so it errs toward keeping text. String, template
 * and regular expression contents are kept as written (a `//` inside them is not a comment). A line break is kept
 * as a line break, because automatic semicolon insertion makes it significant: `return` followed by a line break
 * returns nothing. Runs of other whitespace collapse to one space.
 */

type Frame = { kind: 'template' } | { kind: 'substitution'; depth: number };

/** Words after which a slash starts a regular expression rather than a division. */
const KEYWORDS_BEFORE_EXPRESSION = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);

const LINE_BREAK = /[\n\r\u2028\u2029]/;
const IDENTIFIER_START = /[\p{ID_Start}$_]/u;
const IDENTIFIER_PART = /[\p{ID_Continue}$\u200c\u200d]/u;
const FLAG = /[\p{ID_Continue}$]/u;

const isLineBreak = (char: string | undefined): boolean => char !== undefined && LINE_BREAK.test(char);
const isSpace = (char: string | undefined): boolean => char !== undefined && /\s/.test(char);

/** The index just after a regular expression literal that starts at start, or -1 when it is not one. */
function regexEnd(source: string, start: number): number {
  let inClass = false;
  for (let i = start + 1; i < source.length; i++) {
    const char = source[i];
    if (isLineBreak(char)) {
      return -1;
    }
    if (char === '\\') {
      if (isLineBreak(source[i + 1])) {
        return -1;
      }
      i++;
    } else if (inClass) {
      inClass = char !== ']';
    } else if (char === '[') {
      inClass = true;
    } else if (char === '/') {
      let end = i + 1;
      while (end < source.length && FLAG.test(source[end])) {
        end++;
      }
      return end;
    }
  }
  return -1;
}

/** The index just after a string literal that starts at start. An unterminated string ends at its line break. */
function stringEnd(source: string, start: number): number {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    const char = source[i];
    if (char === '\\') {
      i += source[i + 1] === '\r' && source[i + 2] === '\n' ? 3 : 2;
    } else if (char === quote) {
      return i + 1;
    } else if (isLineBreak(char)) {
      return i;
    } else {
      i++;
    }
  }
  return source.length;
}

/**
 * The comparable form of TypeScript or JavaScript source: comments removed, whitespace runs collapsed to one space
 * (or one line break when the run holds one), no leading or trailing whitespace. Literal contents are copied as
 * written, except that a line break inside a template literal is LF, as the language reads it.
 */
export function normalizeScriptSource(text: string): string {
  const source = text;
  const frames: Frame[] = [];
  let out = '';
  let pending: '' | ' ' | '\n' = '';
  // Whether a slash here starts a regular expression: true after an operator or an opening token, false after a value.
  let expressionAllowed = true;

  // Writes the pending separator (once something was written) and then a code token.
  const token = (piece: string, allowsExpression: boolean): void => {
    if (pending !== '' && out !== '') {
      out += pending;
    }
    pending = '';
    out += piece;
    expressionAllowed = allowsExpression;
  };

  let i = 0;
  while (i < source.length) {
    const frame = frames[frames.length - 1];

    if (frame?.kind === 'template') {
      const char = source[i];
      if (char === '\\') {
        if (source[i + 1] === '\r') {
          out += '\\\n';
          i += source[i + 2] === '\n' ? 3 : 2;
        } else {
          out += source.slice(i, i + 2);
          i += 2;
        }
      } else if (char === '`') {
        out += char;
        frames.pop();
        expressionAllowed = false;
        i++;
      } else if (char === '$' && source[i + 1] === '{') {
        out += '${';
        frames.push({ kind: 'substitution', depth: 0 });
        expressionAllowed = true;
        i += 2;
      } else if (char === '\r') {
        out += '\n';
        i += source[i + 1] === '\n' ? 2 : 1;
      } else {
        out += char;
        i++;
      }
      continue;
    }

    const char = source[i];
    if (isLineBreak(char)) {
      pending = '\n';
      i++;
    } else if (isSpace(char)) {
      if (pending === '') {
        pending = ' ';
      }
      i++;
    } else if (char === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < source.length && !isLineBreak(source[i])) {
        i++;
      }
    } else if (char === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2);
      const stop = close === -1 ? source.length : close + 2;
      if (LINE_BREAK.test(source.slice(i, stop))) {
        pending = '\n';
      } else if (pending === '') {
        pending = ' ';
      }
      i = stop;
    } else if (char === '/' && expressionAllowed && regexEnd(source, i) !== -1) {
      const end = regexEnd(source, i);
      token(source.slice(i, end), false);
      i = end;
    } else if (char === '"' || char === "'") {
      const end = stringEnd(source, i);
      token(source.slice(i, end), false);
      i = end;
    } else if (char === '`') {
      token('`', false);
      frames.push({ kind: 'template' });
      i++;
    } else if (char === '{') {
      if (frame?.kind === 'substitution') {
        frame.depth++;
      }
      token('{', true);
      i++;
    } else if (char === '}') {
      if (frame?.kind === 'substitution' && frame.depth === 0) {
        frames.pop();
        token('}', false);
      } else {
        if (frame?.kind === 'substitution') {
          frame.depth--;
        }
        token('}', true);
      }
      i++;
    } else if (char === ')' || char === ']') {
      token(char, false);
      i++;
    } else if ((char === '+' || char === '-') && source[i + 1] === char) {
      // ++ or -- after a value is postfix, so a slash after it divides.
      token(char + char, expressionAllowed);
      i += 2;
    } else if (IDENTIFIER_START.test(char) || (char >= '0' && char <= '9')) {
      let end = i + 1;
      while (end < source.length && IDENTIFIER_PART.test(source[end])) {
        end++;
      }
      const word = source.slice(i, end);
      token(word, KEYWORDS_BEFORE_EXPRESSION.has(word));
      i = end;
    } else {
      token(char, true);
      i++;
    }
  }
  return out;
}

/** Other languages: line endings and trailing whitespace only. Comments and inner spacing still count. */
export function normalizeWhitespaceOnly(text: string): string {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n');
}
