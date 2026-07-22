# Generalize TCMS Case Rules

## Why

QASpec now targets more than one Test Case Management System (TCMS) provider through MCP. A change can point at Qase or Probara via a per-change `tcms.provider`, and the provider layer is already provider-agnostic — `TcmsTarget.provider` is an open string with no Qase enum to change.

But the scaffolded case-rules reference file is still Qase-branded: `qaspec/references/qase_test_case_rules.md`, titled "Qase test case rules (MCP)", with a "Qase field" mapping table and Qase-specific wording. This reference file is deliberately kept (not deleted) because it encodes the deterministic case-authoring contract — field mapping, the `- [ ] N.N` checkbox format, the omit-on-unmapped rule, and the cases↔publish format alignment — that raw MCP schemas cannot supply. The problem is that a Qase-branded contract file is misleading and incorrect when a team publishes to Probara:

- **User confusion / wrong contract**: a Probara user is handed a file that names Qase as the target system and instructs Qase-specific field mapping. The file reads as if the tooling only supports Qase.
- **Product intent gap**: QASpec presents itself as multi-provider, but its most authoritative authoring artifact contradicts that on first read.

The fix is to generalize the reference file into a single provider-agnostic `tcms_case_rules.md` while keeping the guarantees that made it worth keeping, and to do so without adding a per-provider file or an extra init step.

## What Changes

- Rename the scaffolded reference from `qase_test_case_rules.md` to a single provider-agnostic `tcms_case_rules.md` (one file, not one-per-provider).
- Generalize the file's content: provider-neutral title, a conceptual field-mapping table (title, description/preconditions, steps as action+expected, suite) instead of a "Qase field" table, and the omit-on-unmapped rule restated provider-generically. The Customize section stays as the per-team / per-provider extension point where teams plug in their concrete provider field codes.
- Preserve everything that made the file worth keeping: suite structure, `- [ ] N.N` checkboxes, Preconditions, the Steps table, and `<!-- req: -->` traceability comments.
- Migrate existing projects with a **content-preserving rename** (Option B): `fs.rename` the legacy file to the new name only when the new file is absent; if both exist, leave both untouched; never overwrite user content. User customizations survive the migration.
- Update all direct references to the filename across source templates, the PR-review schema, and docs to point at the new name.
- Update the affected main-spec capabilities via delta specs (later phase).

Out of scope (deferred to a future change):

- Full de-provider-ization of the publish flow wording — the concrete MCP tool examples (`create_suite` / `create_case`), the "v1 TCMS is Qase only" note, and `--provider qase` help text. Where these appear alongside a reference to the renamed file, they stay provider-neutral or use "e.g. Qase" phrasing; the deeper rewrite is a separate scope.
- Any change to the provider model itself (`TcmsTarget.provider` is already an open string — nothing to change).
- Adding per-provider reference files or any extra init/install step.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `qaspec-init-references`: the scaffolded reference is provider-agnostic `tcms_case_rules.md` with a conceptual TCMS field-mapping table; scaffold still create-if-missing and never mutates existing content; a one-time content-preserving rename migrates legacy `qase_test_case_rules.md`.
- `cli-init`: init references and any success/getting-started hints name the generalized file.
- `qas-workflows-and-commands`: the cases and publish workflow templates and the analyst mandatory-references block reference `tcms_case_rules.md` with provider-neutral wording.
- `qaspec-pr-review-schema`: the PR-review schema references the generalized filename and provider-neutral apply instruction.
- `artifact-language-policy`: the reference filename mentioned in the language policy is updated.

## Impact

- **Source (rename + wording)**: `src/core/reference-scaffold.ts` (core — `REFERENCE_FILES.qaseRules` key/filename and the `ENGLISH_QASE_RULES` seed content), `src/core/qa-config-seed.ts`, `src/core/templates/workflows/cases.ts`, `src/core/templates/workflows/publish.ts`, `src/core/templates/workflows/qas-workflow-preamble.ts`; cosmetic: `src/core/config-prompts.ts`, `src/commands/tcms.ts`.
- **Migration reach (open design item)**: the rename migration must be reachable by existing projects. `scaffoldQaspecReferences` is called only from `src/core/init.ts` — `src/core/update.ts` does NOT call it. So a rename hooked into the scaffold reaches init re-runs but not users who only run `qaspec update`. The design phase must decide where the migration is invoked so update-only users are covered. Precedent `src/core/workflow-artifact-cleanup.ts` DELETES legacy generated files — that pattern MUST NOT be copied here, because this file is user-editable.
- **Schema**: `schemas/qaspec-pr-review/schema.yaml` (filename + apply-instruction wording).
- **Docs**: `README.md`, `docs/getting-started.md`, `docs/commands.md`, `docs/workflows.md`, `docs/multi-language.md` (Spanish).
- **Specs (delta specs, later phase)**: `qaspec-init-references`, `cli-init`, `qas-workflows-and-commands`, `qaspec-pr-review-schema`, `artifact-language-policy`.
- **Tests**: no existing test references the filename, and there is no reference-scaffold test today. This change should ADD a reference-scaffold test plus migration tests (new file created on init; legacy renamed when new absent; both-present leaves both untouched; content preserved). `test/core/qa-config-seed.test.ts` asserts a commented `provider: qase` example — only changes if that wording is generalized.
- **Users**: existing projects keep their customized rules; on the migration path the file is renamed in place, so nothing is lost and no duplicate/orphan file is created.
- **Size forecast**: ~300–380 authored lines (source ~120, schema ~10, docs ~10, tests ~120, spec deltas ~80). Comfortably under the 800-line single-PR budget; add ~50–80 only if the deferred publish-wording de-provider-ization were pulled in (it is not).

## Risks and Open Questions

- **Migration reach** (primary): update-only users will not hit an init-scaffold migration. Design must place the migration where both init and update paths reach it. Blocking for design, not for this proposal.
- **Preserve-vs-delete**: the file is user-editable, so the migration must rename/preserve, never delete or overwrite. The existing cleanup precedent deletes — do not reuse it.
- **Scope creep**: the publish flow contains deeper Qase wording that is tempting to fix in the same pass. It is explicitly out of scope to keep the change reviewable and focused; only references adjacent to the renamed file are touched.
- **Dangling references**: a rename risks leaving a stale filename somewhere. The inventory above is the checklist; the spec/apply phases must confirm no reference to the old name remains.
