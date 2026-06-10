---
"@qaspec/cli": patch
---

Remove accidental `"@qaspec/cli": "link:"` self-dependency and its pnpm override. The published 1.4.0 package shipped this pnpm-only protocol in its dependencies, which made `npm install -g @qaspec/cli` fail with `EUNSUPPORTEDPROTOCOL`.
