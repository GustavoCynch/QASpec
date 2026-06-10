# Design: Cleanup Leftovers

## Context

Accumulated inconsistencies, each verified against the current tree:

1. `analisis.md` is the only non-English artifact filename (`schema.yaml` `generates`, template, skill bodies, seed rules, docs, website hero/install copy). Artifact *content* is multi-language via config; the *filename* should not be.
2. `src/core/templates/workflows/feedback.ts:48-49,112-113` instructs agents to run `openspec feedback` and declares "Requires openspec CLI" — the fork installs only the `qaspec` binary. The implemented command (`src/commands/feedback.ts`) is already QASpec-branded (`GITHUB_REPO_SLUG`, "Submitted via QASpec CLI"). The `cli-feedback` main spec is written entirely against `openspec feedback`.
3. `schemas/qaspec-pr-review/schema.yaml:18` says `/qas:analyze`; the product generates `/qsx:*`.
4. `product-landing-site` and `openspec-free-product-surface` specs declare `/qas:*` as the default prefix.
5. `QAS_EXPLORE_CONFIG_PREAMBLE` (`qas-workflow-preamble.ts:23`, heading `## Config (explore)`) survives only as the archive skill's preamble since explore was removed.
6. `src/commands/config.ts:559` hint lists "(propose, explore, apply, etc.)" — neither id exists in the QASpec core set.

Established mechanism to reuse: `src/core/artifact-graph/outputs.ts` holds the legacy filename alias map (`'testcases.md': 'testmatrix.md'`) with a rename notice.

## Goals / Non-Goals

**Goals:**

- One artifact vocabulary, all English filenames: `analysis.md`, `testcases.md`, `specs/**`, `publish-log.md`.
- Specs match shipped behavior (qaspec CLI, `/qsx:*` prefix) so they can be trusted as source of truth.
- A guard that prevents the feedback-skill bug class from recurring.

**Non-Goals:**

- Renaming `OPENSPEC_TELEMETRY` or telemetry internals.
- Touching legitimate upstream-coexistence references to `openspec-*` skills / `opsx-*` commands.
- Any behavior change in analyze/cases/publish flows.

## Decisions

### D1: `analysis.md` rename with read fallback, mirroring the testcases rename

`schema.yaml` `generates: analysis.md`; `git mv templates/analisis.md templates/analysis.md`; all instruction texts, skill bodies, seed rules, docs, and website copy updated. Add `'analysis.md': 'analisis.md'` to the legacy alias map in `outputs.ts` so dependency resolution and instruction loading read the legacy file when the new one is absent, with the same rename notice pattern. Writes always target `analysis.md`. The preamble constant `QAS_CASES_ANALISIS_AUTHORITY` renames to `QAS_CASES_ANALYSIS_AUTHORITY`.

*Alternative considered*: keep `analisis.md` as a quirk. Rejected — every new artifact follows English naming; one Spanish filename forces explanation in every doc and template.

### D2: Feedback alignment is skill + spec, not command

The command implementation is already correct; only the agent-facing skill template and the main spec lag. `feedback.ts` skill body switches to `qaspec feedback`, compatibility "Requires qaspec CLI", author metadata `qaspec`, and its example output references the QASpec repository. The `cli-feedback` spec is updated wholesale (`openspec feedback` → `qaspec feedback`, "openspec repository" → "the QASpec repository (per `GITHUB_REPO_SLUG`)", metadata strings "QASpec CLI version" / "Submitted via QASpec CLI") to match `src/commands/feedback.ts`.

### D3: Prefix corrections are spec-side for landing, implementation-side for schema

The landing site already ships `/qsx`-era copy; `product-landing-site` and `openspec-free-product-surface` specs change `/qas:*` → `/qsx:*` (delta specs), and a task verifies `website/src/` against the corrected rule. `schema.yaml:18` is a one-word implementation fix covered by existing schema tests.

### D4: Neutral preamble constant

`QAS_EXPLORE_CONFIG_PREAMBLE` → `QAS_BASE_CONFIG_PREAMBLE`, heading `## Config (explore)` → `## Config`. Only importer is `qas-archive.ts`. The generated archive skill body changes cosmetically (heading), which existing snapshot-style tests must reflect.

### D5: Guard extension scans generated bodies

The branding guard currently scans docs paths. Extend it (or add a sibling test) to iterate all skill and command template bodies from the generation registry and fail on `openspec <subcommand>` instruction patterns, with an allowlist for legitimate upstream-coexistence mentions (e.g. "leave `openspec-*` skills untouched" prose). This converts D2 from a one-time fix into a guarded invariant.

## Risks / Trade-offs

- [In-flight change has `analisis.md` and agent writes `analysis.md` mid-cycle] → fallback is read-only and notice suggests `git mv`; both files present → new name wins (same rule as testcases fallback); covered by test.
- [Guard false positives on upstream-coexistence prose] → allowlist by exact phrase or file, mirroring the existing docs guard allowlist approach.
- [External material (blogs, old screenshots) shows `analisis.md`] → CHANGELOG migration note; fallback keeps old changes working indefinitely.

## Migration Plan

1. Single release; no user action required (read fallback covers old changes; `git mv analisis.md analysis.md` optional).
2. CHANGELOG documents the filename change and the feedback skill fix.
3. Rollback: revert the commit; alias map entry is additive.

## Open Questions

(none)
