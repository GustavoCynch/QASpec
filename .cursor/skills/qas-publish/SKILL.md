---
name: qas-publish
description: QASpec publish — Qase MCP upload and testmatrix checkbox updates
license: MIT
compatibility: Requires openspec CLI and Qase MCP.
metadata:
  author: qaspec
  version: "1.0"
  generatedBy: "1.3.1"
---

Run QASpec **publish** (Phase 3). Upload approved `testmatrix.md` to Qase via MCP.

**Language:** `publish-log.md`, `execution-context.md`, and halts use project language from config.

**Steps**

1. Run `openspec instructions apply --change "<name>" --json` (publish phase for `qaspec-pr-review`).
2. Re-read `qaspec/references/qase_test_case_rules.md`; confirm matrix approved and checkbox-formatted.
3. If `testmatrix.md` exists but no files under change `specs/` and apply requires `specs`, stop and direct user to complete `/qas:matrix` (or author deltas) — do not invoke Qase MCP.
4. Read completed `specs/**/*.md` for context before MCP when files exist.
5. Resolve Qase prerequisites (project code, role, base URL) from artifacts, `execution-context.md`, or chat; if missing, **one** halt with only missing fields — then persist to `execution-context.md`.
6. Validate matrix against rules; then MCP `create_suite` / `create_case` (or bulk).
7. Write `publish-log.md`; mark each published row `- [x]` in `testmatrix.md`.
8. Stop on PII/secrets. Do not modify application source under test.

**Guardrails:** no second halt after prerequisites are complete; v1 TCMS is Qase only.
