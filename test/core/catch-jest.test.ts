import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChildEnv } from '../../src/core/catch-git.js';
import { jestAdapter, quoteShellArgument } from '../../src/core/catch-jest.js';
import type { RunResult, RunnerContext } from '../../src/core/catch-runner.js';

const WINDOWS = process.platform === 'win32';
const FAKE_JEST = fileURLToPath(new URL('../fixtures/catch-jest/fake-jest.mjs', import.meta.url));
/**
 * Variables the shell adds to the command's environment (POSIX sh, and macOS's sh); they are not QASpec's.
 * Names that start with = are per-drive working directories that cmd.exe adds.
 */
const SHELL_ADDED = ['PWD', 'OLDPWD', 'SHLVL', '_', '__CF_USER_TEXT_ENCODING'];
const TEXT_BUDGET_BYTES = 4096;
const REFUSAL = /must be relative to the project folder and stay inside it/;

/**
 * Quotes one word of the base command for the test. The paths here have no quotes or dollar signs, so double
 * quotes serve both /bin/sh and cmd.exe. The adapter's own quoting is what the tests exercise.
 */
const shellWord = (value: string): string =>
  WINDOWS ? `"${value}"` : `'${value.replace(/'/g, `'\\''`)}'`;

interface Recorded {
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

describe('jestAdapter', () => {
  let root: string;
  let projectDir: string;
  let scratchDir: string;
  let record: string;
  let restore: Array<() => void>;

  /** Sets a variable in the test process and restores it afterwards, so the child cannot inherit a leftover. */
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

  /** A context whose base command is the fake runner in the given mode. */
  const contextFor = (mode: string, overrides: Partial<RunnerContext> = {}): RunnerContext => ({
    projectDir,
    runnerCommand: [process.execPath, FAKE_JEST, record, mode].map(shellWord).join(' '),
    env: buildChildEnv(undefined),
    timeoutMs: 20_000,
    scratchDir,
    ...overrides,
  });

  const recorded = async (): Promise<Recorded> => JSON.parse(await fs.readFile(record, 'utf8')) as Recorded;

  /** The outcome of each file of a run, by project-relative name. */
  const outcomeByFile = (result: RunResult): Record<string, string> =>
    Object.fromEntries(result.files.map((file) => [file.file, file.outcome]));

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-catch-jest-'));
    projectDir = path.join(root, 'project');
    scratchDir = path.join(root, 'scratch');
    record = path.join(root, 'record.json');
    await fs.mkdir(path.join(projectDir, 'test'), { recursive: true });
    restore = [];
  });

  afterEach(async () => {
    while (restore.length > 0) {
      restore.pop()?.();
    }
    await fs.rm(root, { recursive: true, force: true });
  });

  describe('run', () => {
    it('appends the Jest options before the test paths, and quotes every argument', async () => {
      const tricky = "test/it's (copy) $HOME.spec.ts";

      const result = await jestAdapter.run(contextFor('echo-pass'), ['test/sum.spec.ts', tricky]);

      expect(result.outcome).toBe('pass');
      expect(result.files.map((file) => file.file)).toEqual(['test/sum.spec.ts', tricky]);
      expect((await recorded()).args).toEqual([
        '--json',
        expect.stringMatching(/^--outputFile=.+\.json$/),
        '--ci',
        '--colors=false',
        '--runTestsByPath',
        'test/sum.spec.ts',
        tricky,
      ]);
    });

    it('passes a path that starts with a dash as ./name, so Jest cannot read it as an option', async () => {
      const result = await jestAdapter.run(contextFor('echo-pass'), ['-odd.spec.ts']);

      expect(result).toMatchObject({ outcome: 'pass', files: [{ file: '-odd.spec.ts', outcome: 'pass' }] });
      const { args } = await recorded();
      expect(args.at(-1)).toBe('./-odd.spec.ts');
      expect(args).not.toContain('-odd.spec.ts');
    });

    it('runs each test file once, however it is spelled', async () => {
      await jestAdapter.run(contextFor('echo-pass'), ['test/sum.spec.ts', './test/sum.spec.ts']);

      expect((await recorded()).args.filter((arg) => arg.includes('sum.spec.ts'))).toEqual(['test/sum.spec.ts']);
    });

    const unsafePaths = [
      '../escape.spec.ts',
      '/etc/passwd',
      'test/../../escape.spec.ts',
      '..\\escape.spec.ts',
      'C:\\escape.spec.ts',
    ];

    it.each(unsafePaths)(
      'refuses %j before running anything',
      async (unsafe) => {
        await expect(jestAdapter.run(contextFor('echo-pass'), ['test/sum.spec.ts', unsafe])).rejects.toThrow(REFUSAL);

        await expect(fs.access(record)).rejects.toThrow();
      }
    );

    it.skipIf(WINDOWS)('refuses a test path that is a symlink to a file outside the project', async () => {
      const outside = path.join(root, 'outside.spec.ts');
      await fs.writeFile(outside, '');
      await fs.symlink(outside, path.join(projectDir, 'test', 'link.spec.ts'));

      await expect(jestAdapter.run(contextFor('echo-pass'), ['test/link.spec.ts'])).rejects.toThrow(REFUSAL);
      await expect(fs.access(record)).rejects.toThrow();
    });

    it.skipIf(WINDOWS)(
      'refuses a test path under a directory symlink to outside, even when the file does not exist yet',
      async () => {
        const outsideDir = path.join(root, 'outside-dir');
        await fs.mkdir(outsideDir);
        await fs.symlink(outsideDir, path.join(projectDir, 'test', 'linked'));

        await expect(jestAdapter.run(contextFor('echo-pass'), ['test/linked/new.spec.ts'])).rejects.toThrow(REFUSAL);
        await expect(fs.access(record)).rejects.toThrow();
      }
    );

    it('refuses an empty list instead of letting Jest run every test', async () => {
      await expect(jestAdapter.run(contextFor('echo-pass'), [])).rejects.toThrow('No test files to run');
      await expect(fs.access(record)).rejects.toThrow();
    });

    it('runs the command in the project folder', async () => {
      await jestAdapter.run(contextFor('echo-pass'), ['test/sum.spec.ts']);

      expect(await fs.realpath((await recorded()).cwd)).toBe(await fs.realpath(projectDir));
    });

    it('gives the child exactly the environment it is given, never the environment of QASpec', async () => {
      setEnv('QASPEC_T6_LEAK', 'must-not-pass');
      const context = contextFor('echo-pass', { env: { ...buildChildEnv(undefined), QASPEC_T6_ALLOWED: 'kept' } });

      await jestAdapter.run(context, ['test/sum.spec.ts']);

      const { env } = await recorded();
      expect(env.QASPEC_T6_ALLOWED).toBe('kept');
      expect(env).not.toHaveProperty('QASPEC_T6_LEAK');
      const unexpected = Object.keys(env).filter(
        (name) => !Object.hasOwn(context.env, name) && !SHELL_ADDED.includes(name) && !name.startsWith('=')
      );
      expect(unexpected).toEqual([]);
    });

    it('classifies a passing report as pass, with each file duration', async () => {
      const result = await jestAdapter.run(contextFor('report:pass'), ['test/sum.spec.ts']);

      expect(result).toMatchObject({
        outcome: 'pass',
        files: [{ file: 'test/sum.spec.ts', outcome: 'pass', messages: [], durationMs: 50 }],
      });
      expect(typeof result.durationMs).toBe('number');
      expect(typeof result.outputTail).toBe('string');
    });

    it('classifies a failing assertion as fail, with its failure message', async () => {
      const result = await jestAdapter.run(contextFor('report:fail'), ['test/sum.spec.ts']);

      expect(result.outcome).toBe('fail');
      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({ file: 'test/sum.spec.ts', outcome: 'fail' });
      expect(result.files[0].messages[0]).toContain('Expected: 4');
    });

    it('classifies a suite that failed to run without executed tests as no-build, with the compile error', async () => {
      const result = await jestAdapter.run(contextFor('report:no-build'), ['test/sum.spec.ts']);

      expect(result.outcome).toBe('no-build');
      expect(result.files[0]).toMatchObject({ file: 'test/sum.spec.ts', outcome: 'no-build' });
      expect(result.files[0].messages[0]).toContain('error TS2322');
    });

    it('reports no-build over fail when a run mixes them, and keeps each file outcome', async () => {
      const result = await jestAdapter.run(contextFor('report:mixed'), ['test/sum.spec.ts', 'test/other.spec.ts']);

      expect(result.outcome).toBe('no-build');
      const byFile = Object.fromEntries(result.files.map((file) => [file.file, file.outcome]));
      expect(byFile).toEqual({ 'test/sum.spec.ts': 'no-build', 'test/other.spec.ts': 'fail' });
    });

    it('classifies a passing suite whose tests are all skipped, pending or todo as no-tests, never pass', async () => {
      const result = await jestAdapter.run(contextFor('report:skipped'), ['test/sum.spec.ts', 'test/other.spec.ts']);

      expect(result.outcome).toBe('no-tests');
      expect(outcomeByFile(result)).toEqual({ 'test/sum.spec.ts': 'no-tests', 'test/other.spec.ts': 'pass' });
      expect(result.files[0].messages).toEqual([expect.stringContaining('No test was executed')]);
    });

    it('classifies a passing suite with no assertion at all as no-tests', async () => {
      const result = await jestAdapter.run(contextFor('report:no-assertions'), ['test/sum.spec.ts']);

      expect(result).toMatchObject({ outcome: 'no-tests', files: [{ file: 'test/sum.spec.ts', outcome: 'no-tests' }] });
    });

    it('reports fail over no-tests when a run mixes them', async () => {
      const files = ['test/sum.spec.ts', 'test/other.spec.ts'];
      const result = await jestAdapter.run(contextFor('report:mixed-tests'), files);

      expect(result.outcome).toBe('fail');
      expect(outcomeByFile(result)).toEqual({ 'test/sum.spec.ts': 'no-tests', 'test/other.spec.ts': 'fail' });
    });

    it('takes the worst outcome of a file that the report lists twice, not the last one', async () => {
      const files = ['test/sum.spec.ts', 'test/other.spec.ts', 'test/nested/skip.spec.ts'];

      const result = await jestAdapter.run(contextFor('report:duplicate'), files);

      expect(result.outcome).toBe('no-build');
      expect(outcomeByFile(result)).toEqual({
        'test/sum.spec.ts': 'fail',
        'test/other.spec.ts': 'no-build',
        'test/nested/skip.spec.ts': 'no-tests',
      });
      expect(result.files[0]).toMatchObject({ file: 'test/sum.spec.ts', durationMs: 70 });
      expect(result.files[0].messages[0]).toContain('Expected: 4');
    });

    it('turns a passing report into runner-error when the command exits non-zero, keeping the files', async () => {
      // A failed globalTeardown or a coverage threshold leaves every suite passed while the command fails.
      const result = await jestAdapter.run(contextFor('report-exit:pass:3'), ['test/sum.spec.ts']);

      expect(result).toMatchObject({
        outcome: 'runner-error',
        reason: 'The report passed but the command exited with code 3.',
        files: [{ file: 'test/sum.spec.ts', outcome: 'pass' }],
      });
    });

    it('keeps the outcome of a failing report when the command also exits non-zero', async () => {
      const result = await jestAdapter.run(contextFor('report-exit:fail:1'), ['test/sum.spec.ts']);

      expect(result.outcome).toBe('fail');
      expect(result.files).toEqual([expect.objectContaining({ file: 'test/sum.spec.ts', outcome: 'fail' })]);
    });

    it('returns runner-error when a requested file has no suite in the report, never a vacuous pass', async () => {
      const result = await jestAdapter.run(contextFor('report:empty'), ['test/sum.spec.ts']);

      expect(result.outcome).toBe('runner-error');
      expect(result.files).toEqual([]);
      expect(result.reason).toContain('test/sum.spec.ts');
    });

    it('returns runner-error when a file has a status the report does not define', async () => {
      const result = await jestAdapter.run(contextFor('echo-pending'), ['test/sum.spec.ts']);

      expect(result.outcome).toBe('runner-error');
      expect(result.reason).toContain('unknown status');
    });

    it('returns runner-error when the report names a suite outside the project folder', async () => {
      const result = await jestAdapter.run(contextFor('echo-outside'), ['test/sum.spec.ts']);

      expect(result.outcome).toBe('runner-error');
      expect(result.reason).toContain('outside the project folder');
    });

    // Windows stops only the shell that started the runner, so the sleeping process would outlive the test.
    it.skipIf(WINDOWS)('returns timeout when the command runs past its timeout', async () => {
      const result = await jestAdapter.run(contextFor('sleep', { timeoutMs: 300 }), ['test/sum.spec.ts']);

      expect(result).toMatchObject({ outcome: 'timeout', files: [] });
      expect(result.durationMs).toBeLessThan(10_000);
    });

    it('returns runner-error when the command exits without writing a report', async () => {
      const result = await jestAdapter.run(contextFor('silent'), ['test/sum.spec.ts']);

      expect(result.outcome).toBe('runner-error');
      expect(result.reason).toMatch(/no report/);
    });

    it('returns runner-error when the report is not Jest JSON', async () => {
      const result = await jestAdapter.run(contextFor('garbage'), ['test/sum.spec.ts']);

      expect(result.outcome).toBe('runner-error');
      expect(result.reason).toMatch(/not a Jest JSON report/);
    });

    it('returns runner-error with the output when the command exits with an error and no report', async () => {
      const result = await jestAdapter.run(contextFor('exit3'), ['test/sum.spec.ts']);

      expect(result.outcome).toBe('runner-error');
      expect(result.reason).toMatch(/exited with code 3/);
      expect(result.outputTail).toContain('boom from the runner');
    });

    it.skipIf(WINDOWS)('returns runner-error when the command is stopped by a signal', async () => {
      const result = await jestAdapter.run(contextFor('signal'), ['test/sum.spec.ts']);

      expect(result.outcome).toBe('runner-error');
      expect(result.reason).toMatch(/stopped by a signal/);
    });

    it('bounds the failure messages and the output tail', async () => {
      const result = await jestAdapter.run(contextFor('huge'), ['test/sum.spec.ts']);

      expect(result.outcome).toBe('fail');
      const [file] = result.files;
      expect(file.messages.length).toBeLessThanOrEqual(10);
      for (const message of file.messages) {
        expect(Buffer.byteLength(message)).toBeLessThanOrEqual(TEXT_BUDGET_BYTES);
      }
      expect(Buffer.byteLength(result.outputTail)).toBeLessThanOrEqual(TEXT_BUDGET_BYTES);
      expect(result.outputTail.endsWith('ooo')).toBe(true);
    });
  });

  describe('relatedTests', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(projectDir, 'test', 'nested'), { recursive: true });
      await fs.writeFile(path.join(projectDir, 'test', 'sum.spec.ts'), '');
      await fs.writeFile(path.join(projectDir, 'test', 'nested', 'other.spec.ts'), '');
    });

    it('returns the related test files as sorted, project-relative paths', async () => {
      const tests = await jestAdapter.relatedTests(contextFor('list'), ['src/sum.ts', 'src/nested/util.ts']);

      expect(tests).toEqual(['test/nested/other.spec.ts', 'test/sum.spec.ts']);
      expect((await recorded()).args).toEqual([
        '--listTests',
        '--findRelatedTests',
        'src/sum.ts',
        'src/nested/util.ts',
      ]);
    });

    it('refuses a source path outside the project before running anything', async () => {
      await expect(jestAdapter.relatedTests(contextFor('list'), ['../src/sum.ts'])).rejects.toThrow(REFUSAL);
      await expect(fs.access(record)).rejects.toThrow();
    });

    it('throws when the listing command fails, rather than reporting that no test is related', async () => {
      await expect(jestAdapter.relatedTests(contextFor('exit3'), ['src/sum.ts'])).rejects.toThrow(/exit code 3/);
    });

    it('drops a listed path that is not an existing file, so only real test files are related', async () => {
      await fs.rm(path.join(projectDir, 'test', 'nested', 'other.spec.ts'));

      const tests = await jestAdapter.relatedTests(contextFor('list'), ['src/sum.ts']);

      expect(tests).toEqual(['test/sum.spec.ts']);
    });

    it('returns no tests without starting the runner when there are no source files', async () => {
      expect(await jestAdapter.relatedTests(contextFor('list'), [])).toEqual([]);
      await expect(fs.access(record)).rejects.toThrow();
    });
  });
});

describe('quoteShellArgument', () => {
  it('single-quotes an argument for POSIX shells, escaping single quotes', () => {
    expect(quoteShellArgument('a b', 'linux')).toBe("'a b'");
    expect(quoteShellArgument("it's", 'darwin')).toBe(`'it'\\''s'`);
  });

  it.skipIf(WINDOWS)('keeps every POSIX argument intact when /bin/sh parses it back', () => {
    const samples = [
      "it's",
      'a "quoted" b',
      '$HOME `ls` $(id)',
      'back\\slash',
      '-dash.spec.ts',
      'two  spaces and\ttabs',
      'glob*[x]?',
    ];

    for (const sample of samples) {
      const echoed = execFileSync('/bin/sh', ['-c', `printf '%s' ${quoteShellArgument(sample, 'linux')}`], {
        encoding: 'utf8',
      });
      expect(echoed).toBe(sample);
    }
  });

  it('double-quotes an argument for Windows, escaping quotes and the backslashes before them', () => {
    expect(quoteShellArgument('plain', 'win32')).toBe('"plain"');
    expect(quoteShellArgument('a "b"', 'win32')).toBe(String.raw`"a \"b\""`);
    expect(quoteShellArgument('C:\\dir\\', 'win32')).toBe(String.raw`"C:\dir\\"`);
    expect(quoteShellArgument('x\\"y', 'win32')).toBe(String.raw`"x\\\"y"`);
  });

  it('refuses a Windows argument with a percent sign, which cmd.exe expands even inside quotes', () => {
    expect(() => quoteShellArgument('50%', 'win32')).toThrow(/%/);
  });
});
