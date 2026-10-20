import path from 'path';
import { z } from 'zod';

/**
 * Zod schema for the optional `execution` block of qaspec/config.yaml, used by /qsx:execute.
 *
 * Every value is project-specific (app URL, credentials files, blocked origins, readiness
 * commands), so none of it is hardcoded in QASpec. Paths are relative to the project root
 * and must stay inside it: the credentials and session files are later checked against
 * the project's .gitignore.
 */

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Checks POSIX and Windows forms explicitly so validation is identical on every platform.
 * `$` is rejected because agent tools expand `${...}` in the MCP arguments these paths end up in.
 */
function isProjectRelativePath(value: string): boolean {
  if (
    value.length === 0 ||
    value.includes('$') ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  ) {
    return false;
  }
  const normalized = path.posix.normalize(value.split('\\').join('/'));
  return normalized !== '..' && !normalized.startsWith('../');
}

const HttpUrlSchema = z.string().refine(isHttpUrl);
const HttpOriginSchema = HttpUrlSchema.transform((value) => new URL(value).origin);
export const ProjectRelativePathSchema = z.string().refine(isProjectRelativePath);
const NonEmptyStringSchema = z.string().min(1);
const ReadinessModeSchema = z.enum(['manual', 'probe']);

const ReadinessCheckSchema = z.object({
  name: NonEmptyStringSchema.describe('Label shown when the check fails'),
  command: NonEmptyStringSchema.describe('Command that must exit 0 before cases run'),
});

export const ExecutionConfigSchema = z.object({
  app: z
    .object({
      url: HttpUrlSchema.optional().describe('URL of the application under test'),
      readiness: ReadinessModeSchema.optional().describe(
        'manual: the user confirms the app serves the change; probe: GET probeUrl must return 2xx'
      ),
      probeUrl: HttpUrlSchema.optional().describe('URL probed when readiness is probe'),
    })
    .optional(),
  auth: z
    .object({
      envFile: ProjectRelativePathSchema.optional().describe('Gitignored dotenv file with test credentials'),
      requiredVariables: z.array(NonEmptyStringSchema).optional().describe('Variables envFile must define'),
      loginScript: ProjectRelativePathSchema.optional().describe('Script that logs in and writes storageState'),
      storageState: ProjectRelativePathSchema.optional().describe('Gitignored browser session file'),
    })
    .optional(),
  network: z
    .object({
      blockedOrigins: z
        .array(HttpOriginSchema)
        .optional()
        .describe('Origins the agent browser must never reach'),
    })
    .optional(),
  controlCase: ProjectRelativePathSchema.optional().describe('Smoke case run at the start and end of every run'),
  readinessChecks: z.array(ReadinessCheckSchema).optional(),
  dataPrefix: NonEmptyStringSchema.optional().describe('Prefix for data the agent creates'),
});

export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a nested section; warns when it is present but not an object. */
export function readSection(value: unknown, label: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    console.warn(`Invalid '${label}' in config (must be object)`);
    return undefined;
  }
  return value;
}

/** Reads one optional field; warns and drops it when it is present but invalid. */
export function readField<T>(
  value: unknown,
  schema: z.ZodType<T>,
  label: string,
  expected: string
): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  console.warn(`Invalid '${label}' in config (must be ${expected})`);
  return undefined;
}

/** Reads a list entry by entry, keeping valid entries and warning about the rest. */
export function readList<T>(
  value: unknown,
  schema: z.ZodType<T>,
  label: string,
  expected: string
): T[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    console.warn(`Invalid '${label}' in config (must be a list)`);
    return undefined;
  }
  const items: T[] = [];
  value.forEach((item, index) => {
    const parsed = readField(item, schema, `${label}[${index}]`, expected);
    if (parsed !== undefined) {
      items.push(parsed);
    }
  });
  return items.length > 0 ? items : undefined;
}

/** Drops undefined keys; returns undefined when nothing valid remains. */
export function compact<T extends Record<string, unknown>>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}

export const PATH_EXPECTATION = 'a path relative to the project root, inside it';

/**
 * Resilient parsing of the `execution` block, field by field, like the rest of the config:
 * invalid values are reported with console.warn and dropped; valid siblings are kept.
 */
export function parseExecutionConfig(raw: unknown): ExecutionConfig | undefined {
  const section = readSection(raw, 'execution');
  if (!section) {
    return undefined;
  }

  const appRaw = readSection(section.app, 'execution.app');
  const app =
    appRaw &&
    compact({
      url: readField(appRaw.url, HttpUrlSchema, 'execution.app.url', 'an http(s) URL'),
      readiness: readField(
        appRaw.readiness,
        ReadinessModeSchema,
        'execution.app.readiness',
        "'manual' or 'probe'"
      ),
      probeUrl: readField(appRaw.probeUrl, HttpUrlSchema, 'execution.app.probeUrl', 'an http(s) URL'),
    });
  if (app?.readiness === 'probe' && app.probeUrl === undefined) {
    console.warn(`'execution.app.probeUrl' is required when 'execution.app.readiness' is 'probe'`);
  }

  const authRaw = readSection(section.auth, 'execution.auth');
  const auth =
    authRaw &&
    compact({
      envFile: readField(authRaw.envFile, ProjectRelativePathSchema, 'execution.auth.envFile', PATH_EXPECTATION),
      requiredVariables: readList(
        authRaw.requiredVariables,
        NonEmptyStringSchema,
        'execution.auth.requiredVariables',
        'a non-empty string'
      ),
      loginScript: readField(
        authRaw.loginScript,
        ProjectRelativePathSchema,
        'execution.auth.loginScript',
        PATH_EXPECTATION
      ),
      storageState: readField(
        authRaw.storageState,
        ProjectRelativePathSchema,
        'execution.auth.storageState',
        PATH_EXPECTATION
      ),
    });

  const networkRaw = readSection(section.network, 'execution.network');
  const network =
    networkRaw &&
    compact({
      blockedOrigins: readList(
        networkRaw.blockedOrigins,
        HttpOriginSchema,
        'execution.network.blockedOrigins',
        'an http(s) origin'
      ),
    });

  return compact({
    app,
    auth,
    network,
    controlCase: readField(section.controlCase, ProjectRelativePathSchema, 'execution.controlCase', PATH_EXPECTATION),
    readinessChecks: readList(
      section.readinessChecks,
      ReadinessCheckSchema,
      'execution.readinessChecks',
      'an object with non-empty name and command'
    ),
    dataPrefix: readField(section.dataPrefix, NonEmptyStringSchema, 'execution.dataPrefix', 'a non-empty string'),
  });
}
