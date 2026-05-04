# Журнал реализации AI Website Builder по SSOT v4.1

**Назначение:** зафиксировать *что именно* уже воплощено в репозитории `demo-generator-site`, с привязкой к разделам **`docs/AI_WEBSITE_BUILDER_MASTER_PLAN.md`**, путям файлов, тестам и ограничениям.  
**Принцип:** идём **по порядку плана**; пункты ниже отражают состояние на момент последнего обновления журнала; то, что помечено «не реализовано», — **явный бэклог**, а не пропуск без учёта.

**Проверки в CI/локально:** `npx tsc --noEmit`, `npm run build`, `npm test` (Vitest).

### История обновлений этого файла

| Дата (контекст) | Изменения |
|-----------------|-----------|
| 2026-05-04 (продуктовый слой) | Файловые проекты (`project-store`, CRUD API, UI). Image: OpenAI + placeholder. Data: `dataTool`, `dataGaps` в аудите и WhyPanel. Deploy UX + self-host poll + история. Style DNA из панели (`initialStyleDNA`). **§8** переписан: deploy и персистентность не бэклог. |
| 2026-05-04 (синхронизация журнала) | Выровнены §1 фаза 0–1, §1.15, §3, §6–8 с фактическим кодом: `userEdits` / `codeRef` / `sessionMetrics`, `prompt-registry.ts`, поток `llm_token` в UI, tool hardening §1.15. **Бэклог продукта** сведён к трём направлениям: медиа/данные, deploy, персистентность — без расширения пайплайна. |
| 2026-05-04 (SSOT v4.1 production) | **§1.15:** `tool-layer.ts` — политика вызова: повтор того же запроса → `simplifyToolQuery` → `callProviderFallbackOnly`; circuit breaker при >3 подряд неуспешных **runTool** (по каналу), пауза 30s, лог `circuit_breaker_open` / `circuit_block` / `tool_retry` в `decisionLog` через `pushToolHardening` в `orchestrator.ts`. **§20.9:** `calculateTemplateSimilarity` + порог `TEMPLATE_SIMILARITY_THRESHOLD`, запись `template_similarity_v41`. **§15:** превью в `Canvas.tsx` — `iframe` + `sandbox="allow-scripts allow-forms"`, `siteSchemaToHtml`. **Продукт:** `exportReactZip`, кнопка «React проект». **§13:** `SessionMetrics.toolCalls`, `realQaPassCount` / `realQaPassRate`, финализация в `finalizeSessionMetrics`. **Документация:** `docs/AGENT_BEHAVIOR_SPEC.md`, `TOOL_USAGE_POLICY.md`, `HITL_FLOW.md`, `SSOT_V41_IMPLEMENTATION.md`. Тест: `template-detector.test.ts`. |
| 2026-05-04 (multi-HITL) | **§9:** три чекпоинта — `confirm_plan` (style lock), `confirm_architecture` (JSON + reorder plan sections), `review_draft` (preview, structural score, `regenerate_section` через `regenerateSection`, `refine_all`, `change_style`). **`hitlGate`**, `defaultHitlAction`. **§20.8:** семантика — до `semanticRefineMaxAttempts` повторных вызовов engineer; **template** — новый seed + обязательный re-engineer. Конфиг: `semanticRefineMaxAttempts`. UI: `routes/index.tsx`. |
| 2026-05-04 (HITL + metrics) | **§9 HITL:** `enableHITL`, событие `await_user` / `hitl` в `PipelineEvent`, пауза после planner через `onHitl: Promise<HITLAction>`; `applyHitlAction` + составные действия в `hitl.ts`; UI в `routes/index.tsx` (редактирование плана + Style DNA). **§13:** `SessionMetrics.errors[]`, запись при падении `runPipeline`; WhyPanel показывает список ошибок. **§20.2:** антидребезг сводки `decisionLog` ослаблен (3 новых записи вместо 8). Тесты: `hitl.test.ts`. |
| 2026-05-04 (вечер) | **§20.7 context isolation:** `src/lib/agent-memory-view.ts` — `buildCompressedAgentView`, `formatAgentMemoryBlock`; все user-пейлоады LLM (intent, planner, architect, engineer, critic, reviewer, selfCorrect) опираются на изолированный view + tool-блоки. **§20.2 memory compression:** хвост `decisionLog`, лимит длины `userIntent`, усечение JSON `architecture`, краткая сводка последних `toolInvocations`; конфиг в `PipelineConfig` / `MemoryAndQualityConfig`. **Adaptive tools:** пропуск context+image на Engineer при `designLoopIndex>0`, `toolInvocations>=adaptiveToolMinInvocations`, `previousAggregateQuality>=adaptiveToolMinAggregateQuality`. **Aggregate quality (§20.4):** `aggregatePipelineQualityScore` = взвешенная сумма critic avg, QA score, performance; пишется в `decisionLog` и `PipelineEvent.detail`. Тесты: `agent-memory-view.test.ts`. |
| 2026-05-04 | Первичное заполнение: фазы §17, §1–§2.4 детализация, §16 цепочка, env, тесты, бэклог; синхронизация с кодом после внедрения TTL по tool, `ToolChannelPolicy`, `toolAwareSystemAppendix`, расширение `ToolInvocationRecord`, `applyUsedInFinalFromArtifact`. |

