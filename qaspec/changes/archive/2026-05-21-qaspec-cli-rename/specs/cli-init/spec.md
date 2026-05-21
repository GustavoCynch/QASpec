## MODIFIED Requirements

### Requirement: Directory Creation

The command SHALL create the QASpec planning directory structure with config file.

#### Scenario: Creating QASpec structure

- **WHEN** `qaspec init` is executed on a project without an existing planning home
- **THEN** create the following directory structure:
```
qaspec/
├── config.yaml
├── specs/
└── changes/
    └── archive/
```

#### Scenario: Legacy openspec directory preserved

- **WHEN** a project already has `openspec/` with `config.yaml` and no `qaspec/`
- **THEN** init and other commands resolve the legacy layout without requiring rename in that session
- **AND** re-init does not delete or move `openspec/` automatically

### Requirement: QASpec reference scaffolding on init

The `qaspec init` command SHALL scaffold `qaspec/references/historical_bugs.md` and `qaspec/references/qase_test_case_rules.md` when missing, without overwriting existing files.

#### Scenario: References created on first init

- **WHEN** init completes successfully on a project without those files
- **THEN** both reference files exist under `qaspec/references/`
- **AND** existing reference files are unchanged on re-init

### Requirement: QASpec core workflow messaging

Upon successful init with the QASpec core profile, success output SHALL mention `/qas:explore`, `/qas:analyze`, `/qas:matrix`, and `/qas:publish` as primary next steps and SHALL reference `qaspec` CLI commands (not `openspec`) in next-step hints.

#### Scenario: Post-init hints

- **WHEN** init completes with core profile
- **THEN** printed examples use `qaspec` as the CLI name
- **AND** slash commands remain `/qas:*`

## MODIFIED Requirements

### Requirement: Progress Indicators

The command SHALL display progress indicators during initialization to provide clear feedback about each step.

#### Scenario: Displaying initialization progress

- **WHEN** executing initialization steps
- **THEN** validate environment silently in background (no output unless error)
- **AND** display progress with ora spinners using QASpec-branded labels (e.g. "Creating QASpec structure...")
- **AND** then success: "✔ QASpec structure created" (or equivalent)
