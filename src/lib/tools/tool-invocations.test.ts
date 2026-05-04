import { describe, expect, it } from "vitest";
import {
  applyUsedInFinalFromArtifact,
  createToolInvocationRecord,
} from "@/lib/tools/tool-invocations";

describe("createToolInvocationRecord", () => {
  it("нормализует query и копирует feedback", () => {
    const r = createToolInvocationRecord({
      id: "fixed-id",
      createdAt: "2026-01-01T00:00:00.000Z",
      tool: "search",
      query: "  Hello   World  ",
      agent: "planner",
      traceId: "trace-1",
      cacheKey: "deadbeef",
      cacheHit: true,
      rankedItemCount: 5,
      injectTokens: 100,
      feedback: { useful: true, quality: 70 },
      provider: "tavily",
    });
    expect(r.cacheKey).toBe("deadbeef");
    expect(r.id).toBe("fixed-id");
    expect(r.normalizedQuery).toBe("hello world");
    expect(r.channel).toBe("search");
    expect(r.cacheHit).toBe(true);
    expect(r.rankedItemCount).toBe(5);
    expect(r.injectTokens).toBe(100);
    expect(r.feedbackUseful).toBe(true);
    expect(r.feedbackQuality).toBe(70);
    expect(r.provider).toBe("tavily");
    expect(r.traceId).toBe("trace-1");
    expect(r.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("applyUsedInFinalFromArtifact", () => {
  it("помечает usedInFinal если digest встречается в JSON", () => {
    const inv = createToolInvocationRecord({
      tool: "search",
      query: "q",
      agent: "planner",
      traceId: "t",
      cacheKey: "k1",
      cacheHit: false,
      rankedItemCount: 1,
      injectTokens: 10,
      injectDigest: "unique marker phrase for test",
      feedback: { useful: true, quality: 80 },
      id: "i1",
    });
    applyUsedInFinalFromArtifact([inv], '{"body":"unique marker phrase for test"}');
    expect(inv.usedInFinal).toBe(true);
  });

  it("false если digest короткий или нет совпадения", () => {
    const inv = createToolInvocationRecord({
      tool: "image",
      query: "q",
      agent: "e",
      traceId: "t",
      cacheKey: "k2",
      cacheHit: false,
      rankedItemCount: 0,
      injectTokens: 0,
      injectDigest: "short",
      feedback: { useful: false, quality: 0 },
      id: "i2",
    });
    applyUsedInFinalFromArtifact([inv], '{"x":1}');
    expect(inv.usedInFinal).toBe(false);
  });
});
