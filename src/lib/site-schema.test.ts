import { describe, expect, it } from "vitest";
import {
  normalizeLooseSiteSchemaInput,
  safeValidateSiteSchema,
} from "@/lib/site-schema";

describe("normalizeLooseSiteSchemaInput", () => {
  it("drops string entries in pages so sections can still validate", () => {
    const raw = {
      pages: ["Home", "About", "Contact"],
      sections: [
        {
          type: "hero",
          content: { headline: "H", subheadline: "S", ctaLabel: "Go" },
          styles: {},
          animations: {},
        },
        {
          type: "features",
          content: { title: "F", items: [] },
          styles: {},
          animations: {},
        },
        {
          type: "benefits",
          content: { title: "B", items: [] },
          styles: {},
          animations: {},
        },
        {
          type: "cta",
          content: { headline: "C", subheadline: "c", buttonText: "Ok" },
          styles: {},
          animations: {},
        },
        {
          type: "footer",
          content: {
            brand: "B",
            tagline: "T",
            columns: [],
            copyright: "©",
          },
          styles: {},
          animations: {},
        },
      ],
      components: [],
      styles: { theme: "dark", accentGradient: "linear-gradient(135deg, #000, #111)" },
      animations: {},
      images: [],
    };

    const norm = normalizeLooseSiteSchemaInput(raw);
    expect((norm as { pages: unknown }).pages).toEqual([]);

    const v = safeValidateSiteSchema(raw);
    expect(v.success).toBe(true);
  });

  it("filters non-objects from sections but keeps valid blocks", () => {
    const raw = {
      pages: [],
      sections: [
        "invalid",
        {
          type: "hero",
          content: { headline: "H", subheadline: "S", ctaLabel: "Go" },
          styles: {},
          animations: {},
        },
      ],
      components: [],
      styles: { theme: "dark", accentGradient: "linear-gradient(135deg, #000, #111)" },
      animations: {},
      images: [],
    };

    const v = safeValidateSiteSchema(raw);
    expect(v.success).toBe(true);
    if (v.success) expect(v.data.sections).toHaveLength(1);
  });
});
