/**
 * Tool Layer — ядро вызовов инструментов (SSOT §1.11–§1.16).
 * Работает в браузере и на сервере: без node:crypto.
 * Живые search/context — через server functions (ключи не в VITE_*).
 */

import { serverToolContext, serverToolImage, serverToolSearch } from "@/lib/tools/tool-server-fns";

export type ToolType = "context" | "search" | "ui" | "image" | "data";

export interface ToolRequest {
  tool: ToolType;
  query: string;
  agent: string;
  intent: string;
  /** Корреляция с сессией пайплайна / логами (SSOT trace). */
  traceId: string;
  /** §1.13 — смена эпохи инвалидации кэша при новом брифе / intent в сессии. */
  sessionEpoch?: number;
  meta?: Record<string, unknown>;
}

export interface ToolItem {
  id: string;
  content: string;
  source?: string;
  timestamp?: number;
  score?: number;
}

export interface ToolResponse {
  summary: string;
  items: ToolItem[];
  metadata: {
    fromCache?: boolean;
    provider: string;
    tokens?: number;
    failed?: boolean;
    traceId?: string;
    /** data tool: явные пробелы (stub / нет ключей). */
    dataGaps?: string[];
  };
}

export interface ToolFeedback {
  useful: boolean;
  quality: number;
  /** Проставляет оркестратор после фиксации артефакта (§1.11). */
  usedInFinal?: boolean;
}

export type ToolRunResult = ToolResponse & { feedback: ToolFeedback };

const MAX_RAW_ITEMS = 50;

/** Нормализация для ключа кэша и ранжирования (§1.13). */
export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function totalEstimatedTokens(summary: string, items: ToolItem[]): number {
  let sum = estimateTokens(summary);
  for (const i of items) sum += estimateTokens(i.content);
  return sum;
}

/** Обновление feedback из оркестратора, когда известно использование в финале. */
export function withUsedInFinal(f: ToolFeedback, usedInFinal: boolean): ToolFeedback {
  return { ...f, usedInFinal };
}

