## Why

The bootstrap changes (`2026-05-20-bootstrap-qaspec-qa-workflow`, `2026-05-20-matrix-phase-specs`) shipped the QASpec QA motor (`qaspec-pr-review` schema, `qas-*` workflow templates, init reference scaffolding). The monolithic pack `.agents/skills/qa-pr-review/` remains in the tree without a clear **reference-only** role, so contributors may still treat it as the active workflow. This change closes the migration: product path is `/qas:*`; the pack stays as historical and domain reference, not as a parallel install surface.

## What Changes

- **Retain** `.agents/skills/qa-pr-review/` in the repository as **reference only** (SKILL.md + `references/`): add frontmatter/README markers that it is not installed by `openspec init`, not invoked by core profile, and superseded by `qas-*` workflows.
- **Add** optional schema templates `publish-log.md` and `execution-context.md` under `schemas/qaspec-pr-review/templates/` so publish-phase agents have structure (instructions already mention these files).
- **Update** main specs and README: migration complete; authoritative runtime = `qaspec init` + `/qas:*`; pack = read-only reference for Cynch/domain detail and diffing against ported templates.
- **Clarify** in design: this repo keeps `.cursor/commands/opsx-*` and `openspec-*` skills for **CLI dogfooding** (`spec-driven`); validating end-user `/qas:*` output is done via `openspec init` in a temp directory, not by committing generated `qas-*.md` here.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `qas-workflows-and-commands`: Clarify `qa-pr-review` as reference-only in repo; core init still installs `qas-*` only; document dogfooding vs consumer install paths.
- `qaspec-pr-review-schema`: Add optional templates for publish-side artifacts (`publish-log.md`, `execution-context.md`).

## Impact

- `.agents/skills/qa-pr-review/SKILL.md` (reference banner + `disable-model-invocation` or equivalent clarity)
- `schemas/qaspec-pr-review/templates/` (new template files)
- `openspec/specs/qas-workflows-and-commands/spec.md`, `openspec/specs/qaspec-pr-review-schema/spec.md` (deltas synced on archive)
- `README.md`, `roadmap/11-proposed-workflow-phases.md` (status: reference retained)
- **Out of scope:** `openspec` → `qaspec` CLI rename (roadmap 07), regenerating `.cursor/commands/qas-*` in this repo, Qase MCP in CLI
