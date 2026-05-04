/**
 * Политика каналов Tool Layer — SSOT §20.11 (флаги по тарифу / продукту).
 */

import type { ToolType } from "@/lib/tools/tool-layer";

export type ToolChannelPolicy = {
  enableToolSearch: boolean;
  enableToolContext: boolean;
  enableToolUi: boolean;
  enableToolImage: boolean;
  enableToolData: boolean;
};

export const DEFAULT_TOOL_CHANNEL_POLICY: ToolChannelPolicy = {
  enableToolSearch: true,
  enableToolContext: true,
  enableToolUi: true,
  enableToolImage: true,
  enableToolData: true,
};

export function isToolChannelEnabled(
  policy: ToolChannelPolicy,
  tool: ToolType,
): boolean {
  switch (tool) {
    case "search":
      return policy.enableToolSearch;
    case "context":
      return policy.enableToolContext;
    case "ui":
      return policy.enableToolUi;
    case "image":
      return policy.enableToolImage;
    case "data":
      return policy.enableToolData;
    default: {
      const _ex: never = tool;
      return _ex;
    }
  }
}
