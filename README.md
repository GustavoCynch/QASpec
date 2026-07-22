# QASpec

**Agree on what to test before you run — specs live in the repo.**

QASpec is an open-source, spec-driven workflow for quality assurance. It helps teams turn intent into structured test artifacts—risk analysis, test cases, prerequisites, and optional publish to a test management system via MCP—before execution begins.

Inspired by [OpenSpec](https://openspec.dev/) on the development side, QASpec applies the same idea to QA: persistent, versioned artifacts in the codebase instead of one-off chat output.

**Website:** [qaspec-website.dan-ba8.workers.dev](https://qaspec-website.dan-ba8.workers.dev)

## Scope

QASpec is designed to work **globally**, not tied to a single product or stack. Inputs can include:

- **Pull requests** — diff-driven review and regression analysis
- **Requirements and specifications** — documents, tickets, or plain-text intent
- **User stories** — existing stories or stories generated as part of the workflow
- **Files** — PDFs, attachments, and other reference material supplied as context

The workflow adapts to what you provide; the goal is always the same: align on *what* to test and *why* before running tests.

## Test management (TCMS)

**Today:** `/qsx:publish` uploads approved cases via MCP to whatever TCMS provider you configure — `provider` is an open string, so any MCP-backed TCMS works. Leaving `provider` unset is the generic default; set a concrete target per change with `qaspec tcms set`.

**In progress:** first-class, installer-side connector selection and richer per-provider payload-mapping guidance for systems like [TestRail](https://www.testrail.com/), [Xray](https://www.getxray.app/), and others.

**Collaborate:** if you use another TCMS or want to help shape the plugin API, open an [issue](https://github.com/GustavoCynch/QASpec/issues) or [pull request](https://github.com/GustavoCynch/QASpec/pulls) — contributions and design feedback are welcome.

## Status

This repository is in **early development** (QASpec fork). The primary CLI is **`qaspec`** (`@qaspec/cli`).

QASpec installs `/qas:*` skills, `qaspec-pr-review` schema, and `qaspec/references/` scaffolds via `qaspec init`.

Migration from the legacy pack is **complete**. Authoritative QA runtime is `qaspec init` → `/qas:*` + `qaspec-pr-review` schema. The original `.agents/skills/qa-pr-review/` directory is **retained as reference only** (Cynch/domain detail, not installed by init).

| Path | Role |
|------|------|
| `.agents/skills/qa-pr-review/references/` | Maintainer reference (historical bugs, TCMS rules source) |
| `qaspec/references/` (after init) | Project runtime seeds copied by `qaspec init` |

This repository keeps `qaspec/changes/` and `.cursor/commands/opsx-*` for **spec-driven** CLI dogfooding, plus committed `.cursor/commands/qas-*` and `.cursor/skills/qas-*` as QA workflow samples.

## License

[MIT](LICENSE)
