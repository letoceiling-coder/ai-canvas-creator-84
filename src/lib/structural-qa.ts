/**
 * Структурная QA по SiteSchema (без LLM) — §16 baseline checks.
 */

import type { SiteSchema } from "@/lib/site-schema";

export type StructuralIssue = {
  id: string;
  message: string;
  severity: "low" | "high";
};

export type StructuralQaReport = {
  issues: StructuralIssue[];
  score: number;
};

export function structuralQA(site: SiteSchema): StructuralQaReport {
  const issues: StructuralIssue[] = [];
  const sections = site.sections ?? [];
  if (sections.length === 0) {
    issues.push({
      id: "empty-sections",
      message: "Нет секций",
      severity: "high",
    });
  }
  const types = new Set(sections.map((s) => s.type));
  if (!types.has("hero")) {
    issues.push({
      id: "no-hero",
      message: "Отсутствует hero",
      severity: "high",
    });
  }
  if (!types.has("footer")) {
    issues.push({
      id: "no-footer",
      message: "Отсутствует footer",
      severity: "low",
    });
  }
  let penalty = 0;
  for (const i of issues) penalty += i.severity === "high" ? 25 : 8;
  return {
    issues,
    score: Math.max(0, 100 - penalty),
  };
}

export function mergeQaIssues(
  a: StructuralQaReport,
  b: StructuralQaReport,
): StructuralQaReport {
  const seen = new Set<string>();
  const issues: StructuralIssue[] = [];
  for (const i of [...a.issues, ...b.issues]) {
    const k = `${i.id}:${i.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    issues.push(i);
  }
  let penalty = 0;
  for (const i of issues) penalty += i.severity === "high" ? 25 : 8;
  return {
    issues,
    score: Math.max(0, 100 - penalty),
  };
}
