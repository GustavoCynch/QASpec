import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('openspec binary shim', () => {
  it('prints deprecation to stderr and exits 0 for --version', () => {
    const result = spawnSync(process.execPath, [path.join(repoRoot, 'bin/openspec.js'), '--version'], {
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('openspec is deprecated; use qaspec');
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });

  it('prints deprecation and runs list when planning home exists', () => {
    const result = spawnSync(process.execPath, [path.join(repoRoot, 'bin/openspec.js'), 'list'], {
      encoding: 'utf-8',
      cwd: repoRoot,
      env: { ...process.env, NO_COLOR: '1' },
    });

    expect(result.stderr).toContain('openspec is deprecated; use qaspec');
    expect(result.status).toBe(0);
  });
});
