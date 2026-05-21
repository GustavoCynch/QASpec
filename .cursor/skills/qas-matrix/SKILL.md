---
name: qas-matrix
description: QASpec test matrix and delta specs — testmatrix.md + specs/**/*.md
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: qaspec
  version: "1.0"
  generatedBy: "1.3.1"
---

Run QASpec **matrix** (Phase 2). Produce `testmatrix.md` with mandatory checkboxes and co-produced change delta specs under `specs/**/*.md`.

**Language:** Case titles, suites, requirements, and halt use project language from `qaspec/config.yaml`.

**Read-only** on application source under test.

**Steps**

1. Resolve change; run `openspec instructions test-matrix --change "<name>" --json` and `openspec instructions specs --change "<name>" --json`.
2. Read `qaspec/references/qase_test_case_rules.md` and `analisis.md` (including **Affected capabilities**).
3. For each capability in `analisis.md`, read `qaspec/specs/<capability>/spec.md` when present (baseline for MODIFIED deltas).
4. Run **two parallel blind Task subagents** for draft case lists; merge into one matrix and aligned delta specs.
5. Format matrix: `## Suite: <name>` then `- [ ] 1.1 Observable title` per case (progress parser requires checkboxes). Optional: `<!-- req: capability/requirement-slug -->` on a line.
6. Format specs: `specs/<capability>/spec.md` using ADDED/MODIFIED/REMOVED/RENAMED delta sections; align with matrix cases.
7. End with **exactly one** approval halt covering **both** the case list and requirements. Do NOT publish to Qase in this step.

User-requested edits after halt: update `testmatrix.md` and affected `specs/**/*.md` in chat without a separate slash command.
