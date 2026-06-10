# Cleanup Leftovers

## Why

Three waves of renames (qas→qsx, explore removal, matrix→cases, slim publish) left inconsistencies that confuse users and contradict shipped behavior: the analysis artifact is the only Spanish-named file (`analisis.md`) in an otherwise English artifact set; the agent feedback skill instructs running `openspec feedback` (a CLI that QASpec does not install) while the implemented command is already QASpec-branded; and two main specs still declare `/qas:*` as the product command prefix when the product ships `/qsx:*`. Small individually, together they erode trust in the specs as the source of truth.

## What Changes

- **BREAKING (file name only)**: The analyze artifact becomes `analysis.md` (schema `generates`, template file, skill bodies, seeded rules, docs, website). Changes created before the rename keep working: reads fall back to legacy `analisis.md` with a rename notice — the same mechanism already used for `testmatrix.md` → `testcases.md`.
- The `/feedback` agent skill submits via `qaspec feedback` (not `openspec feedback`) and its metadata says "Requires qaspec CLI"; the `cli-feedback` spec is rewritten against the `qaspec` CLI and the QASpec repository, matching the already-QASpec-branded implementation.
- `product-landing-site` and `openspec-free-product-surface` specs declare `/qsx:*` as the agent command prefix (matching what init generates); landing copy is checked against it.
- Stray inconsistencies fixed in implementation: `/qas:analyze` in `schema.yaml` analyze instruction becomes `/qsx:analyze`; the `QAS_EXPLORE_CONFIG_PREAMBLE` constant (used only by the archive skill since explore was removed) is renamed to a neutral name with heading `## Config`; the `qaspec config` hint "(propose, explore, apply, etc.)" lists current workflow ids.
- The branding regression guard also scans generated skill/command template bodies so a `openspec <subcommand>` instruction (the feedback-skill bug class) fails CI.

Out of scope: `OPENSPEC_TELEMETRY` env var and telemetry internals; upstream-coexistence allowlists for genuine `openspec-*`/`opsx-*` surfaces (those are correct); any workflow behavior change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `qaspec-pr-review-schema`: Analyze artifact generates `analysis.md`; cases/specs scenarios reference `analysis.md`; legacy `analisis.md` read fallback added.
- `qas-workflows-and-commands`: Analyze and Cases workflow behavior requirements reference `analysis.md`.
- `artifact-language-policy`: Language policy examples reference `analysis.md`.
- `cli-feedback`: Command, purpose, metadata, and agent-skill requirements written against `qaspec feedback` and the QASpec repository.
- `product-landing-site`: Public copy declares `/qsx:*` as the agent command prefix.
- `openspec-free-product-surface`: Landing vocabulary rule says `/qsx:*`; regression guards cover generated skill/command bodies.

## Impact

- **Renamed file**: `schemas/qaspec-pr-review/templates/analisis.md` → `analysis.md`.
- **Modified**: `schemas/qaspec-pr-review/schema.yaml`, `src/core/artifact-graph/outputs.ts` (legacy alias map), `src/core/templates/workflows/{analyze,cases,publish,qas-archive,qas-workflow-preamble,feedback}.ts`, `src/core/qa-config-seed.ts`, `src/commands/config.ts`, branding/product-doc guard module and its allowlists.
- **Docs/website**: `docs/getting-started.md`, `docs/workflows.md`, `docs/commands.md`, `docs/concepts.md`, `README.md`, `website/src/` (`Hero.astro`, `Install.astro`, `site.ts`).
- **Tests**: suites referencing `analisis.md`, the feedback skill body, guard fixtures.
- **Users**: in-flight changes with `analisis.md` keep working via the read fallback; no config or command changes.
