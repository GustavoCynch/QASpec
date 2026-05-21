## 1. Migrate fork planning home (N/A from qaspec-cli-rename §6)

- [ ] 1.1 Move `openspec/config.yaml`, `openspec/specs/`, `openspec/changes/`, `openspec/explorations/` → `qaspec/` (preserve git history where possible)
- [ ] 1.2 Remove empty `openspec/` root directory after verification
- [ ] 1.3 Grep repo for `openspec/changes`, `openspec/specs`, `openspec/config` in docs and CI; update to `qaspec/` for fork paths
- [ ] 1.4 Confirm `node bin/qaspec.js list` resolves changes under `qaspec/changes/`

## 2. Commit qas-* agent samples (N/A §6)

- [ ] 2.1 Run `node bin/qaspec.js update` (or init) at fork root with Cursor skills+commands delivery
- [ ] 2.2 Commit `.cursor/commands/qas-explore.md`, `qas-analyze.md`, `qas-matrix.md`, `qas-publish.md`, `qas-archive.md`
- [ ] 2.3 Commit `.cursor/skills/qas-*/SKILL.md` for the five workflows
- [ ] 2.4 Verify `opsx-*` and `openspec-*` skills/commands remain (no accidental deletion)

## 3. Remove openspec shim (N/A §6)

- [ ] 3.1 Delete `bin/openspec.js`; remove `openspec` from `package.json` `bin`
- [ ] 3.2 Remove shim deprecation tests; ensure tests invoke `qaspec` only
- [ ] 3.3 Update `docs/installation.md`, README, CHANGELOG **BREAKING** entry
- [ ] 3.4 Update `.github/workflows` to call `qaspec` (or `node bin/qaspec.js`)

## 4. Specs and closure

- [ ] 4.1 Update `openspec/specs/qaspec-cli/spec.md` Purpose section (no longer TBD)
- [ ] 4.2 Run `pnpm test`
- [ ] 4.3 Archive change; sync deltas to main specs
