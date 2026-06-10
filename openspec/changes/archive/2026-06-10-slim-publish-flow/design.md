# Design: Slim Publish Flow

## Context

Publish today (post `rename-matrix-to-cases`): prepare writes `execution-context.md` (Qase project code, role, base URL) and `publish-plan.md` (copy of unchecked cases with preconditions/steps), halts once for confirm, then uploads via Qase MCP and writes `publish-log.md`. Defined in `schemas/qaspec-pr-review/schema.yaml` (`apply.instruction`), `src/core/templates/workflows/publish.ts`, and seeded rules in `src/core/qa-config-seed.ts` (`rules.apply`).

Established patterns this design leans on:

- Skills already read project-scoped execution toggles directly from `qaspec/config.yaml` (`workflow.multipleSubagents.*`), parsed resiliently in `project-config.ts`.
- Config is user-owned: the CLI never rewrites `config.yaml` on update; agents may edit it in chat with user awareness.
- MCP calls happen only after reading tool schemas and only after an explicit confirm halt.

## Goals / Non-Goals

**Goals:**

- Publish produces exactly one file: `publish-log.md`.
- TCMS target asked at most once per project, not per change.
- First-run experience: discover Qase projects via MCP, offer existing-or-create-new, persist the choice.
- Keep the safety properties: single confirm halt before MCP, no upload in the same message as target selection, PII/secrets stop, read-only on app source.

**Non-Goals:**

- Multi-provider TCMS support (config shape allows it; behavior stays Qase-only in v1).
- Test runs / execution results (future `/qsx:run`).
- Changing analyze/cases phases or `publish-log.md` format.

## Decisions

### D1: `tcms` block in `qaspec/config.yaml`, parsed like `workflow`

```yaml
tcms:
  provider: qase        # v1: only qase is acted on
  project: CYNCH        # Qase project code
  baseUrl: https://app.qase.io
```

`project-config.ts` parses it field-by-field (invalid field → warn and omit, never fail), same posture as `workflow.multipleSubagents`. The publish skill reads it from config per its instructions — no new CLI plumbing needed.

*Alternative considered*: separate `qaspec/tcms.yaml`. Rejected — config.yaml already holds project-scoped, user-editable settings; a second file fragments them.

*Note on `role`*: the QA role used in preconditions already lives in config `context`; it is dropped from TCMS prerequisites instead of moved.

### D2: Pre-publish review is an in-chat summary, not a file

The prepare step renders: target (provider, project, base URL), suites with unchecked-case counts, and warnings (cases missing **Steps** blocks, suspected PII). It is derived from `testcases.md` at render time — there is no second copy to drift. Scope edits ("exclude suite X") are applied by updating `testcases.md` itself (the single source of truth) or noting exclusions in the confirm exchange, then re-summarizing and asking again.

*Alternative considered*: keep a slimmer `publish-plan.md` with only counts. Rejected — any persisted derivation can drift; counts in chat carry the same information at zero drift risk.

### D3: Project discovery and creation, gracefully degraded

When config has no usable `tcms` target, publish (before the confirm halt):

1. Reads Qase MCP tool schemas; if a project-listing tool exists, lists projects and presents them plus a "create new project" option in **one** halt.
2. On "create new": uses the MCP project-creation tool when available; otherwise instructs the user to create it in the Qase UI and provide the code (no invented API calls).
3. Persists the chosen/created target to `qaspec/config.yaml` `tcms` block, telling the user the file was updated.
4. Continues to the summary + confirm halt — target selection and MCP upload never share a message.

*Alternative considered*: auto-pick the only existing project without asking. Rejected — publishing into the wrong TCMS project is outward-facing and hard to undo; the user confirms the target at least once per project.

### D4: Legacy `execution-context.md` is a read-only migration source

When config lacks `tcms` and the change (or a sibling archived change) contains `execution-context.md`, publish reads project code and base URL from it, proposes persisting them to config, and proceeds without re-asking. `publish-plan.md` files found in old changes are ignored. Neither file is deleted by the flow — archives keep their history.

### D5: Schema templates removed; instruction rewritten

`templates/execution-context.md` and `templates/publish-plan.md` are deleted; `apply.instruction` in `schema.yaml`, `publish.ts`, and `rules.apply` seed lines are rewritten around the config-target + in-chat-summary flow. The "Publish-side artifact templates" requirement keeps only `publish-log.md`.

## Risks / Trade-offs

- [User wants a reviewable pre-upload artifact in the repo] → `testcases.md` (already approved at the cases halt) plus `publish-log.md` after upload cover audit needs; the chat summary is transient by design.
- [Qase MCP lacks list/create project tools in some setups] → D3 degrades to asking for the code in the same single halt; covered by instruction text, no hard dependency on optional tools.
- [Agent writes `tcms` into config wrongly or clobbers comments] → instruction requires editing only the `tcms` block and announcing the edit; config-loading warns on invalid fields next run; test covers parse of seeded and hand-written blocks.
- [Existing user habits: editing publish-plan.md before confirm] → migration note in docs/CHANGELOG: edit `testcases.md` (source of truth) or state exclusions in chat.
- [Two halts on first run (target + confirm)] → acceptable: target halt happens once per project lifetime; steady state is one halt.

## Migration Plan

1. Single release. Existing changes publish via D4 fallback; first publish per project persists `tcms` to config.
2. Docs/CHANGELOG note the removed files and the new config block.
3. Rollback: revert the commit; legacy flow returns (templates restored from git).

## Open Questions

(none)