function buildToolCacheKey(req: ToolRequest): string {
  const epoch = req.sessionEpoch ?? 0;
  const s = `${req.tool}|${normalizeQuery(req.query)}|${req.agent}|${normalizeQuery(req.intent)}|e:${epoch}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/** Публичный ключ кэша §1.13 для аудита toolInvocations. */
export { buildToolCacheKey };

const toolCache = new Map<string, { data: ToolResponse; ts: number }>();

/** Сброс TTL-кэша Tool Layer (новый бриф, смена intent в сессии). */
export function clearToolLayerCache(): void {
  toolCache.clear();
}

/** Сброс кэша между тестами (alias). */
export function resetToolLayerCacheForTests(): void {
  clearToolLayerCache();
}

function isCacheValid(entry: { ts: number }, ttl: number): boolean {
  return Date.now() - entry.ts < ttl;
}

function rankItems(items: ToolItem[], normalizedQuery: string): ToolItem[] {
  const q = normalizedQuery;
  return items
    .map((item) => {
      const relevance = item.content.toLowerCase().includes(q) ? 1 : 0.5;
      const freshness = item.timestamp != null ? 1 : 0.7;
      const trust = item.source?.toLowerCase().includes("official") ? 1 : 0.6;
      const score = relevance * 0.5 + freshness * 0.2 + trust * 0.3;
      return { ...item, score };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function evaluateToolResponse(res: ToolResponse): ToolFeedback {
  const n = res.items.length;
  const useful = n > 0;
  const quality = n === 0 ? 0 : n < 3 ? 40 : n < 5 ? 70 : 90;
  return { useful, quality };
}

async function searchViaTavily(query: string): Promise<ToolResponse | null> {
  try {
    const out = await serverToolSearch({ data: { query: query.trim() } });
    if (!out.ok) return null;
    return {
      summary: out.summary,
      items: out.items,
      metadata: { provider: out.metadata.provider },
    };
  } catch {
    return null;
  }
}

async function contextViaProxy(query: string): Promise<ToolResponse | null> {
  try {
    const out = await serverToolContext({ data: { query: query.trim() } });
    if (!out.ok) return null;
    return {
      summary: out.summary,
      items: out.items,
      metadata: { provider: out.metadata.provider },
    };
  } catch {
    return null;
  }
}

async function fakeSearch(query: string): Promise<ToolResponse> {
  return {
    summary: `Поисковые выдержки по теме: ${query.slice(0, 80)}`,
    items: [
      {
        id: "s1",
        content: `Референс: типовая структура лендинга для «${query.slice(0, 60)}» — hero, social proof, pricing.`,
        source: "web.example",
        timestamp: Date.now(),
      },
    ],
    metadata: { provider: "fake-search" },
  };
}

async function fakeContext(query: string): Promise<ToolResponse> {
  return {
    summary: `Контекст документации: ${query.slice(0, 80)}`,
    items: [
      {
        id: "c1",
        content: `Best practice: доступность и анимации для «${query.slice(0, 60)}» — prefers-reduced-motion, семантика.`,
        source: "docs.official",
        timestamp: Date.now(),
      },
    ],
    metadata: { provider: "fake-context7" },
  };
}

async function fakeUI(query: string): Promise<ToolResponse> {
  return {
    summary: `UI-паттерны для: ${query.slice(0, 80)}`,
    items: [
      {
        id: "u1",
        content: `Паттерн: grid features 3 колонки, hero с split-layout, CTA вторичный в hero.`,
        source: "patterns.internal",
        timestamp: Date.now(),
      },
    ],
    metadata: { provider: "fake-ui" },
  };
}

function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/** Детерминированный placeholder URL (не random stock). */
function deterministicPlaceholderImage(query: string): ToolResponse {
  const q = (query.trim() || "visual").slice(0, 48);
  const enc = encodeURIComponent(q);
  const url = `https://placehold.co/1600x900/0f172a/818cf8/png?text=${enc}`;
  return {
    summary: "Placeholder: для реальных фото задайте OPENAI_API_KEY",
    items: [
      {
        id: `ph-${simpleHash(q)}`,
        content: url,
        source: "placehold.co",
        timestamp: Date.now(),
      },
    ],
    metadata: { provider: "placeholder" },
  };
}

async function productionOrPlaceholderImage(query: string): Promise<ToolResponse> {
  try {
    const out = await serverToolImage({ data: { query: query.trim() } });
    if (out.ok && out.items.length > 0) {
      return {
        summary: out.summary,
        items: out.items.map((item) => ({ ...item })),
        metadata: { provider: out.metadata.provider },
      };
    }
  } catch {
    /* fallback */
  }
  return deterministicPlaceholderImage(query);
}

async function fakeData(query: string): Promise<ToolResponse> {
  return {
    summary: `Источник: заглушка — веб-поиск недоступен; верифицированных фактов нет.`,
    items: [
      {
        id: "d-stub",
        content: `Тема: «${query.slice(0, 60)}». Конкретные цифры, бренды и даты не загружались. В макете используйте нейтральные формулировки или данные из вашего брифа.`,
        source: "stub.local",
        timestamp: Date.now(),
      },
    ],
    metadata: {
      provider: "stub-data",
      dataGaps: ["Нет TAVILY_API_KEY — нет выдержек из веб-поиска"],
    },
  };
}

/** §1.15 — упрощение запроса для 2-й попытки. */
export function simplifyToolQuery(query: string): string {
  const t = query.trim();
  if (!t) return t;
  const words = t.split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
  return words.length < t.length ? words : t.slice(0, 48);
}

async function callProvider(req: ToolRequest): Promise<ToolResponse> {
  const q = req.query.trim();

  switch (req.tool) {
    case "search": {
      const live = await searchViaTavily(q);
      return live ?? (await fakeSearch(q));
    }
    case "context": {
      const live = await contextViaProxy(q);
      return live ?? (await fakeContext(q));
    }
    case "ui": {
      const live = await searchViaTavily(`best UI patterns landing page ${q}`);
      if (live && live.items.length > 0) {
        return {
          ...live,
          summary: `UI patterns: ${live.summary}`,
          metadata: { provider: "tavily-ui" },
        };
      }
      return fakeUI(q);
    }
    case "image":
      return productionOrPlaceholderImage(q);
    case "data": {
      const live = await searchViaTavily(`statistics data facts ${q}`);
      if (live && live.items.length > 0) {
        return {
          ...live,
          summary: `Data / search: ${live.summary}`,
          metadata: { provider: "tavily-data" },
        };
      }
      return fakeData(q);
    }
    default: {
      const _exhaustive: never = req.tool;
      throw new Error(`Unknown tool: ${_exhaustive}`);
    }
  }
}

