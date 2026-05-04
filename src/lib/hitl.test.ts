import { describe, expect, it } from "vitest";
import {
  applyHitlAction,
  applyPlanPatch,
  defaultHitlAction,
  flattenHitlActions,
  type MemoryHitlTarget,
} from "@/lib/hitl";

describe("applyHitlAction", () => {
  it("compound применяет план и DNA по порядку", () => {
    const m: MemoryHitlTarget = {
      plan: { pages: [{ type: "a" }], sections: [{ type: "hero" }], goals: ["g"] },
    };
    applyHitlAction(m, {
      type: "compound",
      actions: [
        { type: "edit_plan", patch: { sections: [{ type: "hero" }, { type: "pricing" }] } },
        { type: "update_style_dna", dna: { vibe: "bold" } },
      ],
    });
    expect(m.plan?.sections).toEqual([{ type: "hero" }, { type: "pricing" }]);
    expect(m.styleDNA?.vibe).toBe("bold");
  });

  it("confirm_plan не меняет память", () => {
    const m: MemoryHitlTarget = {
      plan: { pages: [{ type: "x" }], sections: [{ type: "y" }], goals: ["z"] },
    };
    applyHitlAction(m, { type: "confirm_plan" });
    expect(m.plan).toEqual({ pages: [{ type: "x" }], sections: [{ type: "y" }], goals: ["z"] });
  });

  it("reorder_sections нормализует в слоты { type }", () => {
    const m: MemoryHitlTarget = {
      plan: { pages: [], sections: [{ type: "a" }, { type: "b" }], goals: [] },
    };
    applyHitlAction(m, { type: "reorder_sections", order: ["b", "a"] });
    expect(m.plan?.sections).toEqual([{ type: "b" }, { type: "a" }]);
  });
});

describe("applyPlanPatch", () => {
  it("мерджит частичный patch", () => {
    const m: MemoryHitlTarget = { plan: { pages: [{ type: "p" }], sections: [], goals: [] } };
    applyPlanPatch(m, { goals: ["lead"] });
    expect(m.plan?.goals).toEqual(["lead"]);
    expect(m.plan?.pages).toEqual([{ type: "p" }]);
  });

  it("принимает legacy строки в patch и нормализует", () => {
    const m: MemoryHitlTarget = { plan: { pages: [], sections: [{ type: "x" }], goals: ["g"] } };
    applyPlanPatch(m, { sections: ["hero", "cta"] });
    expect(m.plan?.sections).toEqual([{ type: "hero" }, { type: "cta" }]);
  });
});

describe("defaultHitlAction / flattenHitlActions", () => {
  it("дефолты по чекпоинтам и flatten", () => {
    expect(
      defaultHitlAction({
        checkpoint: "confirm_plan",
        plan: { pages: [], sections: [], goals: [] },
      }),
    ).toEqual({
      type: "confirm_plan",
    });
    expect(
      flattenHitlActions({
        type: "compound",
        actions: [{ type: "confirm_draft" }, { type: "refine_all" }],
      }),
    ).toHaveLength(2);
  });
});
