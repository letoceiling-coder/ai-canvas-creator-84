/**
 * §20.2 Advanced memory — сводка «старых» записей decisionLog для long-term reasoning в промпте.
 */

import type { DecisionLogEntry } from "@/lib/decision-log";

export function shouldSummarizeDecisionLog(length: number, threshold: number): boolean {
  return length > threshold;
}

/** Записи до хвоста (не включая последние keepTail) — кандидаты на LLM-сжатие. */
export function decisionLogHeadForSummary(
  entries: DecisionLogEntry[],
  keepTail: number,
): DecisionLogEntry[] {
  if (entries.length <= keepTail) return [];
  return entries.slice(0, entries.length - keepTail);
}

/** Fallback без LLM (для тестов / оффлайн). */
export function heuristicLongTermSummary(entries: DecisionLogEntry[]): string {
  return entries
    .map((e) => `[${e.agent}] ${e.summary}${e.detail ? ` — ${e.detail.slice(0, 120)}` : ""}`)
    .join("\n")
    .slice(0, 6000);
}

export function buildLongTermSummaryPromptBatch(
  entries: DecisionLogEntry[],
  previousSummary: string | undefined,
  maxChars: number,
): { system: string; user: string } {
  const lines = entries
    .map((e) => `- (${e.agent}) ${e.summary}${e.detail ? ` | ${e.detail}` : ""}`)
    .join("\n")
    .slice(0, maxChars);
  const prev = (previousSummary ?? "").trim().slice(0, 4000);
  return {
    system:
      "Сожми записи решений пайплайна в краткий текст на русском: 5–12 bullet, факты и решения, без воды. Если есть ПРЕДЫДУЩАЯ_СВОДКА — объедини, убери дубликаты.",
    user: `ПРЕДЫДУЩАЯ_СВОДКА:\n${prev || "(нет)"}\n\nЗАПИСИ:\n${lines || "(пусто)"}`,
  };
}
