# Roadmap: schema custom y nombres de artefactos

## Objetivo

Dejar de usar `spec-driven` como workflow por defecto de **consumo QA** y definir un schema propio con archivos alineados al dominio.

## Comando inicial (sin modificar el fork aún)

```bash
openspec schema fork spec-driven qaspec-pr-review
```

Editar:

- `schemas/qaspec-pr-review/schema.yaml`
- `schemas/qaspec-pr-review/templates/*.md`

## Mapeo conceptual (dev → QA)

| spec-driven (OpenSpec) | QASpec (propuesto) |
|------------------------|-------------------|
| `proposal.md` | `intake.md` o brief; motivo y alcance del ciclo QA |
| — | `analisis.md` — análisis de riesgo / PR (Phase 1 skill) |
| `specs/**/*.md` | Opcional para capacidades estables; o integrado en matriz |
| `design.md` | Conectores, MCP, decisiones técnicas del flujo |
| `tasks.md` | `testmatrix.md` — matriz/lista de casos aprobables |
| — | `execution-context.md` — proyecto TCMS, rol, URLs (Phase 3) |
| `apply` (código) | `publish` — subida TCMS, checklist de suites creadas |

## Grafo tentativo

```
intake.md (opcional)
    ↓
analisis.md
    ↓
testmatrix.md
    ↓
execution-context.md
    ↓
publish (apply phase — trackear publicación, no código)
```

## `generates` en schema.yaml

Ejemplo conceptual:

```yaml
artifacts:
  - id: analyze
    generates: analisis.md
    requires: []

  - id: test-matrix
    generates: testmatrix.md
    requires: [analyze]

  - id: execution-context
    generates: execution-context.md
    requires: [test-matrix]

apply:
  requires: [execution-context]
  tracks: testmatrix.md   # o publish-log.md — decidir en el change
```

## Carpeta de changes

Opciones (elegir en un change):

1. Mantener `openspec/changes/<name>/` y solo cambiar nombres de archivos vía schema.
2. Renombrar raíz a `qaspec/changes/` (requiere cambios en código del fork — ver [07](./07-commands-and-cli-rename.md)).

## Config por defecto

En `openspec/config.yaml`:

```yaml
schema: qaspec-pr-review
```

## Validar

```bash
openspec schema validate qaspec-pr-review
```