async function tryLiveProvider(req: ToolRequest): Promise<ToolResponse> {
  try {
    const r = await callProvider(req);
    if (r.items.length === 0) {
      return { ...r, metadata: { ...r.metadata, failed: true } };
    }
    return r;
  } catch {
    return {
      summary: "Provider error",
      items: [],
      metadata: { provider: "live-error", failed: true },
    };
  }
}

/** §1.15 — только локальные/fake провайдеры (3-я попытка). */
export async function callProviderFallbackOnly(req: ToolRequest): Promise<ToolResponse> {
  const q = req.query.trim();
  switch (req.tool) {
    case "search":
      return fakeSearch(q);
    case "context":
      return fakeContext(q);
    case "ui":
      return fakeUI(q);
    case "image":
      return deterministicPlaceholderImage(q);
    case "data":
      return fakeData(q);
  }
  const _never: never = req.tool;
  void _never;
  return {
    summary: "Unknown tool",
    items: [],
    metadata: { provider: "fallback-none", failed: true },
  };
}

function isUsableToolResponse(res: ToolResponse): boolean {
  return res.items.length > 0 && res.metadata.failed !== true;
}

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 30_000;

type BreakerState = { consecutiveFailures: number; openUntilMs: number };
const circuitByTool = new Map<ToolType, BreakerState>();

/** Тесты: сброс circuit breaker. */
export function resetToolCircuitBreakersForTests(): void {
  circuitByTool.clear();
}

function breakerState(tool: ToolType): BreakerState {
  return circuitByTool.get(tool) ?? { consecutiveFailures: 0, openUntilMs: 0 };
}

function isCircuitBlocking(tool: ToolType): boolean {
  return Date.now() < breakerState(tool).openUntilMs;
}

function recordToolChannelSuccess(tool: ToolType): void {
  circuitByTool.set(tool, { consecutiveFailures: 0, openUntilMs: 0 });
}

function recordToolChannelFailedRun(
  tool: ToolType,
  onHardening?: (summary: string, detail: string) => void,
): void {
  const cur = breakerState(tool);
  let failures = cur.consecutiveFailures;
  if (Date.now() >= cur.openUntilMs) failures = 0;
  failures += 1;
  let openUntilMs = 0;
  if (failures > CIRCUIT_FAILURE_THRESHOLD) {
    openUntilMs = Date.now() + CIRCUIT_COOLDOWN_MS;
    onHardening?.(
      "circuit_breaker_open",
      `${tool}:failures>${CIRCUIT_FAILURE_THRESHOLD}:cooldown_ms=${CIRCUIT_COOLDOWN_MS}`,
    );
    failures = 0;
  }
  circuitByTool.set(tool, { consecutiveFailures: failures, openUntilMs });
}

/**
 * SSOT §1.13: TTL по типу канала (мс).
 * search / ui / data — динамичнее; image — чаще смена брифа; context — статичнее.
 */
export const DEFAULT_TOOL_TTL_MS: Record<ToolType, number> = {
  search: 1000 * 60 * 60,
  ui: 1000 * 60 * 60,
  data: 1000 * 60 * 60,
  image: 1000 * 60 * 30,
  context: 1000 * 60 * 60 * 4,
};

function resolveToolTtlMs(req: ToolRequest, override?: number): number {
  if (override != null) return override;
  return DEFAULT_TOOL_TTL_MS[req.tool];
}

const DEFAULT_TOP_K = 5;

export type ToolLifecyclePhase = "start" | "end";

