# Design — Harden PR Review Pipeline

## Context

The qaspec-pr-review pipeline (analyze → cases → publish) enforces its critical invariants — artifacts are user-approved, every spec scenario has a case, cases publish to Qase exactly once, payload fields are never invented — purely through prompt instructions. An architecture audit identified the failure modes: approval is an unverifiable assumed property (no content hash, no PR head SHA), coverage is self-certified by the generating agent with optional traceability, publish is a non-atomic external write (retry duplicates cases), the Qase field mapping is open-world, identical dual-analyst briefs produce pseudo-replication, and `templates/analysis.md` still carries pre-spec-first-analyze comments forbidding delta specs in analyze.

Current state anchors:

- Per-change metadata lives in `<changeRoot>/.openspec.yaml` (`schema`, `created`).
- Artifact completion is detected by file existence (`src/core/artifact-graph/state.ts`); there is no notion of approval.
- Instructions are assembled by the instruction loader from `schema.yaml`, project `rules`, and the subagent-mode appendix (`src/core/subagent-mode.ts`).
- `/qsx:*` skill bodies are generated from `src/core/templates/workflows/*.ts`.

## Goals / Non-Goals

**Goals:**

- Convert "validated", "covered", and "published once" from behavioral claims into mechanically verified preconditions (CLI gates).
- Improve the epistemic quality of human validation (digest halt, provenance labeling of assumptions).
- Decorrelate dual-analyst errors via asymmetric briefs.
- Close the Qase field mapping (omit-on-unmapped instead of inference).
- Fix the stale analyze template comments.

**Non-Goals:**

- Diff triage for large PRs and machine-readable activation globs in `historical_bugs.md` (audit items 2.5/1.9) — deferred to a follow-up change.
- TestRail/Xray support, multi-provider gates.
- Enforcing gates for schemas other than `qaspec-pr-review`.
- Server-side or git-hook enforcement; gates run locally via the CLI the agent already calls.

## Decisions

### D1. Approval ledger lives in `.openspec.yaml` under `approvals:`

`qaspec approve analyze --change <name>` appends/replaces a record:

```yaml
approvals:
  analyze:
    approvedAt: 2026-06-10T17:00:00Z
    contentHash: sha256:<hash of analysis.md + canonical specs/**/*.md concatenation>
    headSha: <PR head SHA when resolvable, else omitted>
```

- Canonicalization: sort spec file paths with POSIX separators (normalize via `path` then replace to `/` for hashing only), concatenate `<relative-path>\n<file-bytes>` per file after `analysis.md`. Deterministic across platforms.
- `headSha` source: `--head-sha <sha>` flag supplied by the agent (it already ran `gh pr view`); the CLI never shells out to `gh` itself (keeps the command offline-safe and testable).
- `qaspec status --change --json` gains `approval: { analyze: valid | stale | missing, reason }` by recomputing the hash. `stale` distinguishes `content-changed` from `head-moved` in `reason`.
- **Alternative considered:** separate `state.yaml` file — rejected: one more untracked file to teach tooling about; `.openspec.yaml` already exists, is per-change, and is committed.
- **Alternative considered:** hashing the diff itself — rejected: the head SHA is a smaller, stable proxy and avoids storing PR content.

### D2. Coverage validation is a parser, not a prompt

`qaspec validate cases --change <name>`:

- Parses `#### Scenario:` headings from the change `specs/**/*.md` (reuse `src/core/parsers/` spec structure parsing) into `capability/requirement-slug#scenario-slug` keys.
- Parses `testcases.md` for checkbox grammar, `**Preconditions:**` / `**Steps:**` blocks, and `<!-- req: ... -->` annotations. Accepted annotation values: `capability/requirement-slug`, `assumption:<id>`, `gap`.
- Fails (exit 1, structured JSON with `--json`) on: scenario with zero covering cases, annotation referencing a non-existent requirement, case missing any `req:` annotation, malformed checkbox/Steps structure.
- Coverage is keyed at requirement level (`capability/requirement-slug`); scenario-level keys are reported as warnings, not failures, in v1 — slug-stability of scenario names is too weak to hard-fail on.
- **Alternative considered:** LLM self-audit retained as the only check — rejected: self-evaluation by the generator is the failure mode being fixed.

### D3. Publish gate token

`qaspec publish-gate --change <name>` verifies, in order: approval `valid` for analyze; `validate cases` passes; `tcms` block present and well-formed. On success prints a token `qaspec-gate:<8-hex>` derived from `contentHash` + a per-invocation nonce persisted to `.openspec.yaml` under `publishGate`. The token is single-use: the next successful gate run replaces it; the skill instructs the agent to run the gate, present the summary, and only after user confirmation proceed to MCP citing the token. A re-run after edits invalidates the old token because the content hash changed.

