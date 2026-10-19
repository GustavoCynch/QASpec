/**
 * Playwright MCP server entry for /qsx:execute.
 *
 * `qaspec init` and `qaspec update` write one server, named by QASPEC_PLAYWRIGHT_MCP_SERVER, into
 * the project-level MCP file of the agent tools listed in EXECUTION_MCP_CONFIG_FILES. The entry is
 * built from the `execution` block of qaspec/config.yaml. Only that server is ever changed: other
 * servers and keys in the file are kept, and a file that is not valid JSON is left untouched.
 */

import { existsSync, promises as fs } from 'fs';
import { isDeepStrictEqual } from 'util';
import path from 'path';
import type { ExecutionConfig } from './execution-config.js';
import { readProjectConfig } from './project-config.js';
import { FileSystemUtils } from '../utils/file-system.js';

export const QASPEC_PLAYWRIGHT_MCP_SERVER = 'qaspec-playwright';

/** Pinned so every project starts the browser server version QASpec was tested with. */
export const PLAYWRIGHT_MCP_PACKAGE = '@playwright/mcp@0.0.83';

/** Project-level MCP file per agent tool; other tools get documented manual setup (docs/cli.md). */
export const EXECUTION_MCP_CONFIG_FILES: Readonly<Record<string, string>> = {
  claude: '.mcp.json',
  cursor: path.join('.cursor', 'mcp.json'),
};

/**
 * How each tool refers to the project root inside MCP args. Claude Code expands `${VAR:-default}`
 * from its own environment, where CLAUDE_PROJECT_DIR is not set, so the documented default `.`
 * (the project directory the server starts in) applies. Cursor resolves `${workspaceFolder}`.
 */
const PROJECT_ROOT_REFERENCE: Readonly<Record<string, string>> = {
  claude: '${CLAUDE_PROJECT_DIR:-.}',
  cursor: '${workspaceFolder}',
};

export type ExecutionMcpStatus = 'written' | 'removed' | 'invalid';

export interface ExecutionMcpResult {
  toolId: string;
  /** MCP file path relative to the project root. */
  file: string;
  status: ExecutionMcpStatus;
}

interface McpServerEntry {
  command: string;
  args: string[];
}

export function buildPlaywrightMcpEntry(toolId: string, execution: ExecutionConfig): McpServerEntry {
  const args = ['-y', PLAYWRIGHT_MCP_PACKAGE, '--isolated'];
  const storageState = execution.auth?.storageState;
  if (storageState) {
    args.push('--storage-state', `${PROJECT_ROOT_REFERENCE[toolId]}/${storageState.split('\\').join('/')}`);
  }
  const blockedOrigins = execution.network?.blockedOrigins ?? [];
  if (blockedOrigins.length > 0) {
    args.push('--blocked-origins', blockedOrigins.join(';'));
  }
  return { command: 'npx', args };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type McpFileState =
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'valid'; content: Record<string, unknown>; servers: Record<string, unknown> };

async function readMcpFile(filePath: string): Promise<McpFileState> {
  if (!existsSync(filePath)) {
    return { kind: 'missing' };
  }
  try {
    const content: unknown = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    if (!isPlainObject(content)) {
      return { kind: 'invalid' };
    }
    const servers = content.mcpServers ?? {};
    return isPlainObject(servers) ? { kind: 'valid', content, servers } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

async function syncToolEntry(
  projectRoot: string,
  toolId: string,
  file: string,
  execution: ExecutionConfig | undefined
): Promise<ExecutionMcpResult | null> {
  const filePath = path.join(projectRoot, file);
  const state = await readMcpFile(filePath);

  if (!execution) {
    if (state.kind !== 'valid' || !(QASPEC_PLAYWRIGHT_MCP_SERVER in state.servers)) {
      return null;
    }
    const { [QASPEC_PLAYWRIGHT_MCP_SERVER]: _removed, ...servers } = state.servers;
    await FileSystemUtils.writeFile(
      filePath,
      `${JSON.stringify({ ...state.content, mcpServers: servers }, null, 2)}\n`
    );
    return { toolId, file, status: 'removed' };
  }

  if (state.kind === 'invalid') {
    return { toolId, file, status: 'invalid' };
  }
  const entry = buildPlaywrightMcpEntry(toolId, execution);
  const content = state.kind === 'valid' ? state.content : {};
  const servers = state.kind === 'valid' ? state.servers : {};
  if (isDeepStrictEqual(servers[QASPEC_PLAYWRIGHT_MCP_SERVER], entry)) {
    return null;
  }
  await FileSystemUtils.writeFile(
    filePath,
    `${JSON.stringify({ ...content, mcpServers: { ...servers, [QASPEC_PLAYWRIGHT_MCP_SERVER]: entry } }, null, 2)}\n`
  );
  return { toolId, file, status: 'written' };
}

/**
 * Brings the Playwright server of each given tool in line with the current `execution` block.
 * Returns only the files that changed or could not be updated.
 */
export async function syncExecutionMcpEntries(
  projectRoot: string,
  toolIds: readonly string[]
): Promise<ExecutionMcpResult[]> {
  const execution = readProjectConfig(projectRoot)?.execution;
  const results: ExecutionMcpResult[] = [];
  for (const toolId of toolIds) {
    const file = EXECUTION_MCP_CONFIG_FILES[toolId];
    if (!file) {
      continue;
    }
    const result = await syncToolEntry(projectRoot, toolId, file, execution);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

export function formatExecutionMcpResult(result: ExecutionMcpResult): string {
  const server = `"${QASPEC_PLAYWRIGHT_MCP_SERVER}"`;
  switch (result.status) {
    case 'written':
      return `Playwright MCP server ${server} written to ${result.file}`;
    case 'removed':
      return `Playwright MCP server ${server} removed from ${result.file} (no execution block in qaspec/config.yaml)`;
    case 'invalid':
      return (
        `Skipped ${result.file}: it is not valid JSON with an mcpServers object. ` +
        `Add the ${server} server manually (see docs/cli.md).`
      );
  }
}
