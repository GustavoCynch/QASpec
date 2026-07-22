# Design: Generic TCMS Default and Neutral Publish

## Technical Approach

Two coupled, purely textual deliverables — no runtime-logic change. (1) Make the seeded
`qaspec/config.yaml` `tcms` example provider-neutral and provider-absent. (2) Finish the
de-Qase wording sweep across gate hints, workflow templates, schema, seed rules, UI copy,
CLI descriptions, specs, and docs. The generic default is the ABSENCE of `provider`, which
already routes through the existing publish step-7 "one halt and ask" flow with zero
resolver changes (see No-Resolver-Change Contract).

## Architecture Decisions

### Decision: Generic default = absence of `provider` (no magic string)

**Choice**: Ship a commented, provider-neutral `tcms` example; rely on `provider` being unset.
**Alternatives considered**: Explicit `provider: generic` sentinel written into the seed.
**Rationale**: `resolveTcmsTarget` uses truthy per-field checks and `usable: !!(target.provider && target.project)` (`tcms-target.ts:49-62`). A truthy `generic` string with a project present flips `usable` to `true`, bypassing the halt and forcing special-casing in resolver + `publish-gate` + `tcms show` + tests. Absence keeps `usable:false` and reuses the existing halt for free.

### Decision: Concrete provider names allowed ONLY as illustrative examples

**Choice**: Neutral wording everywhere; a real provider name may appear only in an `e.g.` example of a concrete tool shape.
**Alternatives considered**: Strip every "Qase" token including tool examples.
**Rationale**: Cross-provider MCP tool shapes are unconfirmed, so one concrete example (`reference-scaffold.ts:52` "e.g. Qase's create_case/create_suite") aids readers without implying Qase-only support. This is the rule apply/verify check against.

## Wording Convention (canonical replacements)

| Current | Neutral replacement |
|---|---|
| "Qase MCP" | "the provider's MCP" / "TCMS MCP" |
| "Qase fields" / "mapped Qase fields" | "TCMS fields" / "mapped TCMS fields" |
| "Qase payloads" / "Qase IDs" | "TCMS payloads" / "TCMS IDs" |
| "Publish to Qase" / "publish to Qase" | "Publish to TCMS" / "publish to your TCMS" |
| "no Qase MCP" | "no TCMS MCP" |
| "v1 TCMS is Qase only" | (removed) |
| `--provider qase` in hints | `--provider <provider>` |
| "TCMS provider (v1: qase)" | "TCMS provider (any MCP-backed provider)" |

**Rule**: A concrete provider name is permitted ONLY when prefixed as an illustrative example (`e.g. ...`) of a tool shape. It is forbidden in defaults, gate/resolve hints, UI copy, CLI option descriptions, requirements, and guardrails.

## Config Seed Change (`config-prompts.ts` footer)

Before:
```
# tcms:
#   provider: qase
#   project: YOUR_PROJECT_CODE
#   baseUrl: https://app.qase.io
```
After:
```
# tcms — optional user-managed DEFAULTS for /qsx:publish (uncomment and edit yourself).
# Leaving provider unset is the generic default: /qsx:publish halts once and asks you to
# choose a TCMS target per change. Set the concrete target per change with `qaspec tcms set`
# (publish never writes this block). Fill this in only when every change targets the same project.
# tcms:
#   provider: YOUR_TCMS_PROVIDER   # the provider id your MCP server supports
#   project: YOUR_PROJECT_CODE
#   baseUrl: https://your-tcms.example.com
```
Also line 28 example stack: drop trailing "Qase" (keep neutral stack example).

## No-Resolver-Change Contract (proof)

Absent `provider` path — no logic touched:
1. Commented seed block → `readProjectConfig().tcms` empty; change `.qaspec.yaml` has no `tcms` → both empty.
2. `resolveTcmsTarget` truthy per-field merge (`tcms-target.ts:49-57`) leaves `target.provider` undefined.
3. `usable = !!(target.provider && target.project)` (`tcms-target.ts:62`) → `false`.
4. `runPublishGate` pushes `tcms-missing` when `!resolvedTcms.usable` (`publish-gate.ts:86-95`).
5. Publish template step 7 (`publish.ts:17`) and schema apply block fire the single halt-and-ask.

