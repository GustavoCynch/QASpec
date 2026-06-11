# Tasks: Purge OpenSpec Legacy

## 1. Delete telemetry

- [ ] 1.1 Delete `src/telemetry/` and remove its wiring from `src/cli/index.ts` (event sending, first-run notice, shutdown hooks)
- [ ] 1.2 Remove telemetry fields (`anonymousId`, `noticeSeen`) from the global-config schema in `src/core/global-config.ts` and any defaults
- [ ] 1.3 Remove `OPENSPEC_TELEMETRY`/`DO_NOT_TRACK` handling and the telemetry notice string; sweep `rg -i 'telemetry|posthog|edge\.openspec'` across src/, scripts/, docs/
- [ ] 1.4 Delete `test/telemetry/` and remove telemetry assertions from other suites (e.g. feedback tests); drop `posthog-node` from `package.json` if no longer imported

## 2. Delete fork-compat modules

- [ ] 2.1 Delete `src/core/upstream-coexistence.ts` and remove all call sites in `src/core/init.ts`, `src/core/update.ts`, and workspace/skill generation paths
- [ ] 2.2 Delete `src/core/legacy-cleanup.ts` and remove detection/cleanup phases from init and update flows
- [ ] 2.3 Delete `src/core/migration.ts` (legacy global profile migration) and its call site before workflow resolution in init
- [ ] 2.4 Delete `test/core/upstream-coexistence.test.ts`, `test/core/legacy-cleanup.test.ts`, `test/core/migration.test.ts`, `test/core/init-upstream-skills.test.ts`, `test/core/skill-generation-legacy.test.ts` (verify each is exclusively legacy before deleting)
- [ ] 2.5 Build and run the full test suite; fix compile errors from removed exports (search each deleted export name with `rg` to catch stragglers)

## 3. Planning home: qaspec/ only

- [ ] 3.1 Simplify `src/core/planning-dir.ts`: `resolvePlanningDirName()` returns `'qaspec'` unconditionally; delete `OPENSPEC_DIR_NAME` and existence-check fallback
- [ ] 3.2 Update `hasPlanningHome()` and any callers that distinguished legacy layouts (init safety checks, workspace foundation)
- [ ] 3.3 Update tests in `test/core/planning-dir.test.ts`, `test/core/init.test.ts`, `test/core/project-config.test.ts` that exercised the `openspec/` fallback; expected paths must use `path.join()` (cross-platform)
- [ ] 3.4 Update fixtures still using `openspec/` layouts (e.g. `test/fixtures/tmp-init/openspec/...`)

## 4. Rename .openspec.yaml → .qaspec.yaml

- [ ] 4.1 Change `METADATA_FILENAME` to `'.qaspec.yaml'` in `src/utils/change-metadata.ts` and export the constant
- [ ] 4.2 Replace hardcoded `'.openspec.yaml'` literals in `src/core/approval-ledger.ts` and `src/core/publish-gate.ts` with the exported constant
- [ ] 4.3 Sweep remaining `.openspec.yaml` mentions in source comments, generated workflow/skill templates (`src/core/templates/workflows/publish.ts`, `src/core/config-prompts.ts`, `src/core/tcms-target.ts`, `src/commands/tcms.ts`, `src/commands/approve.ts`, `src/core/project-config.ts`), and schemas/seeds
- [ ] 4.4 Update tests asserting the metadata filename (`test/utils/change-metadata.test.ts`, `test/core/approval-ledger.test.ts`, `test/core/publish-gate.test.ts`, `test/core/tcms-target.test.ts`, workflow integration tests)

## 5. Env vars and global config paths

- [ ] 5.1 Rename `OPENSPEC_CONCURRENCY` → `QASPEC_CONCURRENCY` in `src/cli/index.ts` and `src/commands/validate.ts`, including `--help`/option descriptions
- [ ] 5.2 Rename `OPENSPEC_NO_COMPLETIONS` → `QASPEC_NO_COMPLETIONS` in `scripts/postinstall.js` and `scripts/test-postinstall.sh`
- [ ] 5.3 Change global config dir leaf from `openspec` to `qaspec` in `src/core/global-config.ts` (XDG, macOS, Windows `%APPDATA%` branches, built with `path.join()`)
- [ ] 5.4 Update `test/core/global-config.test.ts` and any test setting `OPENSPEC_*` vars

## 6. Branding allowlist and guard

- [ ] 6.1 Shrink `OPENSPEC_PRODUCT_STRING_ALLOWLIST` in `src/core/branding.ts` to lineage attribution, repo planning-home path literals, and historical records; delete `LEGACY_OPENSPEC_COMMAND_CATEGORY`, `OPENSPEC_CLI_INSTRUCTION_ALLOWLIST` entries tied to deleted modules
- [ ] 6.2 Run `test/branding/no-openspec-product-strings.test.ts`; fix every straggler it surfaces instead of re-adding allowlist patterns

## 7. Dead branding in docs and metadata

- [ ] 7.1 Update `LICENSE` copyright holder to QASpec
- [ ] 7.2 Rewrite `scripts/README.md` heading/description to QASpec
- [ ] 7.3 Sweep `docs/*.md` for `openspec` CLI examples and `openspec/` paths → `qaspec` equivalents
- [ ] 7.4 Update `website/src/components/Footer.astro` and `website/src/site.ts`; verify no other website source references OpenSpec/Fission outside lineage
- [ ] 7.5 Update stale CLI examples in `CHANGELOG.md` (keep historical upstream PR links intact)
- [ ] 7.6 Verify `package.json` (repository, bugs, homepage, funding) and `scripts/pack-version-check.mjs` point at QASpec, not upstream

## 8. Verification

- [ ] 8.1 `pnpm build` and full `pnpm test` pass
- [ ] 8.2 Final sweep: `rg -i 'openspec|fission' src/ test/ scripts/ docs/ schemas/ website/ package.json` returns only intentional lineage/history/planning-home-path matches
- [ ] 8.3 Smoke test in a temp dir: `qaspec init`, `qaspec new change`, `qaspec tcms set`, `qaspec approve analyze`, `qaspec publish-gate` produce only `qaspec/` and `.qaspec.yaml` artifacts and no telemetry output
- [ ] 8.4 Confirm Windows CI (or local path-handling tests) passes for global-config and planning-dir changes
- [ ] 8.5 Add changeset with **BREAKING** entries (env vars, metadata filename, planning home, telemetry removal, global config path)
