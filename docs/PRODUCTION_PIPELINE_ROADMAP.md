# Production roadmap: AI Website Builder pipeline

Документ фиксирует **план доработки** пайплайна генерации сайтов до production-уровня: стабильный JSON, явные контракты, QA-слои, честный статус результата.  
Связан с текущим кодом: `src/lib/orchestrator.ts`, `pipeline-server-fn.ts`, `planner-normalize.ts`, `site-schema.ts`, `layout-qa`, UI (`index.tsx`).

---

## 1. Цели и контекст

### 1.1 Зачем этот план

- Снизить долю **invalid JSON / invalid schema** после вызовов LLM.
- Убрать **рассинхрон форматов** между этапами (план ≠ финальный сайт).
- Сделать систему **управляемой**: метрики, degraded/failed, без скрытых fallback.
- Улучшить **качество результата**: вёрстка (воздух, типографика), адаптивность, изображения и данные.

### 1.2 Текущий pipeline (упрощённо)

```
User → serverRunPipeline → runPipeline
  → intent
  → planner (+ retry JSON)
  → HITL (опц.) confirm_plan
  → architect (+ retry, при провале — fallback архитектуры)
  → HITL (опц.) confirm_architecture
  → цикл: engineer → parse/normalize/Zod → selfCorrect → QA/critic → …
  → (опц.) reviewer
  → memory.siteSchema / throw
```

### 1.3 Целевой pipeline

```
User
  → Input Cleaner
  → Intent Analyzer      (уже: classifyIntent)
  → Task Decomposer      (новый / слияние с planner)
  → Planner
  → Architect
  → Engineer
  → Layout QA
  → Adaptive QA
  → Content QA
  → Fixer loop
  → Finalizer
```

Ниже каждый шаг расписан так, чтобы по нему можно было вести внедрение **по порядку** с понятным Definition of Done.

---

## 2. Шаг 1: Input Cleaner (стабилизация входа)

### 2.1 Цель

Сделать вход в оркестратор **предсказуемым**: ограничить размер, убрать шум, не «кормить» модель гигантскими промптами (в т.ч. полным `SiteSchema` на каждый полный прогон без необходимости). Это снижает нагрузку на модель и частично предотвращает обрывы и неконсистентный JSON.

### 2.2 Что сделать

1. Ввести модуль **очистки и нормализации** входа до первого LLM-вызова в `runPipeline` (или сразу в `serverRunPipeline`).
2. Разделить режимы:
   - **greenfield** — новый сайт с нуля;
   - **iterate** — правка существующего (не всегда требуется полный JSON сайта в системном контексте; допустимы diff/краткое резюме структуры).
3. При длинной истории чата: политика **сжатия** (эвристика или отдельный короткий вызов) в структурированный бриф с лимитом символов.
4. Логировать размер входа **до/после** cleaner в decisionLog или sessionMetrics.

### 2.3 Файлы (ориентир)

| Действие | Файл / место |
|-----------|----------------|
| Новая логика | `src/lib/pipeline/input-cleaner.ts` (или `src/lib/input-cleaner.ts`) |
| Точка входа API | `src/lib/pipeline-server-fn.ts` |
| Оркестратор | `src/lib/orchestrator.ts` (начало `runPipeline`, подмена `args.prompt`) |
| Клиент | `src/routes/index.tsx`, `src/lib/agent-actions.ts` (`buildChatPipelinePrompt`) |

### 2.4 Вход / выход

**Вход (логический):**

- Массив реплик пользователя (или одна строка).
- Опционально текущий `SiteSchema` (для итераций).

**Выход (контракт, концептуально):**

- `primaryIntent: string` — главная формулировка задачи.
- `constraints: string[]` — явные ограничения из диалога.
- `summaryForAgents: string` — единый текст для агентов с лимитом (например ≤ 8–12k символов, настраивается).
- `mode: "greenfield" | "iterate"`.
- `includeFullSiteJson: boolean` — нужно ли подмешивать полный JSON сайта в промпт (по умолчанию false для iterate при наличии другого механизма правок).

### 2.5 Проверки

- После cleaner: `primaryIntent` не пустой.
- Жёсткий ceiling на `summaryForAgents`; при превышении — усечение + маркер в логе.
- Юнит-тесты: пустой ввод, очень длинный ввод, многострочный бриф.

### 2.6 Definition of Done

- Любой запрос проходит cleaner до intent/planner.
- В метриках видны `inputCharsBefore` / `inputCharsAfter`.
- Нет регрессии на коротких типовых запросах (smoke-тест руками или e2e).

---

## 3. Шаг 2: Planner + Task Decomposer + нормализация плана

### 3.1 Цель

Один **устойчивый контракт** плана и явное разбиение задачи на структуру, согласованную с тем, что потом допускает **Zod** для `SiteSchema` (или через явный маппинг).

### 3.2 Что сделать

1. Закрепить текущую модель памяти: `pages` и `sections` как **`Array<{ type: string }>`**, `goals` как `string[]` (`src/lib/planner-normalize.ts`, `ensurePlannerMemoryPlan`).
2. Ввести **Task Decomposer** (отдельный шаг или объединённый промпт с planner):
   - На выходе: машиночитаемый **TaskSpec** (обязательные секции, тональность, ограничения по страницам).
