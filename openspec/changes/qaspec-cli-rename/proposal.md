## Why

QASpec already ships the QA product surface (`qaspec-pr-review`, `/qas:*`, `qas-*` workflows, `qaspec/references/` on init), but the **CLI and npm package still present as OpenSpec** (`openspec`, `@fission-ai/openspec`, planning home `openspec/`). That mismatch confuses users, docs, and CI. Roadmap [07](../../roadmap/07-commands-and-cli-rename.md) marks this as the next milestone after schema and workflow bootstrap.

## What Changes

- **Primary binary** `qaspec` (npm `bin.qaspec`) with QASpec branding in Commander help, version output, and error messages.
- **Package rename** to `@qaspec/cli` (tentative): `package.json` name, description, keywords, repository URLs aligned to this fork.
- **Compatibility shim:** keep `openspec` bin entry forwarding to the same implementation, emitting a **one-line deprecation notice** (stderr, once per invocation) pointing to `qaspec`.
- **Planning home:** default directory `qaspec/` (`qaspec/config.yaml`, `qaspec/changes/`, `qaspec/specs/`) for new projects; **resolve** existing `openspec/` trees when `qaspec/` is absent (no forced migration in this change).
- **Constants and messages:** introduce `QASPEC_DIR_NAME` (or equivalent) in code; update init/update/archive/workspace path resolution and user-visible paths in logs.
- **Docs and roadmap:** README, `docs/installation.md`, `docs/getting-started.md`, `roadmap/07` status, fork `roadmap/README.md` table.
- **Tests:** update snapshots and fixtures expecting `openspec` CLI strings where the product name is user-facing; keep explicit tests for `openspec` shim behavior.

## Capabilities

### New Capabilities

- `qaspec-cli`: Binary name, npm package identity, deprecation shim, and CLI branding contract.

### Modified Capabilities

- `cli-init`: Command name `qaspec init`; create `qaspec/` structure by default; backward-compatible read of legacy `openspec/` layout.
- `openspec-conventions`: Document QASpec planning layout (`qaspec/`) as the canonical project structure; legacy `openspec/` as supported fallback.

## Impact

- `package.json`, `bin/`, `src/cli/*`, `src/core/config.ts`, planning-home resolution modules, `src/core/init.ts`, workspace commands
- `test/**`, `docs/**`, `README.md`, `roadmap/07-commands-and-cli-rename.md`, `roadmap/README.md`
- **This repo after apply:** may keep `openspec/changes/` for dogfooding until a manual or follow-up migration; `.cursor/commands/opsx-*` unchanged
- **Out of scope:** Qase MCP in CLI; committing generated `qas-*.md` under `.cursor/` in the fork; renaming upstream GitHub org in archived change paths; removing `openspec` shim (separate deprecation window)
