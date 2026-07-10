# Proposal: remove-publish-log

## Why

Real-world use of the publish phase shows `publish-log.md` burns tokens and creates a redundant artifact: agents write three status updates per case (`pending` → `in-flight` → `done`) into a file nothing in the CLI ever reads, while `testcases.md` checkboxes already track what was uploaded. For a 15-case change that is ~45 redundant file edits per publish run.

## What Changes

- **BREAKING**: The publish (apply) phase no longer writes `publish-log.md`. Checkbox marks in `testcases.md` become the only local publish tracking.
- The `publish-log.md` template is removed from the `qaspec-pr-review` schema package.
- Per-case publish flow simplifies to: MCP create → mark `- [x]` in `testcases.md`. No local Qase IDs are recorded.
- Re-run idempotency changes from write-ahead-log reconciliation to title-based reconciliation: before creating, the agent checks unchecked cases against existing Qase cases by title and never blind-creates.
- `qaspec-publish` skill/command bodies, init seed rules (`rules.apply`), docs, and the website pipeline copy drop all `publish-log.md` references.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qaspec-pr-review-schema`: publish phase drops the `publish-log.md` write-ahead log requirement and template; tracking is checkbox-only with title-based reconciliation on re-run.
- `qas-workflows-and-commands`: the `qaspec-publish` skill drops write-ahead rows and per-row ID updates; after confirmation it uploads and marks checkboxes only, reconciling by title on re-run.
- `qas-config-seed`: `rules.apply` seed drops the publish-log write-ahead rule; keeps gate token, omit-on-unmapped, and adds title-based reconciliation wording.

## Impact

- `schemas/qaspec-pr-review/schema.yaml` — apply instruction rewrite (remove publish-log flow).
- `schemas/qaspec-pr-review/templates/publish-log.md` — deleted.
- `src/core/templates/workflows/publish.ts` — skill/command body update.
- `src/core/qa-config-seed.ts` — `rules.apply` seed strings.
- `openspec/specs/{qaspec-pr-review-schema,qas-workflows-and-commands,qas-config-seed}/spec.md` — via delta specs.
- `docs/commands.md`, `docs/getting-started.md`, `docs/workflows.md`, `docs/concepts.md` — publish flow descriptions.
- `website/src/site.ts` — publish step artifact label.
- `test/core/qa-config-seed.test.ts`, `test/core/templates/qas-workflow-bodies.test.ts` — assertions on removed strings.
- Existing changes in user projects keep old `publish-log.md` files harmlessly; publish ignores them (same treatment as legacy `publish-plan.md`).
