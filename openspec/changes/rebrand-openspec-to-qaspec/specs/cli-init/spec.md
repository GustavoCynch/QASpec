## MODIFIED Requirements

### Requirement: Progress Indicators

The `qaspec init` command SHALL show progress using QASpec-branded messages.

#### Scenario: Displaying init progress

- **WHEN** initialization runs
- **AND** display progress with ora spinners:
- **THEN** spinner text SHALL reference **QASpec** structure (e.g., "Creating QASpec structure..."), not OpenSpec as the product name
- **AND** success lines SHALL match (e.g., "QASpec structure created")

### Requirement: Directory Structure Creation

The command SHALL create the planning directory structure with config file.

#### Scenario: Creating planning structure

- **WHEN** `qaspec init` is executed
- **THEN** user-visible progress and errors SHALL name **QASpec**, not OpenSpec, when describing this product's scaffold

### Requirement: Welcome Screen

#### Scenario: Interactive welcome

- **WHEN** run interactively
- **THEN** display welcome screen with QASpec branding (logo or title), not "OpenSpec" as the product name

### Requirement: Existing Installation Detection

#### Scenario: Already initialized

- **WHEN** the planning directory already exists
- **THEN** inform the user that **QASpec** is already initialized (not "OpenSpec is already initialized")
- **AND** continue to extend mode for additional AI tools

### Requirement: Getting Started Hints

#### Scenario: Core profile hints

- **WHEN** init completes with QASpec core profile
- **THEN** getting-started text SHALL reference `/qas:*` and `qaspec` commands
- **OR** when legacy profile is active, label legacy hints as **legacy OpenSpec workflow** (`/opsx:*`), not as the primary product name
