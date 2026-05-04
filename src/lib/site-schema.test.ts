import { describe, expect, it } from "vitest";
import {
  coerceStringToPageBlock,
  coerceStringToTextBlock,
  normalizeLooseSiteSchemaInputDetailed,
  normalizeLooseSiteSchemaInput,
  safeValidateSiteSchema,
} from "@/lib/site-schema";

const minimalValidSite = {
  pages: [] as unknown[],
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

describe("normalizeLooseSiteSchemaInputDetailed", () => {
  it("coerces page title strings to page blocks (preserves names)", () => {
    const raw = {
      ...minimalValidSite,
      pages: ["Главная", "О нас"],
    };
    const { value, schemaAutoFixed } = normalizeLooseSiteSchemaInputDetailed(raw);
    expect(schemaAutoFixed).toBe(true);
    const pages = (value as { pages: unknown[] }).pages;
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({
      type: "page",
      content: { name: "Главная", sections: [] },
    });
    expect(pages[1]).toMatchObject({
      type: "page",
      content: { name: "О нас", sections: [] },
    });

    const v = safeValidateSiteSchema(raw);
    expect(v.success).toBe(true);
    if (v.success) expect(v.data.pages).toHaveLength(2);
  });

  it("coerces stray strings in sections to text blocks", () => {
    const raw = {
      ...minimalValidSite,
      sections: ["Введение", ...minimalValidSite.sections],
    };
    const v = safeValidateSiteSchema(raw);
    expect(v.success).toBe(true);
    if (v.success) {
      expect(v.data.sections[0]?.type).toBe("text");
      expect(v.data.sections[0]?.content).toEqual({ text: "Введение" });
    }
  });

  it("wraps block content when LLM used a plain string", () => {
    const raw = {
      ...minimalValidSite,
      sections: [
        {
          type: "about",
          content: "Просто текст",
          styles: {},
          animations: {},
        },
        ...minimalValidSite.sections.slice(1),
      ],
    };
    const v = safeValidateSiteSchema(raw);
    expect(v.success).toBe(true);
    if (v.success) {
      const about = v.data.sections.find((s) => s.type === "about");
      expect(about?.content).toEqual({ text: "Просто текст" });
    }
  });

  it("normalizes images: objects with url become strings", () => {
    const raw = {
      ...minimalValidSite,
      images: [{ url: "https://example.com/a.jpg" }, "https://b.test/b.png", 42],
    };
    const v = safeValidateSiteSchema(raw);
    expect(v.success).toBe(true);
    if (v.success) {
      expect(v.data.images).toEqual([
        "https://example.com/a.jpg",
        "https://b.test/b.png",
      ]);
    }
  });

  it("normalizeLooseSiteSchemaInput stays backward-compatible", () => {
    const n = normalizeLooseSiteSchemaInput({
      ...minimalValidSite,
      pages: ["A"],
    });
    expect((n as { pages: { type: string }[] }).pages[0]?.type).toBe("page");
  });
});

describe("coerce helpers", () => {
  it("coerceStringToPageBlock shape", () => {
    expect(coerceStringToPageBlock("Home")).toMatchObject({
      type: "page",
      content: { name: "Home", sections: [] },
    });
  });
  it("coerceStringToTextBlock shape", () => {
    expect(coerceStringToTextBlock("hello")).toMatchObject({
      type: "text",
      content: { text: "hello" },
    });
  });
});
