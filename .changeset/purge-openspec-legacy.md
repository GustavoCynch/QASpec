---
"@qaspec/cli": major
---

**BREAKING:** Remove OpenSpec fork-compat (telemetry, upstream coexistence, legacy cleanup, profile migration). QASpec resolves only `qaspec/` planning homes and `.qaspec.yaml` change metadata. Rename env vars to `QASPEC_CONCURRENCY`, `QASPEC_NO_COMPLETIONS`, `QASPEC_NO_AUTO_CONFIG`, and `QASPEC_INTERACTIVE`. Move global config to `~/.config/qaspec/` (XDG-resolved). Workspace metadata lives only in `.qaspec-workspace/` (legacy `.openspec-workspace/` is no longer read). Shell completions install as `_qaspec` files with `QASPEC:START`/`QASPEC:END` managed blocks and `_qaspec_*` functions; blocks installed by older versions must be removed by hand. Config-file managed blocks use `QASPEC:START`/`QASPEC:END` markers. JSON output `metadata.format` is now `qaspec`/`qaspec-change`.