export type ToolLifecyclePayload = {
  tool: ToolType;
  query: string;
  /** Заполняется на phase "end" */
  summary?: string;
  cacheHit?: boolean;
  /** Провайдер вернулся с failed / пустым качеством */
  failed?: boolean;
  /** §1.15 circuit / retry */
  circuitBlocked?: boolean;
};

/**
 * Один вызов инструмента: кэш → провайдер → cap raw → ranking → top-K → tokens → feedback.
 */
export async function runTool(
  req: ToolRequest,
  options?: {
    ttl?: number;
    topK?: number;
    onLifecycle?: (phase: ToolLifecyclePhase, payload: ToolLifecyclePayload) => void;
    /** §1.15 — circuit breaker / retry (логируйте в decisionLog с оркестратора). */
    onToolHardening?: (summary: string, detail: string) => void;
  },
): Promise<ToolRunResult> {
  const ttl = resolveToolTtlMs(req, options?.ttl);
  const topK = options?.topK ?? DEFAULT_TOP_K;
  const cacheKey = buildToolCacheKey(req);
  const harden = options?.onToolHardening;

  options?.onLifecycle?.("start", { tool: req.tool, query: req.query });

  const cached = toolCache.get(cacheKey);
  if (cached && isCacheValid(cached, ttl)) {
    const body: ToolResponse = {
      ...cached.data,
      metadata: {
        ...cached.data.metadata,
        fromCache: true,
        traceId: req.traceId,
      },
    };
    if (body.metadata.tokens == null) {
      body.metadata.tokens = totalEstimatedTokens(body.summary, body.items);
    }
    options?.onLifecycle?.("end", {
      tool: req.tool,
      query: req.query,
      summary: body.summary,
      cacheHit: true,
      failed: Boolean(body.metadata.failed) || body.items.length === 0,
    });
    return { ...body, feedback: evaluateToolResponse(body) };
  }

  if (isCircuitBlocking(req.tool)) {
    harden?.("circuit_block", req.tool);
    const stub: ToolResponse = {
      summary: "Tool channel paused (circuit breaker)",
      items: [],
      metadata: { provider: "circuit-open", failed: true, traceId: req.traceId },
    };
    options?.onLifecycle?.("end", {
      tool: req.tool,
      query: req.query,
      summary: stub.summary,
      cacheHit: false,
      failed: true,
      circuitBlocked: true,
    });
    return { ...stub, feedback: evaluateToolResponse(stub) };
  }

  let raw: ToolResponse | null = null;
  let succeeded = false;

  raw = await tryLiveProvider(req);
  if (isUsableToolResponse(raw)) {
    succeeded = true;
  } else {
    harden?.("tool_retry", `${req.tool}:repeat_same`);
    raw = await tryLiveProvider(req);
    if (isUsableToolResponse(raw)) succeeded = true;
  }

  if (!succeeded) {
    harden?.("tool_retry", `${req.tool}:simplified_query`);
    raw = await tryLiveProvider({ ...req, query: simplifyToolQuery(req.query) });
    if (isUsableToolResponse(raw)) succeeded = true;
  }

  if (!succeeded) {
    harden?.("tool_retry", `${req.tool}:fallback_provider`);
    raw = await callProviderFallbackOnly(req);
    if (isUsableToolResponse(raw)) succeeded = true;
  }

  if (succeeded) {
    recordToolChannelSuccess(req.tool);
  } else {
    recordToolChannelFailedRun(req.tool, harden);
    const last =
      raw ??
      ({
        summary: "Tool hardening exhausted",
        items: [],
        metadata: { provider: "hardening-exhausted", failed: true },
      } as ToolResponse);
    raw = {
      ...last,
      metadata: { ...last.metadata, failed: true, traceId: req.traceId },
    };
  }

  if (succeeded && raw) {
    raw = {
      ...raw,
      metadata: { ...raw.metadata, traceId: req.traceId },
    };
  }

  const rawItems = (raw ?? { items: [] }).items.slice(0, MAX_RAW_ITEMS);
  const ranked = rankItems(rawItems, normalizeQuery(req.query)).slice(0, topK);

  const result: ToolResponse = {
    summary: raw?.summary ?? "",
    items: ranked,
    metadata: {
      provider: raw?.metadata.provider ?? "unknown",
      failed: raw?.metadata.failed,
      tokens: totalEstimatedTokens(raw?.summary ?? "", ranked),
      traceId: req.traceId,
      ...(raw?.metadata.dataGaps != null && raw.metadata.dataGaps.length > 0
        ? { dataGaps: raw.metadata.dataGaps }
        : {}),
    },
  };

  toolCache.set(cacheKey, { data: result, ts: Date.now() });

  options?.onLifecycle?.("end", {
    tool: req.tool,
    query: req.query,
    summary: result.summary,
    cacheHit: false,
    failed: Boolean(result.metadata.failed) || ranked.length === 0,
  });

  return {
    ...result,
    feedback: evaluateToolResponse(result),
  };
}

