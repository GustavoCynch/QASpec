# Purge OpenSpec Legacy

## Why

QASpec started as a fork of the OpenSpec CLI but is now a distinct product with no legacy user base: no real project uses an `openspec/`-era layout, upstream coexistence, or `OPENSPEC_*` environment variables. The remaining fork-compat code (coexistence, legacy cleanup, migration) is dead weight — including the repo's largest test suite — and the telemetry module still ships events to the upstream vendor's endpoint (`edge.openspec.dev`), which is unacceptable for an independent product.

## What Changes

- **BREAKING** Remove the telemetry module entirely: no PostHog client, no events sent, no first-run notice, no `OPENSPEC_TELEMETRY` handling. QASpec collects no usage data.
- **BREAKING** Remove upstream-coexistence support: QASpec no longer detects or preserves upstream OpenSpec skills/commands (`openspec-*` skill dirs, `opsx-*` command files) in user projects.
- **BREAKING** Remove legacy-cleanup and one-time workflow migration: `qaspec init`/`qaspec update` no longer scan for or clean OpenSpec-era artifacts, marker blocks, or legacy profiles.
- **BREAKING** Drop the `openspec/` planning-home fallback: `qaspec/` is the only planning directory QASpec resolves in user projects.
- **BREAKING** Rename per-change metadata file `.openspec.yaml` → `.qaspec.yaml`, with no migration shim.
- **BREAKING** Rename environment variables `OPENSPEC_CONCURRENCY` → `QASPEC_CONCURRENCY` and `OPENSPEC_NO_COMPLETIONS` → `QASPEC_NO_COMPLETIONS` (no legacy aliases). `OPENSPEC_TELEMETRY` disappears with the telemetry module.
- **BREAKING** Move global config from `~/.config/openspec/` to `~/.config/qaspec/` (XDG-resolved), with no migration shim.
- Shrink the `branding.ts` OpenSpec allowlist to the minimum (lineage acknowledgment, this repo's own planning-home paths, historical CHANGELOG entries) and tighten the branding guard test accordingly.
- Clean dead branding: LICENSE copyright, `scripts/README.md`, `docs/*.md` command examples and paths, website footer, stale CHANGELOG command examples.
- Out of scope: this repository's own `openspec/` dev-workflow directory, its `opsx:*` skills, and historical archive content under `openspec/changes/archive/`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `telemetry`: capability retired — all requirements removed; QASpec sends no telemetry and recognizes no telemetry env vars.
- `openspec-coexistence`: capability retired — all requirements removed; no upstream detection or preservation behavior remains.
- `legacy-cleanup`: capability retired — all requirements removed; no legacy artifact detection or cleanup remains.
- `cli-init`: drop legacy `openspec/` layout preservation and legacy global-profile migration; init always creates and resolves `qaspec/`.
- `config-loading`: project config is discovered only at `qaspec/config.yaml` (or `.yml`); no `openspec/` fallback.
- `global-config`: global config lives at `~/.config/qaspec/config.json` (XDG-resolved per platform); telemetry fields are gone from its schema.
- `qas-tcms-target`: per-change TCMS block lives in `.qaspec.yaml` instead of `.openspec.yaml`.
- `qas-approval-ledger`: approvals are recorded in the change's `.qaspec.yaml`.
- `qas-publish-gate`: gate reads TCMS target and persists its nonce in the change's `.qaspec.yaml`.
- `cli-validate`: concurrency override env var is `QASPEC_CONCURRENCY`.
- `cli-feedback`: feedback no longer references telemetry settings (telemetry is gone).
- `qaspec-branding`: guard becomes stricter — the OpenSpec allowlist covers only lineage acknowledgment, this repo's planning-home directory paths, and historical records.
- `openspec-free-product-surface`: extended — product surface ships no `OPENSPEC_*` env vars, no `.openspec.yaml` artifacts, and no `openspec/` directory resolution.

## Impact

- **Deleted code**: `src/core/upstream-coexistence.ts`, `src/core/legacy-cleanup.ts`, `src/core/migration.ts`, `src/telemetry/` (entire module), plus their call sites in `init.ts`, `update.ts`, CLI entry, and postinstall.
- **Deleted tests**: `test/core/legacy-cleanup.test.ts` (largest suite), `test/core/upstream-coexistence.test.ts`, `test/core/migration.test.ts`, `test/core/init-upstream-skills.test.ts`, `test/telemetry/*`.
- **Modified code**: `src/core/planning-dir.ts`, `src/utils/change-metadata.ts`, `src/core/global-config.ts`, `src/core/branding.ts`, `src/commands/validate.ts`, `src/cli/index.ts`, `scripts/postinstall.js`.
- **Docs/branding**: `LICENSE`, `scripts/README.md`, `docs/*.md`, `website/src/components/Footer.astro`, CHANGELOG examples.
- **Users**: any project still on an `openspec/` layout or `.openspec.yaml` metadata stops being recognized (confirmed: none exist). CI scripts using `OPENSPEC_*` env vars must switch to `QASPEC_*`.
- **This repo's dev workflow**: unaffected — it is managed by the separately installed upstream `openspec` binary, not by QASpec product code.
