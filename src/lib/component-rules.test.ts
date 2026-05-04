import { describe, expect, it } from "vitest";
import { componentRulesQA, combinedStaticSiteQa } from "@/lib/component-rules";
import type { SiteSchema } from "@/lib/site-schema";

const baseSite = (): SiteSchema => ({
  pages: [],
  sections: [],
  components: [],
  styles: {},
  animations: {},
  images: [],
});

describe("componentRulesQA", () => {
  it("требует CTA в hero", () => {
    const site = baseSite();
    site.sections = [
      {
        type: "hero",
        content: { headline: "X", description: "Y" },
        styles: {},
        animations: {},
      },
      {
        type: "footer",
        content: { copyright: "© Test", brand: "T" },
        styles: {},
        animations: {},
      },
    ];
    const r = componentRulesQA(site);
    expect(r.issues.some((i) => i.id === "hero-cta")).toBe(true);
  });

  it("pricing — минимум 2 плана", () => {
    const site = baseSite();
    site.sections = [
      {
        type: "hero",
        content: { headline: "H", ctaLabel: "Go" },
        styles: {},
        animations: {},
      },
      {
        type: "pricing",
        content: { plans: [{ name: "Solo" }] },
        styles: {},
        animations: {},
      },
      {
        type: "footer",
        content: { columns: [{ title: "Legal", links: [{ label: "Privacy", href: "/p" }] }] },
        styles: {},
        animations: {},
      },
    ];
    const r = componentRulesQA(site);
    expect(r.issues.some((i) => i.id === "pricing-plans")).toBe(true);
  });
});

describe("combinedStaticSiteQa", () => {
  it("объединяет структурные и компонентные правила", () => {
    const site = baseSite();
    site.sections = [
      {
        type: "hero",
        content: { headline: "H", ctaLabel: "Go" },
        styles: {},
        animations: {},
      },
      {
        type: "pricing",
        content: { plans: [{ name: "A" }, { name: "B" }] },
        styles: {},
        animations: {},
      },
      {
        type: "footer",
        content: { columns: [{ title: "Legal", links: [{ label: "Terms", href: "/t" }] }] },
        styles: {},
        animations: {},
      },
    ];
    const r = combinedStaticSiteQa(site);
    expect(r.issues.length).toBe(0);
    expect(r.score).toBeGreaterThan(80);
  });
});
