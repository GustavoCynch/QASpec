# Multi-Language Guide

Configure QASpec to generate artifacts in languages other than English.

## Quick Setup

Add a language instruction to your `qaspec/config.yaml`:

```yaml
schema: spec-driven

context: |
  Language: Portuguese (pt-BR)
  All artifacts must be written in Brazilian Portuguese.

  # Your other project context below...
  Tech stack: TypeScript, React, Node.js
```

That's it. All generated artifacts will now be in Portuguese.

## Language Examples

### Portuguese (Brazil)

```yaml
context: |
  Language: Portuguese (pt-BR)
  All artifacts must be written in Brazilian Portuguese.
```

### Spanish

```yaml
context: |
  Idioma: Español
  Todos los artefactos deben escribirse en español.
```

### Chinese (Simplified)

```yaml
context: |
  语言：中文（简体）
  所有产出物必须用简体中文撰写。
```

### Japanese

```yaml
context: |
  言語：日本語
  すべての成果物は日本語で作成してください。
```

### French

```yaml
context: |
  Langue : Français
  Tous les artefacts doivent être rédigés en français.
```

### German

```yaml
context: |
  Sprache: Deutsch
  Alle Artefakte müssen auf Deutsch verfasst werden.
```

## Tips

### Handle Technical Terms

Decide how to handle technical terminology:

```yaml
context: |
  Language: Japanese
  Write in Japanese, but:
  - Keep technical terms like "API", "REST", "GraphQL" in English
  - Code examples and file paths remain in English
```

### Combine with Other Context

Language settings work alongside your other project context:

```yaml
schema: spec-driven

context: |
  Language: Portuguese (pt-BR)
  All artifacts must be written in Brazilian Portuguese.

  Tech stack: TypeScript, React 18, Node.js 20
  Database: PostgreSQL with Prisma ORM
```

## Verification

To verify your language config is working:

```bash
# Check the instructions - should show your language context
qaspec instructions proposal --change my-change

# Output will include your language context
```

## QASpec: code in English, artifacts in your language

The QASpec fork keeps **implementation** (CLI, bundled skills under `src/`, tests) in **English**.

**User-facing** content follows the planning-home config file (`qaspec/config.yaml` after `qaspec init`):

| Layer | Location | What it controls |
|-------|----------|------------------|
| **Role & locale** | `context` | QA role, read-only constraint, language, stack, domain |
| **Phase policy** | `rules.analyze`, `rules.test-matrix`, `rules.specs`, `rules.apply` | Depth per workflow step (BVA, dual-source, MCP gates) |
| **Orchestration** | Generated `qaspec-*` skills | CLI steps, Task×2 protocol, halts — English in the product |
| **Artifact shape** | Schema templates + `qaspec instructions … --json` | Section headings, file paths, checkbox format |
| **Team data** | `qaspec/references/*.md` | Historical bugs, Qase field rules |

Generated `/qsx:*` skills always tell the agent to run `qaspec instructions <artifact> --json` and apply `context`/`rules` without copying them into artifact files.

Example for a Spanish QA project:

```yaml
schema: qaspec-pr-review

context: |
  Role: QA Architect — read-only on application source.
  Language: Spanish (es)
  All QA artifacts, reference scaffolds, and halt messages must be written in Spanish.
  Stack: Angular SPA, REST APIs, Qase

rules:
  analyze:
    - Narrativa en español para análisis y halts
    - Dual source of truth: notas del desarrollador vs diff del PR
  test-matrix:
    - Títulos y pasos en español; etiquetas UI en inglés entre comillas cuando la app es en inglés
    - Sin identificadores de código en el texto de casos
  specs:
    - Requisitos y escenarios en español; SHALL/MUST normativos
  apply:
    - Releer qase_test_case_rules.md antes del primer MCP
```

New projects initialized with `qaspec-pr-review` receive an **active** `context` and `rules` seed with `(edit — …)` placeholders for language, stack, and domain. Replace those lines with your project details before the first `/qsx:analyze` run.

## Related Documentation

- [Customization Guide](./customization.md) - Project configuration options
- [Workflows Guide](./workflows.md) - Full workflow documentation
