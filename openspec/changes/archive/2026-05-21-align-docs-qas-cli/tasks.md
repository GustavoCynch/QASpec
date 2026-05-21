## 1. Audit and guardrails

- [x] 1.1 Grep `docs/` and `README.md` for `/opsx:`, `openspec-`, and legacy workflow ids; record per-file rewrite notes
- [x] 1.2 Add `test/docs/product-docs-qas-commands.test.ts` (or extend branding test) with allowlist for `docs/opsx.md` and `docs/migration-guide.md`
- [x] 1.3 Define allowlist/constants for legacy doc paths used by the guard

## 2. Primary user guides

- [x] 2.1 Rewrite `docs/getting-started.md`: default path `/qas:explore` → analyze → matrix → publish → archive; fix project layout and examples
- [x] 2.2 Rewrite `docs/commands.md`: quick reference and per-command sections for five `/qas:*` commands only in default tables
- [x] 2.3 Rewrite `docs/workflows.md`: core profile, QA pipeline, remove expanded `/opsx:*` enablement via QASpec config
- [x] 2.4 Update `docs/concepts.md` terminology (change, artifacts, halts) to match QASpec QA flow

## 3. Reference and legacy pages

- [x] 3.1 Update `docs/supported-tools.md` with `qas-*` skill paths and `/qas:*` command paths per tool
- [x] 3.2 Add legacy banner and link-out at top of `docs/opsx.md`; demote `/opsx:*` to historical content
- [x] 3.3 Restructure `docs/migration-guide.md`: keep mapping tables under "Legacy OPSX" heading after existing product callout
- [x] 3.4 Review `docs/cli.md`, `docs/customization.md`, `docs/multi-language.md` for stale `/opsx:` or legacy profile examples

## 4. README and validation

- [x] 4.1 Align `README.md` quick-start and command examples with `docs/getting-started.md`
- [x] 4.2 Run documentation guard + full `pnpm test`; fix any failures
- [x] 4.3 Run `openspec validate align-docs-qas-cli --strict`
- [x] 4.4 Manual read-through: follow getting-started as a new user; confirm no doc implies QASpec installs `/opsx:propose`
