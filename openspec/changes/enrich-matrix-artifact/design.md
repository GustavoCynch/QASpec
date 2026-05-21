## Context

Today `testmatrix.md` uses one line `- [ ] N.N Title` per case (`schemas/qaspec-pr-review/templates/testmatrix.md`, workflow `matrix.ts` step 8). Qase rules (`qaspec/references/qase_test_case_rules.md`) already define preconditions, steps, and expected results for MCP, but matrix does not materialize them in the approved artifact. The CLI progress parser only counts checkbox lines (`parseTasksFile` in `instructions.ts`), so enriched content must live **below** the checkbox line, not replace it.

Sources of truth for drafting steps (existing schema read order): validated `analisis.md`, diff/PR, `qaspec/specs/<capability>/spec.md`, project references, and observable code (UI labels, URLs, messages). Vague steps only when no source provides actionable detail.

## Goals / Non-Goals

**Goals:**

- Stable, readable Markdown format for preconditions + numbered steps with action and expected result per case.
- Schema instructions, config seed, and matrix workflow aligned with traceability and anti-invention rules.
- Publish maps each case block to `create_case` without re-interpreting title alone.
- Preserve checkbox tracking and co-produced delta specs in the same phase.

**Non-Goals:**

- Changing the artifact graph (`analyze` → `test-matrix` + `specs` → publish).
- CLI parser that validates step semantics (human/agent in matrix; publish validates against Qase rules).
- TestRail/Xray support in this delivery.
- Automatic migration of legacy matrices (compatibility: checkboxes still count).

## Decisions

### 1. Per-case block indented under the checkbox line

**Format:**

```markdown
## Suite: Module name

- [ ] 1.1 Observable case title
  <!-- req: capability/requirement-slug (optional) -->

  **Preconditions:**
  1. Be on the development environment.
  2. Be logged in as [ROLE] in organization [ORG].
  3. <!-- traceable case-specific precondition -->

  **Steps:**
  | # | Action | Expected |
  |---|--------|----------|
  | 1 | Navigate to [base URL] | |
  | 2 | ... | ... or empty for transition |
```

**Rationale:** One checkbox line preserves progress and publish-plan; a table or numbered list makes the action/expected pair explicit without ambiguity.

**Rejected alternative:** Case as `### 1.1` heading only without checkbox — breaks `publish.tracks` and `openspec status` counting.

### 2. Content rules (no invention)

- Each **Action** and **Expected** must be traceable to `analisis.md`, diff, capability spec, cited requirement, or UI/API element named in sources read for the change.
- When detail is missing: a step may be generic (e.g. "Complete the add-item flow on the screen available") **only** when documented in an optional HTML comment `<!-- gap: no URL/label in sources -->` or in the agent self-audit before halt.
- Forbidden: camelCase, Angular selectors, file paths, "validate limits" without an explicit boundary (rules already in seed).

### 3. Qase alignment without duplicating the full reference doc

Matrix uses the same precondition prefix and step-1 (navigation) convention as `qase_test_case_rules.md`. Publish **does not** re-generate steps from the title: it reads the case **Steps** and **Preconditions** blocks in `testmatrix.md` (and `execution-context.md` for URL/role when missing from matrix).

### 4. Changes by layer

| Layer | Change |
|-------|--------|
| Template | Full example case with blocks |
| `schema.yaml` `test-matrix` | Explicit source and format instructions |
| `qa-config-seed.ts` | Traceability and step rules |
| `matrix.ts` | Steps 8–9: enriched format + gap self-audit |
| `publish.ts` | Read case blocks when preparing plan and MCP |
| Main specs | MODIFIED/ADDED scenarios in two capabilities |

### 5. Language

Case text in the project language from `qaspec/config.yaml`, consistent with `artifact-language-policy` — no hardcoded Spanish in `src/`.

## Risks / Trade-offs

- **[Risk] Longer matrices** → Mitigation: one case = one flow; avoid duplicating navigation steps across cases in the same suite when the halt allows editing.
- **[Risk] Agent still invents steps** → Mitigation: rules + mandatory self-audit in workflow; spec scenario for manual verification rejecting untraceable steps.
- **[Risk] Publish misparses tables** → Mitigation: document a single format in the template; publish instructions require reading Action/Expected columns.
- **[Risk] Legacy matrices without blocks** → Mitigation: publish may ask to complete matrix before MCP when **Steps** are missing under an approved case (warning in apply instructions, not a CLI failure).

## Migration Plan

1. Implement template + schema + seed + workflows.
2. Update main specs via this change’s deltas and archive on close.
3. `qaspec update` in consumer projects regenerates skills; teams re-run `/qsx:matrix` on open changes if they want full blocks before publish.
4. No automatic on-disk file migration.

## Open Questions

- Require `<!-- gap: ... -->` on every generic step or only in internal self-audit? **Proposal:** optional comment in template; seed rule "document gap when using generic step".
- Maximum steps per case in instructions? **Proposal:** no CLI limit; business rule "one case, one primary verification objective" already in qa-pr-review.
