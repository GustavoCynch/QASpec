/**
 * Change intent for /qsx:catch: the intent class approved in analysis.md, checked against the
 * change's delta specs, and the per-requirement map built from the deltas and the base specs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import fg from 'fast-glob';
import { resolveAnalysisFile } from './approval-ledger.js';
import { joinPlanningPath } from './planning-dir.js';
import {
  extractRequirementsSection,
  parseDeltaSpec,
  type DeltaPlan,
  type RequirementBlock,
} from './parsers/requirement-blocks.js';

export const CATCH_INTENT_SCHEMA = 'qaspec.catch-intent/v1' as const;

export const INTENT_CLASSES = ['refactor', 'additive', 'behavior-change'] as const;

export type IntentClass = (typeof INTENT_CLASSES)[number];

export type IntentClassRead =
  | { status: 'valid'; intentClass: IntentClass }
  | { status: 'missing' }
  | { status: 'invalid'; values: string[] };

export interface CatchScenario {
  title: string;
  when: string[];
  then: string[];
}

export type CatchRequirementStatus = 'preserved' | 'added' | 'modified' | 'removed' | 'renamed';

export interface CatchRequirement {
  name: string;
  status: CatchRequirementStatus;
  /** Only for renamed requirements: the name before the rename. */
  from?: string;
  scenarios: CatchScenario[];
}

export interface CatchCapability {
  name: string;
  requirements: CatchRequirement[];
}

export interface CatchIntent {
  schema: typeof CATCH_INTENT_SCHEMA;
  change: string;
  intentClass: IntentClass;
  capabilities: CatchCapability[];
}

export type CatchIntentIssueCode =
  | 'change-not-found'
  | 'intent-class-missing'
  | 'intent-class-invalid'
  | 'intent-class-contradiction';

export interface CatchIntentIssue {
  code: CatchIntentIssueCode;
  message: string;
  capability?: string;
  requirement?: string;
}

export type CatchIntentOutcome =
  | { ok: true; intent: CatchIntent }
  | { ok: false; change: string; errors: CatchIntentIssue[] };

const INTENT_CLASS_HEADING = /^##\s+Intent class\s*$/i;
// The label may be plain or bold: "Intent class:", "**Intent class:**" or "**Intent class**:".
const INTENT_CLASS_LINE = /^\s*(?:[-*]\s+)?(?:\*\*Intent class:\*\*|\*\*Intent class\*\*:|Intent class:)(.*)$/i;
const AFFECTED_CAPABILITIES_HEADING = /^##\s+Affected capabilities\s*$/i;
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NO_CAPABILITY_TOKEN = 'none';
const SECTION_END = /^#{1,2}\s/;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const SCENARIO_HEADER = /^####\s+Scenario:\s*(.*?)\s*$/i;
const SCENARIO_STEP = /^\s*[-*]\s+\*\*(WHEN|THEN|AND)\*\*\s*(.*?)\s*$/i;

const NO_DELTA: DeltaPlan = {
  added: [],
  modified: [],
  removed: [],
  renamed: [],
  sectionPresence: { added: false, modified: false, removed: false, renamed: false },
};

interface DeltaEntry {
  capability: string;
  kind: 'added' | 'modified' | 'removed' | 'renamed';
  name: string;
  from?: string;
}

/** Text under a level-2 heading up to the next level-1 or level-2 heading, without HTML comments; null when the heading is absent. */
function sectionBody(content: string, heading: RegExp): string | null {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) {
    return null;
  }
  let end = start + 1;
  while (end < lines.length && !SECTION_END.test(lines[end])) {
    end++;
  }
  return lines.slice(start + 1, end).join('\n').replace(HTML_COMMENT, '');
}

/** Reads the single "Intent class: <value>" line under "## Intent class" in the change's analysis file. */
export function readIntentClass(changeDir: string): IntentClassRead {
  const analysisPath = resolveAnalysisFile(changeDir);
  if (!analysisPath) {
    return { status: 'missing' };
  }

  const body = sectionBody(fs.readFileSync(analysisPath, 'utf-8'), INTENT_CLASS_HEADING);
  if (body === null) {
    return { status: 'missing' };
  }

  const values = body
    .split('\n')
    .map((line) => line.match(INTENT_CLASS_LINE)?.[1])
    .filter((value): value is string => value !== undefined)
    .map((value) => value.trim());

  if (values.length === 0) {
    return { status: 'missing' };
  }
  if (values.length > 1) {
    return { status: 'invalid', values };
  }
  if ((INTENT_CLASSES as readonly string[]).includes(values[0])) {
    return { status: 'valid', intentClass: values[0] as IntentClass };
  }
  return { status: 'invalid', values };
}

