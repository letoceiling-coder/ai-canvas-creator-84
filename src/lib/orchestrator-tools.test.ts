import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_TOOL_TOKENS,
  getToolContext,
  getToolContextIfEnabled,
  type ToolInvocationRecord,
} from "@/lib/orchestrator-tools";
import { DEFAULT_TOOL_CHANNEL_POLICY } from "@/lib/tools/tool-policy";
import { estimateTokens, resetToolLayerCacheForTests } from "@/lib/tools/tool-layer";

vi.mock("@/lib/tools/tool-server-fns", () => ({
  serverToolSearch: vi.fn().mockResolvedValue({
    ok: true,
    summary: "s",
    items: [{ id: "1", content: "x".repeat(400), source: "u", timestamp: Date.now() }],
    metadata: { provider: "mock" },
  }),
  serverToolContext: vi.fn().mockResolvedValue({
    ok: false,
    reason: "no_key",
  }),
}));

describe("getToolContext", () => {
  afterEach(() => {
    resetToolLayerCacheForTests();
    vi.clearAllMocks();
  });

  it("не превышает MAX_TOOL_TOKENS по сумме item.content", async () => {
    const pack = await getToolContext({
      tool: "search",
      query: "q",
      agent: "planner",
      intent: "landing page",
      traceId: "t1",
    });
    expect(pack.tokens).toBeLessThanOrEqual(MAX_TOOL_TOKENS);
    const direct = estimateTokens(pack.text);
    expect(direct).toBe(pack.tokens);
  });

  it("вызывает onInvocation с injectTokens и cacheKey", async () => {
    const invocations: ToolInvocationRecord[] = [];
    await getToolContext({
      tool: "search",
      query: "q2",
      agent: "critic",
      intent: "i",
      traceId: "t2",
      onInvocation: (e) => {
        invocations.push(e);
      },
    });
    expect(invocations).toHaveLength(1);
    expect(invocations[0].channel).toBe("search");
    expect(invocations[0].agent).toBe("critic");
    expect(invocations[0].traceId).toBe("t2");
    expect(invocations[0].cacheKey.length).toBeGreaterThan(3);
    expect(invocations[0].injectTokens).toBeLessThanOrEqual(MAX_TOOL_TOKENS);
  });

  it("getToolContextIfEnabled не вызывает провайдер если канал off", async () => {
    const invocations: ToolInvocationRecord[] = [];
    const skipped: string[] = [];
    const pack = await getToolContextIfEnabled(
      { ...DEFAULT_TOOL_CHANNEL_POLICY, enableToolSearch: false },
      {
        tool: "search",
        query: "q3",
        agent: "p",
        intent: "x",
        traceId: "t3",
        onInvocation: (e) => invocations.push(e),
      },
      { onSkipped: (r) => skipped.push(r) },
    );
    expect(pack.text).toBe("");
    expect(pack.feedback.quality).toBe(0);
    expect(invocations).toHaveLength(0);
    expect(skipped.some((s) => s.includes("disabled"))).toBe(true);
  });
});
