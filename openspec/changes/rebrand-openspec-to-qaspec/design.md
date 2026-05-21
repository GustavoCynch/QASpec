## Context

- **Product:** QASpec fork of upstream OpenSpec; QA-focused (`qaspec-pr-review`, `/qas:*`).
- **Sibling change:** `qaspec-cli-rename` handles binary `qaspec`, package `@qaspec/cli`, and planning home `qaspec/` with legacy `openspec/` resolver.
- **This change:** User-visible **product language** — replace “OpenSpec” as the name of *this* tool with **QASpec** / **QA Spec**, while preserving accurate references to **upstream OpenSpec** (detection, coexistence, lineage).
- **Volume:** ~900+ grep hits across repo; many in archived changes and explorations (out of scope).

## Goals / Non-Goals

**Goals:**

- Single **naming matrix** applied consistently across CLI, docs, specs, templates, and tests.
- Meta-spec `openspec-conventions` describes **QASpec** conventions (file id may stay for history).
- CI or test guard preventing regression of product mis-branding in `src/`, `docs/`, `README.md`, `schemas/`, `test/`.
- Fork feedback URLs point to QASpec repository, not Fission-AI/OpenSpec.

**Non-Goals:**

- Renaming `openspec/` directory or CLI command (delegated to `qaspec-cli-rename`).
- Editing `openspec/changes/archive/**` or exploration markdown except where actively maintained.
- Renaming TypeScript identifiers (`hasOpenSpecMarkers`, `OPENSPEC_DIR_NAME`) unless purely cosmetic with zero behavior risk.
- Removing README lineage credit to [openspec.dev](https://openspec.dev/) — one explicit “inspired by” line remains.

## Decisions

### 1. Naming matrix

| Context | Use | Example |
|--------|-----|---------|
| Product title in prose | **QA Spec** or **QASpec** | “QA Spec helps teams agree on what to test…” |
| CLI / command references | **qaspec** | `qaspec init` (after cli-rename) |
| Technical / package | **QASpec** | `@qaspec/cli`, `qaspec-pr-review` |
| Upstream tool detection | **OpenSpec** (unchanged) | “upstream OpenSpec install detected” |
| Path literals (until migration) | **openspec/** as *legacy layout* | “legacy `openspec/` planning home” |
| Lineage / attribution | **OpenSpec** once in README | “Inspired by OpenSpec (openspec.dev)…” |
| Category tag in generated commands | **QASpec** for QA; **OpenSpec** only for legacy `opsx-*` profile | `category: 'QASpec'` vs `category: 'OpenSpec'` |

**Rationale:** Testers see “QA Spec”; engineers see `qaspec`; coexistence code stays precise.

### 2. Layered pass order (implementation)

1. **Constants module** (optional): `PRODUCT_DISPLAY_NAME = 'QASpec'`, `PRODUCT_TAGLINE` — inject into init/update logs.
2. **`src/core/init.ts`, `update.ts`** — spinners, success lines, learn-more URLs.
3. **`src/core/templates/**`, `schemas/**`** — instruction strings naming the product.
4. **`openspec/specs/**` (main tree only)** — via archive of this change, not hand-editing 40 files outside delta.
5. **`README.md`, `docs/**`, `roadmap/**`, `AGENTS.md`**.
6. **Tests** — string expectations aligned with matrix.

**Rationale:** Source of truth for runtime UX first; spec archive applies convention deltas.

### 3. Grep allowlist for verification

**Choice:** Add `test/branding/no-openspec-product-strings.test.ts` (or script in CI) that fails if `OpenSpec` appears under `src/`, `docs/`, `README.md`, `schemas/` **except** lines matching allowlist patterns:

- `upstream OpenSpec`
- `Inspired by [OpenSpec]`
- `openspec.dev`
- `legacy OpenSpec` / `opsx` / `Fission-AI/OpenSpec` in comments about migration
- String literals required for upstream detection (`hasOpenSpecMarkers`, etc.)

**Rationale:** Prevents regression without blocking legitimate upstream references.

### 4. Spec file `openspec-conventions` id

**Choice:** Keep capability id **`openspec-conventions`**; update **content** to say QASpec. Optional follow-up rename to `qaspec-conventions` is out of scope (high churn in tooling paths).

### 5. Coordination with `qaspec-cli-rename`

**Choice:** If both changes are open, merge **cli-rename first** or same PR with clear ownership: cli-rename owns paths/binaries; rebrand owns display strings. When both touch `init.ts`, rebrand uses `qaspec` in new strings and “legacy `openspec/`” where resolver still supports fallback.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Over-replace breaks upstream detection | Allowlist + keep `hasOpenSpecMarkers` and coexistence messages explicit |
| Huge diff noise in archive/ | Scope grep to active trees; document exclusions |
| Docs say `qaspec` before binary ships | Note dependency in tasks; ship cli-rename or dual strings briefly |
| Explorations still say OpenSpec | Accept stale explorations or single README pointer |

## Migration Plan

1. Land naming matrix in `qaspec-branding` spec (this change).
2. Implement source + docs pass per tasks.md.
3. Run allowlist grep test + full `pnpm test`.
4. Archive change → updates main `openspec/specs/*` from deltas.
5. Optional follow-up: rename `openspec-conventions` capability id.

## Open Questions

- **Display form in Spanish UI:** Always “QASpec” vs localized “QA Spec” — default English **QASpec** in CLI; no i18n in this change.
- **Explorations folder:** Bulk replace vs leave stale — default **leave** unless user wants cleanup PR.
