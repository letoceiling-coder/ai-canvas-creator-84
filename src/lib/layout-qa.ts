/**
 * QA по данным схемы (без рендера в браузере): читаемость, отступы, перегрузка.
 */

import type { SiteSchema } from "@/lib/site-schema";
import { mergeSiteBlocks } from "@/lib/site-render";

export type LayoutQAResult = {
  ok: boolean;
  issues: string[];
};

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

/** Только явные px или число (считаем px); rem/em — пропускаем (зависят от root). */
function fontSizePxApprox(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    if (/rem|em$/i.test(v.trim())) return null;
    const px = v.match(/^([\d.]+)\s*px$/i);
    if (px) return parseFloat(px[1]!);
  }
  return null;
}

/** Эвристика layout-QA для блока на основе styles + content. */
export function layoutSchemaQA(site: SiteSchema): LayoutQAResult {
  const issues: string[] = [];
  const blocks = mergeSiteBlocks(site);
  let absoluteCount = 0;

  for (const b of blocks) {
    const st = (b.styles ?? {}) as Record<string, unknown>;
    const label = `${b.type}`;

    const fs = fontSizePxApprox(st.fontSize ?? st["font-size"]);
    if (fs != null && fs > 0 && fs < 14) {
      issues.push(`${label}: слишком мелкий шрифт (font-size ${fs}, минимум 14)`);
    }

    const lh = st.lineHeight ?? st["line-height"];
    const lhN = num(lh);
    if (lhN != null && lhN > 0 && lhN < 1.2) {
      issues.push(`${label}: плотный межстрочный интервал (line-height ${lhN}, минимум 1.2)`);
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
        issues.push(`${label}: мало воздуха (${k}≈${n}px, рекомендуется ≥16px)`);
      }
    }

    const pos = String(st.position ?? "").toLowerCase();
    if (pos === "absolute" || pos === "fixed") absoluteCount += 1;
  }

  if (blocks.length > 25) {
    issues.push("Слишком много секций/блоков — упростите структуру");
  }

  if (absoluteCount > 4) {
    issues.push("Много абсолютного позиционирования — высокий риск визуальных наложений");
  }

  return { ok: issues.length === 0, issues };
}

/** Детерминированные правки читаемости, если LLM-fixer не помог. */
export function applyLayoutReadabilityFallback(site: SiteSchema): SiteSchema {
  const patchBlock = (b: (typeof site.sections)[0]) => {
    const st = { ...(typeof b.styles === "object" && b.styles ? b.styles : {}) } as Record<
      string,
      unknown
    >;
    const fs = fontSizePxApprox(st.fontSize ?? st["font-size"]);
    if (fs != null && fs < 14) st.fontSize = "1rem";
    const lh = num(st.lineHeight ?? st["line-height"]);
    if (lh != null && lh < 1.25) st.lineHeight = 1.45;
    if (st.padding == null && st.paddingTop == null) st.paddingTop = "24px";
    return { ...b, styles: st };
  };
  return {
    ...site,
    pages: site.pages.map(patchBlock),
    sections: site.sections.map(patchBlock),
    components: site.components.map(patchBlock),
  };
}
