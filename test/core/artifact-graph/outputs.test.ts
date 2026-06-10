import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  resolveArtifactOutputs,
  resolveTracksFilePath,
  LEGACY_TRACKS_FILE_NOTICE,
} from '../../../src/core/artifact-graph/outputs.js';
import { generateApplyInstructions } from '../../../src/commands/workflow/instructions.js';

describe('artifact outputs legacy fallback', () => {
  let tempDir: string;
  let changeDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qaspec-outputs-'));
    changeDir = path.join(tempDir, 'openspec', 'changes', 'qa-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, '.openspec.yaml'),
      'schema: qaspec-pr-review\n'
    );
    fs.mkdirSync(path.join(tempDir, 'openspec'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'openspec', 'config.yaml'),
      'schema: qaspec-pr-review\n'
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves testcases.md artifact from legacy testmatrix.md', () => {
    fs.writeFileSync(
      path.join(changeDir, 'testmatrix.md'),
      '- [ ] 1.1 Legacy case title\n'
    );

    const outputs = resolveArtifactOutputs(changeDir, 'testcases.md');
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toContain('testmatrix.md');
  });

  it('prefers testcases.md when both legacy and canonical exist', () => {
    fs.writeFileSync(path.join(changeDir, 'testmatrix.md'), '- [ ] 1.1 Legacy\n');
    fs.writeFileSync(path.join(changeDir, 'testcases.md'), '- [ ] 1.1 Canonical\n');

    const outputs = resolveArtifactOutputs(changeDir, 'testcases.md');
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toContain('testcases.md');
  });

  it('resolveTracksFilePath falls back to testmatrix.md with legacy flag', () => {
    fs.writeFileSync(
      path.join(changeDir, 'testmatrix.md'),
      '- [ ] 1.1 Checkbox task\n- [x] 1.2 Done task\n'
    );

    const resolved = resolveTracksFilePath(changeDir, 'testcases.md');
    expect(resolved?.legacy).toBe(true);
    expect(resolved?.path).toContain('testmatrix.md');
  });

  it('apply instructions read legacy testmatrix.md progress with notice', async () => {
    fs.writeFileSync(path.join(changeDir, 'analisis.md'), '# Analysis\n');
    fs.mkdirSync(path.join(changeDir, 'specs', 'auth'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'specs', 'auth', 'spec.md'), '## ADDED Requirements\n');
    fs.writeFileSync(
      path.join(changeDir, 'testmatrix.md'),
      '- [ ] 1.1 Pending case\n- [x] 1.2 Done case\n'
    );

    const instructions = await generateApplyInstructions(tempDir, 'qa-change');
    expect(instructions.progress.total).toBe(2);
    expect(instructions.progress.complete).toBe(1);
    expect(instructions.legacyTracksNotice).toBe(LEGACY_TRACKS_FILE_NOTICE);
  });
});
