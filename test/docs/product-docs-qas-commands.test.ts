import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import {
  OPENSPEC_CLI_COMMAND_PATTERN,
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
    /upstream/i.test(line)
  );
}

/** Repo path literals and legacy disclaimers may mention openspec/ without being CLI examples. */
function isAllowedOpenspecCliMention(line: string): boolean {
  if (!OPENSPEC_CLI_COMMAND_PATTERN.test(line)) {
    return true;
  }
  OPENSPEC_CLI_COMMAND_PATTERN.lastIndex = 0;
  return (
    /legacy/i.test(line) ||
    /historical/i.test(line) ||
    /upstream/i.test(line) ||
    /not install/i.test(line) ||
    /openspec\/[a-z]/i.test(line)
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
        ? `Primary docs must use /qsx:* for default install guidance:\n${violations.join('\n')}`
        : undefined
    ).toEqual([]);
  });

  it('does not use openspec <subcommand> as primary CLI guidance in product docs', async () => {
    const violations: string[] = [];

    for (const relativePath of PRIMARY_PRODUCT_DOC_PATHS) {
      const filePath = path.join(REPO_ROOT, relativePath);
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      const disallowed = lines.filter((line) => !isAllowedOpenspecCliMention(line));
      if (disallowed.length > 0) {
        violations.push(
          `${relativePath} (${disallowed.length} openspec CLI example(s), e.g. "${disallowed[0].trim().slice(0, 72)}…")`
        );
      }
    }

    expect(
      violations,
      violations.length
        ? `Primary docs must use qaspec <subcommand>, not openspec:\n${violations.join('\n')}`
        : undefined
    ).toEqual([]);
  });
});
