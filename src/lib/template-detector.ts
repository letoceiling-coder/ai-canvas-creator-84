/**
 * §20.9 — detector «шаблонности»: структура секций, паттерн раскладки, повторяемость + текстовые клише.
 */

import type { SiteSchema } from "@/lib/site-schema";

export type TemplateSimilarityResult = {
  score: number;
  suspicious: boolean;
  /** Детализация для decisionLog (коротко). */
  breakdown?: {
    structure: number;
    layoutPattern: number;
    repetition: number;
    cliché: number;
  };
};

/** Порог «подозрительно шаблонно» (0–1). */
export const TEMPLATE_SIMILARITY_THRESHOLD = 0.58;

const CANONICAL_LANDING = ["hero", "features", "pricing", "cta", "footer"] as const;

const CLICHÉS = [
  "lorem ipsum",
  "transform your business",
  "boost your sales",
  "инновационн",
  "лучшее решение",
  "skyrocket",
  "game-changer",
  "cutting-edge",
];

/** §20.9 — основная метрика похожести на типовой «AI landing». */
export function calculateTemplateSimilarity(draft: SiteSchema): TemplateSimilarityResult {
  const blocks = [...draft.pages, ...draft.sections, ...draft.components];
  const types = blocks.map((b) => b.type);

  // --- Структура: близость порядка типов к каноническому шаблону
  let structureScore = 0;
  if (types.length >= 3) {
    let canonIdx = 0;
    let matched = 0;
    for (const t of types) {
      while (canonIdx < CANONICAL_LANDING.length && CANONICAL_LANDING[canonIdx] !== t) {
        canonIdx++;
      }
      if (canonIdx < CANONICAL_LANDING.length && CANONICAL_LANDING[canonIdx] === t) {
        matched++;
        canonIdx++;
      }
    }
    const coverage = matched / CANONICAL_LANDING.length;
    const tailOk = types.includes("footer") && types.includes("hero");
    structureScore = Math.min(1, coverage * 0.85 + (tailOk ? 0.15 : 0));
  }

  // --- Паттерн раскладки: чередование «одиночных» секций без вариативности
  const typeSet = new Set(types);
  const uniqueRatio = types.length ? typeSet.size / types.length : 1;
  const layoutPatternScore = uniqueRatio > 0.6 ? 0.15 : 0.35 + (0.6 - uniqueRatio) * 0.9;

  // --- Повторяемость блоков (один тип много раз подряд / частые дубликаты)
  let maxRun = 1;
  let run = 1;
  for (let i = 1; i < types.length; i++) {
    if (types[i] === types[i - 1]) {
      run++;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 1;
    }
  }
  const counts = new Map<string, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  const dupPenalty = [...counts.values()].filter((n) => n >= 2).length * 0.08;
  const repetitionScore = Math.min(1, (maxRun >= 3 ? 0.35 : 0) + dupPenalty + (types.length > 8 ? 0.12 : 0));

  // --- Текстовые клише
  const raw = JSON.stringify(draft).toLowerCase();
  let clichéHits = 0;
  for (const c of CLICHÉS) {
    if (raw.includes(c)) clichéHits++;
  }
  const clichéScore = Math.min(1, clichéHits * 0.22);

  const score = Math.min(
    1,
    0.32 * structureScore +
      0.22 * layoutPatternScore +
      0.28 * repetitionScore +
      0.18 * clichéScore,
  );

  const breakdown = {
    structure: structureScore,
    layoutPattern: layoutPatternScore,
    repetition: repetitionScore,
    cliché: clichéScore,
  };

  return {
    score,
    suspicious: score >= TEMPLATE_SIMILARITY_THRESHOLD,
    breakdown,
  };
}

/** Совместимость с пайплайном: `suspicious` → принудительный refine + designSeed (см. orchestrator). */
export function templateSimilarityCheck(draft: SiteSchema): TemplateSimilarityResult {
  return calculateTemplateSimilarity(draft);
}
