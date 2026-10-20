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
function coveredSources(text) {
  return [...text.matchAll(/^\/\/ covers: (.+?)\s*$/gm)].map((match) => match[1]);
}

function expectations(text) {
  return [...text.matchAll(/^\/\/ expect: (.+?)\s*$/gm)].map((match) => match[1]);
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
  let failed = false;
  const testResults = tests.map((file) => {
    const name = path.resolve(cwd, file);
    const text = fs.readFileSync(name, 'utf8');
    const source = fs.readFileSync(path.join(cwd, coveredSources(text)[0]), 'utf8');
    if (source.includes('@@BROKEN@@')) {
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
