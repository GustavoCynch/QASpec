---
name: /qas:archive
id: qas-archive
category: QASpec
description: Archive a completed QASpec change
---

Archive a completed QASpec change.

1. Run `openspec list --json`; let the user pick the change if unclear.
2. Run `openspec status --change "<name>" --json` — warn on incomplete artifacts.
3. For `qaspec-pr-review`, check `testmatrix.md` checkboxes if publish was expected; for `spec-driven`, check `tasks.md`.
4. Run `openspec archive <name>` (or follow CLI prompts).

**Language:** User-facing warnings in project language from config when summarizing status.