---

## 1. Сводка: фазы §17 (внедрение)

### Фаза 0 — Основа (§17)

| Требование SSOT | Статус | Где в коде / примечание |
|-----------------|--------|-------------------------|
| Backend + прокси LLM | **Частично** | `src/lib/ollama-openai.ts` — вызовы chat completions с fallback модели |
| `projectMemory` v1 | **Да (сессия + JSON store)** | `ProjectMemory` в рантайме; сохранение `siteSchema`+`prompt` — `project-store.ts`, `/api/projects`. Мультиарендный SaaS/БД — вне scope |
| Model router | **Да** | `MODEL_ROUTER`, `PipelineConfig.fallbackModel` в `orchestrator.ts` |
| Prompt versioning | **Да (реестр)** | `src/lib/prompt-registry.ts` (`PROMPT_REGISTRY`, `getPromptVersionsFlat`); агрегат версий в `sessionMetrics.promptVersions` |
| Intent classifier | **Да** | `classifyIntent` — LLM + zod `intentSchema`; user = `formatAgentMemoryBlock("intent")` |
| Чат + этапы + streaming | **Частично** | `PipelineEvent` / `onEvent`; **`tool_start` / `tool_end`**; поток **`llm_token`** из `runPipeline` → UI (`routes/index.tsx`, статус-строка). Отдельный HTTP **EventSource** endpoint — не обязателен; при интеграции внешних клиентов — по необходимости |
| decisionLog | **Да** | `DecisionLogEntry[]` (`decision-log.ts`): agent, summary, detail?, createdAt — **§3** |
| memoryCompression, context isolation | **Да (минимально)** | `src/lib/agent-memory-view.ts` + поля `memoryCompression*` / `qualityScoreWeights` / adaptive в `PipelineConfig` — см. **§4.1** журнала |
| Tool Layer v0+ | **Да** | См. §2 ниже — несколько каналов, кэш, ranking, server-only ключи |

### Фаза 1 — Pipeline (§17)

| Требование | Статус | Примечание |
|------------|--------|------------|
| Planner / Architect / Engineer | **Да** | `orchestrator.ts`; выход Engineer — `SiteSchema` JSON |
| Style DNA + designSeed | **Да** | `styleDNAFromControlPanel` → `initialStyleDNA` в `runPipeline`; после HITL плана `styleLocked`; `designSeed` после плана |
| validateDesignSystem | **Да** | После architect: `validateDesignSystem` + один retry `architectRepairDesignSystem` (§7) |
| Planner+search, Architect+ui, Engineer+context+image | **Да** | Через `getToolContextIfEnabled` + инжект в user/system |
| Data tool в Planner/QA | **Да** | Tavily/search fallback из `tool-layer` для `data` |
| Ranking + feedback + кэш | **Да** | `tool-layer.ts` |
| TTL по типу кэша §1.13 | **Да** | `DEFAULT_TOOL_TTL_MS` (search/ui/data 1h, image 30m, context 4h) |
| Failover MCP §1.15 | **Да (v4.1)** | `tool-layer.ts`: повтор live → `simplifyToolQuery` → `callProviderFallbackOnly`; circuit breaker по каналу; см. §1.15 в журнале и строку истории «SSOT v4.1 production» |
| Compose §1.16 | **Да (базово)** | `runComposedToolsChain`; запись **`compose`** с `childInvocationIds` после planner; пример `runComposedTools(search→ui)` |
| JSON retry / self-correct | **Да** | `jsonRepairAttempts`, `selfCorrectSiteJson` |
| Design loop + qualityScore | **Да** | Critic + structural QA; порог `qualityThreshold` |
| parallel QA ∥ Critic | **Да** | `parallelQaAndCritic` |