3. Ввести **таблицу соответствия**: «тип из плана / брифа» → канонический `sectionType` из `site-schema.ts` (hero, features, …). Неканонические типы → `text` или ближайший блок + лог.
4. После любого HITL-патча плана — по-прежнему вызывать единую нормализацию (`ensurePlannerMemoryPlan`).

### 3.3 Файлы

| Действие | Файл |
|----------|------|
| План | `src/lib/planner-normalize.ts`, `src/lib/orchestrator.ts` (`planner`) |
| HITL | `src/lib/hitl.ts` |
| Маппинг типов | новый `src/lib/plan-to-site-type-map.ts` (или конфиг JSON) |
| Схема сайта | `src/lib/site-schema.ts` (enum типов — единый источник для промпта) |

### 3.4 Вход / выход

- **Вход:** результат Input Cleaner + `intentType`.
- **Выход:** `PlannerOutput` + опционально `TaskSpec`; в `ProjectMemory.plan` только нормализованный план.

### 3.5 Проверки

- Zod (или аналог) на сырой JSON ответа planner до записи в память.
- Тест: несовпадение типа из плана с enum → ожидаемое поведие (маппинг или warning, не необработанный ZodError на engineer).

### 3.6 Definition of Done

- В кодовой базе нет ожидания `plan.sections` как `string[]` в памяти.
- Документирован список канонических типов + правила маппинга.

---

## 4. Шаг 3: Architect — JSON-only и прозрачность

### 4.1 Цель

Ответ архитектора **всегда** либо валиден по схеме, либо система явно помечена как **degraded** (без «успешного» молчаливого пустого ящика).

### 4.2 Что сделать

1. Единая функция **извлечения JSON** из ответа модели: обрезка префикса до первого валидного объекта, поддержка markdown fence (один модуль на весь проект).
2. По возможности: **structured output / JSON mode** на уровне провайдера (Ollama/OpenAI-совместимый API) для роли architect.
3. Пересмотреть ветку «два parse fail → fallback»: либо оставить минимальную заглушку с флагом `architectureDegraded: true` в памяти и в финальном результате API, либо ограниченное число попыток с укороченным user-блоком.
4. Строго разделить system prompt: для architect **запрет** любого текста вне JSON (без смешения с «можно резюме» из общего tool-appendix — см. шаг 4 Engineer / приглушение appendix).

### 4.3 Файлы

- `src/lib/orchestrator.ts` — `architect`, `architectRepairDesignSystem`, `safeParseJSON`
- Новый: `src/lib/json-extract.ts` (или рядом с `site-render`)
- `src/lib/ollama-openai.ts` — параметры ответа, если добавляется JSON mode
- `src/lib/prompt-tool-aware.ts` — опционально: не подмешивать «резюме разрешены» в architect

### 4.4 Вход / выход

- **Вход:** `ProjectMemory` с планом + UI tool context.
- **Выход:** `ArchitectOutput` + метаданные (`parseOk`, `retryCount`, `degraded`).

### 4.5 Проверки

