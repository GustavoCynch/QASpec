import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  GENERIC_RULE_IDS,
  assessCatchRun,
  decideJudgement,
  decideReport,
  globMatches,
  judgeCatchReport,
  medianOf,
  parseAssessRules,
  scoreOf,
  testPattern,
  type AssessRule,
} from '../../src/core/catch-assess.js';
import { MAX_MATCH_VALUE_LENGTH } from '../../src/core/execution-check.js';
import { recordRisk } from '../../src/core/catch-context.js';
import { recordEquivalence, recordMutant } from '../../src/core/catch-mutant.js';
import { readCatchRun, startCatchRun } from '../../src/core/catch-run.js';
import { runChildPhase } from '../../src/core/catch-child.js';
import { recordTest } from '../../src/core/catch-test.js';
import { CHANGE, makeProjectFixture, type ProjectFixture } from '../fixtures/catch-jest/catch-project.js';

let tmp: string;
let envBackup: NodeJS.ProcessEnv;

beforeEach(() => {
  envBackup = { ...process.env };
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qaspec-catch-assess-'));
  process.env.TMPDIR = tmp;
  process.env.TMP = tmp;
  process.env.TEMP = tmp;
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) {
    if (!(key in envBackup)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, envBackup);
});

const TEST_PATH = 'test/catch-currency.spec.ts';

/** A decision on a kept report of a behavior-change run, with no rule; each case overrides what it tests. */
function decision(overrides: Partial<Parameters<typeof decideReport>[0]> = {}) {
  return decideReport({
    path: TEST_PATH,
    messages: ['no longer kept: export const value = 1;'],
    intentClass: 'behavior-change',
    lowConfidence: false,
    rules: [],
    ...overrides,
  });
}

const rule = (id: string, match: AssessRule['match'], kind: AssessRule['kind'] = 'false-positive'): AssessRule => ({
  id,
  kind,
  match,
  reason: `reason of ${id}`,
});

describe('generic false-positive rules (S7)', () => {
  it.each([
    ['generic-environment', 'connect ECONNREFUSED 127.0.0.1:5432'],
    ['generic-environment', 'Server is down: the API did not answer'],
    ['generic-module', "Cannot find module './missing-helper' from 'test/catch-currency.spec.ts'"],
    ['generic-mock', 'Cannot spy the load property because it is not a function; undefined given instead'],
    ['generic-stub', 'NotImplementedError: the export is not implemented yet'],
    ['generic-call-count', 'Expected number of calls: 2\nReceived number of calls: 1'],
  ])('discards a report whose every failure message matches the %s rule: %s', (id, message) => {
    expect(decision({ messages: [message] })).toMatchObject({ outcome: 'rule-filtered', rule: id });
  });

  it('discards an order-only difference of a collection, and keeps a difference in a value', () => {
    const orderOnly = [
      'expect(received).toEqual(expected) // deep equality',
      '',
      '- Expected  - 2',
      '+ Received  + 2',
      '',
      '  Array [',
      '-   "a",',
      '    "b",',
      '+   "a"',
      '  ]',
    ].join('\n');
    const changedValue = orderOnly.replace('+   "a"', '+   "c"');

    expect(decision({ messages: [orderOnly] })).toMatchObject({ outcome: 'rule-filtered', rule: 'generic-order' });
    expect(decision({ messages: [changedValue] })).toMatchObject({ outcome: 'kept' });
  });

  it('applies a generic rule only when every failure message matches it, and never to a report with no message', () => {
    expect(decision({ messages: ['connect ECONNREFUSED 127.0.0.1:5432', 'no longer kept: export const value = 1;'] })).toMatchObject({
      outcome: 'kept',
    });
    expect(decision({ messages: [] })).toMatchObject({ outcome: 'kept' });
  });

  it('keeps a missing module that a source file names: the change may have removed that module', () => {
    expect(decision({ messages: ["Cannot find module './gone' from 'src/app.ts'"] })).toMatchObject({ outcome: 'kept' });
  });

  it('names the generic rules, so a per-project rule cannot reuse one of their ids', () => {
    expect(GENERIC_RULE_IDS).toEqual([
      'generic-environment',
      'generic-module',
      'generic-mock',
      'generic-stub',
      'generic-call-count',
      'generic-order',
    ]);
  });
});

