import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import {
  LEGACY_OPSX_DOC_PATHS,
  OPSX_SLASH_COMMAND_PATTERN,
  PRIMARY_PRODUCT_DOC_PATHS,
} from '../../src/core/product-doc-guard.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

/** Lines that mention /opsx: only to disclaim legacy install are allowed. */
function isAllowedOpsxMention(line: string): boolean {
  if (!OPSX_SLASH_COMMAND_PATTERN.test(line)) {
    return true;
  }
  OPSX_SLASH_COMMAND_PATTERN.lastIndex = 0;
  return (
    /\/opsx:\*/.test(line) ||
    /does not install/i.test(line) ||
    /not install/i.test(line) ||
    /not generated/i.test(line) ||
    /legacy/i.test(line) ||
    /historical/i.test(line) ||
    /upstream/i.test(line) ||
    /\[OPSX \(legacy\)\]/i.test(line)
  );
}

describe('product documentation slash commands', () => {
  it('does not use /opsx: as default guidance in primary product docs', async () => {
    const violations: string[] = [];

    for (const relativePath of PRIMARY_PRODUCT_DOC_PATHS) {
      const filePath = path.join(REPO_ROOT, relativePath);
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      const disallowed = lines.filter((line) => !isAllowedOpsxMention(line));
      if (disallowed.length > 0) {
        violations.push(
          `${relativePath} (${disallowed.length} unallowlisted /opsx: line(s), e.g. "${disallowed[0].trim().slice(0, 72)}…")`
        );
      }
    }

    expect(
      violations,
      violations.length
        ? `Primary docs must use /qas:* for default install guidance. Move legacy /opsx: content to ${LEGACY_OPSX_DOC_PATHS.join(' or ')}:\n${violations.join('\n')}`
        : undefined
    ).toEqual([]);
  });

  it('allowlists legacy docs for /opsx: migration content', async () => {
    for (const relativePath of LEGACY_OPSX_DOC_PATHS) {
      const filePath = path.join(REPO_ROOT, relativePath);
      await expect(fs.stat(filePath)).resolves.toBeDefined();
    }
  });
});
