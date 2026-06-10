# product-landing-site Specification

## Purpose

Define the QASpec marketing landing page: single-page Astro site deployed to Cloudflare Workers, QASpec-branded copy, and isolation from the CLI npm package.

## Requirements
### Requirement: Single-page marketing site

The repository SHALL include a `website/` Astro application that renders a single scrollable landing page for QASpec, structurally similar to [openspec.dev](https://openspec.dev/) (hero, feature highlights, install command, supported agents/tools, FAQ) without copying OpenSpec product copy verbatim.

#### Scenario: Visitor understands the product in one screen

- **WHEN** a visitor opens the deployed site root URL
- **THEN** they see a hero with QASpec positioning (spec-driven QA, agree on what to test before execution)
- **AND** a primary call-to-action to install or get started
- **AND** at least three feature sections describing outcomes (not CLI internals)

#### Scenario: Install command is visible

- **WHEN** a visitor scrolls to the install section
- **THEN** they see `npm install -g @qaspec/cli` (or the current published package name)
- **AND** a link to `docs/getting-started.md` on GitHub or an on-site docs path if added later

### Requirement: QASpec-branded public copy

All visible marketing copy on the landing page SHALL use **QASpec** as the product name, **`qaspec`** as the CLI name, and **`/qas:*`** as the default agent command prefix. The page SHALL NOT present **`/opsx:*`** or **`openspec`** as the primary user interface.

#### Scenario: No legacy command as default CTA

- **WHEN** a visitor reads workflow examples on the landing page
- **THEN** examples reference the analyze, cases, publish, or archive commands as appropriate
- **AND** no example references a `matrix` command
- **AND** no section titles OpenSpec or OPSX as the product being installed

#### Scenario: Upstream attribution is secondary

- **WHEN** the page mentions OpenSpec
- **THEN** it is limited to a short "inspired by" or lineage note
- **AND** it does not imply the visitor is installing OpenSpec

### Requirement: Cloudflare Workers deployment

The site SHALL build with Astro and deploy to **Cloudflare Workers** using the official Astro Cloudflare adapter and Wrangler configuration checked into `website/`.

#### Scenario: Production deploy via CI

- **WHEN** the deploy workflow runs on the default branch with valid Cloudflare secrets
- **THEN** it runs `pnpm install` and `pnpm build` inside `website/`
- **AND** publishes the Worker using Wrangler
- **AND** the live URL serves the built landing page

#### Scenario: Local preview

- **WHEN** a contributor runs the documented dev command from `website/README.md`
- **THEN** they can preview the landing page locally without publishing the npm CLI package

### Requirement: Isolated from CLI publish surface

The `website/` tree SHALL NOT be included in the `@qaspec/cli` npm `files` list and SHALL NOT add runtime dependencies to the CLI package root `dependencies`.

#### Scenario: npm pack unchanged

- **WHEN** a maintainer runs `npm pack` on the root package
- **THEN** the resulting tarball does not contain `website/` build artifacts or Astro source as shipped CLI content

### Requirement: Lightweight and maintainable

The landing implementation SHALL stay minimal: one primary page route, static content components, no CMS, no user accounts, and no server-side business logic beyond Astro/Worker static serving.

#### Scenario: No scope creep in v1

- **WHEN** reviewers inspect the `website/` tree
- **THEN** there is no blog, no authenticated area, and no duplicate of full `docs/` content
- **AND** deep documentation remains linked to GitHub `docs/` or a future docs phase

