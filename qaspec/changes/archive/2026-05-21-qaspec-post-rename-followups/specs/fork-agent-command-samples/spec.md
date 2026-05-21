## ADDED Requirements

### Requirement: Committed qas agent samples in fork

The QASpec fork repository SHALL include generated Cursor command and skill files for the five core QA workflows (`explore`, `analyze`, `matrix`, `publish`, `archive`) under `.cursor/commands/qas-*.md` and `.cursor/skills/qas-*/SKILL.md`.

#### Scenario: Commands present

- **WHEN** a reviewer lists `.cursor/commands/` in this repository
- **THEN** files `qas-explore.md`, `qas-analyze.md`, `qas-matrix.md`, `qas-publish.md`, and `qas-archive.md` exist
- **AND** each command frontmatter uses `/qas:<workflow>` naming

#### Scenario: Skills present

- **WHEN** a reviewer lists `.cursor/skills/` for qas workflows
- **THEN** directories `qas-explore`, `qas-analyze`, `qas-matrix`, `qas-publish`, and `qas-archive` each contain `SKILL.md`

#### Scenario: Generated from current templates

- **WHEN** maintainers regenerate samples after template changes
- **THEN** they run `qaspec update` (or init) against the fork root and commit the diff
- **AND** committed content matches the bundled templates in `src/core/templates/workflows/`

### Requirement: OPSX dogfooding commands retained

The fork SHALL continue to ship `opsx-*` and related `openspec-*` skills for spec-driven CLI development; this change SHALL NOT remove them solely because `qas-*` samples were added.

#### Scenario: Dual surfaces coexist

- **WHEN** a maintainer develops a spec-driven change to the CLI
- **THEN** `.cursor/commands/opsx-propose.md` (and siblings) remain available
- **AND** `qas-*` samples remain available as QA product documentation
