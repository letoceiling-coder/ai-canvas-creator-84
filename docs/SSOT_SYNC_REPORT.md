# Отчёт синхронизации SSOT v4.1 ↔ код

**Репозиторий:** `demo-generator-site`  
**Сводка:** ядро pipeline и Tool Layer согласованы с `docs/AI_WEBSITE_BUILDER_MASTER_PLAN.md` в реализуемой части; продуктовый слой (deploy, проекты, image API) добавлен **поверх** SSOT без переписывания оркестратора.

Легенда: **Да** — соответствует по смыслу; **Частично** — есть упрощение или другое имя; **Нет** — в коде отсутствует / иная модель.

## §1 Tool Layer и архитектура

| Требование SSOT | Статус | Факт в коде |
|-----------------|--------|-------------|
| Каналы context / search / ui / image / data | Да | `tool-layer.ts`, `ToolType` |
| Кэш, ключ, TTL, sessionEpoch | Да | `buildToolCacheKey`, `DEFAULT_TOOL_TTL_MS` |
| Ranking, top-K | Да | `rankItems`, `TOOL_CONTEXT_TOP_K` |
| Feedback | Да | `ToolFeedback`, запись в `toolInvocations` |
| Failover §1.15, circuit breaker | Да | `tryLiveProvider`, `callProviderFallbackOnly`, `circuitByTool` |
| Compose §1.16 | Да | `runComposedToolsChain`, compose-запись у planner |
| MCP как на диаграмме SSOT | Нет | Провайдеры через `tool-server-fns` (HTTP), не отдельный MCP-процесс |
| Image: «релевантный визуал», не random stock | Частично | OpenAI по промпту или **детерминированный** `placehold.co` (не random Unsplash) |
| Data: источник обязателен / unknown | Частично | Tavily или stub с `dataGaps`; не отдельная таблица «фактов» в JSON |

## §2 Memory и toolInvocations

| Требование | Статус | Факт |
|------------|--------|------|
| projectMemory в процессе | Да | `ProjectMemory` в `orchestrator.ts` |
| toolInvocations, injectDigest, usedInFinal | Да | `tool-invocations.ts`, эвристика в конце pipeline |
| dataGaps в аудите | Да | `ToolInvocationRecord.dataGaps`, stub metadata |
| Персистентность chunk-архива | Нет | Не делалось |
| Персистентность проекта (сайт) | Частично | Файловый JSON (`project-store.ts`), не полная память агентов |

## §9 HITL

| Требование | Статус | Факт |
|------------|--------|------|
| Несколько чекпоинтов | Да | plan / architecture / review_draft |
| Style lock после плана | Да | `memory.styleLocked = true` после первого plan HITL |
| Регенерация секции | Да | `regenerateSection` сохраняет остальной `memory` |

## §15–§16 Превью и оркестратор

| Требование | Статус | Факт |
|------------|--------|------|
| Sandbox preview | Да | `Canvas.tsx`, `iframe` + sandbox |
| Цепочка агентов §16 | Да | `runPipeline` без изменения общей формы |

## Продукт: deploy и UX

| Требование (из плана / продукт) | Статус | Факт |
|--------------------------------|--------|------|
| Deploy в прод | Да | `/api/deploy` (Vercel), self-host прокси |
| Статус деплоя в UI | Да | running / success / failed в `Canvas` |
| История деплоев | Частично | `localStorage`, не сервер |
| Redeploy | Частично | Кнопка повторяет Vercel; self-host без отдельной «redeploy» кнопки |

## Итог

- **Ядро SSOT v4.1 (агенты, tools, память в сессии, HITL):** в основном **Да**.  
- **Инфраструктура SSOT (MCP, полный archive chunks):** **Нет** / вне scope.  
- **Продуктовые обещания (сайт + деплой + проекты):** **Да** с оговорками FS и self-host hook.

Противоречия разрешаются в пользу **фактического кода**; детали — `docs/IMPLEMENTATION_LOG.md`.
