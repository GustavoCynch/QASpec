# Multi-Language Guide

Configure OpenSpec to generate artifacts in languages other than English.

## Quick Setup

Add a language instruction to your `openspec/config.yaml`:

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
openspec instructions proposal --change my-change

# Output will include your language context
```

## QASpec: code in English, artifacts in your language

The QASpec fork keeps **implementation** (CLI, bundled skills under `src/`, tests) in **English**.

**User-facing** content follows `openspec/config.yaml`:

- Generated change artifacts: `analisis.md`, `testmatrix.md`, `publish-log.md`
- Reference scaffolds: `qaspec/references/historical_bugs.md`, `qaspec/references/qase_test_case_rules.md`
- Halt questions and case titles from `/qas:analyze`, `/qas:matrix`, `/qas:publish`

Example for a Spanish QA project:

```yaml
schema: qaspec-pr-review

context: |
  Language: Spanish (es)
  All QA artifacts, reference scaffolds, and halt messages must be written in Spanish.

rules:
  analyze:
    - Plain-language Spanish for analysis and halts
  test-matrix:
    - Case titles and steps: Spanish; no code identifiers in Qase-bound text
```

New projects initialized with QASpec default schema include an English `Language:` placeholder in `context`; edit it before your first `/qas:analyze` run.

## Related Documentation

- [Customization Guide](./customization.md) - Project configuration options
- [Workflows Guide](./workflows.md) - Full workflow documentation
