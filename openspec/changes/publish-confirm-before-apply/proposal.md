## Why

The `/qsx:publish` workflow currently resolves Qase prerequisites into `execution-context.md` and proceeds to MCP upload in the same run. That skips a human review gate: users cannot correct project code, role, base URL, or publish scope before cases hit Qase. Matrix already ends with a single approval halt; publish should follow the same pattern—prepare files first, then wait for explicit confirmation before any TCMS write.

## What Changes

- **Split publish into two phases in one command run:** (1) prepare `execution-context.md` (and a draft `publish-plan.md` or equivalent preview artifact) from artifacts and chat; (2) halt for user edit or confirm; (3) only after confirmation, invoke Qase MCP, write `publish-log.md`, and update `testmatrix.md` checkboxes.
- **Update** `qaspec-publish` skill/command template (`src/core/templates/workflows/publish.ts`) so step order enforces prepare → halt → MCP (no MCP in the same message as initial file creation).
- **Update** `schemas/qaspec-pr-review/schema.yaml` `apply.instruction` and optional template for publish preview/plan file.
- **Update** `qa-config-seed.ts` apply rules and main specs (`qas-workflows-and-commands`, `qaspec-pr-review-schema`) to require the confirmation halt.
- **Add tests** for template/snapshot parity and schema instruction strings reflecting the two-step flow.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `qas-workflows-and-commands`: Publish workflow SHALL prepare context files, halt once for user confirm/edit, then run MCP upload.
- `qaspec-pr-review-schema`: Apply-phase instructions and templates SHALL document the prepare-then-confirm-then-publish sequence; optional `publish-plan.md` template for pre-upload review.

## Impact

- `src/core/templates/workflows/publish.ts`
- `schemas/qaspec-pr-review/schema.yaml`, `schemas/qaspec-pr-review/templates/` (new or updated template)
- `src/core/qa-config-seed.ts`
- `openspec/specs/qas-workflows-and-commands/spec.md`, `openspec/specs/qaspec-pr-review-schema/spec.md` (on archive)
- Tests: `test/core/templates/skill-templates-parity.test.ts`, workflow/docs tests as applicable
