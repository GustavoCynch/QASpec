/**
 * Findings of /qsx:catch (T10, S8, S10, S11, L36). A report that the rules and the judges kept becomes one cheap question:
 * "Before: <before>. Now: <after>. The scenario says: <THEN text, or that no scenario covers it>. Is this intended?". The
 * CLI composes the question from the texts the agent wrote; the failure excerpt, the test, the signals and the degraded
 * mark travel with it. catch answer records the person's answer on the core that qaspec execute answer uses
 * (findings-store.ts), so both commands count their answers the same way.
 */

import path from 'node:path';
import { z } from 'zod';
import type { CatchResult } from './catch-child.js';
import { assessedReportOf, failureMessages, readJudgement, reportContextOf, runStateIssue } from './catch-assess.js';
import type { CatchIntentArtifact } from './catch-context.js';
import { keepHead } from './catch-runner.js';
import {
  INTENT_FILE,
  TESTS_DIRNAME,
  findCatchRun,
  readCatchRun,
  readRecord,
  readRunJson,
  withCatchRunLock,
  type CatchRecordIssue,
} from './catch-run.js';
import type { CatchTest } from './catch-test.js';
import {
  type FindingAnswerOutcome,
  type FindingBase,
  isIntendedAnswer,
  nextFindingId,
  readFindings,
  recordFindingAnswer,
  writeFindings,
} from './findings-store.js';
import { RUN_LOCK_TIMEOUT_MS, appendLedgerEntry } from './run-store.js';

/** Longest text of the before and after of a report: one or two sentences, so the question stays cheap to answer. */
export const MAX_FINDING_TEXT_CHARS = 1000;
/** Bytes of the first failure message a finding quotes. */
const FAILURE_EXCERPT_BYTES = 1024;

export interface CatchFinding extends FindingBase {
  /** The report the question is about, such as T1. */
  test: string;
  /** The project-relative path of the test file that failed. */
  path: string;
  before: string;
  after: string;
  /** The title of the scenario the question quotes; null when no scenario covers the change. */
  scenario: string | null;
  /** The signals of the assessment: intent signals, the low-confidence mark and the true-positive rules that matched. */
  signals: string[];
  /** True for a degraded run: it has no approved intent, so the finding is of lower confidence. */
  lowConfidence: boolean;
  /** A bounded excerpt of the first failure message of the child runs; null when none was recorded. */
  failure: string | null;
}

/** The text with a full stop at its end, unless it already ends with punctuation. */
const sentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/**
 * The sense-check question of a finding, composed from the before and after texts and the THEN lines of the scenario the
 * report names. Without a scenario the question says so. The THEN lines are joined with "and".
 */
export function composeFindingQuestion(input: { before: string; after: string; then?: readonly string[] }): string {
  const lines = (input.then ?? []).map((line) => line.trim().replace(/[.!?]+$/, '')).filter((line) => line !== '');
  const scenario = lines.length === 0 ? 'no scenario covers it' : lines.join(' and ');
  return `Before: ${sentence(input.before)} Now: ${sentence(input.after)} The scenario says: ${sentence(scenario)} Is this intended?`;
}

const ReportInputSchema = z.strictObject({
  before: z
    .string({ error: 'before must be text' })
    .trim()
    .min(1, { error: 'before must not be empty' })
    .max(MAX_FINDING_TEXT_CHARS, { error: `before must be at most ${MAX_FINDING_TEXT_CHARS} characters` }),
  after: z
    .string({ error: 'after must be text' })
    .trim()
    .min(1, { error: 'after must not be empty' })
    .max(MAX_FINDING_TEXT_CHARS, { error: `after must be at most ${MAX_FINDING_TEXT_CHARS} characters` }),
});

