/**
 * Layout / structural QA для SiteSchema.
 * Проверяет premium-структуру: header/footer, минимум 5 продающих секций,
 * читаемость (font-size, line-height, padding), запрещённые позиционирования.
 */

import type { SiteSchema, SiteBlock } from "@/lib/site-schema";
import { mergeSiteBlocks } from "@/lib/site-render";

export type LayoutIssueSeverity = "low" | "medium" | "high";

export type LayoutIssue = {
  id: string;
  severity: LayoutIssueSeverity;
  message: string;
  blockType?: string;
};

export type LayoutQAResult = {
  ok: boolean;
  issues: string[];
  /** Структурированные issues (новый API). */
  detailed: LayoutIssue[];
  score: number;
};

const SELLING_TYPES = new Set([
  "hero",
  "features",
  "benefits",
  "testimonials",
  "stats",
  "process",
  "faq",
  "contacts",
  "about",
  "gallery",
  "pricing",
  "cta",
]);

function num(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const px = v.match(/^([\d.]+)\s*px$/i);
    if (px) return parseFloat(px[1]!);
    const n = parseFloat(v);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function fontSizePxApprox(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    if (/rem|em|clamp|var/i.test(v.trim())) return null;
    const px = v.match(/^([\d.]+)\s*px$/i);
    if (px) return parseFloat(px[1]!);
  }
  return null;
}