### Фазы 2–4 (§17)

**Частично / базово:** HITL, UI, метрики — см. историю. **§15** превью — да. **Deploy:** Vercel (`/api/deploy`) и self-host hook (`/api/deploy/self-host`) — см. §8. **Lighthouse:** опционально (`enableRealQaArtifact`).

---

## 2. Детализация по §1 Tool Layer (v4 / v4.1)

### 1.1–1.4 Контракт, каналы

- **Типы каналов:** `context` | `search` | `ui` | `image` | `data` — `src/lib/tools/tool-layer.ts`.
- **Единый ответ:** `summary`, `items[]`, `metadata` (provider, tokens, fromCache, failed, traceId).
- **Инжект в LLM:** только после **rank + top-K** и отдельный потолок **`MAX_TOOL_TOKENS`** (1500) — `src/lib/orchestrator-tools.ts`.

### 1.11 Feedback

- **`ToolFeedback`:** `useful`, `quality` (0 / 40 / 70 / 90 эвристика по числу items), опционально `usedInFinal` на уровне объекта feedback (обновление — `withUsedInFinal`).
- После каждого завершённого `getToolContext` в `toolInvocations[]` пишутся агрегированные поля (см. §3 журнала = §2.4 SSOT).

### 1.12 Ranking

- **`rankItems`:** relevance (подстрока нормализованного query), freshness (timestamp), trust (`official` в source) — `tool-layer.ts`.
- **Top-K:** по умолчанию 5 в `runTool`; для оркестратора **8** (`TOOL_CONTEXT_TOP_K`).

### 1.13 Кэш

- **Ключ:** `buildToolCacheKey` — нормализованный query + agent + intent + tool; экспортируется для аудита.
- **TTL:** `DEFAULT_TOOL_TTL_MS` по типу tool; override через `runTool(..., { ttl })`.
- **Инвалидация:** `sessionEpoch` в ключе; `bumpSessionToolEpoch` + `clearToolLayerCache`; при мульти-турне смена брифа — вызывать bump вручную.

### 1.14 Tool-aware prompts

- **`src/lib/prompt-tool-aware.ts`:** `toolAwareSystemAppendix(policy)` версии `PROMPT_TOOL_AWARE_VERSION = v1.0`.
- В системный промпт добавлено для: **Planner, Architect, Engineer, Critic** — `orchestrator.ts`.

### 1.15 Failover (production)

- **Tavily / Context7 / fake:** как раньше — `tool-server-fns.ts`, таймаут Context7 **5 s**.
- **Последовательность hardening:** (1) первый live-вызов, (2) повтор того же запроса, (3) `simplifyToolQuery`, (4) `callProviderFallbackOnly` — без лишних дублей в одном `runTool`.
- **Circuit breaker:** после **>3** подряд неуспешных завершений `runTool` для канала — пауза **30 s**, события в decisionLog (`pushToolHardening` в `orchestrator.ts`).
- **Пустой провайдер / ошибка:** `metadata.failed`, опционально `circuitBlocked` в жизненном цикле tool.

### 1.16 Composition

- **`runComposedToolsChain`** — линейная цепочка шагов с `dependsOn` (id).
- **`runComposedTools(intent, traceId, sessionEpoch?, opts?)`** — search → ui.
- **Planner:** после параллельных search+data создаётся запись **`channel: "compose"`** (`createComposeToolInvocationRecord`) с id дочерних вызовов.

---

## 3. §2 Project Memory и §2.4 toolInvocations

### Реализовано

- **`toolInvocations?: ToolInvocationRecord[]`** на `ProjectMemory`.
- Опционально **`constraints?: string[]`**, **`chatHistory?: {role, content}[]`** — участвуют в view (constraints в planner; chat — усечённый хвост в `formatAgentMemoryBlock` при наличии).
- Запись при каждом вызове **`getToolContext` / `getToolContextIfEnabled`** с полями:
  - `cacheKey`, `normalizedQuery`, `channel`, `agent`, `cacheHit`, `rankedItemCount`, `injectTokens`, `injectDigest`, `dataGaps` (канал `data`, stub), `feedbackUseful`, `feedbackQuality`, `traceId`, `provider`, `createdAt`.
