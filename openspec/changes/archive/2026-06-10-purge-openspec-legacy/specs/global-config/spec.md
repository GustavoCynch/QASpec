## MODIFIED Requirements

### Requirement: Global configuration storage

The system SHALL store global configuration in `~/.config/qaspec/config.json`.

#### Scenario: Config file format
- **WHEN** storing configuration
- **THEN** the system writes valid JSON that can be read and modified by users

#### Scenario: Existing config preservation
- **WHEN** adding new fields to an existing config file
- **THEN** the system preserves all existing configuration fields

#### Scenario: No telemetry state
- **WHEN** reading or writing global configuration
- **THEN** the schema contains no telemetry fields (`anonymousId`, `noticeSeen`)

### Requirement: Global Config Directory Path

The system SHALL resolve the global configuration directory path following XDG Base Directory Specification with platform-specific fallbacks.

#### Scenario: Unix/macOS with XDG_CONFIG_HOME set
- **WHEN** `$XDG_CONFIG_HOME` environment variable is set to `/custom/config`
- **THEN** `getGlobalConfigDir()` returns `/custom/config/qaspec`

#### Scenario: Unix/macOS without XDG_CONFIG_HOME
- **WHEN** `$XDG_CONFIG_HOME` environment variable is not set
- **AND** the platform is Unix or macOS
- **THEN** `getGlobalConfigDir()` returns `~/.config/qaspec` (expanded to absolute path)

#### Scenario: Windows platform
- **WHEN** the platform is Windows
- **AND** `%APPDATA%` is set to `C:\Users\User\AppData\Roaming`
- **THEN** `getGlobalConfigDir()` returns `C:\Users\User\AppData\Roaming\qaspec`

#### Scenario: Legacy openspec config directory is ignored
- **WHEN** `~/.config/openspec/` exists and `~/.config/qaspec/` does not
- **THEN** the system uses `~/.config/qaspec/` defaults without reading the legacy directory
