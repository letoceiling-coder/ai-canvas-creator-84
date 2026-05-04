import { describe, expect, it } from "vitest";
import { calculateTemplateSimilarity } from "@/lib/template-detector";
import type { SiteSchema } from "@/lib/site-schema";

const emptyBlock = (type: SiteSchema["sections"][number]["type"], content: Record<string, unknown>) =>
  ({
    type,
    content,
    styles: {},
    animations: {},
  }) as SiteSchema["sections"][number];

describe("calculateTemplateSimilarity", () => {
  it("низкий score для минимального кастомного набора", () => {
    const site: SiteSchema = {
      pages: [],
      sections: [
        emptyBlock("hero", { headline: "Custom xenolith", ctaLabel: "Go" }),
        emptyBlock("about", { title: "We forge tools", description: "Unique" }),
      ],
      components: [],
      styles: {},
      animations: {},
      images: [],
    };
    const r = calculateTemplateSimilarity(site);
    expect(r.score).toBeLessThan(0.58);
    expect(r.suspicious).toBe(false);
  });

  it("канонический лендинг + клише даёт существенно более высокий score, чем кастомный минимум", () => {
    const minimal: SiteSchema = {
      pages: [],
      sections: [
        emptyBlock("hero", { headline: "Custom xenolith", ctaLabel: "Go" }),
        emptyBlock("about", { title: "We forge tools", description: "Unique" }),
      ],
      components: [],
      styles: {},
      animations: {},
      images: [],
    };
    const template: SiteSchema = {
      pages: [],
      sections: [
        emptyBlock("hero", { headline: "Transform your business", ctaLabel: "Start" }),
        emptyBlock("features", { title: "Feat" }),
        emptyBlock("features", { title: "Feat2" }),
        emptyBlock("features", { title: "Feat3" }),
        emptyBlock("pricing", { plans: [{ name: "a" }, { name: "b" }] }),
        emptyBlock("cta", { title: "Act" }),
        emptyBlock("footer", { copyright: "© x" }),
      ],
      components: [],
      styles: {},
      animations: {},
      images: [],
    };
    const a = calculateTemplateSimilarity(minimal);
    const b = calculateTemplateSimilarity(template);
    expect(b.score).toBeGreaterThan(a.score + 0.12);
    expect(b.breakdown).toBeDefined();
  });
});
