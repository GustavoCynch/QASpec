## 1. Shared coexistence filtering

- [ ] 1.1 Export `UPSTREAM_OPENSPEC_SKILL_NAMES` (or a shared constant) from `legacy-cleanup.ts` or `tool-detection.ts` for reuse in init/update
- [ ] 1.2 Add `filterSkillTemplatesForUpstreamCoexistence(templates, upstreamActive)` that drops templates whose `dirName` is in the upstream skill name list
- [ ] 1.3 Add `filterCommandContentsForUpstreamCoexistence(contents, upstreamActive)` that drops command entries that map to upstream-only workflows (`propose`, `apply`, `sync`, etc.) when upstream is active — align with `WORKFLOW_TO_SKILL_DIR` / `COMMAND_IDS`

## 2. Init command

- [ ] 2.1 In `InitCommand.generateSkillsAndCommands`, call `hasActiveUpstreamOpenSpec(projectPath)` once per run
- [ ] 2.2 Apply filters before the per-tool write loop; log one coexistence summary line when filtering applies
- [ ] 2.3 Ensure `removeSkillDirs` during delivery/profile shrink does not delete `openspec-*` dirs when upstream is active (if that path runs on init)

## 3. Update command

- [ ] 3.1 Apply the same coexistence filters in both skill-generation code paths in `update.ts`
- [ ] 3.2 Gate skill removal so `removeSkillDirs` skips `UPSTREAM_OPENSPEC_SKILL_NAMES` when upstream is active

## 4. Tests

- [ ] 4.1 Extend `init.test.ts`: fixture with `openspec/config.yaml`, upstream `openspec-propose` and `openspec-apply-change` content markers; after init, file content unchanged and `qas-explore` (or core skill) exists
- [ ] 4.2 Add `update.test.ts` case: upstream skills present, run update with profile including propose/apply — upstream skills unchanged
- [ ] 4.3 Run targeted vitest for init/update/legacy-cleanup on macOS; note Windows path.join in assertions per project rules

## 5. Verification

- [ ] 5.1 Run `openspec validate fix-init-skip-upstream-openspec-skills --strict` (or project equivalent)
- [ ] 5.2 Manual smoke: repo with upstream OpenSpec + `qaspec init --tools cursor --force` — confirm `SKILL.md` under `openspec-propose` and `openspec-apply-change` no longer show Modified from QASpec overwrite
