## Why

Change `qaspec-cli-rename` shipped the primary CLI and planning-home resolver but left three follow-ups marked **N/A**: migrate this fork’s planning tree to `qaspec/`, commit generated `/qas:*` agent files as repo examples, and remove the deprecated `openspec` binary shim. Without this change, the fork still dogfoods under `openspec/changes/`, lacks committed `qas-*` samples for reviewers, and continues to advertise a shim we intend to drop.

## What Changes

- **Migrate** the QASpec fork planning home from `openspec/` → `qaspec/` (`config.yaml`, `specs/`, `changes/`, `explorations/` as applicable): move directories, fix internal links in docs, update CI/workflows that assume `openspec/` paths.
- **Commit** generated `.cursor/commands/qas-*.md` and `.cursor/skills/qas-*/SKILL.md` (via `qaspec update` or equivalent) as canonical QA workflow samples; **retain** `.cursor/commands/opsx-*` and `openspec-*` skills for **spec-driven** CLI development in this repo.
- **Remove** `openspec` npm bin shim and `bin/openspec.js`; update tests and docs to use `qaspec` only. **BREAKING** for scripts still calling `openspec`.
- **Update** `CHANGELOG.md`, README, and `qaspec-cli` main spec (REMOVED shim requirement).

## Capabilities

### New Capabilities

- `qaspec-fork-planning-home`: Migrate the fork repository to `qaspec/` as its sole planning root.
- `fork-agent-command-samples`: Committed `qas-*` Cursor commands/skills in the fork without removing `opsx-*` dogfooding commands.

### Modified Capabilities

- `qaspec-cli`: Remove deprecated `openspec` binary; package exposes only `qaspec`.

## Impact

- `openspec/` → `qaspec/` (move/rename at repo root)
- `.cursor/commands/`, `.cursor/skills/`
- `package.json` `bin`, `bin/openspec.js` (delete), tests referencing shim
- `.github/workflows/`, `README.md`, `CHANGELOG.md`
- **Out of scope:** Removing `opsx-*` from `.cursor/`; npm publish; Qase MCP; migrating archived change folder names inside `changes/archive/`
