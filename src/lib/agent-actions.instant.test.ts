import { describe, expect, it } from "vitest";
import { applyInstantSiteAction } from "@/lib/agent-actions";
import type { SiteSchema } from "@/lib/site-schema";

function minimalSite(): SiteSchema {
  return {
    pages: [],
    sections: [
      {
        type: "hero",
        content: { headline: "H", ctaLabel: "Go" },
        styles: {},
        animations: {},
      },
      {
        type: "footer",
        content: { copyright: "© T" },
        styles: {},
        animations: {},
      },
    ],
    components: [],
    styles: { theme: "light" },
    animations: {},
    images: [],
    goals: [],
  };
}

describe("applyInstantSiteAction", () => {
  it("добавляет секцию тарифов перед футером", () => {
    const site = minimalSite();
    const { site: next, summary } = applyInstantSiteAction(site, {
      type: "add_section",
      sectionType: "pricing",
      variant: "pricing",
    });
    expect(next.sections.some((s) => s.type === "pricing")).toBe(true);
    const fi = next.sections.findIndex((s) => s.type === "footer");
    const pi = next.sections.findIndex((s) => s.type === "pricing");
    expect(pi).toBeGreaterThanOrEqual(0);
    expect(fi).toBeGreaterThanOrEqual(0);
    expect(pi).toBeLessThan(fi);
    expect(summary).toMatch(/тариф/i);
  });
});
