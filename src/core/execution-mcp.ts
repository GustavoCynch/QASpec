/**
 * Playwright MCP server entry for /qsx:execute.
 *
 * `qaspec init` and `qaspec update` write one server, named by QASPEC_PLAYWRIGHT_MCP_SERVER, into
 * the project-level MCP file of the agent tools listed in EXECUTION_MCP_TOOLS. The entry is
 * built from the `execution` block of qaspec/config.yaml. Only that server is ever changed: other
 * servers and keys in the file are kept, and a file that is not valid JSON is left untouched.
 */

import chalk from 'chalk';
import { existsSync, promises as fs } from 'fs';
import { isDeepStrictEqual } from 'util';
import path from 'path';
import type { ExecutionConfig } from './execution-config.js';
import { readProjectConfig } from './project-config.js';
import { FileSystemUtils } from '../utils/file-system.js';

export const QASPEC_PLAYWRIGHT_MCP_SERVER = 'qaspec-playwright';

/** Pinned so every project starts the browser server version QASpec was tested with. */
export const PLAYWRIGHT_MCP_PACKAGE = '@playwright/mcp@0.0.83';

interface ExecutionMcpTool {
  /** Project-level MCP file, relative to the project root. */
  file: string;
  /** How the tool refers to the project root inside MCP args. */
  projectRoot: string;
}

/**
 * Agent tools whose project-level MCP file QASpec writes; other tools get documented manual setup
 * (docs/cli.md). Claude Code expands `${VAR:-default}` from its own environment, where
 * CLAUDE_PROJECT_DIR is not set, so the documented default `.` (the project directory the server
 * starts in) applies. Cursor resolves `${workspaceFolder}`.
 */
export const EXECUTION_MCP_TOOLS: Readonly<Record<string, ExecutionMcpTool>> = {
  claude: { file: '.mcp.json', projectRoot: '${CLAUDE_PROJECT_DIR:-.}' },
  cursor: { file: path.join('.cursor', 'mcp.json'), projectRoot: '${workspaceFolder}' },
};

export type ExecutionMcpStatus = 'written' | 'removed' | 'invalid' | 'error';

export interface ExecutionMcpResult {
  toolId: string;
  /** MCP file path relative to the project root. */
  file: string;
  status: ExecutionMcpStatus;
  /** Why the file could not be read or written, for `error`. */
  detail?: string;
}

interface McpServerEntry {
  command: string;
  args: string[];
}

export function buildPlaywrightMcpEntry(toolId: string, execution: ExecutionConfig): McpServerEntry {
  const tool = EXECUTION_MCP_TOOLS[toolId];
  if (!tool) {
    throw new Error(`Tool "${toolId}" has no project-level MCP file that QASpec writes`);
  }
  const args = ['-y', PLAYWRIGHT_MCP_PACKAGE, '--isolated'];
  const storageState = execution.auth?.storageState;
  if (storageState) {
    args.push('--storage-state', `${tool.projectRoot}/${storageState.split('\\').join('/')}`);
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

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + path.sep);
}

/**
 * A cloned repository could ship the MCP file, or its `.cursor` folder, as a symlink to a user-level
 * config. QASpec only writes a regular file whose folder resolves inside the project.
 */
async function assertSafeToWrite(projectRoot: string, file: string): Promise<void> {
  const filePath = path.join(projectRoot, file);
  const folder = path.dirname(filePath);
  if (existsSync(folder)) {
    const realRoot = await fs.realpath(projectRoot);
    if (!isInside(realRoot, await fs.realpath(folder))) {
      throw new Error(`${path.dirname(file)} points outside the project`);
    }
  }
  const stats = await fs.lstat(filePath).catch(() => undefined);
  if (stats?.isSymbolicLink()) {
    throw new Error(`${file} is a symbolic link; QASpec only writes regular files inside the project`);
  }
}

async function writeMcpFile(projectRoot: string, file: string, content: unknown): Promise<void> {
  await assertSafeToWrite(projectRoot, file);
  await FileSystemUtils.writeFile(path.join(projectRoot, file), `${JSON.stringify(content, null, 2)}\n`);
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
    await writeMcpFile(projectRoot, file, { ...state.content, mcpServers: servers });
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
  await writeMcpFile(projectRoot, file, {
    ...content,
    mcpServers: { ...servers, [QASPEC_PLAYWRIGHT_MCP_SERVER]: entry },
  });
  return { toolId, file, status: 'written' };
}

/**
 * Brings the Playwright server of each given tool in line with the current `execution` block.
 * Returns only the files that changed or could not be updated; a file that cannot be written is
 * reported rather than failing the command. Nothing changes when qaspec/config.yaml is missing
 * or cannot be read, so a config typo never removes the server.
 */
export async function syncExecutionMcpEntries(
  projectRoot: string,
  toolIds: readonly string[]
): Promise<ExecutionMcpResult[]> {
  const config = readProjectConfig(projectRoot);
  if (!config) {
    return [];
  }
  const results: ExecutionMcpResult[] = [];
  for (const toolId of toolIds) {
    const file = EXECUTION_MCP_TOOLS[toolId]?.file;
    if (!file) {
      continue;
    }
    try {
      const result = await syncToolEntry(projectRoot, toolId, file, config.execution);
      if (result) {
        results.push(result);
      }
    } catch (error) {
      results.push({ toolId, file, status: 'error', detail: (error as Error).message });
    }
  }
  return results;
}

/** Prints one line per result for init and update; results that need attention are highlighted. */
export function printExecutionMcpResults(results: readonly ExecutionMcpResult[]): void {
  for (const result of results) {
    const message = formatExecutionMcpResult(result);
    const needsAttention = result.status === 'invalid' || result.status === 'error';
    console.log(needsAttention ? chalk.yellow(message) : message);
  }
}

export function formatExecutionMcpResult(result: ExecutionMcpResult): string {
  const server = `"${QASPEC_PLAYWRIGHT_MCP_SERVER}"`;
  switch (result.status) {
    case 'written':
      return `Playwright MCP server ${server} written to ${result.file}`;
    case 'removed':
      return `Playwright MCP server ${server} removed from ${result.file} (no valid execution block in qaspec/config.yaml)`;
    case 'invalid':
      return (
        `Skipped ${result.file}: it is not valid JSON with an mcpServers object. ` +
        `Add the ${server} server manually (see docs/cli.md).`
      );
    case 'error':
      return (
        `Could not update ${result.file} (${result.detail}). ` +
        `Add the ${server} server manually (see docs/cli.md).`
      );
  }
}
