# Roadmap: retomar trabajo en otro chat o IA

## Principio

**Los archivos en `changes/<name>/` son la fuente de verdad**, no el historial del chat.

Una IA nueva debe:

1. Leer el directorio del change.
2. Consultar `openspec status --change <name> --json` (futuro: `qas status`).
3. Continuar solo artefactos faltantes o actualizaciones pedidas por el usuario.

## Contrato por artefacto (con schema QA)

| Si existe | Interpretación |
|-----------|----------------|
| `analisis.md` | Phase 1 completada (salvo que el usuario pida re-análisis) |
| `testmatrix.md` | Phase 2 completada / lista base aprobada |
| `execution-context.md` | Phase 3 lista para publish |
| Publicación MCP hecha | Phase 4; opcional `publish-log.md` |

## Instrucciones para agentes (añadir a skills generados)

```markdown
Before creating any artifact:
- Run `openspec status --change <name> --json`
- If the target file already exists, ask whether to overwrite, append, or skip
- Never regenerate Phase 2 test cases without user approval if testmatrix.md is marked approved
```

## Halts vs archivos

| Mecanismo | Qué garantiza |
|-----------|----------------|
| Halt en skill | No avanzar fase en la **misma** sesión sin OK usuario |
| Archivo en disk | Poder retomar en **otra** sesión |

Ambos son necesarios.

## `.openspec.yaml` por change

OpenSpec ya puede guardar metadata por change. Evaluar campos:

```yaml
# ejemplo futuro
approved_phases:
  - analyze
  - test-matrix
tcms: qase
qase_project: CYNCH
```

Implementar en un change del fork si el schema core no basta.

## Anti-patrones

- Regenerar `analisis.md` desde cero ignorando `testmatrix.md` ya aprobado.
- Publicar a Qase sin `execution-context.md`.
- Asumir que “no hay proposal.md” implica change vacío (con schema QA los nombres cambian).

## Relación con OPSX

OPSX ya permite actualizar artefactos en cualquier orden **respetando `requires`**. La skill QA añade **gates humanos** que el CLI no enforce solo.
