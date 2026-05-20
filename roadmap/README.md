# QASpec roadmap

Este directorio documenta el plan acordado para evolucionar este repositorio **después** del fork completo de [OpenSpec](https://github.com/Fission-AI/OpenSpec) (v1.3.1, MIT).

## Estado actual del repositorio

| Qué | Estado |
|-----|--------|
| Código CLI | Fork **sin modificar** de OpenSpec: binario `openspec`, paquete `@fission-ai/openspec` |
| README raíz | Visión de producto **QASpec** (QA, no dev) |
| `.agents/skills/qa-pr-review` | Skill de referencia conservada; no forma parte del fork |
| Cambios de marca/comandos | **Pendientes** — ver documentos abajo |

## Orden sugerido de lectura

1. [01-vision-and-fork-strategy.md](./01-vision-and-fork-strategy.md) — Por qué QASpec y qué reutilizar
2. [02-fork-complete-vs-light.md](./02-fork-complete-vs-light.md) — Decisión: fork completo vs ligero
3. [03-architecture-motor-vs-continuity.md](./03-architecture-motor-vs-continuity.md) — Motor CLI vs continuidad por archivos
4. [04-openspec-config-yaml.md](./04-openspec-config-yaml.md) — `openspec/config.yaml` adaptado a QASpec
5. [05-custom-schema-and-artifacts.md](./05-custom-schema-and-artifacts.md) — Schema QA y nombres de archivos
6. [06-qa-pr-review-phase-mapping.md](./06-qa-pr-review-phase-mapping.md) — Fases de la skill → artefactos
7. **[11-proposed-workflow-phases.md](./11-proposed-workflow-phases.md)** — **Fases QASpec propuestas, comandos `qas`, Qase v1**
8. [07-commands-and-cli-rename.md](./07-commands-and-cli-rename.md) — Renombres futuros (`qas`, `qas analyze`, …)
9. [08-resume-across-chats.md](./08-resume-across-chats.md) — Retomar trabajo en otro chat/IA
10. [09-tcms-connectors.md](./09-tcms-connectors.md) — Qase, TestRail, Xray
11. [10-upstream-merge-policy.md](./10-upstream-merge-policy.md) — Mantener alineado con OpenSpec upstream

## Convención para cambios OpenSpec

Usa el flujo OPSX **tal como viene en el fork** (`openspec new`, `openspec/opsx-explore`, etc.) hasta que ejecutes los ítems del roadmap [07](./07-commands-and-cli-rename.md) y [05](./05-custom-schema-and-artifacts.md).
