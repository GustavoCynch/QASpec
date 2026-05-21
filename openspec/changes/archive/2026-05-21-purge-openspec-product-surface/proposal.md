## Why

QASpec is a **QA spec-driven fork**, not a rebranded OpenSpec product. The CLI skeleton was reused, but user-facing copy, docs, package metadata, workspace guides, and Nix devshell still present OpenSpec as the product name. That confuses testers and implies feature parity with upstream spec-driven dev workflows.

After `remove-openspec-app-commands` and `align-docs-qas-cli`, residual references remain in `docs/cli.md`, `docs/commands.md`, `flake.nix`, `MAINTAINERS.md`, `WORKSPACE_REIMPLEMENTATION_*.md`, completion templates, telemetry keys, and the deprecated `openspec` npm binary shim.

## What Changes

- **Documentation purge:** Rewrite all `docs/**` (except none — full tree) so commands, paths, and examples use **`qaspec`** and **`qaspec/`** only. Remove or relocate `docs/opsx.md` and `docs/migration-guide.md` (content may move under `openspec/changes/archive/` notes, not shipped as product docs).
- **CLI reference:** Replace every `openspec <cmd>` example in `docs/cli.md` with `qaspec <cmd>`; planning paths default to `qaspec/` in prose.
- **Package surface:** Remove **`openspec` npm binary** from `package.json` `bin` ( **BREAKING** for scripts still calling `openspec`). Single entrypoint: `qaspec`.
- **User-facing code:** CLI help, errors, init/update banners, completions install paths, feedback URLs — QASpec-only wording. Tighten `qaspec-branding` guard to include `docs/` and root markdown.
- **Workspace maintainer docs:** Rewrite `WORKSPACE_REIMPLEMENTATION_DIRECTION.md` and `WORKSPACE_REIMPLEMENTATION_START_HERE.md` to use `qaspec workspace *` and `.qaspec-workspace/` (or documented QASpec names), not `openspec workspace`.
- **Nix / maintainer files:** `flake.nix`, `MAINTAINERS.md`, `README.md`, `AGENTS.md` — QASpec product naming.
- **Legacy planning home (runtime):** Code MAY still **read** an existing on-disk `openspec/` directory in **consumer projects** for backward compatibility, but MUST NOT document it as the default; greenfield init creates only `qaspec/`. No new user-facing strings saying "openspec/".
- **Upstream detection rename (internal):** Replace user-visible "upstream OpenSpec" with "upstream tooling" where needed; keep minimal internal identifiers only where required for migration detection (allowlisted in branding guard).
- **Delete product pages:** Remove `docs/opsx.md` and `docs/migration-guide.md` from the published doc set (or replace with one-line stubs linking to archived material in repo `openspec/changes/archive/` if links break).

## Capabilities

### New Capabilities

- `openspec-free-product-surface`: QASpec product SHALL NOT expose OpenSpec naming in docs, CLI binaries, or user-visible messages outside explicit allowlists.

### Modified Capabilities

- `qaspec-cli`: Remove requirement for `openspec` executable shim; only `qaspec` binary.
- `qaspec-branding`: Extend guards to `docs/`, root markdown, `flake.nix`; stricter allowlist (repo `openspec/` path references in maintainer docs only).
- `openspec-conventions`: Workspace metadata directory naming and command examples use QASpec vocabulary in user-facing convention text.
- `cli-init` / `cli-update`: Success copy and path hints use `qaspec/` only in product messaging.
- `global-config`: Config/schema paths under user home use `qaspec` naming where currently `openspec` appears in documented paths.

## Impact

- `docs/**` (major rewrite), `docs/cli.md` (largest)
- `flake.nix`, `MAINTAINERS.md`, `WORKSPACE_REIMPLEMENTATION_*.md`, `README.md`, `AGENTS.md`
- `package.json`, `bin/`, `src/cli*.ts` help strings
- `src/core/planning-dir.ts`, `src/core/global-config.ts`, `src/core/branding.ts`, completions under `src/core/completions/`
- `test/branding/`, `test/docs/`, broad test expectation updates
- **Out of scope (explicit):**
  - Renaming or deleting the repository tree **`openspec/`** (spec history, changes, archive)
  - **`.cursor/`** commands and skills (maintainer dogfooding)
  - Upstream OpenSpec git history or attribution line in README (single lineage sentence allowed per branding spec)
