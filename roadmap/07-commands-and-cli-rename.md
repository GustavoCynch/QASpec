# Roadmap: renombre de comandos y CLI

**Estado:** pendiente — el fork actual mantiene OpenSpec sin cambios.

## Objetivo final

| Hoy (fork) | Futuro (QASpec) |
|------------|-----------------|
| `openspec` | `qas` |
| `@fission-ai/openspec` | `@qaspec/cli` (nombre tentativo) |
| `openspec/changes/` | `qaspec/changes/` (opcional) |
| `.cursor/commands/opsx-explore.md` | `qas-analyze` o similar |
| `openspec init` | `qas init` |

## Mapeo OPSX → QASpec (propuesto)

| Comando / skill actual | Comando QASpec tentativo | Rol QA |
|------------------------|--------------------------|--------|
| `opsx-explore` / explore | `qas analyze` | Investigar PR/inputs, sin escribir código app |
| `opsx-propose` | `qas plan` o `qas intake` | Abrir ciclo / brief del change |
| `opsx-apply` | `qas publish` | TCMS, no implementar código |
| `opsx-archive` | `qas archive` | Cerrar change y archivar specs |
| `openspec continue` | `qas continue` | Siguiente artefacto disponible |

## Orden de implementación sugerido

1. **Schema + config** ([05](./05-custom-schema-and-artifacts.md), [04](./04-openspec-config-yaml.md)) — sin renombrar binario.
2. **Copia interna** — alias `qas` → misma entrada que `openspec` (un cambio pequeño en `package.json` bin).
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
- API de `openspec instructions --json` hasta que haya equivalente `qas instructions`
- Compatibilidad temporal: symlink o alias `openspec` durante migración

## Prueba de humo post-renombre

```bash
pnpm build
pnpm link --global   # o npm link
qas init
qas new change smoke-qa --schema qaspec-pr-review
qas status --change smoke-qa --json
```
