# Visión QASpec y estrategia de fork

## Producto (README)

QASpec aplica a **QA** la misma idea que OpenSpec aplica a **desarrollo**:

- Acordar **qué probar y por qué** antes de ejecutar.
- Artefactos **versionados en el repo**, no solo salida de chat.
- Entradas flexibles: PR, requisitos, user stories, archivos adjuntos.
- Publicación a TCMS **pluggable** (Qase, TestRail, Xray).

El sistema bajo prueba es **agnóstico al stack**; el CLI de QASpec puede seguir siendo TypeScript/Node por herencia del fork.

## Inspiración técnica

| OpenSpec (dev) | QASpec (QA) |
|----------------|-------------|
| proposal → specs → design → tasks → apply (código) | intake → análisis → matriz de pruebas → contexto de ejecución → publish (TCMS) |
| `openspec/changes/` | Futuro: `qaspec/changes/` o mantener ruta con schema QA |
| OPSX / schemas editables | Schema `qaspec-pr-review` (nombre tentativo) |

## Qué NO reimplementar desde cero

- CLI multiplataforma (macOS, Linux, Windows)
- `openspec init` y generación de skills para múltiples agentes
- `openspec/config.yaml` (context + rules)
- Sistema de schemas (`schema.yaml`, templates, `requires`)
- `changes/`, archive, status, validación

## Skill de referencia

`.agents/skills/qa-pr-review` define el workflow operativo deseado (fases, halts, dual blind analysts, Qase MCP). El motor forkado **no** implementa eso aún; el roadmap traduce la skill a schemas y comandos.

## Próximo hito recomendado

1. Crear `openspec/config.yaml` según [04-openspec-config-yaml.md](./04-openspec-config-yaml.md).
2. `openspec schema fork spec-driven qaspec-pr-review` y editar artefactos según [05](./05-custom-schema-and-artifacts.md) y [06](./06-qa-pr-review-phase-mapping.md).