- **Compose (§1.16):** `channel: "compose"`, опционально **`childInvocationIds`** — родительская запись после planner.
- **`decisionLog: DecisionLogEntry[]`** (`agent`, `summary`, `detail?`, `createdAt`) — см. `decision-log.ts`.
- **`userEdits[]`**, **`codeRef`** — запись при HITL / финализации (см. `ProjectMemory` в `orchestrator.ts`).
- **`sessionMetrics`** — `src/lib/session-metrics.ts`; финализация в `runPipeline`.
- **`applyUsedInFinalFromArtifact`** — эвристика §2.4: совпадение начала `injectDigest` с финальным `rawSiteJson`; вызывается в конце `runPipeline` и после `regenerateSection`.

### Не реализовано (по SSOT / продукт)

- Отдельное хранилище «сырого архива» chunk’ов.
- Постфактум **usedInFinal** по id chunk ↔ секция сайта (сейчас только эвристика substring).

---

## 4. §16 Оркестратор (цепочка и tools)

Реализованная цепочка:

1. **Intent** → `memory.intentType`
2. **Planner** → `getToolContextIfEnabled(search + data)` → LLM план
3. **designSeed**
4. **Architect** → `ui` tool → LLM архитектура → **`validateDesignSystem`** (и при необходимости **`architectRepairDesignSystem`**)
5. **Loop:** **Engineer** → `context` + `image` → LLM Site JSON → parse → **Critic** (search market) + **QA** (structural + data tool) → quality gate
6. **Reviewer** (опционально)
7. **finalize:** `applyUsedInFinalFromArtifact`

**Политика каналов §20.11:** `ToolChannelPolicy` в `src/lib/tools/tool-policy.ts`, влит в **`PipelineConfig`** (`enableToolSearch`, `enableToolContext`, …); при `false` — пустой контекст и запись в `decisionLog` через `onSkipped`.

### 4.1 §20.7 Context isolation + §20.2 Memory compression

**Модуль:** `src/lib/agent-memory-view.ts` (без импорта `orchestrator.ts`, без циклов).

| Агент | Во view (сжато) | Сознательно исключено |
|--------|-----------------|----------------------|
| **intent** | `userIntent` | plan, architecture |
| **planner** | intent, styleDNA, constraints, хвост decisionLog, краткий аудит tool | полный plan/arch |
| **architect** | как planner + **plan** | architecture |
| **engineer** | designSeed, architecture (JSON ≤ лимита), planSummary, логи, аудит | дублирование сырого брифа вне view |
| **critic** | intent, styleDNA, planSummary, логи, аудит | SITE/MARKET передаются отдельно |
| **reviewer** | userIntent, логи, аудит | — |

**Конфиг компрессии** в `PipelineConfig`: `memoryCompressionDecisionLogTail`, `memoryCompressionMaxUserIntentChars`, `memoryCompressionMaxArchitectureJsonChars`, `memoryCompressionToolInvocationsTail`.

**Adaptive (Engineer):** при повторной итерации design loop, если уже ≥ `adaptiveToolMinInvocations` и прошлый `aggregateQuality` ≥ `adaptiveToolMinAggregateQuality` — пропуск context+image (`enableAdaptiveToolCalling`).

**Aggregate score:** веса `qualityScoreWeights` — в `decisionLog` и в `PipelineEvent` для `quality_gate`.

**Тесты:** `src/lib/agent-memory-view.test.ts`.

---

## 5. Провайдеры и окружение

| Переменная | Назначение |
|------------|------------|
| `TAVILY_API_KEY` | Web search / ui / data live |
| `CONTEXT7_API_KEY` | Прямой API Context7 (приоритет) |
| `CONTEXT7_PROXY_URL` | Fallback POST `/resolve` |
| `CONTEXT7_PROXY_API_KEY` | Опционально Bearer для своего прокси |

Шаблон: `.env.example`. Секреты не коммитятся (`.gitignore`: `.env`, `.env.local`).

**Context7:** парсинг ответа вынесен в **`src/lib/tools/context7-adapters.ts`** (тестируемо).

---

## 6. Тесты (Vitest)

