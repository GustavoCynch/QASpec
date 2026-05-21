## Context

After `remove-openspec-app-commands`, `qaspec init` / `qaspec update` install five core workflows (`explore`, `analyze`, `matrix`, `publish`, `archive`) as `qas-*` skills and `/qas:*` commands. The `docs/` tree still largely documents the pre-fork OPSX agent surface (`/opsx:*`, legacy profile workflows). `docs/migration-guide.md` has a top callout but the body still reads as the primary product path.

Maintainers continue to use in-repo `opsx-*` commands for spec-driven changes; consumer documentation must not conflate that with what QASpec installs in customer projects.

## Goals / Non-Goals

**Goals:**

- One coherent default story in product docs: QA spec workflow via `/qas:*` and `qaspec` CLI.
- Clear separation between **QASpec product** docs and **legacy OPSX / upstream OpenSpec** docs.
- Lightweight CI guard against reintroducing `/opsx:` as default install guidance in `docs/`.

**Non-Goals:**

- Deleting `docs/opsx.md` or `docs/migration-guide.md` (relabel and trim default-path claims instead).
- Documenting every internal maintainer Cursor command.
- Translating all docs to Spanish (artifact language policy unchanged).

## Decisions

### 1. Documentation information architecture

| Topic | Primary home | Notes |
|-------|----------------|-------|
| Default tester path | `getting-started.md`, `workflows.md` | `/qas:explore` → analyze → matrix → publish → archive |
| Slash command reference | `commands.md` | One table per core command; link to `qaspec instructions` |
| Legacy OPSX | `opsx.md`, `migration-guide.md` | Banner: not installed by QASpec CLI |
| CLI flags | `cli.md` | Unchanged structure; fix outdated examples |
| Tool paths | `supported-tools.md` | `qas-*` dirs and `/qas:*` frontmatter per tool |

**Rationale:** Minimizes broken links; preserves migration content for upstream users.

**Alternative considered:** Delete `opsx.md` — rejected because migration and upstream coexistence still need a home.

### 2. Command naming in prose

- Default examples use **`/qas:<workflow>`** (colon form), matching generated Cursor commands.
- File paths use **`qas-<workflow>`** skill dirs and `commands/qas/<workflow>.md` where tool-specific.
- **`/opsx:*`** only inside sections titled or bannered as legacy/upstream.

### 3. Profile and config narrative

- Document **`core` profile** as the five QASpec workflows only.
- Remove instructions to enable `propose`, `apply`, `verify`, etc. via `qaspec config profile` + `qaspec update`.
- Document **`custom` profile** as subset/superset of the five ids only (no legacy id picker in docs).

### 4. Regression guard

Add `test/docs/product-docs-qas-commands.test.ts` that scans `docs/*.md` (excluding `migration-guide.md` and `opsx.md` body after front matter, or use allowlist file) for unqualified `/opsx:` in headings, quick-reference tables, and "default" / "core profile" sections.

**Rationale:** Branding test already guards `OpenSpec` product strings; slash-command drift is a separate failure mode.

**Alternative:** Extend branding test — deferred to keep failures actionable per file type.

### 5. README alignment

Audit `README.md` Quick Start and command tables in the same pass as `docs/getting-started.md` so GitHub-first readers see `/qas:*`.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Long migration-guide still confuses readers | Keep callout; add "Legacy OPSX" H2 before historical `/opsx:` sections |
| Doc guard false positives on migration examples | Allowlist paths or require `/opsx:` only in files tagged legacy |
| Large diff hard to review | Task breakdown per doc file; one PR section per file in tasks.md |

## Migration Plan

1. Land doc rewrites and README in one change (`align-docs-qas-cli` apply).
2. No user migration — documentation-only; installed projects unaffected.
3. Optional follow-up: publish docs site if separate from repo (out of scope unless linked from README).

## Open Questions

- Whether `docs/opsx.md` should redirect readers to `workflows.md` at the top (recommend yes).
- Whether `supported-tools.md` should list legacy paths in a collapsed "legacy (not installed)" appendix only.
