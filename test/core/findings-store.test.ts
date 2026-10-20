import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FINDINGS_FILE,
  FINDINGS_MARKDOWN,
  answeredFindings,
  isIntendedAnswer,
  nextFindingId,
  readFindings,
  recordFindingAnswer,
  writeFindings,
  type FindingBase,
} from '../../src/core/findings-store.js';
import { LEDGER_FILE } from '../../src/core/run-store.js';

const RUN_ID = '20261020T120000Z-abcdef';
const T0 = new Date('2026-10-20T12:00:00.000Z');
/** A clock reading the given number of seconds after T0, so answer times are exact. */
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

let tmp: string;
let runDir: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qaspec-findings-store-'));
  runDir = path.join(tmp, RUN_ID);
  fs.mkdirSync(runDir);
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const finding = (id: string): FindingBase => ({
  id,
  question: `Question ${id}?`,
  reportedAt: T0.toISOString(),
});

/** Stores findings as a run holds them: findings.json only, with the question text as the list says. */
function storeFindings(findings: FindingBase[]): void {
  writeFindings(runDir, findings, '# findings\n');
}

const ledgerLines = (): Array<Record<string, unknown>> => {
  const file = path.join(runDir, LEDGER_FILE);
  return fs.existsSync(file)
    ? fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line) as Record<string, unknown>)
    : [];
};

describe('findings storage shared by execute and catch (S11)', () => {
  it('reads no findings from a run that has no findings file', () => {
    expect(readFindings(runDir)).toEqual([]);
  });

  it('reads the stored list of findings and refuses a findings file that is not a list', () => {
    storeFindings([finding('F1')]);
    expect(readFindings(runDir)).toEqual([finding('F1')]);

    fs.writeFileSync(path.join(runDir, FINDINGS_FILE), '{"id":"F1"}');
    expect(() => readFindings(runDir)).toThrow(
      `${path.join(runDir, FINDINGS_FILE)} is not a list of findings; the run cannot be trusted`
    );
  });

  it('writes findings.json as a two-space JSON list ending with a newline, and findings.md as given', () => {
    const findings = [finding('F1'), finding('F2')];

    writeFindings(runDir, findings, '# Findings\n');

    expect(fs.readFileSync(path.join(runDir, FINDINGS_FILE), 'utf8')).toBe(`${JSON.stringify(findings, null, 2)}\n`);
    expect(fs.readFileSync(path.join(runDir, FINDINGS_MARKDOWN), 'utf8')).toBe('# Findings\n');
  });

  it('numbers a new finding one above the findings already stored, from F1', () => {
    expect(nextFindingId([])).toBe('F1');
    expect(nextFindingId([finding('F1'), finding('F2')])).toBe('F3');
  });

  it('lists the answered findings: those with a confirmed or dismissed ledger line', () => {
    storeFindings([finding('F1'), finding('F2')]);
    recordFindingAnswer(runDir, RUN_ID, { finding: 'F2', intended: 'yes', now: at(3) });

    expect([...answeredFindings(runDir)]).toEqual(['F2']);
  });

  it('accepts only yes or no as an intended answer', () => {
    expect(isIntendedAnswer('yes')).toBe(true);
    expect(isIntendedAnswer('no')).toBe(true);
    expect(isIntendedAnswer('maybe')).toBe(false);
  });

  it('records no as confirmed and yes as dismissed, with the seconds from the report to the answer', () => {
    storeFindings([finding('F1'), finding('F2')]);

    const confirmed = recordFindingAnswer(runDir, RUN_ID, { finding: 'F1', intended: 'no', now: at(12.5) });
    const dismissed = recordFindingAnswer(runDir, RUN_ID, { finding: 'F2', intended: 'yes', now: at(4) });

    expect(confirmed).toEqual({
      ok: true,
      run: RUN_ID,
      finding: 'F1',
      intended: 'no',
      stage: 'confirmed',
      answeredAt: at(12.5).toISOString(),
      secondsToAnswer: 12.5,
    });
    expect(dismissed).toMatchObject({ ok: true, stage: 'dismissed', intended: 'yes', secondsToAnswer: 4 });
    expect(ledgerLines()).toEqual([
      { stage: 'confirmed', finding: 'F1', intended: 'no', at: at(12.5).toISOString(), secondsToAnswer: 12.5 },
      { stage: 'dismissed', finding: 'F2', intended: 'yes', at: at(4).toISOString(), secondsToAnswer: 4 },
    ]);
  });

  it('keeps the trimmed note of an answer, and drops a note that is blank', () => {
    storeFindings([finding('F1'), finding('F2')]);

    const noted = recordFindingAnswer(runDir, RUN_ID, { finding: 'F1', intended: 'no', note: '  kept on purpose  ', now: at(1) });
    const blank = recordFindingAnswer(runDir, RUN_ID, { finding: 'F2', intended: 'no', note: '   ', now: at(2) });

    expect(noted).toMatchObject({ ok: true, note: 'kept on purpose' });
    expect(blank).toMatchObject({ ok: true });
    expect(blank.ok && 'note' in blank).toBe(false);
    expect(ledgerLines()[0]).toEqual({
      stage: 'confirmed',
      finding: 'F1',
      intended: 'no',
      note: 'kept on purpose',
      at: at(1).toISOString(),
      secondsToAnswer: 1,
    });
  });

  it('refuses an unknown finding, a second answer and an intended value other than yes or no, and records nothing', () => {
    storeFindings([finding('F1')]);
    recordFindingAnswer(runDir, RUN_ID, { finding: 'F1', intended: 'no', now: at(2) });
    const linesBefore = ledgerLines().length;

    const unknown = recordFindingAnswer(runDir, RUN_ID, { finding: 'F9', intended: 'yes', now: at(3) });
    const again = recordFindingAnswer(runDir, RUN_ID, { finding: 'F1', intended: 'yes', now: at(4) });
    const invalid = recordFindingAnswer(runDir, RUN_ID, { finding: 'F1', intended: 'maybe', now: at(5) });

    expect(unknown).toEqual({
      ok: false,
      reason: 'finding-unknown',
      message: `Finding F9 does not exist in run ${RUN_ID}`,
    });
    expect(again).toEqual({
      ok: false,
      reason: 'finding-answered',
      message: `Finding F1 was already answered in run ${RUN_ID}: an answer is recorded once`,
    });
    expect(invalid).toEqual({ ok: false, reason: 'intended-invalid', message: '--intended must be yes or no' });
    expect(ledgerLines()).toHaveLength(linesBefore);
  });
});
