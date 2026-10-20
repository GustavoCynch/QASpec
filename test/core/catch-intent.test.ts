import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { buildCatchIntent, readIntentClass } from '../../src/core/catch-intent.js';

const CHANGE = 'add-export';

/** analysis.md with an Affected capabilities section and an Intent class section. */
function analysisFile(options: { affected?: string; intent?: string | null } = {}): string {
  const affected = options.affected ?? '- billing-export';
  const intent = options.intent === undefined ? 'Intent class: additive' : options.intent;
  return [
    '# Analysis',
    '## Summary',
    'Export changes for invoices.',
    '## Affected capabilities',
    affected,
    '## Intent class',
    ...(intent === null ? [] : [intent]),
    '## Approval digest',
    'Pending.',
  ].join('\n\n') + '\n';
}

/** A requirement block with its scenario blocks, in the QASpec spec format. */
function requirement(name: string, scenarios: string[] = []): string {
  return [`### Requirement: ${name}`, `The system SHALL ${name}.`, ...scenarios].join('\n\n');
}

/** A scenario block; each step is written without its bullet marker, for example "**WHEN** ...". */
function scenario(title: string, steps: string[]): string {
  return [`#### Scenario: ${title}`, steps.map((step) => `- ${step}`).join('\n')].join('\n\n');
}

interface DeltaSections {
  added?: string[];
  modified?: string[];
  removed?: string[];
  renamed?: Array<[from: string, to: string]>;
}

function deltaSpec(sections: DeltaSections): string {
  const parts: string[] = [];
  if (sections.added) {
    parts.push(['## ADDED Requirements', ...sections.added].join('\n\n'));
  }
  if (sections.modified) {
    parts.push(['## MODIFIED Requirements', ...sections.modified].join('\n\n'));
  }
  if (sections.removed) {
    parts.push(
      ['## REMOVED Requirements', ...sections.removed.map((name) => `### Requirement: ${name}`)].join('\n\n')
    );
  }
  if (sections.renamed) {
    parts.push(
      [
        '## RENAMED Requirements',
        ...sections.renamed.map(
          ([from, to]) => `- FROM: \`### Requirement: ${from}\`\n- TO: \`### Requirement: ${to}\``
        ),
      ].join('\n\n')
    );
  }
  return parts.join('\n\n') + '\n';
}

function baseSpec(requirements: string[]): string {
  return ['# Billing Specification', '## Purpose', 'Billing exports for invoices.', '## Requirements', ...requirements].join(
    '\n\n'
  ) + '\n';
}

