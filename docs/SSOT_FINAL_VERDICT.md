# SSOT v4.1 — FINAL VERDICT

**Срез:** 2026-05-04. Вердикт опирается на код `demo-generator-site` и документы: `AI_WEBSITE_BUILDER_MASTER_PLAN.md`, `IMPLEMENTATION_LOG.md`, `FINAL_PRODUCT_STATE.md`, `SSOT_SYNC_REPORT.md`.

## Coverage

| Плоскость | Статус | Комментарий |
|-----------|--------|-------------|
| Tool Layer (§1.11–§1.16) | ✔ | Кэш, ranking, feedback, failover, compose; каналы через server functions, не отдельный MCP-процесс |
| Pipeline / orchestrator | ✔ | Intent → Planner → Architect → Engineer loop; design loop; quality / semantic paths |
| HITL (multi-checkpoint) | ✔ | План, архитектура, черновик; `styleLocked` после первого plan HITL |
| Template guard / semantic gate | ✔ | Как в журнале реализации и тестах |
| Deploy (Vercel + self-host) | ✔ | API + UI; история деплоев в браузере (`localStorage`) |
| Preview / export | ✔ | Canvas iframe, ZIP / React export |
| Product layer (персист, SaaS) | **partial** | JSON-проекты: `siteSchema` + `prompt`; полный `ProjectMemory` на диск не сериализуется |
| Data / image «как в идеальном §1» | **partial** | Tavily + stub + `dataGaps`; OpenAI image + placeholder; без отдельной модели «фактов» и QA-проверки фактов |
| SaaS (users, auth, multi-tenant API) | **нет** | Вне текущего scope репозитория |

## Deviations (осознанные)

- **Нет отдельного MCP-сервера** — провайдеры завёрнуты в HTTP server functions (`tool-server-fns.ts`); по смыслу SSOT это тот же внешний контекст, другая форма интеграции.
- **Персистентность проектов — файловая система**, не БД: нет ACL, версионирования на сервере, серверной истории деплоев.
- **`ProjectMemory` в сохранённом проекте** — не полный снимок (`decisionLog`, `toolInvocations`, `userEdits`, полная история сессии).
- **Image channel** — нет отдельного ranking по релевантности к типу секции в продуктовом смысле; есть общий ranking items в Tool Layer и привязка URL к слотам схемы на уровне заполнения (`site-image-fill` / pipeline), но не отдельный «image intelligence» слой как в расширенном прочтении Master Plan.

## Gaps vs «SSOT DONE» / sellable SaaS

| Зона | Что мешает заявить полное закрытие SSOT продукта |
|------|--------------------------------------------------|
| A. Project memory в персисте | Нужен контракт `storedProject.projectMemory` (или эквивалент) для multi-session, «продолжить генерацию», серверного versioning |
| B. Data layer | Структурированные факты с обязательным источником + проверки в QA / reject «мусора» при отсутствии источника |
| C. Image | Явный relevance / привязка к `section.type` и брифу сверх текущего pipeline |
| D. Deploy UX | Серверная история; единый «redeploy» сценарий для self-host (сейчас Vercel redeploy в UI есть) |
| E. SaaS layer | Auth, пользователи, нормальный API-слой под мультипроекты и изоляцию |

## Final status

- **Ядро (pipeline + Tool Layer + HITL + deploy paths):** уровень **production** для внутреннего или single-tenant использования.
- **Продуктовая обвязка под публичный SaaS:** **не закрыта**; текущее состояние честнее описать как «генератор + деплой + черновик персиста», а не полный §2 + §17 Фаза 0 в объёме коммерческого сервиса.

**Итог одной строкой:** система **готова к production в закрытом контуре**; для формулировки **«SSOT продукт полностью закрыт»** и продажи как SaaS остаются обязательные дожимы из раздела «Gaps» выше (прежде всего полный персист `ProjectMemory` и усиление data/image/QA под план).
