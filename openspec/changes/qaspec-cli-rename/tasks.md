## 1. Package and binaries (batch A)

- [ ] 1.1 Rename `package.json` `name` to `@qaspec/cli`; update description, keywords, repository URL to this fork
- [ ] 1.2 Add `bin.qaspec` entry (`bin/qaspec.js`); keep `bin.openspec` as shim to same implementation
- [ ] 1.3 Implement one-line stderr deprecation when invoked via `openspec` shim
- [ ] 1.4 Update Commander program name and top-level help text to QASpec branding
- [ ] 1.5 Grep `src/cli` for user-visible "OpenSpec" strings; update where product-facing

## 2. Planning home resolver (batch B)

- [ ] 2.1 Add planning-home resolver: prefer `qaspec/`, fallback `openspec/`; use `path.join` throughout
- [ ] 2.2 Replace or wrap `OPENSPEC_DIR_NAME` usages with resolver API in init, update, archive, change commands, workspace
- [ ] 2.3 Init creates `qaspec/` + `qaspec/config.yaml` on greenfield; default schema remains `qaspec-pr-review`
- [ ] 2.4 Config load: prefer `qaspec/config.yaml`, fallback `openspec/config.yaml` when legacy only
- [ ] 2.5 Add unit tests for resolver (both dirs exist → qaspec wins; only openspec → legacy; neither → init creates qaspec)

## 3. Templates, schema instructions, and docs

- [ ] 3.1 Update `schemas/qaspec-pr-review/schema.yaml` path strings (`qaspec/config.yaml`, `qaspec/specs/`) where they denote project layout
- [ ] 3.2 Update workflow template strings in `src/core/templates/workflows/` for planning paths
- [ ] 3.3 Update `docs/installation.md`, `docs/getting-started.md`, root `README.md`
- [ ] 3.4 Mark `roadmap/07-commands-and-cli-rename.md` and `roadmap/README.md` status as in progress / done per outcome

## 4. Tests and CI

- [ ] 4.1 Update `test/**` fixtures expecting CLI binary name and planning paths (use path.join)
- [ ] 4.2 Add test: `openspec` shim prints deprecation and exits 0 on `--version` or `list`
- [ ] 4.3 Update `.github/workflows` steps that call `openspec` if they should document `qaspec` as primary
- [ ] 4.4 Run `pnpm test` on macOS/Linux; include Windows path task if new path assertions added

## 5. Smoke verification

- [ ] 5.1 Temp dir: `qaspec init` → `qaspec/references/*`, `qaspec/config.yaml`, `qaspec/changes/archive/`
- [ ] 5.2 Temp dir: `qaspec new change smoke-qa --schema qaspec-pr-review` + `qaspec status --json`
- [ ] 5.3 Fixture repo with only `openspec/`: `qaspec status` still resolves

## 6. Explicitly not in this change

- [ ] N/A Migrate this fork’s `openspec/changes/` tree to `qaspec/changes/` (optional follow-up)
- [ ] N/A Commit `.cursor/commands/qas-*.md` in the fork repository
- [ ] N/A Remove `openspec` shim binary
