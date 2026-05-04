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
      plan: { pages: ["a"], sections: ["hero"], goals: ["g"] },
    };
    applyHitlAction(m, {
      type: "compound",
      actions: [
        { type: "edit_plan", patch: { sections: ["hero", "pricing"] } },
        { type: "update_style_dna", dna: { vibe: "bold" } },
      ],
    });
    expect(m.plan?.sections).toEqual(["hero", "pricing"]);
    expect(m.styleDNA?.vibe).toBe("bold");
  });

  it("confirm_plan не меняет память", () => {
    const m: MemoryHitlTarget = {
      plan: { pages: ["x"], sections: ["y"], goals: ["z"] },
    };
    applyHitlAction(m, { type: "confirm_plan" });
    expect(m.plan).toEqual({ pages: ["x"], sections: ["y"], goals: ["z"] });
  });
});

describe("applyPlanPatch", () => {
  it("мерджит частичный patch", () => {
    const m: MemoryHitlTarget = { plan: { pages: ["p"], sections: [], goals: [] } };
    applyPlanPatch(m, { goals: ["lead"] });
    expect(m.plan?.goals).toEqual(["lead"]);
    expect(m.plan?.pages).toEqual(["p"]);
  });
});

describe("defaultHitlAction / flattenHitlActions", () => {
  it("дефолты по чекпоинтам и flatten", () => {
    expect(defaultHitlAction({ checkpoint: "confirm_plan", plan: { pages: [], sections: [], goals: [] } })).toEqual({
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