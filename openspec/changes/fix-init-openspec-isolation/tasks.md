## 1. Coexistence detection

- [x] 1.1 Add `hasActiveUpstreamOpenSpec(projectRoot)` in `src/core/legacy-cleanup.ts` (or dedicated module) using explicit path checks from design
- [x] 1.2 Export helper for init/update call sites; use `path.join` for all paths

## 2. Legacy detection scope

- [x] 2.1 Remove `opsx-*` from cursor/junie/opencode legacy file patterns in `LEGACY_SLASH_COMMAND_PATHS`
- [x] 2.2 Gate `detectLegacyStructureFiles` so `openspec/AGENTS.md` and `openspec/project.md` are not legacy when upstream OpenSpec is active
- [x] 2.3 Short-circuit `detectLegacyArtifacts` to return no legacy when upstream OpenSpec is active and no QASpec-only legacy remains

## 3. Init and update integration

- [x] 3.1 Skip `handleLegacyCleanup` in `src/core/init.ts` when upstream OpenSpec is active and detection is empty
- [x] 3.2 Apply same guard in `src/core/update.ts` `handleLegacyCleanup`
- [x] 3.3 Replace OpenSpec upgrade copy in `formatDetectionSummary` with QASpec-branded messaging

## 4. Tests

- [x] 4.1 Add unit tests for `hasActiveUpstreamOpenSpec` (config, opsx commands, openspec skills)
- [x] 4.2 Add init integration test: fixture with `openspec/` + `.cursor/commands/opsx-propose.md` runs without cleanup prompt and files remain
- [x] 4.3 Update existing legacy-cleanup tests that assumed `opsx-*` are legacy targets
- [x] 4.4 Verify cross-platform paths in tests use `path.join`

## 5. Verification

- [x] 5.1 Run `pnpm test` for init and legacy-cleanup suites
- [x] 5.2 Manual smoke: `qaspec init` in a repo with upstream OpenSpec (repro from bug report)
