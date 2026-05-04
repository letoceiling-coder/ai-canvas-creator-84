/**
 * §20.7 Context isolation + §20.2 memory compression.
 * Не импортирует orchestrator.ts (избегание циклов).
 */

import type { ToolInvocationRecord } from "@/lib/tools/tool-invocations";
import { normalizeQuery } from "@/lib/tools/tool-layer";
import { briefDecisionTail, type DecisionLogEntry } from "@/lib/decision-log";

export type AgentName =
  | "intent"
  | "planner"
  | "architect"
  | "engineer"
  | "critic"
  | "qa"
  | "reviewer";

export type StyleDNAView = {
  vibe: string;
  density: string;
  motion: string;
  contrast: string;
};

export type DesignSeedView = {
  layout: string;
  spacing: string;
  typography: string;
  colorSystem: string;
  animationStyle: string;
};

export type PlannerSlotView = { type: string };

export type PlannerOutputView = {
  pages: PlannerSlotView[];
  sections: PlannerSlotView[];
  goals: string[];
};

export type ArchitectOutputView = {
  layout: unknown;
  components: unknown[];
  designSystem: unknown;
};

/** Минимальный срез памяти для построения view (совместим с ProjectMemory). */
export type ProjectMemoryForView = {
  userIntent: string;
  intentType?: string;
  styleDNA?: StyleDNAView;
  /** §9 после HITL плана */
  styleLocked?: boolean;
  designSeed?: DesignSeedView;
  plan?: PlannerOutputView;
  architecture?: ArchitectOutputView;
  decisionLog: DecisionLogEntry[];
  toolInvocations?: ToolInvocationRecord[];
  constraints?: string[];
  chatHistory?: { role: "user" | "assistant"; content: string }[];
  /** §20.2 advanced — сводка старых шагов decisionLog для промпта */
  longTermSummary?: string;
  /** Флаг серверной нормализации SiteSchema — подмешивается в engineer. */
  schemaAutoFixed?: boolean;
};

/** Поля пайплайна, нужные для компрессии и adaptive / aggregate score. */
export type MemoryAndQualityConfig = {
  memoryCompressionDecisionLogTail: number;
  memoryCompressionMaxUserIntentChars: number;
  memoryCompressionMaxArchitectureJsonChars: number;
  memoryCompressionToolInvocationsTail: number;
  qualityScoreWeights: {
    critic: number;
    qa: number;
    performance: number;
  };
  enableAdaptiveToolCalling: boolean;
  adaptiveToolMinInvocations: number;
  adaptiveToolMinAggregateQuality: number;
  /** §20.2 — порог длины decisionLog для LLM-сводки; 0 = выкл. */
  advancedMemoryLogThreshold: number;
  /** Сколько последних записей decisionLog не включать в сводку */
  advancedMemoryKeepTail: number;
  /** Использовать LLM для longTermSummary; иначе эвристика */
  enableLongTermSummaryLLM: boolean;
};

export type MemoryCompressionLimits = {
  decisionLogTail: number;
  maxUserIntentChars: number;
  maxArchitectureJsonChars: number;
};

export function getMemoryCompressionLimits(cfg: MemoryAndQualityConfig): MemoryCompressionLimits {
  return {
    decisionLogTail: cfg.memoryCompressionDecisionLogTail,
    maxUserIntentChars: cfg.memoryCompressionMaxUserIntentChars,
    maxArchitectureJsonChars: cfg.memoryCompressionMaxArchitectureJsonChars,
  };
}

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function jsonSlice(value: unknown, maxChars: number): unknown {
  if (value === undefined) return undefined;
  const s = JSON.stringify(value);
  if (s.length <= maxChars) {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return value;
    }
  }
  return `${s.slice(0, maxChars)}…[truncated]`;
}

export function buildCompressedAgentView(
  memory: ProjectMemoryForView,
  agent: AgentName,
  cfg: MemoryAndQualityConfig,
): Record<string, unknown> {
  const {
    decisionLogTail,
    maxUserIntentChars,
    maxArchitectureJsonChars,
  } = getMemoryCompressionLimits(cfg);

  const decisionLogRecent = briefDecisionTail(memory.decisionLog, decisionLogTail);
  const ui = truncateText(memory.userIntent, maxUserIntentChars);
  const toolAuditRecent =
    memory.toolInvocations?.slice(-Math.min(8, cfg.memoryCompressionToolInvocationsTail)) ?? [];
  const toolAuditSummary = toolAuditRecent.map(
    (t) => `${t.channel}:q=${t.normalizedQuery.slice(0, 40)} tokens=${t.injectTokens}`,
  );

  const lts = memory.longTermSummary
    ? truncateText(memory.longTermSummary, 2500)
    : undefined;
  const withL = (o: Record<string, unknown>) => (lts ? { ...o, longTermSummary: lts } : o);

  switch (agent) {
    case "intent":
      return { agent: "intent", userIntent: ui };
    case "planner":
      return withL({
        agent: "planner",
        userIntent: ui,
        intentType: memory.intentType,
        styleDNA: memory.styleDNA,
        constraints: memory.constraints ?? [],
        decisionLogRecent,
        toolAuditSummary,
      });
    case "architect":
      return withL({
        agent: "architect",
        userIntent: ui,
        intentType: memory.intentType,
        styleDNA: memory.styleDNA,
        plan: memory.plan,
        decisionLogRecent,
        toolAuditSummary,
      });
    case "engineer":
      return withL({
        agent: "engineer",
        userIntent: ui,
        intentType: memory.intentType,
        styleDNA: memory.styleDNA,
        styleLocked: memory.styleLocked,
        designSeed: memory.designSeed,
        schemaAutoFixed: memory.schemaAutoFixed === true,
        architecture: jsonSlice(memory.architecture, maxArchitectureJsonChars),
        planSummary: memory.plan
          ? {
              goals: memory.plan.goals,
              sections: memory.plan.sections,
              pages: memory.plan.pages,
            }
          : undefined,
        decisionLogRecent,
        toolAuditSummary,
      });
    case "critic":
      return withL({
        agent: "critic",
        userIntent: ui,
        intentType: memory.intentType,
        styleDNA: memory.styleDNA,
        planSummary: memory.plan
          ? { goals: memory.plan.goals, pages: memory.plan.pages }
          : undefined,
        decisionLogRecent,
        toolAuditSummary,
      });
    case "qa":
      return withL({
        agent: "qa",
        userIntent: ui,
        intentType: memory.intentType,
        decisionLogRecent,
        toolAuditSummary,
      });
    case "reviewer":
      return withL({
        agent: "reviewer",
        userIntent: ui,
        decisionLogRecent,
        toolAuditSummary,
      });
    default: {
      const _ex: never = agent;
      return _ex;
    }
  }
}

