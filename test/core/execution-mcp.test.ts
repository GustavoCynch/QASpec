import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  PLAYWRIGHT_MCP_PACKAGE,
  QASPEC_PLAYWRIGHT_MCP_SERVER,
  formatExecutionMcpResult,
  syncExecutionMcpEntries,
} from '../../src/core/execution-mcp.js';

const EXECUTION_CONFIG = `schema: qaspec-pr-review
execution:
  app:
    url: https://app.example.test
  auth:
    envFile: .env.qa
    loginScript: scripts/login.mjs
    storageState: .qaspec/auth/storage-state.json
  network:
    blockedOrigins:
      - https://production.example.test
      - https://payments.example.test
`;

describe('execution-mcp', () => {
  let projectRoot: string;

  const write = async (relativePath: string, content: string) => {
    const target = path.join(projectRoot, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  };
  const readJson = async (relativePath: string) =>
    JSON.parse(await fs.readFile(path.join(projectRoot, relativePath), 'utf-8'));

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qaspec-execution-mcp-'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('writes the Playwright server for Claude Code with a project-root path and blocked origins', async () => {
    await write(path.join('qaspec', 'config.yaml'), EXECUTION_CONFIG);

    const results = await syncExecutionMcpEntries(projectRoot, ['claude']);

    expect(results).toEqual([{ toolId: 'claude', file: '.mcp.json', status: 'written' }]);
    expect(await readJson('.mcp.json')).toEqual({
      mcpServers: {
        [QASPEC_PLAYWRIGHT_MCP_SERVER]: {
          command: 'npx',
          args: [
            '-y',
            PLAYWRIGHT_MCP_PACKAGE,
            '--isolated',
            '--storage-state',
            '${CLAUDE_PROJECT_DIR:-.}/.qaspec/auth/storage-state.json',
            '--blocked-origins',
            'https://production.example.test;https://payments.example.test',
          ],
        },
      },
    });
  });

  it('writes the Playwright server for Cursor under .cursor with the workspace folder path', async () => {
    await write(path.join('qaspec', 'config.yaml'), EXECUTION_CONFIG);

    const results = await syncExecutionMcpEntries(projectRoot, ['cursor']);

    expect(results).toEqual([
      { toolId: 'cursor', file: path.join('.cursor', 'mcp.json'), status: 'written' },
    ]);
    const server = (await readJson(path.join('.cursor', 'mcp.json'))).mcpServers[QASPEC_PLAYWRIGHT_MCP_SERVER];
    expect(server.args).toContain('${workspaceFolder}/.qaspec/auth/storage-state.json');
  });

  it('starts an isolated browser only when there is no session or blocked origin to pass', async () => {
    await write(
      path.join('qaspec', 'config.yaml'),
      `schema: qaspec-pr-review
execution:
  app:
    url: https://app.example.test
`
    );

    await syncExecutionMcpEntries(projectRoot, ['claude']);

    expect((await readJson('.mcp.json')).mcpServers[QASPEC_PLAYWRIGHT_MCP_SERVER].args).toEqual([
      '-y',
      PLAYWRIGHT_MCP_PACKAGE,
      '--isolated',
    ]);
  });

  it('keeps other servers and top-level keys of an existing file', async () => {
    await write(path.join('qaspec', 'config.yaml'), EXECUTION_CONFIG);
    await write(
      '.mcp.json',
      JSON.stringify({ mcpServers: { github: { command: 'gh-mcp' } }, note: 'team file' })
    );

    await syncExecutionMcpEntries(projectRoot, ['claude']);

    const file = await readJson('.mcp.json');
    expect(file.note).toBe('team file');
    expect(file.mcpServers.github).toEqual({ command: 'gh-mcp' });
    expect(file.mcpServers[QASPEC_PLAYWRIGHT_MCP_SERVER].command).toBe('npx');
  });

  it('leaves the file untouched when the entry is already current', async () => {
    await write(path.join('qaspec', 'config.yaml'), EXECUTION_CONFIG);
    await syncExecutionMcpEntries(projectRoot, ['claude']);
    const before = await fs.readFile(path.join(projectRoot, '.mcp.json'), 'utf-8');
    await write('.mcp.json', before.replace(/\n$/, ''));

    const results = await syncExecutionMcpEntries(projectRoot, ['claude']);

    expect(results).toEqual([]);
    expect(await fs.readFile(path.join(projectRoot, '.mcp.json'), 'utf-8')).toBe(before.replace(/\n$/, ''));
  });

  it('removes only its own server when the execution block is gone', async () => {
    await write(path.join('qaspec', 'config.yaml'), 'schema: qaspec-pr-review\n');
    await write(
      '.mcp.json',
      JSON.stringify({
        mcpServers: { github: { command: 'gh-mcp' }, [QASPEC_PLAYWRIGHT_MCP_SERVER]: { command: 'npx' } },
      })
    );

    const results = await syncExecutionMcpEntries(projectRoot, ['claude']);

    expect(results).toEqual([{ toolId: 'claude', file: '.mcp.json', status: 'removed' }]);
    expect(await readJson('.mcp.json')).toEqual({ mcpServers: { github: { command: 'gh-mcp' } } });
  });

  it('creates no file when there is no execution block', async () => {
    await write(path.join('qaspec', 'config.yaml'), 'schema: qaspec-pr-review\n');

    const results = await syncExecutionMcpEntries(projectRoot, ['claude', 'cursor']);

    expect(results).toEqual([]);
    expect(existsSync(path.join(projectRoot, '.mcp.json'))).toBe(false);
    expect(existsSync(path.join(projectRoot, '.cursor', 'mcp.json'))).toBe(false);
  });

  it('does not touch a file that is not valid JSON or has no mcpServers object', async () => {
    await write(path.join('qaspec', 'config.yaml'), EXECUTION_CONFIG);
    await write('.mcp.json', '{ "mcpServers": { broken');
    await write(path.join('.cursor', 'mcp.json'), JSON.stringify({ mcpServers: [] }));

    const results = await syncExecutionMcpEntries(projectRoot, ['claude', 'cursor']);

    expect(results).toEqual([
      { toolId: 'claude', file: '.mcp.json', status: 'invalid' },
      { toolId: 'cursor', file: path.join('.cursor', 'mcp.json'), status: 'invalid' },
    ]);
    expect(await fs.readFile(path.join(projectRoot, '.mcp.json'), 'utf-8')).toBe('{ "mcpServers": { broken');
    expect(await readJson(path.join('.cursor', 'mcp.json'))).toEqual({ mcpServers: [] });
  });

  it.skipIf(process.platform === 'win32')(
    'reports a file it cannot write instead of failing',
    async () => {
      await write(path.join('qaspec', 'config.yaml'), EXECUTION_CONFIG);
      await write('.mcp.json', JSON.stringify({ mcpServers: { github: { command: 'gh-mcp' } } }));
      await fs.chmod(path.join(projectRoot, '.mcp.json'), 0o444);
      await write('.cursor', 'not a directory');

      const results = await syncExecutionMcpEntries(projectRoot, ['claude', 'cursor']);

      expect(results.map(({ toolId, status }) => ({ toolId, status }))).toEqual([
        { toolId: 'claude', status: 'error' },
        { toolId: 'cursor', status: 'error' },
      ]);
      expect(results[0].detail).toMatch(/EACCES/);
      expect(await readJson('.mcp.json')).toEqual({ mcpServers: { github: { command: 'gh-mcp' } } });
    }
  );

  it('keeps its server when qaspec/config.yaml cannot be read', async () => {
    await write(path.join('qaspec', 'config.yaml'), 'schema: [unclosed\n');
    const existing = JSON.stringify({ mcpServers: { [QASPEC_PLAYWRIGHT_MCP_SERVER]: { command: 'npx' } } });
    await write('.mcp.json', existing);

    const results = await syncExecutionMcpEntries(projectRoot, ['claude']);

    expect(results).toEqual([]);
    expect(await fs.readFile(path.join(projectRoot, '.mcp.json'), 'utf-8')).toBe(existing);
  });

  it('ignores tools that have no project-level MCP file', async () => {
    await write(path.join('qaspec', 'config.yaml'), EXECUTION_CONFIG);

    const results = await syncExecutionMcpEntries(projectRoot, ['windsurf', 'codex']);

    expect(results).toEqual([]);
  });

  it('describes each result for the command output', () => {
    expect(formatExecutionMcpResult({ toolId: 'claude', file: '.mcp.json', status: 'written' })).toBe(
      'Playwright MCP server "qaspec-playwright" written to .mcp.json'
    );
    expect(formatExecutionMcpResult({ toolId: 'claude', file: '.mcp.json', status: 'removed' })).toBe(
      'Playwright MCP server "qaspec-playwright" removed from .mcp.json (no valid execution block in qaspec/config.yaml)'
    );
    expect(
      formatExecutionMcpResult({ toolId: 'claude', file: '.mcp.json', status: 'error', detail: 'EACCES: permission denied' })
    ).toBe(
      'Could not update .mcp.json (EACCES: permission denied). Add the "qaspec-playwright" server manually (see docs/cli.md).'
    );
    expect(formatExecutionMcpResult({ toolId: 'claude', file: '.mcp.json', status: 'invalid' })).toBe(
      'Skipped .mcp.json: it is not valid JSON with an mcpServers object. Add the "qaspec-playwright" server manually (see docs/cli.md).'
    );
  });
});
