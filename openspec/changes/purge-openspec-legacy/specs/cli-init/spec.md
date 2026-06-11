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

#### Scenario: qaspec is the only planning home

- **WHEN** a project contains an `openspec/` directory but no `qaspec/`
- **THEN** `qaspec init` creates `qaspec/` as the planning home
- **AND** QASpec commands resolve only `qaspec/`, leaving any `openspec/` directory untouched and unread

### Requirement: QASpec core workflow messaging

Upon successful init with the QASpec core profile—or any active profile whose workflows include QASpec QA ids (`analyze`, `cases`, or `publish`)—success output SHALL mention `/qsx:analyze`, `/qsx:cases`, and `/qsx:publish` as primary next steps instead of `/opsx:propose` and `/opsx:apply`, and SHALL reference `qaspec` CLI commands (not `openspec`) in next-step hints.

#### Scenario: Post-init guidance

- **WHEN** init finishes configuring at least one AI tool
- **AND** the effective profile is `core`
- **THEN** the CLI prints next-step hints using `/qsx:*` command names including `/qsx:publish`
- **AND** the first suggested step is `/qsx:analyze`
- **AND** printed examples use `qaspec` as the CLI name

## REMOVED Requirements

### Requirement: Legacy global profile migration before init
**Reason**: One-time migration from the legacy OpenSpec workflow set is no longer needed; no installations with that global profile shape exist.
**Migration**: None. Users with a `custom` profile keep it as-is; the `core` profile can be selected explicitly via `qaspec config profile`.