function arrayLen(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

function blockArrayItems(b: SiteBlock, ...keys: string[]): unknown[] {
  const c = b.content as Record<string, unknown>;
  for (const k of keys) {
    const v = c[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function blockString(b: SiteBlock, ...keys: string[]): string {
  const c = b.content as Record<string, unknown>;
  for (const k of keys) {
    const v = c[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function layoutSchemaQA(site: SiteSchema): LayoutQAResult {
  const detailed: LayoutIssue[] = [];
  const blocks = mergeSiteBlocks(site);

  const types = blocks.map((b) => b.type);
  const sellingCount = types.filter((t) => SELLING_TYPES.has(t)).length;

  if (!types.includes("header")) {
    detailed.push({
      id: "structure_no_header",
      severity: "high",
      message: "Отсутствует header — добавь sticky-навигацию (логотип + меню + CTA).",
    });
  }
  if (!types.includes("footer")) {
    detailed.push({
      id: "structure_no_footer",
      severity: "high",
      message: "Отсутствует footer — добавь подвал с колонками и копирайтом.",
    });
  }
  if (!types.includes("hero")) {
    detailed.push({
      id: "structure_no_hero",
      severity: "high",
      message: "Отсутствует hero — добавь главный экран с заголовком и CTA.",
    });
  }
  if (!types.includes("cta")) {
    detailed.push({
      id: "structure_no_cta",
      severity: "medium",
      message: "Нет финального CTA-блока перед футером.",
    });
  }
  if (sellingCount < 5) {
    detailed.push({
      id: "structure_few_sections",
      severity: "high",
      message: `Слишком мало продающих секций (${sellingCount}/5). Минимум 5: hero/features/benefits/testimonials/stats/process/pricing/contacts/cta.`,
    });
  }

  let absoluteCount = 0;
  for (const b of blocks) {
    const st = (b.styles ?? {}) as Record<string, unknown>;

    const fs = fontSizePxApprox(st.fontSize ?? st["font-size"]);
    if (fs != null && fs > 0 && fs < 16) {
      detailed.push({
        id: "fontsize_too_small",
        severity: "medium",
        message: `${b.type}: мелкий шрифт (font-size ${fs}px, минимум 16px).`,
        blockType: b.type,
      });
    }

    const lh = num(st.lineHeight ?? st["line-height"]);
    if (lh != null && lh > 0 && lh < 1.3) {
      detailed.push({
        id: "lineheight_tight",
        severity: "medium",
        message: `${b.type}: плотный межстрочный интервал (line-height ${lh}, минимум 1.3).`,
        blockType: b.type,
      });
    }

    for (const k of [
      "padding",
      "paddingTop",
      "paddingBottom",
      "margin",
      "marginTop",
      "gap",
    ] as const) {
      const n = num(st[k]);
      if (n != null && n > 0 && n < 16) {
        detailed.push({
          id: "spacing_tight",
          severity: "medium",
          message: `${b.type}: мало воздуха (${k}≈${n}px, минимум 16px).`,
          blockType: b.type,
        });
      }
    }

    const pos = String(st.position ?? "").toLowerCase();
    if (pos === "absolute" || pos === "fixed") {
      absoluteCount += 1;
      detailed.push({
        id: "position_absolute",
        severity: "high",
        message: `${b.type}: position:${pos} запрещён в premium-вёрстке (риск наложений).`,
        blockType: b.type,
      });
    }

    if (b.type === "hero") {
      const headline = blockString(b, "headline", "title", "heading");
      if (headline.length > 0 && headline.length < 6) {
        detailed.push({
          id: "hero_headline_short",
          severity: "medium",
          message: "Hero: слишком короткий headline (минимум 6 символов).",
          blockType: "hero",
        });
      }
      if (headline.length > 140) {
        detailed.push({
          id: "hero_headline_long",
          severity: "medium",
          message: "Hero: headline слишком длинный (>140 симв) — может ломать вёрстку.",
          blockType: "hero",
        });
      }
    }

    if (b.type === "features") {
      const items = blockArrayItems(b, "items", "features");
      if (items.length < 3) {
        detailed.push({
          id: "features_few_items",
          severity: "high",
          message: `Features: только ${items.length} элемент(ов), нужно минимум 3.`,
          blockType: "features",
        });
      }
    }

    if (b.type === "benefits") {
      const items = blockArrayItems(b, "items", "bullets", "points");
      if (items.length === 0 && !blockString(b, "lead", "description")) {
        detailed.push({
          id: "benefits_empty",
          severity: "high",
          message: "Benefits: пусто (нужны items[] или lead).",
          blockType: "benefits",
        });
      }
    }

    if (b.type === "testimonials") {
      const items = blockArrayItems(b, "items", "testimonials", "quotes", "reviews");
      if (items.length < 2) {
        detailed.push({
          id: "testimonials_few",
          severity: "medium",
          message: `Testimonials: только ${items.length}, минимум 2.`,
          blockType: "testimonials",
        });
      }
    }

    if (b.type === "stats") {
      const items = blockArrayItems(b, "items", "stats", "metrics");
      if (items.length < 3) {
        detailed.push({
          id: "stats_few",
          severity: "medium",
          message: `Stats: только ${items.length}, минимум 3.`,
          blockType: "stats",
        });
      }
    }

    if (b.type === "footer") {
      const cols = blockArrayItems(b, "columns");
      if (cols.length < 2) {
        detailed.push({
          id: "footer_few_columns",
          severity: "medium",
          message: `Footer: ${cols.length} колонок (рекомендуется ≥3 — Продукт / Компания / Контакты).`,
          blockType: "footer",
        });
      }
      if (!blockString(b, "brand", "name") || !blockString(b, "copyright")) {
        detailed.push({
          id: "footer_missing_brand_copyright",
          severity: "low",
          message: "Footer: отсутствует brand или copyright.",
          blockType: "footer",
        });
      }
    }

    if (b.type === "header") {
      const nav = blockArrayItems(b, "nav", "links", "menu");
      if (nav.length < 3) {
        detailed.push({
          id: "header_few_nav",
          severity: "low",
          message: `Header: только ${nav.length} пунктов меню (рекомендуется 4–6).`,
          blockType: "header",
        });
      }
    }
  }

  if (blocks.length > 30) {
    detailed.push({
      id: "structure_too_many",
      severity: "medium",
      message: `Слишком много блоков (${blocks.length}) — упрости.`,
    });
  }
  if (absoluteCount > 2) {
    detailed.push({
      id: "structure_too_absolute",
      severity: "high",
      message: `Много абсолютного позиционирования (${absoluteCount}) — высокий риск наложений.`,
    });
  }

  const issues = detailed.map((d) => `[${d.severity}] ${d.message}`);
  let penalty = 0;
  for (const d of detailed) {
    penalty += d.severity === "high" ? 18 : d.severity === "medium" ? 8 : 3;
  }
  const score = Math.max(0, 100 - penalty);

  // ok = false при ЛЮБОЙ safety-проблеме (читаемость и позиционирование).
  // Структурные пробелы решаются enricher'ом и не валят QA.
  const safetyIds = new Set([
    "fontsize_too_small",
    "lineheight_tight",
    "spacing_tight",
    "position_absolute",
    "structure_too_absolute",
  ]);
  const ok = !detailed.some((d) => safetyIds.has(d.id));

  return { ok, issues, detailed, score };
}

/** Детерминированные правки читаемости + спасение премиум-структуры. */
export function applyLayoutReadabilityFallback(site: SiteSchema): SiteSchema {
  const patchBlock = (b: SiteBlock) => {
    const st = { ...(typeof b.styles === "object" && b.styles ? b.styles : {}) } as Record<
      string,
      unknown
    >;
    const fs = fontSizePxApprox(st.fontSize ?? st["font-size"]);
    if (fs != null && fs < 16) st.fontSize = "1rem";
    const lh = num(st.lineHeight ?? st["line-height"]);
    if (lh != null && lh < 1.3) st.lineHeight = 1.5;
    const pos = String(st.position ?? "").toLowerCase();
    if (pos === "absolute" || pos === "fixed") delete st.position;
    if (st.padding == null && st.paddingTop == null) st.paddingTop = "32px";
    return { ...b, styles: st };
  };
  return {
    ...site,
    pages: site.pages.map(patchBlock),
    sections: site.sections.map(patchBlock),
    components: site.components.map(patchBlock),
  };
}