describe('per-project rules (S7)', () => {
  it('matches the failure field when every failure message matches the regex', () => {
    const rules = [rule('wording', { failure: 'no longer kept: export const value' })];

    expect(decision({ rules })).toMatchObject({ outcome: 'rule-filtered', rule: 'wording', reason: 'reason of wording' });
    expect(decision({ rules, messages: ['no longer kept: export const value = 1;', 'something else'] })).toMatchObject({
      outcome: 'kept',
    });
  });

  it('matches the file field against the project-relative test path with a glob', () => {
    expect(decision({ rules: [rule('by-file', { file: 'test/**/*.spec.ts' })] })).toMatchObject({
      outcome: 'rule-filtered',
      rule: 'by-file',
    });
    expect(decision({ rules: [rule('by-file', { file: 'src/**/*.spec.ts' })] })).toMatchObject({ outcome: 'kept' });
  });

  it('matches the requirementStatus field only for a report whose requirement has one of the statuses', () => {
    const rules = [rule('modified-only', { requirementStatus: ['modified'] })];

    expect(decision({ rules, requirementStatus: 'modified' })).toMatchObject({ outcome: 'rule-filtered', rule: 'modified-only' });
    expect(decision({ rules, requirementStatus: 'preserved' })).toMatchObject({ outcome: 'kept' });
    expect(decision({ rules, requirementStatus: undefined, lowConfidence: true, intentClass: null })).toMatchObject({
      outcome: 'kept',
    });
  });

  it('matches the intentClass field only for a report of a run whose intent has one of the classes', () => {
    const rules = [rule('additive-only', { intentClass: ['additive'] })];

    expect(decision({ rules, intentClass: 'additive' })).toMatchObject({ outcome: 'rule-filtered', rule: 'additive-only' });
    expect(decision({ rules, intentClass: 'refactor' })).toMatchObject({ outcome: 'kept' });
    expect(decision({ rules, intentClass: null })).toMatchObject({ outcome: 'kept' });
  });

  it('requires every field a rule names to match, and applies the first matching rule in file order', () => {
    const rules = [
      rule('both', { file: 'test/**/*.spec.ts', requirementStatus: ['modified'] }),
      rule('first', { failure: 'no longer kept' }),
      rule('second', { failure: 'no longer kept' }),
    ];

    expect(decision({ rules, requirementStatus: 'preserved' })).toMatchObject({ outcome: 'rule-filtered', rule: 'first' });
    expect(decision({ rules: rules.slice(0, 1), requirementStatus: 'preserved' })).toMatchObject({ outcome: 'kept' });
  });

  it('never discards with a true-positive rule: it only adds a signal named after the rule', () => {
    expect(decision({ rules: [rule('checkout-total', { failure: 'no longer kept' }, 'true-positive')] })).toMatchObject({
      outcome: 'kept',
      signals: ['true-positive:checkout-total'],
    });
  });
});

