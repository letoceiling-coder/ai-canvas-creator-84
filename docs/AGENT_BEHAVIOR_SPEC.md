# Agent Behavior Specification (SSOT v4.1)

Документ задаёт **поведенческий контракт** агентов пайплайна. Код реализации живёт в `src/lib/orchestrator.ts`, промпты и view памяти — в `agent-memory-view`, `ai-prompt`, `prompt-registry`.

## Роли

| Агент | Назначение |
|-------|------------|
| **intent** | Классификация `userIntent` → `intentType` (landing, saas, …). |
| **planner** | План страниц/секций/целей; опционально tools (search, data). |
| **architect** | Layout, components, designSystem; UI tool context. |
| **engineer** | Выход: валидный `SiteSchema` JSON; context/image tools в рамках политики. |
| **critic** | Качество черновика, findings + qualityScore. |
| **qa** | Структурная + component rules + data tool; не заменяет Real QA на TSX. |
| **reviewer** | Финальный polish JSON при включённом флаге. |

## Строгие правила

1. **Формат артефакта:** engineer / reviewer возвращают **сырой JSON**, без markdown-обёртки; парсинг через `parseAiSiteJson` + zod `SiteSchema`.
2. **Изоляция контекста:** в промпты попадает только **сжатый agent-memory-view** для текущего агента (`formatAgentMemoryBlock`), не весь decisionLog целиком.
3. **Идемпотентность брифа:** смена смысла брифа в сессии → `bumpSessionToolEpoch` + сброс tool cache (§1.13).
4. **Качество:** semantic gate (§20.8), template similarity (§20.9), quality gate (critic + QA + Real QA при `enableRealQaArtifact`).
5. **Логирование:** любое ветвление политики (skip tool, adaptive, HITL, real_qa_block, circuit breaker) → **decisionLog** с кратким `summary` и усечённым `detail`.

## Запреты

- Выдавать **исполняемый JS** в пользовательский HTML/экспорт вне контролируемых шаблонов (`site-render`, `export-site`).
- Подмешивать в user-блок **секреты** или env keys (см. server-only tools).
- Игнорировать **HITL**, если `enableHITL: true` и чекпоинт требует подтверждения.
- Обходить **Tool Layer** прямым HTTP из агентов (все инжекты через `getToolContext` / `runTool`).

## Обязательные действия

- После каждого tool-вызова из оркестратора: **запись** `ToolInvocationRecord` (при наличии callback).
- После финала успешного прогона: `memory.siteSchema`, `rawSiteJson`, `finalizeSessionMetrics`, при необходимости `codeRef`.
- При срабатывании **template_similarity_v41**: новый `designSeed` + engineer refine (уже в оркестраторе).

## Связанные документы

- `docs/TOOL_USAGE_POLICY.md`
- `docs/HITL_FLOW.md`
- `docs/AI_WEBSITE_BUILDER_MASTER_PLAN.md`
