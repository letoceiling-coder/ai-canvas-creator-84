import { describe, expect, it } from "vitest";
import {
  aggregatePipelineQualityScore,
  buildCompressedAgentView,
  formatAgentMemoryBlock,
  shouldSkipEngineerExternalTools,
  type MemoryAndQualityConfig,
  type ProjectMemoryForView,
} from "@/lib/agent-memory-view";
import { createDecisionEntry } from "@/lib/decision-log";
import { createToolInvocationRecord } from "@/lib/tools/tool-invocations";

const baseCfg: MemoryAndQualityConfig = {
  memoryCompressionDecisionLogTail: 3,
  memoryCompressionMaxUserIntentChars: 100,
  memoryCompressionMaxArchitectureJsonChars: 500,
  memoryCompressionToolInvocationsTail: 5,
  qualityScoreWeights: { critic: 0.4, qa: 0.3, performance: 0.3 },
  enableAdaptiveToolCalling: true,
  adaptiveToolMinInvocations: 4,
  adaptiveToolMinAggregateQuality: 80,
  advancedMemoryLogThreshold: 20,
  advancedMemoryKeepTail: 10,
  enableLongTermSummaryLLM: false,
};

function mockInvocations(n: number) {
  return Array.from({ length: n }, (_, i) =>
    createToolInvocationRecord({
      tool: "search",
      query: `q${i}`,
      agent: "planner",
      traceId: "t",
      cacheKey: `${i}`,
      cacheHit: false,
      rankedItemCount: 1,
      injectTokens: 1,
      feedback: { useful: true, quality: 80 },
    }),
  );
}

describe("buildCompressedAgentView", () => {
  it("planner не получает plan/architecture", () => {
    const memory: ProjectMemoryForView = {
      userIntent: "x".repeat(200),
      intentType: "landing",
      decisionLog: ["a", "b", "c", "d"].map((s) => createDecisionEntry("t", s)),
      plan: { pages: [], sections: ["hero"], goals: [] },
      architecture: { layout: {}, components: [], designSystem: {} },
    };
    const v = buildCompressedAgentView(memory, "planner", baseCfg) as Record<string, unknown>;
    expect(v.agent).toBe("planner");
    expect(v.plan).toBeUndefined();
    expect(v.architecture).toBeUndefined();
    expect((v.decisionLogRecent as { agent: string; summary: string }[]).length).toBeLessThanOrEqual(3);
  });

  it("engineer получает architecture snapshot", () => {
    const memory: ProjectMemoryForView = {
      userIntent: "build",
      decisionLog: [],
      architecture: { layout: { a: 1 }, components: [], designSystem: {} },
    };
    const v = buildCompressedAgentView(memory, "engineer", baseCfg);
    expect(v.agent).toBe("engineer");
    expect(v.architecture).toBeDefined();
  });
});

describe("formatAgentMemoryBlock", () => {
  it("возвращает JSON строку", () => {
    const m: ProjectMemoryForView = { userIntent: "hi", decisionLog: [] };
    const s = formatAgentMemoryBlock(m, "intent", baseCfg);
    expect(s).toContain("AGENT_MEMORY_VIEW");
    expect(s).toContain("intent");
  });
});

describe("aggregatePipelineQualityScore", () => {
  it("детерминированная формула", () => {
    const q = aggregatePipelineQualityScore(
      { design: 80, ux: 80, performance: 60, accessibility: 80 },
      90,
      baseCfg,
    );
    const criticAvg = (80 + 80 + 60 + 80) / 4;
    const expected = Math.round(
      criticAvg * 0.4 + 90 * 0.3 + 60 * 0.3,
    );
    expect(q).toBe(expected);
  });
});

describe("shouldSkipEngineerExternalTools", () => {
  it("не skip на первой итерации", () => {
    expect(
      shouldSkipEngineerExternalTools({
        cfg: baseCfg,
        memory: { userIntent: "u", decisionLog: [], toolInvocations: mockInvocations(10) },
        designLoopIndex: 0,
        previousAggregateQuality: 90,
      }),
    ).toBe(false);
  });

  it("skip когда много вызовов и высокий прошлый aggregate", () => {
    expect(
      shouldSkipEngineerExternalTools({
        cfg: baseCfg,
        memory: { userIntent: "u", decisionLog: [], toolInvocations: mockInvocations(5) },
        designLoopIndex: 1,
        previousAggregateQuality: 85,
      }),
    ).toBe(true);
  });
});
