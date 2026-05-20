# Roadmap: mapeo skill `qa-pr-review` → artefactos

Skill de referencia: `.agents/skills/qa-pr-review/SKILL.md`

## Fases actuales de la skill

| Fase | Nombre | Halt humano | Subagentes |
|------|--------|-------------|------------|
| 1 | PR Analysis & Confirmation | Sí — una pregunta | 2 paralelos (blind) → síntesis |
| 2 | Detailed Test Case List | Sí — aprobación lista | 2 paralelos → síntesis |
| 3 | Prerequisites (Qase, rol, URL) | Sí si falta dato | Orquestador solo |
| 4 | Upload to Qase (MCP) | No (ejecuta) | MCP `create_suite` / `create_case` |

## Mapeo a archivos en `changes/<name>/`

| Fase skill | Artefacto en repo | Notas |
|------------|-------------------|--------|
| 1 | `analisis.md` | Puede incluir IDs técnicos; narrativa usuario en español según skill |
| 2 | `testmatrix.md` | Markdown por suite; una línea por caso |
| 3 | `execution-context.md` | Qase project code, rol, base URL |
| 4 | No necessarily un md grande | Log opcional `publish-log.md`; MCP es side effect |

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

## Dualidad README vs skill

- **README QASpec**: global, inglés, agnóstico.
- **qa-pr-review**: opinionado (PR GitHub, Qase, Angular/Cynch en análisis). Tratar como **pack de cliente** o schema pack `qaspec-cynch`, no defaults del motor.
