# Fases y comandos QASpec (propuesta de producto)

**Estado:** propuesta — acordar aquí antes del schema `qaspec-pr-review` y antes de implementar skills/comandos en el installer.

**Origen del comportamiento:** la skill `.agents/skills/qa-pr-review` se **convierte** en los comandos y skills `qas` de producto (no queda como pack paralelo ni opcional).

**Referencias técnicas:** [06-qa-pr-review-phase-mapping.md](./06-qa-pr-review-phase-mapping.md), [05-custom-schema-and-artifacts.md](./05-custom-schema-and-artifacts.md).

---

## Principio de diseño

QASpec **no** es un renombrado de OpenSpec/OPSX. El fork aporta **motor** (changes, schemas, `init`, validación, multi-agente). El **producto QA** define comandos propios, extraídos de la lógica hoy concentrada en `qa-pr-review`.

| Capa | Rol | Ejemplos |
|------|-----|----------|
| **Motor** | Infraestructura del ciclo en repo | `qas new`, `qas status`, `qas continue`, `qas instructions`, `qas archive` |
| **Workflow QA** | Skills y `/qas:*` instalados por `qas init` | `/qas:explore`, `/qas:analyze`, `/qas:matrix`, `/qas:publish`, … |
| **Referencias de proyecto** | Archivos que el usuario mantiene en su repo | `qaspec/references/historical_bugs.md`, `qaspec/references/qase_test_case_rules.md` |

**Superficie acotada:** un comando por fase con artefacto (`analyze`, `matrix`, `publish`) más **`/qas:explore`** para pensar sin comprometer el ciclo. Retomar un change, adjuntar contexto, pedir cambios a la matriz o aclarar prerrequisitos se hace **en conversación con el agente**, sin comandos dedicados.

**Prefijo:** `qas` (CLI: `qas <subcomando>`; agentes: `/qas:<acción>`).

