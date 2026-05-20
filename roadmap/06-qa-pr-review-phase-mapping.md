# Roadmap: mapeo skill `qa-pr-review` → artefactos

**Fases y comandos `qas` (propuesta de producto):** ver [11-proposed-workflow-phases.md](./11-proposed-workflow-phases.md). La skill abajo **migra** a esos comandos; referencias del proyecto → `qaspec/references/`.

Origen en migración: `.agents/skills/qa-pr-review/SKILL.md`

## Fases actuales de la skill

| Fase | Nombre | Halt humano | Subagentes |
|------|--------|-------------|------------|
| 1 | PR Analysis & Confirmation | Sí — una pregunta | 2 paralelos (blind) → síntesis |
| 2 | Detailed Test Case List | Sí — aprobación lista | 2 paralelos → síntesis |
| 3 | Prerequisites (Qase, rol, URL) | Sí si falta dato | Orquestador solo |
| 4 | Upload to Qase (MCP) | No (ejecuta) | MCP `create_suite` / `create_case` |

## Mapeo a archivos en `changes/<name>/`

| Fase skill | Artefacto en repo | Comando QASpec (ver [11](./11-proposed-workflow-phases.md)) |
|------------|-------------------|-------------------------------------------------------------|
| 1 | `analisis.md` | `/qas:analyze` |
| 2 | `testmatrix.md` | `/qas:matrix` (ediciones en chat) |
| 3 | — | Absorbida por `/qas:publish` (prerrequisitos Qase; halt si faltan datos) |
| 4 | `publish-log.md`; opcional `execution-context.md` | `/qas:publish` |

## Comportamientos de la skill que NO son el CLI

| Comportamiento | Implementación futura |
|----------------|----------------------|
| STOP HERE entre fases | Skill / comando `qas` con instrucciones explícitas |
| Dual source of truth (intent vs diff) | Rules en `config.yaml` + template `analisis.md` |
| Historical bugs | `references/historical_bugs.md` por proyecto |
| Qase rules | `references/qase_test_case_rules.md` o rules Phase 2/4 |
| Read-only en código fuente | Skill constraint; no OpenSpec core |

## Fases futuras (skill crecerá)

Al añadir fases nuevas:

1. Nuevo `id` en `schema.yaml` + template.
2. Actualizar `requires` (grafo).
3. Documentar halt y reglas en skill o `rules` del config.
4. Entrada en este archivo.

Ejemplos posibles:

- `regression-matrix.md`
- `exploratory-charter.md`
- `sign-off.md`

## Reglas de síntesis (Phase 1 y 2)

Inyectar en `openspec/config.yaml` bajo keys del schema QA:

```yaml
rules:
  analyze:
    - Run two independent blind analyst drafts before user-visible output (orchestrator synthesizes)
    - End with exactly one user-facing question (Spanish if project rule says so)
  test-matrix:
    - Same dual-analyst pattern as Phase 1
    - Titles and steps: plain-language, no code identifiers in Qase-bound text
```

## Dualidad README vs comandos `qas`

- **README QASpec**: visión global del producto.
- **Comandos `qas`**: comportamiento operativo migrado desde esta skill; detalles de dominio (stack, idioma) vía `openspec/config.yaml` del proyecto, no vía pack paralelo.
