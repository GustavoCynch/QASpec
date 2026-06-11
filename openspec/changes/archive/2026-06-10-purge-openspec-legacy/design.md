# Design: Purge OpenSpec Legacy

## Context

QASpec forked the OpenSpec CLI and still carries three kinds of fork residue:

1. **Fork-compat machinery** — `src/core/upstream-coexistence.ts` (preserve upstream OpenSpec skills/commands), `src/core/legacy-cleanup.ts` (detect/clean OpenSpec-era artifacts), `src/core/migration.ts` (one-time profile/workflow migration). All wired into `init.ts` and `update.ts`, with the repo's largest test suites behind them.
2. **OpenSpec-named product surface** — `openspec/` planning-home fallback (`planning-dir.ts`), `.openspec.yaml` per-change metadata (`change-metadata.ts`, plus hardcoded literals in `approval-ledger.ts:130` and `publish-gate.ts:130`), `OPENSPEC_*` env vars, `~/.config/openspec/` global config, and a telemetry module pointed at `https://edge.openspec.dev` (the upstream vendor's PostHog ingest).
3. **Dead branding** — LICENSE copyright, docs examples, scripts README, website footer.

It is confirmed there are no legacy users: nothing depends on `openspec/` layouts, `.openspec.yaml`, or `OPENSPEC_*` vars. This repository's own `openspec/` dev-workflow directory is managed by the separately installed upstream `openspec` binary, not by QASpec product code.

## Goals / Non-Goals

**Goals:**

- Delete all fork-compat modules and their tests; simplify `init`/`update` accordingly.
- Make `qaspec/` the only planning home and `.qaspec.yaml` the only per-change metadata file.
- Remove the telemetry module entirely; QASpec sends no usage data anywhere.
- Rename remaining env vars and global-config paths to `qaspec` naming, with no aliases or shims.
- Shrink the `branding.ts` allowlist to lineage/history-only entries and tighten the guard test.
- Fix dead branding in LICENSE, docs, scripts, website.

**Non-Goals:**

- No changes to this repo's `openspec/` dev directory, `opsx:*` skills, `.cursor/` assets, or archived changes — that is dev tooling and history, not product surface.
- No migration shims, dual-read fallbacks, or deprecation aliases of any kind (no legacy users exist).
- No replacement telemetry backend.

## Decisions

### D1: Delete telemetry instead of repointing it

Repointing PostHog at a QASpec-owned endpoint requires infrastructure nobody runs and keeps a dependency for no current benefit. Deleting `src/telemetry/`, its CLI wiring, the first-run notice, and the `telemetry` fields of the global-config schema is smaller and honest. If metrics are ever wanted, they get designed fresh.

- Alternative considered: keep module behind a disabled flag — rejected; dead code with a live network capability is worse than no code.

### D2: Hard cutover, no compatibility window

`.openspec.yaml` → `.qaspec.yaml`, `OPENSPEC_*` → `QASPEC_*`, `~/.config/openspec/` → `~/.config/qaspec/`, and the planning-home fallback are all removed in one release with **BREAKING** changelog entries. Dual-read shims only pay off when someone is on the old format; nobody is.

- Alternative considered: read-both/write-new for one release — rejected as pure speculative complexity.

### D3: Single source of truth for the metadata filename

`change-metadata.ts` keeps the `METADATA_FILENAME` constant (now `'.qaspec.yaml'`) and exports it; `approval-ledger.ts` and `publish-gate.ts` switch their hardcoded `path.join(changeDir, '.openspec.yaml')` literals to the exported constant. This follows the repo rule "use existing constants and lists" and prevents the same drift from recurring.

### D4: Planning-dir module survives, fallback dies

`planning-dir.ts` stays as the central path resolver (`getPlanningDir`, `joinPlanningPath`, `formatPlanningRelativePath`) because every path operation routes through it. Only the resolution logic changes: `resolvePlanningDirName()` returns `'qaspec'` unconditionally; `OPENSPEC_DIR_NAME` and the existence-check ordering are deleted. Callers are untouched.

- Alternative considered: inline `'qaspec'` everywhere and delete the module — rejected; the indirection still earns its keep for workspace/linked-repo resolution and display formatting.

### D5: Branding allowlist shrinks to three buckets

`OPENSPEC_PRODUCT_STRING_ALLOWLIST` (~85 patterns) reduces to: (a) the README lineage line ("Inspired by OpenSpec"), (b) literal `openspec/` path segments referring to this repository's own planning home in contributor-facing docs, (c) CHANGELOG historical entries and upstream PR links. Everything else becomes a guard-test failure. `LEGACY_OPENSPEC_COMMAND_CATEGORY` and coexistence-related allowlist entries are deleted with their consumers.

### D6: Init/update lose their legacy phases, not their shape

`init.ts` and `update.ts` keep their current flow; the calls into coexistence detection, legacy-artifact scanning, marker cleanup, and profile migration are removed along with the modules. No behavioral redesign of init beyond deletion — this keeps the diff reviewable and the remaining tests meaningful.

### D7: Env var renames are mechanical and exhaustive

`QASPEC_CONCURRENCY` (CLI `--concurrency` default in `src/cli/index.ts` and `src/commands/validate.ts`) and `QASPEC_NO_COMPLETIONS` (`scripts/postinstall.js`). `OPENSPEC_TELEMETRY` and `DO_NOT_TRACK` handling disappear with telemetry. Docs and `--help` text updated in the same commit.

## Risks / Trade-offs

- [Hidden consumer of a deleted export] → After deleting each module, build (`pnpm build`) and full test run; `rg` for every deleted export name to catch dynamic/string references (e.g. generated skill templates mentioning `.openspec.yaml`).
- [Generated artifacts in user projects still say `.openspec.yaml`] → Workflow templates (`src/core/templates/workflows/publish.ts`), config seed comments (`config-prompts.ts`), and skill-generation text must be swept with `rg -i 'openspec'` — these are product output, not just source comments.
- [Branding guard test becomes brittle] → Shrink the allowlist by deleting entries whose consumers are gone in the same PR, then run the guard test to enumerate stragglers; fix stragglers rather than re-adding patterns.
- [This repo's own dev flow confused with product surface] → Touch nothing under `openspec/` except this change's own artifacts; the guard test already allowlists repo planning-home paths.
- [npm package metadata or funding links still point upstream] → Verify `package.json` (repository, bugs, homepage, funding) and `scripts/pack-version-check.mjs` during implementation.

## Migration Plan

Single release (next minor or major per changeset policy) with **BREAKING** entries. No data migration: users on current QASpec already have `qaspec/` planning homes; per-change `.openspec.yaml` files in active changes are regenerated or hand-renamed by the user (none exist outside this repo's dev archive). Rollback = revert the release.

## Open Questions

(none — scope confirmed with the user: no legacy projects, telemetry removed, dev tooling out of scope)
