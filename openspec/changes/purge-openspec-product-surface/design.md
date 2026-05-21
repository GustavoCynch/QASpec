## Context

The fork reuses OpenSpec's TypeScript CLI architecture but targets **QA workflows** (`/qas:*`, `analisis.md`, `testmatrix.md`, Qase publish). Residual "OpenSpec" branding reads as if QASpec were the same product with a different skin.

The repo keeps `openspec/` for **historical specifications and archived changes** — that directory name is frozen. `.cursor/` keeps maintainer `opsx-*` skills for spec-driven work on this repo only.

## Goals / Non-Goals

**Goals:**

- One product name (**QASpec**), one CLI binary (**`qaspec`**), one default planning home name in docs (**`qaspec/`**).
- Zero `/opsx:` and zero `openspec <command>` in primary product documentation.
- CI guards that fail on regression.

**Non-Goals:**

- Migrating or renaming `openspec/specs/` or `openspec/changes/archive/` content.
- Removing `.cursor/commands/opsx-*` or `.cursor/skills/openspec-*` in this repository.
- Rewriting upstream OpenSpec source history or removing MIT lineage attribution entirely.

## Decisions

### 1. Remove `openspec` npm binary

| Option | Outcome |
|--------|---------|
| Keep shim (current) | Scripts/docs keep drifting to `openspec` |
| **Remove shim (chosen)** | **BREAKING**; forces `qaspec`; add CHANGELOG note |

Implementation: delete `bin/openspec.js` (or equivalent), update `package.json` `bin`, tests, and docs.

### 2. Consumer projects with existing `openspec/` folder

| Option | Outcome |
|--------|---------|
| Stop reading `openspec/` | Breaks existing users |
| **Read-only fallback (chosen)** | `resolvePlanningDirName()` keeps detecting legacy dir; **no doc references** |

### 3. Docs strategy

| File | Action |
|------|--------|
| `docs/cli.md` | Mechanical + editorial pass: all examples → `qaspec` |
| `docs/commands.md`, `getting-started.md`, etc. | Remove "legacy openspec planning home" paragraphs where confusing; use `qaspec/` only |
| `docs/opsx.md`, `docs/migration-guide.md` | **Delete** from `docs/`; optional stub: "Archived — see openspec/changes/archive/" |
| `WORKSPACE_REIMPLEMENTATION_*.md` | Replace `openspec workspace` → `qaspec workspace`; `.openspec-workspace` → `.qaspec-workspace` in target state (implement rename in code in same change or follow-up slice) |

**Workspace metadata rename:** If `.openspec-workspace` is still implemented, this change documents QASpec naming and adds a follow-up task slice OR implements alias read of old dir. **Recommend:** user-facing docs say `.qaspec-workspace/`; code accepts both during transition (single task in apply).

### 4. Branding guard expansion

Extend `test/branding/no-openspec-product-strings.test.ts` scan roots:

- `docs/` (with allowlist file for lines that cite repo path `openspec/changes/`)
- `WORKSPACE_REIMPLEMENTATION_*.md`, `MAINTAINERS.md`, `flake.nix`

Allowlist patterns:

- `openspec/changes/`, `openspec/specs/` (repo history paths)
- `upstream` qualified references in archive-only markdown (discouraged in `docs/`)

Extend `product-doc-guard` to fail on `openspec ` command invocations in primary docs (regex `openspec\s+[a-z]`).

### 5. Internal symbols

Keep `OPENSPEC_DIR_NAME` constant for legacy path detection but rename exported user-facing errors. Consider `hasActiveUpstreamOpenSpec` → `hasActiveUpstreamPlanningTool` in a later refactor; this change focuses on **strings and docs**, not large symbol renames unless trivial.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| BREAKING removal of `openspec` bin | CHANGELOG + release note; grep CI for `openspec` invocations in repo scripts |
| Broken doc links to opsx.md | Redirect stubs or update README links |
| Workspace users with `.openspec-workspace` | Read both directory names in code; document migration |

## Migration Plan

1. Land docs + bin removal + branding guards.
2. Release note: use `qaspec` only; legacy planning dir on disk still works if present.
3. Optional follow-up change: rename workspace metadata directory in code.

## Open Questions

- Whether to rename `.openspec-workspace` → `.qaspec-workspace` in code in this same change (recommended yes if workspace is still experimental).