- This remains an instruction-level contract (the CLI cannot intercept MCP calls), but it collapses the precondition checks to one deterministic command and makes "gate not run" visible in the transcript.
- **Alternative considered:** no token, just exit code — rejected: the token forces the gate run into the same conversation turn and is checkable in review.

### D4. Write-ahead publish log

`templates/publish-log.md` gains a `Status` column (`pending | in-flight | done | failed`). The apply instruction inverts the order: write all planned rows as `pending` before the first MCP call; per case mark `in-flight` → MCP create → record returned ID + `done` → mark `- [x]` in `testcases.md`. Re-run rule: for `pending`/`in-flight` rows, search Qase by title (or use recorded ID) before creating; never blind-create on retry.

### D5. Approval digest halt with assumption provenance

`templates/analysis.md` gains an `## Unvalidated assumptions` section (risk-ordered, confidence-marked). The analyze halt contract becomes: a compact approval digest (requirement headings one-liners + the assumptions list) plus **zero to three** targeted questions; fabricating a question when none exists is forbidden — the agent states no blocking question exists and requests digest approval. `Validated clarifications` may only contain facts the user explicitly addressed; everything else stays labeled as assumption, and cases derived from assumptions carry `req: assumption:<id>`. The stale comments at `templates/analysis.md:7-8` are removed in the same edit.

- **Alternative considered:** keep "exactly one question" — rejected: it forces both pathological tails (question-fabrication → rubber-stamping; ambiguity-collapsing → authority laundering).

### D6. Heterogeneous dual analysts

When `multipleSubagents.review` is true, the two Task briefs become asymmetric: analyst A (intent-first) receives PR description/notes/linked issues + baseline specs, no diff; analyst B (implementation-first) receives the diff/code only, no description. Synthesis is a structural comparison of predicted vs reconstructed behavior; each divergence is an intent-vs-implementation candidate. Unique findings trigger a targeted verification pass instead of automatic "lower confidence" demotion. The cases-phase dual mode keeps symmetric briefs but analysts return cases **grouped by requirement slug**, making the merge a keyed union with recorded discards instead of semantic dedup.

- **Why:** ensemble value depends on error independence; identical briefs sample the same distribution, so agreement measures sampling stability, not truth.

### D7. Closed Qase field mapping

The `qase_test_case_rules.md` seed is restructured around a mapping table: `Qase field → source in testcases.md → default → allowed values`. Operative rule injected into apply instructions: any field absent from the table is omitted or sent with the documented default — severity/priority/type are never inferred. The confirm halt must include the full payload of one representative case so the human validates the *how*, not just suite counts.

### D8. ABSENT-intent guard

New analyze rule: when PR description and developer notes are missing or non-substantive, write `Functional intent: ABSENT — no independent intent source` in that section, do not reconstruct intent from the diff, and make obtaining intent the first halt question. Closes the silent collapse of the dual source of truth.

## Risks / Trade-offs

- [Hash canonicalization breaks across platforms (CRLF, path separators)] → Normalize line endings to `\n` and path separators to `/` inside the hashing routine only; unit tests with mixed-separator fixtures on the three OSes via CI.
- [Agents skip the gates anyway] → Gates are also encoded in schema instructions, seed rules, and skill bodies (three injection points); `status --json` surfaces `approval: missing` on every cases run, so drift is visible even when skipped once.
- [Mandatory `req:` annotations add friction to hand-written cases] → `gap` and `assumption:<id>` values give legitimate escape hatches; the validator message names the exact unannotated line.
- [Scenario-level coverage too strict] → v1 keys coverage at requirement level; scenario-level is warning-only until slug stability is proven.
- [Token theater: CLI cannot actually block MCP] → Accepted; the token converts a multi-step behavioral contract into one observable artifact in the transcript, which is the strongest local enforcement available without an MCP proxy.
- [Larger skill bodies → instruction dilution] → Net body growth is bounded: digest halt replaces single-question text; gate steps replace prose checklists ("run X; proceed only on green" is shorter than enumerated manual checks).

## Migration Plan

1. Ship CLI commands + status `approval` block (additive, no behavior change for existing schemas).
2. Update schema instructions, templates, seeds, and skill bodies in the same release; `qaspec update` regenerates skills.
3. Legacy changes without `approvals:` report `missing`; skills instruct the agent to ask the user to re-approve (run `/qsx:analyze` halt → `qaspec approve`) rather than failing hard.
4. Rollback: gates are advisory at the instruction layer; reverting skill/schema text restores prior behavior without data migration ( `approvals:` keys are ignored by old code).

## Open Questions

- None blocking. Scenario-level coverage hard-fail and diff-triage/activation-globs are explicitly deferred.
