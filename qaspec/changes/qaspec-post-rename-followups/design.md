## Context

- `qaspec-cli-rename` archived as `2026-05-21-qaspec-cli-rename`; resolver prefers `qaspec/`, shim still present.
- This fork still has `openspec/changes/`, `openspec/specs/`, `openspec/config.yaml`.
- `.cursor/` has `opsx-*` / `openspec-*` for spec-driven work; no committed `qas-*` samples yet.

## Goals / Non-Goals

**Goals:**

- Fork uses **`qaspec/`** as its only planning home (no duplicate `openspec/` tree).
- Reviewers see committed **`qas-*`** agent files matching current templates.
- Package ships **`qaspec` bin only**; clear **BREAKING** note for `openspec` removal.
- `pnpm test` and CI green.

**Non-Goals:**

- Removing `opsx-propose`, `opsx-apply`, etc. (still needed to develop the CLI with `spec-driven`).
- Renaming paths inside `changes/archive/*` (historical archive folders stay as-is).
- Forcing downstream users to delete `openspec` shim (they never had it if on latest after this release).

## Decisions

### 1. Planning home migration (fork only)

**Choice:** `git mv` (or equivalent) `openspec/` → `qaspec/` for `config.yaml`, `specs/`, `changes/`, `explorations/`.

**Rationale:** Aligns the product repo with the resolver’s preferred layout; active change `qaspec-post-rename-followups` lives under `qaspec/changes/` after move.

**Follow-up grep:** Update hardcoded `openspec/changes` in README, workflows, and contributor docs—not every mention of the word “openspec” in archived deltas.

### 2. Dual agent surface in `.cursor/`

**Choice:**

| Path | Role |
|------|------|
| `opsx-*`, `openspec-*` | Dogfooding **CLI** changes (`spec-driven`) |
| `qas-*` | Committed **samples** of consumer QA workflow |

Generate `qas-*` with `node bin/qaspec.js update` (or init) targeting repo root; commit output. Do not delete `opsx-*`.

**Rationale:** Satisfies N/A task #2 while honoring prior decision to keep OPSX commands for fork development.

### 3. Remove shim in one breaking step

**Choice:** Delete `bin/openspec.js` and `package.json` `bin.openspec`; remove shim-specific tests; add CHANGELOG **BREAKING**.

**Rationale:** Shim existed for transition; after fork migration and doc updates, maintenance cost outweighs benefit.

**Mitigation:** Document `npx qaspec` / global `qaspec`; note one-line sed for CI: `openspec` → `qaspec`.

### 4. Legacy resolver behavior unchanged

**Choice:** Keep “if only `openspec/` exists, resolve it” for **external** consumer repos; only **this fork** drops its `openspec/` tree.

**Rationale:** N/A task #1 is fork hygiene, not removing consumer backward compatibility.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Broken links to `openspec/changes/...` | Grep + fix docs/CI |
| Duplicate planning homes during PR | Single atomic move; delete empty `openspec/` after verify |
| CI still calls `openspec` | Update workflows to `qaspec` |
| Users/scripts on `openspec` bin | CHANGELOG breaking + major version bump discussion |

## Migration Plan

1. Move `openspec/` → `qaspec/`.
2. Run `qaspec update` for Cursor; commit `qas-*`; leave `opsx-*`.
3. Remove shim; fix tests.
4. Grep docs/CI; run `pnpm test`.
5. Archive this change under `qaspec/changes/archive/`.

## Open Questions

- **Version bump:** Recommend minor vs major for shim removal (default: **major** if package already public).
