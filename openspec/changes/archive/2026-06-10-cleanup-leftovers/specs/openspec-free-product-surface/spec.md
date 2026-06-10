# openspec-free-product-surface Delta

## MODIFIED Requirements

### Requirement: Automated regression guards

The repository SHALL fail CI when new unallowlisted OpenSpec product strings or `openspec <subcommand>` examples appear in guarded paths, including the bodies of generated skill and command templates.

#### Scenario: Docs branding scan

- **WHEN** CI runs branding tests after a contributor adds "OpenSpec" to `docs/cli.md` without allowlist
- **THEN** the build fails

#### Scenario: Generated skill bodies scan

- **WHEN** CI runs branding tests and a skill or command template body instructs running an `openspec <subcommand>` (e.g. `openspec feedback`)
- **THEN** the build fails
- **AND** allowlisted upstream-coexistence prose (e.g. "leave `openspec-*` skills untouched") does not trigger the failure

#### Scenario: Allowlisted repo spec path

- **WHEN** maintainer documentation references `openspec/changes/archive/` as historical storage
- **THEN** the branding guard allowlist permits that path literal
- **AND** the line does not present OpenSpec as the product name

### Requirement: Public landing uses QASpec vocabulary

The deployed product landing site (when present) SHALL follow the same vocabulary rules as `docs/`: **`qaspec`** CLI, **`qaspec/`** planning home, **`/qsx:*`** agent commands, and no primary CTA for **`openspec`** or **`/opsx:*`**.

#### Scenario: Landing install CTA

- **WHEN** a visitor uses the install snippet on the public landing page
- **THEN** the command uses `qaspec` / `@qaspec/cli` naming
- **AND** does not instruct `npm install -g @fission-ai/openspec` as the default path

#### Scenario: README points to public site

- **WHEN** a reader opens the root `README.md` after the site is deployed
- **THEN** they find a link to the live landing URL (once configured)
- **AND** GitHub remains the source for detailed `docs/`
