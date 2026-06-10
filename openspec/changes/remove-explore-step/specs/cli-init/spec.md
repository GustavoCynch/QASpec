# cli-init Delta

## MODIFIED Requirements

### Requirement: QASpec core workflow messaging

Upon successful init with the QASpec core profile—or any active profile whose workflows include QASpec QA ids (`analyze`, `matrix`, or `publish`)—success output SHALL mention `/qsx:analyze`, `/qsx:matrix`, and `/qsx:publish` as primary next steps instead of `/opsx:propose` and `/opsx:apply`, and SHALL reference `qaspec` CLI commands (not `openspec`) in next-step hints.

#### Scenario: Post-init guidance after legacy migration

- **WHEN** init finishes configuring at least one AI tool
- **AND** the effective profile is `core` (including after legacy global-config migration)
- **THEN** the CLI prints next-step hints using `/qsx:*` command names including `/qsx:publish`
- **AND** the first suggested step is `/qsx:analyze`
- **AND** printed examples use `qaspec` as the CLI name

### Requirement: Success Output

The command SHALL provide clear, actionable next steps upon successful initialization.

#### Scenario: Displaying success message

- **WHEN** initialization completes successfully
- **THEN** display categorized summary:
  - "Created: <tools>" for newly configured tools
  - "Refreshed: <tools>" for already-configured tools that were updated
  - Count of skills and commands generated
- **AND** display getting started section with QASpec core hints (`/qsx:analyze`, `/qsx:matrix`, `/qsx:publish`) when the effective profile is `core` or when active workflows include any of `analyze`, `matrix`, or `publish`
- **OR** legacy OpenSpec hints (`/opsx:new`, `/opsx:continue`, `/opsx:apply`) when only legacy workflows are in the active profile
- **AND** display links to documentation and feedback

#### Scenario: Displaying restart instruction

- **WHEN** initialization completes successfully and tools were created or refreshed
- **THEN** display instruction to restart IDE for slash commands to take effect
