/**
 * A repository for the catch tests of the parent phase (T7): main holds the project, a feature branch changes
 * src/app.ts (and README.md outside a subfolder project), the change is approved with its head, and the catch block
 * runs the contract mode of fake-jest.mjs. Every path lives under the folder the caller creates; the caller points
 * TMPDIR at its own scratch folder.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { computeAnalyzeContentHash, writeApprovalRecord } from '../../../src/core/approval-ledger.js';

export const FAKE_JEST = fileURLToPath(new URL('./fake-jest.mjs', import.meta.url));
export const CHANGE = 'csv-export';
export const APPROVED_AT = '2026-10-20T10:00:00.000Z';
export const SETUP_MARKER = 'setup-marker.txt';

/** A single-quoted POSIX shell word. */
export const shellWord = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

const nodeEval = (code: string): string => `${shellWord(process.execPath)} -e ${shellWord(code)}`;

/** Setup that writes a marker into the folder setup runs in. */
export const SETUP_OK = nodeEval(`require('fs').writeFileSync(${JSON.stringify(SETUP_MARKER)}, 'ok')`);
/** Setup that fails. */
export const SETUP_FAILS = nodeEval('process.exit(3)');
/** Setup that fails only in a checkout of the PR head (its source holds the head value). */
export const SETUP_FAILS_ON_HEAD = nodeEval(
  "process.exit(require('fs').readFileSync('src/app.ts', 'utf8').includes('value = 2') ? 3 : 0)"
);

/** Setup that appends one line to logPath each time it runs: how many installs a run made. */
export const setupLogging = (logPath: string): string =>
  nodeEval(`require('fs').appendFileSync(${JSON.stringify(logPath)}, 'setup\\n')`);

/** The lines the setup logger wrote, one per install. */
export const readSetupLog = (logPath: string): string[] =>
  fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').split('\n').filter((line) => line !== '') : [];

/** One entry per test run of the fake runner: the named test files and the text each had when the run started. */
export interface RecordedTestRun {
  name: string;
  text: string | null;
}

/** The test runs the fake runner recorded for a fixture, in order (empty when it never ran a test). */
export const readRunsLog = (recordPath: string): RecordedTestRun[][] => {
  const file = `${recordPath}.runs`;
  return fs.existsSync(file)
    ? fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line) as RecordedTestRun[])
    : [];
};

/** The base test command: fake-jest in the given contract variant, recording its starts in recordPath. */
export function contractRunner(recordPath: string, variant = ''): string {
  return [process.execPath, FAKE_JEST, recordPath, `contracts${variant}`].map(shellWord).join(' ');
}

/** The starts the fake runner recorded: its arguments and working directory. */
export interface RecordedStart {
  args: string[];
  cwd: string;
}

export const readRecordedStart = (recordPath: string): RecordedStart =>
  JSON.parse(fs.readFileSync(recordPath, 'utf8')) as RecordedStart;

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

export const BASE_APP = "export const value = 1;\nexport const label = 'value';\n";
export const BASE_UTIL = 'export const util = 1;\n';
export const HEAD_APP = "export const value = 2;\nexport const label = 'value';\n";
export const SPEC_APP = '// covers: src/app.ts\n// expect: export const value = 1;\n';

export const CHANGE_FILES = {
  analysis: [
    '# Analysis',
    '## Affected capabilities',
    '- billing-export',
    '## Intent class',
    'Intent class: behavior-change',
    '## Approval digest',
    'Pending.',
  ].join('\n\n') + '\n',
  delta: [
    '## ADDED Requirements',
    '### Requirement: CSV export',
    'The system SHALL write a CSV file.',
    '#### Scenario: CSV header row',
    '- **WHEN** the file is built\n- **THEN** the first row holds the headers',
    '## MODIFIED Requirements',
    '### Requirement: Currency',
    'The system SHALL keep each currency.',
    '#### Scenario: Currency kept',
    '- **WHEN** an amount is exported\n- **THEN** its currency code is kept',
    '## REMOVED Requirements',
    '### Requirement: Legacy export',
  ].join('\n\n') + '\n',
  base: [
    '# Billing Specification',
    '## Purpose',
    'Billing exports for invoices.',
    '## Requirements',
    '### Requirement: Tax rounding',
    'The system SHALL round taxes to cents.',
    '#### Scenario: Tax rounded',
    '- **WHEN** a tax is computed\n- **THEN** the amount is rounded to cents',
    '### Requirement: Currency',
    'The system SHALL show the currency.',
    '#### Scenario: Currency shown',
    '- **WHEN** an amount is shown\n- **THEN** its currency is shown',
    '### Requirement: Legacy export',
    'The system SHALL export the legacy file.',
    '#### Scenario: Legacy file',
    '- **WHEN** a legacy file is requested\n- **THEN** the legacy file is returned',
  ].join('\n\n') + '\n',
};

