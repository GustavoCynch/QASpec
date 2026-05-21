## Why

QASpec has shipped a full QA workflow surface (`qas-*` skills and `/qas:*` commands), but the CLI still generates, documents, and references the legacy OpenSpec agent surface (`openspec-*` skills, `/opsx:*` commands, and `openspec-continue-change` hints). That splits the product story and confuses testers who expect one toolchain. The fork should own QASpec-only delivery in **application code** while keeping the `openspec/` tree and repo-local Cursor commands as internal planning tooling.

## What Changes

- **Stop generating legacy OpenSpec workflows** from `qaspec init` and `qaspec update`: remove `openspec-*` skill templates, `opsx-*` / legacy slash-command templates, and workflow ids (`propose`, `new`, `continue`, `apply`, `ff`, `sync`, `verify`, `onboard`, `bulk-archive`) from default and custom profile installation paths unless explicitly retained for migration-only code paths.
- **Core-only surface**: Default profile installs only `qas-explore`, `qas-analyze`, `qas-matrix`, `qas-publish`, `qas-archive` and matching `/qas:*` commands across supported AI tools.
- **User-facing copy**: Replace init/update success lines, workflow instruction errors, and migration hints that mention `/opsx:*` or `openspec-*` skills with QASpec equivalents (`/qas:*`, `qas-*`).
- **Simplify coexistence logic**: Remove “install openspec alongside qas” behavior from init/update; upstream detection may remain only to **avoid deleting** third-party upstream installs during cleanup, not to generate QASpec-owned `openspec-*` artifacts.
- **Legacy cleanup**: Continue removing obsolete QASpec-installed `openspec-*` / `opsx-*` files from target projects on init/update when safe; do not treat repo `openspec/` or `.cursor/commands/opsx-*` in this repository as deletion targets.
- **Tests and docs (product)**: Update tests and user-facing docs that assert legacy skill/command generation; align with QASpec-only delivery.
- **BREAKING**: Projects using custom profiles with legacy OpenSpec workflow ids (`propose`, `apply`, etc.) will no longer receive those artifacts from QASpec; users must use QASpec core workflows or upstream OpenSpec installed separately.
- **Out of scope (explicit)**:
  - Deleting or renaming the `openspec/` directory in this repo (specs, changes, archive).
  - Removing `.cursor/commands/opsx-*` or `.cursor/skills/openspec-*` under **this repository** (internal Cursor workflow for maintainers).
  - Removing the `openspec` npm binary shim or OpenSpec CLI dependency used for planning in-repo.
  - Renaming internal symbols like `hasActiveUpstreamOpenSpec` when they still detect third-party upstream installs.

## Capabilities

### New Capabilities

- `qaspec-only-delivery`: Contract that QASpec application code installs and references only `qas-*` / `/qas:*` agent artifacts, with explicit exceptions for upstream detection and repo-internal paths.

### Modified Capabilities

- `qas-workflows-and-commands`: Remove requirements that preserve or co-install QASpec-generated `openspec-*` / `opsx-*`; require QASpec-only generation and messaging.
- `command-generation`: Legacy `opsx-*` and `openspec-*` command templates are not emitted by QASpec.
- `cli-init`: Success and onboarding text reference `/qas:*` only; init does not write legacy OpenSpec skills/commands.
- `cli-update`: Same as init for update paths.
- `legacy-cleanup`: Cleanup targets legacy QASpec-installed OpenSpec artifacts; does not apply to repo `openspec/` docs or maintainer Cursor commands in the QASpec repo.
- `openspec-coexistence`: Narrow to non-destructive coexistence (detect/skip upstream), not dual-surface installation from QASpec.
- `global-config` / profile migration: Legacy four-workflow configs migrate to QASpec core; custom profiles cannot re-enable removed legacy workflow ids via QASpec install.

## Impact

- `src/core/shared/skill-generation.ts`, `src/core/templates/**` (legacy opsx/openspec templates removable or dead-code removed)
- `src/core/init.ts`, `src/core/update.ts`, `src/core/migration.ts`, `src/core/profiles.ts`, `src/core/delivery-resolve.ts`, `src/core/legacy-cleanup.ts`, `src/core/upstream-coexistence.ts`
- `src/commands/workflow/instructions.ts`
- `test/core/init.test.ts`, `test/core/update.test.ts`, `test/core/shared/skill-generation.test.ts`, `test/core/legacy-cleanup.test.ts`
- Product-facing `docs/**` sections that describe installed `openspec-*` or `/opsx:*` commands
- Unchanged: `openspec/**` planning tree, `.cursor/commands/opsx-*` in repo root
