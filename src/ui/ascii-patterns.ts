/**
 * Typographic wordmark for the QASpec welcome screen (Option A).
 * Boxed "QA · Spec" — no block-letter ASCII art.
 */

const supportsUnicode =
  process.platform !== 'win32' ||
  !!process.env.WT_SESSION || // Windows Terminal
  !!process.env.TERM_PROGRAM; // Modern terminal

/** Label inside the welcome box */
export const QA_SPEC_LABEL = 'QA  ·  Spec';

/** Inner width between vertical borders (padding included) */
const BOX_INNER_WIDTH = 29;

const BOX_CHARS = supportsUnicode
  ? { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }
  : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' };

function centerLabel(label: string, width: number): string {
  const padTotal = Math.max(0, width - label.length);
  const padLeft = Math.floor(padTotal / 2);
  const padRight = padTotal - padLeft;
  return `${' '.repeat(padLeft)}${label}${' '.repeat(padRight)}`;
}

/** Three-line boxed wordmark with 2-space left margin */
export function getQaSpecWordmarkLines(): string[] {
  const { tl, tr, bl, br, h, v } = BOX_CHARS;
  const inner = centerLabel(QA_SPEC_LABEL, BOX_INNER_WIDTH);
  const horizontal = h.repeat(BOX_INNER_WIDTH);

  return [
    `  ${tl}${horizontal}${tr}`,
    `  ${v}${inner}${v}`,
    `  ${bl}${horizontal}${br}`,
  ];
}
