## 1. Migrate fork planning home (N/A from qaspec-cli-rename §6)

- [x] 1.1 Move `openspec/config.yaml`, `openspec/specs/`, `openspec/changes/`, `openspec/explorations/` → `qaspec/` (preserve git history where possible)
- [x] 1.2 Remove empty `openspec/` root directory after verification
- [x] 1.3 Grep repo for `openspec/changes`, `openspec/specs`, `openspec/config` in docs and CI; update to `qaspec/` for fork paths
- [x] 1.4 Confirm `node bin/qaspec.js list` resolves changes under `qaspec/changes/`

## 2. Commit qas-* agent samples (N/A §6)

- [x] 2.1 Run `node bin/qaspec.js update` (or init) at fork root with Cursor skills+commands delivery
- [x] 2.2 Commit `.cursor/commands/qas-explore.md`, `qas-analyze.md`, `qas-matrix.md`, `qas-publish.md`, `qas-archive.md`
- [x] 2.3 Commit `.cursor/skills/qas-*/SKILL.md` for the five workflows
- [x] 2.4 Verify `opsx-*` and `openspec-*` skills/commands remain (no accidental deletion)

## 3. Remove openspec shim (N/A §6)

- [x] 3.1 Delete `bin/openspec.js`; remove `openspec` from `package.json` `bin`
- [x] 3.2 Remove shim deprecation tests; ensure tests invoke `qaspec` only
- [x] 3.3 Update `docs/installation.md`, README, CHANGELOG **BREAKING** entry
- [x] 3.4 Update `.github/workflows` to call `qaspec` (or `node bin/qaspec.js`)

## 4. Specs and closure

- [x] 4.1 Update `openspec/specs/qaspec-cli/spec.md` Purpose section (no longer TBD)
- [x] 4.2 Run `pnpm test`
- [x] 4.3 Archive change; sync deltas to main specs
