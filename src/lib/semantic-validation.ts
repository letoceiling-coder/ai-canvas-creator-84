/**
 * §20.8 Semantic validation (минимальная эвристика до LLM-слоя).
 * Полный semantic check по плану — расширение впереди.
 */

import type { SiteSchema } from "@/lib/site-schema";

export type SemanticCheckResult = {
  matchesIntent: boolean;
  hasCTA: boolean;
  logicalFlow: boolean;
  issues: string[];
  passed: boolean;
};

/** Ключевые слова CTA / интента — грубая эвристика. */
export function semanticCheckSite(draft: SiteSchema, userIntentNorm: string): SemanticCheckResult {
  const issues: string[] = [];
  const hay = JSON.stringify(draft).toLowerCase();
  const intent = userIntentNorm.toLowerCase();

  const hasCTA =
    /(заказать|купить|попробовать|начать|cta|signup|subscribe|demo|записаться|связаться)/i.test(
      hay,
    );
  if (!hasCTA) issues.push("semantic: слабые признаки CTA в JSON");

  const matchesIntent =
    intent.length < 8 ||
    intent.split(/\s+/).some((w) => w.length > 3 && hay.includes(w.slice(0, Math.min(w.length, 12))));

  if (!matchesIntent) issues.push("semantic: черновик слабо отражает формулировки брифа");

  const sections = draft.sections ?? [];
  const types = sections.map((s) => s.type);
  const logicalFlow =
    types.includes("hero") &&
    (types.includes("features") || types.includes("pricing") || types.includes("cta"));

  if (!logicalFlow) issues.push("semantic: нет ожидаемого потока hero → value/цена/cta");

  const passed = issues.length === 0;
  return { matchesIntent, hasCTA, logicalFlow, issues, passed };
}
