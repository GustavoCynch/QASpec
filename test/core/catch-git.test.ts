import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync, type ExecFileException, type ExecFileOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseCatchConfig, type CatchConfig, type ResolvedCatchConfig } from '../../src/core/catch-config.js';
import {
  buildChildEnv,
  changedFiles,
  createCatchWorktree,
  diffPatch,
  needsReinstall,
  projectPrefix,
  removeCatchWorktree,
  resolveRevisions,
  runSetup,
  switchRevision,
} from '../../src/core/catch-git.js';

/**
 * Faults for the git calls of catch-git. All are off unless a test sets one, and afterEach resets them.
 * maxBuffer lowers the output cap of every git call. overflowKilled flags the max-buffer error as killed, the shape
 * the output-limit check must win over. afterWorktreeAdd makes the next worktree add fail once git has created the
 * folder and its record: 'linked' keeps the .git link, 'unlinked' removes it, as a git killed mid-add leaves it.
 */
const gitFaults = vi.hoisted(() => ({
  maxBuffer: undefined as number | undefined,
  overflowKilled: false,
  afterWorktreeAdd: undefined as 'linked' | 'unlinked' | undefined,
}));

type ExecCallback = (error: ExecFileException | null, stdout: string, stderr: string) => void;

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const fsActual = await import('node:fs');
  const pathActual = await import('node:path');
  const execFileWithFaults = (file: string, args: string[], options: ExecFileOptions, callback: ExecCallback) => {
    if (file !== 'git') {
      return actual.execFile(file, args, options, callback);
    }
    const worktreeFault = gitFaults.afterWorktreeAdd;
    const isWorktreeAdd = args.includes('worktree') && args.includes('add');
    const capped = gitFaults.maxBuffer === undefined ? options : { ...options, maxBuffer: gitFaults.maxBuffer };
    return actual.execFile(file, args, capped, (error, stdout, stderr) => {
      if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' && gitFaults.overflowKilled) {
        Object.assign(error, { killed: true });
      }
      if (isWorktreeAdd && worktreeFault !== undefined && error === null) {
        gitFaults.afterWorktreeAdd = undefined;
        if (worktreeFault === 'unlinked') {
          // The args end with <worktree path> <parent sha>: the folder and its record exist, the .git link does not.
          fsActual.rmSync(pathActual.join(args[args.length - 2], '.git'), { force: true });
        }
        const killed = Object.assign(new Error('git worktree add was killed'), {
          code: null,
          killed: true,
          signal: 'SIGTERM',
        });
        callback(killed, stdout, stderr);
        return;
      }
      callback(error, stdout, stderr);
    });
  };
  return { ...actual, execFile: execFileWithFaults as unknown as typeof actual.execFile };
});

const NODE = process.execPath;
const windows = process.platform === 'win32';
const RUN_ID = '20261019T120000Z-a1b2c3';
const OTHER_RUN_ID = '20261019T120500Z-d4e5f6';
const quote = (value: string) => JSON.stringify(value);
/** A single-quoted shell word, for paths written into a configured command or a git config value. */
const shellWord = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
/** A POSIX hook that records the environment git gives it, so a test can see whether the hook ran. */
const envDumpHook = (dump: string): string => `#!/bin/sh\nenv > ${shellWord(dump)}\n`;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** The message of the error that the call rejects with. Fails the test when the call resolves. */
async function messageOf(call: Promise<unknown>): Promise<string> {
  try {
    await call;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected the call to reject');
}

/** The core.hooksPath of the git call that ran a smudge filter, read from the filter's environment dump. */
function hooksPathSeenBy(dump: string): string {
  const seen = /'core\.hooksPath'='([^']*)'/.exec(fs.readFileSync(dump, 'utf8'));
  if (seen === null) {
    throw new Error('the filter did not see a core.hooksPath');
  }
  return seen[1];
}

/** The parsed catch block (defaults applied) for one setup section, as readProjectConfig returns it. */
function catchConfig(setup: NonNullable<CatchConfig['setup']>): ResolvedCatchConfig {
  const parsed = parseCatchConfig({ setup });
  if (parsed === undefined) {
    throw new Error('parseCatchConfig returned no catch block');
  }
  return parsed;
}

