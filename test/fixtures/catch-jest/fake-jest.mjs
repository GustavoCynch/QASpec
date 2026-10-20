// Stand-in for the Jest CLI in the catch-jest tests. Jest is not a QASpec dependency, so the adapter is
// tested against this script: it is started as `<node> fake-jest.mjs <record file> <mode> <jest arguments>`.
// It records how it was started (arguments, working directory and environment) and then behaves by mode.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const reportsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'reports');
const [recordPath, mode = '', ...jestArgs] = process.argv.slice(2);
const cwd = process.cwd();

fs.writeFileSync(recordPath, JSON.stringify({ args: jestArgs, cwd, env: process.env }));

const outputArg = jestArgs.find((arg) => arg.startsWith('--outputFile='));
const outputFile = outputArg?.slice('--outputFile='.length);
const runIndex = jestArgs.indexOf('--runTestsByPath');
const requested = runIndex === -1 ? [] : jestArgs.slice(runIndex + 1);

/** One Jest-shaped suite result for each requested path, named the way Jest names suites: absolute. */
function generatedReport(status, failureMessage) {
  const testResults = requested.map((file) => ({
    assertionResults: [
      {
        ancestorTitles: [],
        duration: 1,
        failureDetails: [],
        failureMessages: status === 'failed' ? [failureMessage] : [],
        fullName: 'generated',
        location: null,
        status: status === 'failed' ? 'failed' : 'passed',
        title: 'generated',
      },
    ],
    endTime: 1_050,
    message: status === 'failed' ? failureMessage : '',
    name: path.resolve(cwd, file),
    startTime: 1_000,
    status,
    summary: '',
  }));
  return { numTotalTestSuites: testResults.length, success: status !== 'failed', testResults };
}

// Writes a fixture as the report. The fixtures name suites under __PROJECT__; the JSON-escaped working directory
// keeps the text valid JSON.
function writeFixtureReport(name) {
  const text = fs.readFileSync(path.join(reportsDir, `${name}.json`), 'utf8');
  fs.writeFileSync(outputFile, text.replaceAll('__PROJECT__', JSON.stringify(cwd).slice(1, -1)));
}

// Contract mode (T7): a spec names the source it covers and the text that source must keep:
//   // covers: src/app.ts
//   // expect: export const value = 1;
// Listing returns the specs that cover a requested source. A run fails an expectation the source no longer keeps,
// and a source that contains the marker @@BROKEN@@ does not build. Variants: contracts:sleep never ends a run,
// contracts:exit3 exits 3 with no report, contracts:list-fail exits 2 while listing.
//
// Directives (T8): a test file may say how it behaves on one side of the change. The side is the checkout of the
// source it covers: base (the parent's value 1) or head (the PR's value 2). Only the test files a run names are read,
// so the existing specs behave as before:
//   // fake: sleep on head   the run never ends
//   // fake: exit3 on head   the run exits 3 without a report
//   // fake: flaky on head   every odd run of such a test fails; the count of those runs lives in <record>.flaky
//   // fake: broken on head  the test does not build: a suite that failed to run, with no assertion
//   // fake: message on head: connect ECONNREFUSED  the run fails one assertion with this message (one line per message)
//   // fake: pause on head   the run takes one second longer, then runs as usual
// Every test run appends the text each named test had at that moment to <record>.runs, one JSON line per run.
const BASE_MARKER = 'export const value = 1;';
const HEAD_MARKER = 'export const value = 2;';

function coveredSources(text) {
  return [...text.matchAll(/^\/\/ covers: (.+?)\s*$/gm)].map((match) => match[1]);
}

function expectations(text) {
  return [...text.matchAll(/^\/\/ expect: (.+?)\s*$/gm)].map((match) => match[1]);
}

/** The side a test file runs on: the checkout of the source it covers (base or head), or undefined. */
function sideOf(name) {
  const text = fs.readFileSync(name, 'utf8');
  const covered = coveredSources(text)[0];
  if (covered === undefined) {
    return undefined;
  }
  const source = fs.readFileSync(path.join(cwd, covered), 'utf8');
  return source.includes(HEAD_MARKER) ? 'head' : source.includes(BASE_MARKER) ? 'base' : undefined;
}

function directivesOf(name) {
  const text = fs.readFileSync(name, 'utf8');
  const side = sideOf(name);
  return [...text.matchAll(/^\/\/ fake: (sleep|exit3|flaky|broken|pause) on (base|head)\s*$/gm)]
    .filter((match) => match[2] === side)
    .map((match) => match[1]);
}

/** The failure messages a test file scripts for its side: one assertion failure per line. */
function messagesOf(name) {
  const text = fs.readFileSync(name, 'utf8');
  const side = sideOf(name);
  return [...text.matchAll(/^\/\/ fake: message on (base|head): (.+?)\s*$/gm)]
    .filter((match) => match[1] === side)
    .map((match) => match[2]);
}

function existingText(name) {
  return fs.existsSync(name) ? fs.readFileSync(name, 'utf8') : null;
}

/** Counts the runs that carry a flaky directive and returns the count of this one (1, 2, ...). */
function nextFlakyCount() {
  const countPath = `${recordPath}.flaky`;
  const count = fs.existsSync(countPath) ? Number(fs.readFileSync(countPath, 'utf8')) : 0;
  fs.writeFileSync(countPath, String(count + 1));
  return count + 1;
}

