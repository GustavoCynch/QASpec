## 1. Schema and templates

- [x] 1.1 Add `schemas/qaspec-pr-review/templates/publish-plan.md` (suites, unchecked cases, target project)
- [x] 1.2 Update `schemas/qaspec-pr-review/schema.yaml` `apply.instruction`: prepare `execution-context.md` + `publish-plan.md`, single confirm halt, MCP only after confirm
- [x] 1.3 Update `src/core/qa-config-seed.ts` apply rules to match prepare → confirm → MCP ordering

## 2. Publish workflow template

- [x] 2.1 Rewrite `src/core/templates/workflows/publish.ts` steps: prerequisites → write files → halt for edit/confirm → MCP + `publish-log.md` + checkboxes
- [x] 2.2 Ensure guardrail text forbids Qase MCP in the same message as initial file creation

## 3. Tests and docs

- [x] 3.1 Update `test/core/templates/skill-templates-parity.test.ts` (and snapshots if needed) for new publish strings
- [x] 3.2 Add or extend test asserting schema/seed publish instructions mention `publish-plan.md` and confirmation halt
- [x] 3.3 Update product docs if they describe publish as immediate upload (`docs/workflows.md` or similar)

## 4. Verification

- [x] 4.1 Run `pnpm test` for affected workflow/template tests
- [x] 4.2 Manual smoke: init temp project, run publish instructions path — agent creates plan + context, halts, no MCP until confirm
