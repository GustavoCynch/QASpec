# Roadmap: conectores TCMS

## Objetivo (README)

Publicación pluggable en install time:

- [Qase](https://qase.io/)
- [TestRail](https://www.testrail.com/)
- [Xray](https://www.getxray.app/)

## Fase 4 hoy (skill)

La skill `qa-pr-review` implementa Qase vía **MCP** (`create_suite`, `create_case`, opcional `bulk_create_cases`).

Referencias: `.agents/skills/qa-pr-review/references/qase_test_case_rules.md`

## Arquitectura propuesta

```
testmatrix.md (aprobado)
        ↓
execution-context.md (proyecto, rol, URLs)
        ↓
   Connector interface
    ├── qase-mcp
    ├── testrail-api (futuro)
    └── xray-api (futuro)
```

## Principios

| Principio | Detalle |
|-----------|---------|
| Specs vendor-agnostic | Los requirements no deben decir “SHALL upload to Qase” salvo change específico del conector |
| Config en install | Elegir conector como dependencia opcional o feature flag |
| `publish` ≠ `apply` | Renombrar semántica apply en schema QA ([05](./05-custom-schema-and-artifacts.md)) |

## MVP

1. Documentar Qase MCP en `design.md` del change de conector.
2. Mantener reglas Qase en references del skill/pack cliente.
3. Abstraer en template `execution-context.md` campos comunes: `project_code`, `role`, `base_url`.

## TestRail / Xray

Changes separados por conector; misma forma de `execution-context.md` con campos específicos documentados en design.

## No en core QASpec

Reglas de título en español, precondiciones Cynch Dev Team, tipos Qase numéricos — pertenecen al **pack cliente**, no al motor forkado.
