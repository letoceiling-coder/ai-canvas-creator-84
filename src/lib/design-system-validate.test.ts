import { describe, expect, it } from "vitest";
import { validateDesignSystem } from "@/lib/design-system-validate";

describe("validateDesignSystem", () => {
  it("принимает согласованный designSystem", () => {
    const ds = {
      colors: { background: "#0f172a", foreground: "#f8fafc" },
      spacing: [4, 8, 16, 24, 32],
      typography: { fontFamily: "Inter", scale: [12, 14, 16, 20] },
    };
    const v = validateDesignSystem(ds);
    expect(v.hasErrors).toBe(false);
    expect(v.allIssues.length).toBe(0);
  });

  it("ловит слабый контраст", () => {
    const ds = {
      colors: { a: "#777777", b: "#888888" },
      spacing: [4, 8, 16],
      typography: { fontFamily: "Arial" },
    };
    const v = validateDesignSystem(ds);
    expect(v.hasErrors).toBe(true);
    expect(v.contrast.issues.length).toBeGreaterThan(0);
  });

  it("требует spacing при пустом корне", () => {
    const v = validateDesignSystem({ typography: { fontFamily: "Serif" } });
    expect(v.spacing.issues.some((s) => s.includes("spacing"))).toBe(true);
  });
});
