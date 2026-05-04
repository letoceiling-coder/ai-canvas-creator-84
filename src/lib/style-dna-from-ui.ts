import type { StyleDNA } from "@/lib/orchestrator";

/** Начальная Style DNA из параметров панели до первого HITL (SSOT §9). */
export function styleDNAFromControlPanel(
  style: string,
  theme: string,
  type: string,
): StyleDNA {
  return {
    vibe: style || "premium",
    density: type === "landing" ? "balanced" : "comfortable",
    motion: style === "bold" ? "expressive" : "subtle",
    contrast: theme === "dark" ? "high" : "medium",
  };
}
