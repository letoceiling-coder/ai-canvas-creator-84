/**
 * §11 Component intelligence — минимальные UX-инварианты по типам секций (data-level QA).
 */

import type { SiteSchema } from "@/lib/site-schema";
import type { StructuralQaReport } from "@/lib/structural-qa";
import { mergeQaIssues, structuralQA } from "@/lib/structural-qa";

function pickContent(c: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = c[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return "";
}

function planCount(content: Record<string, unknown>): number {
  const plans = content.plans ?? content.tiers ?? content.items;
  if (!Array.isArray(plans)) return 0;
  return plans.filter((p) => p != null).length;
}

function footerHasLegal(content: Record<string, unknown>): boolean {
  const cols = content.columns;
  const tag = pickContent(content, "tagline", "subtitle").toLowerCase();
  const copy = pickContent(content, "copyright", "rights").toLowerCase();
  const brand = pickContent(content, "brand", "title", "name").toLowerCase();
  const blob = `${tag} ${copy} ${brand}`;
  if (/privacy|terms|политик|услов|юридич|legal|cookie|конфиденц/i.test(blob)) return true;
  if (Array.isArray(cols)) {
    for (const col of cols) {
      if (typeof col !== "object" || col === null) continue;
      const o = col as Record<string, unknown>;
      const links = o.links;
      if (!Array.isArray(links)) continue;
      for (const lnk of links) {
        if (typeof lnk !== "object" || lnk === null) continue;
        const L = lnk as Record<string, unknown>;
        const lab = pickContent(L, "label", "text", "name").toLowerCase();
        const href = pickContent(L, "href", "url").toLowerCase();
        if (/privacy|terms|legal|cookie|политик|услов/i.test(`${lab} ${href}`)) return true;
      }
    }
  }
  return false;
}

/** Правила по одной секции (первое вхождение типа в merge-блоки). */
export function componentRulesQA(site: SiteSchema): StructuralQaReport {
  const issues: StructuralQaReport["issues"] = [];
  const blocks = [...site.pages, ...site.sections, ...site.components];

  let hero: Record<string, unknown> | null = null;
  let pricing: Record<string, unknown> | null = null;
  let footer: Record<string, unknown> | null = null;

  for (const b of blocks) {
    const c = b.content as Record<string, unknown>;
    if (b.type === "hero" && !hero) hero = c;
    if (b.type === "pricing" && !pricing) pricing = c;
    if (b.type === "footer" && !footer) footer = c;
  }

  if (hero) {
    const headline = pickContent(hero, "headline", "title", "heading", "name");
    const cta = pickContent(hero, "ctaLabel", "buttonText", "primaryCta", "label");
    if (!headline.trim()) {
      issues.push({
        id: "hero-headline",
        message: "Hero: нет headline",
        severity: "high",
      });
    }
    if (!cta.trim()) {
      issues.push({
        id: "hero-cta",
        message: "Hero: нет основного CTA",
        severity: "high",
      });
    }
  }

  if (pricing && planCount(pricing) < 2) {
    issues.push({
      id: "pricing-plans",
      message: "Pricing: нужно минимум 2 тарифа",
      severity: "high",
    });
  }

  if (footer && !footerHasLegal(footer)) {
    issues.push({
      id: "footer-legal",
      message: "Footer: нет legal / privacy / terms ссылок или явных формулировок",
      severity: "high",
    });
  }

  let penalty = 0;
  for (const i of issues) penalty += i.severity === "high" ? 20 : 8;
  return {
    issues,
    score: Math.max(0, 100 - penalty),
  };
}

/** Структурная + component rules (для гейтов и LLM-QA). */
export function combinedStaticSiteQa(site: SiteSchema): StructuralQaReport {
  return mergeQaIssues(structuralQA(site), componentRulesQA(site));
}
