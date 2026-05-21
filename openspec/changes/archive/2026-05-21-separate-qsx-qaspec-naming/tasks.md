## 1. Naming constants and registry

- [x] 1.1 Set `QASPEC_COMMAND_PREFIX = 'qsx'` and add `QASPEC_SKILL_PREFIX = 'qaspec'` with `qaspecSkillDirName()` in `src/core/qaspec-commands.ts`
- [x] 1.2 Update `SKILL_NAMES` in `src/core/shared/tool-detection.ts` to `qaspec-*` ids
- [x] 1.3 Update `skill-generation.ts` dir names and `profile-sync-drift.ts` workflow→skill mapping

## 2. Workflow templates and references

- [x] 2.1 Rename skill `name` fields in `src/core/templates/workflows/*.ts` to `qaspec-<workflow>`
- [x] 2.2 Replace `/qas:` with `/qsx:` in template bodies, `reference-scaffold.ts`, `qa-config-seed.ts`, `migration.ts`
- [x] 2.3 Extend `transformToHyphenCommands` (or equivalent) for `/qsx:` → `/qsx-` in Pi/OpenCode paths

## 3. Command generation and adapters

- [x] 3.1 Verify all adapters use `qasCommandFileBase` / `qasSlashCommandName` (no hardcoded `qas-`)
- [x] 3.2 Update Claude/CodeBuddy/Gemini subdir from `qas` to `qsx` via `qasCommandSubdir()`
- [x] 3.3 Update adapter JSDoc comments that still say `qas-<id>.md`

## 4. Legacy cleanup and coexistence

- [x] 4.1 Register transitional `qas-*` skills and `qas-*.md` commands as legacy; exclude `qsx-*` and `qaspec-*`
- [x] 4.2 Update cleanup user messages (`replaced by /qsx:*`) and `legacy-cleanup.ts` cursor patterns
- [x] 4.3 Update `upstream-coexistence` / init skip logic for `qaspec-*` skill dir names

## 5. CLI UX and documentation

- [x] 5.1 Update `init.ts`, `update.ts`, `welcome-screen.ts` to print `/qsx:*` hints
- [x] 5.2 Update `docs/commands.md`, `docs/supported-tools.md`, and any branding guard tests for `/qsx:*`
- [x] 5.3 Update `test/docs/product-docs-qas-commands.test.ts` allowlist/patterns

## 6. Tests and validation

- [x] 6.1 Update init/update/command-generation/legacy-cleanup test expectations for `qsx-*` and `qaspec-*`
- [x] 6.2 Temp-dir smoke: `qaspec init --tools cursor` yields `qsx-analyze.md` and `qaspec-analyze/SKILL.md`
- [x] 6.3 Run `node bin/qaspec.js validate separate-qsx-qaspec-naming --strict`
- [x] 6.4 Archive change and sync deltas to `openspec/specs/`
