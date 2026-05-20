# Fases y comandos QASpec (propuesta de producto)

**Estado:** propuesta — acordar aquí antes del schema `qaspec-pr-review` y antes de implementar skills/comandos en el installer.

**Origen del comportamiento:** la skill `.agents/skills/qa-pr-review` se **convierte** en los comandos y skills `qas` de producto (no queda como pack paralelo ni opcional).

**Referencias técnicas:** [06-qa-pr-review-phase-mapping.md](./06-qa-pr-review-phase-mapping.md), [05-custom-schema-and-artifacts.md](./05-custom-schema-and-artifacts.md).

---

## Principio de diseño

QASpec **no** es un renombrado de OpenSpec/OPSX. El fork aporta **motor** (changes, schemas, `init`, validación, multi-agente). El **producto QA** define comandos propios, extraídos de la lógica hoy concentrada en `qa-pr-review`.

| Capa | Rol | Ejemplos |
|------|-----|----------|
| **Motor (CLI)** | Binario en terminal | `qaspec init`, `qaspec new`, `qaspec status`, `qaspec continue`, … |
| **Workflow QA (agentes)** | Skills y comandos en `.cursor/`, `.claude/`, etc. | `/qas:explore`, `/qas:analyze`, `/qas:matrix`, `/qas:publish`, … |
| **Referencias de proyecto** | Archivos que el usuario mantiene en su repo | `qaspec/references/historical_bugs.md`, `qaspec/references/qase_test_case_rules.md` |

**Superficie acotada:** un comando por fase con artefacto (`analyze`, `matrix`, `publish`) más **`/qas:explore`** para pensar sin comprometer el ciclo. Retomar un change, adjuntar contexto, pedir cambios a la matriz o aclarar prerrequisitos se hace **en conversación con el agente**, sin comandos dedicados.

### Convención de nombres (CLI vs agentes)

| Superficie | Prefijo | Ejemplo |
|------------|---------|---------|
| **CLI** (terminal) | `qaspec` | `qaspec init`, `qaspec new mi-change`, `qaspec status` |
| **Comandos de agente** (Cursor, Claude, …) | `/qas:` | `/qas:analyze`, `/qas:matrix` |
| **Skills en disco** (carpetas generadas por init) | `qas-` | `qas-analyze`, `qas-matrix` (instaladas por `qaspec init`) |

No usar `qas` como comando de terminal. El prefijo corto `qas` queda reservado a la UX en el chat del agente.

