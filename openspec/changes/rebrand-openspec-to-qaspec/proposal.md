## Why

QASpec is a fork evolving into its own QA product, but user-facing copy, specs, CLI messages, and docs still say **OpenSpec** in hundreds of places. That confuses testers and contributors who expect **QA Spec** / **QASpec** branding and suggests the tool is still the upstream dev-spec product. Rebranding now aligns product language with the fork’s identity before wider adoption, and complements the in-flight `qaspec-cli-rename` change (binary and `qaspec/` paths) without duplicating it.

## What Changes

- **Product name in user-facing text:** Replace **OpenSpec** with **QA Spec** or **QASpec** per a documented naming matrix (CLI help, init/update success lines, errors, README, `docs/`, roadmap, generated workflow templates where they describe *this* product).
- **Meta-spec and conventions:** Update `openspec-conventions` (and related capability specs) so requirements describe **QASpec** / **QA Spec** project conventions, not “OpenSpec project.”
- **Source comments and JSDoc:** Reword module headers and comments that describe QASpec’s own behavior; keep **upstream OpenSpec** only where the code detects or documents coexistence with the original tool.
- **Links and attribution:** Point feedback/docs URLs to this fork where appropriate; retain a single, explicit **inspired by OpenSpec** attribution in README (not removed—reworded so it is lineage, not product name).
- **Tests:** Update assertions on user-visible strings; add a guard test or grep checklist so new **OpenSpec** strings do not appear in product-facing surfaces without justification.
- **Out of scope (explicit):** Renaming directory `openspec/` → `qaspec/` (see `qaspec-cli-rename`); removing `openspec` CLI shim; rewriting archived `openspec/changes/archive/**` history; renaming internal symbols like `hasActiveUpstreamOpenSpec` when they refer to upstream detection; changing npm package scope; renaming `.cursor/commands/opsx-*` skill IDs.

## Capabilities

### New Capabilities

- `qaspec-branding`: Naming matrix, allowed exceptions (upstream, lineage, path literals), and verification rules for user-facing copy.

### Modified Capabilities

- `openspec-conventions`: Product and meta-spec language uses QASpec / QA Spec; structure diagrams may still show `openspec/` as legacy path until planning-home rename lands.
- `docs-agent-instructions`: Agent-facing instructions reference QASpec, not OpenSpec, as the product being installed.
- `cli-init`: Success, help, and onboarding strings use QASpec / QA Spec branding.
- `cli-update`: Same for update flow messages and “learn more” links where they describe this product.
- `legacy-cleanup`: User-visible cleanup messages distinguish **upstream OpenSpec** from **QASpec**; internal detection names unchanged.
- `openspec-coexistence`: Requirements clarify upstream vs QASpec in prose (behavior unchanged).
- `command-generation`: Generated slash-command and skill copy uses QASpec product name in descriptions.
- `qas-workflows-and-commands`: Workflow frontmatter and bodies use QASpec naming in user-visible fields.

## Impact

- `src/core/init.ts`, `src/core/update.ts`, `src/core/legacy-cleanup.ts`, CLI entry and Commander setup
- `src/core/templates/**`, `schemas/**` instruction strings that name the product
- `README.md`, `docs/**`, `roadmap/**`, `AGENTS.md` (if product-facing)
- `openspec/specs/openspec-conventions/spec.md` and delta specs under this change
- `test/core/init.test.ts`, `test/core/update.test.ts`, `test/core/legacy-cleanup.test.ts`, and any snapshot strings
- **Coordination:** Apply after or alongside `qaspec-cli-rename` where both touch the same file; branding pass should not fight path renames (prefer `qaspec/` in new strings, `openspec/` only as “legacy layout” when resolver not yet merged)
