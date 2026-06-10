# Tasks: Remove Explore Step

## 1. Core removal

- [ ] 1.1 Delete `src/core/templates/workflows/qas-explore.ts` and remove its re-exports (`getQasExploreSkillTemplate`, `getQasExploreCommandTemplate`) from `src/core/templates/skill-templates.ts`
- [ ] 1.2 Remove explore entries from the skill/command generation registry in `src/core/shared/skill-generation.ts` (skill entry at line ~42, command entry at line ~50)
- [ ] 1.3 Update `CORE_WORKFLOWS` in `src/core/profiles.ts` to `['analyze', 'matrix', 'publish', 'archive']`; keep `OLD_CORE_WORKFLOWS` unchanged (legacy detection input)
- [ ] 1.4 Remove `qaspec-explore` from the QASpec skill names list in `src/core/shared/tool-detection.ts` (keep upstream `openspec-explore` in `src/core/upstream-coexistence.ts` untouched)
- [ ] 1.5 Remove the `explore` mapping from `src/core/profile-sync-drift.ts` and the `explore` workflow description entry in `src/commands/config.ts`

## 2. Resolution resilience and cleanup

- [ ] 2.1 Implement retired-id filtering in workflow resolution: configs listing `explore` skip it with a one-line notice pointing to `/qsx:analyze`; generation continues and exits 0
- [ ] 2.2 Verify `removeUnselectedSkillDirs` and the command-file equivalent delete `qaspec-explore` skill dirs and `qsx-explore.md` / `qsx/explore.md` command files on `qaspec update` for both flat and subdir command layouts; extend init to the same behavior if any path misses it
- [ ] 2.3 Confirm the `upstreamOpenSpecActive` guard preserves `openspec-explore` skills and `opsx-*` commands during cleanup

## 3. User-facing surfaces

- [ ] 3.1 Update `src/ui/welcome-screen.ts` (drop `/qsx:explore` line) and init/update success hints in `src/core/init.ts:755` and `src/core/update.ts:347` so the first suggested step is `/qsx:analyze`
- [ ] 3.2 Update the legacy migration messages in `src/core/migration.ts` (lines ~106, ~159) to the four-workflow set and `/qsx:analyze` as entry point
- [ ] 3.3 Update the project.md migration hint in legacy cleanup to reference `/qsx:analyze` instead of `/qas:explore`

## 4. Documentation and website

- [ ] 4.1 Update `docs/workflows.md`, `docs/commands.md`, `docs/getting-started.md`, `docs/cli.md`, and `README.md`: remove explore from tables, pipeline diagrams, and examples; pipeline reads `analyze → matrix → publish → archive`; note that free-form investigation happens in normal chat or at the start of analyze
- [ ] 4.2 Update the website (`website/src/`) pipeline/steps section from five steps to four
- [ ] 4.3 Check `docs/customization.md`, `docs/multi-language.md`, `docs/concepts.md`, `docs/installation.md`, and `docs/supported-tools.md` for explore references (rg `qsx:explore|qaspec-explore|'explore'`) and update any hits

## 5. Tests

- [ ] 5.1 Update existing suites referencing `qaspec-explore`, `/qsx:explore`, or workflow id `explore` (branding, core, cli-e2e, docs guards) to the four-workflow expectations
- [ ] 5.2 Add test: update on a project containing previously generated `qaspec-explore` skill dir and explore command file removes both (Claude and Cursor layouts)
- [ ] 5.3 Add test: config with `profile: custom` and workflows `['explore', 'analyze', 'matrix']` generates analyze and matrix, prints the retired-id notice, and exits 0
- [ ] 5.4 Add test: legacy global config (`propose`, `explore`, `apply`, `archive`) migrates to `profile: core` and generates exactly four skills/commands
- [ ] 5.5 Run full verification: `pnpm lint`, `pnpm build`, `pnpm test`
