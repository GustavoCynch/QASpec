```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:eba0b156156d882b69f6a4fb9baf0cd6729595a2666f1897ece41a9bdc248d3d
verdict: pass-with-warnings
blockers: 0
critical_findings: 0
requirements: 7/7
scenarios: 24/24
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:50238232b6e401634e214d9b3dd74f1ea296f0de59eba5eba65454027c381c55
build_command: node build.js
build_exit_code: 0
build_output_hash: sha256:481f01a8af17da380d43c3ed6257c69c35d6bc2a931e209bedab1c6a550e3cbc
validate_command: npx openspec validate generalize-tcms-case-rules --strict
validate_exit_code: 0
validate_output_hash: sha256:8da1e1ee432dae2c2ce1496dac0d1f19b43d03107e71f5026fd1e986be1d7ba5
```

## Verification Report

**Change**: generalize-tcms-case-rules
**Version**: N/A
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 19 |
| Tasks complete | 19 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build**: PASSED — `node build.js` (TypeScript 5.9.3, clean compile)

**Tests**: PASSED — 1472 passed across 86 files (0 failed, 0 skipped), `pnpm test`, 19.68s

**OpenSpec strict validation**: PASSED — `npx openspec validate generalize-tcms-case-rules --strict` -> "Change 'generalize-tcms-case-rules' is valid"

**Coverage**: Not collected (no coverage tool run this pass; informational only)

### Spec Compliance Matrix
| Requirement | Scenario | Test / Evidence | Result |
|-------------|----------|-----------------|--------|
| TCMS case rules template | Seed TCMS case rules template | reference-scaffold.test.ts "seeds tcms_case_rules.md" + "conceptual field-mapping table" | COMPLIANT |
| TCMS case rules template | Field mapping table is provider-agnostic | reference-scaffold.test.ts asserts `not /Qase field/i` | COMPLIANT |
| TCMS case rules template | Omit-on-unmapped rule is seeded | asserts 'Omit-on-unmapped'; source states severity/priority/type not sent unless extended | COMPLIANT |
| TCMS case rules template | Customize section is provider extension point | source `## Customize` "plug in your provider's concrete field codes" | COMPLIANT |
| TCMS case rules template | Preserve user content | reference-scaffold.test.ts create-if-missing | COMPLIANT |
| Legacy case-rules file migration | Legacy renamed when new absent | reference-scaffold.test.ts "renames legacy...preserving content" | COMPLIANT |
| Legacy case-rules file migration | Both present left untouched | reference-scaffold.test.ts "leaves both files untouched" | COMPLIANT |
| Legacy case-rules file migration | User customizations survive (byte-for-byte) | reference-scaffold.test.ts asserts identical content | COMPLIANT |
| Legacy case-rules file migration | No legacy file -> no-op | reference-scaffold.test.ts "no-op when neither exists" + "only new exists" + idempotent | COMPLIANT |
| QASpec reference scaffolding on init | References created on first init | reference-scaffold.test.ts + init.test.ts | COMPLIANT |
| Localized reference scaffolds on init | Spanish / English default | Filename token updated; localization mechanism unchanged; full suite green | COMPLIANT |
| Cases workflow behavior | reads tcms_case_rules.md (mandatory refs) | cases.ts, qas-workflow-preamble.ts, qa-config-seed.ts, schema.yaml updated; parity snapshot regenerated | COMPLIANT |
| Publish workflow behavior | maps fields per tcms_case_rules.md, omit-on-unmapped | publish.ts, schema.yaml (incl. L195 "TCMS fields") updated; parity snapshot regenerated | COMPLIANT |
| Test cases artifact w/ checkbox template | Enriched-format example references tcms_case_rules.md | schema.yaml updated | COMPLIANT |

