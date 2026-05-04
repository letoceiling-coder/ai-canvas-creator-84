/**
 * Аудит вызовов Tool Layer — SSOT §2.4 toolInvocations[].
 */

import { normalizeQuery, type ToolFeedback, type ToolType } from "@/lib/tools/tool-layer";

/** Один вызов или агрегат compose (§1.16). */
export type ToolInvocationChannel = ToolType | "compose";

export type ToolInvocationRecord = {
  id: string;
  channel: ToolInvocationChannel;
  /** §1.13 — ключ кэша Tool Layer (хэш от нормализованного запроса + роль + intent). */
  cacheKey: string;
  normalizedQuery: string;
  agent: string;
  cacheHit: boolean;
  rankedItemCount: number;
  injectTokens: number;
  /** Усечённый нормализованный текст инъекта для эвристики §2.4 usedInFinal. */
  injectDigest?: string;
  /** §2.4 / §1.11 — проставляется после фиксации артефакта. */
  usedInFinal?: boolean;
  feedbackUseful: boolean;
  feedbackQuality: number;
  traceId: string;
  provider?: string;
  /** data tool: пробелы покрытия (нет ключей / stub). */
  dataGaps?: string[];
  createdAt: string;
  /** Для channel === "compose" — id дочерних single-вызовов. */
  childInvocationIds?: string[];
};

export function createToolInvocationRecord(input: {
  tool: ToolType;
  query: string;
  agent: string;
  traceId: string;
  cacheKey: string;
  cacheHit: boolean;
  rankedItemCount: number;
  injectTokens: number;
  injectDigest?: string;
  feedback: ToolFeedback;
  provider?: string;
  id?: string;
  createdAt?: string;
}): ToolInvocationRecord {
  return {
    id: input.id ?? crypto.randomUUID(),
    channel: input.tool,
    cacheKey: input.cacheKey,
    normalizedQuery: normalizeQuery(input.query),
    agent: input.agent,
    cacheHit: input.cacheHit,
    rankedItemCount: input.rankedItemCount,
    injectTokens: input.injectTokens,
    injectDigest: input.injectDigest,
    feedbackUseful: input.feedback.useful,
    feedbackQuality: input.feedback.quality,
    traceId: input.traceId,
    provider: input.provider,
    dataGaps: input.dataGaps,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/** Родительская запись после цепочки инструментов (planner search+data и т.д.). */
export function createComposeToolInvocationRecord(input: {
  childIds: string[];
  traceId: string;
  injectTokens: number;
  summary: string;
  injectDigest?: string;
  agent?: string;
  id?: string;
  createdAt?: string;
}): ToolInvocationRecord {
  const sorted = [...input.childIds].sort();
  const digest =
    input.injectDigest ??
    (input.summary.trim().length >= 8
      ? input.summary.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200)
      : undefined);
  return {
    id: input.id ?? crypto.randomUUID(),
    channel: "compose",
    cacheKey: `compose|${sorted.join("+")}`,
    normalizedQuery: normalizeQuery("composed pipeline"),
    agent: input.agent ?? "pipeline",
    cacheHit: false,
    rankedItemCount: sorted.length,
    injectTokens: input.injectTokens,
    injectDigest: digest,
    childInvocationIds: sorted,
    feedbackUseful: sorted.length > 0,
    feedbackQuality: sorted.length > 0 ? 78 : 35,
    traceId: input.traceId,
    provider: "composed",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/**
 * §2.4 — эвристика: фрагмент injectDigest (нормализованный) встречается в финальном JSON сайта.
 */
export function applyUsedInFinalFromArtifact(
  invocations: ToolInvocationRecord[] | undefined,
  artifactJson: string,
): void {
  if (!invocations?.length) return;
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const hay = norm(artifactJson);
  for (const inv of invocations) {
    const d = inv.injectDigest;
    if (!d || d.length < 12) {
      inv.usedInFinal = false;
      continue;
    }
    const needle = norm(d).slice(0, 48);
    inv.usedInFinal = needle.length >= 12 && hay.includes(needle);
  }
}
