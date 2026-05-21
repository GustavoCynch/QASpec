## ADDED Requirements

### Requirement: QASpec planning home layout

A QASpec project SHALL use `qaspec/` as the canonical planning root for config, specs, and changes.

#### Scenario: Greenfield project layout

- **WHEN** a QASpec project is initialized for QA workflow use
- **THEN** the planning root directory name is `qaspec/`
- **AND** config lives at `qaspec/config.yaml`

#### Scenario: Legacy OpenSpec layout compatibility

- **WHEN** only `openspec/` exists at project root with valid config
- **THEN** tooling SHALL resolve that directory as the planning home
- **AND** authors MAY continue working until they optionally migrate to `qaspec/`

## MODIFIED Requirements

### Requirement: Project Structure

A QASpec project SHALL maintain a consistent directory structure for specifications and changes under the resolved planning home.

#### Scenario: Initializing project structure

- **WHEN** a QASpec project is initialized (greenfield)
- **THEN** it SHALL have this structure:
```
qaspec/
├── config.yaml           # Project context, schema, rules
├── specs/                # Current deployed capabilities
│   └── [capability]/
│       └── spec.md
└── changes/
    ├── [change-name]/
    └── archive/
```

#### Scenario: Optional reference directory

- **WHEN** init runs for a QASpec consumer project
- **THEN** `qaspec/references/` MAY exist alongside the planning tree for QA reference files (separate from planning home root name)
