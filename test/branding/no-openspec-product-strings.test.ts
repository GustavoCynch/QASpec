import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import {
  OPENSPEC_PRODUCT_STRING_ALLOWLIST,
  findOpenspecCliInstructionViolations,
} from '../../src/core/branding.js';
import { getGeneratedTemplateBodiesForBrandingScan } from '../../src/core/shared/skill-generation.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

const SCAN_ROOTS = [
  path.join(REPO_ROOT, 'src'),
  path.join(REPO_ROOT, 'docs'),
  path.join(REPO_ROOT, 'schemas'),
  path.join(REPO_ROOT, 'website', 'src'),
  path.join(REPO_ROOT, 'README.md'),
  path.join(REPO_ROOT, 'AGENTS.md'),
  path.join(REPO_ROOT, 'MAINTAINERS.md'),
  path.join(REPO_ROOT, 'flake.nix'),
  ...['WORKSPACE_REIMPLEMENTATION_DIRECTION.md', 'WORKSPACE_REIMPLEMENTATION_START_HERE.md'].map((name) =>
    path.join(REPO_ROOT, name)
  ),
];

const SCAN_EXTENSIONS = new Set(['.ts', '.md', '.yaml', '.yml', '.nix', '.astro']);

function isAllowedLine(line: string): boolean {
  return OPENSPEC_PRODUCT_STRING_ALLOWLIST.some((pattern) => pattern.test(line));
}

async function collectFiles(dir: string): Promise<string[]> {
  const stat = await fs.stat(dir);
  if (stat.isFile()) {
    return SCAN_EXTENSIONS.has(path.extname(dir)) ? [dir] : [];
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      files.push(...(await collectFiles(full)));
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

describe('no mis-branded OpenSpec product strings', () => {
  it('allows OpenSpec only on allowlisted lines in guarded surfaces', async () => {
    const allFiles: string[] = [];
    for (const root of SCAN_ROOTS) {
      allFiles.push(...(await collectFiles(root)));
    }

    const violations: string[] = [];

    for (const file of allFiles) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      if (rel === 'src/core/branding.ts') continue;

      const content = await fs.readFile(file, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes('OpenSpec')) continue;
        if (isAllowedLine(line)) continue;
        violations.push(`${path.relative(REPO_ROOT, file)}:${i + 1}: ${line.trim()}`);
      }
    }

    expect(
      violations,
      violations.length
        ? `Unqualified OpenSpec product strings (tighten copy or extend allowlist in branding.ts):\n${violations.join('\n')}`
        : undefined
    ).toEqual([]);
  });

  it('generated skill and command template bodies have no openspec CLI instructions', () => {
    const violations = getGeneratedTemplateBodiesForBrandingScan().flatMap(({ source, body }) =>
      findOpenspecCliInstructionViolations(body, source)
    );

    expect(
      violations,
      violations.length
        ? `openspec <subcommand> instructions in generated templates (use qaspec CLI):\n${violations.join('\n')}`
        : undefined
    ).toEqual([]);
  });

  it('flags openspec feedback in a fixture body', () => {
    const fixture = 'Submit via `openspec feedback "title"` on confirmation.';
    expect(findOpenspecCliInstructionViolations(fixture, 'fixture')).toHaveLength(1);
  });

});