export interface ProjectFixtureOptions {
  /** Folder of the test; every file of the fixture is created under it. */
  root: string;
  /** Project folder inside the repository ("" or undefined: the repository root). */
  subfolder?: string;
  /** Contents of src/app.ts on main; the feature branch changes it to HEAD_APP. */
  baseApp?: string;
  /** Contract variant of the base runner ("" for contracts, ":sleep", ":exit3" or ":list-fail"). */
  runnerVariant?: string;
  /** runner.timeoutSeconds in the catch block. */
  timeoutSeconds?: number;
  /** gates.parentRuns and gates.childRuns in the catch block (the defaults when absent). */
  gates?: { parentRuns?: number; childRuns?: number };
  /** Setup command; SETUP_OK by default. */
  setupCommand?: string;
  /** setup.reinstallWhenChanged in the catch block: the project paths whose change means a new install. */
  reinstallWhenChanged?: string[];
  /** Contents of src/app.ts on the feature branch; HEAD_APP by default. */
  headApp?: string;
  /** Files the feature branch adds or changes besides src/app.ts (path to contents). */
  headFiles?: Record<string, string>;
}

export interface ProjectFixture {
  repo: string;
  /** The project folder: the repository, or its subfolder. */
  project: string;
  changesDir: string;
  changeDir: string;
  /** Commit of main: the merge-base of the PR. */
  base: string;
  /** Commit of the feature branch: the PR head. */
  head: string;
  /** The file the fake runner records its starts in. */
  recordPath: string;
  writeConfig(catchBlock: Record<string, unknown>): void;
}

/**
 * Builds the repository and the approved change. The checkout stays on main; the head commit holds the PR change.
 * The approval records the head, so start can run without arguments.
 */
export function makeProjectFixture(options: ProjectFixtureOptions): ProjectFixture {
  const repo = path.join(options.root, 'repo');
  const subfolder = options.subfolder ?? '';
  const project = subfolder === '' ? repo : path.join(repo, subfolder);
  const recordPath = path.join(options.root, 'runner-record.json');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q');
  git(repo, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(repo, 'config', 'user.name', 'QASpec Test');
  git(repo, 'config', 'user.email', 'qaspec-test@example.com');
  git(repo, 'config', 'commit.gpgsign', 'false');

  const runner = contractRunner(recordPath, options.runnerVariant ?? '');
  const writeConfig = (catchBlock: Record<string, unknown>): void =>
    writeFiles(project, { 'qaspec/config.yaml': stringify({ schema: 'qaspec-pr-review', catch: catchBlock }) });
  writeConfig({
    baseRef: 'main',
    setup: {
      commands: [options.setupCommand ?? SETUP_OK],
      ...(options.reinstallWhenChanged === undefined ? {} : { reinstallWhenChanged: options.reinstallWhenChanged }),
    },
    runner: {
      adapter: 'jest',
      command: runner,
      ...(options.timeoutSeconds === undefined ? {} : { timeoutSeconds: options.timeoutSeconds }),
    },
    ...(options.gates === undefined ? {} : { gates: options.gates }),
  });
  writeFiles(project, {
    'src/app.ts': options.baseApp ?? BASE_APP,
    'src/util.ts': BASE_UTIL,
    'test/app.spec.ts': SPEC_APP,
    'qaspec/specs/billing-export/spec.md': CHANGE_FILES.base,
  });
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD');

  git(repo, 'checkout', '-q', '-b', 'feature');
  writeFiles(project, { 'src/app.ts': options.headApp ?? HEAD_APP, ...(options.headFiles ?? {}) });
  if (subfolder !== '') {
    writeFiles(repo, { 'README.md': 'outside the project\n' });
  }
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'feature');
  const head = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '-q', 'main');

  const changesDir = path.join(project, 'qaspec', 'changes');
  const changeDir = path.join(changesDir, CHANGE);
  writeFiles(changeDir, {
    '.qaspec.yaml': 'schema: qaspec-pr-review\n',
    'analysis.md': CHANGE_FILES.analysis,
    'specs/billing-export/spec.md': CHANGE_FILES.delta,
  });
  writeApprovalRecord(
    changeDir,
    'analyze',
    { approvedAt: APPROVED_AT, contentHash: computeAnalyzeContentHash(changeDir).hash, headSha: head },
    project
  );
  return { repo, project, changesDir, changeDir, base, head, recordPath, writeConfig };
}

/** Lists the worktrees of a repository as their paths. */
export const worktreesOf = (repo: string): string[] =>
  git(repo, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
