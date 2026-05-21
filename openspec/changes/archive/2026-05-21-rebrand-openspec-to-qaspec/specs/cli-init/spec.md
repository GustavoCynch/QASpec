## MODIFIED Requirements

### Requirement: Progress Indicators

The `qaspec init` command SHALL display progress indicators during initialization using QASpec-branded messages.

#### Scenario: Displaying initialization progress

- **WHEN** executing initialization steps
- **THEN** validate environment silently in background (no output unless error)
- **AND** display progress with ora spinners:
  - Show spinner referencing **QASpec** structure (e.g., "Creating QASpec structure...")
  - Then success (e.g., "QASpec structure created")
  - Show spinner: "Configuring AI tools..."
  - Then success: "AI tools configured"

### Requirement: Directory Creation

The command SHALL create the planning directory structure with config file using QASpec-branded user messages.

#### Scenario: Creating planning structure

- **WHEN** `qaspec init` is executed
- **THEN** user-visible progress and errors SHALL name **QASpec**, not OpenSpec, when describing this product's scaffold
- **AND** create the standard planning directory layout under the resolved planning home

## ADDED Requirements

### Requirement: Welcome Screen Branding

The interactive init flow SHALL present QASpec branding on the welcome screen.

#### Scenario: Interactive welcome

- **WHEN** run interactively
- **THEN** display welcome screen with QASpec branding (logo or title), not "OpenSpec" as the product name

### Requirement: Existing Installation Messaging

When a planning home already exists, init SHALL describe the product as QASpec in user-visible messages.

#### Scenario: Already initialized

- **WHEN** the planning directory already exists
- **THEN** inform the user that **QASpec** is already initialized (not "OpenSpec is already initialized")
- **AND** continue to extend mode for additional AI tools

### Requirement: Getting Started Hints Branding

Post-init getting-started hints SHALL use QASpec command names and label legacy `/opsx:*` flows explicitly as legacy OpenSpec workflow.

#### Scenario: Core profile hints

- **WHEN** init completes with QASpec core profile
- **THEN** getting-started text SHALL reference `/qas:*` and `qaspec` commands
- **OR** when legacy profile is active, label legacy hints as **legacy OpenSpec workflow** (`/opsx:*`), not as the primary product name
