import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CatchConfig } from '../../src/core/catch-config.js';
import {
  buildChildEnv,
  changedFiles,
  createCatchWorktree,
  diffPatch,
  needsReinstall,
  removeCatchWorktree,
  resolveRevisions,
  runSetup,
  switchRevision,
} from '../../src/core/catch-git.js';

const NODE = process.execPath;
const RUN_ID = '20261019T120000Z-a1b2c3';
const quote = (value: string) => JSON.stringify(value);

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

describe('catch-git', () => {
  let repos: string[];
  let extraDirs: string[];
  let envBackup: NodeJS.ProcessEnv;

  /** A repository in the OS temp directory with a local identity, unsigned commits and no hooks. */
  const createRepo = (): string => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'qaspec-catch-git-'));
    repos.push(repo);
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

  /** The documented catch root for a project: <tmpdir>/qaspec-catch/<first 12 hex of sha256(projectRoot)>. */
  const rootFor = (repo: string): string => {
    const hash = createHash('sha256').update(repo).digest('hex').slice(0, 12);
    return path.join(os.tmpdir(), 'qaspec-catch', hash);
  };

  beforeEach(() => {
    repos = [];
    extraDirs = [];
    envBackup = { ...process.env };
  });

  afterEach(() => {
    for (const repo of repos) {
      fs.rmSync(rootFor(repo), { recursive: true, force: true });
      fs.rmSync(repo, { recursive: true, force: true });
    }
    for (const dir of extraDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    try {
      // Removes the shared parent only when it is empty; other projects' roots are never touched.
      fs.rmdirSync(path.join(os.tmpdir(), 'qaspec-catch'));
    } catch {
      // Not empty, or already gone.
    }
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, envBackup);
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

      await switchRevision(worktree, child);

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

      await expect(switchRevision(repo, parent)).rejects.toThrow(/outside the catch/);

      expect(git(repo, 'rev-parse', 'HEAD')).toBe(child);
      expect(fs.existsSync(path.join(repo, 'user-untracked.txt'))).toBe(true);
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

      const result = await runSetup(worktree, { setup: { commands } });

      expect(result).toEqual({
        ok: true,
        commands: [
          { command: commands[0], exitCode: 0, durationMs: expect.any(Number), timedOut: false },
          { command: commands[1], exitCode: 0, durationMs: expect.any(Number), timedOut: false },
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

      const result = await runSetup(worktree, { setup: { commands: [command] } });

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

      const result = await runSetup(worktree, { setup: { commands } });

      expect(result.ok).toBe(false);
      expect(result.commands).toEqual([
        { command: commands[0], exitCode: 3, durationMs: expect.any(Number), timedOut: false },
      ]);
      expect(fs.existsSync(path.join(worktree, 'after.txt'))).toBe(false);
    });

    it('reports a command that exceeds the setup timeout', async () => {
      const repo = createRepo();
      const parent = commit(repo, { 'a.txt': 'a\n' }, 'parent');
      const worktree = await createCatchWorktree(repo, RUN_ID, parent);
      const command = `${quote(NODE)} -e "setTimeout(() => {}, 60000)"`;

      const result = await runSetup(worktree, { setup: { commands: [command], timeoutSeconds: 1 } });

      expect(result.ok).toBe(false);
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toMatchObject({ command, timedOut: true });
    });
  });
});