`resolveTcmsTarget` is not modified. Only the gate/hint STRINGS change (e.g. `publish-gate.ts:93` resolve hint).

## File Changes

| File | Action | Change |
|---|---|---|
| `src/core/config-prompts.ts` | Modify | Neutral provider-absent footer (L14-17, L28) |
| `src/core/publish-gate.ts` | Modify | `tcms-missing` resolve hint → `--provider <provider>` (L93) |
| `src/commands/tcms.ts` | Modify | Resolve hint neutral (L110) |
| `src/core/project-config.ts` | Modify | `provider` describe() neutral (L30) |
| `src/cli/index.ts` | Modify | `--provider` option description (L530) |
| `src/commands/config.ts` | Modify | UI copy (L67-68) |
| `src/ui/welcome-screen.ts` | Modify | UI copy (L26) |
| `src/core/init.ts` | Modify | UI copy (L677) |
| `src/core/qa-config-seed.ts` | Modify | apply rules (L66,70,71,73,74,75,76) |
| `src/core/templates/workflows/publish.ts` | Modify | L14,17,19,20,21,25(drop "v1 Qase only"),30,32,40 |
| `src/core/templates/workflows/cases.ts` | Modify | L33 |
| `src/core/templates/workflows/qas-workflow-preamble.ts` | Modify | L114 |
| `src/core/templates/workflows/analyze.ts` | Modify | L38 guardrail |
| `schemas/qaspec-pr-review/schema.yaml` | Modify | L3,112,160,175,177,179,185,187,189,194,196,197 |
| `openspec/specs/*` (6 caps) | Modify | Delta-spec wording (spec phase) |
| `docs/*`, `README.md` | Modify | Neutral wording |
| `src/core/reference-scaffold.ts:52` | KEEP | Illustrative example (allowed) |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | Seed footer + apply rules | Assert neutral strings present; assert no non-illustrative `/Qase/` in `getQaspecPrReviewConfigSeed` and footer (`qa-config-seed.test.ts`, new footer assertion) |
| Unit | `provider` schema describe | `project-config.test.ts` asserts neutral description, no `v1: qase` |
| Snapshot | Rendered skill/command templates | Update `skill-templates-parity.test.ts.snap` deliberately; verify diff is wording-only |
| Regression | Halt behavior | Existing `publish-gate` tests still assert `tcms-missing` on absent provider (unchanged) |

RED-first (Strict TDD): add the neutral-string / no-dangling-Qase assertions before editing sources; snapshot updates land with the wording change.

## Sweep Checklist (verify completeness)

Definitive `Qase`/`qase` occurrences to neutralize: `tcms.ts:110`, `config.ts:67-68`, `welcome-screen.ts:26`, `cli/index.ts:530`, `qa-config-seed.ts:66,70,71,73,74,75,76`, `config-prompts.ts:15,17,28`, `publish-gate.ts:93`, `init.ts:677`, `project-config.ts:30`, `cases.ts:33`, `publish.ts:14,17,19,20,21,25,30,32,40`, `qas-workflow-preamble.ts:114`, `analyze.ts:38`, `schema.yaml:3,112,160,175,177,179,185,187,189,194,196,197`. KEEP: `reference-scaffold.ts:20` (legacy rename map), `reference-scaffold.ts:52` (illustrative example). Verify: `rg -i qase src schemas docs README.md openspec/specs` returns only the two KEEP lines.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. This change is wording + a commented config seed; publish stays MCP-only with no new transport axis.

## Migration / Rollout

No migration required. Seed change affects only newly initialized configs; existing `config.yaml` files are untouched (`publish` never writes the `tcms` block).

## Open Questions

- None.