/** Capability names listed under "## Affected capabilities": bullets or comma lists of kebab-case names. */
function readAffectedCapabilities(content: string): string[] {
  const body = sectionBody(content, AFFECTED_CAPABILITIES_HEADING);
  if (body === null) {
    return [];
  }

  const names: string[] = [];
  for (const line of body.split('\n')) {
    for (const token of line.replace(/^\s*[-*]\s+/, '').split(',')) {
      const name = token.replace(/[`*]/g, '').trim();
      if (KEBAB_CASE.test(name) && name !== NO_CAPABILITY_TOKEN && !names.includes(name)) {
        names.push(name);
      }
    }
  }
  return names;
}

/** Delta specs of the change (specs/<capability>/spec.md), keyed by capability and sorted by path. */
function readDeltas(changeDir: string): Map<string, DeltaPlan> {
  const deltas = new Map<string, DeltaPlan>();
  const files = fg.sync('specs/**/spec.md', { cwd: changeDir, onlyFiles: true }).sort();
  for (const file of files) {
    const capability = path.posix.relative('specs', path.posix.dirname(file));
    if (!capability) {
      continue;
    }
    deltas.set(capability, parseDeltaSpec(fs.readFileSync(path.join(changeDir, file), 'utf-8')));
  }
  return deltas;
}

/**
 * MODIFIED blocks that change a requirement in place. Changes apply RENAMED before MODIFIED, so a
 * MODIFIED block under a RENAMED target is the body of that renamed requirement, not a second change.
 */
function inPlaceModified(plan: DeltaPlan): RequirementBlock[] {
  const renamedTo = new Set(plan.renamed.map((pair) => pair.to));
  return plan.modified.filter((block) => !renamedTo.has(block.name));
}

function deltaEntries(deltas: Map<string, DeltaPlan>): DeltaEntry[] {
  const entries: DeltaEntry[] = [];
  for (const [capability, plan] of deltas) {
    for (const block of plan.added) {
      entries.push({ capability, kind: 'added', name: block.name });
    }
    for (const block of inPlaceModified(plan)) {
      entries.push({ capability, kind: 'modified', name: block.name });
    }
    for (const name of plan.removed) {
      entries.push({ capability, kind: 'removed', name });
    }
    for (const pair of plan.renamed) {
      entries.push({ capability, kind: 'renamed', name: pair.to, from: pair.from });
    }
  }
  return entries;
}

function describeEntry(entry: DeltaEntry): string {
  return entry.kind === 'renamed'
    ? `RENAMED "${entry.from}" to "${entry.name}"`
    : `${entry.kind.toUpperCase()} "${entry.name}"`;
}

function contradiction(entry: DeltaEntry, message: string): CatchIntentIssue {
  return {
    code: 'intent-class-contradiction',
    message,
    capability: entry.capability,
    requirement: entry.name,
  };
}

/** Each delta that the approved class forbids, or one issue when behavior-change has no changed requirement. */
function checkConsistency(intentClass: IntentClass, entries: DeltaEntry[]): CatchIntentIssue[] {
  if (intentClass === 'refactor') {
    return entries.map((entry) =>
      contradiction(
        entry,
        `Intent class "refactor" allows no delta requirements, but ${entry.capability} has ${describeEntry(entry)}. Remove that delta, or set the class to additive or behavior-change.`
      )
    );
  }

  if (intentClass === 'additive') {
    return entries
      .filter((entry) => entry.kind !== 'added')
      .map((entry) =>
        contradiction(
          entry,
          `Intent class "additive" allows only ADDED requirements, but ${entry.capability} has ${describeEntry(entry)}. Set the class to behavior-change.`
        )
      );
  }

  if (entries.some((entry) => entry.kind !== 'added')) {
    return [];
  }
  const detail =
    entries.length === 0
      ? 'found no delta requirements'
      : `the deltas only add ${entries.map((entry) => `"${entry.name}"`).join(', ')}`;
  return [
    {
      code: 'intent-class-contradiction',
      message: `Intent class "behavior-change" needs at least one MODIFIED, REMOVED or RENAMED requirement in the delta specs (${detail}). Set the class to additive if the change only adds requirements, or add the changed requirement under MODIFIED.`,
    },
  ];
}

function parseScenarios(raw: string): CatchScenario[] {
  const scenarios: CatchScenario[] = [];
  let current: CatchScenario | undefined;
  let last: 'when' | 'then' = 'when';

  for (const line of raw.split('\n')) {
    const header = line.match(SCENARIO_HEADER);
    if (header) {
      current = { title: header[1], when: [], then: [] };
      scenarios.push(current);
      last = 'when';
      continue;
    }
    if (!current) {
      continue;
    }
    const step = line.match(SCENARIO_STEP);
    if (!step) {
      continue;
    }
    const keyword = step[1].toUpperCase();
    if (keyword === 'WHEN') {
      current.when.push(step[2]);
      last = 'when';
    } else if (keyword === 'THEN') {
      current.then.push(step[2]);
      last = 'then';
    } else {
      current[last].push(step[2]);
    }
  }
  return scenarios;
}

function scenariosOf(blocks: RequirementBlock[], name: string): CatchScenario[] | undefined {
  const block = blocks.find((candidate) => candidate.name === name);
  return block ? parseScenarios(block.raw) : undefined;
}

function isFile(filePath: string): boolean {
  return fs.statSync(filePath, { throwIfNoEntry: false })?.isFile() ?? false;
}

function readBaseBlocks(projectRoot: string, capability: string): RequirementBlock[] {
  const specPath = joinPlanningPath(projectRoot, 'specs', capability, 'spec.md');
  if (!isFile(specPath)) {
    return [];
  }
  return extractRequirementsSection(fs.readFileSync(specPath, 'utf-8')).bodyBlocks;
}

/**
 * Base requirements no delta touches are preserved; each delta requirement carries its own status.
 * Order: preserved, added, modified, removed, renamed.
 */
function buildRequirements(base: RequirementBlock[], delta: DeltaPlan): CatchRequirement[] {
  const touched = new Set<string>([
    ...delta.added.map((block) => block.name),
    ...delta.modified.map((block) => block.name),
    ...delta.removed,
    ...delta.renamed.flatMap((pair) => [pair.from, pair.to]),
  ]);

  return [
    ...base
      .filter((block) => !touched.has(block.name))
      .map((block) => ({ name: block.name, status: 'preserved' as const, scenarios: parseScenarios(block.raw) })),
    ...delta.added.map((block) => ({ name: block.name, status: 'added' as const, scenarios: parseScenarios(block.raw) })),
    ...inPlaceModified(delta).map((block) => ({
      name: block.name,
      status: 'modified' as const,
      scenarios: parseScenarios(block.raw),
    })),
    ...delta.removed.map((name) => ({
      name,
      status: 'removed' as const,
      scenarios: scenariosOf(base, name) ?? [],
    })),
    ...delta.renamed.map((pair) => ({
      name: pair.to,
      status: 'renamed' as const,
      from: pair.from,
      scenarios: scenariosOf(delta.modified, pair.to) ?? scenariosOf(base, pair.from) ?? [],
    })),
  ];
}

function fail(change: string, errors: CatchIntentIssue[]): CatchIntentOutcome {
  return { ok: false, change, errors };
}

/**
 * Builds the intent of a change from its approved analysis.md and delta specs. Read-only.
 * Returns the issues instead of an intent when the class is missing or invalid, or contradicts the deltas.
 */
export function buildCatchIntent(projectRoot: string, changeName: string): CatchIntentOutcome {
  const changeDir = joinPlanningPath(projectRoot, 'changes', changeName);
  if (!fs.statSync(changeDir, { throwIfNoEntry: false })?.isDirectory()) {
    return fail(changeName, [
      { code: 'change-not-found', message: `Change "${changeName}" was not found in qaspec/changes.` },
    ]);
  }

  const analysisPath = resolveAnalysisFile(changeDir);
  const analysisName = analysisPath ? path.basename(analysisPath) : 'analysis.md';
  const approveHint = `Then approve the change again: qaspec approve analyze --change ${changeName}`;
  const classRead = readIntentClass(changeDir);

  if (classRead.status === 'missing') {
    const message = analysisPath
      ? `${analysisName} has no "Intent class: <refactor | additive | behavior-change>" line under "## Intent class". Run /qsx:analyze to add exactly one value. ${approveHint}`
      : `No analysis.md in the change. Run /qsx:analyze, then approve the change: qaspec approve analyze --change ${changeName}`;
    return fail(changeName, [{ code: 'intent-class-missing', message }]);
  }

  if (classRead.status === 'invalid') {
    const message =
      classRead.values.length > 1
        ? `${analysisName} states "Intent class:" ${classRead.values.length} times (${classRead.values.join(', ')}). Keep exactly one line. ${approveHint}`
        : `${analysisName} sets Intent class to "${classRead.values[0]}"; it must be exactly one of: refactor, additive, behavior-change. ${approveHint}`;
    return fail(changeName, [{ code: 'intent-class-invalid', message }]);
  }

  const deltas = readDeltas(changeDir);
  const entries = deltaEntries(deltas);
  const contradictions = checkConsistency(classRead.intentClass, entries);
  if (classRead.intentClass === 'refactor') {
    // A refactor has no delta specs at all, so a delta spec file without requirements contradicts it too.
    const withEntries = new Set(entries.map((entry) => entry.capability));
    for (const capability of deltas.keys()) {
      if (!withEntries.has(capability)) {
        contradictions.push({
          code: 'intent-class-contradiction',
          message: `Intent class "refactor" allows no delta specs, but specs/${capability}/spec.md exists. Remove it, or set the class to additive or behavior-change.`,
          capability,
        });
      }
    }
  }
  if (contradictions.length > 0) {
    return fail(changeName, contradictions.map((issue) => ({ ...issue, message: `${issue.message} ${approveHint}` })));
  }

  const affected = analysisPath ? readAffectedCapabilities(fs.readFileSync(analysisPath, 'utf-8')) : [];
  const capabilityNames = [...new Set([...deltas.keys(), ...affected])].sort();
  const capabilities = capabilityNames.map((name) => ({
    name,
    requirements: buildRequirements(readBaseBlocks(projectRoot, name), deltas.get(name) ?? NO_DELTA),
  }));

  return {
    ok: true,
    intent: {
      schema: CATCH_INTENT_SCHEMA,
      change: changeName,
      intentClass: classRead.intentClass,
      capabilities,
    },
  };
}
