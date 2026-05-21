## Context

- **Done:** QA schema, `qas-*` workflows, reference scaffold, `qa-pr-review` reference-only pack.
- **Today:** `OPENSPEC_DIR_NAME = 'openspec'`, single bin `openspec`, package `@fission-ai/openspec`.
- **Fork dogfooding:** This repository may continue using `openspec/changes/` and `opsx-*` commands for CLI development; consumer docs must say `qaspec`.

## Goals / Non-Goals

**Goals:**

- Users install and run **`qaspec`** as the product CLI.
- New projects get **`qaspec/`** planning home.
- Existing projects with only **`openspec/`** keep working without manual renames.
- `openspec` remains available temporarily with clear deprecation messaging.
- Full test suite green on macOS/Linux/Windows path expectations (`path.join`).

**Non-Goals:**

- Forcing migration of this repo’s `openspec/changes/` tree in the same PR (optional doc note only).
- Replacing committed `.cursor/commands/opsx-*` in the fork.
- Publishing to npm registry under new scope (can be follow-up release change).
- Renaming every historical string `OpenSpec` in archived specs/changes.

## Decisions

### 1. Dual binary, single implementation

**Choice:** `bin/qaspec.js` (primary) and `bin/openspec.js` (thin shim or shared entry) calling the same `dist` CLI.

**Rationale:** Roadmap 07 requires compatibility; one implementation avoids drift.

**Shim behavior:** Print once per process to stderr: `openspec is deprecated; use qaspec` (exact wording in implementation).

### 2. Planning home resolution order

**Choice:** Central resolver used by init, status, instructions, archive, workspace:

1. If `qaspec/` exists at project root → use it.
2. Else if `openspec/` exists → use it (legacy).
3. Else on **init** → create `qaspec/`.

**Rationale:** New branding without breaking clones that still have `openspec/changes/`.

**Config file:** Prefer `qaspec/config.yaml`; fallback `openspec/config.yaml` when only legacy dir exists. Init writes `qaspec/config.yaml`.

### 3. Constant naming in code

**Choice:** Add `QASPEC_DIR_NAME = 'qaspec'`; keep `OPENSPEC_DIR_NAME` as deprecated alias or replace usages in one pass with resolver API `getPlanningHomeDir(projectRoot)`.

**Rationale:** Avoid scattering string literals; tests assert via resolver, not hardcoded slashes.

### 4. Package identity

**Choice:** `@qaspec/cli` in `package.json`; update README install line to `pnpm add -g @qaspec/cli` (or `npm i -g`).

**Rationale:** Matches roadmap; decouples from Fission-AI package name.

**Note:** `repository` URL stays this fork; no requirement to publish under `@qaspec` scope in this change.

### 5. User-facing strings only where product-facing

**Choice:** Commander program name `qaspec`; internal module/file names may stay `openspec-*` until a later cleanup if churn is high.

**Rationale:** Minimize diff size; branding is what users see in `--help`.

### 6. Schema and workflow templates

**Choice:** Update **user-visible** path strings in `schemas/qaspec-pr-review/schema.yaml` instructions and `src/core/templates/workflows/*` from `openspec/config.yaml` → `qaspec/config.yaml` and `openspec/specs/` → `qaspec/specs/` where they denote project layout.

**Rationale:** QA agents must not point at legacy paths for greenfield projects.

**Legacy:** Instructions may add “or `openspec/` if present” only where resolution is ambiguous.

### 7. Two implementation batches in one change (tasks)

| Batch | Scope |
|-------|--------|
| **A** | `package.json`, bins, CLI branding, shim, docs smoke |
| **B** | Planning resolver, init/create `qaspec/`, test fixture updates |

Both ship in one archive; batch A can land first in a single PR if review size matters.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Missed hardcoded `openspec/` path | Grep + CI test for resolver; Windows path.join in new tests |
| Dual-dir projects (both exist) | Resolver prefers `qaspec/`; document in design/tasks |
| Downstream CI scripts use `openspec` | Shim + update `.github/workflows` in fork |
| Confusion with agent prefix `/qas:` vs CLI `qaspec` | Docs table: CLI=`qaspec`, chat=`/qas:` (no `qas` CLI) |

## Migration Plan

1. Implement resolver + dual bin.
2. Update init to scaffold `qaspec/`.
3. Run full `pnpm test`.
4. Smoke: temp dir `qaspec init` → `qaspec new change x --schema qaspec-pr-review`.
5. Smoke: temp dir with only legacy `openspec/` layout still resolves.
6. Update roadmap 07/README status.
7. This fork: optional later PR to rename `openspec/changes` → `qaspec/changes` (not blocking).

## Open Questions

- **npm publish name:** Confirm `@qaspec/cli` vs `@qaspec/qaspec` before release (default: `@qaspec/cli`).
- **Shim removal date:** Document “removed in v2” or leave open in README.
