# Tool Usage Policy (SSOT v4.1)

Политика описывает **когда** дергать Tool Layer, **когда нельзя**, и **fallback**. Реализация: `src/lib/tools/tool-layer.ts`, обёртка для LLM: `src/lib/orchestrator-tools.ts`, конфиг каналов: `src/lib/tools/tool-policy.ts`.

## Контракт

- Вход: `ToolRequest` (`tool`, `query`, `agent`, `intent`, `traceId`, `sessionEpoch?`).
- Выход: `ToolRunResult` = `ToolResponse` + `ToolFeedback` (useful, quality).
- Кэш: ключ `buildToolCacheKey`, TTL по типу (`DEFAULT_TOOL_TTL_MS`).
- Аудит: оркестратор создаёт `ToolInvocationRecord` через `createToolInvocationRecord`.

## Когда вызывать

| Канал | Типичный сценарий |
|-------|-------------------|
| `search` | Planner examples, UI hints, data facts, critic market. |
| `context` | Engineer: фрагменты документации (React/Tailwind и т.д.). |
| `ui` | Architect: паттерны интерфейса. |
| `image` | Engineer: визуальные референсы (Unsplash stub). |
| `data` | Planner + QA: обще-UX/факты в мягком режиме. |

Вызов **только** через `getToolContextIfEnabled` с политикой `ToolChannelPolicy` (включено/выключено по типу).

## Когда запрещено

- Канал выключен в конфиге → `getToolContextIfEnabled` возвращает пустой пакет, в лог `channel_skipped`.
- **Circuit breaker** открыл канал (после серии неуспешных runTool) → `runTool` вернёт `circuit-open`, в decisionLog `circuit_block` / `circuit_breaker_open`.
- Адаптивные пропуски (например engineer без внешних tools при высоком качестве) — явная запись в decisionLog (`adaptive_skip_*`).

## §1.15 Retry и fallback (реализовано в `runTool`)

После промаха кэша одна **сессия вызова** выполняет:

1. **Повтор** того же запроса через live-путь (`tryLiveProvider`).
2. Тот же live-путь с **`simplifyToolQuery`** (укороченный запрос).
3. **`callProviderFallbackOnly`** — только локальные/fake провайдеры.

События логируются через `onToolHardening` → `pushDecision(..., "tool", "tool_retry", ...)`.

### Circuit breaker

- Счётчик **неуспешных завершений runTool** по типу канала (после исчерпания трёх шагов выше).
- Если подряд **> 3** неуспехов → канал **заморожен на 30s**; запись `circuit_breaker_open`.
- Успешный ответ с ненулевым полезным телом → сброс счётчика.

## Fallback правила

- Live-доступ (Tavily / Context7) не обязан быть настроен: `callProvider` уже подставляет fake там, где нужно; шаг 3 гарантирует ответ без внешней сети.
- Пустой или `failed` ответ после ранжирования считается провалом для метрик lifecycle.

## Тестирование / сброс

- `resetToolLayerCacheForTests`, `resetToolCircuitBreakersForTests` — только тесты.
