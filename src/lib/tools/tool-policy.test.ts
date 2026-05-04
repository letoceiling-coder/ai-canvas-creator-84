import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOOL_CHANNEL_POLICY,
  isToolChannelEnabled,
} from "@/lib/tools/tool-policy";

describe("isToolChannelEnabled", () => {
  it("включает все каналы по умолчанию", () => {
    expect(isToolChannelEnabled(DEFAULT_TOOL_CHANNEL_POLICY, "search")).toBe(true);
    expect(isToolChannelEnabled(DEFAULT_TOOL_CHANNEL_POLICY, "context")).toBe(true);
  });

  it("уважает выключенный флаг", () => {
    const p = { ...DEFAULT_TOOL_CHANNEL_POLICY, enableToolSearch: false };
    expect(isToolChannelEnabled(p, "search")).toBe(false);
    expect(isToolChannelEnabled(p, "data")).toBe(true);
  });
});