**TCMS v1:** solo **[Qase](https://qase.io/)** en publicación, vía MCP.

---

## Referencias de proyecto (conocimiento persistente)

| Archivo | Uso |
|---------|-----|
| `qaspec/references/historical_bugs.md` | Lectura obligatoria al inicio de `/qas:analyze` (y en cada pasada analítica) |
| `qaspec/references/qase_test_case_rules.md` | Lectura antes de `/qas:matrix` y de nuevo antes de `/qas:publish` |

### Creación en `qas init` (sin comando aparte)

Igual que `openspec init`, **`qas init` siempre crea** (si no existen):

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
| `analisis.md` | Alcance implícito, riesgos, intención vs implementación, regresión | `/qas:analyze` (puede incorporar PR #, enlaces y notas que el usuario dio en chat) |
| `testmatrix.md` | Lista de casos aprobable | `/qas:matrix`; ediciones posteriores vía chat (mismo artefacto, sin comando extra) |
| `publish-log.md` | Traza de publicación en Qase | `/qas:publish` |
| `execution-context.md` | *(Opcional)* Proyecto Qase, rol, URLs si `publish` los persistió | Escrito por `/qas:publish` al recoger datos, no por fase aparte |

**No hay** artefacto `intake.md` obligatorio ni fase dedicada de intake: abrir o retomar un change es `qas new` / conversación (“sigue el change X”, “revisa el PR 123”).

**Side effect v1:** suites y casos en Qase (MCP). Sin modificar código de la aplicación bajo prueba.

---

## Modo exploración (sin fase ni artefacto obligatorio)

**Comando:** `/qas:explore`

**Objetivo:** Pensar, investigar y aclarar antes (o entre) ciclos formales — mismo rol que el modo explore de OpenSpec, adaptado a QA.

**Qué hace**

- Explorar ideas, comparar enfoques, revisar el codebase o un PR **sin** escribir `analisis.md` / `testmatrix.md` por obligación.
- Puede leer `changes/`, `qaspec/references/` y contexto del chat; **no** sustituye halts de `analyze` / `matrix` / `publish`.
- **No** implementa código de la aplicación bajo prueba ni publica en Qase.

**Cuándo usarlo:** dudas de alcance, elección de estrategia de prueba, lectura previa de un diff, preparación antes de `qas new` o `/qas:analyze`.

**Skill:** `qas-explore` (instalada por `qas init`, siempre en v1).

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

### Fase 2 — Matriz de pruebas

**Objetivo:** Lista revisable en repo (**Phase 2** de `qa-pr-review`).

- **Leer** `qaspec/references/qase_test_case_rules.md` antes de redactar.
- Suites, tipos de caso, BVA explícito, texto observable para testers.
- **Dos analistas en paralelo → fusión** — por defecto en `/qas:matrix`.
- Si el usuario pide cambios tras el halt, el agente **actualiza `testmatrix.md` en chat** (sin `/qas:revise-matrix`).

**Artefacto:** `testmatrix.md`  
**Halt:** Aprobación de la lista.

---

### Fase 3 — Publicación en Qase

**Objetivo:** Subir matriz aprobada y cerrar prerrequisitos (**Phase 3 + 4** de `qa-pr-review`, fusionadas).

**Prerrequisitos Qase** (código de proyecto, rol, URL base, entorno):

1. Buscar primero en artefactos ya existentes (`analisis.md`, `testmatrix.md`, `execution-context.md` de un publish anterior, `publish-log.md`, o lo dicho antes en el mismo chat).
2. Si **faltan** campos obligatorios → **halt con una pregunta** pidiendo solo lo que falta (mismo espíritu que Phase 3 de la skill, pero **dentro de** `/qas:publish`).
3. Tras obtenerlos, **persistir** en `execution-context.md` (opcional pero recomendado) para el siguiente publish o retoma en otro chat.

**Validación pre-MCP** (absorbe el rol de un hipotético `validate`): releer `qase_test_case_rules.md`, comprobar matriz aprobada y formato antes de llamar MCP.

**Ejecución:** `create_suite`, `create_case`, `bulk_create_cases` si aplica; escribir `publish-log.md`; detener ante PII/secretos.

**Halt:** Solo mientras faltan datos de Qase; una vez completos, fase ejecutiva sin segundo halt.

**Alcance v1:** solo Qase.

---

### Cierre — Archivo del ciclo

`qas archive` (CLI) con guía opcional `/qas:archive` en el agente.

---

## Comandos QASpec

### CLI — motor

| Comando | Función |
|---------|---------|
| `qas init` | Skills/comandos `/qas:*`, scaffold (`qaspec/`, config, **`qaspec/references/*.md`**) |
| `qas new <change>` | Crear change (schema QA por defecto); el usuario describe alcance en chat al usar `/qas:analyze` |
| `qas status [--change]` | Progreso de artefactos |
| `qas continue [--change]` | Siguiente artefacto según grafo |
| `qas instructions <artefacto> [--change]` | Instrucciones + `config.yaml` |
| `qas archive [change]` | Archivar |
| `qas list` | Changes activos |
| `qas schema …` | Mantenimiento de schemas |

Retomar un change: el usuario lo indica al agente; el agente usa `qas status` / lee artefactos en `changes/<nombre>/`. **Sin** `qas resume` ni `/qas:resume`.

---

### Comandos de agente — workflow v1

| Comando | Fase | Qué hace |
|---------|------|----------|
| `/qas:explore` | — (exploración) | Pensar e investigar sin artefactos obligatorios; no sustituye halts del ciclo formal |
| `/qas:analyze` | 1 | `analisis.md`; `historical_bugs.md`; dual-analyst; halt |
| `/qas:matrix` | 2 | `testmatrix.md`; reglas Qase; dual-analyst; halt; iteración por chat |
| `/qas:publish` | 3 | Resolver prerrequisitos Qase (artefactos o pregunta al usuario); validar matriz; MCP; `publish-log.md` (+ opcional `execution-context.md`) |
| `/qas:archive` | Cierre | Guía de cierre + `qas archive` |

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
- Parámetros de idioma/profundidad vía `openspec/config.yaml` `rules`.

---

## Grafo de artefactos (`qaspec-pr-review`)

```text
analisis.md          ← qaspec/references/historical_bugs.md
    ↓
testmatrix.md        ← qaspec/references/qase_test_case_rules.md
    ↓
publish              ← prerrequisitos Qase (artefactos existentes o halt en publish)
    →  publish-log.md
    →  execution-context.md (opcional, escrito por publish si recogió datos nuevos)
```

`qas continue` avanza por `requires`. El usuario puede invocar `/qas:matrix` o `/qas:publish` directamente si los artefactos previos ya existen.

---

## Migración: `qa-pr-review` → comandos `qas`

| Hoy (`qa-pr-review`) | Destino QASpec |
|----------------------|----------------|
| Skill monolítica | `qas-explore`, `qas-analyze`, `qas-matrix`, `qas-publish`, `qas-archive` |
| (modo pensamiento previo al ciclo) | `/qas:explore` |
| `references/historical_bugs.md` | `qaspec/references/historical_bugs.md` (`qas init`) |
| `references/qase_test_case_rules.md` | `qaspec/references/qase_test_case_rules.md` (`qas init`) |
| Phase 1 + dual Task | `/qas:analyze` |
| Phase 2 + dual Task | `/qas:matrix` (ediciones posteriores en chat) |
| Phase 3 — Prerequisites | **Dentro de** `/qas:publish` (halt si faltan datos) |
| Phase 4 — Upload Qase | `/qas:publish` (incluye validación pre-MCP) |
| Retomar / abrir PR en chat | Sin comando; `qas new` + conversación |

---

## Implementación en el fork (nota breve)

- Plantillas `qas-*` migradas desde `qa-pr-review/SKILL.md` (contenido de Phase 3 y validación → skill `qas-publish`).
- `qas init`: familia `qas-*` (incluye **`qas-explore`**) + `qaspec/references/`.
- Schema `qaspec-pr-review`: tres artefactos principales en el grafo (`analyze`, `test-matrix`, `publish`); sin nodos `intake` ni `execution-context` como pasos obligatorios del grafo (context opcional como salida de publish).

---

## Fuera de v1 (ideas)

| Idea | Notas |
|------|--------|
| `/qas:charter`, `/qas:signoff` | Nuevas fases + artefactos si el producto crece |
| Otros TCMS | Nuevos comandos publish-*; no v1 |

---

## Próximo paso

1. Validar grafo de 3 fases y tabla de comandos v1.
2. Actualizar [05](./05-custom-schema-and-artifacts.md) (sin `intake` obligatorio; publish con instrucción de prerrequisitos).
3. Fork `qaspec-pr-review` e implementar skills `qas-explore`, `qas-analyze`, `qas-matrix`, `qas-publish`, `qas-archive`.
