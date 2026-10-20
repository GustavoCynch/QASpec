/**
 * Findings storage shared by /qsx:execute and /qsx:catch (T10, S11).
 *
 * A finding is one sense-check question, kept in findings.json as a list in creation order; its owner renders the
 * findings.md text. recordFindingAnswer writes the person's answer as one ledger line: confirmed when the behavior is
 * not intended, dismissed when it is, with the seconds from the report to the answer. The callers own the question
 * text, the run states and their own refusals, and hold the run lock around every call here.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { appendLedgerEntry, readLedger, writeFileAtomic } from './run-store.js';

export const FINDINGS_FILE = 'findings.json';
export const FINDINGS_MARKDOWN = 'findings.md';
const INTENDED_ANSWERS = ['yes', 'no'] as const;

export type IntendedAnswer = (typeof INTENDED_ANSWERS)[number];

/** The fields every finding carries. Its owner adds the rest: the case of execute, the test and evidence of catch. */
export interface FindingBase {
  /** Stable id in creation order: F1, F2, ... */
  id: string;
  /** One sense-check question that ends with "Is this intended?". */
  question: string;
  reportedAt: string;
}

export function isIntendedAnswer(value: string): value is IntendedAnswer {
  return (INTENDED_ANSWERS as readonly string[]).includes(value);
}

/** The findings of a run in creation order. A run with no findings file has none. */
export function readFindings<T extends FindingBase = FindingBase>(runDir: string): T[] {
  const file = path.join(runDir, FINDINGS_FILE);
  if (!existsSync(file)) {
    return [];
  }
  const findings = JSON.parse(readFileSync(file, 'utf-8')) as unknown;
  if (!Array.isArray(findings)) {
    throw new Error(`${file} is not a list of findings; the run cannot be trusted`);
  }
  return findings as T[];
}

/** The id of the next finding: one above the number already stored, so ids follow the order of the reports. */
export function nextFindingId(findings: readonly FindingBase[]): string {
  return `F${findings.length + 1}`;
}

/** Stores the findings and their rendered text: findings.json first, then findings.md. */
export function writeFindings(runDir: string, findings: readonly FindingBase[], markdown: string): void {
  writeFileAtomic(path.join(runDir, FINDINGS_FILE), `${JSON.stringify(findings, null, 2)}\n`);
  writeFileAtomic(path.join(runDir, FINDINGS_MARKDOWN), markdown);
}

/** The ids of the findings that have an answer: each answer is one confirmed or dismissed ledger line. */
export function answeredFindings(runDir: string): Set<string> {
  return new Set(
    readLedger(runDir)
      .filter((entry) => entry.stage === 'confirmed' || entry.stage === 'dismissed')
      .map((entry) => String(entry.finding))
  );
}

export interface FindingAnswerInput {
  finding: string;
  intended: string;
  note?: string;
  /** The answer time; defaults to now. */
  now?: Date;
}

export type FindingAnswerReason = 'intended-invalid' | 'finding-unknown' | 'finding-answered';

export type FindingAnswerOutcome =
  | {
      ok: true;
      run: string;
      finding: string;
      intended: IntendedAnswer;
      stage: 'confirmed' | 'dismissed';
      note?: string;
      answeredAt: string;
      secondsToAnswer: number;
    }
  | { ok: false; reason: FindingAnswerReason; message: string };

/**
 * Records the answer to one finding, once: no (not intended) confirms it and yes (intended) dismisses it. The seconds
 * run from the report of the finding to the answer. Nothing is written for a refusal. The caller holds the run lock.
 */
export function recordFindingAnswer(runDir: string, runId: string, input: FindingAnswerInput): FindingAnswerOutcome {
  if (!isIntendedAnswer(input.intended)) {
    return { ok: false, reason: 'intended-invalid', message: '--intended must be yes or no' };
  }
  const finding = readFindings(runDir).find((entry) => entry.id === input.finding);
  if (!finding) {
    return { ok: false, reason: 'finding-unknown', message: `Finding ${input.finding} does not exist in run ${runId}` };
  }
  if (answeredFindings(runDir).has(finding.id)) {
    return {
      ok: false,
      reason: 'finding-answered',
      message: `Finding ${finding.id} was already answered in run ${runId}: an answer is recorded once`,
    };
  }

  const at = (input.now ?? new Date()).toISOString();
  const elapsedMs = Date.parse(at) - Date.parse(finding.reportedAt);
  const secondsToAnswer = Math.round(Math.max(0, elapsedMs)) / 1000;
  const intended = input.intended;
  const stage = intended === 'no' ? 'confirmed' : 'dismissed';
  const note = input.note?.trim() ? input.note.trim() : undefined;
  appendLedgerEntry(runDir, {
    stage,
    finding: finding.id,
    intended,
    ...(note !== undefined ? { note } : {}),
    at,
    secondsToAnswer,
  });
  return {
    ok: true,
    run: runId,
    finding: finding.id,
    intended,
    stage,
    ...(note !== undefined ? { note } : {}),
    answeredAt: at,
    secondsToAnswer,
  };
}