**TCMS v1:** solo **[Qase](https://qase.io/)** en publicación, vía MCP.

---

## Referencias de proyecto (conocimiento persistente)

| Archivo | Uso |
|---------|-----|
| `qaspec/references/historical_bugs.md` | Lectura obligatoria al inicio de `/qas:analyze` (y en cada pasada analítica) |
| `qaspec/references/qase_test_case_rules.md` | Lectura antes de `/qas:matrix` y de nuevo antes de `/qas:publish` |

### Creación en `qaspec init` (sin comando aparte)

Igual que `openspec init`, **`qaspec init` siempre crea** (si no existen) e instala skills/comandos `/qas:*`:

| Ruta | Contenido inicial |
|------|-------------------|
| `qaspec/references/historical_bugs.md` | Plantilla dummy con guía para completar patrones de regresión |
| `qaspec/references/qase_test_case_rules.md` | Plantilla dummy con reglas de formato Qase |

Si el archivo **ya existe**, no se sobrescribe.

---

## Entradas y salidas del ciclo

**Entradas:** PR, requisitos, user stories, archivos adjuntos, notas de desarrollador (el usuario las indica en chat o quedan reflejadas en artefactos al analizar).

**Artefactos** en `changes/<nombre>/`:

| Artefacto | Contenido | Comando que lo produce / actualiza |
|-----------|-----------|-----------------------------------|
| `analisis.md` | Alcance implícito, riesgos, intención vs implementación, regresión, **capacidades afectadas** (kebab-case) | `/qas:analyze` (puede incorporar PR #, enlaces y notas que el usuario dio en chat) |
| `testmatrix.md` | **Lista de casos + checklist de progreso** (análogo a `tasks.md` en OpenSpec) | `/qas:matrix`; ediciones y checks vía chat; `/qas:publish` puede marcar ítems publicados |
| `specs/**/*.md` | Delta specs (ADDED/MODIFIED/…) alineados con la matriz | `/qas:matrix` (misma fase que `testmatrix.md`); lectura de `openspec/specs/<capability>/` como baseline |
| `publish-log.md` | Traza de publicación en Qase | `/qas:publish` |
| `execution-context.md` | *(Opcional)* Proyecto Qase, rol, URLs si `publish` los persistió | Escrito por `/qas:publish` al recoger datos, no por fase aparte |

**No hay** artefacto `intake.md` obligatorio ni fase dedicada de intake: abrir o retomar un change es `qaspec new` / conversación (“sigue el change X”, “revisa el PR 123”).

**Side effect v1:** suites y casos en Qase (MCP). Sin modificar código de la aplicación bajo prueba.

---

## `testmatrix.md` = `tasks.md` de QA

En OpenSpec, `tasks.md` combina **plan de trabajo** (qué hacer) y **seguimiento** (checkboxes `- [ ]` / `- [x]` que el motor parsea; `apply` con `tracks: tasks.md` alimenta `qaspec status` / progreso).

En QASpec **no hace falta un `tasks.md` aparte** en v1: **`testmatrix.md` cumple ese rol** para el ciclo de pruebas.

| OpenSpec (dev) | QASpec (QA) |
|----------------|-------------|
| `specs` + `design` | `analisis.md` (Fase 1 — qué y riesgos) |
| `tasks.md` con checkboxes | **`testmatrix.md`** con checkboxes (Fase 2 — qué probar) |
| `apply` marca tareas hechas | **`publish`** sube a Qase y puede marcar ítems publicados en la misma matriz |

### Formato obligatorio (plantilla del schema)

Igual que en spec-driven (“si no es `- [ ]`, el motor no cuenta progreso”), la plantilla de `testmatrix.md` debe exigir:

```markdown
## Suite: Billing — Export

- [ ] 1.1 Verificar que el botón Exportar es visible para Super Admin
- [ ] 1.2 Verificar rechazo del límite inferior inválido (-1) en el campo edad

## Suite: Regression — Patrón histórico X

- [ ] 2.1 …
```

- Agrupar bajo encabezados `##` por suite/módulo.
- **Un caso = un checkbox** con numeración (`1.1`, `1.2`… por suite o secuencia global).
- Título del caso en la misma línea que el checkbox (texto observable para testers).
- Tipo de prueba (funcional, regresión, BVA, etc.) puede ir al final de la línea o en una nota breve — definir en `qase_test_case_rules.md` / instrucciones de `/qas:matrix`.

### En qué fase aplica cada uso del checkbox

| Momento | Fase | Comportamiento |
|---------|------|----------------|
| **Definición** | **Fase 2 — `/qas:matrix`** | Todos los casos nacen en `- [ ]`. El halt aprueba **esta lista con checks**. |
| **Edición** | Fase 2 (chat) | Altas/bajas/ediciones mantienen el formato checkbox. |
| **Publicación** | **Fase 3 — `/qas:publish`** | Tras crear el caso en Qase, marcar `- [x]` en la línea correspondiente (recomendado: `publish.tracks: testmatrix.md` en el schema, como `apply.tracks: tasks.md`). |
| **Ejecución manual** | *Futuro* | El tester marca `- [x]` al ejecutar en la app (mismo archivo; significado “ejecutado”, distinto de “publicado en Qase”). |

`analisis.md` **no** lleva checklist ejecutable: es narrativa y riesgos. `qaspec status` puede mostrar progreso parseando `testmatrix.md` (misma lógica que `tasks.md` hoy).

### Por qué no duplicar `tasks.md`

Un segundo archivo solo tendría sentido con **dos vistas** (matriz narrativa + checklist mínimo) y obligaría a mantener sincronía. Para v1: **un solo artefacto** — matriz aprobable, exportable a Qase y trackeable por el motor.

La skill `qa-pr-review` hoy usa una línea por caso sin checkbox; al migrar a `/qas:matrix`, el formato pasa a ser **checkbox bajo cada suite**.

---

## Modo exploración (sin fase ni artefacto obligatorio)

**Comando:** `/qas:explore`

**Objetivo:** Pensar, investigar y aclarar antes (o entre) ciclos formales — mismo rol que el modo explore de OpenSpec, adaptado a QA.

**Qué hace**

- Explorar ideas, comparar enfoques, revisar el codebase o un PR **sin** escribir `analisis.md` / `testmatrix.md` por obligación.
- Puede leer `changes/`, `qaspec/references/` y contexto del chat; **no** sustituye halts de `analyze` / `matrix` / `publish`.
- **No** implementa código de la aplicación bajo prueba ni publica en Qase.

**Cuándo usarlo:** dudas de alcance, elección de estrategia de prueba, lectura previa de un diff, preparación antes de `qaspec new` o `/qas:analyze`.

**Skill:** `qas-explore` (instalada por `qaspec init`, siempre en v1).

---

## Fases del workflow (3 fases + cierre)

### Fase 1 — Análisis

**Objetivo:** Tratar el cambio como objeto de prueba (**Phase 1** de `qa-pr-review`).

- Obtener diff (`gh`, `git`, o patch) según lo que el usuario indique en chat.
- **Leer** `qaspec/references/historical_bugs.md` (obligatorio; re-leer en cada pasada, sin cachear).
- Incorporar en el análisis la intención funcional (notas, descripción de cambio) y referencias (adjuntos, tickets) mencionadas en la conversación.
- **Dos analistas en paralelo (ciegos) → síntesis** — por defecto en `/qas:analyze`.

**Artefacto:** `analisis.md`  
**Halt:** Una pregunta; no continuar a matriz en el mismo mensaje.

---

### Fase 2 — Matriz de pruebas y requisitos

**Objetivo:** Lista revisable en repo, **checklist de QA**, y delta specs del change — equivalente a `tasks.md` + `specs` de OpenSpec en un solo paso (**Phase 2** de `qa-pr-review`). Ver sección [`testmatrix.md` = `tasks.md` de QA](#testmatrixmd--tasksmd-de-qa).

- **Leer** `qaspec/references/qase_test_case_rules.md` antes de redactar.
- Leer **Affected capabilities** en `analisis.md` y `openspec/specs/<capability>/spec.md` cuando existan (baseline para MODIFIED).
- Redactar `testmatrix.md` con **checkboxes obligatorios** por suite/caso (`- [ ]`), no solo líneas sueltas.
- Co-crear `specs/<capability>/spec.md` (delta ADDED/MODIFIED/…) alineados con los casos; trazabilidad opcional `<!-- req: capability/requirement-slug -->`.
- Tipos de caso, BVA explícito, texto observable para testers.
- **Dos analistas en paralelo → fusión** — por defecto en `/qas:matrix`.
- Si el usuario pide cambios tras el halt, el agente **actualiza `testmatrix.md` y `specs/**/*.md` en chat** (sin `/qas:revise-matrix`).

**Artefactos:** `testmatrix.md` + `specs/**/*.md`  
**Halt:** Una pregunta que aprueba **matriz y requisitos** juntos (checks en `[ ]`).

---

### Fase 3 — Publicación en Qase

**Objetivo:** Subir matriz aprobada y cerrar prerrequisitos (**Phase 3 + 4** de `qa-pr-review`, fusionadas).

**Prerrequisitos Qase** (código de proyecto, rol, URL base, entorno):

1. Buscar primero en artefactos ya existentes (`analisis.md`, `testmatrix.md`, `execution-context.md` de un publish anterior, `publish-log.md`, o lo dicho antes en el mismo chat).
2. Si **faltan** campos obligatorios → **halt con una pregunta** pidiendo solo lo que falta (mismo espíritu que Phase 3 de la skill, pero **dentro de** `/qas:publish`).
3. Tras obtenerlos, **persistir** en `execution-context.md` (opcional pero recomendado) para el siguiente publish o retoma en otro chat.

**Validación pre-MCP** (absorbe el rol de un hipotético `validate`): releer `qase_test_case_rules.md`, comprobar matriz aprobada y formato antes de llamar MCP.

**Ejecución:** `create_suite`, `create_case`, `bulk_create_cases` si aplica; escribir `publish-log.md`; **actualizar checkboxes** en `testmatrix.md` (`[ ]` → `[x]`) por cada caso publicado en Qase; detener ante PII/secretos.

**Halt:** Solo mientras faltan datos de Qase; una vez completos, fase ejecutiva sin segundo halt.

**Alcance v1:** solo Qase.

---

### Cierre — Archivo del ciclo

`qaspec archive` (CLI) con guía opcional `/qas:archive` en el agente.

---

## Comandos QASpec

### CLI — motor (`qaspec`)

| Comando | Función |
|---------|---------|
| `qaspec init` | Instalar skills `qas-*` y comandos `/qas:*` en agentes; scaffold (`qaspec/`, config, **`qaspec/references/*.md`**) |
| `qaspec new <change>` | Crear change (schema QA por defecto); el usuario describe alcance en chat al usar `/qas:analyze` |
| `qaspec status [--change]` | Progreso de artefactos y **checkboxes en `testmatrix.md`** (como con `tasks.md`) |
| `qaspec continue [--change]` | Siguiente artefacto según grafo |
| `qaspec instructions <artefacto> [--change]` | Instrucciones + `config.yaml` |
| `qaspec archive [change]` | Archivar |
| `qaspec list` | Changes activos |
| `qaspec schema …` | Mantenimiento de schemas |

Retomar un change: el usuario lo indica al agente; el agente usa `qaspec status` / lee artefactos en `changes/<nombre>/`. **Sin** comando `/qas:resume` dedicado.

---

### Comandos de agente — workflow v1

| Comando | Fase | Qué hace |
|---------|------|----------|
| `/qas:explore` | — (exploración) | Pensar e investigar sin artefactos obligatorios; no sustituye halts del ciclo formal |
| `/qas:analyze` | 1 | `analisis.md`; `historical_bugs.md`; dual-analyst; halt |
| `/qas:matrix` | 2 | `testmatrix.md` + `specs/**/*.md`; reglas Qase; leer main specs; dual-analyst; halt único; iteración por chat en ambos archivos |
| `/qas:publish` | 3 | Resolver prerrequisitos Qase (artefactos o pregunta al usuario); validar matriz; MCP; `publish-log.md` (+ opcional `execution-context.md`) |
| `/qas:archive` | Cierre | Guía de cierre + `qaspec archive` |

### Comandos explícitamente descartados

| Comando | Motivo |
|---------|--------|
| `/qas:intake` | Ruido; alcance y entradas van en chat o en `analisis.md` vía `analyze` |
| `/qas:attach` | Adjuntos y enlaces se tratan en conversación o durante `analyze` / `matrix` |
| `/qas:revise-matrix` | El usuario pide cambios en chat; el agente edita `testmatrix.md` |
| `/qas:context` | Prerrequisitos Qase los resuelve `publish` |
| `/qas:validate` | Chequeos integrados en `publish` antes del MCP |
| `/qas:resume` | Retomar change es conversación + lectura de artefactos |

**Skills en disco (v1):** `qas-explore`, `qas-analyze`, `qas-matrix`, `qas-publish`, `qas-archive`.

**Reglas transversales**

- `/qas:explore`: sin artefactos obligatorios del ciclo; no saltar halts de `analyze` / `matrix` / `publish`.
- `qas-analyze` y `qas-matrix`: solo lectura en código del producto bajo prueba.
- PR vía `gh` cuando aplique.
- Dual source of truth: intención (chat / notas) vs diff.
- Un mensaje por fase con artefacto; una pregunta por halt.
- **Language:** fork code and bundled agent templates in `src/` are **English**; project artifacts (`analisis.md`, `testmatrix.md`, references, halts) follow the user language via `openspec/config.yaml` `context` and `rules` (see `docs/multi-language.md`).

---

## Grafo de artefactos (`qaspec-pr-review`)

```text
analisis.md          ← qaspec/references/historical_bugs.md
    ├── testmatrix.md   ← qaspec/references/qase_test_case_rules.md; checkboxes = tasks de QA
    └── specs/**/*.md   ← delta specs; leer openspec/specs/<capability>/ como baseline
            ↓
publish (requires test-matrix + specs)  ← prerrequisitos Qase; MCP; tracks testmatrix.md
    →  publish-log.md
    →  execution-context.md (opcional, escrito por publish si recogió datos nuevos)
```

`qaspec continue` avanza por `requires`. El usuario puede invocar `/qas:matrix` o `/qas:publish` directamente si los artefactos previos ya existen.

---

## Migración: `qa-pr-review` → comandos `qas`

| Hoy (`qa-pr-review`) | Destino QASpec |
|----------------------|----------------|
| Skill monolítica | `qas-explore`, `qas-analyze`, `qas-matrix`, `qas-publish`, `qas-archive` |
| (modo pensamiento previo al ciclo) | `/qas:explore` |
| `references/historical_bugs.md` | `qaspec/references/historical_bugs.md` (`qaspec init`) |
| `references/qase_test_case_rules.md` | `qaspec/references/qase_test_case_rules.md` (`qaspec init`) |
| Phase 1 + dual Task | `/qas:analyze` |
| Phase 2 + dual Task (lista por líneas) | `/qas:matrix` → `testmatrix.md` con checkboxes (ediciones en chat) |
| Phase 3 — Prerequisites | **Dentro de** `/qas:publish` (halt si faltan datos) |
| Phase 4 — Upload Qase | `/qas:publish` (incluye validación pre-MCP) |
| Retomar / abrir PR en chat | Sin comando; `qaspec new` + conversación |

---

## Implementación en el fork (nota breve)

- Plantillas `qas-*` migradas desde `qa-pr-review/SKILL.md` (contenido de Phase 3 y validación → skill `qas-publish`).
- `qaspec init`: instala familia `qas-*` y `/qas:*` en agentes; escribe `qaspec/references/`.
- Schema `qaspec-pr-review`: cuatro nodos en el grafo (`analyze`, `test-matrix`, `specs`, `publish`); `test-matrix` y `specs` son hermanos bajo `analyze`; `apply.requires: [test-matrix, specs]`; plantilla `testmatrix.md` con formato checkbox; `publish.tracks: testmatrix.md`; sin `tasks.md` duplicado ni `intake` obligatorio.

---

## Fuera de v1 (ideas)

| Idea | Notas |
|------|--------|
| `/qas:charter`, `/qas:signoff` | Nuevas fases + artefactos si el producto crece |
| Checklist “ejecutado” vs “publicado” | Dos convenciones en el mismo `testmatrix.md` o metadato en línea; no v1 |
| Otros TCMS | Nuevos comandos publish-*; no v1 |

---

## Próximo paso

1. Validar grafo de 3 fases y tabla de comandos v1.
2. Actualizar [05](./05-custom-schema-and-artifacts.md) (sin `intake` obligatorio; publish con instrucción de prerrequisitos).
3. Fork `qaspec-pr-review` e implementar skills `qas-explore`, `qas-analyze`, `qas-matrix`, `qas-publish`, `qas-archive`.
