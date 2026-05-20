## MODIFIED Requirements

### Requirement: Matrix workflow behavior

The `qas-matrix` skill and `/qas:matrix` command SHALL produce `testmatrix.md` with mandatory checkboxes, create or update change delta specs under `specs/**/*.md` in the same phase, read `qaspec/references/qase_test_case_rules.md`, read `openspec/specs/<capability>/spec.md` for capabilities listed in `analisis.md` when present, and halt once for human approval of **both** the case list and the requirements.

#### Scenario: Matrix format

- **WHEN** matrix output is written
- **THEN** each test case is a single `- [ ]` line with observable title text under a `##` suite heading

#### Scenario: Co-produced delta specs

- **WHEN** the agent completes a matrix phase turn before the halt
- **THEN** the change contains or updates at least one `specs/<capability>/spec.md` delta when the change introduces or modifies testable behavior
- **AND** requirements and scenarios stay aligned with cases in `testmatrix.md`

#### Scenario: Single halt for matrix and specs

- **WHEN** the matrix phase ends awaiting user approval
- **THEN** the agent asks exactly one question covering approval of the matrix and the specs together
- **AND** the agent does not start publish or Qase MCP in the same message

#### Scenario: Chat iteration updates both artifacts

- **WHEN** the user requests case or requirement changes after the initial matrix draft
- **THEN** the agent updates `testmatrix.md` and affected `specs/**/*.md` in the same conversation without requiring a separate slash command

## ADDED Requirements

### Requirement: Analyze workflow seeds capabilities

The `qas-analyze` skill and `/qas:analyze` command SHALL include an **Affected capabilities** section in `analisis.md` using kebab-case names and SHALL NOT write `specs/**/*.md` in the analyze step.

#### Scenario: Analyze does not write specs

- **WHEN** analyze completes with a halt
- **THEN** `analisis.md` exists
- **AND** no new `specs/<capability>/spec.md` files are required from the analyze step alone

### Requirement: Publish validates specs exist

The `qas-publish` skill SHALL treat missing change delta specs as blocking when the schema requires the `specs` artifact, and SHALL read completed `specs/**/*.md` for context before MCP when files exist.

#### Scenario: Publish blocked without specs

- **WHEN** `testmatrix.md` exists but no files exist under the change `specs/` directory and the schema apply phase requires `specs`
- **THEN** the agent does not invoke Qase MCP
- **AND** the agent directs the user to complete `/qas:matrix` (or author deltas) before publish