- Логирование каждой неудачной попытки парсинга с кратким fingerprint ответа (длина, не полный текст).
- Тесты на ответы с префиксом «Here is…» и с ```json fence.

### 4.6 Definition of Done

- Нет сценария «успешный пайплайн» без записи в лог, что архитектура была fallback/degraded.
- Парсинг architect и engineer использует **один** экстрактор JSON.

---

## 5. Шаг 4: Engineer — стабилизация

### 5.1 Цель

Реже выходить за пределы `SiteSchema` после первого ответа; предсказуемый repair.

### 5.2 Что сделать

1. Пропускать ответ engineer через тот же **json-extract**, что architect.
2. Подмешивать в system **один** список допустимых `type` блоков, сгенерированный из того же источника, что Zod enum (SSOT).
3. Усилить дисциплину: модуль `toolAwareSystemAppendix` для **engineer** не должен давать противоречивых инструкций («краткие резюме допустимы» для JSON-ролей).
4. Сохранить и при необходимости расширить `selfCorrectSiteJson` с передачей **кодов ошибок Zod** (уже есть сообщение об ошибке).

### 5.3 Файлы

- `src/lib/orchestrator.ts` — `engineerSiteJson`, `selfCorrectSiteJson`, `fixerSiteJsonForLayout`
- `src/lib/ai-prompt.ts` — `SITE_JSON_SYSTEM_PROMPT`
- `src/lib/site-schema.ts` — экспорт списка типов для промпта
- `src/lib/site-render.ts` — `parseAiSiteJson`: делегировать в общий json-extract

### 5.4 Вход / выход

- **Вход:** память + docs/image context + repair hints.
- **Выход:** строка → `SiteSchema` после `tryParseSiteSchema` (normalize + Zod).

### 5.5 Проверки

- Метрики: доля первого успешного parse без selfCorrect.
- Лимит размера ответа engineer (защита от обрезанного JSON на стороне провайдера).

### 5.6 Definition of Done

- Доля repair запросов измеряется и не растёт после изменений.
- Регрессионные тесты parse на эталонных ответах.

---

## 6. Шаг 5: Layout QA

### 6.1 Цель

Ловить **наложения, малый межстрочный интервал, слипшиеся секции, подозрительную вёрстку** на уровне схемы/стилей до показа пользователю; выдавать структурированный отчёт для fixer.

### 6.2 Что сделать

1. Расширить правила в `layout-qa` / `component-rules`: пороги spacing, line-height, min размеры шрифта в clamp/rem, эвристики `position: absolute`, переполнение.
2. Каждое замечание: стабильный **id** правила + severity.
3. Порядок исправления: по возможности **детерминированные** мелкие правки в JSON → затем LLM fixer (уже есть задел в orchestrator).

### 6.3 Файлы

- `src/lib/layout-qa.ts`
- `src/lib/component-rules.ts`
- `src/lib/orchestrator.ts` — место вызова QA и fixer

### 6.4 Вход / выход

- **Вход:** `SiteSchema`.
- **Выход:** `LayoutReport`: `{ issues: Array<{ id, severity, message, path? }>, score }`.

### 6.5 Проверки

- Юнит-тесты на синтетических «битых» схемах.
- Набор «хороших» схем не должен давать критичный шум без намерения.

### 6.6 Definition of Done

- Документ со списком правил и порогов.
- Fixer получает только структурированный список issues (не сырой текст).

---

## 7. Шаг 6: Adaptive QA

### 7.1 Цель

Выявлять проблемы **разных ширин экрана**: фиксированные ширины там, где нужен относительный масштаб; переполнения; неадекватные grid/flex в данных блока.

### 7.2 Что сделать

**Фаза A (обязательная в first wave):**

- Эвристики по полям `styles` / типовым паттернам контента в JSON.

**Фаза B (опционально, флагом):**

- Генерация HTML через существующий `site-render` и прогон headless (Playwright) на 2–3 viewport: проверка overflow, ширин.

### 7.3 Файлы

- Новый: `src/lib/adaptive-qa.ts`
- `src/lib/site-render.ts` (HTML для фазы B)

### 7.4 Вход / выход

- **Вход:** `SiteSchema` + список breakpoints (конфиг).
- **Выход:** `AdaptiveReport` с severity.

### 7.5 Проверки

- Тест-кейсы на известных anti-паттернах.

### 7.6 Definition of Done

- Фаза A включена в основной pipeline.
- Фаза B за `cfg.enableHeadlessAdaptiveQa` (или аналог).

---

## 8. Шаг 7: Content QA (изображения и данные)

### 8.1 Цель

- Битые или недоступные **imageUrl**.
- Выдуманные домены (политика allowlist).
- **Данные:** пустые features, дублирующиеся CTA, явные противоречия theme/контента.

### 8.2 Что сделать

1. Асинхронные HEAD/GET с таймаутом и кэшем по URL в рамках одного run.
2. Замена или флаг warning для непройденных URL (согласовать с `mergeAutoImages`).
3. Отчёт с кодами для fixer (только изображения / только тексты).

### 8.3 Файлы

- Новый: `src/lib/content-qa.ts`
- Возможное расширение `src/lib/semantic-validation.ts`, `src/lib/real-qa-server.ts`
- `src/lib/site-image-fill.ts` при смене политики плейсхOlderов

### 8.4 Вход / выход

- **Вход:** `SiteSchema` + фрагмент брифа (опционально).
- **Выход:** `ContentReport`.

### 8.5 Проверки

- Не блокировать run при сетевом фейле: retry → warning.
- Моки HTTP в тестах.

### 8.6 Definition of Done

- Все внешние URL в секциях проверены или помечены; таймауты не «висят» бесконечно.

---

## 9. Шаг 8: Fixer loop (единая оркестрация)

### 9.1 Цель

Один цикл: **агрегация** замечаний Layout + Adaptive + Content + статических правил → приоритизация → вызов LLM fixer (с лимитом итераций) → повторная валидация и parse.

### 9.2 Что сделать

1. Модуль **агрегации** отчётов: дедупликация по id правила + пути в схеме.
2. Политика останова: нет `high` severity ИЛИ достигнут `maxFixerIterations` ИЛИ score выше порога.
3. Опционально: откат к лучшей версии по агрегированному score, если новая хуже.

### 9.3 Файлы

- `src/lib/orchestrator.ts` — консолидация вызовов
- Новый: `src/lib/pipeline/qa-aggregator.ts` (опционально)

### 9.4 Вход / выход

- **Вход:** `SiteSchema` + массив отчётов QA.
- **Выход:** новый `SiteSchema` + журнал итераций в `sessionMetrics` / `decisionLog`.

### 9.5 Проверки

- После каждой итерации fixer — полный `tryParseSiteSchema`.
- Не вызывать fixer, если только low severity и aggregate quality уже высокий (конфиг).

### 9.6 Definition of Done

- В метриках видны `fixerIterations`, причины останова.
- Поведение воспроизводимо при тем же входе (детерминизм кроме LLM).

---

## 10. Шаг 9: Finalizer + контракт API

### 10.1 Цель

Один **финальный результат** для UI и мониторинга: успех / degraded / failed, список предупреждений, без смешения emergency fallback с «идеальным» прогоном.

### 10.2 Что сделать

1. Расширить `ProjectMemory` или обёртку ответа: `runStatus`, `warnings[]`, `degradedSteps[]` (architect, engineer, server fallback, …).
2. Изменить **`serverRunPipeline`**: при emergency fallback после catch — возвращать **`ok: true` + `status: "degraded"`** (или `ok: false` с типом ошибки — продуктовое решение; главное — **различимо** клиентом).
3. В `index.tsx` отображать предупреждения пользователю (баннер / строка статуса).

### 10.3 Файлы

- `src/lib/orchestrator.ts` — конец `runPipeline`
- `src/lib/pipeline-server-fn.ts`
- Типы для клиента (экспорт из server fn или общий тип-пакет)
- `src/routes/index.tsx`

### 10.4 Вход / выход

- **Вход:** заполненная `ProjectMemory`.
- **Выход API:** например `{ ok, status, memory, warnings }`.

### 10.5 Проверки

- Контрактные тесты на форму ответа.
- Алёрты в проде по доле `degraded`.

### 10.6 Definition of Done

- Продукт и аналитика могут отличить «настоящий» успех от fallback.

---

## 11. Сводная таблица контрактов данных

| Этап | Структура |
|------|-----------|
| После Input Cleaner | Структурированный объект брифа (поля см. шаг 1) |
| Planner / память | `PlannerOutput`: `pages: { type }[]`, `sections: { type }[]`, `goals: string[]` |
| Architect | `ArchitectOutput`: объекты + массивы (желательно со временем сузить типы) |
| Engineer | `SiteSchema`: `pages` / `sections` / `components` как **массивы объектов-блоков** |
| Блок сайта | `type`, `content` (record), `styles`, `animations`, опц. `animation` |
| QA | Отдельные отчёты, не смешивать с `SiteSchema` |
| Строковые массивы | `goals`, `images`, findings, порядок типов для HITL UI (`planSections`) |

**Правило:** не использовать `string[]` как формат **секций плана** в памяти после нормализации — только `{ type }[]`.

---

## 12. Риски и меры

| Риск | Мера |
|------|------|
| JSON с префиксом / обрезан | Общий json-extract, structured output |
| Неизвестный `type` блока | Маппинг с плана + fallback `text` + лог |
| Слишком большой промпт | Input cleaner, режим iterate |
| Architect fallback | Флаг degraded + метрики |
| Content QA зависает | Таймаут, retry, кэш, downgrade до warning |
| Fixer портит сайт | Сохранение лучшей версии по score, лимит итераций |
| Скрытый fallback в API | Явный `status` в ответе |

---

## 13. Приоритеты

### MUST HAVE (первый релиз production-hardening)

1. Input cleaner + лимиты контекста  
2. Общий json-extract + structured output там, где возможно  
3. Согласование типов план ↔ `site-schema` (маппинг / SSOT enum в промпте)  
4. Честный статус результата (ok / degraded / failed)  
5. Layout QA + единый fixer loop с агрегацией  

### SHOULD HAVE

6. Adaptive QA фаза A; фаза B за флагом  
7. Content QA (URL, данные)  
8. Явный Task Decomposer (структура задачи до planner)  

### LATER

9. Строгая типизация ArchitectOutput  
10. Мультивариантная генерация и offline-выбор лучшего  
11. Отдельный «лёгкий» режим правок без полного pipeline  

---

## 14. Что не делать

- **Не** вводить третий формат «sections» в памяти.  
- **Не** откатывать план к `string[]` дляslots.  
- **Не** удалять Zod-валидацию без замены.  
- **Не** заменять весь pipeline одним mega-prompt.  
- **Не** скрывать `generateFallbackSiteSchema` и ошибки за безусловным `ok: true` без поля статуса.  
- **Сохранять** рабочий рендер (`site-render`), HITL UX, `decisionLog` / `sessionMetrics` — только расширять.

---

## 15. Порядок внедрения (рекомендуемый)

1. **Json-extract + честный API status** — быстрый выигрыш в наблюдаемости.  
2. **Input cleaner** — снижение нагрузки на модели.  
3. **Маппинг типов план ↔ site-schema** — меньше Zod error.  
4. **Architect degraded flag + engineer дисциплина промптов**.  
5. **Layout QA расширение + агрегация fixer**.  
6. **Adaptive A → Content QA → Adaptive B**.  
7. **Finalizer полировка типов ответа и UI**.

Этот документ можно использовать как **единый backlog**: каждый шаг имеет DoD; после закрытия шага обновлять раздел «текущее состояние» (опционально внизу файла changelog-ом по датам).

---

## 16. Усовершенствование pipeline до уровня production-SaaS

Расширение шагов 1–9 продвинутыми практиками. Каждый блок добавляется **поверх** базового roadmap и не противоречит ему.

### 16.1 Constrained decoding (гарантированный JSON)

**Проблема:** LLM может вернуть префикс/комментарий/обрезанный JSON.

**Решение, по приоритету:**

1. **JSON Schema mode провайдера** — для OpenAI / OpenAI-compatible Ollama (`response_format: { type: "json_schema", schema: <ZodToJsonSchema(siteSchema)> }`).
2. **Function calling / tools API** — модель обязана вернуть аргументы инструмента, не текст.
3. **Грамматики GBNF** (llama.cpp / Ollama новых версий) — генерация ограничена по контекст-свободной грамматике, выводя только валидный JSON.
4. **Локальный constrained decoder**: библиотеки `outlines`, `lm-format-enforcer`, `jsonformer` (если перейти на serverless inference).
5. **Резерв — жёсткий json-extract**: общий модуль для всего проекта (см. шаг 3.4.1 ниже).

**Что внедрить:**

- В `src/lib/ollama-openai.ts` — параметр `responseFormat` для роли (planner/architect/engineer/critic).
- Сгенерировать **JSON Schema** автоматически из Zod через `zod-to-json-schema` и кэшировать.
- Fallback цепочка: `json_schema` → `json_object` → `text + extract`.

### 16.2 Multi-model strategy

**Проблема:** одна модель = bottleneck качества и стоимости.

**Решение:**

| Роль | Размер | Назначение |
|------|--------|------------|
| **router/intent** | small (3–7B) | классификация, decompose |
| **planner** | medium | структура без креатива |
| **architect** | medium / json-mode | строгий JSON |
| **engineer** | large/instruction-tuned | финальный SiteSchema |
| **critic** | medium | оценка по rubric |
| **fixer** | medium | таргетные правки по issues |

**Что внедрить:**

- Расширить `MODEL_ROUTER` в orchestrator с поддержкой нескольких backend (Ollama / OpenAI / Together / Groq / Fireworks).
- Конфигурируемая стратегия per-role в `PipelineConfig`.
- **Speculative decoding** через draft-модель (Groq/vLLM): ×2–3 ускорение engineer.

### 16.3 Streaming + progressive rendering

**Проблема:** пользователь ждёт 30–60 сек чёрный экран.

**Решение:**

1. **SSE-streaming** уже частично есть (`onLlmToken`); нужно показывать частичный JSON в превью.
2. **Partial JSON parser**: `partial-json` (npm) или `best-effort-json-parser` — парсит незавершённый JSON и рендерит секции по мере поступления.
3. **Skeleton-режим**: после plan/architect — показать структуру (placeholder-секции), наполнять по мере engineer.

**Что внедрить:**

- Новый модуль `src/lib/partial-site-stream.ts`.
- В `index.tsx` — Canvas рендерит частично заполненный `SiteSchema`.

### 16.4 Caching layer

**Проблема:** одни и те же intents → одни и те же вызовы LLM → деньги и время.

**Уровни кэша:**

1. **Prompt cache** — анти-эпохальный (по `sessionGenerationEpoch`); ключ: `model + role + sha256(systemPrompt + userBlock)`.
2. **Tool cache** — уже есть (`tool-layer`); расширить TTL и шарингом между сессиями.
3. **Plan cache** — по нормализованному `primaryIntent + intentType`.
4. **Asset cache** — изображения (Pexels/Unsplash/OpenAI) с persistent-ключом.

**Хранилище:**

- Локально: SQLite (`better-sqlite3`) или `lmdb`.
- В облаке: Upstash Redis / Cloudflare KV / R2.
- Embeddings: pgvector / Qdrant / Chroma.

### 16.5 Semantic memory + RAG для UI patterns

**Проблема:** "ui patterns" сейчас как plain-text injection; нет персонализации под типы сайтов.

**Решение:**

1. **Vector store** с эталонными секциями по доменам (SaaS, e-com, портфолио).
2. Перед architect — top-K релевантных паттернов через embeddings (`@xenova/transformers` локально или OpenAI embeddings).
3. **Few-shot examples** подбираются динамически, не хардкодятся.

**Инструменты:** Qdrant (Docker) / Chroma (in-process) / pgvector / Supabase Vector.

### 16.6 Eval-driven development (offline quality)

**Проблема:** нельзя ответить «стало ли лучше после правки промпта?»

**Решение:**

1. **Golden dataset** — 30–100 эталонных брифов с разметкой ожидаемых секций / DNA.
2. **Eval harness** — прогон pipeline в CI, считает: schema-validity rate, structural-similarity (sections cover-set), critic-score, layout-QA score.
3. **LLM-as-judge** — отдельная модель оценивает результат по rubric (UX, читаемость, ИИ-фичи).
4. **Snapshot regression** — `vitest` snapshot of `siteSchema` для стабильных брифов.

**Инструменты:**

- **Promptfoo** (`promptfoo eval`) — простой YAML-based eval с CI-интеграцией.
- **Langfuse** — observability + dataset + experiments.
- **Inspect AI** (anthropic) или **OpenAI Evals**.
- **Braintrust** — managed eval платформа.

### 16.7 Observability & tracing

**Проблема:** в проде сложно понять, на каком этапе и какой модели сломалось.

**Решение:**

1. **OpenTelemetry traces** для каждого LLM-вызова: span на agent + tool + parse + retry.
2. **Langfuse** / **Helicone** / **Phoenix (Arize)** — drop-in observability для LLM-цепочек.
3. **Метрики Prometheus**: `llm_tokens_total{role}`, `pipeline_duration_seconds`, `schema_autofix_total`, `degraded_runs_total`.
4. **Sampling**: 100% degraded/failed, 5–10% успешных.

**Что внедрить:**

- Обёртка над `callAgent` — экспорт спанов.
- Dashboard в Grafana / Langfuse Cloud.

### 16.8 Cost & latency budget per agent

**Проблема:** один тяжёлый прогон может стоить дорого; нет SLO.

**Решение:**

| Стадия | Бюджет |
|--------|--------|
| intent | ≤ 1s, ≤ 200 tokens out |
| planner | ≤ 3s, ≤ 800 tokens |
| architect | ≤ 5s, ≤ 1500 tokens |
| engineer | ≤ 15s, ≤ 6000 tokens |
| critic | ≤ 4s, ≤ 600 tokens |
| fixer (per iter) | ≤ 10s |

- **Hard timeout** на каждый вызов (`AbortController`).
- **Token budget guard**: считать токены до отправки (`gpt-tokenizer` / `tiktoken`), при превышении — обрезать `summaryForAgents`.
- Метрика `tokens_per_run`, ценовая (если облачный backend).

### 16.9 Self-consistency / best-of-N

**Проблема:** один прогон engineer бывает «средним».

**Решение:**

1. **N=2–3 параллельных engineer** (разные seeds), critic выбирает лучший.
2. Только для **первой** итерации (cost-эффективно).
3. Альтернатива: **tree-of-thoughts lite** — engineer возвращает 2 варианта, critic ранжирует.

**Что внедрить:**

- В `runPipeline` опция `cfg.engineerVariants: number`.
- Селектор: max по `aggregatePipelineQualityScore`.

### 16.10 Headless rendering & visual QA

**Расширение шага 6 (Adaptive QA):**

1. **Playwright** запускает локальный HTML на 3 viewport (375 / 768 / 1440).
2. Сбор сигналов:
   - `scrollWidth > clientWidth` — горизонтальный overflow → high.
   - элементы за viewport (off-screen) — medium.
   - color contrast через `axe-core` — high (a11y).
   - `getBoundingClientRect()` пересечения соседних блоков.
3. **Скриншоты** → `pixelmatch` / `looks-same` для регрессии.
4. **Visual diff** в CI: каждый PR — сравнение с baseline.

**Инструменты:**

- `playwright`, `@axe-core/playwright`, `pixelmatch`, `pa11y`, `lighthouse` (уже есть в devDeps).
- Альтернатива тяжёлому Playwright: `puppeteer-core` + `@sparticuz/chromium` (serverless).

### 16.11 Image pipeline (Content QA + генерация)

**Проблема:** битые URL, generic-стоки, несоответствие тематике.

**Решение:**

1. **Источники по приоритету:**
   - Cached generated (OpenAI Images / Stable Diffusion XL / Flux).
   - Pexels / Unsplash API (по ключевым словам из брифа).
   - Placeholder с детерминированным seed (`placehold.co`, `picsum.photos?seed=...`).
2. **Validation:** HEAD + Content-Type + размеры (max width/height); CDN-перепаковка через `sharp` или `@imgproxy/imgproxy-node`.
3. **Image-to-text** (CLIP/BLIP) — проверка соответствия тегу секции.

**Инструменты:** `sharp`, `pexels`, `unsplash-js`, OpenAI `images.generate`, `@huggingface/inference`.

### 16.12 Security & abuse prevention

**Проблема:** prod-SaaS с LLM — это атаки, prompt injection и spam.

**Решение:**

| Угроза | Меры |
|--------|------|
| Prompt injection через user input | Sanitize в Input Cleaner: запрет «ignore previous instructions», экранирование при вставке в systemprompt, отдельные роли user/system в API |
| Малвар-URL в imageUrl | Allowlist доменов в Content QA |
| Abuse / DDoS | Rate-limit (`@upstash/ratelimit`, Redis), per-user quota |
| Sensitive content | Moderation API (OpenAI Moderation / Llama Guard / NeMo Guardrails) |
| Утечка секретов в логах | Redact в decisionLog (RegExp на ключи API, токены) |
| Server-side request forgery (Content QA) | Запрет приватных IP-диапазонов при HEAD-проверке |

### 16.13 Determinism & reproducibility

**Что нужно:** одинаковый бриф ⇒ одинаковый сайт (для тестов и поддержки).

- Хранить `seed` в `DesignSeed` (уже есть) и пробрасывать в model `temperature: 0` для критичных ролей (architect/engineer на финальной итерации).
- Записывать `promptHash + modelVersion + seed` → можно reproduce.
- **Replay endpoint**: загружать `ProjectMemory.decisionLog` и проигрывать prompts.

### 16.14 HITL extended modes

Поверх существующих чекпоинтов:

1. **Inline edits** в превью: клик на блок → переписать только его (partial regen уже есть — расширить UX).
2. **Compare mode**: показывать 2 варианта рядом (best-of-N) и выбрать.
3. **History/undo**: версии `SiteSchema` в IndexedDB / server-side; rollback.
4. **Voice input** (Whisper / WebSpeech) — длинные брифы голосом.

### 16.15 Deployment hardening

**Сейчас:** есть self-hosted VPS deploy ([`docs/DEPLOY_SELF_HOSTED_VPS.md`](docs/DEPLOY_SELF_HOSTED_VPS.md)).

**Доработки:**

- **Health checks**: `/api/health` с проверкой Ollama, DB, vector store.
- **Graceful shutdown**: дождаться текущих pipeline runs.
- **Queue** для пайплайнов: BullMQ (Redis) — не блокировать HTTP-запрос на 30+ сек.
- **WebSocket / SSE** для прогресса.
- **Multi-tenancy**: per-org изоляция, отдельные ключи моделей.
- **Backup**: проекты, vector store, prompt-history.

### 16.16 CI/CD upgrades

| Гейт | Инструмент |
|------|------------|
| typecheck | `tsc --noEmit` |
| lint | `eslint` (есть) |
| unit | `vitest run` (есть) |
| eval | `promptfoo` или собственный harness — на golden dataset |
| visual regression | Playwright + pixelmatch |
| schema validity rate | собственный скрипт `scripts/eval-pipeline.mjs` |
| dependency audit | `npm audit`, `snyk` |
| supply chain | `socket.dev` GitHub App |

**Структура:** workflow `quality.yml` блокирует merge при падении eval-метрик ниже baseline.

---

## 17. Рекомендуемые инструменты (полный список)

### 17.1 LLM inference

| Инструмент | Когда использовать |
|------------|--------------------|
| **Ollama** (есть) | локальная разработка, on-prem |
| **vLLM** | self-host прод с throughput-нагрузкой |
| **llama.cpp / llamafile** | edge / минимальный footprint |
| **Groq** | ультранизкая latency для critic/fixer |
| **Together AI / Fireworks AI** | дешёвые open-weight модели в облаке |
| **OpenAI / Anthropic** | top-quality engineer/critic роли |
| **OpenRouter** | универсальный прокси с роутингом |

### 17.2 Constrained / structured output

| Инструмент | Назначение |
|------------|-----------|
| **zod-to-json-schema** | конверт Zod → JSON Schema для `response_format` |
| **Outlines** (Python) | grammar-based декодинг |
| **lm-format-enforcer** | то же для HF/vLLM |
| **GBNF (Ollama)** | грамматики на уровне сервера inference |
| **TypeChat** (Microsoft) | TS-first structured output |
| **Instructor JS** | retry + parse + validate JSON через Zod |

**Рекомендация для проекта:** добавить `zod-to-json-schema` + `instructor-js` как обёртку над текущим `callChatCompletionsWithFallback`.

### 17.3 Orchestration / agent frameworks

| Инструмент | Когда |
|------------|-------|
| **LangGraph (JS)** | если переходить на граф агентов с явными edges и retry-политиками |
| **Mastra** | TS-first agent framework, хорошо ложится на TanStack Start |
| **Inngest** | durable workflows + event-driven, отлично для долгих pipeline |
| **Temporal.io** | для тяжёлых SLA-orchestration (overkill сейчас) |
| **VoltAgent** | TS observability-first agent framework |

**Рекомендация:** **Inngest** для durable runs (если выйдете в SaaS) — даст retry, replay, dashboard «из коробки» поверх текущего `runPipeline`.

### 17.4 Observability / tracing для LLM

| Инструмент | Особенности |
|------------|-------------|
| **Langfuse** (open-source + cloud) | traces, prompt management, eval, datasets — лучший баланс |
| **Helicone** | прокси-based, proxy для OpenAI-совместимых |
| **Arize Phoenix** | open-source, on-prem |
| **LangSmith** | если LangChain-стек |
| **Braintrust** | eval-первый |
| **OpenLLMetry** (Traceloop) | OpenTelemetry-native |

**Рекомендация:** **Langfuse self-hosted** + OpenTelemetry traces.

### 17.5 Eval / quality

| Инструмент | Особенности |
|------------|-------------|
| **Promptfoo** | YAML eval, CI-friendly, локально |
| **OpenAI Evals** | стандартный harness |
| **DeepEval** | Python, но богатые метрики |
| **Inspect AI** | от Anthropic |
| **G-Eval / RAGAS** | если будет RAG |

**Рекомендация:** **Promptfoo** для CI — минимальный порог входа.

### 17.6 Vector store / RAG

| Инструмент | Когда |
|------------|-------|
| **Qdrant** (Docker) | прод on-prem, отличная производительность |
| **Chroma** (in-process) | разработка / mvp |
| **pgvector** | если уже есть Postgres |
| **Supabase Vector** | если на Supabase стеке |
| **Weaviate** | hybrid search (keyword + vector) |
| **LanceDB** | embedded, как SQLite для embeddings |

**Embeddings:**

- Локально: `@xenova/transformers` (BGE / GTE) — без сети.
- Облако: OpenAI `text-embedding-3-small`, Voyage AI, Cohere.

### 17.7 Caching / queue / storage

| Инструмент | Назначение |
|------------|-----------|
| **Upstash Redis** | serverless cache + ratelimit |
| **better-sqlite3 / LMDB** | локальный cache |
| **Cloudflare KV / R2** | если деплой на CF (есть `@cloudflare/vite-plugin`) |
| **BullMQ / Inngest** | очередь pipeline-runs |
| **DragonflyDB** | redis-compatible drop-in |

### 17.8 Browser automation / visual QA

| Инструмент | Особенности |
|------------|-------------|
| **Playwright** | best-in-class, multi-browser |
| **Puppeteer-core + @sparticuz/chromium** | serverless |
| **@axe-core/playwright** | a11y |
| **pa11y** | a11y CLI |
| **lighthouse** (есть) | perf/seo/a11y/best-practices |
| **pixelmatch / looks-same** | image diff |
| **chromatic.com** | managed visual regression (если есть Storybook) |

### 17.9 Image generation / processing

| Инструмент | Назначение |
|------------|-----------|
| **OpenAI Images (gpt-image-1)** | генерация |
| **Replicate** | hosted SDXL / Flux |
| **fal.ai** | быстрая генерация |
| **Pexels / Unsplash API** | стоки |
| **sharp** | server-side image processing |
| **imgproxy** | on-the-fly resize/convert |
| **Cloudflare Images** | если на CF |

### 17.10 Security

| Инструмент | Назначение |
|------------|-----------|
| **@upstash/ratelimit** | rate-limit |
| **Llama Guard 3** / **NeMo Guardrails** | content moderation |
| **OpenAI Moderation API** | дешёвая модерация |
| **dompurify** (если render HTML user-input) | XSS |
| **helmet** (если express/fastify) | заголовки |
| **zod** (есть) | валидация ввода API |

### 17.11 Frontend UX upgrades

| Инструмент | Назначение |
|------------|-----------|
| **react-error-boundary** | graceful UI при ошибках |
| **TanStack Query** (есть) | кэш + retry |
| **vaul** (есть), **sonner** (есть), **cmdk** (есть) | UX |
| **react-hot-toast / sonner** | уведомления о degraded |
| **partial-json** | прогрессивный рендер JSON |
| **react-virtual / virtua** | если списки секций большие |

### 17.12 DevX / репозиторий

| Инструмент | Назначение |
|------------|-----------|
| **Biome** | замена ESLint+Prettier (быстрее) — опционально |
| **Knip** | поиск мёртвого кода |
| **dependency-cruiser** | архитектурные правила (запрет циклических импортов) |
| **changesets** | версии и changelog |
| **husky + lint-staged** | pre-commit |
| **commitlint** | conventional commits |

---

## 18. Production-grade pipeline (целевая схема v2)

```
                      ┌──────────────────────────────────┐
