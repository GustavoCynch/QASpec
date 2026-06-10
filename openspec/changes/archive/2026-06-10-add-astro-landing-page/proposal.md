## Why

QASpec today has no public product surface beyond GitHub and Markdown in `docs/`. Prospective users cannot quickly understand what the project does, how to install it, or why it differs from ad-hoc agent planning—unlike OpenSpec, which ships a focused marketing site at [openspec.dev](https://openspec.dev/). A lightweight landing page closes that gap without coupling marketing releases to npm CLI publishes.

## What Changes

- Add a **`website/`** Astro project in this repository: single-page marketing site inspired by OpenSpec (hero, value props, install CTA, supported tools/agents, FAQ), adapted to QASpec messaging from `README.md` and `docs/getting-started.md`.
- Host on **Cloudflare Workers** via the **Astro Cloudflare adapter** (`@astrojs/cloudflare`) and Wrangler—not a separate repo.
- Add **Wrangler** config and a **GitHub Actions** workflow to build and deploy the site on merge to default branch (and optionally on manual dispatch).
- Wire **README** `homepage` (or a dedicated site URL field) to the deployed domain once known; document local dev (`pnpm dev` in `website/`) in `website/README.md`.
- Keep the npm package **`files`** and CLI build **unchanged**—`website/` is excluded from publish.

No **BREAKING** CLI or schema changes.

## Capabilities

### New Capabilities

- `product-landing-site`: Public marketing site content, structure, build output, and deploy contract (Astro + Cloudflare Workers).

### Modified Capabilities

- `openspec-free-product-surface`: Extend product-surface rules so the canonical public entry may be the deployed landing (in addition to `docs/`), with consistent `qaspec` / `/qas:*` branding and no legacy `/opsx:*` as primary CTA.

## Impact

- New: `website/` (Astro app, assets, `wrangler.toml`, `website/README.md`)
- New: `.github/workflows/deploy-website.yml` (or equivalent)
- Update: `README.md` (link to live site when URL is fixed)
- Update: root `.gitignore` if needed for Astro/Wrangler artifacts
- Optional: `package.json` root script `website:dev` for convenience (no new runtime dependency in published CLI)
- Unchanged: `src/`, `schemas/`, npm publish pipeline, `qaspec init` behavior
