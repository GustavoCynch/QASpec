# Decisión: fork completo vs fork ligero

## Pregunta

¿Construir QASpec desde cero, fork ligero (solo schema en repo + dependencia `openspec`), o **fork completo** del repositorio OpenSpec?

## Decisión tomada

**Fork completo** en este repositorio, copia **sin modificar** comandos ni binario en el primer paso.

## Por qué no desde cero

Reimplementar init multi-agente, parser de schemas, archive, config injection y CLI cross-platform duplica meses de trabajo sin diferenciación de producto.

## Por qué no solo fork ligero

El objetivo evolucionado incluye:

- Comando y marca `qas` (no solo `openspec`)
- Rutas por defecto `qaspec/changes/` con artefactos `analisis.md`, `testmatrix.md`, etc.
- Skills generados con prefijo `qas-*`
- `apply` reinterpretado como publicación TCMS, no implementación de código
- Un solo vocabulario de punta a punta

Un fork ligero deja fricción permanente (“instala OpenSpec pero el producto se llama QASpec”).

## Qué incluye el fork completo actual

- Código fuente OpenSpec **1.3.1** (`src/`, `test/`, `schemas/`, `bin/openspec.js`, …)
- `package.json` sin renombrar: `@fission-ai/openspec`
- Comandos OPSX y perfiles **sin cambiar** (pendiente roadmap [07](./07-commands-and-cli-rename.md))

## Qué queda explícitamente fuera del primer commit

- Renombrar `openspec` → `qas`
- Renombrar `opsx-explore` → `qas analyze`
- Schema QA por defecto
- Eliminar o aislar `spec-driven` del default

## Riesgo principal

**Costo de merge** con [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec). Mitigación: ver [10-upstream-merge-policy.md](./10-upstream-merge-policy.md).