User → Input Cleaner →│  Token budget + sanitization     │
                      └────────────┬─────────────────────┘
                                   │
                          Intent (small model, json_schema)
                                   │
                          Task Decomposer (TaskSpec)
                                   │
                          Planner (medium, json_schema, retry)
                                   │
                          [HITL confirm_plan]
                                   │
                          Architect (medium, json_schema, retry)
                                   │
                  RAG: top-K ui-patterns by intentType (vector store)
                                   │
                          [HITL confirm_architecture]
                                   │
              ┌────────────────────┴─────────────────────┐
              │  Engineer N=1..3 variants (parallel)     │
              │  json_schema + Zod parse + selfCorrect   │
              └────────────────────┬─────────────────────┘
                                   │
                       Critic ranks → best variant
                                   │
              ┌────────────────────┴─────────────────────┐
              │  QA aggregator:                          │
              │  Layout QA + Adaptive A + Content QA +   │
              │  Adaptive B (Playwright headless)        │
              └────────────────────┬─────────────────────┘
                                   │
                       Fixer loop (deterministic → LLM)
                                   │
                       Reviewer polish (опц., low temp)
                                   │
                       Finalizer: status / warnings / metrics
                                   │
              ┌────────────────────┴─────────────────────┐
              │  Streaming preview / SSE → UI            │
              │  Trace → Langfuse                        │
              │  Cache → Redis                            │
              │  Eval (CI) → Promptfoo                    │
              └──────────────────────────────────────────┘
