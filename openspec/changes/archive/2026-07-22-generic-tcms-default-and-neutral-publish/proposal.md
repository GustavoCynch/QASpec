# Generic TCMS Default and Neutral Publish

## Why

QASpec is provider-agnostic through MCP (`TcmsTarget.provider` is an open string), and the prior change already generalized the case-rules reference file. But two Qase-shaped seams remain and now contradict that intent:

- **The seeded config still ships a concrete provider.** `QASPEC_PR_REVIEW_CONFIG_FOOTER` in `src/core/config-prompts.ts` hardcodes `provider: qase` / `baseUrl: https://app.qase.io` as the commented `tcms` example. A new project is nudged toward Qase before choosing anything, so there is no true "generic default" starting point.
- **The MCP-only publish flow is still Qase-branded.** Gate hints, workflow preambles, schema apply text, and product UI copy say "Publish to Qase", "Qase MCP", "mapped Qase fields", and "v1 TCMS is Qase only". A team publishing to any other provider is handed instructions that name the wrong system, reading as if only Qase is supported.

The previous change explicitly deferred this publish-wording de-provider-ization to keep that PR focused. This change is that deferred slice: make the config default provider-neutral and finish the de-Qase wording sweep, MCP-only.

## What Changes

- **Generic default = ABSENCE of `provider`.** Ship a provider-neutral, provider-absent commented `tcms` example in the seeded `qaspec/config.yaml` footer. No explicit `provider: generic` magic string. Rationale: the resolver's truthy per-field checks mean an absent provider → `usable: false` → the EXISTING publish step-7 "no usable target → one halt and ask" flow fires with zero resolver changes. An explicit `generic` string is truthy and would flip `usable` to true, bypassing the halt and forcing special-casing across resolver, gate, `tcms show`, and tests — added debt for no gain.
- **De-Qase the publish flow wording** so "generic" is real and MCP-only:
  - Gate/halt/preamble hints (`publish-gate.ts`, `src/commands/tcms.ts` `--provider qase` resolve hints, `analyze.ts` "no Qase MCP" guardrail, `cases.ts:33`, `qas-workflow-preamble.ts:114` "Do NOT publish to Qase") → provider-neutral.
  - `v1: qase` framing (`project-config.ts:30`, `src/cli/index.ts:530` provider description; remove/generalize the "v1 TCMS is Qase only" guardrail in `publish.ts`).
  - Product UI copy ("Publish to Qase" in `src/commands/config.ts:67-68`, `src/ui/welcome-screen.ts:26`, `src/core/init.ts:677`) → neutral.
  - Core templates/schema: "Qase MCP" → "the provider's MCP / TCMS MCP"; "Qase fields" → "TCMS fields"; "mapped Qase fields" → "mapped TCMS fields" (`publish.ts`, `cases.ts`, `schemas/qaspec-pr-review/schema.yaml`, `qa-config-seed.ts`).
- **Keep MCP tool examples illustrative.** `reference-scaffold.ts:52` "e.g. Qase's create_case/create_suite" stays as an example, not a requirement.
- Update affected delta specs and docs to match.

Out of scope:

- Do NOT add a `via`/`transport` axis (MCP vs CLI). Publish stays MCP-only.
- No change to the provider model itself (`provider` is already an open string).
- Leave `qaspec-init-references` legacy-migration wording untouched (owned by the prior change).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `qas-config-seed`: seeded `qaspec/config.yaml` `tcms` example is provider-neutral and provider-absent (no `provider: qase` / Qase `baseUrl`); absence is the documented generic default that drives the one-halt-ask flow.
- `qas-workflows-and-commands`: cases/publish/analyze workflow templates and preamble use provider-neutral, MCP-only wording; no "publish to Qase" / "no Qase MCP" strings.
- `qaspec-pr-review-schema`: schema title and apply instructions reference "TCMS MCP" / "TCMS fields" instead of Qase-specific terms.
- `qas-publish-gate`: gate resolve hints and `tcms-missing` messaging are provider-neutral (no hardcoded `--provider qase`).
- `qas-tcms-target`: spec examples generalized; `provider` absence documented as the generic default.
- `config-loading`: example wording updated to the provider-neutral seed.

## Impact

- **Source (wording + seed)**: `src/core/config-prompts.ts` (footer seed), `src/core/publish-gate.ts`, `src/commands/tcms.ts`, `src/core/project-config.ts`, `src/cli/index.ts`, `src/commands/config.ts`, `src/ui/welcome-screen.ts`, `src/core/init.ts`, `src/core/qa-config-seed.ts`.
- **Templates**: `src/core/templates/workflows/publish.ts`, `cases.ts`, `qas-workflow-preamble.ts`, `analyze.ts`.
- **Schema**: `schemas/qaspec-pr-review/schema.yaml`.
- **Specs (delta, later phase)**: `qas-config-seed`, `qas-workflows-and-commands`, `qaspec-pr-review-schema`, `qas-publish-gate`, `qas-tcms-target`, `config-loading`.
- **Docs**: `docs/workflows.md`, `docs/commands.md`, `docs/getting-started.md`, `docs/multi-language.md`, `docs/cli.md`, `docs/concepts.md`, `README.md`.
- **Tests**: `test/core/templates/__snapshots__/skill-templates-parity.test.ts.snap`, `qa-config-seed.test.ts`, and `project-config.test.ts` will need updates when wording/seed changes.
- **Delivery**: single PR, 800-line review budget; record `size:exception` if exceeded.

## Risks and Open Questions

- **Snapshot/test churn** (Med): template and seed wording changes ripple into snapshot and config-seed tests. Mitigation: update snapshots deliberately and assert on the new neutral strings.
- **Scope breadth of UI copy** (Low, decided): "Publish to Qase" UI strings are explicitly IN scope per locked decision to make the sweep complete.
- **Cross-provider tool shape unconfirmed** (Low): provider MCP tools are not callable from the executor toolset, so exact tool shapes stay illustrative ("e.g. Qase's create_case"); this is intentional, not a gap.
- **Dangling Qase references** (Med): a partial sweep risks a stale "Qase" string in an untouched doc/template. The explore inventory is the checklist; spec/apply phases must confirm no non-illustrative Qase wording remains.
