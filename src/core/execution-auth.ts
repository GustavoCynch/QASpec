/**
 * Login bootstrap for /qsx:execute.
 *
 * Runs the project's login script with the test credentials from a gitignored dotenv file and
 * saves the resulting browser session (Playwright storage state). The agent later starts the
 * browser from that session, so it never receives the password. Every guard fails closed: the
 * script only runs when git confirms the credentials and session files stay out of the repo.
 */

import { execFile, spawn } from 'child_process';
import { existsSync, promises as fs } from 'fs';
import path from 'path';
import { parseEnv } from 'util';
import { readProjectConfig } from './project-config.js';

/** Extensions QASpec runs with the current Node.js binary. */
export const LOGIN_SCRIPT_EXTENSIONS = ['.js', '.mjs', '.cjs'] as const;

export const DEFAULT_LOGIN_TIMEOUT_MS = 120_000;

/** Time a timed-out script gets to exit after SIGTERM before it is killed. */
const KILL_GRACE_MS = 2_000;

/** Shorter values are not redacted: masking them would corrupt ordinary output. */
const MIN_REDACTED_LENGTH = 4;

const REDACTED = '[redacted]';

const REQUIRED_AUTH_SETTINGS = ['envFile', 'loginScript', 'storageState'] as const;

export interface ExecuteLoginOptions {
  timeoutMs?: number;
}

export interface ExecuteLoginResult {
  /** Absolute path of the saved browser session. */
  storageStatePath: string;
  /** Login script stdout and stderr, with credential values redacted. */
  output: string;
}

/** Resolves with git's exit code; rejects only when git itself cannot run. */
function gitExitCode(projectRoot: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: projectRoot }, (error) => {
      if (!error) {
        resolve(0);
      } else if (typeof error.code === 'number') {
        resolve(error.code);
      } else {
        reject(
          new Error(
            `QASpec needs git to confirm that credential files stay out of the repository: ${error.message}`
          )
        );
      }
    });
  });
}

/**
 * Accepts the file only when git ignores it and does not track it. A tracked file is reported
 * separately because git keeps tracking it even after a matching .gitignore entry is added.
 */
async function assertIgnoredByGit(projectRoot: string, relativePath: string): Promise<void> {
  if ((await gitExitCode(projectRoot, ['ls-files', '--error-unmatch', '--', relativePath])) === 0) {
    throw new Error(
      `${relativePath} is tracked by git. Remove it from the index with "git rm --cached ${relativePath}" ` +
        'and keep it in .gitignore: it holds credentials or a browser session.'
    );
  }
  if ((await gitExitCode(projectRoot, ['check-ignore', '-q', '--', relativePath])) !== 0) {
    throw new Error(
      `${relativePath} is not ignored by git. Add it to .gitignore before running qaspec execute login: ` +
        'it holds credentials or a browser session.'
    );
  }
}

function redact(text: string, secrets: string[]): string {
  return secrets.reduce((current, secret) => current.split(secret).join(REDACTED), text);
}

/** A secret as written raw and as it appears inside a JSON string (e.g. a logged object). */
function secretForms(value: string): string[] {
  const jsonEscaped = JSON.stringify(value).slice(1, -1);
  return jsonEscaped === value ? [value] : [value, jsonEscaped];
}

interface LoginScriptOutcome {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
}

function runLoginScript(
  projectRoot: string,
  scriptPath: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number
): Promise<LoginScriptOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let timedOut = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));

    // 'close' waits for every output pipe, which a process started by the script can keep
    // open after the script exits; once timed out, the script's own exit is enough.
    const finish = (exitCode: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      child.stdout.destroy();
      child.stderr.destroy();
      resolve({ exitCode, output, timedOut });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.exitCode !== null || child.signalCode !== null) {
        finish(child.exitCode);
        return;
      }
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
    }, timeoutMs);

    child.on('error', (error) => {
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      reject(error);
    });
    child.on('exit', (exitCode) => {
      if (timedOut) {
        finish(exitCode);
      }
    });
    child.on('close', (exitCode) => finish(exitCode));
  });
}