describe('rules file validation (S7)', () => {
  const issuesOf = (text: string): string[] => {
    const parsed = parseAssessRules(text);
    if (parsed.ok) {
      throw new Error('the rules file should be refused');
    }
    return parsed.issues.map((issue) => issue.message);
  };

  it('reads a valid rules file and keeps its rules in file order', () => {
    const parsed = parseAssessRules(
      [
        'rules:',
        '  - id: wording',
        '    kind: false-positive',
        '    match: { failure: "no longer kept" }',
        '    reason: The wording of the test changed.',
        '  - id: checkout-total',
        '    kind: true-positive',
        '    match: { file: "test/**/*.spec.ts", requirementStatus: [modified] }',
        '    reason: The checkout total is a known risk.',
      ].join('\n')
    );

    expect(parsed).toMatchObject({
      ok: true,
      rules: [
        { id: 'wording', kind: 'false-positive' },
        { id: 'checkout-total', kind: 'true-positive' },
      ],
    });
  });

  it('refuses text that is not YAML, and a file with no rules list', () => {
    expect(issuesOf('rules: [unclosed')[0]).toMatch(/not valid YAML/);
    expect(issuesOf('kind: false-positive\n').join('\n')).toMatch(/rules/);
    expect(issuesOf('').join('\n')).toMatch(/rules/);
  });

  it('refuses an unknown key, an unknown kind and a rule with no reason', () => {
    const messages = issuesOf(
      [
        'rules:',
        '  - id: a',
        '    kind: maybe',
        '    match: { failure: x }',
        '    reason: r',
        '    extra: true',
        '  - id: b',
        '    kind: false-positive',
        '    match: { failure: x }',
      ].join('\n')
    ).join('\n');

    expect(messages).toMatch(/rules\[0\]\.kind/);
    expect(messages).toMatch(/extra/);
    expect(messages).toMatch(/rules\[1\]\.reason/);
  });

  it('refuses a rule without any condition, because it would match every report', () => {
    const messages = issuesOf('rules:\n  - id: all\n    kind: false-positive\n    match: {}\n    reason: r\n').join('\n');

    expect(messages).toMatch(/rules\[0\]\.match.*every report/);
  });

  it('refuses a failure regex that is not valid, a duplicate rule id and a reserved generic id', () => {
    const messages = issuesOf(
      [
        'rules:',
        '  - id: a',
        '    kind: false-positive',
        '    match: { failure: "(unclosed" }',
        '    reason: r',
        '  - id: a',
        '    kind: false-positive',
        '    match: { file: "test/**" }',
        '    reason: r',
        '  - id: generic-module',
        '    kind: false-positive',
        '    match: { file: "test/**" }',
        '    reason: r',
      ].join('\n')
    ).join('\n');

    expect(messages).toMatch(/rules\[0\]\.match\.failure is not a valid regular expression/);
    expect(messages).toMatch(/duplicate rule id "a"/);
    expect(messages).toMatch(/"generic-module" is reserved/);
  });

  it('refuses a requirementStatus or intentClass value that an intent does not have', () => {
    const messages = issuesOf(
      [
        'rules:',
        '  - id: a',
        '    kind: false-positive',
        '    match: { requirementStatus: [changed] }',
        '    reason: r',
        '  - id: b',
        '    kind: false-positive',
        '    match: { intentClass: [feature] }',
        '    reason: r',
      ].join('\n')
    ).join('\n');

    expect(messages).toMatch(/rules\[0\]\.match\.requirementStatus/);
    expect(messages).toMatch(/rules\[1\]\.match\.intentClass/);
  });
});

describe('bounded regular expressions (S7)', () => {
  it('evaluates a pattern on a short value, and gives undefined for a value it will not evaluate', () => {
    expect(testPattern('value = 1', 'export const value = 1;')).toBe(true);
    expect(testPattern('value = 2', 'export const value = 1;')).toBe(false);
    expect(testPattern('a', 'a'.repeat(MAX_MATCH_VALUE_LENGTH + 1))).toBeUndefined();
    expect(testPattern('(unclosed', 'anything')).toBeUndefined();
  });

  it('stops a regex that backtracks catastrophically: it does not match, and the rule is named as not evaluated', () => {
    const started = Date.now();
    const outcome = decision({
      messages: [`${'a'.repeat(32)}!`],
      rules: [rule('slow', { failure: '^(a+)+$' })],
    });

    expect(Date.now() - started).toBeLessThan(5000);
    expect(outcome).toMatchObject({ outcome: 'kept', rulesNotEvaluated: ['slow'] });
  }, 15000);

  it('matches a glob with * within one folder and ** across folders', () => {
    expect(globMatches('test/*.spec.ts', 'test/a.spec.ts')).toBe(true);
    expect(globMatches('test/*.spec.ts', 'test/nested/a.spec.ts')).toBe(false);
    expect(globMatches('test/**/*.spec.ts', 'test/nested/deep/a.spec.ts')).toBe(true);
    expect(globMatches('test/**/*.spec.ts', 'test/a.spec.ts')).toBe(true);
    expect(globMatches('src/**', 'test/a.spec.ts')).toBe(false);
  });
});

