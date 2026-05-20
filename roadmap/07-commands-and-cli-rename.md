# Roadmap: renombre de comandos y CLI

**Estado:** pendiente — el fork actual mantiene OpenSpec sin cambios.

## Objetivo final

| Hoy (fork) | Futuro (QASpec) |
|------------|-----------------|
| `openspec` (CLI) | `qaspec` |
| `@fission-ai/openspec` | `@qaspec/cli` (nombre tentativo) |
| `openspec/changes/` | `qaspec/changes/` (opcional) |
| `.cursor/commands/opsx-explore.md` | `.cursor/commands/qas-analyze.md` (comando `/qas:analyze`) |
| `openspec init` | `qaspec init` |

## Mapeo OPSX → QASpec (propuesto)

| Comando / skill actual | Agente (`/qas:*`) | CLI (`qaspec`) |
|------------------------|-------------------|----------------|
| `opsx-explore` | `/qas:explore` | — |
| `opsx-propose` | — (sin equivalente; ver [11](./11-proposed-workflow-phases.md)) | `qaspec new` |
| `opsx-apply` | `/qas:publish` | — |
| `opsx-archive` | `/qas:archive` | `qaspec archive` |
| `openspec continue` | — | `qaspec continue` |

## Orden de implementación sugerido

1. **Schema + config** ([05](./05-custom-schema-and-artifacts.md), [04](./04-openspec-config-yaml.md)) — sin renombrar binario.
2. **Copia interna** — binario `qaspec` (sin alias `qas` en CLI; `qas` solo en comandos de agente).
3. **Renombre paquete** y rutas por defecto `qaspec/`.
4. **Regenerar skills** en `init` con prefijo `qas-`.
5. **Deprecar** comandos `opsx-*` en docs generados (opcional mantener alias).

## Archivos del fork a tocar (checklist)

- `package.json` — `name`, `bin`, `description`, `repository`
- `bin/openspec.js` → `bin/qas.js` (o dual bin)
- `src/cli/*` — branding en help text
- `src/core/command-generation/*` — plantillas de skills/commands
- `src/core/workspace/*` — rutas default `openspec` vs `qaspec`
- `test/**` — snapshots y rutas esperadas
- `docs/**`, `README` técnico del CLI

## Qué no romper

- Formato `schema.yaml` y validación
- API de `openspec instructions --json` hasta que haya equivalente `qaspec instructions`
- Compatibilidad temporal: symlink o alias `openspec` durante migración

## Prueba de humo post-renombre

```bash
pnpm build
pnpm link --global   # o npm link
qaspec init
qaspec new change smoke-qa --schema qaspec-pr-review
qaspec status --change smoke-qa --json
```
