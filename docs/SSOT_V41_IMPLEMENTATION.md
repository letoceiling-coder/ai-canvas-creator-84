# SSOT v4.1 — сводка внедрения (production backlog closure)

**Репозиторий:** `demo-generator-site`  
**Дата:** 2026-05-04  
**Базовый документ:** `docs/AI_WEBSITE_BUILDER_MASTER_PLAN.md`

Ниже — что добавлено в рамках запроса «довести до production / SSOT v4.1» без переписывания ядра пайплайна.

## Этап 1 — Tool hardening (§1.15)

**Файлы:** `src/lib/tools/tool-layer.ts`, `src/lib/orchestrator-tools.ts`, `src/lib/orchestrator.ts`.

- Политика одного вызова **`runTool`** после промаха кэша:  
  **повтор live** → **simplifyToolQuery** + live → **`callProviderFallbackOnly`**.
- **Circuit breaker** по `ToolType`: после **> 3** последовательных неуспешных прогонов (все три шага не дали usable-ответ) — канал **30 секунд** в состоянии `circuit-open`; события **`circuit_breaker_open`**, **`circuit_block`**, **`tool_retry`** уходят в **decisionLog** через **`pushToolHardening`**.
- Экспорт: `simplifyToolQuery`, `callProviderFallbackOnly`, `resetToolCircuitBreakersForTests`.

## Этап 2 — Template detector (§20.9)

**Файл:** `src/lib/template-detector.ts`.

- **`calculateTemplateSimilarity(site)`** —.score 0…1 из: близости порядка секций к каноническому лендингу, «плоского» layout-паттерна, повторяемости типов блоков, текстовых клише.
- **`TEMPLATE_SIMILARITY_THRESHOLD`**, **`templateSimilarityCheck`** сохраняет совместимость с оркестратором.
- При превышении порога: **новый `designSeed`**, engineer refine; в лог добавлено **`template_similarity_v41`** с разбивкой.

**Тест:** `src/lib/template-detector.test.ts`.

## Этап 3 — React export

**Файлы:** `src/lib/export-site.ts` (`exportReactZip`), `src/components/builder/Canvas.tsx`, `src/routes/index.tsx`.

- ZIP со всеми путями из карты файлов (`generateReactProject` / `exportReactProject`).
- Кнопка **«React проект»** рядом с ZIP.

## Этап 4 — Sandbox preview (§15)

**Файл:** `src/components/builder/Canvas.tsx`.

- Превью через **`iframe`** + **`sandbox="allow-scripts allow-forms"`** + `referrerPolicy="no-referrer"`.
- Контент: **`siteSchemaToHtml(site)`** (единый путь для SiteSchema), fallback на накопленный HTML.
- В сгенерированной разметке **нет `eval`**; скрипт только для якорной навигации в статическом экспорте.

## Этап 5 — Metrics (§13)

**Файлы:** `src/lib/session-metrics.ts`, `src/lib/orchestrator.ts`, `src/components/builder/WhyPanel.tsx`.

- Поля: **`toolCalls`** (дублирует `toolCallsCompleted` при finalize), **`realQaPassCount`**, **`realQaPassRate`** (= pass / `realQaRuns` при finalize).
- Усилен учёт успешного Real QA прогона в цикле качества.
- WhyPanel показывает success, partial regen, avg tool Q, Real QA pass %.

## Этап 6 — Instruction layer

Новые документы:

- `docs/AGENT_BEHAVIOR_SPEC.md`
- `docs/TOOL_USAGE_POLICY.md`
- `docs/HITL_FLOW.md`

Краткая техническая запись в **`docs/IMPLEMENTATION_LOG.md`** и этот файл.

## Риски / ограничения

- Lighthouse / ESLint Real QA по-прежнему требуют Node-сервер (`serverRealQa`); preview **не** заменяет локальный CI.
- Превью в iframe **без** Framer Motion из `SiteMotionPreview` (код компонента сохранён для возможного «богатого» режима позже).