function runContracts(variant) {
  if (jestArgs.includes('--listTests')) {
    if (variant === ':list-fail') {
      process.stderr.write('fake-jest: the listing failed\n');
      process.exitCode = 2;
      return;
    }
    const sources = jestArgs.slice(jestArgs.indexOf('--findRelatedTests') + 1);
    const related = fs
      .readdirSync(path.join(cwd, 'test'))
      .filter((name) => name.endsWith('.spec.ts'))
      .sort()
      .filter((name) => {
        const text = fs.readFileSync(path.join(cwd, 'test', name), 'utf8');
        return coveredSources(text).some((source) => sources.includes(source));
      });
    process.stdout.write(related.map((name) => path.join(cwd, 'test', name)).join('\n') + (related.length > 0 ? '\n' : ''));
    return;
  }
  if (variant === ':sleep') {
    setInterval(() => {}, 1_000);
    return;
  }
  if (variant === ':exit3') {
    process.stderr.write('boom from the runner\n');
    process.exitCode = 3;
    return;
  }
  const tests = jestArgs.slice(jestArgs.indexOf('--runTestsByPath') + 1);
  const names = tests.map((file) => path.resolve(cwd, file));
  fs.appendFileSync(`${recordPath}.runs`, `${JSON.stringify(names.map((name) => ({ name, text: existingText(name) })))}\n`);
  const directives = names.map((name) => directivesOf(name));
  if (directives.some((list) => list.includes('sleep'))) {
    setInterval(() => {}, 1_000);
    return;
  }
  if (directives.some((list) => list.includes('exit3'))) {
    process.stderr.write('boom from the runner\n');
    process.exitCode = 3;
    return;
  }
  if (directives.some((list) => list.includes('pause'))) {
    // A run that takes time, then reports as usual: the child phase stamps its classification after the runs.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }
  const oddRun = directives.some((list) => list.includes('flaky')) && nextFlakyCount() % 2 === 1;
  let failed = false;
  const testResults = names.map((name, index) => {
    const text = fs.readFileSync(name, 'utf8');
    const source = fs.readFileSync(path.join(cwd, coveredSources(text)[0]), 'utf8');
    if (source.includes('@@BROKEN@@') || directives[index].includes('broken')) {
      failed = true;
      return { name, status: 'failed', message: 'SyntaxError: the source does not build', startTime: 1_000, endTime: 1_010, assertionResults: [] };
    }
    const assertionResults = expectations(text).map((expected) => {
      const kept = source.includes(expected);
      if (!kept) {
        failed = true;
      }
      return { title: expected, status: kept ? 'passed' : 'failed', failureMessages: kept ? [] : [`no longer kept: ${expected}`] };
    });
    for (const message of messagesOf(name)) {
      failed = true;
      assertionResults.push({ title: 'reported', status: 'failed', failureMessages: [message] });
    }
    if (oddRun && directives[index].includes('flaky')) {
      failed = true;
      assertionResults.push({ title: 'flaky', status: 'failed', failureMessages: ['flaky: an odd run fails'] });
    }
    const status = assertionResults.some((assertion) => assertion.status === 'failed') ? 'failed' : 'passed';
    return { name, status, message: '', startTime: 1_000, endTime: 1_010, assertionResults };
  });
  fs.writeFileSync(outputFile, JSON.stringify({ numTotalTestSuites: testResults.length, success: !failed, testResults }));
  process.exitCode = failed ? 1 : 0;
}

if (mode === 'contracts' || mode.startsWith('contracts:')) {
  runContracts(mode.slice('contracts'.length));
} else if (mode.startsWith('report:')) {
  writeFixtureReport(mode.slice('report:'.length));
} else if (mode.startsWith('report-exit:')) {
  // A fixture as the report, then the given exit code: a report that passed while the command itself failed.
  const [name, code] = mode.slice('report-exit:'.length).split(':');
  writeFixtureReport(name);
  process.exitCode = Number(code);
} else if (mode === 'echo-pass') {
  fs.writeFileSync(outputFile, JSON.stringify(generatedReport('passed')));
} else if (mode === 'echo-pending') {
  fs.writeFileSync(outputFile, JSON.stringify(generatedReport('pending')));
} else if (mode === 'echo-outside') {
  const report = generatedReport('passed');
  for (const suite of report.testResults) {
    suite.name = '/nonexistent-qaspec-outside/elsewhere.spec.ts';
  }
  fs.writeFileSync(outputFile, JSON.stringify(report));
} else if (mode === 'huge') {
  fs.writeFileSync(outputFile, JSON.stringify(generatedReport('failed', 'x'.repeat(300_000))));
  process.stdout.write('o'.repeat(300_000));
  process.exitCode = 1;
} else if (mode === 'list') {
  // Jest prints absolute paths, one per line. The npm banner, the duplicate and the path outside the project
  // are there so the adapter's filters are exercised: the banner and the outside path must not be returned.
  process.stdout.write(
    [
      '> qaspec-fixture@1.0.0 test',
      '> jest --listTests',
      path.join(cwd, 'test', 'sum.spec.ts'),
      path.join(cwd, 'test', 'nested', 'other.spec.ts'),
      path.join(cwd, 'test', 'sum.spec.ts'),
      '/nonexistent-qaspec-outside/elsewhere.spec.ts',
      '',
    ].join('\n')
  );
} else if (mode === 'silent') {
  // Exits 0 without writing a report.
} else if (mode === 'garbage') {
  fs.writeFileSync(outputFile, 'not a report');
} else if (mode === 'exit3') {
  process.stderr.write('boom from the runner\n');
  process.exitCode = 3;
} else if (mode === 'signal') {
  process.kill(process.pid, 'SIGKILL');
} else if (mode === 'sleep') {
  setInterval(() => {}, 1_000);
} else {
  process.stderr.write(`fake-jest: unknown mode "${mode}"\n`);
  process.exitCode = 2;
}
