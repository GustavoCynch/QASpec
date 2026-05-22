# QASpec landing site

Astro marketing site for [QASpec](https://github.com/GustavoCynch/QASpec), deployed to **Cloudflare Workers** via `@astrojs/cloudflare` and Wrangler.

## Prerequisites

- Node.js 20+ (22+ recommended for Astro 6)
- [pnpm](https://pnpm.io/) or npm
- Cloudflare account (for deploy)

## Local development

```bash
cd website
npm ci
npm run dev
```

Open http://localhost:4321

## Build

```bash
npm run build
```

Output is written to `dist/`.

## Preview with Wrangler

```bash
npm run build
npm run preview
```

## Deploy to Cloudflare

1. Log in: `npx wrangler login`
2. Deploy: `npm run deploy` (runs build + `wrangler deploy`)

### GitHub Actions

The workflow `.github/workflows/deploy-website.yml` deploys on pushes to `main` that touch `website/**`.

Required repository secrets:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | API token with Workers Scripts edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

### Custom domain

After the first deploy, attach a domain in the Cloudflare dashboard and update `SITE_URL` in `src/site.ts`, root `README.md`, and `package.json` `homepage` if desired.

## Project layout

```text
website/
├── src/
│   ├── components/   # Hero, Features, Install, Tools, Faq, Footer
│   ├── layouts/
│   ├── pages/index.astro
│   ├── site.ts       # Copy constants (install command, URLs, FAQ)
│   └── styles/global.css
├── astro.config.mjs
└── wrangler.toml
```
