/**
 * §9 Human-in-the-loop — мульти-чекпоинт: план / архитектура / черновик.
 */

import type { PlannerOutput } from "@/lib/planner-normalize";
import { normalizePlanSlots } from "@/lib/planner-normalize";

export type PlannerOutputShape = PlannerOutput;

/** pages/sections — unknown: нормализуем через normalizePlanSlots (строка | { type } | мусор). */
export type PlanPatch = Partial<Pick<PlannerOutput, "goals">> & {
  pages?: unknown;
  sections?: unknown;
};

export type StyleDNAShape = {
  vibe: string;
  density: string;
  motion: string;
  contrast: string;
};

/** Снимок архитектуры (как у ArchitectOutput). */
export type ArchitectSnapshot = {
  layout: unknown;
  components: unknown[];
  designSystem: unknown;
};

export type ArchitecturePatch = {
  layout?: unknown;
  components?: unknown[];
  designSystem?: unknown;
};

export type HitlCheckpoint = "confirm_plan" | "confirm_architecture" | "review_draft";

export type HitlAwaitPayload =
  | {
      checkpoint: "confirm_plan";
      plan: PlannerOutputShape;
      styleDNA?: StyleDNAShape;
    }
  | {
      checkpoint: "confirm_architecture";
      architecture: ArchitectSnapshot;
      /** Для UI: отформатированный JSON */
      architectureJson: string;
      planSections: string[];
    }
  | {
      checkpoint: "review_draft";
      preview: string;
      sectionOptions: { id: string; type: string }[];
      structuralQualityScore: number;
    };

export type HITLAtomicAction =
  | { type: "confirm_plan" }
  | { type: "edit_plan"; patch: PlanPatch }
  | { type: "update_style_dna"; dna: Partial<StyleDNAShape> }
  | { type: "confirm_architecture" }
  | { type: "edit_architecture"; patch: ArchitecturePatch }
  | { type: "reorder_sections"; order: string[] }
  | { type: "confirm_draft" }
  | { type: "regenerate_section"; sectionId: string }
  | { type: "refine_all"; hint?: string }
  | { type: "change_style"; dna?: Partial<StyleDNAShape> };

export type HITLAction = HITLAtomicAction | { type: "compound"; actions: HITLAtomicAction[] };

export type MemoryHitlTarget = {
  plan?: PlannerOutputShape;
  styleDNA?: StyleDNAShape;
  architecture?: ArchitectSnapshot;
};

export function applyPlanPatch(memory: MemoryHitlTarget, patch: PlanPatch): void {
  const base: PlannerOutput = memory.plan ?? { pages: [], sections: [], goals: [] };
  let goals =
    patch.goals !== undefined
      ? patch.goals.map((g) => String(g).trim()).filter(Boolean)
      : base.goals;
  if (goals.length === 0) goals = ["generate landing page"];
  memory.plan = {
    pages: normalizePlanSlots(patch.pages !== undefined ? patch.pages : base.pages),
    sections: normalizePlanSlots(patch.sections !== undefined ? patch.sections : base.sections),
    goals,
  };
}

export function updateStyleDNA(memory: MemoryHitlTarget, dna: Partial<StyleDNAShape>): void {
  const base: StyleDNAShape = memory.styleDNA ?? {
    vibe: "balanced",
    density: "comfortable",
    motion: "subtle",
    contrast: "medium",
  };
  memory.styleDNA = { ...base, ...dna };
}

export function applyArchitecturePatch(memory: MemoryHitlTarget, patch: ArchitecturePatch): void {
  const base: ArchitectSnapshot = memory.architecture ?? {
    layout: {},
    components: [],
    designSystem: {},
  };
  memory.architecture = {
    layout: patch.layout !== undefined ? patch.layout : base.layout,
    components: patch.components !== undefined ? patch.components : base.components,
    designSystem: patch.designSystem !== undefined ? patch.designSystem : base.designSystem,
  };
}

export function defaultHitlAction(payload: HitlAwaitPayload): HITLAction {
  switch (payload.checkpoint) {
    case "confirm_plan":
      return { type: "confirm_plan" };
    case "confirm_architecture":
      return { type: "confirm_architecture" };
    case "review_draft":
      return { type: "confirm_draft" };
  }
}

export function applyHitlAction(memory: MemoryHitlTarget, action: HITLAction): void {
  const run = (a: HITLAtomicAction) => {
    switch (a.type) {
      case "confirm_plan":
      case "confirm_architecture":
      case "confirm_draft":
        return;
      case "edit_plan":
        applyPlanPatch(memory, a.patch);
        return;
      case "update_style_dna":
        updateStyleDNA(memory, a.dna);
        return;
      case "edit_architecture":
        applyArchitecturePatch(memory, a.patch);
        return;
      case "reorder_sections":
        applyPlanPatch(memory, { sections: normalizePlanSlots(a.order) });
        return;
      case "regenerate_section":
      case "refine_all":
        return;
      case "change_style":
        if (a.dna && Object.keys(a.dna).length > 0) updateStyleDNA(memory, a.dna);
        return;
    }
  };
  if (action.type === "compound") {
    for (const x of action.actions) run(x);
    return;
  }
  run(action);
}

export function flattenHitlActions(a: HITLAction): HITLAtomicAction[] {
  return a.type === "compound" ? a.actions : [a];
}

export type HitlPlannerGate =
  | { status: "running" }
  | { status: "awaiting_user"; checkpoint: "planner_done"; planSnapshot: PlannerOutputShape }
  | { status: "continued" };