**Compliance summary**: 24/24 scenarios compliant (template/doc requirements covered by the skill-templates-parity golden regeneration; migration/scaffold requirements covered by dedicated unit + integration tests).

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Scaffold produces `tcms_case_rules.md` | Implemented | REFERENCE_FILES.tcmsRules, seeds array, ENGLISH_TCMS_RULES with conceptual mapping table + generic omit-on-unmapped + Customize; structure (suites, `- [ ] N.N`, Preconditions, Steps table, `<!-- req: -->`) preserved |
| `migrateReferenceFilenames` state table | Implemented | new-first check -> legacy check -> moveFile; both-present no-op; new-only no-op; neither no-op; idempotent; errors swallowed best-effort |
| Wired into init.ts (before scaffold) | Implemented | init.ts L135 migrate, L136 scaffold |
| Wired into update.ts (before early return) | Implemented | update.ts L95 migrate, right after planning-home check (L89-91), before no-tools return (L117) AND up-to-date early return (L157-164) — LOAD-BEARING ORDERING CONFIRMED |
| `FileSystemUtils.moveFile` content-preserving | Implemented | wraps fs.rename; test asserts content identical + source removed |
| No dangling legacy refs in src/schema/docs | Implemented | grep clean except intentional RENAME_MAP entry + migration tests; main `openspec/specs/*` still reference legacy (merged during archive, out of sweep scope) |
| Scope discipline held | Implemented | only filename token swaps + intended L195 "Qase fields"->"TCMS fields"; `create_suite`/`create_case` untouched; "e.g. Qase" preserved; Qase remains v1 default |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Shared standalone migration function (not scaffold-embedded) | Yes | Exported from reference-scaffold.ts, driven by RENAME_MAP |
| New FileSystemUtils.moveFile helper | Yes | mockable seam over fs.rename |
| Ordering: migrate before scaffold / before update short-circuit | Yes | Verified in both init.ts and update.ts |
| Check new file first | Yes | currentPath existence checked before legacy |
| Best-effort error handling | Yes | try/catch with console.debug per RENAME_MAP entry |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | WARNING | apply-progress is narrative; no formal "TDD Cycle Evidence" table |
| All tasks have tests | PASS | Every RED task's test file exists and passes |
| RED confirmed (tests exist) | PASS | reference-scaffold.test.ts (8), file-system.test.ts moveFile (2), init.test.ts (+1), update.test.ts (+1) all present |
| GREEN confirmed (tests pass) | PASS | 1472/1472 pass on re-execution |
| Triangulation adequate | PASS | migration state table fully triangulated (legacy-only / both / new-only / neither / idempotent) with differing expected values |
| Safety Net for modified files | PASS | init.test.ts / update.test.ts extend existing suites that were green before |

**TDD Compliance**: 5/6 checks pass; RED-before-GREEN inferred from tasks.md RED/GREEN pairing + net-new behavior-focused tests (not empirically re-verified via commit history — work is uncommitted).

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 10 | 2 | vitest |
| Integration | 2 | 2 | vitest (InitCommand/UpdateCommand execute) |
| **Total (new)** | **12** | **4** | |

### Assertion Quality
No trivial assertions found. Empty-array (`toEqual([])`) no-op assertions in reference-scaffold.test.ts have companion non-empty assertions (lines 79, 121). moveFile, migration, and scaffold tests assert byte-for-byte content, file presence/absence, and error rejection. No tautologies, ghost loops, smoke-tests, or implementation-detail coupling.

**Assertion quality**: All assertions verify real behavior.

### Golden Snapshot Audit
skill-templates-parity.test.ts.snap changed exactly 4 template hashes (getQasCases/Publish Command+Skill) and 2 generated-skill hashes (qaspec-cases, qaspec-publish). All other template hashes (analyze, archive, etc.) unchanged. This is a legitimate, scoped consequence of the cases.ts/publish.ts filename-token edits — not a masked unintended diff.

### Issues Found
**CRITICAL**: None
**WARNING**:
1. apply-progress artifact uses a narrative instead of the formal "TDD Cycle Evidence" table required by strict-TDD reporting. TDD discipline is well-evidenced indirectly (tasks.md RED-before-GREEN pairing, net-new behavior-focused tests, all green), but RED-actually-failed-first is not empirically re-verifiable since the work is uncommitted (no commit history to inspect ordering). Non-blocking.
**SUGGESTION**:
1. The seed's "severity/priority/type never invented" guidance is present in source but not directly asserted by a test; consider a content assertion for it in reference-scaffold.test.ts.
2. Main `openspec/specs/*` still reference `qase_test_case_rules.md`; this is expected and will be merged by the archive phase, but confirm the archive delta-merge updates all five capability specs.

### Verdict
**PASS WITH WARNINGS** — All 7 requirements / 24 scenarios implemented and covered; 19/19 tasks complete; build, full test suite (1472), and strict openspec validation all green; scope discipline and snapshot integrity confirmed. The sole warning is a documentation-format gap in the apply-progress TDD evidence, not a correctness defect. Ready to archive.
