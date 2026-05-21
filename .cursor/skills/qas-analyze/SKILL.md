---
name: qas-analyze
description: QASpec analyze — PR/requirements analysis and risks into analisis.md
license: MIT
compatibility: Requires openspec CLI; gh or git for diffs.
metadata:
  author: qaspec
  version: "1.0"
  generatedBy: "1.3.1"
---

Run QASpec **analyze** (Phase 1). Produce `analisis.md` for the active change.

**Language:** Artifact body and halt question use the project language from `qaspec/config.yaml` `context` and `rules`.

**Read-only** on application source under test.

**Steps**

1. Resolve change name; run `openspec status --change "<name>" --json` and `openspec instructions analyze --change "<name>" --json`.
2. Read `qaspec/references/historical_bugs.md` (mandatory; re-read this run).
3. Gather diff: `gh pr diff` / `gh pr view` for GitHub PRs, else `git diff` or user patch.
4. Run **two parallel blind Task subagents** to draft analysis; synthesize one `analisis.md` at `resolvedOutputPath`.
5. Include **Affected capabilities** (kebab-case names) for delta specs in the matrix phase; do not write `specs/**/*.md` in this step.
6. Dual source of truth: functional intent (notes, description) vs technical diff.
7. End with **exactly one** halt question. Do NOT write `testmatrix.md`, `specs/**/*.md`, or continue to matrix in the same message.

**Guardrails:** no Qase MCP; no app code edits; one message for this phase.
