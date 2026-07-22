/**
 * Scaffold QASpec reference files on init (create-if-missing).
 */

import path from 'path';
import { FileSystemUtils } from '../utils/file-system.js';

const REFERENCES_DIR = path.join('qaspec', 'references');

export const REFERENCE_FILES = {
  historicalBugs: 'historical_bugs.md',
  tcmsRules: 'tcms_case_rules.md',
} as const;

/**
 * Legacy → current filename renames applied by `migrateReferenceFilenames`.
 * Add new entries here for future reference-file renames.
 */
const RENAME_MAP: ReadonlyArray<{ legacy: string; current: string }> = [
  { legacy: 'qase_test_case_rules.md', current: REFERENCE_FILES.tcmsRules },
];

const ENGLISH_HISTORICAL_BUGS = `# Historical bugs — project reference

Document recurrent production bugs and risk patterns for your product.
Agents read this file at the start of every \`/qsx:analyze\` run (re-read each time; do not cache).

## How to use

- Add one section per pattern (area, historical issues, activation signals, expected coverage).
- Keep entries conditional: apply only when the current change intersects the pattern.
- Update after every significant production incident or regression postmortem.

## Example section (replace with your data)

### Area
- Example: CSV export, filters, pagination

### Historical issues
- Example: Export ignores active filters and downloads the full dataset.

### Activation signals
- Changes touching export, filter state, or pagination APIs.

### Expected coverage
- Regression cases that prove filters and page boundaries are respected.
`;

const ENGLISH_TCMS_RULES = `# TCMS test case rules (MCP)

Rules for creating suites and cases in your team's test case management system (TCMS) via MCP
(e.g. Qase's \`create_suite\`, \`create_case\`).
Read before \`/qsx:cases\` and again before \`/qsx:publish\`.

## Field mapping (conceptual)

**Omit-on-unmapped:** Any TCMS field not listed below MUST be omitted from MCP payloads or sent with the documented default — never inferred.

| Case field | Source in testcases.md | Default | Allowed values |
|------------|-------------------------|---------|----------------|
| title | Checkbox line text (after \`- [ ] N.N\`) | — | Plain-language, tester-observable |
| description (preconditions) | **Preconditions** block (numbered list) | empty | Project language |
| steps (action) | **Steps** table (Action column) | — | One step per row |
| steps (expected) | **Steps** table (Expected column) | empty for transition steps | Observable outcomes |
| suite | \`## Suite:\` heading above the case | — | Plain language module/feature name |

Do not send severity, priority, or type unless your team extends this table with explicit mapping rules.

## Suites

- One suite per logical module or feature (\`## Suite:\` group in \`testcases.md\`).
- Suite titles use plain language visible to testers.

## Cases

- Titles and steps: tester-observable behavior in the **project language** (see \`qaspec/config.yaml\`).
- No code identifiers (camelCase fields, selectors, file paths) in TCMS-bound text unless shown in the UI.
- One checkbox in \`testcases.md\` maps to one TCMS case after publish.
- Under each checkbox line, cases phase writes **Preconditions** and **Steps** (Action + Expected per step). Publish reads those blocks for the create-case call — do not re-generate from the title alone.
- Mandatory traceability: \`<!-- req: capability/requirement-slug -->\`, \`<!-- req: assumption:<id> -->\`, or \`<!-- req: gap -->\` on every case.

## Test case structure

\`\`\`markdown
- [ ] 1.1 Observable title
  <!-- req: capability/requirement-slug -->

  **Preconditions:**
  1. Environment access
  2. Role and tenant
  3. Case-specific setup from sources

  **Steps:**
  | # | Action | Expected |
  | 1 | Navigate to [base URL] | |
  | 2 | ... | ... |
\`\`\`

Build steps from \`analysis.md\`, diff, requirements, and specs — not invented vague flows.

## Preconditions template

1. Environment access (name your staging/dev environment).
2. Role and tenant (e.g. logged in as [ROLE] in [ORG]).
3. Case-specific data setup from sources read for the change.

## Customize

This section is the extension point: plug in your provider's concrete field codes here.
Replace this file with your team's TCMS field codes and extend the mapping table with explicit source/default/allowed values for additional fields.
`;

export async function scaffoldQaspecReferences(projectRoot: string): Promise<string[]> {
  const created: string[] = [];
  const refsDir = path.join(projectRoot, REFERENCES_DIR);

  if (!(await FileSystemUtils.directoryExists(refsDir))) {
    await FileSystemUtils.createDirectory(refsDir);
  }

  const seeds: Array<{ name: string; content: string }> = [
    { name: REFERENCE_FILES.historicalBugs, content: ENGLISH_HISTORICAL_BUGS },
    { name: REFERENCE_FILES.tcmsRules, content: ENGLISH_TCMS_RULES },
  ];

  for (const { name, content } of seeds) {
    const filePath = path.join(refsDir, name);
    if (!(await FileSystemUtils.fileExists(filePath))) {
      await FileSystemUtils.writeFile(filePath, content);
      created.push(path.join(REFERENCES_DIR, name));
    }
  }

  return created;
}

/**
 * One-time, idempotent, content-preserving rename of legacy reference filenames
 * to their current names. Checks the new filename first: if it already exists,
 * legacy is left untouched (never overwritten). Errors are swallowed/logged
 * best-effort so a locked or edge-case file never aborts init/update.
 *
 * @returns relative paths (from projectRoot) of files that were renamed.
 */
export async function migrateReferenceFilenames(projectRoot: string): Promise<string[]> {
  const renamed: string[] = [];
  const refsDir = path.join(projectRoot, REFERENCES_DIR);

  for (const { legacy, current } of RENAME_MAP) {
    try {
      const currentPath = path.join(refsDir, current);
      if (await FileSystemUtils.fileExists(currentPath)) {
        continue;
      }

      const legacyPath = path.join(refsDir, legacy);
      if (!(await FileSystemUtils.fileExists(legacyPath))) {
        continue;
      }

      await FileSystemUtils.moveFile(legacyPath, currentPath);
      renamed.push(path.join(REFERENCES_DIR, current));
    } catch (error: any) {
      console.debug(`Unable to migrate reference file "${legacy}" -> "${current}": ${error?.message ?? error}`);
    }
  }

  return renamed;
}
