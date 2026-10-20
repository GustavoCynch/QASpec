import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { runCLI } from '../helpers/run-cli.js';

const ADD_EXPORT = 'add-export';

const CSV_DELTA = [
  '## ADDED Requirements',
  '### Requirement: CSV export',
  'The system SHALL write a CSV file.',
  '#### Scenario: CSV header row',
  '- **WHEN** the file is built\n- **THEN** the first row holds the headers',
].join('\n\n') + '\n';

const CONTRADICTING_DELTA = [
  '## MODIFIED Requirements',
  '### Requirement: Currency',
  'The system SHALL keep each currency.',
  '## REMOVED Requirements',
  '### Requirement: Legacy export',
].join('\n\n') + '\n';

/** analysis.md with an Intent class section; `intent` null omits the line. */
function analysis(intent: string | null): string {
  return [
    '# Analysis',
    '## Affected capabilities',
    '- billing-export',
    '## Intent class',
    ...(intent === null ? [] : [intent]),
    '## Approval digest',
    'Pending.',
  ].join('\n\n') + '\n';
}

/** Every file under the project root, keyed by its relative path. */
async function snapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const walk = async (current: string): Promise<void> => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        files[path.relative(root, full)] = await fs.readFile(full, 'utf-8');
      }
    }
  };
  await walk(root);
  return files;
}

describe('qaspec catch intent', () => {
  let projectRoot: string;

  const write = async (root: string, relativePath: string, content: string) => {
    const target = path.join(root, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf-8');
  };

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-catch-cli-'));
    await write(projectRoot, path.join('qaspec', 'config.yaml'), 'schema: qaspec-pr-review\n');

    await write(projectRoot, path.join('qaspec', 'changes', ADD_EXPORT, 'analysis.md'), analysis('Intent class: additive'));
    await write(projectRoot, path.join('qaspec', 'changes', ADD_EXPORT, 'specs', 'billing-export', 'spec.md'), CSV_DELTA);

    await write(projectRoot, path.join('qaspec', 'changes', 'no-class', 'analysis.md'), analysis(null));

    await write(projectRoot, path.join('qaspec', 'changes', 'contradiction', 'analysis.md'), analysis('Intent class: additive'));
    await write(
      projectRoot,
      path.join('qaspec', 'changes', 'contradiction', 'specs', 'billing-export', 'spec.md'),
      CONTRADICTING_DELTA
    );
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('exits 0 and prints the intent class and the requirement map', async () => {
    const result = await runCLI(['catch', 'intent', '--change', ADD_EXPORT], { cwd: projectRoot });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('additive');
    expect(result.stdout).toContain('billing-export');
    expect(result.stdout).toContain('CSV export');
  });

  it('prints the intent as JSON with the qaspec.catch-intent/v1 schema', async () => {
    const result = await runCLI(['catch', 'intent', '--change', ADD_EXPORT, '--json'], { cwd: projectRoot });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      schema: 'qaspec.catch-intent/v1',
      change: ADD_EXPORT,
      intentClass: 'additive',
      capabilities: [
        {
          name: 'billing-export',
          requirements: [
            {
              name: 'CSV export',
              status: 'added',
              scenarios: [
                {
                  title: 'CSV header row',
                  when: ['the file is built'],
                  then: ['the first row holds the headers'],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('exits 1 with the analyze approval hint when the intent class is missing', async () => {
    const result = await runCLI(['catch', 'intent', '--change', 'no-class'], { cwd: projectRoot });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Intent class');
    expect(result.stdout).toMatch(/approve/i);
  });

  it('exits 1 and lists every contradiction as JSON', async () => {
    const result = await runCLI(['catch', 'intent', '--change', 'contradiction', '--json'], { cwd: projectRoot });

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({ schema: 'qaspec.catch-intent/v1', change: 'contradiction', valid: false });
    expect(output.errors.map((error: { requirement?: string }) => error.requirement)).toEqual([
      'Currency',
      'Legacy export',
    ]);
  });

  it('exits 1 when the change does not exist', async () => {
    const result = await runCLI(['catch', 'intent', '--change', 'missing-change'], { cwd: projectRoot });

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/not found/i);
  });

  it('exits 1 when --change is missing', async () => {
    const result = await runCLI(['catch', 'intent'], { cwd: projectRoot });

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain('--change');
  });

  it('exits 1 from a workspace root, where catch has no repository changes', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-catch-workspace-'));
    try {
      await write(workspaceRoot, path.join('.qaspec-workspace', 'workspace.yaml'), 'name: demo\n');

      const result = await runCLI(['catch', 'intent', '--change', ADD_EXPORT], { cwd: workspaceRoot });

      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toMatch(/repository/i);
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('is read-only: no file in the project changes for text, JSON, valid or invalid runs', async () => {
    const before = await snapshot(projectRoot);

    const valid = await runCLI(['catch', 'intent', '--change', ADD_EXPORT], { cwd: projectRoot });
    const validJson = await runCLI(['catch', 'intent', '--change', ADD_EXPORT, '--json'], { cwd: projectRoot });
    const invalid = await runCLI(['catch', 'intent', '--change', 'contradiction', '--json'], { cwd: projectRoot });

    expect([valid.exitCode, validJson.exitCode, invalid.exitCode]).toEqual([0, 0, 1]);
    expect(await snapshot(projectRoot)).toEqual(before);
  });
});