async function isStorageState(filePath: string): Promise<boolean> {
  try {
    const session = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    return Array.isArray(session?.cookies) && Array.isArray(session?.origins);
  } catch {
    return false;
  }
}

export async function executeLogin(
  projectRoot: string,
  options: ExecuteLoginOptions = {}
): Promise<ExecuteLoginResult> {
  const execution = readProjectConfig(projectRoot)?.execution;
  const auth = execution?.auth ?? {};

  const missing = REQUIRED_AUTH_SETTINGS.filter((key) => auth[key] === undefined).map(
    (key) => `execution.auth.${key}`
  );
  if (missing.length > 0) {
    throw new Error(`Missing settings in qaspec/config.yaml: ${missing.join(', ')}`);
  }
  const envFile = auth.envFile as string;
  const loginScript = auth.loginScript as string;
  const storageState = auth.storageState as string;

  const envFilePath = path.join(projectRoot, envFile);
  const storageStatePath = path.join(projectRoot, storageState);
  if (path.resolve(envFilePath) === path.resolve(storageStatePath)) {
    throw new Error(
      'execution.auth.storageState must not be the same file as execution.auth.envFile: ' +
        'saving the session would overwrite the credentials.'
    );
  }

  if (!(LOGIN_SCRIPT_EXTENSIONS as readonly string[]).includes(path.extname(loginScript))) {
    throw new Error(
      `execution.auth.loginScript must be a .js, .mjs or .cjs file: QASpec runs it with Node.js (got ${loginScript}).`
    );
  }

  if ((await gitExitCode(projectRoot, ['rev-parse', '--is-inside-work-tree'])) !== 0) {
    throw new Error(
      `${projectRoot} is not inside a git repository. QASpec only runs the login when git confirms ` +
        'that the credentials and session files are ignored.'
    );
  }
  await assertIgnoredByGit(projectRoot, envFile);
  await assertIgnoredByGit(projectRoot, storageState);

  if (!existsSync(envFilePath)) {
    throw new Error(`${envFile} was not found. Create it with the test credentials.`);
  }
  const credentials = parseEnv(await fs.readFile(envFilePath, 'utf-8'));
  const undefinedVariables = (auth.requiredVariables ?? []).filter((name) => !credentials[name]);
  if (undefinedVariables.length > 0) {
    throw new Error(`${envFile} does not define: ${undefinedVariables.join(', ')}`);
  }

  const secrets = Object.values(credentials)
    .filter((value): value is string => typeof value === 'string' && value.length >= MIN_REDACTED_LENGTH)
    .flatMap(secretForms)
    .sort((a, b) => b.length - a.length);

  await fs.mkdir(path.dirname(storageStatePath), { recursive: true });
  // A session left by an earlier login must not pass validation if this login fails to write one.
  await fs.rm(storageStatePath, { force: true });

  const timeoutMs = options.timeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS;
  const outcome = await runLoginScript(
    projectRoot,
    path.join(projectRoot, loginScript),
    {
      ...process.env,
      ...credentials,
      QASPEC_STORAGE_STATE: storageStatePath,
      ...(execution?.app?.url ? { QASPEC_APP_URL: execution.app.url } : {}),
    },
    timeoutMs
  );
  const output = redact(outcome.output, secrets);

  // A failed login must not leave a session behind for a later run to start from.
  const fail = async (message: string): Promise<never> => {
    await fs.rm(storageStatePath, { force: true });
    throw new Error(message);
  };
  if (outcome.timedOut) {
    await fail(`The login script timed out after ${timeoutMs} ms.\n${output}`.trimEnd());
  }
  if (outcome.exitCode !== 0) {
    await fail(`The login script exited with code ${outcome.exitCode}.\n${output}`.trimEnd());
  }
  if (!(await isStorageState(storageStatePath))) {
    await fail(
      `The login script finished but did not write a valid storage state to ${storageState}. ` +
        "It must save the browser session to the path in QASPEC_STORAGE_STATE (for example with Playwright's " +
        'context.storageState({ path })).'
    );
  }
  if (process.platform !== 'win32') {
    await fs.chmod(storageStatePath, 0o600);
  }

  return { storageStatePath, output };
}
