# Design: remove-publish-log

## Context

The publish (apply) phase of the `qaspec-pr-review` schema currently instructs agents to maintain `publish-log.md` as a write-ahead log: every planned case is written as a `pending` row before the first MCP call, flipped to `in-flight` before its create call, then to `done` with the returned Qase ID, and finally the case checkbox is marked `- [x]` in `testcases.md`. The log was introduced by `harden-pr-review-pipeline` for crash-safe idempotency.

In practice the log is pure overhead: no CLI command reads it (`publish-gate` does not consume it), the checkbox in `testcases.md` already answers "was this uploaded?", and the agent performs ~3 redundant file edits per case. The user has decided (2026-07-09) to remove it entirely with **checkbox-only** tracking and **no local Qase IDs**.

## Goals / Non-Goals

**Goals:**
- Publish tracking lives only in `testcases.md` checkboxes: per case, MCP create → mark `- [x]`.
- Keep the no-duplicate guarantee on re-run without a local log: reconcile unchecked cases against Qase **by title** before creating; never blind-create.
- Remove `publish-log.md` from schema instruction, template package, skill/command bodies, seed rules, main specs, docs, and website copy.
- Legacy `publish-log.md` files in existing changes are ignored, same treatment as legacy `publish-plan.md`.

**Non-Goals:**
- No change to the publish gate, gate token, confirmation halt, TCMS target resolution, or omit-on-unmapped field mapping.
- No CLI code changes beyond template/seed strings — `publish-gate.ts` and friends never read the log.
- No local persistence of Qase case IDs (explicitly rejected by the user).

## Decisions

1. **Checkbox as the single local publish record.** The `- [x]` mark is written immediately after each successful MCP create. Rationale: it is the artifact the user already reviews, and progress tracking (`apply.tracks: testcases.md`) already parses it. Alternative considered: inline `<!-- qase: id -->` comments next to the checkbox — rejected by the user to keep the file clean and minimize writes.

2. **Title-based reconciliation replaces the write-ahead log.** On any re-run with unchecked cases, the agent lists existing cases in the target Qase project (one MCP read) and compares titles before creating; matches are marked `- [x]` without a create call. Rationale: the only realistic failure window is a crash between MCP create and the checkbox edit — one case wide, and a title lookup covers it. Alternative considered: keep a minimal one-write log for crash recovery — rejected as residual token burn for a rare case.

3. **`Publish-side artifact templates` requirement flips to exclusion-only.** The requirement now asserts the package ships **no** publish-side trace/prepare templates (`publish-log.md`, `publish-plan.md`, `execution-context.md`). MODIFIED rather than REMOVED so the exclusion contract survives in main specs.

4. **Docs and website updated in the same change.** `docs/commands.md`, `getting-started.md`, `workflows.md`, `concepts.md`, and `website/src/site.ts` describe the publish flow to users; leaving stale `publish-log.md` mentions would re-teach agents the removed behavior through project docs.

## Risks / Trade-offs

- [Crash between MCP create and checkbox mark could duplicate a case] → Title-based reconciliation before create on re-run; the agent never blind-creates. Accepted residual risk: if the user edits a case title between the crash and the re-run, the title lookup misses and a duplicate can appear — accepted by the user in exchange for token savings.
- [Loss of local case → Qase ID mapping] → Accepted explicitly. Qase itself remains the source of IDs; the publish summary still reports created counts per suite in chat.
- [Stale seeded rules in existing user projects] → `qaspec update` regenerates skills/commands; config seed rules only apply on `init`. Existing projects keep the old `rules.apply` wording until re-seeded — harmless, since the schema instruction (the authoritative prompt) no longer mentions the log.

## Migration Plan

- Delete `schemas/qaspec-pr-review/templates/publish-log.md`; if a template registry constant lists it by name, remove the entry (explicit lookup, no pattern matching).
- Rewrite `apply.instruction` in `schema.yaml`, the `qaspec-publish` skill/command body, and `rules.apply` seed strings.
- Delta-spec the three affected capabilities; sync on archive.
- Existing changes with a `publish-log.md` on disk need no migration: publish ignores the file.
