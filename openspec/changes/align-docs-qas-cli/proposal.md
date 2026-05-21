## Why

`remove-openspec-app-commands` aligned the CLI to ship only **`qas-*` skills** and **`/qas:*` commands**, but most product docs under `docs/` still describe the legacy OPSX surface (`/opsx:propose`, `/opsx:apply`, expanded `propose`/`sync`/`verify` workflows). New testers following [Getting Started](docs/getting-started.md) or [Commands](docs/commands.md) will install QASpec artifacts that do not match what the documentation tells them to run.

## What Changes

- **Rewrite primary user docs** (`getting-started.md`, `commands.md`, `workflows.md`, `concepts.md`, `supported-tools.md`) so the default `core` profile and quick path use **`/qas:explore` → `/qas:analyze` → `/qas:matrix` → `/qas:publish` → `/qas:archive`** (and matching `qas-*` skill names).
- **Reframe or relocate OPSX-centric pages**: `docs/opsx.md` and OPSX sections in `migration-guide.md` SHALL be labeled **legacy / upstream / maintainer** context, not the default QASpec install path.
- **Align CLI reference copy** in `docs/cli.md` with current commands (`qaspec init`, `qaspec update`, `qaspec config profile`, `qaspec workspace`, `qaspec instructions`) and remove instructions to enable legacy `/opsx:*` via QASpec profile selection.
- **Preserve accurate exceptions**: docs MAY still mention upstream OpenSpec, repo `openspec/` planning, and maintainer `.cursor/commands/opsx-*` in this repository with explicit qualifiers.
- **Add doc regression guard** (lightweight): extend branding or a docs test so new `/opsx:` product instructions in `docs/` fail CI unless allowlisted as legacy/migration.
- **README cross-links**: update root `README.md` quick-start snippets if they still point at `/opsx:*` as the default path.
- **Out of scope**:
  - Changing `openspec/` specs, changes, or archive content except this change's deltas.
  - Removing maintainer `opsx-*` Cursor commands from the QASpec repo.
  - Rewriting third-party schema docs under `schemas/` unless they are linked from product quick-start.

## Capabilities

### New Capabilities

- `product-user-documentation`: Contract that published `docs/**` product guides describe the QASpec core QA workflow and `/qas:*` commands as the default install surface.

### Modified Capabilities

- `qaspec-branding`: Extend branding rules to user-facing documentation (slash-command names, default workflow path, and legacy labeling).

## Impact

- `docs/getting-started.md`, `docs/commands.md`, `docs/workflows.md`, `docs/concepts.md`, `docs/supported-tools.md`, `docs/cli.md`, `docs/opsx.md`, `docs/migration-guide.md` (beyond existing callout)
- `README.md` (quick-start / command tables if outdated)
- `test/branding/no-openspec-product-strings.test.ts` or new `test/docs/qas-command-docs.test.ts`
- Unchanged: application generation code (already QASpec-only), `openspec/changes/remove-openspec-app-commands/` artifacts
