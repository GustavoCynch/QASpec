import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCatchConfig } from '../../src/core/catch-config.js';
import { jestAdapter } from '../../src/core/catch-jest.js';
import {
  createRunnerContext,
  getAdapter,
  keepHead,
  keepTail,
  openProjectFolder,
  relativeWithin,
  resolveProjectPaths,
} from '../../src/core/catch-runner.js';

const REFUSAL = /must be relative to the project folder and stay inside it/;

describe('catch-runner', () => {
  let root: string;
  let projectDir: string;
  let restore: Array<() => void>;

  /** Sets a variable in the test process and restores it afterwards, so no test leaks environment. */
  const setEnv = (name: string, value: string): void => {
    const previous = process.env[name];
    process.env[name] = value;
    restore.push(() => {
      if (previous === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previous;
      }
    });
  };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-catch-runner-'));
    projectDir = path.join(root, 'project');
    await fs.mkdir(path.join(projectDir, 'test'), { recursive: true });
    restore = [];
  });

  afterEach(async () => {
    while (restore.length > 0) {
      restore.pop()?.();
    }
    await fs.rm(root, { recursive: true, force: true });
  });

  describe('getAdapter', () => {
    it('returns the Jest adapter for the jest id', () => {
      expect(getAdapter('jest')).toBe(jestAdapter);
      expect(jestAdapter.id).toBe('jest');
    });

    it('refuses an adapter id that is not registered', () => {
      expect(() => getAdapter('mocha')).toThrow('Unknown test-runner adapter "mocha"');
    });
  });

  describe('createRunnerContext', () => {
    it('builds the context from the resolved config: the complete environment and the timeout in milliseconds', () => {
      setEnv('QASPEC_T6_ALLOWED', 'allowed');
      setEnv('QASPEC_T6_LEAK', 'must-not-pass');
      setEnv('GH_TOKEN', 'must-not-pass');
      // parseCatchConfig takes the catch section itself, as readProjectConfig passes it.
      const config = parseCatchConfig({
        runner: { adapter: 'jest', command: 'npx jest', timeoutSeconds: 42 },
        env: { inherit: ['QASPEC_T6_ALLOWED'], set: { QASPEC_T6_SET: 'explicit' } },
      });

      const context = createRunnerContext(config!, { projectDir, scratchDir: path.join(root, 'scratch') });

      expect(context).toMatchObject({
        projectDir,
        runnerCommand: 'npx jest',
        timeoutMs: 42_000,
        scratchDir: path.join(root, 'scratch'),
      });
      expect(context.env).toMatchObject({ QASPEC_T6_ALLOWED: 'allowed', QASPEC_T6_SET: 'explicit' });
      expect(context.env).not.toHaveProperty('QASPEC_T6_LEAK');
      expect(context.env).not.toHaveProperty('GH_TOKEN');
    });

    it('refuses a config without a base test command', () => {
      const config = parseCatchConfig({ runner: { adapter: 'jest' } });

      expect(() => createRunnerContext(config!, { projectDir, scratchDir: root })).toThrow(/catch\.runner\.command/);
    });
  });

  describe('resolveProjectPaths', () => {
    it('returns project-relative POSIX paths, each once, in the order given', async () => {
      const folder = await openProjectFolder(projectDir);

      const paths = await resolveProjectPaths(folder, ['./test/a.spec.ts', 'test\\b.spec.ts', 'test/a.spec.ts']);

      expect(paths).toEqual(['test/a.spec.ts', 'test/b.spec.ts']);
    });

    it.each([
      '',
      '.',
      '../escape.spec.ts',
      'test/../../escape.spec.ts',
      '..\\escape.spec.ts',
      '/etc/passwd',
      '\\\\server\\share\\x.spec.ts',
      'C:\\escape.spec.ts',
      'C:escape.spec.ts',
      'test/bad\nname.spec.ts',
    ])('refuses %j, which does not stay inside the project folder', async (unsafe) => {
      const folder = await openProjectFolder(projectDir);

      await expect(resolveProjectPaths(folder, ['test/ok.spec.ts', unsafe])).rejects.toThrow(REFUSAL);
    });

    it('accepts a name that only starts with two dots', async () => {
      const folder = await openProjectFolder(projectDir);

      expect(await resolveProjectPaths(folder, ['..foo.spec.ts'])).toEqual(['..foo.spec.ts']);
    });

    // Creating symlinks needs a privilege on Windows, so the symlink cases run on POSIX only.
    const posixOnly = it.skipIf(process.platform === 'win32');

    posixOnly('refuses a symlink whose target is outside the project folder', async () => {
      const outside = path.join(root, 'outside.spec.ts');
      await fs.writeFile(outside, '');
      await fs.symlink(outside, path.join(projectDir, 'test', 'link.spec.ts'));
      const folder = await openProjectFolder(projectDir);

      await expect(resolveProjectPaths(folder, ['test/link.spec.ts'])).rejects.toThrow(REFUSAL);
    });

    posixOnly('accepts a symlink whose target stays inside the project folder', async () => {
      await fs.writeFile(path.join(projectDir, 'test', 'real.spec.ts'), '');
      await fs.symlink(path.join(projectDir, 'test', 'real.spec.ts'), path.join(projectDir, 'test', 'alias.spec.ts'));
      const folder = await openProjectFolder(projectDir);

      expect(await resolveProjectPaths(folder, ['test/alias.spec.ts'])).toEqual(['test/alias.spec.ts']);
    });

    it('accepts a path that does not exist yet and stays inside the project folder', async () => {
      const folder = await openProjectFolder(projectDir);

      expect(await resolveProjectPaths(folder, ['test/new.spec.ts'])).toEqual(['test/new.spec.ts']);
    });

    posixOnly('refuses a path under a directory symlink to outside, even when the file is missing', async () => {
      const outsideDir = path.join(root, 'outside-dir');
      await fs.mkdir(outsideDir);
      await fs.symlink(outsideDir, path.join(projectDir, 'test', 'linked'));
      const folder = await openProjectFolder(projectDir);

      await expect(resolveProjectPaths(folder, ['test/linked/new.spec.ts'])).rejects.toThrow(REFUSAL);
    });

    posixOnly('accepts a path under a directory symlink that stays inside the project folder', async () => {
      await fs.mkdir(path.join(projectDir, 'src'));
      await fs.symlink(path.join(projectDir, 'src'), path.join(projectDir, 'test', 'as-src'));
      const folder = await openProjectFolder(projectDir);

      expect(await resolveProjectPaths(folder, ['test/as-src/new.ts'])).toEqual(['test/as-src/new.ts']);
    });

    posixOnly('refuses a dangling symlink whose target is outside the project folder', async () => {
      await fs.symlink(path.join(root, 'missing.spec.ts'), path.join(projectDir, 'test', 'dangling.spec.ts'));
      const folder = await openProjectFolder(projectDir);

      await expect(resolveProjectPaths(folder, ['test/dangling.spec.ts'])).rejects.toThrow(REFUSAL);
    });

    posixOnly('accepts a dangling symlink whose target stays inside the project folder', async () => {
      await fs.symlink(path.join(projectDir, 'test', 'future.spec.ts'), path.join(projectDir, 'test', 'alias.spec.ts'));
      const folder = await openProjectFolder(projectDir);

      expect(await resolveProjectPaths(folder, ['test/alias.spec.ts'])).toEqual(['test/alias.spec.ts']);
    });

    posixOnly('refuses a chain of dangling symlinks that ends outside the project folder', async () => {
      await fs.symlink(path.join(projectDir, 'test', 'middle.spec.ts'), path.join(projectDir, 'test', 'first.spec.ts'));
      await fs.symlink(path.join(root, 'missing.spec.ts'), path.join(projectDir, 'test', 'middle.spec.ts'));
      const folder = await openProjectFolder(projectDir);

      await expect(resolveProjectPaths(folder, ['test/first.spec.ts'])).rejects.toThrow(REFUSAL);
    });

    posixOnly('resolves a relative dangling symlink from its real folder, not the one it is reached by', async () => {
      await fs.mkdir(path.join(projectDir, 'real-dir'));
      await fs.symlink(path.join(projectDir, 'real-dir'), path.join(projectDir, 'test', 'alias-dir'));
      // Read from real-dir this is outside the project; read through test/alias-dir it would look inside it.
      await fs.symlink('../../outside/missing.spec.ts', path.join(projectDir, 'real-dir', 'dangling.spec.ts'));
      const folder = await openProjectFolder(projectDir);

      await expect(resolveProjectPaths(folder, ['test/alias-dir/dangling.spec.ts'])).rejects.toThrow(REFUSAL);
    });

    posixOnly('refuses a symlink loop, which has no target to check', async () => {
      const loop = path.join(projectDir, 'test', 'loop.spec.ts');
      await fs.symlink(loop, loop);
      const folder = await openProjectFolder(projectDir);

      await expect(resolveProjectPaths(folder, ['test/loop.spec.ts'])).rejects.toThrow(REFUSAL);
    });
  });

  describe('relativeWithin', () => {
    it('maps a name spelled with the real or the configured project folder to the same path', async () => {
      const folder = await openProjectFolder(projectDir);

      expect(relativeWithin(folder, path.join(folder.real, 'test', 'a.spec.ts'))).toBe('test/a.spec.ts');
      expect(relativeWithin(folder, path.join(folder.configured, 'test', 'a.spec.ts'))).toBe('test/a.spec.ts');
    });

    it('returns undefined for a name outside the project folder, or for the folder itself', async () => {
      const folder = await openProjectFolder(projectDir);

      expect(relativeWithin(folder, path.join(root, 'elsewhere.spec.ts'))).toBeUndefined();
      expect(relativeWithin(folder, folder.real)).toBeUndefined();
    });
  });

  describe('keepHead and keepTail', () => {
    it('returns text within the budget unchanged', () => {
      expect(keepHead('short', 64)).toBe('short');
      expect(keepTail('short', 64)).toBe('short');
    });

    it('keeps the start of a long text and marks the cut, within the budget', () => {
      const kept = keepHead('a'.repeat(200), 64);

      expect(Buffer.byteLength(kept)).toBeLessThanOrEqual(64);
      expect(kept.startsWith('aaaa')).toBe(true);
      expect(kept.endsWith('[truncated]')).toBe(true);
    });

    it('keeps the end of a long text and marks the cut, within the budget', () => {
      const kept = keepTail(`${'z'.repeat(200)}END`, 64);

      expect(Buffer.byteLength(kept)).toBeLessThanOrEqual(64);
      expect(kept.startsWith('[truncated]')).toBe(true);
      expect(kept.endsWith('END')).toBe(true);
    });

    it('refuses a budget too small to hold the cut mark', () => {
      expect(() => keepHead('abcdef', 12)).toThrow(RangeError);
      expect(() => keepTail('abcdef', 12)).toThrow(RangeError);
    });

    it('never splits a multi-byte character', () => {
      const text = '€'.repeat(100);

      for (const kept of [keepHead(text, 64), keepTail(text, 64)]) {
        expect(Buffer.byteLength(kept)).toBeLessThanOrEqual(64);
        expect(kept).not.toContain('\uFFFD');
      }
    });
  });
});
