import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readProjectConfig } from '../../src/core/project-config.js';

describe('catch config', () => {
  let tempDir: string;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qaspec-catch-config-'));
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    consoleWarnSpy.mockRestore();
  });

  const writeConfig = (body: string) => {
    const configDir = path.join(tempDir, 'qaspec');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.yaml'), `schema: qaspec-pr-review\n${body}`);
  };

  const expectWarnings = (labels: string[]) => {
    for (const label of labels) {
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Invalid '${label}'`));
    }
  };

  it('should parse a complete catch block', () => {
    writeConfig(`catch:
  baseRef: origin/main
  setup:
    commands:
      - npm ci
    reinstallWhenChanged: [package-lock.json]
    timeoutSeconds: 600
  runner:
    adapter: jest
    command: npx jest
    timeoutSeconds: 120
  env:
    inherit: [CI, HOME]
    set:
      TZ: UTC
  gates:
    parentRuns: 4
    childRuns: 2
  judges: 5
  rulesFile: qaspec/references/catch-rules.md
`);

    const config = readProjectConfig(tempDir);

    expect(config?.catch).toEqual({
      baseRef: 'origin/main',
      setup: {
        commands: ['npm ci'],
        reinstallWhenChanged: ['package-lock.json'],
        timeoutSeconds: 600,
      },
      runner: { adapter: 'jest', command: 'npx jest', timeoutSeconds: 120 },
      env: { inherit: ['CI', 'HOME'], set: { TZ: 'UTC' } },
      gates: { parentRuns: 4, childRuns: 2 },
      judges: 5,
      rulesFile: 'qaspec/references/catch-rules.md',
    });
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should apply the documented defaults to every omitted field', () => {
    writeConfig(`catch:
  baseRef: origin/main
`);

    const config = readProjectConfig(tempDir);

    expect(config?.catch).toEqual({
      baseRef: 'origin/main',
      setup: { timeoutSeconds: 900 },
      runner: { timeoutSeconds: 300 },
      gates: { parentRuns: 5, childRuns: 3 },
      judges: 3,
    });
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should return the defaults for an empty catch block', () => {
    writeConfig('catch: {}\n');

    const config = readProjectConfig(tempDir);

    expect(config?.catch).toEqual({
      setup: { timeoutSeconds: 900 },
      runner: { timeoutSeconds: 300 },
      gates: { parentRuns: 5, childRuns: 3 },
      judges: 3,
    });
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should warn and drop invalid catch fields while keeping valid siblings', () => {
    writeConfig(`catch:
  baseRef: origin/main
  setup:
    commands: [npm ci, '']
    timeoutSeconds: 0
  runner:
    adapter: mocha
    command: npx jest
  gates:
    parentRuns: 0
    childRuns: 2
  judges: 4
`);

    const config = readProjectConfig(tempDir);

    expect(config?.catch).toEqual({
      baseRef: 'origin/main',
      setup: { commands: ['npm ci'], timeoutSeconds: 900 },
      runner: { command: 'npx jest', timeoutSeconds: 300 },
      gates: { parentRuns: 5, childRuns: 2 },
      judges: 3,
    });
    expectWarnings([
      'catch.setup.commands[1]',
      'catch.setup.timeoutSeconds',
      'catch.runner.adapter',
      'catch.gates.parentRuns',
      'catch.judges',
    ]);
  });

  it('should warn and use defaults when a nested section is not an object', () => {
    writeConfig(`catch:
  baseRef: origin/main
  setup: [npm ci]
  gates: 5
`);

    const config = readProjectConfig(tempDir);

    expect(config?.catch).toEqual({
      baseRef: 'origin/main',
      setup: { timeoutSeconds: 900 },
      runner: { timeoutSeconds: 300 },
      gates: { parentRuns: 5, childRuns: 3 },
      judges: 3,
    });
    expectWarnings(['catch.setup', 'catch.gates']);
  });

  it('should reject paths that are absolute, leave the project root, or contain a variable reference', () => {
    writeConfig(`catch:
  setup:
    reinstallWhenChanged: [package-lock.json, ../other.lock, /abs/yarn.lock, 'D:/locks/pnpm-lock.yaml', '$HOME/x.lock']
  rulesFile: ../rules.md
`);

    const config = readProjectConfig(tempDir);

    expect(config?.catch?.setup).toEqual({
      reinstallWhenChanged: ['package-lock.json'],
      timeoutSeconds: 900,
    });
    expect(config?.catch).not.toHaveProperty('rulesFile');
    expectWarnings([
      'catch.setup.reinstallWhenChanged[1]',
      'catch.setup.reinstallWhenChanged[2]',
      'catch.setup.reinstallWhenChanged[3]',
      'catch.setup.reinstallWhenChanged[4]',
      'catch.rulesFile',
    ]);
  });

  it('should accept only a baseRef without whitespace that does not start with a dash', () => {
    for (const valid of ['origin/main', 'HEAD~1', 'release/1.2']) {
      writeConfig(`catch:\n  baseRef: ${valid}\n`);
      expect(readProjectConfig(tempDir)?.catch?.baseRef).toBe(valid);
    }
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    for (const invalid of ["'origin/main --all'", "'-u'", "'--upload-pack=x'", "''"]) {
      writeConfig(`catch:\n  baseRef: ${invalid}\n`);
      expect(readProjectConfig(tempDir)?.catch?.baseRef).toBeUndefined();
    }
    expectWarnings(['catch.baseRef']);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(4);
  });

  it('should accept only the jest runner adapter', () => {
    writeConfig(`catch:\n  runner:\n    adapter: mocha\n`);

    expect(readProjectConfig(tempDir)?.catch?.runner).toEqual({ timeoutSeconds: 300 });
    expectWarnings(['catch.runner.adapter']);

    consoleWarnSpy.mockClear();
    writeConfig(`catch:\n  runner:\n    adapter: jest\n`);

    expect(readProjectConfig(tempDir)?.catch?.runner).toEqual({ adapter: 'jest', timeoutSeconds: 300 });
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should accept only odd judge counts from 1 to 9', () => {
    for (const valid of [1, 5, 9]) {
      writeConfig(`catch:\n  judges: ${valid}\n`);
      expect(readProjectConfig(tempDir)?.catch?.judges).toBe(valid);
    }
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    for (const invalid of ['0', '2', '4', '10', '2.5', "'3'"]) {
      writeConfig(`catch:\n  judges: ${invalid}\n`);
      expect(readProjectConfig(tempDir)?.catch?.judges).toBe(3);
    }
    expectWarnings(['catch.judges']);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(6);
  });

  it('should accept only variable names in env.inherit and env.set keys, with string values', () => {
    writeConfig(`catch:
  env:
    inherit: [CI, '1BAD', 'GH-TOKEN', 'A B', '']
    set:
      TZ: UTC
      '1BAD': x
      LOG_LEVEL: 3
      SECRET_VALUE: [ghp_example_secret]
`);

    const config = readProjectConfig(tempDir);

    expect(config?.catch?.env).toEqual({ inherit: ['CI'], set: { TZ: 'UTC' } });
    expectWarnings([
      'catch.env.inherit[1]',
      'catch.env.inherit[2]',
      'catch.env.inherit[3]',
      'catch.env.inherit[4]',
      'catch.env.set.1BAD',
      'catch.env.set.LOG_LEVEL',
      'catch.env.set.SECRET_VALUE',
    ]);
    expect(consoleWarnSpy.mock.calls.flat().join('\n')).not.toContain('ghp_example_secret');
  });

  it('should accept gate runs from 1 to 20 and positive integer timeouts only', () => {
    writeConfig(`catch:\n  gates:\n    parentRuns: 1\n    childRuns: 20\n`);

    expect(readProjectConfig(tempDir)?.catch?.gates).toEqual({ parentRuns: 1, childRuns: 20 });
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    writeConfig(`catch:
  setup:
    timeoutSeconds: 1.5
  runner:
    timeoutSeconds: -1
  gates:
    parentRuns: 21
`);

    const config = readProjectConfig(tempDir);

    expect(config?.catch?.setup?.timeoutSeconds).toBe(900);
    expect(config?.catch?.runner?.timeoutSeconds).toBe(300);
    expect(config?.catch?.gates).toEqual({ parentRuns: 5, childRuns: 3 });
    expectWarnings(['catch.setup.timeoutSeconds', 'catch.runner.timeoutSeconds', 'catch.gates.parentRuns']);
  });

  it('should reject childRuns outside 1 to 20 and use the default', () => {
    for (const childRuns of [0, 21]) {
      consoleWarnSpy.mockClear();
      writeConfig(`catch:\n  gates:\n    parentRuns: 4\n    childRuns: ${childRuns}\n`);

      expect(readProjectConfig(tempDir)?.catch?.gates).toEqual({ parentRuns: 4, childRuns: 3 });
      expectWarnings(['catch.gates.childRuns']);
    }
  });

  it('should warn and drop env sections that are not objects, keeping siblings', () => {
    for (const envBody of ['  env: CI\n', '  env:\n    inherit: [CI]\n    set: TZ=UTC\n', '  env:\n    inherit: [CI]\n    set: [TZ]\n']) {
      consoleWarnSpy.mockClear();
      writeConfig(`catch:\n  baseRef: origin/main\n${envBody}`);

      const config = readProjectConfig(tempDir);

      expect(config?.catch?.baseRef).toBe('origin/main');
      expect(config?.catch?.env?.set).toBeUndefined();
      expectWarnings([envBody.startsWith('  env: CI') ? 'catch.env' : 'catch.env.set']);
      if (!envBody.startsWith('  env: CI')) {
        expect(config?.catch?.env?.inherit).toEqual(['CI']);
      }
    }
  });
});
