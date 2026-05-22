# QASpec

**Agree on what to test before you run — specs live in the repo.**

QASpec is an open-source, spec-driven workflow for quality assurance. It helps teams turn intent into structured test artifacts—risk analysis, test cases, prerequisites, and optional publish to a test management system (Qase today)—before execution begins.

Inspired by [OpenSpec](https://openspec.dev/) on the development side, QASpec applies the same idea to QA: persistent, versioned artifacts in the codebase instead of one-off chat output.

**Website:** [qaspec-website.workers.dev](https://qaspec-website.workers.dev) (update after first Cloudflare deploy if the URL differs).

## Scope

QASpec is designed to work **globally**, not tied to a single product or stack. Inputs can include:

- **Pull requests** — diff-driven review and regression analysis
- **Requirements and specifications** — documents, tickets, or plain-text intent
- **User stories** — existing stories or stories generated as part of the workflow
- **Files** — PDFs, attachments, and other reference material supplied as context

The workflow adapts to what you provide; the goal is always the same: align on *what* to test and *why* before running tests.

## Test management (TCMS)

**Today:** `/qsx:publish` uploads approved cases to **[Qase](https://qase.io/)** only, via the Qase MCP server configured in your agent.

**In progress:** a pluggable TCMS model (selectable at install time) and connectors for [TestRail](https://www.testrail.com/), [Xray](https://www.getxray.app/), and others. Until those land, publish workflows and reference scaffolds (`qase_test_case_rules.md`, `execution-context.md`) are Qase-oriented.

**Collaborate:** if you use another TCMS or want to help shape the plugin API, open an [issue](https://github.com/GustavoCynch/QASpec/issues) or [pull request](https://github.com/GustavoCynch/QASpec/pulls) — contributions and design feedback are welcome.

## Status

This repository is in **early development** (QASpec fork). The primary CLI is **`qaspec`** (`@qaspec/cli`).

QASpec installs `/qas:*` skills, `qaspec-pr-review` schema, and `qaspec/references/` scaffolds via `qaspec init`. Existing projects that still use an `openspec/` planning home continue to work without migration.

Migration from the legacy pack is **complete**. Authoritative QA runtime is `qaspec init` → `/qas:*` + `qaspec-pr-review` schema. The original `.agents/skills/qa-pr-review/` directory is **retained as reference only** (Cynch/domain detail, not installed by init).

| Path | Role |
|------|------|
| `.agents/skills/qa-pr-review/references/` | Maintainer reference (historical bugs, Qase rules source) |
| `qaspec/references/` (after init) | Project runtime seeds copied by `qaspec init` |

This repository keeps `qaspec/changes/` and `.cursor/commands/opsx-*` for **spec-driven** CLI dogfooding, plus committed `.cursor/commands/qas-*` and `.cursor/skills/qas-*` as QA workflow samples.

## License

[MIT](LICENSE)