describe('catch intent', () => {
  let root: string;

  const write = async (relativePath: string, content: string) => {
    const target = path.join(root, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf-8');
  };

  /** Writes a change with its analysis.md and delta specs (capability -> spec content). */
  const writeChange = async (fixture: {
    name?: string;
    intent?: string | null;
    affected?: string;
    deltas?: Record<string, string>;
  } = {}): Promise<string> => {
    const name = fixture.name ?? CHANGE;
    await write(
      path.join('qaspec', 'changes', name, 'analysis.md'),
      analysisFile({ affected: fixture.affected, intent: fixture.intent })
    );
    for (const [capability, content] of Object.entries(fixture.deltas ?? {})) {
      await write(path.join('qaspec', 'changes', name, 'specs', capability, 'spec.md'), content);
    }
    return name;
  };

  const writeBase = (capability: string, content: string) =>
    write(path.join('qaspec', 'specs', capability, 'spec.md'), content);

  const changeDir = (name = CHANGE) => path.join(root, 'qaspec', 'changes', name);

  beforeEach(async () => {
    root = path.join(os.tmpdir(), `qaspec-catch-intent-${randomUUID()}`);
    await fs.mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  describe('readIntentClass', () => {
    it('reads the class from the Intent class section of analysis.md', async () => {
      await writeChange({ intent: 'Intent class: behavior-change' });

      expect(readIntentClass(changeDir())).toEqual({ status: 'valid', intentClass: 'behavior-change' });
    });

    it('reads the class when the label is written in bold', async () => {
      await writeChange({ intent: '**Intent class:** refactor' });
      expect(readIntentClass(changeDir())).toEqual({ status: 'valid', intentClass: 'refactor' });

      await writeChange({ intent: '- **Intent class**: behavior-change' });
      expect(readIntentClass(changeDir())).toEqual({ status: 'valid', intentClass: 'behavior-change' });
    });

    it('reports a missing section when analysis.md has no Intent class heading', async () => {
      await write(
        path.join('qaspec', 'changes', CHANGE, 'analysis.md'),
        '# Analysis\n\n## Affected capabilities\n\n- billing-export\n'
      );

      expect(readIntentClass(changeDir())).toEqual({ status: 'missing' });
    });

    it('reports a missing line when the Intent class section has no Intent class line', async () => {
      await writeChange({ intent: null });

      expect(readIntentClass(changeDir())).toEqual({ status: 'missing' });
    });

    it('does not count an Intent class line that is inside a multi-line HTML comment', async () => {
      await writeChange({ intent: '<!--\nIntent class: refactor\n-->' });

      expect(readIntentClass(changeDir())).toEqual({ status: 'missing' });
    });

    it('reports the unfilled template placeholder as invalid', async () => {
      await writeChange({ intent: 'Intent class: <refactor | additive | behavior-change>' });

      expect(readIntentClass(changeDir())).toEqual({
        status: 'invalid',
        values: ['<refactor | additive | behavior-change>'],
      });
    });

    it('rejects a value outside the three classes', async () => {
      await writeChange({ intent: 'Intent class: refactoring' });

      expect(readIntentClass(changeDir())).toEqual({ status: 'invalid', values: ['refactoring'] });
    });

    it('rejects a class stated on more than one line', async () => {
      await writeChange({ intent: 'Intent class: additive\n\nIntent class: refactor' });

      expect(readIntentClass(changeDir())).toEqual({ status: 'invalid', values: ['additive', 'refactor'] });
    });

    it('reads the legacy analisis.md when analysis.md is absent', async () => {
      await write(path.join('qaspec', 'changes', CHANGE, 'analisis.md'), analysisFile({ intent: 'Intent class: additive' }));

      expect(readIntentClass(changeDir())).toEqual({ status: 'valid', intentClass: 'additive' });
    });

    it('reports a missing class when the change has no analysis file', () => {
      expect(readIntentClass(changeDir())).toEqual({ status: 'missing' });
    });
  });

  describe('buildCatchIntent consistency checks', () => {
    it('rejects refactor when a delta adds a requirement', async () => {
      await writeChange({
        intent: 'Intent class: refactor',
        deltas: { 'billing-export': deltaSpec({ added: [requirement('CSV export')] }) },
      });

      expect(buildCatchIntent(root, CHANGE)).toMatchObject({
        ok: false,
        errors: [
          {
            code: 'intent-class-contradiction',
            capability: 'billing-export',
            requirement: 'CSV export',
          },
        ],
      });
    });

    it('rejects refactor when a delta spec file exists, even without requirements', async () => {
      await writeChange({
        intent: 'Intent class: refactor',
        deltas: { 'billing-export': '## ADDED Requirements\n' },
      });

      expect(buildCatchIntent(root, CHANGE)).toMatchObject({
        ok: false,
        errors: [{ code: 'intent-class-contradiction', capability: 'billing-export' }],
      });
    });

    it('rejects additive with each MODIFIED, REMOVED and RENAMED requirement', async () => {
      await writeChange({
        intent: 'Intent class: additive',
        deltas: {
          'billing-export': deltaSpec({
            modified: [requirement('Currency')],
            removed: ['Legacy export'],
            renamed: [['Invoice naming', 'Invoice numbering']],
          }),
        },
      });

      const outcome = buildCatchIntent(root, CHANGE);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.errors.map((error) => [error.code, error.requirement])).toEqual([
        ['intent-class-contradiction', 'Currency'],
        ['intent-class-contradiction', 'Legacy export'],
        ['intent-class-contradiction', 'Invoice numbering'],
      ]);
      expect(outcome.errors[0].message).toContain('MODIFIED');
      expect(outcome.errors[2].message).toContain('Invoice naming');
    });

    it('reports a renamed requirement once when its MODIFIED body is in the same delta', async () => {
      await writeChange({
        intent: 'Intent class: additive',
        deltas: {
          'billing-export': deltaSpec({
            modified: [requirement('Invoice numbering')],
            renamed: [['Invoice naming', 'Invoice numbering']],
          }),
        },
      });

      const outcome = buildCatchIntent(root, CHANGE);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.errors.map((error) => error.requirement)).toEqual(['Invoice numbering']);
      expect(outcome.errors[0].message).toContain('RENAMED "Invoice naming" to "Invoice numbering"');
    });

    it('rejects behavior-change when the deltas only add requirements', async () => {
      await writeChange({
        intent: 'Intent class: behavior-change',
        deltas: { 'billing-export': deltaSpec({ added: [requirement('CSV export')] }) },
      });

      const outcome = buildCatchIntent(root, CHANGE);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.errors).toHaveLength(1);
      expect(outcome.errors[0].code).toBe('intent-class-contradiction');
      expect(outcome.errors[0].message).toContain('CSV export');
    });

    it('rejects behavior-change when no delta requirement exists', async () => {
      await writeChange({ intent: 'Intent class: behavior-change' });

      const outcome = buildCatchIntent(root, CHANGE);

      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.errors.map((error) => error.code)).toEqual(['intent-class-contradiction']);
    });

    it('accepts a class that matches the deltas', async () => {
      await writeChange({ name: 'refactor-only', intent: 'Intent class: refactor' });
      await writeChange({
        name: 'additive-only',
        intent: 'Intent class: additive',
        deltas: { 'billing-export': deltaSpec({ added: [requirement('CSV export')] }) },
      });
      await writeChange({
        name: 'behavior',
        intent: 'Intent class: behavior-change',
        deltas: { 'billing-export': deltaSpec({ modified: [requirement('Currency')] }) },
      });

      expect(buildCatchIntent(root, 'refactor-only').ok).toBe(true);
      expect(buildCatchIntent(root, 'additive-only').ok).toBe(true);
      expect(buildCatchIntent(root, 'behavior').ok).toBe(true);
    });

    it('returns an actionable error without a map when the intent class is missing', async () => {
      await writeChange({ intent: null });

      const outcome = buildCatchIntent(root, CHANGE);

      expect(outcome).toMatchObject({ ok: false, change: CHANGE, errors: [{ code: 'intent-class-missing' }] });
      if (outcome.ok) return;
      expect(outcome.errors[0].message).toMatch(/approve/i);
    });

    it('returns an error naming the value when the intent class is invalid', async () => {
      await writeChange({ intent: 'Intent class: refactoring' });

      const outcome = buildCatchIntent(root, CHANGE);

      expect(outcome).toMatchObject({ ok: false, errors: [{ code: 'intent-class-invalid' }] });
      if (outcome.ok) return;
      expect(outcome.errors[0].message).toContain('refactoring');
    });

    it('reports a change that does not exist', () => {
      expect(buildCatchIntent(root, 'missing-change')).toMatchObject({
        ok: false,
        change: 'missing-change',
        errors: [{ code: 'change-not-found' }],
      });
    });
  });

  describe('buildCatchIntent per-requirement map', () => {
    it('maps untouched base requirements to preserved and each delta to its status', async () => {
      await writeBase(
        'billing-export',
        baseSpec([requirement('Totals'), requirement('Currency'), requirement('Legacy export'), requirement('Invoice naming')])
      );
      await writeChange({
        intent: 'Intent class: behavior-change',
        deltas: {
          'billing-export': deltaSpec({
            added: [requirement('CSV export')],
            modified: [requirement('Currency')],
            removed: ['Legacy export'],
            renamed: [['Invoice naming', 'Invoice numbering']],
          }),
        },
      });

      const outcome = buildCatchIntent(root, CHANGE);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      const requirements = outcome.intent.capabilities[0].requirements;
      expect(requirements.map((entry) => `${entry.status}:${entry.name}`)).toEqual([
        'preserved:Totals',
        'added:CSV export',
        'modified:Currency',
        'removed:Legacy export',
        'renamed:Invoice numbering',
      ]);
      expect(requirements[4].from).toBe('Invoice naming');
    });

    it('takes scenarios from the base spec for preserved, removed and unchanged renamed requirements', async () => {
      await writeBase(
        'billing-export',
        baseSpec([
          requirement('Totals', [
            scenario('Totals kept', ['**WHEN** an invoice is exported', '**THEN** the total equals the sum of lines']),
          ]),
          requirement('Legacy export', [
            scenario('Legacy export works', ['**WHEN** a legacy file is requested', '**THEN** the legacy file is returned']),
          ]),
          requirement('Invoice naming', [
            scenario('Naming kept', ['**WHEN** an invoice is numbered', '**THEN** the number is unique']),
          ]),
        ])
      );
      await writeChange({
        intent: 'Intent class: behavior-change',
        deltas: {
          'billing-export': deltaSpec({
            added: [requirement('CSV export', [scenario('CSV header row', ['**WHEN** the file is built', '**THEN** the first row holds the headers'])])],
            removed: ['Legacy export'],
            renamed: [['Invoice naming', 'Invoice numbering']],
          }),
        },
      });

      const outcome = buildCatchIntent(root, CHANGE);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      const byName = Object.fromEntries(outcome.intent.capabilities[0].requirements.map((entry) => [entry.name, entry]));
      expect(byName['Totals'].scenarios).toEqual([
        { title: 'Totals kept', when: ['an invoice is exported'], then: ['the total equals the sum of lines'] },
      ]);
      expect(byName['Legacy export'].scenarios).toEqual([
        { title: 'Legacy export works', when: ['a legacy file is requested'], then: ['the legacy file is returned'] },
      ]);
      expect(byName['Invoice numbering'].scenarios).toEqual([
        { title: 'Naming kept', when: ['an invoice is numbered'], then: ['the number is unique'] },
      ]);
      expect(byName['CSV export'].scenarios).toEqual([
        { title: 'CSV header row', when: ['the file is built'], then: ['the first row holds the headers'] },
      ]);
    });

    it('takes a renamed requirement body from the MODIFIED block under its new name, as one renamed entry', async () => {
      await writeBase(
        'billing-export',
        baseSpec([requirement('Invoice naming', [scenario('Naming kept', ['**WHEN** an invoice is numbered', '**THEN** the number is unique'])])])
      );
      await writeChange({
        intent: 'Intent class: behavior-change',
        deltas: {
          'billing-export': deltaSpec({
            modified: [
              requirement('Invoice numbering', [
                scenario('Numbering v2', ['**WHEN** an invoice is issued', '**THEN** it gets the next number']),
              ]),
            ],
            renamed: [['Invoice naming', 'Invoice numbering']],
          }),
        },
      });

      const outcome = buildCatchIntent(root, CHANGE);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.intent.capabilities[0].requirements).toEqual([
        {
          name: 'Invoice numbering',
          status: 'renamed',
          from: 'Invoice naming',
          scenarios: [{ title: 'Numbering v2', when: ['an invoice is issued'], then: ['it gets the next number'] }],
        },
      ]);
    });

    it('lists capabilities from delta files and from Affected capabilities, and nothing else', async () => {
      await writeBase('billing-export', baseSpec([requirement('Totals')]));
      await writeBase('user-auth', baseSpec([requirement('Login')]));
      await writeBase('audit-log', baseSpec([requirement('Audit trail')]));
      await writeChange({
        affected: '- billing-export, user-auth, notifications',
        intent: 'Intent class: additive',
        deltas: { 'billing-export': deltaSpec({ added: [requirement('CSV export')] }) },
      });

      const outcome = buildCatchIntent(root, CHANGE);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      const capabilities = outcome.intent.capabilities;
      expect(capabilities.map((capability) => capability.name)).toEqual(['billing-export', 'notifications', 'user-auth']);
      expect(capabilities.find((capability) => capability.name === 'user-auth')?.requirements).toEqual([
        { name: 'Login', status: 'preserved', scenarios: [] },
      ]);
      expect(capabilities.find((capability) => capability.name === 'notifications')?.requirements).toEqual([]);
    });

    it('reads Affected capabilities from bullets and comma lists and ignores comments and prose', async () => {
      await writeChange({
        affected: '<!-- Kebab-case capability names -->\n- billing-export, `user-auth`\n- Notes about the export flow',
        intent: 'Intent class: refactor',
      });

      const outcome = buildCatchIntent(root, CHANGE);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.intent.capabilities.map((capability) => capability.name)).toEqual(['billing-export', 'user-auth']);
    });

    it('does not treat the word none in Affected capabilities as a capability', async () => {
      await writeChange({ affected: '- none', intent: 'Intent class: refactor' });

      const outcome = buildCatchIntent(root, CHANGE);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.intent.capabilities).toEqual([]);
    });

    it('parses WHEN, THEN and AND steps and attaches each AND to the preceding step', async () => {
      await writeChange({
        intent: 'Intent class: additive',
        deltas: {
          'billing-export': deltaSpec({
            added: [
              requirement('Export rows', [
                scenario('Two currencies', [
                  '**WHEN** the user exports invoices',
                  '**AND** the account has two currencies',
                  '**THEN** each currency gets its own file',
                  '**AND** totals are not mixed',
                ]),
                scenario('Empty export', ['**WHEN** nothing is due', '**THEN** an empty file is written']),
              ]),
            ],
          }),
        },
      });

      const outcome = buildCatchIntent(root, CHANGE);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.intent.capabilities[0].requirements[0].scenarios).toEqual([
        {
          title: 'Two currencies',
          when: ['the user exports invoices', 'the account has two currencies'],
          then: ['each currency gets its own file', 'totals are not mixed'],
        },
        { title: 'Empty export', when: ['nothing is due'], then: ['an empty file is written'] },
      ]);
    });

    it('returns the schema, change, intent class and capabilities', async () => {
      await writeChange({
        intent: 'Intent class: additive',
        deltas: { 'billing-export': deltaSpec({ added: [requirement('CSV export')] }) },
      });

      expect(buildCatchIntent(root, CHANGE)).toEqual({
        ok: true,
        intent: {
          schema: 'qaspec.catch-intent/v1',
          change: CHANGE,
          intentClass: 'additive',
          capabilities: [
            {
              name: 'billing-export',
              requirements: [{ name: 'CSV export', status: 'added', scenarios: [] }],
            },
          ],
        },
      });
    });
  });
});
