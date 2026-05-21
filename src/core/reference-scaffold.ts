/**
 * Scaffold QASpec reference files on init (create-if-missing).
 */

import path from 'path';
import { FileSystemUtils } from '../utils/file-system.js';

const REFERENCES_DIR = path.join('qaspec', 'references');

export const REFERENCE_FILES = {
  historicalBugs: 'historical_bugs.md',
  qaseRules: 'qase_test_case_rules.md',
} as const;

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

const ENGLISH_QASE_RULES = `# Qase test case rules (MCP)

Rules for creating suites and cases in Qase via MCP (\`create_suite\`, \`create_case\`).
Read before \`/qsx:matrix\` and again before \`/qsx:publish\`.

## Suites

- One suite per logical module or feature (\`## Suite:\` group in \`testmatrix.md\`).
- Suite titles use plain language visible to testers.

## Cases

- Titles and steps: tester-observable behavior in the **project language** (see \`qaspec/config.yaml\`).
- No code identifiers (camelCase fields, selectors, file paths) in Qase-bound text unless shown in the UI.
- One checkbox in \`testmatrix.md\` maps to one Qase case after publish.
- Under each checkbox line, matrix phase writes **Preconditions** and **Steps** (Action + Expected per step). Publish reads those blocks for \`create_case\` — do not re-generate from the title alone.

## Matrix case structure

\`\`\`markdown
- [ ] 1.1 Observable title

  **Preconditions:**
  1. Environment access
  2. Role and tenant
  3. Case-specific setup from sources

  **Steps:**
  | # | Action | Expected |
  | 1 | Navigate to [base URL] | |
  | 2 | ... | ... |
\`\`\`

Build steps from \`analisis.md\`, diff, requirements, and specs — not invented vague flows.

## Preconditions template

1. Environment access (name your staging/dev environment).
2. Role and tenant (e.g. logged in as [ROLE] in [ORG]).
3. Case-specific data setup from sources read for the change.

## Customize

Replace this file with your team's Qase field codes, severity/priority mapping, and step format rules.
`;

export async function scaffoldQaspecReferences(projectRoot: string): Promise<string[]> {
  const created: string[] = [];
  const refsDir = path.join(projectRoot, REFERENCES_DIR);

  if (!(await FileSystemUtils.directoryExists(refsDir))) {
    await FileSystemUtils.createDirectory(refsDir);
  }

  const seeds: Array<{ name: string; content: string }> = [
    { name: REFERENCE_FILES.historicalBugs, content: ENGLISH_HISTORICAL_BUGS },
    { name: REFERENCE_FILES.qaseRules, content: ENGLISH_QASE_RULES },
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
