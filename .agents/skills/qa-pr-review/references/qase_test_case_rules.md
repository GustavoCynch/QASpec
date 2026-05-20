# Qase Test Case Rules (MCP)

Rules for creating suites and test cases in Qase **via MCP only** (`create_suite`, `create_case`). No JSON export or file import — all data is sent directly through MCP tools.

---

## Workflow (MCP Only)

- **Suites first:** Call `create_suite` per module/feature to get a suite ID.
- **Cases under suites:** Call `create_case` for each test case, passing the corresponding suite ID. Cases are never created without a suite.
- **No intermediate payloads:** Do not generate JSON blocks or files. Use the approved test case list from Phase 2 and call MCP tools directly.

---

## Suites (create_suite)

- **title:** Name of the module or feature (e.g. "Export CSV", "Filtros por asignación"). Use the same grouping as in the Phase 2 Markdown list.
- One suite per logical group; all cases in that group are created with that suite’s ID.

---

## Test Case Fields (create_case)

Pass these to `create_case` according to the Qase MCP tool schema. Use numeric codes where the API expects them.

**Text fields:**
- **title:** Clear and descriptive in **plain Spanish** for business/manual QA. **NO** prefixes like "(Funcional)". **NO** code-style names: camelCase/snake_case variables, Angular selectors (`app-…`), file paths, class/method names, or phrases that only make sense after reading source (e.g. "con objKey", "en app-assignment"). Describe **user-visible outcome or flow**. Example: "Widget Order Dashboard no muestra la columna Status".
- **preconditions:** Single string. Use `\n` to separate items. **Standard prefix (always include):**
  1. Estar en el ambiente de desarrollo.
  2. Estar logueado como [ROL] en la organización Cynch Dev Team.
  3. [Case-specific preconditions...]

**Precondition readability:** Case-specific lines must state **data or configuration a tester can recognize** (e.g. "Existe un activo con asignaciones ya guardadas", "La opción X está visible en ajustes"). Do **not** reference implementation (components, internal keys, "semilla/cableado" without explaining the visible field or screen).

**Step readability:** Each **action** is something a person does in the UI (or a clear test harness action), using **quoted UI labels** when the app is English. **expected_result** describes what is visible after that step (or `""` for transition steps per rules below). Avoid dev jargon and code symbols; full policy: `Readable QA narrative (mandatory)` in `SKILL.md`.

**Metadata (use values required by the MCP/API):**
- **type:** e.g. `1` (functional), `3` (security), `4` (smoke).
- **priority:** e.g. `1` (high), `2` (medium), `3` (low).
- **severity:** e.g. `1` (blocker), `2` (critical), `3` (major), `4` (normal), `5` (minor), `6` (trivial).
- **automation:** `0` (not automated).
- **status:** `0` (actual).
- **steps_type:** Use the value for classic steps if the tool supports it (e.g. classic).
- **is_flaky:** Use the value for non-flaky if the tool supports it (e.g. no).

---

## Steps (per case)

Each step has: **position** (integer from 1), **action**, **expected_result**. If the MCP step object has a **data** field, use `""` unless the step describes specific input data.

**Logic:**
1. **Step 1 (navigation):** Always navigation to the base URL.  
   - **action:** "Navegar a [URL]" (use the base URL from Phase 3).
2. **Transition steps:** Clicks, navigation, or actions that do not assert.  
   - **expected_result:** `""`
3. **Final or critical validation step:**  
   - **expected_result:** The expected outcome in **observable, non-code terms** (what appears on screen, counts, messages). Put the main assertion **only** in the last step or in the step where the critical check happens.

**Numbering:** Use sequential step positions (1, 2, 3, …). Do not paste raw list numbers like "2" alone as a step body; each **action** must be a full sentence describing the user action.

---

## Line Breaks

Use `\n` inside string fields (preconditions, step action, step expected_result). Do not use literal newlines inside a single value.
