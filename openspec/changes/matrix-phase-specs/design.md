## Context

- **Phase 1 (done):** `schemas/qaspec-pr-review/` ships `analyze` → `test-matrix` → `publish` with `testmatrix.md` checkboxes and QASpec core workflows (`/qas:matrix`, etc.).
- **Gap:** Main specs at `openspec/specs/<capability>/` and change deltas under `changes/<name>/specs/` were not part of the QA graph; matrix approval did not produce durable requirements for re-test or archive sync.
- **Product decision:** Specs are authored and approved in the **same phase** as the test matrix—the user refines cases and agreed behavior together.

## Goals / Non-Goals

**Goals:**

- Add `specs` artifact to `qaspec-pr-review` parallel to `test-matrix` (both require `analyze`).
- One UX surface: `/qas:matrix` writes/updates `testmatrix.md` and `specs/**/*.md`, one halt for both.
- `publish` requires both artifacts; archive can sync deltas to main specs (existing motor).
- `analyze` lists affected capabilities; matrix reads `openspec/specs/` for MODIFIED baselines.

**Non-Goals:**

- New `/qas:specs` command.
- `specs` requiring `test-matrix` in the graph (avoids formal two-step continue; siblings under `analyze` instead).
- Changing publish tracking file (`testmatrix.md` only).
- CLI rename or `qaspec/changes/` root rename.

## Decisions

### 1. Sibling artifacts under `analyze` (not `specs` → requires `test-matrix`)

```text
analyze
 ├── test-matrix → testmatrix.md
 └── specs       → specs/**/*.md
         └── publish requires [test-matrix, specs]
```

**Rationale:** `openspec continue` would force “matrix first, specs second” if `specs` depended on `test-matrix`, encouraging two halts or commands. Siblings let both be `ready` after analysis; the **skill** enforces co-creation in one phase.

**Alternative rejected:** `specs` requires `test-matrix` — simpler ordering but worse UX for co-approval.

### 2. Single halt covers matrix + specs

`qas-matrix` template instructs: do not proceed to publish in the same turn; end with one question approving **case list and requirements**. Chat iterations update **both** files when cases or requirements change.

### 3. Role split across artifacts

| Artifact | Content |
|----------|---------|
| `analisis.md` | PR/diff, risks, **Affected capabilities** (kebab-case); no delta specs |
| `testmatrix.md` | Checkboxes, suites; optional traceability to requirements |
| `specs/**/*.md` | ADDED/MODIFIED/REMOVED/RENAMED deltas; scenarios WHEN/THEN |

### 4. Delta template

Copy `schemas/spec-driven/templates/spec.md` structure into `schemas/qaspec-pr-review/templates/spec.md`; schema `specs` artifact uses OpenSpec delta conventions for archive/sync.

### 5. Traceability (recommended, not parsed by motor)

Optional HTML comment on matrix lines: `<!-- req: capability/requirement-slug -->`. No new parser in CLI for v1.

### 6. Roadmap alignment

Update `roadmap/11` and `roadmap/05` graphs to show phase 2 outputs: `testmatrix.md` + `specs/**/*.md`.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Matrix and specs drift | Single halt; matrix skill rule to edit both; traceability hints |
| **BREAKING:** existing QA changes lack `specs/` | Document: add minimal delta specs before publish or recreate change |
| Dual-analyst cost | Same as matrix today; orchestrator merges spec traceability in synthesis |
| MODIFIED specs incomplete at archive | Reuse spec-driven instruction text in schema; read main spec first |

## Migration Plan

1. Land schema + templates + workflow template updates in one implementation pass.
2. Sync main specs from this change’s deltas on archive.
3. Existing in-flight QA changes: run `/qas:matrix` once to add `specs/` or hand-author deltas before publish.

## Open Questions

- Whether `rules.specs` and `rules.test-matrix` should mandate bidirectional edit on chat iteration (recommended in default config snippet in tasks).
- Optional future: `openspec status` summary line “specs: N capabilities” — not required for v1.
