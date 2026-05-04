# HITL Flow (SSOT v4.1)

Human-in-the-loop: **чекпоинты**, **допустимые действия**, **влияние на memory**. Код: `src/lib/hitl.ts`, `src/lib/orchestrator.ts` (`hitlGate`, draft review), UI: `src/routes/index.tsx`.

## Чекпоинты

| Checkpoint | Когда | Содержимое payload |
|------------|--------|---------------------|
| `confirm_plan` | После planner | `plan` (pages, sections, goals), опционально `styleDNA`. |
| `confirm_architecture` | После architect | `architecture` (layout, components, designSystem), JSON-слайс, `planSections`. |
| `review_draft` | После первой инженерной сборки в дизайн-цикле при `enableHITL` | `preview` (фрагмент JSON), `sectionOptions`, `structuralQualityScore`. |

Если `enableHITL === false`, `hitlGate` применяет `defaultHitlAction` без паузы.

## Допустимые действия (атомы)

- **План:** `confirm_plan`, `edit_plan`, `update_style_dna`, состав `compound`.
- **Архитектура:** `confirm_architecture`, `edit_architecture`, `reorder_sections`, `change_style` (+ DNA).
- **Черновик:** `confirm_draft`, `regenerate_section`, `refine_all`, `change_style`, `compound`.

`regenerate_section` → `regenerateSection` в оркестраторе (частичная пересборка с акцентом на секцию).

## Влияние на memory

| Событие | Memory |
|---------|--------|
| `edit_plan` / Style DNA | `memory.plan`, `memory.styleDNA`; после confirm_plan — `styleLocked`, новый `designSeed`. |
| Архитектурные патчи | `memory.architecture`. |
| `regenerate_section` | Обновление `rawSiteJson`, `siteSchema`, `code`, decisionLog `regen_section`, **partialRegens** в метриках. |
| `refine_all` / `change_style` | Подсказки следующему engineer, возможен новый seed. |
| Любой реальный HITL ответ | При `enableHITL` — запись в `memory.userEdits[]` (в т.ч. draft через `index.tsx` / orchestrator paths). |

## Внутренний цикл после draft

После необратимых действий (не `confirm_draft`):

- Только **`regenerate_section`** во всех атомах → **`needDraftHitl = false`**, чтобы не зациклить тот же модал без необходимости.
- Далее в inner loop: **static/component QA** → semantic → template (§20.8 / §20.9).

## События UI / пайплайна

- `PipelineEvent.stage === "await_user"` + `hitl` payload.
- После ответа пользователя: `hitl_resumed`, продолжение `runPipeline`.