export function formatAgentMemoryBlock(
  memory: ProjectMemoryForView,
  agent: AgentName,
  cfg: MemoryAndQualityConfig,
): string {
  const view = buildCompressedAgentView(memory, agent, cfg);
  const chatLine = compressChatHistoryLine(memory, cfg.memoryCompressionDecisionLogTail);
  const withChat = chatLine ? { ...view, chatRecent: chatLine } : view;
  return `AGENT_MEMORY_VIEW (§20.7 compressed §20.2):\n${JSON.stringify(withChat, null, 0)}`;
}

export function compressChatHistoryLine(
  memory: ProjectMemoryForView,
  maxTurns: number,
): string | undefined {
  const h = memory.chatHistory;
  if (!h?.length) return undefined;
  const tail = h.slice(-maxTurns);
  return tail.map((m) => `${m.role}: ${m.content.slice(0, 500)}`).join("\n");
}

export function aggregatePipelineQualityScore(
  criticDims: { design: number; ux: number; performance: number; accessibility: number } | null,
  qaScore: number | null,
  cfg: MemoryAndQualityConfig,
): number {
  const w = cfg.qualityScoreWeights;
  const criticAvg = criticDims
    ? (criticDims.design + criticDims.ux + criticDims.performance + criticDims.accessibility) / 4
    : 75;
  const qa = qaScore ?? 80;
  const perf = criticDims?.performance ?? criticAvg;
  const raw = criticAvg * w.critic + qa * w.qa + perf * w.performance;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

export function shouldSkipEngineerExternalTools(args: {
  cfg: MemoryAndQualityConfig;
  memory: ProjectMemoryForView;
  designLoopIndex: number;
  previousAggregateQuality: number | undefined;
}): boolean {
  const { cfg, memory, designLoopIndex, previousAggregateQuality } = args;
  if (!cfg.enableAdaptiveToolCalling) return false;
  if (designLoopIndex <= 0) return false;
  const n = memory.toolInvocations?.length ?? 0;
  if (n < cfg.adaptiveToolMinInvocations) return false;
  if (
    previousAggregateQuality == null ||
    previousAggregateQuality < cfg.adaptiveToolMinAggregateQuality
  ) {
    return false;
  }
  return true;
}

const PLANNER_SEARCH_QUERY_PREFIX = "best ";

export function plannerSearchNormalizedQuery(userIntent: string): string {
  return normalizeQuery(`${PLANNER_SEARCH_QUERY_PREFIX}${userIntent} website examples`);
}

/** Пропуск planner search при повторном прогоне с тем же кэшированным запросом (мульти-тур / HITL). */
export function shouldSkipPlannerSearch(args: {
  cfg: MemoryAndQualityConfig;
  memory: ProjectMemoryForView;
  userIntent: string;
}): boolean {
  if (!args.cfg.enableAdaptiveToolCalling) return false;
  const target = plannerSearchNormalizedQuery(args.userIntent);
  return Boolean(
    args.memory.toolInvocations?.some(
      (i) =>
        i.channel === "search" &&
        i.agent === "planner" &&
        i.normalizedQuery === target &&
        i.cacheHit &&
        i.feedbackQuality >= 75,
    ),
  );
}

/** Пропуск critic market search на 2+ итерации design loop при стабильном качестве. */
export function shouldSkipCriticMarketSearch(args: {
  cfg: MemoryAndQualityConfig;
  memory: ProjectMemoryForView;
  loopIteration: number;
  previousAggregateQuality: number | undefined;
}): boolean {
  if (!args.cfg.enableAdaptiveToolCalling) return false;
  if (args.loopIteration <= 0) return false;
  if (
    args.previousAggregateQuality == null ||
    args.previousAggregateQuality < args.cfg.adaptiveToolMinAggregateQuality
  ) {
    return false;
  }
  const n = args.memory.toolInvocations?.length ?? 0;
  if (n < args.cfg.adaptiveToolMinInvocations) return false;
  return Boolean(
    args.memory.toolInvocations?.some((i) => i.channel === "search" && i.agent === "critic"),
  );
}
