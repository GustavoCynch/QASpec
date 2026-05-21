## Why

`qaspec init` inherited OpenSpec’s legacy-cleanup flow, which treats current OpenSpec artifacts (`.cursor/commands/opsx-*.md`, `openspec/AGENTS.md`, etc.) as “legacy” and prompts to delete them with “Upgrading to the new OpenSpec”. QASpec is a separate product with its own planning home (`qaspec/`). Running init in a repo that already uses upstream OpenSpec must not offer to remove or upgrade that installation.

## What Changes

- Detect an **active upstream OpenSpec** installation in the target repo and **skip legacy cleanup** when present.
- Restrict QASpec legacy detection to **QASpec-owned** artifacts only (e.g. `qas-*` slash commands, QASpec marker blocks), not `opsx-*` or current OpenSpec skills/commands.
- Do not delete or prompt on `openspec/AGENTS.md` (or other `openspec/` files) when `openspec/` is the upstream planning home and `qaspec/` is absent or being added alongside.
- Replace OpenSpec-branded upgrade copy during `qaspec init` with neutral messaging when QASpec-specific legacy is found (or silence cleanup when coexisting OpenSpec is detected).
- Add regression tests: init on a fixture with `openspec/` + `opsx-*` commands proceeds without cleanup prompt and leaves OpenSpec files intact.

## Capabilities

### New Capabilities

- `openspec-coexistence`: Rules for detecting upstream OpenSpec in a repo and ensuring `qaspec init` / `qaspec update` do not modify or remove it.

### Modified Capabilities

- `legacy-cleanup`: Scope detection and cleanup to QASpec legacy only; skip or no-op when upstream OpenSpec is present; adjust user-facing prompts and summaries for the QASpec CLI.

## Impact

- `src/core/legacy-cleanup.ts` — detection, summaries, cleanup guards
- `src/core/init.ts`, `src/core/update.ts` — call sites for coexistence check
- `test/core/legacy-cleanup.test.ts`, `test/core/init.test.ts` — new scenarios
- `openspec/specs/legacy-cleanup/spec.md` — requirement deltas via change specs
