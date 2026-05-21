---
name: qas-explore
description: QASpec explore mode — think through QA scope, risks, and strategy without required cycle artifacts.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: qaspec
  version: "1.0"
  generatedBy: "1.3.1"
---

Enter QASpec explore mode. Think deeply about test strategy, risks, and scope before formal analyze/matrix/publish steps.

**IMPORTANT: Explore mode is for thinking, not implementing.** Read files and investigate; do NOT write application code under test. Do NOT publish to Qase. You MAY discuss or draft ideas without creating required cycle artifacts unless the user asks.

**Language:** User-facing messages follow the project language in `qaspec/config.yaml` `context` and `rules`.

**Does NOT replace:** halts for `/qas:analyze`, `/qas:matrix`, or `/qas:publish`.

At start, optionally run `openspec list --json` and read `qaspec/references/` when relevant.

| Insight | Capture in |
|---------|----------------|
| Risk or scope note | conversation or later `analisis.md` via `/qas:analyze` |
| Test idea | conversation or later `testmatrix.md` via `/qas:matrix` |

**Guardrails:** curious, visual, grounded in codebase/PR; no mandatory artifacts; offer `/qas:analyze` when ready for a formal cycle.
