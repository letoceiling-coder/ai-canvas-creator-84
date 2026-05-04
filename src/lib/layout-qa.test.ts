import { describe, expect, it } from "vitest";
import { layoutSchemaQA, applyLayoutReadabilityFallback } from "@/lib/layout-qa";
import type { SiteSchema } from "@/lib/site-schema";

function tinySite(styles: Record<string, unknown>): SiteSchema {
  return {
    pages: [],
    sections: [
      {
        type: "hero",
        content: { headline: "H", ctaLabel: "Go" },
        styles,
        animations: {},
      },
      {
        type: "footer",
        content: { copyright: "©" },
        styles: {},
        animations: {},
      },
    ],
    components: [],
    styles: {},
    animations: {},
    images: [],
    goals: [],
  };
}

describe("layoutSchemaQA", () => {
  it("flags small font and tight line-height", () => {
    const r = layoutSchemaQA(tinySite({ fontSize: "12px", lineHeight: 1 }));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => /мелк/i.test(i))).toBe(true);
    expect(r.issues.some((i) => /межстрочн/i.test(i))).toBe(true);
  });

  it("ok when styles are comfortable", () => {
    const r = layoutSchemaQA(
      tinySite({ fontSize: "1.125rem", lineHeight: 1.45, paddingTop: "24px" }),
    );
    expect(r.ok).toBe(true);
  });

  it("applyLayoutReadabilityFallback improves hero", () => {
    const s = applyLayoutReadabilityFallback(tinySite({ fontSize: "12px", lineHeight: 1 }));
    const hero = s.sections.find((x) => x.type === "hero");
    expect(String(hero?.styles.fontSize ?? "")).toMatch(/1rem|16/);
  });
});
