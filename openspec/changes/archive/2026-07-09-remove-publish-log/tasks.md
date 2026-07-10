# Tasks: remove-publish-log

## 1. Schema package

- [x] 1.1 Rewrite `apply.instruction` in `schemas/qaspec-pr-review/schema.yaml`: after user confirmation (gate token cited) the flow is read case blocks → MCP create → mark `- [x]` in `testcases.md` per case; add title-based reconciliation of unchecked cases against Qase before creating on re-run (never blind-create); state that legacy `publish-log.md` is ignored alongside legacy `publish-plan.md`; update the **Language** line to reference halt text only; remove every `publish-log.md` mention
- [x] 1.2 Delete `schemas/qaspec-pr-review/templates/publish-log.md`

## 2. Generated workflow bodies and seed rules

- [x] 2.1 Update `QAS_PUBLISH_BODY` in `src/core/templates/workflows/publish.ts` (step 10 and guardrails): per case MCP create → `- [x]` in `testcases.md`, no `publish-log.md` writes, title-based reconciliation on re-run, legacy `publish-log.md` ignored
- [x] 2.2 Update `rules.apply` seed strings in `src/core/qa-config-seed.ts`: replace the write-ahead-log rules with checkbox marking plus title-based reconciliation on re-run; keep gate-token and omit-on-unmapped rules unchanged

## 3. Tests

- [x] 3.1 Update `test/core/qa-config-seed.test.ts`: assert `templates/publish-log.md` does NOT exist; update seeded `rules.apply` assertions to the new checkbox/reconciliation wording and assert no rule mentions `publish-log.md`
- [x] 3.2 Update `test/core/templates/qas-workflow-bodies.test.ts`: drop the publish-log Status-column template assertions; assert the publish body has no `publish-log` mention, marks `- [x]` per case, and reconciles by title on re-run
- [x] 3.3 Run the full test suite (`pnpm test`) and build (`pnpm build`); fix any remaining references (all path assertions keep using `path.join()` for cross-platform CI)

## 4. Docs and website

- [x] 4.1 Update `docs/commands.md`, `docs/getting-started.md`, `docs/workflows.md`, and `docs/concepts.md`: publish flow is upload + checkbox marking only; remove `publish-log.md` mentions including the pipeline diagram in concepts.md
- [x] 4.2 Update `website/src/site.ts`: publish step artifact label `→ publish-log.md` becomes the checkbox update in `testcases.md` (e.g. `→ testcases.md ✓`)

## 5. Verification

- [x] 5.1 Run `grep -rn "publish-log" src schemas docs website test` and confirm zero hits outside `openspec/` history/archives — see deviation note below: task 1.1 explicitly requires stating that legacy `publish-log.md` is ignored (same treatment as legacy `publish-plan.md`), so the single "ignore legacy" mention and its guarding tests remain by design; no write-ahead-log or Status-column references remain
- [x] 5.2 Run `openspec validate remove-publish-log` and confirm the change passes
