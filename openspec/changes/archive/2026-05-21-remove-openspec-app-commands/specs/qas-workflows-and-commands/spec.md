## REMOVED Requirements

### Requirement: Upstream OpenSpec workflow artifacts are not replaced

**Reason:** QASpec no longer generates `openspec-*` or `opsx-*` artifacts; coexistence is limited to not destroying third-party upstream installs.

**Migration:** Users who need OpenSpec workflows install and maintain upstream OpenSpec separately. QASpec installs only `qas-*` / `/qas:*`.

## MODIFIED Requirements

### Requirement: Core workflow set

The QASpec product core profile SHALL install exactly these workflow ids: `explore`, `analyze`, `matrix`, `publish`, `archive`. The CLI SHALL NOT install workflow ids `propose`, `new`, `continue`, `apply`, `ff`, `sync`, `verify`, `onboard`, or `bulk-archive` as part of any profile. Users whose global config was auto-migrated from the legacy OpenSpec core set SHALL receive the QASpec core set on the next init or update without manual steps.

#### Scenario: Init with core profile

- **WHEN** a user runs init with the QASpec core profile (including after legacy global-config migration)
- **THEN** skills are generated for all five workflow ids including `publish`
- **AND** no `openspec-*` skills or `opsx-*` commands are generated

#### Scenario: Publish artifacts present after migration

- **WHEN** init or update runs after legacy profile migration
- **THEN** `.cursor/skills/qas-publish/SKILL.md` exists when skills delivery is enabled
- **AND** a publish command file exists under the tool commands directory (e.g. `.cursor/commands/qas-publish.md`)

### Requirement: Explore workflow guardrails

The `qas-explore` skill SHALL allow investigation without requiring `analisis.md` or `testmatrix.md`, and SHALL NOT skip halts for analyze, matrix, or publish.

#### Scenario: Explore does not replace analyze

- **WHEN** a user runs `/qas:explore` then `/qas:matrix` without analyze
- **THEN** matrix instructions still require prior artifacts per schema unless the user created them manually

### Requirement: Fork dogfooding uses spec-driven agent commands

When maintainers work on the CLI in the QASpec source repository, they MAY use committed `opsx-*` / `openspec-*` commands under `.cursor/` for in-repo `spec-driven` changes. Consumer projects initialized by QASpec SHALL receive only `qas-*` / `/qas:*` from the CLI.

#### Scenario: Maintainer repo vs consumer install

- **WHEN** maintainers edit the QASpec repository
- **THEN** `.cursor/commands/opsx-propose.md` MAY remain for internal use
- **WHEN** init runs in a temporary consumer project directory
- **THEN** that directory contains `qas-analyze.md` (or tool equivalent) and does not require committed `opsx-*` files in the fork tree

### Requirement: Consumer install validation path

Maintainers SHALL validate QASpec agent output by running init in a temporary project directory, not by requiring `qas-*` command files in the fork’s `.cursor/` tree.

#### Scenario: Temp dir smoke after workflow changes

- **WHEN** a change touches QASpec workflow templates or command adapters
- **THEN** verification includes `qaspec init` in a temp directory
- **AND** the temp directory contains `.cursor/commands/qas-analyze.md` (or tool-equivalent) when Cursor is selected
- **AND** the temp directory does not contain newly generated `opsx-propose.md` from QASpec init
- **AND** the fork repository is not required to commit those generated files

### Requirement: Core profile product branding

The default QASpec **core** agent surface SHALL present QASpec in user-visible skill and command metadata and SHALL be the only workflow surface QASpec installs by default.

#### Scenario: Core profile is QASpec

- **WHEN** a user initializes with the QASpec core profile
- **THEN** installed skills and commands present **QASpec** in names and descriptions visible to the user
- **AND** the primary installed surface does not include OpenSpec-branded `openspec-*` or `/opsx:*` commands from QASpec
