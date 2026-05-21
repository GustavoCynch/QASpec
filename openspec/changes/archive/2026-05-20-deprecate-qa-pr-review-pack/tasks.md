## 1. Reference pack labeling

- [x] 1.1 Grep the repo for `qa-pr-review`; list docs that still say “will be removed” or imply it is the active workflow
- [x] 1.2 Add **Reference only** banner at top of `.agents/skills/qa-pr-review/SKILL.md` — point to `/qas:analyze`, `/qas:matrix`, `/qas:publish`; state not installed by `openspec init`
- [x] 1.3 Confirm SKILL frontmatter keeps `disable-model-invocation: true` (or add it) so the pack is not auto-invoked alongside product workflows
- [x] 1.4 Optionally add `.agents/skills/qa-pr-review/README.md` one-liner: reference archive, runtime = `qas-*`

## 2. Documentation

- [x] 2.1 Update `README.md` — migration complete; pack **retained as reference** under `.agents/skills/qa-pr-review/`, not deleted
- [x] 2.2 Update `roadmap/11-proposed-workflow-phases.md` implementation note: pack = reference, product = `qas-*`
- [x] 2.3 Document two reference paths: pack `references/` (maintainers) vs `qaspec/references/` (consumer init seeds)

## 3. Schema templates (publish artifacts)

- [x] 3.1 Add `schemas/qaspec-pr-review/templates/publish-log.md` (minimal trace sections)
- [x] 3.2 Add `schemas/qaspec-pr-review/templates/execution-context.md` (Qase prerequisite placeholders)
- [x] 3.3 Run `openspec schema validate qaspec-pr-review`

## 4. Spec sync and verification

- [x] 4.1 Archive change and sync deltas to `openspec/specs/qas-workflows-and-commands/` and `openspec/specs/qaspec-pr-review-schema/`
- [x] 4.2 Temp-dir smoke: `openspec init` in empty dir with Cursor → verify `qaspec/references/*` and five `qas-*` skills/commands (do not commit into fork `.cursor/`)
- [x] 4.3 Confirm `.cursor/commands/opsx-*` unchanged (dogfooding surface preserved)
- [x] 4.4 Confirm `.agents/skills/qa-pr-review/` still present after change (reference retained)
- [x] 4.5 Run `pnpm test`

## 5. Explicitly not in this change

- [x] N/A Delete `.agents/skills/qa-pr-review/`
- [x] N/A CLI rename `openspec` → `qaspec` (separate change per roadmap 07)
- [x] N/A Commit `.cursor/commands/qas-*.md` in this repository
