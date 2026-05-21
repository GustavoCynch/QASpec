## 1. Generation registries

- [x] 1.1 Remove `LEGACY_*` skill and command entries from `src/core/shared/skill-generation.ts`; default `getSkillTemplates` / `getCommandTemplates` to QASpec entries only
- [x] 1.2 Simplify or remove `getCoexistenceSkillTemplates` dual-surface merge; keep QASpec core `qas-*` install when upstream active
- [x] 1.3 Remove legacy workflow ids from `ALL_WORKFLOWS` in `src/core/profiles.ts` and from profile/config interactive pickers
- [x] 1.4 Delete unused legacy template modules under `src/core/templates/` (opsx commands, openspec skills) after confirming no in-repo imports remain

## 2. Init and update

- [x] 2.1 Remove `openspec-*` skill mappings from `WORKFLOW_SKILL_DIRS` in `src/core/init.ts` and parallel paths in `src/core/update.ts`
- [x] 2.2 Replace post-init/post-update `/opsx:*` and “Legacy OpenSpec workflow” messages with QASpec-only `/qas:*` hints
- [x] 2.3 Update `src/core/delivery-resolve.ts` to stop preferring `both` delivery for coexistence based on openspec template presence
- [x] 2.4 Ensure `src/core/migration.ts` no longer advertises `/opsx:propose` as a product feature

## 3. Workflow CLI and cleanup

- [x] 3.1 Update `src/commands/workflow/instructions.ts` to remove `openspec-continue-change` and related skill name references
- [x] 3.2 Extend legacy cleanup registry in `src/core/legacy-cleanup.ts` to remove QASpec-installed `openspec-*` / `opsx-*` when upstream inactive; preserve upstream skip rules
- [x] 3.3 Trim `src/core/upstream-coexistence.ts` skip lists to upstream skill names only (no QASpec-generated openspec dirs)

## 4. Tests

- [x] 4.1 Update `test/core/shared/skill-generation.test.ts` for QASpec-only template lists
- [x] 4.2 Update `test/core/init.test.ts` and `test/core/update.test.ts`: expect no generated `openspec-*`/`opsx-*`; keep upstream coexistence cases
- [x] 4.3 Add temp-dir smoke: `qaspec init` produces `qas-analyze` and not `opsx-propose` under `.cursor/commands/`
- [x] 4.4 Run full test suite on macOS; verify Windows path assertions use `path.join`

## 5. Documentation

- [x] 5.1 Update product-facing `docs/**` sections that document installed `openspec-*` or `/opsx:*` commands from QASpec init
- [x] 5.2 Confirm `openspec/` tree and repo `.cursor/commands/opsx-*` are explicitly out of scope in change notes (no deletion)

## 6. Verification

- [x] 6.1 Run `openspec validate remove-openspec-app-commands --strict` (or project equivalent)
- [x] 6.2 Manual: `qaspec init` in temp project with Cursor — only `qas-*` artifacts; legacy files cleaned when upstream absent
