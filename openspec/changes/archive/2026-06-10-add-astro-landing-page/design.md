## Context

QASpec is a Node.js CLI (`@qaspec/cli`) with Markdown docs under `docs/` and no web front-end. OpenSpec ships [openspec.dev](https://openspec.dev/) as a simple Astro marketing site (hero, features, install block, tool grid, FAQ). The user wants the same pattern for QASpec, hosted on **Cloudflare Workers** (not Pages-only static), co-located in this repo under `website/`.

Constraints: do not affect npm publish, keep deploy independent from CLI release, align copy with existing README and `docs/getting-started.md`, respect `openspec-free-product-surface` branding rules.

## Goals / Non-Goals

**Goals:**

- Scaffold `website/` with **Astro 5** + **`@astrojs/cloudflare`** adapter and **Wrangler**.
- Single-page layout inspired by OpenSpec: dark/minimal aesthetic, clear hero, 3–4 feature blocks, install snippet, supported AI tools list (from `docs/supported-tools.md`), short FAQ, footer with GitHub + license.
- Document local dev and deploy; add GitHub Action for deploy on default branch.
- Link README to production URL once the Cloudflare project exists.

**Non-Goals:**

- Full docs site (VitePress/Starlight) or mirroring all of `docs/`.
- Blog, i18n, CMS, analytics (can add PostHog later).
- Changing CLI code, schemas, or `qaspec init`.
- Cloudflare Pages as primary host (user asked Workers; adapter satisfies that).

## Decisions

### 1. `website/` in the same repo (not a separate repository)

**Choice:** `website/` at repo root with its own `package.json` and lockfile scoped to the site.

**Rationale:** Matches prior recommendation; shares branding with README/docs; single PR for copy + deploy. npm `files` already excludes it.

**Alternative rejected:** Separate repo — more overhead for early-stage marketing only.

### 2. Astro + `@astrojs/cloudflare` (SSR/static hybrid on Workers)

**Choice:** `npm create astro@latest` with Cloudflare adapter template; `output: 'server'` or adapter default per Astro 5 docs; `wrangler.toml` with `main` pointing to worker entry.

**Rationale:** User explicitly requested Cloudflare Workers. Official adapter is maintained and matches OpenSpec-style static marketing with optional edge if needed later.

**Alternative rejected:** Cloudflare Pages only — simpler for pure static, but does not meet Workers requirement; adapter still deploys via Workers platform.

### 3. Single route (`index.astro`) + section components

**Choice:** `src/pages/index.astro` composes `Hero`, `Features`, `Install`, `Tools`, `Faq`, `Footer` under `src/components/`.

**Rationale:** Keeps v1 maintainable; easy to match OpenSpec section order.

### 4. Styling: minimal CSS (or Tailwind if Astro template includes it)

**Choice:** Prefer **plain CSS modules or global CSS** in `website/src/styles/` to avoid heavy design system; optional Tailwind only if the Cloudflare Astro starter already includes it.

**Rationale:** Landing is one page; OpenSpec look is typography + spacing, not a component library.

### 5. Content source of truth

**Choice:** Hardcode marketing strings in Astro components for v1; pull install command and tool names from constants in `website/src/site.ts` (single file) so README drift is visible in one place.

**Rationale:** `docs/` stays Markdown on GitHub; duplicating full docs in Astro is out of scope.

### 6. CI deploy workflow

**Choice:** `.github/workflows/deploy-website.yml` with:

- `paths` filter: `website/**`, workflow file
- `pnpm install --dir website` + `pnpm build`
- `wrangler deploy` with secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (document in `website/README.md`)

**Rationale:** Decouples site deploy from npm `release` workflow.

### 7. Branding guard extension (optional in v1, recommended in tasks)

**Choice:** Extend branding test allowlist/guard to scan `website/src/**/*.astro` for forbidden `openspec` product strings (same rules as `docs/`).

**Rationale:** Aligns with `openspec-free-product-surface` automated guards.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Workers deploy config drift vs Astro docs | Pin adapter versions; document exact `wrangler deploy` in `website/README.md` |
| Copy diverges from README | Centralize install string + workflow names in `site.ts` |
| First deploy blocked without Cloudflare account | Document manual `wrangler deploy`; CI secrets as follow-up |
| Heavier repo (second package.json) | Keep `website/` self-contained; no root workspace merge required initially |

## Migration Plan

1. Implement `website/` locally; verify `pnpm dev` and `pnpm build`.
2. Create Cloudflare Worker project; run `wrangler deploy` once manually.
3. Add GitHub secrets; enable workflow.
4. Update README with live URL; optionally `package.json` `homepage` field.
5. Rollback: revert workflow; previous Worker version remains in Cloudflare dashboard.

## Open Questions

- **Production domain** (e.g. `qaspec.dev` vs `*.workers.dev`) — set in Cloudflare dashboard and `wrangler.toml` `routes` when known.
- **Exact visual parity with OpenSpec** — use QASpec-owned colors/wordmark or text-only hero until brand assets exist.
- **pnpm workspace** — optional root `pnpm-workspace.yaml` including `website`; defer unless root scripts are desired.
