## 1. Naming matrix and guard

- [ ] 1.1 Add `src/core/branding.ts` (or equivalent) with `PRODUCT_DISPLAY_NAME`, fork docs/feedback URLs, and allowlist patterns for grep guard
- [ ] 1.2 Add `test/branding/no-openspec-product-strings.test.ts` scanning `src/`, `docs/`, `README.md`, `schemas/` with allowlist exceptions per design.md
- [ ] 1.3 Document naming matrix in code comment at top of branding module (mirror design table)

## 2. CLI and core messages

- [ ] 2.1 Update `src/core/init.ts`: spinners, welcome, success, already-initialized, getting-started — QASpec/QA Spec; legacy profile labeled "legacy OpenSpec workflow"
- [ ] 2.2 Update `src/core/update.ts`: errors, learn-more/feedback URLs to fork; module header describes QASpec
- [ ] 2.3 Update Commander program description / global help in CLI entry if it still says OpenSpec
- [ ] 2.4 Coordinate with `qaspec-cli-rename` if merged: use `qaspec` in all new user-facing command examples

## 3. Templates, schemas, and generation

- [ ] 3.1 Grep `src/core/templates/**` and replace product-facing "OpenSpec" with QASpec per matrix; keep upstream/legacy qualifiers
- [ ] 3.2 Update `schemas/qaspec-pr-review/schema.yaml` (and other active schemas) instruction strings that name the product
- [ ] 3.3 Update `command-generation` category defaults: QASpec for `/qas:*`, OpenSpec only for legacy `opsx-*` metadata

## 4. Legacy cleanup and coexistence copy

- [ ] 4.1 Review `src/core/legacy-cleanup.ts` user-visible strings; ensure upstream vs QASpec distinction (identifiers unchanged)
- [ ] 4.2 Review init/update coexistence error paths for "upstream OpenSpec" wording

## 5. Documentation

- [ ] 5.1 Update `README.md`: status line ("QASpec fork" not "OpenSpec fork"); keep single inspired-by line
- [ ] 5.2 Update `docs/**` and `roadmap/**` product references; grep `docs` for `OpenSpec` and fix user-facing hits
- [ ] 5.3 Update root `AGENTS.md` if it presents OpenSpec as this product name

## 6. Tests

- [ ] 6.1 Update `test/core/init.test.ts`, `update.test.ts`, `legacy-cleanup.test.ts` expected strings
- [ ] 6.2 Run `pnpm test` on macOS; verify Windows path tests still pass if touched
- [ ] 6.3 Run branding guard test; fix any false positives by tightening allowlist (not disabling guard)

## 7. Verification and closeout

- [ ] 7.1 Manual smoke: `qaspec init` in temp dir — output says QASpec, links point to fork
- [ ] 7.2 Grep active tree: zero unqualified "OpenSpec" in `src/` user strings outside allowlist
- [ ] 7.3 Archive change with `openspec archive rebrand-openspec-to-qaspec` after apply (merges spec deltas)