describe('catch-git', () => {
  let repos: string[];
  let extraDirs: string[];
  let catchRoots: string[];
  let envBackup: NodeJS.ProcessEnv;
  let privateTmp: string;

  /** The documented catch root: <tmpdir>/qaspec-catch/<first 12 hex of sha256(real path of project)>. */
  const rootFor = (project: string): string => {
    const hash = createHash('sha256').update(fs.realpathSync(project)).digest('hex').slice(0, 12);
    return path.join(os.tmpdir(), 'qaspec-catch', hash);
  };

  /** The root a project would get from the path as typed; cleanup removes it too, so no spelling leaks. */
  const typedRootFor = (project: string): string => {
    const hash = createHash('sha256').update(path.resolve(project)).digest('hex').slice(0, 12);
    return path.join(os.tmpdir(), 'qaspec-catch', hash);
  };

  const registerRoots = (project: string): void => {
    catchRoots.push(rootFor(project), typedRootFor(project));
  };

  /** A scratch folder outside every repository, removed after the test. */
  const scratchDir = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qaspec-catch-git-scratch-'));
    extraDirs.push(dir);
    return dir;
  };

  /** A repository in the OS temp directory with a local identity, unsigned commits and no hooks. */
  const createRepo = (): string => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'qaspec-catch-git-'));
    repos.push(repo);
    registerRoots(repo);
    git(repo, 'init', '-q');
    git(repo, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    git(repo, 'config', 'user.name', 'QASpec Test');
    git(repo, 'config', 'user.email', 'qaspec-test@example.com');
    git(repo, 'config', 'commit.gpgsign', 'false');
    git(repo, 'config', 'core.hooksPath', path.join(repo, 'no-hooks'));
    return repo;
  };

  /** Writes the files (null deletes one) and commits them on the current HEAD. */
  const commit = (repo: string, files: Record<string, string | null>, message: string): string => {
    for (const [file, content] of Object.entries(files)) {
      const target = path.join(repo, file);
      if (content === null) {
        fs.rmSync(target, { force: true });
      } else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
      }
    }
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', message);
    return git(repo, 'rev-parse', 'HEAD');
  };

  /** Commits on top of base without moving any branch. */
  const commitOn = (repo: string, base: string, files: Record<string, string | null>, message: string): string => {
    git(repo, 'checkout', '-q', '--detach', base);
    return commit(repo, files, message);
  };

  /** Writes an executable file (a hook script) into a folder; commit it with commit() or leave it untracked. */
  const writeHook = (folder: string, file: string, script: string): void => {
    const target = path.join(folder, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, script, { mode: 0o755 });
    fs.chmodSync(target, 0o755);
  };

  beforeEach(() => {
    repos = [];
    extraDirs = [];
    catchRoots = [];
    envBackup = { ...process.env };
    // Catch roots, hook folders and repositories of one test all live in a private temp folder, so no test leaves
    // a qaspec-catch folder in the real temp directory.
    privateTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qaspec-catch-git-tmp-'));
    process.env.TMPDIR = privateTmp;
    process.env.TMP = privateTmp;
    process.env.TEMP = privateTmp;
  });

  afterEach(() => {
    for (const dir of [...catchRoots, ...repos, ...extraDirs]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envBackup);
    fs.rmSync(privateTmp, { recursive: true, force: true });
    gitFaults.maxBuffer = undefined;
    gitFaults.overflowKilled = false;
    gitFaults.afterWorktreeAdd = undefined;
  });

  describe('resolveRevisions', () => {
    it('resolves the approved head and base and returns their merge-base', async () => {
      const repo = createRepo();
      const ancestor = commit(repo, { 'a.txt': 'one\n' }, 'base commit');
      git(repo, 'checkout', '-q', '-b', 'feature');
      const head = commit(repo, { 'a.txt': 'two\n' }, 'pr commit');
      git(repo, 'checkout', '-q', 'main');
      const base = commit(repo, { 'b.txt': 'main moves on\n' }, 'main moves on');

      await expect(resolveRevisions({ projectRoot: repo, headSha: head, baseRef: 'main' })).resolves.toEqual({
        headSha: head,
        baseSha: base,
        parentSha: ancestor,
      });
    });

    it('returns the full commit id when the approved head is abbreviated', async () => {
      const repo = createRepo();
      const head = commit(repo, { 'a.txt': 'one\n' }, 'only commit');

      const abbreviated = head.slice(0, 10);

      await expect(
        resolveRevisions({ projectRoot: repo, headSha: abbreviated, baseRef: 'HEAD' })
      ).resolves.toMatchObject({ headSha: head });
    });

    it('reports an unknown approved head with the fetch and --head-sha hints', async () => {
      const repo = createRepo();
      commit(repo, { 'a.txt': 'one\n' }, 'only commit');
      const missing = 'f'.repeat(40);

      await expect(resolveRevisions({ projectRoot: repo, headSha: missing, baseRef: 'HEAD' })).rejects.toThrow(
        /is not a commit.*[Ff]etch.*--head-sha/
      );
    });

    it('reports an unknown base ref with the catch.baseRef and --base hints', async () => {
      const repo = createRepo();
      const head = commit(repo, { 'a.txt': 'one\n' }, 'only commit');

      await expect(resolveRevisions({ projectRoot: repo, headSha: head, baseRef: 'no-such-branch' })).rejects.toThrow(
        /no-such-branch.*catch\.baseRef.*--base/
      );
    });

    it('refuses refs that start with a dash', async () => {
      const repo = createRepo();
      const head = commit(repo, { 'a.txt': 'one\n' }, 'only commit');

      const dashedBase = '--output=elsewhere';

      await expect(resolveRevisions({ projectRoot: repo, headSha: head, baseRef: dashedBase })).rejects.toThrow(
        /start with "-"/
      );
      await expect(resolveRevisions({ projectRoot: repo, headSha: '-x', baseRef: 'HEAD' })).rejects.toThrow(
        /start with "-"/
      );
    });

    it('reports when the head and the base share no history', async () => {
      const repo = createRepo();
      commit(repo, { 'a.txt': 'main\n' }, 'main commit');
      git(repo, 'checkout', '-q', '--orphan', 'lonely');
      const lonely = commit(repo, { 'x.txt': 'x\n' }, 'unrelated commit');

      await expect(resolveRevisions({ projectRoot: repo, headSha: lonely, baseRef: 'main' })).rejects.toThrow(
        /no merge base/i
      );
    });

    it('ignores repository variables inherited from the parent environment', async () => {
      const repo = createRepo();
      const head = commit(repo, { 'a.txt': 'one\n' }, 'only commit');
      const elsewhere = createRepo();
      commit(elsewhere, { 'z.txt': 'z\n' }, 'other project');
      process.env.GIT_DIR = path.join(elsewhere, '.git');

      await expect(resolveRevisions({ projectRoot: repo, headSha: head, baseRef: 'HEAD' })).resolves.toMatchObject({
        headSha: head,
      });
    });
  });

  describe('changedFiles and diffPatch', () => {
    it('lists the changed files with their status and returns the patch between the revisions', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n', 'b.txt': 'b\n' }, 'parent');
      const head = commitOn(repo, parent, { 'a.txt': 'a2\n', 'b.txt': null, 'c.txt': 'c\n' }, 'head');

      await expect(changedFiles(repo, parent, head)).resolves.toEqual([
        { status: 'M', path: 'a.txt' },
        { status: 'D', path: 'b.txt' },
        { status: 'A', path: 'c.txt' },
      ]);

      const patch = await diffPatch(repo, parent, head);
      expect(patch).toContain('diff --git a/a.txt b/a.txt');
      expect(patch).toContain('deleted file mode 100644');
      expect(patch).toContain('+++ b/c.txt');
    });

    it('lists a renamed file as a deletion and an addition', async () => {
      const repo = createRepo();
      const content = 'same content on both sides of the rename\n';
      const parent = commit(repo, { 'old.txt': content }, 'parent');
      const head = commitOn(repo, parent, { 'old.txt': null, 'new.txt': content }, 'rename');

      // git lists entries in path order, so new.txt comes before old.txt.
      await expect(changedFiles(repo, parent, head)).resolves.toEqual([
        { status: 'A', path: 'new.txt' },
        { status: 'D', path: 'old.txt' },
      ]);
    });

    it('returns repository paths and a/ b/ prefixes whatever the user diff settings are', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'root.txt': 'r\n', 'app/x.txt': 'x\n' }, 'parent');
      const head = commit(repo, { 'root.txt': 'r2\n', 'app/x.txt': 'x2\n' }, 'head');
      git(repo, 'config', 'diff.relative', 'true');
      git(repo, 'config', 'diff.noprefix', 'true');
      git(repo, 'config', 'diff.srcPrefix', 'left/');
      git(repo, 'config', 'diff.dstPrefix', 'right/');
      git(repo, 'config', 'diff.mnemonicPrefix', 'true');
      // The project is a subfolder: relative output would drop root.txt and shorten every path.
      const app = path.join(repo, 'app');
      registerRoots(app);

      await expect(changedFiles(app, parent, head)).resolves.toEqual([
        { status: 'M', path: 'app/x.txt' },
        { status: 'M', path: 'root.txt' },
      ]);
      await expect(needsReinstall(app, parent, head, ['x.txt'])).resolves.toBe(true);
      const patch = await diffPatch(app, parent, head);
      expect(patch).toContain('diff --git a/root.txt b/root.txt');
      expect(patch).toContain('--- a/app/x.txt');
      expect(patch).toContain('+++ b/app/x.txt');
    });
  });

  describe('git runner', () => {
    it('runs no hook that setup plants in the catch root', async () => {
      const repo = createRepo();
      const dump = path.join(scratchDir(), 'hook-env.txt');
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const head = commit(repo, { 'a.txt': 'a2\n' }, 'head');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const source = path.join(scratchDir(), 'post-checkout');
      fs.writeFileSync(source, envDumpHook(dump), { mode: 0o755 });
      // The setup command runs in the worktree, so ../.no-hooks is the folder the catch root holds.
      const writeHookScript = [
        "const fs = require('node:fs');",
        "fs.mkdirSync('../.no-hooks', { recursive: true });",
        `fs.writeFileSync('../.no-hooks/post-checkout', fs.readFileSync('${source}'), { mode: 0o755 });`,
      ].join(' ');
      const plant = `${quote(NODE)} -e "${writeHookScript}"`;
      await expect(runSetup(repo, worktree, catchConfig({ commands: [plant] }))).resolves.toMatchObject({ ok: true });

      await switchRevision(repo, worktree, head);

      expect(fs.existsSync(dump)).toBe(false);
    });

    it('keeps no hook folder in the catch root after git runs', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');

      await createCatchWorktree(repo, RUN_ID, parent);

      expect(fs.existsSync(path.join(rootFor(repo), '.no-hooks'))).toBe(false);
    });

    it('gives each git call an empty hooks folder and removes it when the call returns', async () => {
      const repo = createRepo();
      const dump = path.join(scratchDir(), 'filter-env.txt');
      git(repo, 'config', 'filter.probe.smudge', `env > ${shellWord(dump)} && cat`);
      const parent = commit(repo, { '.gitattributes': '* filter=probe\n', 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const child = commit(repo, { 'a.txt': 'a2\n' }, 'child');

      await switchRevision(repo, worktree, child);

      const hooks = hooksPathSeenBy(dump);
      expect(path.dirname(hooks)).toBe(os.tmpdir());
      expect(path.basename(hooks)).toMatch(/^qaspec-no-hooks-/);
      expect(fs.existsSync(hooks)).toBe(false);
    });

    it('removes the hooks folder when git fails too', async () => {
      const repo = createRepo();
      const dump = path.join(scratchDir(), 'filter-env.txt');
      const parent = commit(repo, { '.gitattributes': '* filter=probe\n', 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const child = commit(repo, { 'a.txt': 'a2\n' }, 'child');
      // A required smudge filter that exits 1 fails the checkout after git has started with the call's hooks folder.
      // Its clean side is the identity: git runs the clean filter of a required filter during checkout as well.
      git(repo, 'config', 'filter.probe.clean', 'cat');
      git(repo, 'config', 'filter.probe.smudge', `env > ${shellWord(dump)} && exit 1`);
      git(repo, 'config', 'filter.probe.required', 'true');

      await expect(switchRevision(repo, worktree, child)).rejects.toThrow(/git checkout failed/);

      expect(fs.existsSync(hooksPathSeenBy(dump))).toBe(false);
    });

    it('reports output over the cap as an output limit', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'old\n' }, 'parent');
      const head = commitOn(repo, parent, { 'a.txt': 'new line\n'.repeat(500) }, 'head');
      gitFaults.maxBuffer = 1024;

      await expect(diffPatch(repo, parent, head)).rejects.toThrow(/output is larger than/);
    });

    it('reports output over the cap as an output limit even when the error is also flagged as killed', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'old\n' }, 'parent');
      const head = commitOn(repo, parent, { 'a.txt': 'new line\n'.repeat(500) }, 'head');
      gitFaults.maxBuffer = 1024;
      gitFaults.overflowKilled = true;

      await expect(diffPatch(repo, parent, head)).rejects.toThrow(/output is larger than/);
    });
  });

  describe('createCatchWorktree', () => {
    it('creates the worktree outside the project at the documented root, detached at the parent', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const head = commitOn(repo, parent, { 'a.txt': 'a2\n' }, 'head');

      const worktree = await createCatchWorktree(repo, RUN_ID, parent);

      expect(worktree).toBe(path.join(rootFor(repo), RUN_ID));
      expect(fs.existsSync(path.join(worktree, 'a.txt'))).toBe(true);
      expect(git(worktree, 'rev-parse', 'HEAD')).toBe(parent);
      expect(git(worktree, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD');
      expect(git(repo, 'worktree', 'list', '--porcelain')).toContain(`worktree ${fs.realpathSync(worktree)}`);
      expect(git(repo, 'rev-parse', 'HEAD')).toBe(head);
    });

    it('refuses run ids that could leave the catch root', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');

      await expect(createCatchWorktree(repo, '../escape', parent)).rejects.toThrow(/run id/);
      expect(fs.existsSync(path.join(rootFor(repo), '..', 'escape'))).toBe(false);
    });

    it('maps a symlinked spelling of the project to the same catch root', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const link = path.join(scratchDir(), 'project-link');
      fs.symlinkSync(repo, link);
      registerRoots(link);

      const viaLink = await createCatchWorktree(link, RUN_ID, parent);
      const viaRepo = await createCatchWorktree(repo, OTHER_RUN_ID, parent);

      expect(path.dirname(viaLink)).toBe(rootFor(repo));
      expect(path.dirname(viaRepo)).toBe(rootFor(repo));
    });

    it('runs no committed hook while the worktree is created', async () => {
      const repo = createRepo();
      const dump = path.join(scratchDir(), 'hook-env.txt');
      git(repo, 'config', 'core.hooksPath', '.githooks');
      writeHook(repo, '.githooks/post-checkout', envDumpHook(dump));
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent carries the hook');

      await createCatchWorktree(repo, RUN_ID, parent);

      expect(fs.existsSync(dump)).toBe(false);
    });
  });

  describe('catch root folders', () => {
    it.skipIf(windows)('creates the shared and the project catch folders with mode 0700', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');

      await createCatchWorktree(repo, RUN_ID, parent);

      expect(fs.statSync(path.dirname(rootFor(repo))).mode & 0o777).toBe(0o700);
      expect(fs.statSync(rootFor(repo)).mode & 0o777).toBe(0o700);
    });

    it.skipIf(windows)('refuses a catch root that is a symbolic link, and writes nothing through it', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const target = scratchDir();
      fs.mkdirSync(path.dirname(rootFor(repo)), { mode: 0o700 });
      fs.symlinkSync(target, rootFor(repo));

      const message = await messageOf(createCatchWorktree(repo, RUN_ID, parent));

      expect(message).toContain(rootFor(repo));
      expect(message).toMatch(/symbolic link/);
      expect(fs.readdirSync(target)).toEqual([]);
    });

    it.skipIf(windows)('refuses a catch root that group or others can write to', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      fs.mkdirSync(rootFor(repo), { recursive: true });
      fs.chmodSync(rootFor(repo), 0o777);

      const message = await messageOf(createCatchWorktree(repo, RUN_ID, parent));

      expect(message).toContain(rootFor(repo));
      expect(message).toMatch(/group or others/);
      expect(fs.readdirSync(rootFor(repo))).toEqual([]);
    });

    it.skipIf(windows)('refuses a catch root that another user owns', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      fs.mkdirSync(rootFor(repo), { recursive: true, mode: 0o700 });
      // Handing a folder to another user needs root privileges, so the current user is made a different one.
      const current = process.getuid!();
      const spy = vi.spyOn(process, 'getuid').mockReturnValue(current + 1);
      try {
        await expect(messageOf(createCatchWorktree(repo, RUN_ID, parent))).resolves.toMatch(/owned by another user/);
      } finally {
        spy.mockRestore();
      }
    });

    it.skipIf(windows)('refuses the shared qaspec-catch folder when it is a symbolic link', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const shared = path.dirname(rootFor(repo));
      fs.symlinkSync(scratchDir(), shared);

      const message = await messageOf(createCatchWorktree(repo, RUN_ID, parent));

      expect(message).toContain(shared);
      expect(message).toMatch(/symbolic link/);
    });
  });

  describe('createCatchWorktree rollback', () => {
    /** The path git lists for a run folder of this project: the real temp directory, the root, then the run id. */
    const listedAs = (repo: string, runId: string): string =>
      path.join(fs.realpathSync(os.tmpdir()), 'qaspec-catch', path.basename(rootFor(repo)), runId);

    it('removes the folder and its git record when worktree add is killed after it created them', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      gitFaults.afterWorktreeAdd = 'unlinked';

      await expect(createCatchWorktree(repo, RUN_ID, parent)).rejects.toThrow(/timed out/);

      expect(fs.existsSync(path.join(rootFor(repo), RUN_ID))).toBe(false);
      expect(git(repo, 'worktree', 'list', '--porcelain')).not.toContain(`worktree ${listedAs(repo, RUN_ID)}`);
      expect(fs.existsSync(rootFor(repo))).toBe(false);
    });

    it('removes a complete worktree that worktree add left behind before it reported the failure', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      gitFaults.afterWorktreeAdd = 'linked';

      await expect(createCatchWorktree(repo, RUN_ID, parent)).rejects.toThrow(/timed out/);

      expect(fs.existsSync(path.join(rootFor(repo), RUN_ID))).toBe(false);
      expect(git(repo, 'worktree', 'list', '--porcelain')).not.toContain(`worktree ${listedAs(repo, RUN_ID)}`);
    });

    it('removes only its own record and keeps an unrelated worktree whose folder is missing', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const unrelated = await createCatchWorktree(repo, OTHER_RUN_ID, parent);
      const unrelatedListed = fs.realpathSync(unrelated);
      fs.rmSync(unrelated, { recursive: true, force: true });
      gitFaults.afterWorktreeAdd = 'unlinked';

      await expect(createCatchWorktree(repo, RUN_ID, parent)).rejects.toThrow(/timed out/);

      expect(git(repo, 'worktree', 'list', '--porcelain')).toContain(`worktree ${unrelatedListed}`);
    });

    it('leaves no catch folder behind when worktree add refuses the parent', async () => {
      const repo = createRepo();
      commit(repo, { 'a.txt': 'a\n' }, 'parent');

      await expect(createCatchWorktree(repo, RUN_ID, 'f'.repeat(40))).rejects.toThrow(/invalid reference/);

      expect(fs.existsSync(path.dirname(rootFor(repo)))).toBe(false);
    });
  });

  describe('switchRevision', () => {
    it('removes untracked files that are not ignored and keeps ignored dependency folders', async () => {
      const repo = createRepo();
      const parent = commit(
        repo,
        { '.gitignore': 'node_modules/\n', 'a.txt': 'a\n', 'package-lock.json': '{"v":1}\n' },
        'parent'
      );
      const child = commitOn(repo, parent, { 'a.txt': 'a2\n' }, 'child');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      fs.writeFileSync(path.join(worktree, 'a.txt'), 'leftover\n');
      fs.writeFileSync(path.join(worktree, 'generated.test.ts'), 'test\n');
      fs.mkdirSync(path.join(worktree, 'node_modules', 'pkg'), { recursive: true });
      fs.writeFileSync(path.join(worktree, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;\n');

      await switchRevision(repo, worktree, child);

      expect(git(worktree, 'rev-parse', 'HEAD')).toBe(child);
      expect(fs.readFileSync(path.join(worktree, 'a.txt'), 'utf8')).toBe('a2\n');
      expect(fs.existsSync(path.join(worktree, 'generated.test.ts'))).toBe(false);
      expect(fs.existsSync(path.join(worktree, 'node_modules', 'pkg', 'index.js'))).toBe(true);
    });

    it('refuses to switch a checkout outside the catch root and leaves it untouched', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const child = commit(repo, { 'a.txt': 'a2\n' }, 'child');
      fs.writeFileSync(path.join(repo, 'user-untracked.txt'), 'mine\n');

      await expect(switchRevision(repo, repo, parent)).rejects.toThrow(/outside the catch/);

      expect(git(repo, 'rev-parse', 'HEAD')).toBe(child);
      expect(fs.existsSync(path.join(repo, 'user-untracked.txt'))).toBe(true);
    });

    it('runs no hook that the PR commits behind a relative core.hooksPath', async () => {
      const repo = createRepo();
      const dump = path.join(scratchDir(), 'hook-env.txt');
      git(repo, 'config', 'core.hooksPath', '.githooks');
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      writeHook(repo, '.githooks/post-checkout', envDumpHook(dump));
      const head = commit(repo, { 'a.txt': 'a2\n' }, 'head adds a hook');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);

      await switchRevision(repo, worktree, head);

      expect(fs.existsSync(dump)).toBe(false);
      expect(git(worktree, 'rev-parse', 'HEAD')).toBe(head);
    });

    it('runs no hook file that appears in the worktree before the switch', async () => {
      const repo = createRepo();
      const dump = path.join(scratchDir(), 'hook-env.txt');
      git(repo, 'config', 'core.hooksPath', '.githooks');
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const head = commit(repo, { 'a.txt': 'a2\n' }, 'head');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      writeHook(worktree, '.githooks/post-checkout', envDumpHook(dump));

      await switchRevision(repo, worktree, head);

      expect(fs.existsSync(dump)).toBe(false);
    });

    it('runs no husky v9 hook that setup leaves in .husky/_', async () => {
      const repo = createRepo();
      const dump = path.join(scratchDir(), 'hook-env.txt');
      git(repo, 'config', 'core.hooksPath', '.husky/_');
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const head = commit(repo, { 'a.txt': 'a2\n' }, 'head');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      writeHook(worktree, '.husky/_/post-checkout', envDumpHook(dump));
      // Husky v9 ignores its own shim folder through a .gitignore holding a single star.
      fs.writeFileSync(path.join(worktree, '.husky', '_', '.gitignore'), '*\n');

      await switchRevision(repo, worktree, head);

      expect(fs.existsSync(dump)).toBe(false);
    });

    it('gives git only the allowlisted environment, so no token reaches a process git starts', async () => {
      process.env.GH_TOKEN = 'ghp_fake_git_token';
      process.env.NPM_TOKEN = 'npm_fake_git_token';
      const xdg = path.join(scratchDir(), 'xdg');
      process.env.XDG_CONFIG_HOME = xdg;
      const repo = createRepo();
      const dump = path.join(scratchDir(), 'filter-env.txt');
      // A smudge filter is a process git starts itself, so it shows the environment git passes on.
      git(repo, 'config', 'filter.probe.smudge', `env > ${shellWord(dump)} && cat`);
      const parent = commit(repo, { '.gitattributes': '* filter=probe\n', 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const child = commit(repo, { 'a.txt': 'a2\n' }, 'child');

      await switchRevision(repo, worktree, child);

      const seen = fs.readFileSync(dump, 'utf8');
      expect(seen).toMatch(/^PATH=/m);
      expect(seen).toContain(`XDG_CONFIG_HOME=${xdg}`);
      expect(seen).not.toMatch(/GH_TOKEN|NPM_TOKEN|ghp_fake|npm_fake/);
    });

    it('refuses a nested .git that points at the user repository', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const child = commit(repo, { 'a.txt': 'a2\n' }, 'child');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const nested = path.join(worktree, 'nested');
      fs.mkdirSync(nested);
      fs.writeFileSync(path.join(nested, '.git'), `gitdir: ${path.join(repo, '.git')}\n`);
      fs.writeFileSync(path.join(nested, 'a.txt'), 'nested\n');

      await expect(switchRevision(repo, nested, parent)).rejects.toThrow(/not a run folder/);

      expect(git(repo, 'rev-parse', 'HEAD')).toBe(child);
    });

    it('refuses a plain folder or a repository at the run path', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const root = path.dirname(worktree);
      const plain = path.join(root, OTHER_RUN_ID);
      fs.mkdirSync(plain);
      const bare = path.join(root, 'repo-run');
      fs.mkdirSync(bare);
      git(bare, 'init', '-q');

      await expect(switchRevision(repo, plain, parent)).rejects.toThrow(/not a catch worktree/);
      await expect(switchRevision(repo, bare, parent)).rejects.toThrow(/not a catch worktree/);
    });

    it("refuses another project's worktree at this project's run path", async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      await createCatchWorktree(repo, RUN_ID, parent);
      const other = createRepo();
      const otherBase = commit(other, { 'b.txt': 'b\n' }, 'other base');
      const otherHead = commit(other, { 'b.txt': 'b2\n' }, 'other head');
      const runPath = path.join(path.dirname(path.join(rootFor(repo), RUN_ID)), OTHER_RUN_ID);
      git(other, 'worktree', 'add', '--detach', runPath, otherBase);

      await expect(switchRevision(repo, runPath, otherHead)).rejects.toThrow(/not a catch worktree of this project/);

      expect(git(runPath, 'rev-parse', 'HEAD')).toBe(otherBase);
    });

    it("refuses a run folder whose .git points at another run's worktree record in this repository", async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const child = commit(repo, { 'a.txt': 'a2\n' }, 'child');
      const otherRun = await createCatchWorktree(repo, OTHER_RUN_ID, parent);
      const run = path.join(path.dirname(otherRun), RUN_ID);
      fs.mkdirSync(run);
      // Same repository, so the record is in the right place, but git records otherRun as that record's folder.
      fs.copyFileSync(path.join(otherRun, '.git'), path.join(run, '.git'));

      await expect(switchRevision(repo, run, child)).rejects.toThrow(/not a catch worktree of this project/);

      expect(git(otherRun, 'rev-parse', 'HEAD')).toBe(parent);
    });
  });

  describe('needsReinstall', () => {
    it('is true only when a listed path differs between the parent and the child', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'package-lock.json': 'v1\n', 'src/index.ts': 'a\n' }, 'parent');
      const lockChild = commitOn(repo, parent, { 'package-lock.json': 'v2\n' }, 'lock changed');
      const sourceChild = commitOn(repo, parent, { 'src/index.ts': 'b\n' }, 'source only');

      await expect(needsReinstall(repo, parent, lockChild, ['package-lock.json'])).resolves.toBe(true);
      await expect(needsReinstall(repo, parent, sourceChild, ['package-lock.json'])).resolves.toBe(false);
    });

    it('is always true when no paths are listed', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'src/index.ts': 'a\n' }, 'parent');

      await expect(needsReinstall(repo, parent, parent, [])).resolves.toBe(true);
    });
  });

  describe('removeCatchWorktree', () => {
    it('removes the worktree folder and prunes its record', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const listed = fs.realpathSync(worktree);

      await removeCatchWorktree(repo, worktree);

      expect(fs.existsSync(worktree)).toBe(false);
      expect(git(repo, 'worktree', 'list', '--porcelain')).not.toContain(`worktree ${listed}`);
    });

    it('prunes the record of a worktree whose folder was already deleted', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const listed = fs.realpathSync(worktree);
      fs.rmSync(worktree, { recursive: true, force: true });

      await expect(removeCatchWorktree(repo, worktree)).resolves.toBeUndefined();

      expect(git(repo, 'worktree', 'list', '--porcelain')).not.toContain(`worktree ${listed}`);
    });

    it('keeps the record of an unrelated worktree whose folder is missing after a normal remove', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const mine = await createCatchWorktree(repo, RUN_ID, parent);
      const unrelated = await createCatchWorktree(repo, OTHER_RUN_ID, parent);
      const unrelatedListed = fs.realpathSync(unrelated);
      fs.rmSync(unrelated, { recursive: true, force: true });

      await removeCatchWorktree(repo, mine);

      expect(git(repo, 'worktree', 'list', '--porcelain')).toContain(`worktree ${unrelatedListed}`);
    });

    it('deletes the project catch folder with its last run folder and keeps it while another run remains', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const first = await createCatchWorktree(repo, RUN_ID, parent);
      const second = await createCatchWorktree(repo, OTHER_RUN_ID, parent);
      const root = path.dirname(first);

      await removeCatchWorktree(repo, first);
      expect(fs.existsSync(root)).toBe(true);

      await removeCatchWorktree(repo, second);
      expect(fs.existsSync(root)).toBe(false);
    });

    it('refuses to remove a nested .git or another project worktree, and leaves both alone', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const nested = path.join(worktree, 'nested');
      fs.mkdirSync(nested);
      fs.writeFileSync(path.join(nested, '.git'), `gitdir: ${path.join(repo, '.git')}\n`);
      const other = createRepo();
      const otherBase = commit(other, { 'b.txt': 'b\n' }, 'other base');
      const runPath = path.join(path.dirname(worktree), OTHER_RUN_ID);
      git(other, 'worktree', 'add', '--detach', runPath, otherBase);

      await expect(removeCatchWorktree(repo, nested)).rejects.toThrow(/not a run folder/);
      await expect(removeCatchWorktree(repo, runPath)).rejects.toThrow(/not a catch worktree of this project/);

      expect(fs.existsSync(path.join(nested, '.git'))).toBe(true);
      expect(git(runPath, 'rev-parse', 'HEAD')).toBe(otherBase);
      expect(git(repo, 'rev-parse', 'HEAD')).toBe(parent);
    });

    it('removes the shared qaspec-catch folder only with its last project root', async () => {
      const repo = createRepo();
      const other = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const otherParent = commit(other, { 'b.txt': 'b\n' }, 'other parent');
      const first = await createCatchWorktree(repo, RUN_ID, parent);
      const second = await createCatchWorktree(other, RUN_ID, otherParent);
      const shared = path.dirname(path.dirname(first));

      await removeCatchWorktree(repo, first);
      expect(fs.existsSync(shared)).toBe(true);

      await removeCatchWorktree(other, second);
      expect(fs.existsSync(shared)).toBe(false);
    });

    it('never removes a shared qaspec-catch folder that holds anything else', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const shared = path.dirname(path.dirname(worktree));
      fs.writeFileSync(path.join(shared, 'notes.txt'), 'not ours\n');

      await removeCatchWorktree(repo, worktree);

      expect(fs.existsSync(path.dirname(worktree))).toBe(false);
      expect(fs.readFileSync(path.join(shared, 'notes.txt'), 'utf8')).toBe('not ours\n');
    });

    it('refuses a path outside the catch root, including a sibling that shares its prefix', async () => {
      const repo = createRepo();
      commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const sibling = path.join(`${rootFor(repo)}-other`, RUN_ID);
      extraDirs.push(`${rootFor(repo)}-other`);
      fs.mkdirSync(sibling, { recursive: true });

      await expect(removeCatchWorktree(repo, repo)).rejects.toThrow(/outside/);
      await expect(removeCatchWorktree(repo, sibling)).rejects.toThrow(/outside/);

      expect(fs.existsSync(path.join(repo, 'a.txt'))).toBe(true);
      expect(fs.existsSync(sibling)).toBe(true);
    });
  });

  describe('buildChildEnv', () => {
    it('keeps only the built-in essentials and drops other variables such as GH_TOKEN', () => {
      const parentEnv = {
        PATH: '/usr/bin:/bin',
        HOME: '/home/dev',
        LANG: 'en_US.UTF-8',
        GH_TOKEN: 'ghp_fake_parent_token',
        NPM_TOKEN: 'npm_fake_parent_token',
      };

      expect(buildChildEnv(undefined, parentEnv)).toEqual({
        PATH: '/usr/bin:/bin',
        HOME: '/home/dev',
        LANG: 'en_US.UTF-8',
      });
    });

    it('adds env.inherit names that are set in the parent and skips the ones that are not', () => {
      const config: CatchConfig = { env: { inherit: ['CI', 'ABSENT_NAME'] } };

      expect(buildChildEnv(config, { PATH: '/bin', CI: 'true' })).toEqual({ PATH: '/bin', CI: 'true' });
    });

    it('lets env.set win over the parent value and adds names the parent does not have', () => {
      const config: CatchConfig = { env: { inherit: ['CI'], set: { CI: 'false', TZ: 'America/Chicago' } } };

      expect(buildChildEnv(config, { PATH: '/bin', CI: 'true' })).toEqual({
        PATH: '/bin',
        CI: 'false',
        TZ: 'America/Chicago',
      });
    });

    it('accepts a parsed catch block as well as the raw config type', () => {
      const parsed = catchConfig({ commands: ['true'] });
      parsed.env = { inherit: ['CI'], set: { TZ: 'UTC' } };

      expect(buildChildEnv(parsed, { PATH: '/bin', CI: 'true', GH_TOKEN: 'ghp_fake' })).toEqual({
        PATH: '/bin',
        CI: 'true',
        TZ: 'UTC',
      });
    });
  });

  describe('runSetup', () => {
    it('runs the setup commands in order inside the worktree', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const commands = [
        `${quote(NODE)} -e "require('node:fs').appendFileSync('log.txt', 'first;')"`,
        `${quote(NODE)} -e "require('node:fs').appendFileSync('log.txt', 'second;' + process.cwd() + ';')"`,
      ];

      const result = await runSetup(repo, worktree, catchConfig({ commands }));

      expect(result).toEqual({
        ok: true,
        commands: [
          { command: commands[0], exitCode: 0, durationMs: expect.any(Number), timedOut: false, outputTail: '' },
          { command: commands[1], exitCode: 0, durationMs: expect.any(Number), timedOut: false, outputTail: '' },
        ],
      });
      expect(fs.readFileSync(path.join(worktree, 'log.txt'), 'utf8')).toBe(
        `first;second;${fs.realpathSync(worktree)};`
      );
    });

    it('gives setup commands only the built environment, so a parent token is not visible', async () => {
      process.env.GH_TOKEN = 'ghp_fake_setup_token';
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const writeToken = "require('node:fs').writeFileSync('token.txt', process.env.GH_TOKEN || 'absent')";
      const command = `${quote(NODE)} -e "${writeToken}"`;

      const result = await runSetup(repo, worktree, catchConfig({ commands: [command] }));

      expect(result.ok).toBe(true);
      expect(fs.readFileSync(path.join(worktree, 'token.txt'), 'utf8')).toBe('absent');
    });

    it('stops at the first failing command and does not run the rest', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const commands = [
        `${quote(NODE)} -e "process.exit(3)"`,
        `${quote(NODE)} -e "require('node:fs').writeFileSync('after.txt', 'ran')"`,
      ];

      const result = await runSetup(repo, worktree, catchConfig({ commands }));

      expect(result.ok).toBe(false);
      expect(result.commands).toEqual([
        { command: commands[0], exitCode: 3, durationMs: expect.any(Number), timedOut: false, outputTail: '' },
      ]);
      expect(fs.existsSync(path.join(worktree, 'after.txt'))).toBe(false);
    });

    it('reports a command that exceeds the setup timeout', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const command = `${quote(NODE)} -e "setTimeout(() => {}, 60000)"`;

      const result = await runSetup(repo, worktree, catchConfig({ commands: [command], timeoutSeconds: 1 }));

      expect(result.ok).toBe(false);
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toMatchObject({ command, timedOut: true });
    });

    it('keeps the whole output of a short command for diagnostics', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const hello = `${quote(NODE)} -e "console.log('hello from setup')"`;

      const result = await runSetup(repo, worktree, catchConfig({ commands: [hello] }));

      expect(result.commands[0]).toMatchObject({ outputTail: 'hello from setup\n' });
    });

    it('keeps only the last 4 KiB of a long command output', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const noisy = `${quote(NODE)} -e "process.stdout.write('x'.repeat(20000) + 'END-OF-OUTPUT\\n')"`;

      const result = await runSetup(repo, worktree, catchConfig({ commands: [noisy] }));

      const tail = result.commands[0].outputTail;
      expect(tail.endsWith('END-OF-OUTPUT\n')).toBe(true);
      expect(Buffer.byteLength(tail)).toBeLessThanOrEqual(4 * 1024);
      expect(Buffer.byteLength(tail)).toBeGreaterThan(4 * 1024 - 64);
    });

    it('keeps the tail on a character boundary, so it never starts with part of a character', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      // Two bytes per character and one trailing byte: the 4 KiB cut lands inside a character.
      const accented = `${quote(NODE)} -e "process.stdout.write('é'.repeat(3000) + 'x')"`;

      const result = await runSetup(repo, worktree, catchConfig({ commands: [accented] }));

      const tail = result.commands[0].outputTail;
      expect(tail.endsWith('x')).toBe(true);
      expect(tail.startsWith('é')).toBe(true);
      expect(tail).not.toContain('�');
      expect(Buffer.byteLength(tail)).toBeLessThanOrEqual(4 * 1024);
    });

    it('includes stderr next to stdout in the tail', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const both = `${quote(NODE)} -e "console.log('out-line'); console.error('err-line')"`;

      const result = await runSetup(repo, worktree, catchConfig({ commands: [both] }));

      expect(result.commands[0].outputTail).toContain('out-line');
      expect(result.commands[0].outputTail).toContain('err-line');
    });

    it('refuses a worktree that is nested inside another checkout, for setup too', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const nested = path.join(worktree, 'nested');
      fs.mkdirSync(nested);
      fs.writeFileSync(path.join(nested, '.git'), `gitdir: ${path.join(repo, '.git')}\n`);
      const marker = path.join(scratchDir(), 'setup-ran.txt');
      const command = `${quote(NODE)} -e "require('node:fs').writeFileSync('${marker}', 'ran')"`;

      await expect(runSetup(repo, nested, catchConfig({ commands: [command] }))).rejects.toThrow(/not a run folder/);

      expect(fs.existsSync(marker)).toBe(false);
    });

    it('reports the project prefix of a subfolder project and of the checkout root', async () => {
      const repo = createRepo();
      const app = path.join(repo, 'packages', 'app');
      commit(repo, { 'packages/app/package.json': '{}\n' }, 'parent');
      registerRoots(app);

      await expect(projectPrefix(app)).resolves.toBe('packages/app');
      await expect(projectPrefix(repo)).resolves.toBe('');
    });

    it('runs setup in the project folder inside the worktree', async () => {
      const repo = createRepo();
      const app = path.join(repo, 'packages', 'app');
      const parent = commit(repo, { 'packages/app/package.json': '{}\n' }, 'parent');
      registerRoots(app);
      const worktree = await createCatchWorktree(app, RUN_ID, parent);
      const command = `${quote(NODE)} -e "require('node:fs').writeFileSync('where.txt', process.cwd())"`;

      const result = await runSetup(app, worktree, catchConfig({ commands: [command] }), 'packages/app');

      expect(result.ok).toBe(true);
      const folder = path.join(worktree, 'packages', 'app');
      expect(fs.readFileSync(path.join(folder, 'where.txt'), 'utf8')).toBe(fs.realpathSync(folder));
      expect(fs.existsSync(path.join(worktree, 'where.txt'))).toBe(false);
    });

    it('refuses a project folder that is absolute, climbs out, leaves through a symlink, or is missing', async () => {
      const repo = createRepo();
      const outside = scratchDir();
      const marker = path.join(outside, 'ran.txt');
      fs.symlinkSync(outside, path.join(repo, 'escape'));
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent with a link out of the checkout');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const command = `${quote(NODE)} -e "require('node:fs').writeFileSync('${marker}', 'ran')"`;

      for (const prefix of [path.join(outside), '../outside', 'escape', 'escape/nested', 'missing/dir']) {
        await expect(runSetup(repo, worktree, catchConfig({ commands: [command] }), prefix)).rejects.toThrow(
          /project folder/i
        );
      }
      expect(fs.existsSync(marker)).toBe(false);
    });
  });
});
