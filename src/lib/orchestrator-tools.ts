/**
 * Обёртка inject в LLM: всегда через runTool + жёсткий бюджет токенов.
 */

import {
  buildToolCacheKey,
  estimateTokens,
  runTool,
  type ToolFeedback,
  type ToolLifecyclePayload,
  type ToolLifecyclePhase,
  type ToolRequest,
  type ToolType,
} from "@/lib/tools/tool-layer";
import {
  createToolInvocationRecord,
  type ToolInvocationRecord,
} from "@/lib/tools/tool-invocations";
import {
  type ToolChannelPolicy,
  isToolChannelEnabled,
} from "@/lib/tools/tool-policy";

export const MAX_TOOL_TOKENS = 1500;

export const TOOL_CONTEXT_TOP_K = 8;

export type ToolContextPack = {
  text: string;
  feedback: ToolFeedback;
  tokens: number;
  summary?: string;
};

export type { ToolInvocationRecord };

/** §20.12 — одна фаза жизненного цикла tool для UI / логов. */
export type ToolLifecycle = {
  phase: ToolLifecyclePhase;
} & ToolLifecyclePayload;

function injectDigestFromPackText(text: string): string | undefined {
  const d = text.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
  return d.length >= 12 ? d : undefined;
}

export async function getToolContext(params: {
  tool: ToolType;
  query: string;
  agent: string;
  intent: string;
  traceId: string;
  sessionEpoch?: number;
  /** SSOT §2.4 — запись в projectMemory.toolInvocations */
  onInvocation?: (entry: ToolInvocationRecord) => void;
  /** §20.12 streaming / диагностика */
  onToolPhase?: (event: ToolLifecycle) => void;
  /** §1.15 — circuit / retry → decisionLog с оркестратора */
  onToolHardening?: (summary: string, detail: string) => void;
}): Promise<ToolContextPack> {
  const req: ToolRequest = {
    tool: params.tool,
    query: params.query,
    agent: params.agent,
    intent: params.intent,
    traceId: params.traceId,
    sessionEpoch: params.sessionEpoch,
  };

  const res = await runTool(req, {
    topK: TOOL_CONTEXT_TOP_K,
    onToolHardening: params.onToolHardening,
    onLifecycle:
      params.onToolPhase == null
        ? undefined
        : (phase, payload) => {
            params.onToolPhase!({
              phase,
              tool: payload.tool,
              query: payload.query,
              summary: payload.summary,
              cacheHit: payload.cacheHit,
              failed: payload.failed,
            });
          },
  });

  let total = 0;
  const selected: string[] = [];

  for (const item of res.items) {
    const add = estimateTokens(item.content);
    if (total + add > MAX_TOOL_TOKENS) break;
    total += add;
    selected.push(item.content);
  }

  const packText = selected.join("\n\n");
  const digest = injectDigestFromPackText(packText);

  params.onInvocation?.(
    createToolInvocationRecord({
      tool: params.tool,
      query: params.query,
      agent: params.agent,
      traceId: params.traceId,
      cacheKey: buildToolCacheKey(req),
      cacheHit: Boolean(res.metadata.fromCache),
      rankedItemCount: res.items.length,
      injectTokens: total,
      injectDigest: digest,
      feedback: res.feedback,
      provider: res.metadata.provider,
      dataGaps: res.metadata.dataGaps,
    }),
  );

  return {
    text: packText,
    feedback: res.feedback,
    tokens: total,
    summary: res.summary,
  };
}

/**
 * То же, что getToolContext; если канал выключен §20.11 — пустой пакет без вызова провайдера.
 */
export async function getToolContextIfEnabled(
  policy: ToolChannelPolicy,
  params: {
    tool: ToolType;
    query: string;
    agent: string;
    intent: string;
    traceId: string;
    sessionEpoch?: number;
    onInvocation?: (entry: ToolInvocationRecord) => void;
    onToolPhase?: (event: ToolLifecycle) => void;
    onToolHardening?: (summary: string, detail: string) => void;
  },
  opts?: { onSkipped?: (reason: string) => void },
): Promise<ToolContextPack> {
  if (!isToolChannelEnabled(policy, params.tool)) {
    opts?.onSkipped?.(`tool:${params.tool}:disabled_by_pipeline_config`);
    return {
      text: "",
      feedback: { useful: false, quality: 0 },
      tokens: 0,
      summary: undefined,
    };
  }
  return getToolContext(params);
}