export type ComposedToolStep = {
  /** Уникальный id шага внутри одной композиции */
  id: string;
  tool: ToolType;
  query: string;
  agent: string;
  /** Опционально: id шага-предшественника (тот же процесс; DAG — на будущее) */
  dependsOn?: string;
};

/**
 * §1.16 Цепочка инструментов с зависимостями (минимум — линейный порядок в steps[]).
 */
export async function runComposedToolsChain(
  steps: ComposedToolStep[],
  base: Pick<ToolRequest, "intent" | "traceId"> & { sessionEpoch?: number },
  options?: {
    onLifecycle?: (phase: ToolLifecyclePhase, payload: ToolLifecyclePayload) => void;
    topK?: number;
  },
): Promise<{
  results: ToolRunResult[];
  mergedSummary: string;
}> {
  const done = new Set<string>();
  const results: ToolRunResult[] = [];
  for (const step of steps) {
    if (step.dependsOn && !done.has(step.dependsOn)) {
      throw new Error(`runComposedToolsChain: missing dependency "${step.dependsOn}" for step "${step.id}"`);
    }
    const r = await runTool(
      {
        tool: step.tool,
        query: step.query,
        agent: step.agent,
        intent: base.intent,
        traceId: base.traceId,
        sessionEpoch: base.sessionEpoch,
      },
      { topK: options?.topK, onLifecycle: options?.onLifecycle },
    );
    results.push(r);
    done.add(step.id);
  }
  const mergedSummary = results.map((x) => x.summary).join(" · ");
  return { results, mergedSummary };
}

/**
 * Канал `data`: live Tavily при наличии ключа, иначе stub с явным `metadata.dataGaps`.
 * Обёртка для вызовов вне оркестратора (диагностика, скрипты).
 */
export async function dataTool(
  query: string,
  ctx: { intent: string; traceId: string; sessionEpoch?: number; agent?: string },
  options?: {
    ttl?: number;
    topK?: number;
    onLifecycle?: (phase: ToolLifecyclePhase, payload: ToolLifecyclePayload) => void;
    onToolHardening?: (summary: string, detail: string) => void;
  },
): Promise<ToolRunResult> {
  return runTool(
    {
      tool: "data",
      query,
      agent: ctx.agent ?? "data",
      intent: ctx.intent,
      traceId: ctx.traceId,
      sessionEpoch: ctx.sessionEpoch,
    },
    options,
  );
}

export async function runComposedTools(
  intent: string,
  traceId: string,
  sessionEpoch?: number,
  options?: {
    onLifecycle?: (phase: ToolLifecyclePhase, payload: ToolLifecyclePayload) => void;
  },
): Promise<{
  summary: string;
  items: ToolItem[];
  metadata: { provider: string };
}> {
  const { results, mergedSummary } = await runComposedToolsChain(
    [
      { id: "search", tool: "search", query: intent, agent: "planner" },
      { id: "ui", tool: "ui", query: intent, agent: "architect", dependsOn: "search" },
    ],
    { intent, traceId, sessionEpoch },
    { onLifecycle: options?.onLifecycle },
  );
  const items = results.flatMap((r) => r.items);
  return {
    summary: mergedSummary,
    items,
    metadata: { provider: "composed:search+ui" },
  };
}
