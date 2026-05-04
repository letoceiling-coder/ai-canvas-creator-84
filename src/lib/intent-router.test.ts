import { describe, expect, it } from "vitest";
import { resolveUserIntent } from "@/lib/intent-router";

describe("resolveUserIntent", () => {
  it("без сайта всегда full_pipeline", () => {
    const r = resolveUserIntent("добавь отзывы", false);
    expect(r.kind).toBe("full_pipeline");
  });

  it("«добавь отзывы» → мгновенное добавление отзывов", () => {
    const r = resolveUserIntent("добавь отзывы", true);
    expect(r.kind).toBe("instant");
    if (r.kind === "instant") {
      expect(r.action).toEqual({
        type: "add_section",
        sectionType: "features",
        variant: "reviews",
      });
    }
  });

  it("«сделай тёмный стиль» → смена темы", () => {
    const r = resolveUserIntent("сделай тёмный стиль", true);
    expect(r.kind).toBe("instant");
    if (r.kind === "instant") {
      expect(r.action).toEqual({ type: "style_theme", theme: "dark" });
    }
  });

  it("«создай лендинг…» → полный pipeline", () => {
    const r = resolveUserIntent("создай лендинг для кофейни в центре", true);
    expect(r.kind).toBe("full_pipeline");
  });
});
