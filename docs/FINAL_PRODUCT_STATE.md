# Фактическое состояние продукта AI Website Builder

**Дата среза:** 2026-05-04. Источник истины — код в `demo-generator-site`; этот документ не заменяет SSOT, а описывает **что реально развёрнуто**.

## Архитектура (кратко)

```
Браузер (Canvas, ControlPanel, HITL-модалка, сохранение проектов)
  → POST/GET API (projects, deploy, deploy/self-host)
  → runPipeline (orchestrator) при AI-генерации: Intent → Planner → HITL → Architect → HITL → Engineer loop → QA/Critic
  → Tool Layer (runTool): context, search, ui, image, data — кэш, ranking, failover §1.15
  → LLM через ollama-openai (fallback моделей)
```

Персистентность **сайта** (сохранённый проект): JSON-файлы на сервере. Персистентность **памяти пайплайна** (`ProjectMemory`, логи, toolInvocations) между перезапусками вкладки: только в рамках одной сессии генерации; после «Сохранить проект» доступны `siteSchema` + `prompt`.

## Реализовано

| Область | Детали |
|---------|--------|
| Генерация сайта | Мультиагентный pipeline, `SiteSchema`, превью в iframe (sandbox) |
| HITL | Три чекпоинта; после подтверждения плана `styleLocked = true` |
| Style DNA | В памяти агентов (view); старт из панели: `initialStyleDNA` + правки в HITL |
| Tools | Tavily search/data/ui, Context7 context, OpenAI images или placeholder |
| Качество | Quality gate, semantic validation, static + optional real QA |
| Экспорт | ZIP, React project (ZIP) |
| Deploy Vercel | `POST /api/deploy`, нужен `VERCEL_TOKEN` |
| Deploy self-host | Прокси к локальному hook; `DEPLOY_HOOK_SECRET`, poll status |
| Deploy UX | Статусы Vercel + self-host, история деплоев в `localStorage`, redeploy Vercel |
| Проекты | `GET/POST /api/projects`, `GET/PUT /api/projects/:id`, UI сохранить/открыть |
| Данные (прозрачность) | Канал `data`: live или stub; `dataGaps` в аудите и WhyPanel |
| Документация SSOT | `AI_WEBSITE_BUILDER_MASTER_PLAN.md`, `IMPLEMENTATION_LOG.md`, отчёт синхронизации |

## Частично / ограничения

| Тема | Что не дотягивает до «полного SaaS» |
|------|-------------------------------------|
| Хранилище проектов | Только файловая система на том же хосте; нет БД, ACL, мультиарендности |
| Deploy self-host | Зависит от формата ответа внешнего hook; polling эвристический (таймаут 120 с) |
| Облако без FS | Если production — Workers без `fs`, API проектов нужно переносить на диск/DB |
| История деплоев | Только в браузере (`localStorage`), не на сервере |
| Регенерация секции | `regenerateSection` использует текущую `memory` (включая `styleDNA`); явного «сброса DNA» нет |

## Не реализовано (в этом репозитории)

- Отдельный MCP-сервер как в диаграмме SSOT §1 (используются HTTP server functions).
- Netlify/другие провайдеры деплоя кроме Vercel + описанного self-host hook.
- Полноценный SaaS-аккаунтинг, биллинг, командные проекты.
- Персистентный **полный** `ProjectMemory` / чат / версии сайта на бэкенде (только снимок `siteSchema` + `prompt`).

## Проверки (локально, 2026-05-04)

- `npm test` (Vitest): 39 тестов, успех.
- `npm run build` (Vite client + SSR): успех; скрипт postbuild может выдать `EPERM` на symlink под Windows — на поведение сборки приложения не влияет.

## Вывод

Продукт пригоден как **внутренний / single-tenant генератор** с экспортом, Vercel/self-host деплоем и сохранением готовых схем в JSON. Для публичного мультитенантного SaaS не хватает слоя данных и IAM.
