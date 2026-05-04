/**
 * Планировщик: приводим ответ LLM (строки и/или { type }) к единому PlannerOutput.
 * Контракт памяти: pages и sections — только Array<{ type: string }> (не голые строки).
 */

import { z } from "zod";

export type PlannerSlot = { type: string };

/** Единый контракт плана в памяти и HITL. */
export type PlannerOutput = {
  pages: PlannerSlot[];
  sections: PlannerSlot[];
  goals: string[];
};

/** Премиум-структура: header + продающие блоки + footer (минимум 7 секций). */
export const PLANNER_DEFAULT_SECTION_TYPES = [
  "header",
  "hero",
  "features",
  "benefits",
  "testimonials",
  "process",
  "contacts",
  "cta",
  "footer",
] as const;

const plannerItemSchema = z.union([
  z.string(),
  z.object({ type: z.string() }),
]);

/** Принимаем строки или объекты { type } — как от LLM и legacy HITL. */
export const plannerRawSchema = z.object({
  pages: z.array(plannerItemSchema).optional().default([]),
  sections: z.array(plannerItemSchema).optional().default([]),
  goals: z.array(z.string()).optional(),
});

/** Один слой нормализации слотов плана. */
export function normalizePlanSlots(items: unknown): PlannerSlot[] {
  if (!Array.isArray(items)) return [];
  return items.map((s) =>
    typeof s === "string"
      ? { type: s.trim() || "unknown" }
      : { type: String((s as { type?: unknown }).type ?? "").trim() || "unknown" },
  );
}

export function normalizePlannerRawToOutput(raw: unknown): PlannerOutput {
  const p = plannerRawSchema.safeParse(raw);
  if (!p.success) {
    return {
      pages: [],
      sections: normalizePlanSlots([...PLANNER_DEFAULT_SECTION_TYPES]),
      goals: ["generate landing page"],
    };
  }
  const pages = normalizePlanSlots(p.data.pages);
  let sections = normalizePlanSlots(p.data.sections);
  if (sections.length === 0) {
    sections = normalizePlanSlots([...PLANNER_DEFAULT_SECTION_TYPES]);
  }
  let goals =
    p.data.goals && p.data.goals.length > 0
      ? p.data.goals.map((g) => String(g).trim()).filter(Boolean)
      : ["generate landing page"];
  if (goals.length === 0) goals = ["generate landing page"];
  return { pages, sections, goals };
}

/** После HITL или перед architect/engineer — единственная точка приведения memory.plan. */
export function ensurePlannerMemoryPlan(plan: PlannerOutput | undefined): PlannerOutput {
  if (!plan) return normalizePlannerRawToOutput({});
  return normalizePlannerRawToOutput({
    pages: plan.pages,
    sections: plan.sections,
    goals: plan.goals,
  });
}
