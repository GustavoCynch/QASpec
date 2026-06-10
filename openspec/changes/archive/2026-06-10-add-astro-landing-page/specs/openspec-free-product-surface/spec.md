## ADDED Requirements

### Requirement: Public landing uses QASpec vocabulary

The deployed product landing site (when present) SHALL follow the same vocabulary rules as `docs/`: **`qaspec`** CLI, **`qaspec/`** planning home, **`/qas:*`** agent commands, and no primary CTA for **`openspec`** or **`/opsx:*`**.

#### Scenario: Landing install CTA

- **WHEN** a visitor uses the install snippet on the public landing page
- **THEN** the command uses `qaspec` / `@qaspec/cli` naming
- **AND** does not instruct `npm install -g @fission-ai/openspec` as the default path

#### Scenario: README points to public site

- **WHEN** a reader opens the root `README.md` after the site is deployed
- **THEN** they find a link to the live landing URL (once configured)
- **AND** GitHub remains the source for detailed `docs/`
