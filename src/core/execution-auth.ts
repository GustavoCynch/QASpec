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

/** Time allowed for remaining output to drain after the script exits. */
const EXIT_GRACE_MS = 500;

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
    // On POSIX the script leads its own process group, so the processes it starts can be
    // stopped with it. Windows has no process groups to signal; only the script is stopped.
    const ownGroup = process.platform !== 'win32';
    const child = spawn(process.execPath, [scriptPath], {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: ownGroup,
    });
    let output = '';
    let timedOut = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;
    let exitGraceTimer: NodeJS.Timeout | undefined;
    // Decoding per stream keeps a multi-byte character split across chunks intact for redaction.
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (output += chunk));
    child.stderr.on('data', (chunk: string) => (output += chunk));

    const signalScript = (signal: NodeJS.Signals) => {
      try {
        if (ownGroup && child.pid !== undefined) {
          process.kill(-child.pid, signal);
        } else {
          child.kill(signal);
        }
      } catch {
        // Already gone.
      }
    };

    // Processes the script leaves running are stopped, so none can rewrite the session later.
    const finish = (exitCode: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      clearTimeout(exitGraceTimer);
      signalScript('SIGKILL');
      child.stdout.destroy();
      child.stderr.destroy();
      resolve({ exitCode, output, timedOut });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      signalScript('SIGTERM');
      killTimer = setTimeout(() => signalScript('SIGKILL'), KILL_GRACE_MS);
    }, timeoutMs);

    child.on('error', (error) => {
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      clearTimeout(exitGraceTimer);
      reject(error);
    });
    // 'close' waits for every output pipe, which a process started by the script can keep
    // open after the script exits; the script's own exit decides once remaining output drains.
    child.on('exit', (exitCode) => {
      if (timedOut) {
        finish(exitCode);
      } else {
        exitGraceTimer = setTimeout(() => finish(exitCode), EXIT_GRACE_MS);
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

  await fs.mkdir(path.dirname(storageStatePath), { recursive: true, mode: 0o700 });
  // A session left by an earlier login must not pass validation if this login fails to write one.
  await fs.rm(storageStatePath, { force: true });
  // Created owner-only before the script runs: writing into an existing file keeps its mode,
  // so the session is not readable by other users while it is written.
  await fs.writeFile(storageStatePath, '', { mode: 0o600 });

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
