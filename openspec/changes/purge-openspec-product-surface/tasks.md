## 1. Inventory and guards

- [ ] 1.1 Grep repo (exclude `openspec/`, `.cursor/`, `node_modules/`, `dist/`) for `OpenSpec`, `openspec `, `/opsx:`, `.openspec-workspace`; produce checklist by directory
- [ ] 1.2 Extend `src/core/branding.ts` allowlist for repo path literals only; expand scan to `docs/`, `WORKSPACE_*.md`, `MAINTAINERS.md`, `flake.nix`
- [ ] 1.3 Extend `test/docs/product-docs-qas-commands.test.ts` to reject `openspec <subcommand>` in primary docs
- [ ] 1.4 Remove `openspec` from `package.json` `bin`; delete shim entrypoint; update any repo scripts to `qaspec`

## 2. Documentation

- [ ] 2.1 Rewrite `docs/cli.md`: all examples and paths use `qaspec` / `qaspec/`
- [ ] 2.2 Purge remaining `openspec/` and OpenSpec prose in `docs/commands.md`, `getting-started.md`, `workflows.md`, `concepts.md`, `supported-tools.md`, `customization.md`, `installation.md`, `multi-language.md`
- [ ] 2.3 Remove `docs/opsx.md` and `docs/migration-guide.md`; fix README and doc cross-links
- [ ] 2.4 Update `product-doc-guard.ts` PRIMARY paths list after deletions

## 3. Root and maintainer files

- [ ] 3.1 Update `flake.nix`, `MAINTAINERS.md`, `README.md`, `AGENTS.md` for QASpec-only product naming
- [ ] 3.2 Rewrite `WORKSPACE_REIMPLEMENTATION_DIRECTION.md` and `WORKSPACE_REIMPLEMENTATION_START_HERE.md` with `qaspec workspace` and QASpec metadata paths

## 4. CLI and user-visible code

- [ ] 4.1 Replace user-facing `openspec` strings in CLI help, errors, init/update, completions templates/installers
- [ ] 4.2 Audit `src/core/global-config.ts` and documented config paths for `qaspec` naming in user messages
- [ ] 4.3 Workspace: document `.qaspec-workspace/`; implement read alias for `.openspec-workspace/` if still required

## 5. Tests and validation

- [ ] 5.1 Update tests that expect `openspec` binary or OpenSpec product strings in docs output
- [ ] 5.2 Run full `pnpm test` and fix failures
- [ ] 5.3 Run `openspec validate purge-openspec-product-surface --strict`
- [ ] 5.4 Grep guard: zero unallowlisted `OpenSpec` / `openspec ` in `docs/` and root markdown (except allowlist)