describe('intent signals (S2)', () => {
  it.each([
    ['preserved requirement', { requirementStatus: 'preserved' as const }, ['unexpected-for-intent']],
    ['refactor class', { requirementStatus: 'added' as const, intentClass: 'refactor' as const }, ['unexpected-for-intent']],
    ['modified requirement', { requirementStatus: 'modified' as const }, ['possibly-intended']],
    ['removed requirement', { requirementStatus: 'removed' as const }, ['possibly-intended']],
    ['requirement that was added', { requirementStatus: 'added' as const }, []],
  ])('gives a report on a %s the signals %j', (_label, input, signals) => {
    expect(decision(input)).toMatchObject({ outcome: 'kept', signals });
  });

  it('gives every report of a degraded run the low-confidence signal and no intent signal', () => {
    expect(decision({ lowConfidence: true, intentClass: null, requirementStatus: undefined })).toMatchObject({
      outcome: 'kept',
      signals: ['low-confidence'],
    });
  });
});

describe('judges: scores and the median (S7)', () => {
  it.each([
    [{ keep: true, confidence: 'high' }, 1],
    [{ keep: true, confidence: 'low' }, 1],
    [{ keep: false, confidence: 'low' }, 0.5],
    [{ keep: false, confidence: 'medium' }, -0.5],
    [{ keep: false, confidence: 'high' }, -1],
  ] as const)('scores the verdict %j as %d', (verdict, score) => {
    expect(scoreOf(verdict)).toBe(score);
  });

  const verdict = (judge: string, keep: boolean, confidence: 'high' | 'medium' | 'low') => ({
    judge,
    keep,
    confidence,
    rationale: 'r',
  });

  it.each([
    { label: 'a single keep', verdicts: [verdict('a', true, 'high')], median: 1, outcome: 'kept' },
    {
      label: 'two high discards and a keep',
      verdicts: [verdict('a', false, 'high'), verdict('b', false, 'high'), verdict('c', true, 'high')],
      median: -1,
      outcome: 'judge-filtered',
    },
    {
      label: 'a tie of two medium discards',
      verdicts: [verdict('a', false, 'medium'), verdict('b', false, 'medium'), verdict('c', true, 'high')],
      median: -0.5,
      outcome: 'judge-filtered',
    },
    {
      label: 'a low discard above a medium one',
      verdicts: [verdict('a', false, 'low'), verdict('b', false, 'medium'), verdict('c', true, 'high')],
      median: 0.5,
      outcome: 'kept',
    },
    {
      label: 'two keeps that outvote one high discard',
      verdicts: [verdict('a', true, 'high'), verdict('b', false, 'high'), verdict('c', true, 'low')],
      median: 1,
      outcome: 'kept',
    },
    {
      label: 'five judges: two medium discards, a high one, a low one and a keep',
      verdicts: [
        verdict('a', false, 'medium'),
        verdict('b', false, 'high'),
        verdict('c', false, 'medium'),
        verdict('d', false, 'low'),
        verdict('e', true, 'high'),
      ],
      median: -0.5,
      outcome: 'judge-filtered',
    },
    {
      label: 'five judges whose middle score is a low discard',
      verdicts: [
        verdict('a', false, 'medium'),
        verdict('b', true, 'high'),
        verdict('c', false, 'medium'),
        verdict('d', false, 'low'),
        verdict('e', true, 'low'),
      ],
      median: 0.5,
      outcome: 'kept',
    },
  ])('$label: the median is $median and the report is $outcome', ({ verdicts, median, outcome }) => {
    expect(decideJudgement(verdicts)).toMatchObject({ median, outcome });
  });

  it('keeps a tie at zero: a median that is not below 0 does not discard the report', () => {
    expect(medianOf([-0.5, 0.5])).toBe(0);
    expect(decideJudgement([verdict('a', false, 'low'), verdict('b', false, 'medium')])).toMatchObject({
      median: 0,
      outcome: 'kept',
    });
  });
});