```

---

## 19. Ключевые ROI-улучшения (что даёт максимальный эффект)

Ранжировано по соотношению **усилие / выигрыш качества**:

| # | Улучшение | Усилие | Выигрыш |
|---|-----------|--------|---------|
| 1 | JSON Schema mode для architect/engineer | низкое | очень высокий (стабильность) |
| 2 | Общий json-extract + честный API status | низкое | высокий (наблюдаемость) |
| 3 | Input cleaner + token budget | среднее | высокий (стабильность + cost) |
| 4 | Promptfoo eval в CI на 30 брифов | среднее | высокий (regression-защита) |
| 5 | Langfuse traces | среднее | высокий (debug в проде) |
| 6 | Best-of-N engineer (N=2) | среднее | средне-высокий (качество) |
| 7 | Playwright Adaptive QA | высокое | высокий (вёрстка) |
| 8 | RAG ui-patterns | высокое | средний (стиль) |
| 9 | Image generation pipeline | высокое | средний (визуал) |
| 10 | Multi-model routing | среднее | средний (cost/speed) |

**Рекомендуемый порядок первой волны:** 1 → 2 → 3 → 4 → 5. После этого — измеримая база, далее остальное.

---

## 20. Минимальный production-MVP (4–6 недель)

**Неделя 1:** json-extract + JSON Schema mode (architect, engineer); честный API status; Input cleaner.

**Неделя 2:** Маппинг типов план↔site-schema; Langfuse self-host + traces; token budget + timeouts.

**Неделя 3:** Promptfoo + golden dataset 30 брифов; вынос critic в JSON-mode; degraded flag в UI.

**Неделя 4:** Layout QA расширение; Fixer loop с агрегацией; deterministic режим (seed + temp=0).

**Неделя 5:** Adaptive QA фаза A; Content QA (URL validation); cache (Redis/SQLite).

**Неделя 6:** Best-of-N engineer (N=2); Adaptive QA фаза B (Playwright за флагом); CI quality gate.

После 6-й недели — система готова к ограниченному beta-релизу с измеримыми SLO.

---

## 21. Changelog документа (заполнять вручную)

| Дата | Изменение |
|------|-----------|
| 2026-05-04 | Первая версия roadmap (шаги 1–15) |
| 2026-05-05 | Расширение: §16 advanced practices, §17 tools, §18 целевая схема v2, §19 ROI, §20 6-week MVP |
| 2026-05-05 | **JSON Stability Layer** реализован: `src/lib/json-extract.ts` (extractJsonFromText + safeParseJson + JSON_OUTPUT_CRITICAL_RULES); все LLM-роли (intent/planner/architect/engineer/critic/fixer) переведены на safe parser; fallbacks для planner/architect/engineer; decisionLog коды `json_parse_failed`/`json_repair_attempt`/`json_fallback_used`; 24 unit-теста на extractor; build + 80 тестов зелёные. |
