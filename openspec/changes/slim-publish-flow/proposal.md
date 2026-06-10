# Slim Publish Flow

## Why

The publish phase writes three files per change, and two of them have design defects. `publish-plan.md` duplicates the unchecked cases (with preconditions and steps) from `testcases.md` — a drift risk: when the user edits one file, the other is stale and the flow cannot tell which one is authoritative. `execution-context.md` stores the Qase project code and base URL per change, even though these values are project-scoped and never change between PRs — testers re-answer the same prerequisite question on every cycle. Publish should be one lightweight confirmation, not a file-production step.

## What Changes

- **BREAKING**: The publish prepare step no longer writes `publish-plan.md` or `execution-context.md`. The pre-publish review is an in-chat summary (target project, suites, case count, warnings) derived live from `testcases.md`.
- The TCMS target (provider, project code, base URL) moves to project config: a `tcms` block in `qaspec/config.yaml`, resolved once per project instead of once per change.
- When no `tcms` target is configured, publish discovers Qase projects via MCP and offers to use an existing project **or create a new one**; after the user picks, the choice is persisted to `qaspec/config.yaml` so later cycles skip the question.
- `publish-log.md` stays — it is the only prepare-side file with real value (traceability of created suites/cases and their Qase IDs).
- One confirmation halt before MCP remains mandatory; scope edits after the halt are handled in chat (re-summarize, confirm again) instead of by editing prepare files.
- Backward compatibility: when a legacy `execution-context.md` exists in a change and config has no `tcms` block, publish reads it as the prerequisite source and offers to persist its values to config; leftover `publish-plan.md` files are ignored.
- `execution-context.md` and `publish-plan.md` templates are removed from the schema package.

Out of scope: support for TCMS providers other than Qase (the `tcms.provider` field is forward-looking but v1 behavior remains Qase-only); test execution/runs (future `/qsx:run`); `analisis.md` rename and other leftovers (proposal `cleanup-leftovers`).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `qas-workflows-and-commands`: Publish workflow behavior — in-chat summary replaces prepare files; TCMS target resolved from config; Qase project discovery/creation halt when unconfigured; persistence of the chosen target to config.
- `qaspec-pr-review-schema`: Publish outputs reduce to `publish-log.md`; apply instruction drops prepare-file steps; `execution-context.md` and `publish-plan.md` templates removed.
- `qas-config-seed`: Seed includes a commented `tcms` example block documenting provider, project code, and base URL.
- `config-loading`: Parses optional `tcms` block (`provider`, `project`, `baseUrl`) with resilient field-by-field validation.

## Impact

- **Modified**: `schemas/qaspec-pr-review/schema.yaml` (apply instruction), `src/core/templates/workflows/publish.ts`, `src/core/qa-config-seed.ts`, `src/core/project-config.ts`, `src/core/templates/workflows/qas-archive.ts` (if it references prepare files), docs (`workflows.md`, `commands.md`, `getting-started.md`, `concepts.md`), website if it mentions publish files.
- **Deleted**: `schemas/qaspec-pr-review/templates/execution-context.md`, `schemas/qaspec-pr-review/templates/publish-plan.md`.
- **Tests**: suites covering publish instructions, schema templates, config parsing, and config seed.
- **Users**: existing changes keep publishing (legacy `execution-context.md` is read and migrated on first publish); the per-change prerequisite question disappears once `tcms` is in config.