describe('qaspec catch assess and judge on a real run (S7)', () => {
  /** A ready run with the functionality test T1 gated (the head changes the value, so T1 reports), plus extra tests. */
  async function reportRun(fx: ProjectFixture, extra: Array<{ path: string; content: string }> = []) {
    const started = await startCatchRun({ projectRoot: fx.project, changesDir: fx.changesDir, changeName: CHANGE });
    if (!started.started) {
      throw new Error('the run did not start');
    }
    const runId = started.run.runId;
    const gateTest = async (value: Record<string, unknown>) => {
      const outcome = await recordTest({ projectRoot: fx.project, changesDir: fx.changesDir, runId, value });
      if (!outcome.ok) {
        throw new Error(JSON.stringify(outcome.issues));
      }
    };
    await gateTest({
      kind: 'functionality',
      requirement: 'Currency',
      path: TEST_PATH,
      content: '// covers: src/app.ts\n// expect: export const value = 1;\n',
    });
    for (const test of extra) {
      await gateTest({ kind: 'functionality', requirement: 'Currency', ...test });
    }
    return { runId, runDir: started.runDir };
  }

  const classify = (fx: ProjectFixture, runId: string) => runChildPhase({ projectRoot: fx.project, changesDir: fx.changesDir, runId });
  const assess = (fx: ProjectFixture, runId: string) => assessCatchRun({ projectRoot: fx.project, changesDir: fx.changesDir, runId });
  const ledgerOf = (runDir: string): Array<Record<string, unknown>> =>
    fs
      .readFileSync(path.join(runDir, 'ledger.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  it('refuses assess on a ready run and writes nothing', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 1, childRuns: 1 } });
    const started = await startCatchRun({ projectRoot: fx.project, changesDir: fx.changesDir, changeName: CHANGE });
    if (!started.started) {
      throw new Error('the run did not start');
    }

    const outcome = await assess(fx, started.run.runId);

    expect(outcome).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'run-state' })] });
    expect(fs.existsSync(path.join(started.runDir, 'assessment.json'))).toBe(false);
    expect(readCatchRun(started.runDir).state).toBe('ready');
  });

  it('assesses a classified run once: keeps a modified-requirement report with its signal and moves the run to assessed', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 1, childRuns: 1 } });
    const { runId, runDir } = await reportRun(fx);
    expect((await classify(fx, runId)).status).toBe('classified');

    expect(await assess(fx, runId)).toMatchObject({
      ok: true,
      run: runId,
      assessment: { reports: [{ test: 'T1', outcome: 'kept', signals: ['possibly-intended'], lowConfidence: false }] },
    });
    expect(readCatchRun(runDir).state).toBe('assessed');
    expect(ledgerOf(runDir).find((entry) => entry.stage === 'assessed')).toMatchObject({ reports: 1, kept: 1, filtered: 0 });
    expect(await assess(fx, runId)).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'run-state' })] });
  });

  it('discards a report that a per-project rule names, records the rule id, and refuses its judgement', async () => {
    const fx = makeProjectFixture({
      root: tmp,
      gates: { parentRuns: 1, childRuns: 1 },
      rulesFile: {
        path: 'qaspec/references/catch-rules.yaml',
        content: [
          'rules:',
          '  - id: value-wording',
          '    kind: false-positive',
          '    match: { failure: "no longer kept: export const value" }',
          '    reason: The wording of the expectation is not the behavior.',
        ].join('\n') + '\n',
      },
    });
    const { runId, runDir } = await reportRun(fx);
    await classify(fx, runId);

    expect(await assess(fx, runId)).toMatchObject({
      ok: true,
      assessment: { reports: [{ test: 'T1', outcome: 'rule-filtered', rule: 'value-wording' }] },
    });
    expect(ledgerOf(runDir)).toEqual(
      expect.arrayContaining([expect.objectContaining({ stage: 'rule-filtered', test: 'T1', rule: 'value-wording' })])
    );
    expect(
      await judgeCatchReport({ projectRoot: fx.project, changesDir: fx.changesDir, runId, test: 'T1', value: { verdicts: [] } })
    ).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'rule-filtered' })] });
  });

  it('refuses a configured rules file that does not exist, and writes nothing', async () => {
    const fx = makeProjectFixture({
      root: tmp,
      gates: { parentRuns: 1, childRuns: 1 },
      rulesFile: { path: 'qaspec/references/missing-rules.yaml' },
    });
    const { runId, runDir } = await reportRun(fx);
    await classify(fx, runId);

    expect(await assess(fx, runId)).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'rules-file-missing', message: expect.stringMatching(/missing-rules\.yaml/) })],
    });
    expect(fs.existsSync(path.join(runDir, 'assessment.json'))).toBe(false);
    expect(readCatchRun(runDir).state).toBe('classified');
  });

  it('discards a report whose child failure is only a connection error, by the generic environment rule', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 1, childRuns: 1 } });
    const started = await startCatchRun({ projectRoot: fx.project, changesDir: fx.changesDir, changeName: CHANGE });
    if (!started.started) {
      throw new Error('the run did not start');
    }
    const runId = started.run.runId;
    // The label is kept on the head, so the only failure on the child is the scripted connection error.
    expect(
      await recordTest({
        projectRoot: fx.project,
        changesDir: fx.changesDir,
        runId,
        value: {
          kind: 'functionality',
          requirement: 'Currency',
          path: TEST_PATH,
          content: "// covers: src/app.ts\n// fake: message on head: connect ECONNREFUSED 127.0.0.1:5432\n// expect: export const label = 'value';\n",
        },
      })
    ).toMatchObject({ ok: true, test: { outcome: 'gated' } });
    expect((await classify(fx, runId)).status).toBe('classified');

    expect(await assess(fx, runId)).toMatchObject({
      ok: true,
      assessment: { reports: [{ test: 'T1', outcome: 'rule-filtered', rule: 'generic-environment' }] },
    });
  });

  it('judges a report: refuses the wrong state, a test that is not a report, a wrong verdict count and a second judgement', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 1, childRuns: 1 }, judges: 3 });
    const { runId, runDir } = await reportRun(fx, [
      { path: 'test/catch-land.spec.ts', content: "// covers: src/app.ts\n// expect: export const label = 'value';\n" },
    ]);
    const verdict = (judge: string, keep: boolean, confidence: 'high' | 'medium' | 'low' = 'high') => ({
      judge,
      keep,
      confidence,
      rationale: 'The expected value is the behavior of the change.',
    });
    const judgeTest = (value: unknown, test = 'T1') => judgeCatchReport({ projectRoot: fx.project, changesDir: fx.changesDir, runId, test, value });

    expect(await judgeTest({ verdicts: [verdict('a', true)] })).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'run-state' })],
    });

    await classify(fx, runId);
    await assess(fx, runId);

    expect(await judgeTest({ verdicts: [verdict('a', true)] })).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'verdicts-count', message: expect.stringMatching(/3 verdicts/) })],
    });
    expect(fs.existsSync(path.join(runDir, 'judges', 'T1.json'))).toBe(false);
    const three = { verdicts: [verdict('a', true), verdict('b', true), verdict('c', true)] };
    expect(await judgeTest(three, 'T9')).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'test-unknown' })] });
    expect(await judgeTest(three, 'T2')).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'not-a-report' })] });

    expect(await judgeTest({ verdicts: [verdict('a', true), verdict('b', true), verdict('c', false, 'low')] })).toMatchObject({
      ok: true,
      run: runId,
      test: 'T1',
      outcome: 'kept',
      median: 1,
    });
    expect(await judgeTest(three)).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'already-judged' })] });
    expect(JSON.parse(fs.readFileSync(path.join(runDir, 'judges', 'T1.json'), 'utf8'))).toMatchObject({
      test: 'T1',
      scores: [1, 1, 0.5],
      median: 1,
      outcome: 'kept',
    });
  });

  it('marks a judged report judge-filtered when the median is below 0, and the ledger says so', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 1, childRuns: 1 }, judges: 3 });
    const { runId, runDir } = await reportRun(fx);
    await classify(fx, runId);
    await assess(fx, runId);
    const verdict = (judge: string, keep: boolean, confidence: 'high' | 'medium' | 'low') => ({
      judge,
      keep,
      confidence,
      rationale: 'The expectation is a test detail.',
    });

    expect(
      await judgeCatchReport({
        projectRoot: fx.project,
        changesDir: fx.changesDir,
        runId,
        test: 'T1',
        value: { verdicts: [verdict('a', false, 'medium'), verdict('b', false, 'high'), verdict('c', true, 'high')] },
      })
    ).toMatchObject({ ok: true, outcome: 'judge-filtered', median: -0.5 });
    expect(ledgerOf(runDir)).toEqual(
      expect.arrayContaining([expect.objectContaining({ stage: 'judge-filtered', test: 'T1' })])
    );
  });

  it('gives every report of a degraded run the low-confidence signal and no intent signal', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 1, childRuns: 1 } });
    const started = await startCatchRun({
      projectRoot: fx.project,
      changesDir: fx.changesDir,
      changeName: CHANGE,
      withoutAnalysis: true,
      head: fx.head,
    });
    if (!started.started) {
      throw new Error('the degraded run did not start');
    }
    const runId = started.run.runId;
    expect(
      await recordTest({
        projectRoot: fx.project,
        changesDir: fx.changesDir,
        runId,
        value: { kind: 'dodgy-diff', path: TEST_PATH, content: '// covers: src/app.ts\n// expect: export const value = 1;\n' },
      })
    ).toMatchObject({ ok: true, test: { outcome: 'gated' } });
    expect((await classify(fx, runId)).status).toBe('classified');

    expect(await assess(fx, runId)).toMatchObject({
      ok: true,
      assessment: { lowConfidence: true, reports: [{ test: 'T1', outcome: 'kept', signals: ['low-confidence'], lowConfidence: true }] },
    });
  });

  it('gives a report on a preserved requirement the unexpected-for-intent signal, through a surviving mutant', async () => {
    const fx = makeProjectFixture({
      root: tmp,
      gates: { parentRuns: 1, childRuns: 1 },
      headFiles: { 'src/util.ts': 'export const util = 2;\n' },
    });
    const started = await startCatchRun({ projectRoot: fx.project, changesDir: fx.changesDir, changeName: CHANGE });
    if (!started.started) {
      throw new Error('the run did not start');
    }
    const runId = started.run.runId;
    expect(
      await recordRisk({ changesDir: fx.changesDir, runId, value: { requirement: 'Tax rounding', summary: 'the tax rounding changes' } })
    ).toMatchObject({ ok: true });
    expect(
      await recordMutant({
        projectRoot: fx.project,
        changesDir: fx.changesDir,
        runId,
        value: { risk: 'R1', file: 'src/util.ts', original: 'export const util = 1;', replacement: 'export const util = 3;' },
      })
    ).toMatchObject({ ok: true, mutant: { outcome: 'surviving' } });
    expect(
      recordEquivalence({ changesDir: fx.changesDir, runId, mutant: 'M1', value: { equivalent: false, rationale: 'The value is observable.' } })
    ).toMatchObject({ ok: true });
    expect(
      await recordTest({
        projectRoot: fx.project,
        changesDir: fx.changesDir,
        runId,
        value: {
          kind: 'catching',
          mutant: 'M1',
          path: 'test/catch-util.spec.ts',
          content: '// covers: src/util.ts\n// expect: export const util = 1;\n',
        },
      })
    ).toMatchObject({ ok: true, test: { outcome: 'gated' } });
    expect((await classify(fx, runId)).status).toBe('classified');

    expect(await assess(fx, runId)).toMatchObject({
      ok: true,
      assessment: { reports: [{ test: 'T1', outcome: 'kept', signals: ['unexpected-for-intent'] }] },
    });
  }, 30000);

  it('refuses a verdict file that lists one judge twice or gives an unknown confidence, and records nothing', async () => {
    const fx = makeProjectFixture({ root: tmp, gates: { parentRuns: 1, childRuns: 1 }, judges: 3 });
    const { runId, runDir } = await reportRun(fx);
    await classify(fx, runId);
    await assess(fx, runId);
    const discard = (judge: string, confidence: string) => ({
      judge,
      keep: false,
      confidence,
      rationale: 'The expectation is a test detail.',
    });
    const judge = (value: unknown) => judgeCatchReport({ projectRoot: fx.project, changesDir: fx.changesDir, runId, test: 'T1', value });

    const twice = await judge({ verdicts: [discard('a', 'high'), discard('a', 'high'), discard('b', 'high')] });
    const unknown = await judge({ verdicts: [discard('a', 'high'), discard('b', 'high'), discard('c', 'certain')] });

    expect(twice).toMatchObject({ ok: false, issues: [expect.objectContaining({ code: 'judge-duplicate', message: expect.stringMatching(/"a"/) })] });
    expect(unknown).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'verdict-invalid', message: expect.stringMatching(/confidence/) })],
    });
    expect(fs.existsSync(path.join(runDir, 'judges', 'T1.json'))).toBe(false);
    expect(readCatchRun(runDir).state).toBe('assessed');
  });
});