| Файл | Покрытие |
|------|----------|
| `src/lib/tools/context7-adapters.test.ts` | guessLibraryName, context7JsonToToolItems |
| `src/lib/design-system-validate.test.ts` | §7 контраст / spacing / typography |
| `src/lib/tools/tool-layer.test.ts` | + `buildToolCacheKey` + sessionEpoch, clearToolLayerCache |
| `src/lib/tools/tool-invocations.test.ts` | createToolInvocationRecord, applyUsedInFinalFromArtifact |
| `src/lib/tools/tool-policy.test.ts` | isToolChannelEnabled |
| `src/lib/orchestrator-tools.test.ts` | бюджет токенов, onInvocation/cacheKey, отключение канала |
| `src/lib/agent-memory-view.test.ts` | §20.7/§20.2 view, aggregate, adaptive |
| `src/lib/hitl.test.ts` | HITL-действия и составные патчи |
| `src/lib/template-detector.test.ts` | сравнение `calculateTemplateSimilarity` (шаблон vs минимальный сайт) |
| `src/lib/component-rules.test.ts` | `componentRulesQA`, `combinedStaticSiteQa` (структура секций / QA) |

Скрипты: `"test": "vitest run"`, `"test:watch": "vitest"`.

---

## 7. Файлы ядра (быстрый указатель)

| Файл | Роль |
|------|------|
| `src/lib/orchestrator.ts` | Pipeline, ProjectMemory, агенты |
| `src/lib/orchestrator-tools.ts` | `getToolContext`, `getToolContextIfEnabled` |
| `src/lib/tools/tool-layer.ts` | runTool, кэш, ranking, TTL |
| `src/lib/tools/tool-server-fns.ts` | Tavily, Context7, OpenAI Images |
| `src/lib/tools/tool-invocations.ts` | Аудит + usedInFinal; поле `dataGaps` |
| `src/lib/tools/tool-policy.ts` | Флаги каналов §20.11 |
| `src/lib/tools/context7-adapters.ts` | Чистые функции API Context7 |
| `src/lib/agent-memory-view.ts` | §20.7 view + §20.2 компрессия + adaptive + aggregate score |
| `src/lib/decision-log.ts` | §3 структурированный decisionLog |
| `src/lib/design-system-validate.ts` | §7 проверка designSystem после architect |
| `src/lib/prompt-registry.ts` | §20.5 версии промптов по ролям |
| `src/lib/session-metrics.ts` | §13 метрики сессии |
| `src/lib/template-detector.ts` | §20.9 похожесть на шаблон |
| `src/lib/export-site.ts` | Экспорт ZIP и React-проекта |
| `src/lib/project-store.ts` | JSON-проекты на диске; API `/api/projects` |
| `src/routes/api/projects.ts`, `projects.$projectId.ts` | CRUD проектов |
| `src/lib/style-dna-from-ui.ts` | Style DNA из панели до HITL |
| `src/lib/site-image-fill.ts` | Детерминированные placeholder + merge в schema |
| `src/routes/api/deploy.ts` | Деплой Vercel |
| `src/routes/api/deploy.self-host.ts`, `deploy.self-host.status.ts` | Прокси к локальному deploy hook |

---

## 8. Продукт: медиа, данные, деплой, проекты

Минимальный слой поверх ядра (orchestrator не переписывался):

| Область | Поведение | Код / API |
|---------|-----------|-----------|
| Image | OpenAI `/v1/images/generations` при `OPENAI_API_KEY`; иначе детерминированный `placehold.co` | `tool-server-fns.ts` (`serverToolImage`), `tool-layer.ts`, `site-image-fill.ts` |
| Data | Tavily при ключе; иначе stub + `metadata.dataGaps` → `toolInvocations.dataGaps`, UI WhyPanel | `tool-layer.ts`, `dataTool()`, `orchestrator-tools.ts` |
| Deploy Vercel | Экспорт React bundle → REST Vercel | `api/deploy.ts`, UI |
| Deploy self-host | POST к внешнему hook + poll status | `api/deploy.self-host.ts`, `deploy.self-host.status.ts` |
| Проекты | JSON на диск (`PROJECT_STORE_DIR` или `data/projects`) | `project-store.ts`, `/api/projects`, UI колонки |
| Deploy UX | Статусы running/success/failed, история в `localStorage`, «Повторить Vercel» | `Canvas.tsx`, `index.tsx` |

**Ограничения:** `project-store` требует Node FS на сервере. Self-host — только при настроенном hook и `DEPLOY_HOOK_SECRET`.

---

## 9. Дальнейший бэклог (вторично)

- Углубление **§20.2** при длинных персистентных сессиях; **Adaptive** для других агентов по метрикам; **SSE** для внешних клиентов — по необходимости.

При изменениях: обновлять этот журнал; вехи — §21 Master Plan.

---

*Журнал ведётся параллельно SSOT; противоречия с кодом разрешаются в пользу **фактического поведения репозитория**, с отметкой «расхождение / техдолг».*
