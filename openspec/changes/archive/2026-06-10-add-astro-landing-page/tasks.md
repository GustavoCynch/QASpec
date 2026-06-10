## 1. Scaffold Astro + Cloudflare Workers

- [x] 1.1 Create `website/` with Astro (Cloudflare adapter template): `package.json`, `astro.config.mjs`, `tsconfig.json`, `wrangler.toml`
- [x] 1.2 Add `website/README.md` with local dev (`pnpm install`, `pnpm dev`, `pnpm build`) and manual `wrangler deploy` steps
- [x] 1.3 Add `website/src/site.ts` constants (install command, GitHub repo URL, default `/qas:*` workflow labels)
- [x] 1.4 Update root `.gitignore` for `website/dist`, `.wrangler`, and Astro cache paths if not already covered

## 2. Landing page content and layout

- [x] 2.1 Implement `src/pages/index.astro` and section components: Hero, Features, Install, Tools, Faq, Footer
- [x] 2.2 Write QASpec copy from `README.md` / `docs/getting-started.md` (hero, 3–4 features, FAQ); OpenSpec-inspired layout only
- [x] 2.3 Populate supported tools grid from `docs/supported-tools.md` (names only; link to GitHub docs for detail)
- [x] 2.4 Add minimal global styles (dark-friendly, readable typography; no heavy UI framework unless starter includes it)

## 3. Deploy and repository integration

- [x] 3.1 Add `.github/workflows/deploy-website.yml` (path filter `website/**`, pnpm build, `wrangler deploy`, required secrets documented)
- [x] 3.2 Verify `npm pack` at repo root does not include `website/` artifacts
- [x] 3.3 Update root `README.md` with link placeholder or live URL after first deploy
- [ ] 3.4 Optional: set `package.json` `homepage` to production URL when domain is fixed

## 4. Branding and verification

- [x] 4.1 Extend branding guard (or add `test/website/branding.test.ts`) to fail on unallowlisted `openspec` / `/opsx:` product strings under `website/src/`
- [x] 4.2 Smoke: `pnpm build` in `website/` succeeds on macOS; document that CI validates Linux (workflow)
- [x] 4.3 Manual check: deployed page shows `npm install -g @qaspec/cli` and `/qas:*` examples, not OpenSpec as primary product

## 5. Archive readiness

- [ ] 5.1 After implementation, run `qaspec validate` / change verify and archive when merged
