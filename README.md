# QASpec

**Agree on what to test before you run — specs live in the repo.**

QASpec is an open-source, spec-driven workflow for quality assurance. It helps teams turn intent into structured test artifacts—risk analysis, test cases, prerequisites, and uploads to your test management system—before execution begins.

Inspired by [OpenSpec](https://openspec.dev/) on the development side, QASpec applies the same idea to QA: persistent, versioned artifacts in the codebase instead of one-off chat output.

## Scope

QASpec is designed to work **globally**, not tied to a single product or stack. Inputs can include:

- **Pull requests** — diff-driven review and regression analysis
- **Requirements and specifications** — documents, tickets, or plain-text intent
- **User stories** — existing stories or stories generated as part of the workflow
- **Files** — PDFs, attachments, and other reference material supplied as context

The workflow adapts to what you provide; the goal is always the same: align on *what* to test and *why* before running tests.

## Test management integrations

Publishing approved test cases to a TCMS will be **pluggable and selectable at install time**, including (planned):

- [Qase](https://qase.io/)
- [TestRail](https://www.testrail.com/)
- [Xray](https://www.getxray.app/)

Additional connectors may follow the same plugin model.

## Status

This repository is in **early development** (OpenSpec fork). The CLI ships as `openspec` today; QASpec installs `/qas:*` skills, `qaspec-pr-review` schema, and `qaspec/references/` scaffolds via `openspec init`. The standalone `qaspec` binary rename is planned (see `roadmap/`).

Migration from the legacy pack is **complete**. Authoritative QA runtime is `openspec init` → `/qas:*` + `qaspec-pr-review` schema. The original `.agents/skills/qa-pr-review/` directory is **retained as reference only** (Cynch/domain detail, not installed by init).

| Path | Role |
|------|------|
| `.agents/skills/qa-pr-review/references/` | Maintainer reference (historical bugs, Qase rules source) |
| `qaspec/references/` (after init) | Project runtime seeds copied by `openspec init` |

This repository keeps `.cursor/commands/opsx-*` for **spec-driven** CLI dogfooding; validating `/qas:*` output uses `openspec init` in a temporary directory, not committed `qas-*.md` here.

## License

[MIT](LICENSE)
