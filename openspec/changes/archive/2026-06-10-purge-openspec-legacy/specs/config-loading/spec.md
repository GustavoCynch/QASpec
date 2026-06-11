## RENAMED Requirements

- FROM: `### Requirement: Load project config from openspec/config.yaml`
- TO: `### Requirement: Load project config from qaspec/config.yaml`

## MODIFIED Requirements

### Requirement: Load project config from qaspec/config.yaml

The system SHALL read and parse the project configuration file located at `qaspec/config.yaml` relative to the project root. No other planning-home directory is consulted.

#### Scenario: Valid config file exists
- **WHEN** `qaspec/config.yaml` exists with valid YAML content
- **THEN** system parses the file and returns a ProjectConfig object

#### Scenario: Config file does not exist
- **WHEN** `qaspec/config.yaml` does not exist
- **THEN** system returns null without error

#### Scenario: Config file has invalid YAML syntax
- **WHEN** `qaspec/config.yaml` contains malformed YAML
- **THEN** system logs a warning message and returns null

#### Scenario: Config file has valid YAML but invalid schema
- **WHEN** `qaspec/config.yaml` contains valid YAML that fails Zod schema validation
- **THEN** system logs a warning message with validation details and returns null

#### Scenario: Legacy openspec directory is ignored
- **WHEN** a project contains `openspec/config.yaml` but no `qaspec/config.yaml`
- **THEN** system returns null without reading the `openspec/` directory

### Requirement: Support .yml file extension alias

The system SHALL accept both `.yaml` and `.yml` file extensions for the config file.

#### Scenario: Config file uses .yml extension
- **WHEN** `qaspec/config.yml` exists and `qaspec/config.yaml` does not exist
- **THEN** system reads from `qaspec/config.yml`

#### Scenario: Both .yaml and .yml exist
- **WHEN** both `qaspec/config.yaml` and `qaspec/config.yml` exist
- **THEN** system prefers `qaspec/config.yaml`
