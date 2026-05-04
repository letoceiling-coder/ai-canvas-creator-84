import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOOL_TTL_MS,
  buildToolCacheKey,
  clearToolLayerCache,
  estimateTokens,
  normalizeQuery,
  resetToolLayerCacheForTests,
  withUsedInFinal,
} from "@/lib/tools/tool-layer";

describe("normalizeQuery", () => {
  it("trim, lower case, схлопывание пробелов", () => {
    expect(normalizeQuery("  Foo   BAR  ")).toBe("foo bar");
  });
});

describe("estimateTokens", () => {
  it("≈ ceil(len/4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("withUsedInFinal", () => {
  it("мерджит флаг", () => {
    const f = withUsedInFinal({ useful: true, quality: 90 }, true);
    expect(f.usedInFinal).toBe(true);
  });
});

describe("buildToolCacheKey §1.13 sessionEpoch", () => {
  it("разные epoch дают разные ключи при том же запросе", () => {
    const base = {
      tool: "search" as const,
      query: "x",
      agent: "planner",
      intent: "landing",
      traceId: "t",
    };
    expect(buildToolCacheKey({ ...base, sessionEpoch: 0 })).not.toBe(
      buildToolCacheKey({ ...base, sessionEpoch: 1 }),
    );
  });
});

describe("clearToolLayerCache", () => {
  it("экспортируется для инвалидации", () => {
    expect(typeof clearToolLayerCache).toBe("function");
  });
});

describe("DEFAULT_TOOL_TTL_MS", () => {
  it("context живёт дольше search (§1.13)", () => {
    expect(DEFAULT_TOOL_TTL_MS.context).toBeGreaterThan(DEFAULT_TOOL_TTL_MS.search);
    expect(DEFAULT_TOOL_TTL_MS.image).toBeLessThan(DEFAULT_TOOL_TTL_MS.context);
  });
});
