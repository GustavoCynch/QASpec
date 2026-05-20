# Arquitectura: motor vs continuidad

## Dos capas

```
┌─────────────────────────────────────────────────────────────┐
│  A) Motor (fork OpenSpec → futuro @qaspec/cli)              │
│     CLI, init, schemas, config, archive, validación         │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  B) Continuidad entre chats / IAs distintas                 │
│     Archivos en changes/ = fuente de verdad                 │
└─────────────────────────────────────────────────────────────┘
```

## A) Motor

Responsable de:

- Scaffold de un change (`openspec new change <name>`)
- Instrucciones por artefacto (templates + `schema.yaml`)
- Inyectar `context` y `rules` desde config
- `openspec status`, archive, validación de schema

## B) Continuidad

**No** la provee el fork por sí solo. La provee:

- Existencia de archivos (`analisis.md` creado → Phase 1 hecha)
- Reglas en skills/orquestador: no saltar fases sin aprobación humana
- Opcional: `state.yaml` o metadata en `.openspec.yaml` del change
- `openspec status --change X` para saber qué falta

## Fases lineales vs grafo OPSX

OpenSpec OPSX promueve **acciones**, no pipeline rígido:

```
  proposal ──→ specs ──→ design ──→ tasks ──→ implement
     ↑           ↑          ↑
     └───────────┴──────────┘  (puedes volver atrás)
```

Para QASpec el modelo deseado es similar:

- Dependencias en `schema.yaml` = qué **puedes** generar, no “debes hacer todo en una sesión”.
- **Halts** (esperar OK del usuario) = capa skill/comando, no el parser YAML.

## Dual blind analysts (Phase 1 y 2)

Patrón de la skill `qa-pr-review`: dos subagentes en paralelo, orquestador sintetiza.

- Vive en **rules** de `config.yaml` + skill Cursor
- No requiere cambio en el core del CLI para el MVP

## Separación dev vs QA en artefactos

| Tipo de contenido | Dónde |
|-------------------|--------|
| Comportamiento observable, casos de prueba | `testmatrix.md`, specs QA |
| Análisis técnico del diff | `analisis.md` |
| MCP, layout CLI, plugins TCMS | `design.md` o doc de conector |
| Reglas Cynch/Angular/español | Config del **cliente**, no core QASpec |
