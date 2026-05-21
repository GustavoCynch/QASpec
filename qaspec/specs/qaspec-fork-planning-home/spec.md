# qaspec-fork-planning-home Specification

## Purpose
TBD - created by archiving change qaspec-post-rename-followups. Update Purpose after archive.
## Requirements
### Requirement: Fork repository uses qaspec planning root

The QASpec fork repository SHALL maintain its planning home under `qaspec/` at the repository root, not under a parallel `openspec/` tree.

#### Scenario: Active change path after migration

- **WHEN** a contributor creates or lists changes in this repository
- **THEN** active changes live under `qaspec/changes/<name>/`
- **AND** main specs live under `qaspec/specs/`

#### Scenario: Config location

- **WHEN** reading project config for dogfooding in this fork
- **THEN** the file is `qaspec/config.yaml`
- **AND** no `openspec/config.yaml` exists at root after migration completes

#### Scenario: Archive history preserved

- **WHEN** browsing completed changes
- **THEN** archived folders remain under `qaspec/changes/archive/` (including entries created before migration)
- **AND** renaming archived folder prefixes is not required

### Requirement: Documentation paths updated

Repository documentation and CI that referenced `openspec/changes` or `openspec/specs` for **this fork** SHALL be updated to `qaspec/` equivalents.

#### Scenario: Contributor README

- **WHEN** a new contributor reads root README workflow instructions for this repo
- **THEN** examples use `qaspec new`, `qaspec/changes/`, and `qaspec/specs/` paths

