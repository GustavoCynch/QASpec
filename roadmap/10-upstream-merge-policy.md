# Roadmap: política de merge con OpenSpec upstream

## Origen del fork

| Campo | Valor |
|-------|--------|
| Upstream | https://github.com/Fission-AI/OpenSpec |
| Versión copiada | **1.3.1** (`package.json` en el fork) |
| Licencia | MIT (mantener `LICENSE` y atribución) |

## Remote recomendado

```bash
git remote add upstream https://github.com/Fission-AI/OpenSpec.git
git fetch upstream
```

## Cuándo traer cambios upstream

- Fixes de seguridad o bugs en CLI/core
- Mejoras OPSX / schemas que no conflictúen con renombres QASpec
- Nuevas herramientas en `openspec init --tools`

## Cuándo NO mergear ciego

- Releases que asumen solo `openspec` binary después de renombrar a `qas`
- Cambios masivos en rutas si ya migraste a `qaspec/`
- Plantillas de skills si ya generaste `qas-*` custom

## Estrategia de ramas

1. `main` — producto QASpec (puede diverger)
2. `upstream/sync-1.3.x` — merges periódicos desde Fission-AI/OpenSpec
3. Resolver conflictos priorizando **módulos core** (`src/core/schemas`, parsers) y re-aplicar capa branding en [07](./07-commands-and-cli-rename.md)

## Archivos de alto conflicto esperado

- `package.json`, `bin/`
- `src/core/command-generation/`
- `src/commands/`
- `test/cli-e2e/`
- Skills embebidos en paquete vs generados en init

## Registro de divergencias

Mantener en este repo un changelog QASpec (opcional `QASPEC_CHANGELOG.md`) listando:

- Versión upstream base
- Commits upstream incorporados
- Divergencias intencionales (renombres, schema default, rutas)

## Antes de cada merge

```bash
pnpm test
pnpm build
openspec schema validate spec-driven
# cuando exista:
openspec schema validate qaspec-pr-review
```

## Atribución

Conservar copyright MIT de OpenSpec Contributors en `LICENSE` y mencionar fork en README o `roadmap/README.md` (ya documentado).
