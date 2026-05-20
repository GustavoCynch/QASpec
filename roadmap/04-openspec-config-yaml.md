# Roadmap: `openspec/config.yaml`

## Ubicación

`openspec/config.yaml` (preferir `.yaml`; `.yml` solo como fallback según OpenSpec).

## Cuándo crearlo

Después del fork, en un change dedicado (ej. `bootstrap-qaspec-config`). Puede generarse con:

```bash
openspec init
```

(responder al prompt de config) o creación manual.

## Campos

| Campo | Uso en QASpec |
|-------|----------------|
| `schema` | Eventualmente `qaspec-pr-review`; mientras tanto `spec-driven` para cambios del propio CLI |
| `context` | Visión README, entradas QA, TCMS pluggable, estado del repo |
| `rules` | Por artefacto (`specs`, `design`, … o IDs del schema QA futuro) |

## Borrador de `context` (adaptar al ejecutar)

```yaml
schema: spec-driven   # cambiar a qaspec-pr-review cuando exista el schema

context: |
  Product: QASpec — spec-driven QA workflow (fork of OpenSpec).
  Goal: Agree on what to test before execution; versioned artifacts in repo.

  Inputs: PRs, requirements/docs, user stories, reference files (PDF, etc.).

  Planned outputs: risk/analysis, test cases, prerequisites, TCMS publish.
  Integrations (install-time): Qase, TestRail, Xray — plugin model; stay vendor-agnostic in specs.

  Artifact language:
  - Specs and test artifacts: user/tester-observable behavior.
  - Internal CLI/plugin details: design.md or tasks.md unless user-facing contract.

  Implementation stack (this repo): TypeScript, Node ≥20.19, ESM, pnpm (from OpenSpec fork).
```

## Reglas sugeridas (cuando exista schema QA)

**specs / test-matrix:**

- Given/When/Then o escenarios equivalentes
- Trazabilidad a PR, story o sección de doc
- Sin acoplar a un solo TCMS en el texto normativo

**design:**

- Límites de plugins TCMS
- Listas explícitas, no glob/regex para artefactos generados

**tasks:**

- Separar scaffold, CLI, skills, docs
- Windows CI solo si el change toca rutas de archivos en Node

## Qué NO poner en config global QASpec

- Angular, Cynch, español obligatorio, reglas Qase detalladas → proyecto cliente o pack opcional `qaspec-cynch`.

## Referencia upstream

[OpenSpec customization](https://github.com/Fission-AI/OpenSpec/blob/main/docs/customization.md)