/** The findings as findings.md shows them: the question of each, its test, its signals and the failure it quotes. */
export function renderCatchFindings(runId: string, findings: readonly CatchFinding[]): string {
  const lines = [
    `# Findings of run ${runId}`,
    '',
    `Answer each finding with: qaspec catch answer --run ${runId} --finding <id> --intended yes|no [--note-file <file>]`,
    '',
  ];
  for (const finding of findings) {
    lines.push(`## ${finding.id}: test ${finding.test}`, '', finding.question, '', `Test file: ${finding.path}`);
    if (finding.lowConfidence) {
      lines.push('Low confidence: this run has no approved intent (degraded mode).');
    }
    if (finding.signals.length > 0) {
      lines.push(`Signals: ${finding.signals.join(', ')}`);
    }
    if (finding.failure !== null) {
      lines.push('', 'Failure:', '', ...finding.failure.split('\n').map((line) => `    ${line}`));
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** The bounded excerpt of the first failure message of a report, or null when it has none. */
function excerptOf(result: CatchResult): string | null {
  const [first] = failureMessages(result);
  return first === undefined ? null : keepHead(first, FAILURE_EXCERPT_BYTES);
}

export interface ReportCatchFindingInput {
  changesDir: string;
  runId: string;
  /** The report to record, such as T1. */
  test: string;
  /** The parsed input file: { before, after }, the texts the agent wrote from the failure evidence. */
  value: unknown;
  lockTimeoutMs?: number;
  /** The report time; defaults to now. */
  now?: Date;
}

export type ReportCatchFindingOutcome = { ok: true; run: string; finding: CatchFinding } | { ok: false; issues: CatchRecordIssue[] };

/**
 * Records the finding of one report that the rules and the judges kept, once. It refuses a report that is not judged, a
 * report the judges discarded, a second report of the same test and an invalid input, and writes nothing for a refusal.
 * Writes findings.json and findings.md, and one reported line in the ledger.
 */
export function reportCatchFinding(input: ReportCatchFindingInput): ReportCatchFindingOutcome {
  const location = findCatchRun(input.changesDir, input.runId);
  return withCatchRunLock(location.runDir, input.lockTimeoutMs ?? RUN_LOCK_TIMEOUT_MS, (): ReportCatchFindingOutcome => {
    const run = readCatchRun(location.runDir);
    if (run.state !== 'assessed') {
      return { ok: false, issues: [runStateIssue(run, 'qaspec catch report', 'assessed')] };
    }
    const report = assessedReportOf(location.runDir, run.runId, input.test);
    if (!report.ok) {
      return report;
    }
    const judgement = readJudgement(location.runDir, input.test);
    if (judgement === undefined) {
      return {
        ok: false,
        issues: [{ code: 'not-judged', message: `${input.test} has not been judged: run qaspec catch judge first` }],
      };
    }
    if (judgement.outcome !== 'kept') {
      return {
        ok: false,
        issues: [
          {
            code: 'judge-filtered',
            message: `${input.test} was discarded by the judges (median ${judgement.median}): only a report the judges kept is reported`,
          },
        ],
      };
    }
    const findings = readFindings<CatchFinding>(location.runDir);
    if (findings.some((finding) => finding.test === input.test)) {
      return {
        ok: false,
        issues: [{ code: 'already-reported', message: `${input.test} was already reported in run ${run.runId}: a report is recorded once` }],
      };
    }
    const parsed = ReportInputSchema.safeParse(input.value);
    if (!parsed.success) {
      return { ok: false, issues: parsed.error.issues.map((issue) => ({ code: 'input-invalid', message: issue.message })) };
    }

    const intent = readRunJson<CatchIntentArtifact>(location.runDir, INTENT_FILE);
    const test = readRecord<CatchTest>(path.join(location.runDir, TESTS_DIRNAME), input.test);
    if (test === undefined) {
      throw new Error(`Report ${input.test} of run ${run.runId} has no test record; the run cannot be trusted`);
    }
    const context = reportContextOf(location.runDir, intent, test);
    const { before, after } = parsed.data;
    const at = (input.now ?? new Date()).toISOString();
    const finding: CatchFinding = {
      id: nextFindingId(findings),
      test: input.test,
      path: test.path,
      question: composeFindingQuestion({ before, after, then: context.scenario?.then }),
      reportedAt: at,
      before,
      after,
      scenario: context.scenario?.title ?? null,
      signals: report.entry.signals,
      lowConfidence: run.lowConfidence,
      failure: excerptOf(report.result),
    };
    const updated = [...findings, finding];
    writeFindings(location.runDir, updated, renderCatchFindings(run.runId, updated));
    appendLedgerEntry(location.runDir, { stage: 'reported', at, finding: finding.id, test: input.test });
    return { ok: true, run: run.runId, finding };
  });
}

export interface AnswerCatchFindingInput {
  changesDir: string;
  runId: string;
  /** The finding to answer, such as F1. */
  finding: string;
  /** yes (intended, dismissed) or no (not intended, confirmed). */
  intended: string;
  /** The note of the person, from --note-file; blank notes are dropped. */
  note?: string;
  lockTimeoutMs?: number;
  /** The answer time; defaults to now. */
  now?: Date;
}

export type AnswerCatchFindingOutcome = Extract<FindingAnswerOutcome, { ok: true }> | { ok: false; issues: CatchRecordIssue[] };

/**
 * Records the answer of the person to one finding, once, on the shared answer core. An answer names the finding by its
 * id; the code of a refusal is the reason the core gives: intended-invalid, finding-unknown or finding-answered.
 */
export function answerCatchFinding(input: AnswerCatchFindingInput): AnswerCatchFindingOutcome {
  const location = findCatchRun(input.changesDir, input.runId);
  return withCatchRunLock(location.runDir, input.lockTimeoutMs ?? RUN_LOCK_TIMEOUT_MS, (): AnswerCatchFindingOutcome => {
    if (!isIntendedAnswer(input.intended)) {
      return { ok: false, issues: [{ code: 'intended-invalid', message: '--intended must be yes or no' }] };
    }
    const outcome = recordFindingAnswer(location.runDir, location.run.runId, {
      finding: input.finding,
      intended: input.intended,
      note: input.note,
      now: input.now,
    });
    return outcome.ok ? outcome : { ok: false, issues: [{ code: outcome.reason, message: outcome.message }] };
  });
}
