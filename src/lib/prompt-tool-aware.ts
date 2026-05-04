/**
 * SSOT §1.14 — фрагменты системного промпта: дисциплина Tool Layer.
 * Версия синхронизуется с `prompt-registry` / `PROMPT_VERSION` при смене текста.
 */

import type { ToolChannelPolicy } from "@/lib/tools/tool-policy";

export const PROMPT_TOOL_AWARE_VERSION = "v1.0";

/** Chat-first продукт: не ожидать отдельных UI-настроек от пользователя. */
export const AGENT_FIRST_PRODUCT_RULES = `[Продукт · chat-first] Пользователь не проходит экраны «шаблон / стиль / тема». Сам определяй структуру, визуальный характер и palette из текста брифа (включая «сделай тёмным», «премиум», «добавь отзывы», «ещё минимализм»). Не проси выбрать пресет или тему в ответе. Давай по делу: для JSON-ролей — только валидный JSON по контракту; краткие резюме допустимы только там, где формат явно текстовый.`

function channelLine(label: string, description: string): string {
  return `- **${label}**: ${description}`;
}

/**
 * Краткий блок для добавления в system-промпт tool-capable агентов.
 */
export function toolAwareSystemAppendix(policy: ToolChannelPolicy): string {
  const parts: string[] = [
    "",
    `### Tool Layer (${PROMPT_TOOL_AWARE_VERSION}, §1.14)`,
    "В этой сессии оркестратор уже подмешал во внешний контекст разрешённые каналы. Дисциплина:",
    "- Полагайся на **отранжированный top-K** в user-блоке; не ожидай полного сырого ответа провайдера.",
    "- Не рассчитывай на данные из **отключённых** каналов (они не попали в контекст).",
    "",
    "Разрешённые каналы:",
  ];

  if (policy.enableToolSearch) {
    parts.push(channelLine("search", "рынок, референсы, формулировки конкурентов."));
  }
  if (policy.enableToolData) {
    parts.push(channelLine("data", "факты и опоры; при сомнениях не выдумывай метрики."));
  }
  if (policy.enableToolUi) {
    parts.push(channelLine("ui", "структурные UI-паттерны, без копипаста чужого кода."));
  }
  if (policy.enableToolContext) {
    parts.push(channelLine("context", "документация и best practices стека."));
  }
  if (policy.enableToolImage) {
    parts.push(channelLine("image", "ссылки/бриф на визуалы; согласуй с секциями."));
  }

  if (
    !policy.enableToolSearch &&
    !policy.enableToolData &&
    !policy.enableToolUi &&
    !policy.enableToolContext &&
    !policy.enableToolImage
  ) {
    parts.push("- *(все внешние каналы отключены конфигом пайплайна)*");
  }

  parts.push(
    "",
    "Не запрашивай у пользователя «ещё поиск», если контекст уже дан в user-сообщении.",
    "",
    AGENT_FIRST_PRODUCT_RULES,
  );

  return parts.join("\n");
}
