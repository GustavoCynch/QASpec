## 1. Legacy profile migration

- [x] 1.1 Export `OLD_CORE_WORKFLOWS` (or equivalent) from a shared module (`profiles.ts` or `migration.ts`) alongside `CORE_WORKFLOWS`
- [x] 1.2 Implement `migrateLegacyCoreProfileIfNeeded()` — exact match on custom + legacy four ids → save `profile: core` and core workflows; log one dim migration line
- [x] 1.3 Call migration at start of `InitCommand.execute()` and `UpdateCommand` before `getProfileWorkflows()`
- [x] 1.4 Remove or narrow `displayOldCoreCustomProfileNote` in `update.ts` so it does not contradict auto-migration

## 2. Init and update UX

- [x] 2.1 Use `usesQasWorkflowSurface()` (export from `skill-generation.ts` or shared helper) for getting-started hints in `init.ts` and `update.ts` instead of checking only `analyze`
- [x] 2.2 Add `analyze`, `matrix`, and `publish` entries to `WORKFLOW_PROMPT_META` in `config.ts`

## 3. Tests

- [x] 3.1 Add unit test for `migrateLegacyCoreProfileIfNeeded()` with mocked global config (legacy set migrates; other custom sets unchanged)
- [x] 3.2 Add init integration test: stub global config with legacy custom profile → assert `qas-publish` skill and `qas/publish.md` or `qas-publish.md` command exist; getting started mentions `/qas:publish`
- [x] 3.3 Run `vitest` for `test/core/init.test.ts` and related migration/update tests on macOS; confirm Windows path assertions use `path.join()`

## 4. Verification

- [x] 4.1 Manual smoke: with legacy global config, `qaspec init <tmpdir> --tools cursor --force` → five QAS commands including publish; success output lists `/qas:publish`
