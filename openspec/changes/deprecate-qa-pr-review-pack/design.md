## Context

- **Done:** `qaspec-pr-review` schema, five core workflows (`qas-explore` … `qas-archive`), `scaffoldQaspecReferences()` on init, templates in `src/core/templates/workflows/`.
- **Remaining:** `.agents/skills/qa-pr-review/` lacks an explicit **reference-only** contract; README still says “will be removed in a follow-up.”
- **This repo’s agent layout:** `.cursor/commands/opsx-*` and `.cursor/skills/openspec-*` support **spec-driven** changes to the fork itself. They are **not** the QASpec product surface and will **not** be replaced with committed `qas-*.md` files here.

## Goals / Non-Goals

**Goals:**

- Single **authoritative runtime** QA path for consumers: `qaspec init` → `/qas:*` + `qaspec-pr-review` schema.
- Keep `.agents/skills/qa-pr-review/` as a **read-only reference** (original Cynch workflow, domain rules, diff baseline for templates)—not deleted.
- Give publish phase minimal templates for `publish-log.md` and `execution-context.md`.
- Update normative specs and docs so “reference vs product” is unambiguous.

**Non-Goals:**

- Deleting or moving the pack out of the repository.
- Installing `qa-pr-review` via core `init` or documenting it as a user-facing slash command.
- Phase C: global CLI rename (`openspec` → `qaspec`, `@qaspec/cli`, planning root rename).
- Committing `.cursor/commands/qas-*.md` or `.cursor/skills/qas-*` in this repository.
- Changing `openspec/config.yaml` in this repo to `qaspec-pr-review` (dogfooding stays `spec-driven` until a separate decision).
- Implementing Qase MCP inside the CLI.

## Decisions

### 1. Retain pack as reference-only (do not delete)

**Choice:** Keep `.agents/skills/qa-pr-review/` with explicit labeling: reference archive, not product workflow.

**Rationale:** Preserves the full original skill (Cynch context, ISTQB/Qase detail, phase narrative) for maintainers porting or auditing `qas-*` templates. Consumer projects get English/generic seeds via `reference-scaffold.ts`; the pack remains the rich domain source of truth in-repo.

**Implementation:**

- SKILL frontmatter: `description` states reference-only; keep or strengthen `disable-model-invocation: true` so Cursor does not auto-invoke it alongside `/qas:*`.
- Short **Reference only** section at top of SKILL.md pointing to `/qas:analyze`, `/qas:matrix`, `/qas:publish`.
- README: “superseded for execution; retained as reference under `.agents/skills/qa-pr-review/`.”

**Alternative rejected:** Delete directory — loses audit trail and domain-specific reference text not fully duplicated in scaffold seeds.

### 2. Do not regenerate QASpec commands in this repo

**Choice:** No task to run `openspec update` for `qas-*` under `.cursor/`.

**Rationale:** `.cursor/commands/qas-*` are not used to validate the CLI here; smoke validation remains `openspec init` in a temp dir (documented in tasks).

### 3. Publish artifact templates as optional scaffolds

**Choice:** Add `templates/publish-log.md` and `templates/execution-context.md` with minimal section headers; publish remains the `apply` phase (no new artifact id).

**Rationale:** `schema.yaml` `apply.instruction` already names these files; templates improve first-run consistency without expanding the graph.

### 4. Reference `references/` vs consumer `qaspec/references/`

**Choice:** Pack `references/` stay beside the reference SKILL; do not require init to copy from `.agents/skills/`. Consumer init continues to seed `qaspec/references/` from `reference-scaffold.ts`.

**Rationale:** Two paths, two roles: pack = maintainer/domain reference; `qaspec/references/` = project runtime files.

### 5. Spec deltas, not new capability folder

**Choice:** MODIFY existing `qas-workflows-and-commands` and `qaspec-pr-review-schema` main specs on archive.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Agents still invoke reference skill | `disable-model-invocation: true` + prominent banner; README states product path |
| Drift between pack and `qas-*` templates | Reference-only doc; optional task to note “last synced from pack @ commit” in template file headers |
| Dual reference paths confuse users | README table: pack (maintainers) vs `qaspec/references/` (projects after init) |

## Migration Plan

1. Grep for `qa-pr-review`; update README/roadmap (retained as reference, not removed).
2. Add reference banner to `SKILL.md`; confirm init does not install this skill.
3. Add schema publish templates; `openspec schema validate qaspec-pr-review`.
4. Archive change; sync spec deltas.
5. Smoke (temp dir): `openspec init` → `qaspec/references/*` and five `qas-*` only.

## Open Questions

- None blocking. Phase C (`qaspec` CLI rename) remains a **separate** change.
