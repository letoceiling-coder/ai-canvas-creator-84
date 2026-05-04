/**
 * AI Website Builder — multi-agent orchestrator (SSOT v2/v3-aligned).
 * Выдаёт SiteSchema JSON, совместимый с parseAiSiteJson / site-render.
 */

import { z } from "zod";
import { ENGINEER_SCHEMA_AUTOFIX_APPENDIX, SITE_JSON_SYSTEM_PROMPT } from "@/lib/ai-prompt";
import { JSON_OUTPUT_CRITICAL_RULES, safeParseJson } from "@/lib/json-extract";
import {
  callChatCompletionsWithFallback,
  type CallChatOptions,
  type ChatMessage,
} from "@/lib/ollama-openai";
import { parseAiSiteJson } from "@/lib/site-render";
import {
  siteSchemaSchema,
  normalizeLooseSiteSchemaInputDetailed,
  type SiteSchema,
} from "@/lib/site-schema";
import {
  ensurePlannerMemoryPlan,
  normalizePlannerRawToOutput,
  type PlannerOutput,
  type PlannerSlot,
} from "@/lib/planner-normalize";
import { layoutSchemaQA, applyLayoutReadabilityFallback } from "@/lib/layout-qa";
import {
  getToolContextIfEnabled,
  type ToolContextPack,
  type ToolInvocationRecord,
  type ToolLifecycle,
} from "@/lib/orchestrator-tools";
import { toolAwareSystemAppendix } from "@/lib/prompt-tool-aware";
import {
  DEFAULT_TOOL_CHANNEL_POLICY,
  type ToolChannelPolicy,
} from "@/lib/tools/tool-policy";
import {
  applyUsedInFinalFromArtifact,
  createComposeToolInvocationRecord,
} from "@/lib/tools/tool-invocations";
import { clearToolLayerCache } from "@/lib/tools/tool-layer";
import {
  type MemoryAndQualityConfig,
  aggregatePipelineQualityScore,
  formatAgentMemoryBlock,
  shouldSkipCriticMarketSearch,
  shouldSkipEngineerExternalTools,
  shouldSkipPlannerSearch,
} from "@/lib/agent-memory-view";
import { type DecisionLogEntry, pushDecision } from "@/lib/decision-log";
import { validateDesignSystem, type DesignSystemValidation } from "@/lib/design-system-validate";
import {
  buildLongTermSummaryPromptBatch,
  decisionLogHeadForSummary,
  heuristicLongTermSummary,
  shouldSummarizeDecisionLog,
} from "@/lib/memory-long-term";
import { finalizeSessionMetrics, createSessionMetrics, type SessionMetrics } from "@/lib/session-metrics";
import { semanticCheckSite } from "@/lib/semantic-validation";
import { templateSimilarityCheck, TEMPLATE_SIMILARITY_THRESHOLD } from "@/lib/template-detector";
import { PROMPT_VERSION, getPromptVersionsFlat } from "@/lib/prompt-registry";
export { PROMPT_VERSION };
import { combinedStaticSiteQa } from "@/lib/component-rules";
import { serverRealQa } from "@/lib/real-qa-server";
import { generateFallbackSiteSchema } from "@/lib/fallback-site";
import {
  applyHitlAction,
  defaultHitlAction,
  flattenHitlActions,
  type HitlAwaitPayload,
  type HITLAction,
} from "@/lib/hitl";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type AgentName =
  | "intent"
  | "planner"
  | "architect"
  | "engineer"
  | "critic"
  | "qa"
  | "reviewer";

export type IntentType = "landing" | "ecommerce" | "saas" | "portfolio" | "blog" | "other";

export type StyleDNA = {
  vibe: string;
  density: string;
  motion: string;
  contrast: string;
};

export type DesignSeed = {
  layout: string;
  spacing: string;
  typography: string;
  colorSystem: string;
  animationStyle: string;
};

export type { PlannerOutput, PlannerSlot } from "@/lib/planner-normalize";

export type ArchitectOutput = {
  layout: unknown;
  components: unknown[];
  designSystem: unknown;
};

export type EngineerOutput = {
  files: { path: string; content: string }[];
};

export type QualityScore = {
  design: number;
  ux: number;
  performance: number;
  accessibility: number;
};

export type QAReport = {
  issues: { id: string; message: string; severity: "low" | "high" }[];
  score: number;
};

export type CriticReport = {
  findings: string[];
  qualityScore: QualityScore;
};

export type ProjectMemory = {
  sessionId: string;
  userIntent: string;
  intentType?: IntentType;
  styleDNA?: StyleDNA;
  designSeed?: DesignSeed;
  plan?: PlannerOutput;
  architecture?: ArchitectOutput;
  code?: EngineerOutput;
  /** Успешно распарсенный сайт (после QA). */
  siteSchema?: SiteSchema;
  rawSiteJson?: string;
  decisionLog: DecisionLogEntry[];
  /** §1.13 — эпоха инвалидации tool cache; увеличивать при смене брифа в одной сессии (`bumpSessionToolEpoch`). */
  sessionGenerationEpoch: number;
  /** SSOT §2.1 — опциональные ограничения брифа. */
  constraints?: string[];
  /** Краткая история чата для §20.2 (последние реплики в compress). */
  chatHistory?: { role: "user" | "assistant"; content: string }[];
  /** SSOT §2.4 — аудит вызовов Tool Layer (inject tokens, кэш, feedback). */
  toolInvocations?: ToolInvocationRecord[];
  /** §20.2 advanced — сводка «старых» decisionLog для промпта */
  longTermSummary?: string;
  /** §13 — метрики сессии */
  sessionMetrics?: SessionMetrics;
  /** Внутреннее: длина decisionLog при последней LLM-сводке (антидребезг). */
  lastSummaryAtCount?: number;
  /** §9 — после первого HITL плана DNA считается зафиксированным для сессии. */
  styleLocked?: boolean;
  /** §2.1 — пользовательские правки (HITL и др.) */
  userEdits?: {
    type: string;
    payload: unknown;
    timestamp: number;
    checkpoint?: string;
  }[];
  /** §2.1 — привязка артефакта к версии */
  codeRef?: {
    versionId: string;
    sectionsHash: string;
    lastBuildPath?: string;
  };
  /**
   * В сессии уже было авто-исправление SiteSchema (строки в массивах блоков и т.д.).
   * Пробрасывается в engineer/critic как сигнал строго соблюдать формат.
   */
  schemaAutoFixed?: boolean;
};

export type PipelineConfig = ToolChannelPolicy &
  MemoryAndQualityConfig & {
    designIterations: number;
    qualityThreshold: number;
    enableCritic: boolean;
    enableQA: boolean;
    enableReviewer: boolean;
    parallelQaAndCritic: boolean;
    fallbackModel: string;
    jsonRepairAttempts: number;
    /** §9 — пауза после planner: подтверждение / правка плана / DNA до architect+engineer. */
    enableHITL: boolean;
    /** §20.8 — повтор engineer при провале semanticCheck до N раз за одну итерацию design loop. */
    semanticRefineMaxAttempts: number;
    /** §16 — ESLint (и опционально Lighthouse) по сгенерированному TSX. */
    enableRealQaArtifact: boolean;
    realQaMinPerformance: number;
    realQaMinAccessibility: number;
    /** §20.12 / §20.11 — низкоуровневые фазы tool; в runPipeline также мапятся в onEvent (tool_start/tool_end). */
    onToolLifecycle?: (e: ToolLifecycle) => void;
    /** §20.12 — поток токенов LLM (SSE); в runPipeline по умолчанию пробрасывается в onEvent как llm_token */
    onLlmToken?: (agent: AgentName, chunk: string) => void;
  };

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  ...DEFAULT_TOOL_CHANNEL_POLICY,
  memoryCompressionDecisionLogTail: 12,
  memoryCompressionMaxUserIntentChars: 4000,
  memoryCompressionMaxArchitectureJsonChars: 14_000,
  memoryCompressionToolInvocationsTail: 12,
  qualityScoreWeights: {
    critic: 0.4,
    qa: 0.3,
    performance: 0.3,
  },
  enableAdaptiveToolCalling: true,
  adaptiveToolMinInvocations: 4,
  adaptiveToolMinAggregateQuality: 80,
  advancedMemoryLogThreshold: 20,
  advancedMemoryKeepTail: 10,
  enableLongTermSummaryLLM: true,
  designIterations: 2,
  qualityThreshold: 80,
  enableCritic: true,
  enableQA: true,
  enableReviewer: true,
  parallelQaAndCritic: true,
  fallbackModel: "llama3:latest",
  jsonRepairAttempts: 2,
  enableHITL: false,
  semanticRefineMaxAttempts: 3,
  enableRealQaArtifact: true,
  realQaMinPerformance: 70,
  realQaMinAccessibility: 80,
};

export type PipelineEvent = {
  stage: string;
  /** 0–100; для tool_* может дублировать последний известный прогресс пайплайна */
  progress: number;
  agent?: AgentName;
  iteration?: number;
  detail?: string;
  modelUsed?: string;
  /** §20.12 — детализация при stage tool_start / tool_end */
  toolType?: string;
  toolQuery?: string;
  toolSummary?: string;
  toolCacheHit?: boolean;
  /** §9 HITL — данные для UI при `stage: await_user` */
  hitl?: HitlAwaitPayload;
  /** §20.12 SSE — фрагмент ответа LLM */
  tokenDelta?: string;
};

export type { DecisionLogEntry };
export type {
  HITLAction,
  HitlAwaitPayload,
  HITLAtomicAction,
  ArchitectSnapshot,
  ArchitecturePatch,
} from "@/lib/hitl";
export type { SessionMetrics } from "@/lib/session-metrics";

// -----------------------------------------------------------------------------
// Model router & helpers
// -----------------------------------------------------------------------------

export const MODEL_ROUTER: Record<AgentName, string> = {
  intent: "llama3:latest",
  planner: "llama3:latest",
  architect: "qwen2.5-coder:7b",
  engineer: "qwen2.5-coder:7b",
  critic: "llama3:latest",
  qa: "llama3:latest",
  reviewer: "llama3:latest",
};

function minQualityScore(q: QualityScore): number {
  return Math.min(q.design, q.ux, q.performance, q.accessibility);
}

function createSeed(): DesignSeed {
  const r = () => Math.random().toString(36).slice(2, 11);
  return {
    layout: r(),
    spacing: r(),
    typography: r(),
    colorSystem: r(),
    animationStyle: r(),
  };
}

function emit(onEvent: ((e: PipelineEvent) => void) | undefined, e: PipelineEvent) {
  onEvent?.(e);
}

async function hitlGate(
  args: { onHitl?: (p: HitlAwaitPayload) => Promise<HITLAction> },
  cfg: PipelineConfig,
  memory: ProjectMemory,
  pipelineEmit: (e: PipelineEvent) => void,
  progress: number,
  agent: AgentName,
  detail: string,
  payload: HitlAwaitPayload,
): Promise<HITLAction> {
  if (!cfg.enableHITL) {
    const action = defaultHitlAction(payload);
    applyHitlAction(memory, action);
    return action;
  }
  pipelineEmit({
    stage: "await_user",
    progress,
    agent,
    detail,
    hitl: payload,
  });
  const action = args.onHitl ? await args.onHitl(payload) : defaultHitlAction(payload);
  applyHitlAction(memory, action);
  memory.userEdits ??= [];
  memory.userEdits.push({
    type: action.type === "compound" ? "compound" : action.type,
    payload: action,
    timestamp: Date.now(),
    checkpoint: detail,
  });
  pushDecision(
    memory,
    "hitl",
    "resumed",
    JSON.stringify(
      action.type === "compound"
        ? { type: "compound", actions: action.actions.map((x) => x.type) }
        : action,
    ).slice(0, 900),
  );
  pipelineEmit({
    stage: "hitl_resumed",
    progress: Math.min(progress + 1, 99),
    agent,
    detail: action.type === "compound" ? `compound:${action.actions.length}` : action.type,
  });
  return action;
}

/** §1.13 — смена брифа/intent в рамках одной сессии памяти: новый namespace кэша + сброс Map. */
export function bumpSessionToolEpoch(memory: ProjectMemory): void {
  memory.sessionGenerationEpoch += 1;
  clearToolLayerCache();
}

function recordToolInvocation(memory: ProjectMemory, entry: ToolInvocationRecord) {
  memory.toolInvocations ??= [];
  memory.toolInvocations.push(entry);
  if (memory.sessionMetrics) {
    memory.sessionMetrics.injectTokensTotal += entry.injectTokens;
  }
}

function pushToolHardening(memory: ProjectMemory, summary: string, detail: string): void {
  pushDecision(memory, "tool", summary, detail.slice(0, 900));
}

async function callAgent(
  agent: AgentName,
  messages: ChatMessage[],
  cfg: PipelineConfig,
  options: CallChatOptions,
): Promise<{ content: string; modelUsed: string }> {
  const primary = MODEL_ROUTER[agent];
  const fallbacks = primary === cfg.fallbackModel ? [] : [cfg.fallbackModel];
  const mergedOpts: CallChatOptions = {
    ...options,
    onTokenChunk:
      cfg.onLlmToken || options.onTokenChunk
        ? (chunk: string) => {
            cfg.onLlmToken?.(agent, chunk);
            options.onTokenChunk?.(chunk);
          }
        : undefined,
  };
  return callChatCompletionsWithFallback(primary, fallbacks, messages, mergedOpts);
}

async function refreshLongTermSummaryIfNeeded(
  memory: ProjectMemory,
  cfg: PipelineConfig,
  callOpts: CallChatOptions,
): Promise<void> {
  const thr = cfg.advancedMemoryLogThreshold;
  if (thr <= 0 || !shouldSummarizeDecisionLog(memory.decisionLog.length, thr)) return;
  const lastAt = memory.lastSummaryAtCount ?? 0;
  if (memory.decisionLog.length - lastAt < 3) return;
  const batch = decisionLogHeadForSummary(memory.decisionLog, cfg.advancedMemoryKeepTail);
  if (batch.length === 0) return;
  const { system, user } = buildLongTermSummaryPromptBatch(
    batch,
    memory.longTermSummary,
    12000,
  );
  if (cfg.enableLongTermSummaryLLM) {
    const { content, modelUsed } = await callAgent(
      "intent",
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      cfg,
      callOpts,
    );
    memory.longTermSummary = content.trim().slice(0, 8000);
    pushDecision(
      memory,
      "pipeline",
      "long_term_summary_llm",
      `model:${modelUsed} batch:${batch.length}`,
    );
  } else {
    memory.longTermSummary = heuristicLongTermSummary(batch);
    pushDecision(memory, "pipeline", "long_term_summary_heuristic", `batch:${batch.length}`);
  }
  memory.lastSummaryAtCount = memory.decisionLog.length;
}

// -----------------------------------------------------------------------------
// JSON helpers & zod
// -----------------------------------------------------------------------------

const intentSchema = z.object({
  intentType: z.enum(["landing", "ecommerce", "saas", "portfolio", "blog", "other"]),
});

const architectSchema = z.object({
  layout: z.unknown(),
  components: z.array(z.unknown()),
  designSystem: z.unknown(),
});

const qualityScoreSchema = z.object({
  design: z.number().min(0).max(100),
  ux: z.number().min(0).max(100),
  performance: z.number().min(0).max(100),
  accessibility: z.number().min(0).max(100),
});

const criticSchema = z.object({
  findings: z.array(z.string()),
  qualityScore: qualityScoreSchema,
});

function safeParseJSON<T>(
  text: string,
  schema: z.ZodType<T>,
): { ok: true; data: T } | { ok: false; error: string } {
  const parsed = safeParseJson<unknown>(text);
  if (!parsed.ok) {
    return { ok: false, error: "invalid_json" };
  }
  const r = schema.safeParse(parsed.data);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: r.error.message };
}

type ParsedSiteSchemaOk = { ok: true; data: SiteSchema; schemaAutoFixed: boolean };

type ParsedSiteSchema = ParsedSiteSchemaOk | { ok: false; error: string };

function tryParseSiteSchema(raw: string): ParsedSiteSchema {
  let parsed: unknown;
  try {
    parsed = parseAiSiteJson(raw);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "JSON-parse-error",
    };
  }
  const { value, schemaAutoFixed } = normalizeLooseSiteSchemaInputDetailed(parsed);
  const v = siteSchemaSchema.safeParse(value);
  if (v.success) return { ok: true, data: v.data, schemaAutoFixed };
  return { ok: false, error: v.error.message };
}

// -----------------------------------------------------------------------------
// Structural & component QA (локально, без LLM)
// -----------------------------------------------------------------------------

function siteSectionsFingerprint(site: SiteSchema): string {
  const blocks = [...site.pages, ...site.sections, ...site.components];
  const s = blocks.map((b) => b.type).join("\0");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function staticSiteQaReport(site: SiteSchema): QAReport {
  const r = combinedStaticSiteQa(site);
  return { issues: r.issues, score: r.score };
}

/** Структурная QA + data-tool (инжект без LLM): лог и лёгкий бонус к score. */
async function qaWithToolContext(
  memory: ProjectMemory,
  site: SiteSchema,
  cfg: PipelineConfig,
): Promise<QAReport> {
  const base = staticSiteQaReport(site);
  const data = await getToolContextIfEnabled(
    cfg,
    {
      tool: "data",
      query: `UX best practices ${memory.userIntent.slice(0, 200)}`,
      agent: "qa",
      intent: memory.userIntent,
      traceId: memory.sessionId,
      sessionEpoch: memory.sessionGenerationEpoch,
      onInvocation: (e) => recordToolInvocation(memory, e),
      onToolPhase: cfg.onToolLifecycle,
      onToolHardening: (s, d) => pushToolHardening(memory, s, d),
    },
    { onSkipped: (r) => pushDecision(memory, "tool", "channel_skipped", r) },
  );
  pushDecision(
    memory,
    "qa",
    "data_tool",
    `tokens:${data.tokens} feedbackQ:${data.feedback.quality}`,
  );
  let score = base.score;
  if (
    !base.issues.some((i) => i.severity === "high") &&
    data.feedback.quality >= 70
  ) {
    score = Math.min(100, score + 2);
  }
  return { ...base, score };
}

// -----------------------------------------------------------------------------
// Agents
// -----------------------------------------------------------------------------

async function classifyIntent(
  memory: ProjectMemory,
  cfg: PipelineConfig,
  callOpts: CallChatOptions,
): Promise<void> {
  const sys = `Ты классификатор. Верни ТОЛЬКО JSON без markdown: {"intentType":"landing"|"ecommerce"|"saas"|"portfolio"|"blog"|"other"}.
Интерпретируй весь userIntent целиком (в т.ч. доработки к уже готовому сайту). Не проси уточнений у пользователя.
promptVersion: ${PROMPT_VERSION.intent}${JSON_OUTPUT_CRITICAL_RULES}`;
  const userPayload = `${formatAgentMemoryBlock(memory, "intent", cfg)}\n\nКлассифицируй намерение по полю userIntent в view выше.`;
  const { content, modelUsed } = await callAgent(
    "intent",
    [
      { role: "system", content: sys },
      { role: "user", content: userPayload },
    ],
    cfg,
    callOpts,
  );
  const p = safeParseJSON(content, intentSchema);
  if (p.ok) {
    memory.intentType = p.data.intentType;
  } else {
    pushDecision(memory, "intent", "json_fallback_used", `intent default landing: ${p.error}`);
    memory.intentType = "landing";
  }
  pushDecision(memory, "intent", `classified:${memory.intentType}`, `model:${modelUsed}`);
}

function briefComposeDigest(a?: string, b?: string): string | undefined {
  const s = `${a ?? ""} ${b ?? ""}`.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
  return s.length >= 12 ? s : undefined;
}

async function planner(
  memory: ProjectMemory,
  cfg: PipelineConfig,
  callOpts: CallChatOptions,
): Promise<void> {
  const traceId = memory.sessionId;
  const childIds: string[] = [];
  const audit = (e: ToolInvocationRecord) => {
    recordToolInvocation(memory, e);
    childIds.push(e.id);
  };
  const skipLog = { onSkipped: (r: string) => pushDecision(memory, "tool", "channel_skipped", r) };
  const skipSearch = shouldSkipPlannerSearch({
    cfg,
    memory,
    userIntent: memory.userIntent,
  });
  if (skipSearch) {
    pushDecision(memory, "planner", "adaptive_skip_search", "warm_cache+quality");
  }

  const emptyPack = (): ToolContextPack => ({
    text: "",
    feedback: { useful: false, quality: 0 },
    tokens: 0,
    summary: undefined,
  });

  const [examples, dataCtx] = await Promise.all([
    skipSearch
      ? Promise.resolve(emptyPack())
      : getToolContextIfEnabled(
          cfg,
          {
            tool: "search",
            query: `best ${memory.userIntent} website examples`,
            agent: "planner",
            intent: memory.userIntent,
            traceId,
            sessionEpoch: memory.sessionGenerationEpoch,
            onInvocation: audit,
            onToolPhase: cfg.onToolLifecycle,
            onToolHardening: (s, d) => pushToolHardening(memory, s, d),
          },
          skipLog,
        ),
    getToolContextIfEnabled(
      cfg,
      {
        tool: "data",
        query: memory.userIntent,
        agent: "planner",
        intent: memory.userIntent,
        traceId,
        sessionEpoch: memory.sessionGenerationEpoch,
        onInvocation: audit,
        onToolPhase: cfg.onToolLifecycle,
        onToolHardening: (s, d) => pushToolHardening(memory, s, d),
      },
      skipLog,
    ),
  ]);
  pushDecision(
    memory,
    "planner",
    "parallel_tools",
    `search~${examples.tokens} data~${dataCtx.tokens}`,
  );

  if (childIds.length > 0) {
    recordToolInvocation(
      memory,
      createComposeToolInvocationRecord({
        childIds,
        traceId,
        injectTokens: examples.tokens + dataCtx.tokens,
        summary: "compose:planner:search+data",
        injectDigest: briefComposeDigest(examples.summary, dataCtx.summary),
        agent: "planner",
      }),
    );
  }

  const sys = `Спланируй лендинг. Верни ТОЛЬКО JSON-объект.

PLAN SHAPE RULES:
- "pages" и "sections" — массив объектов вида {"type":"hero"}, либо массив строк-имён блоков; внутри одного массива формат не смешивай.
- "goals" — массив строк целей; если нечего добавить — ["generate landing page"].
- Допустимые типы секций: hero, features, benefits, cta, footer, about, gallery, pricing, page, text.

Форма: {"pages":[...], "sections":[...], "goals":[...]}. Учти REAL EXAMPLES / REAL DATA. promptVersion: ${PROMPT_VERSION.planner}
${toolAwareSystemAppendix(cfg)}${JSON_OUTPUT_CRITICAL_RULES}`;
  const userBlock = `${formatAgentMemoryBlock(memory, "planner", cfg)}

REAL EXAMPLES:
${examples.text}

REAL DATA:
${dataCtx.text}`;

  const { content, modelUsed } = await callAgent(
    "planner",
    [
      { role: "system", content: sys },
      { role: "user", content: userBlock },
    ],
    cfg,
    callOpts,
  );
  let planObj: unknown = undefined;
  let usedFallback = false;
  const primary = safeParseJson<unknown>(content);
  if (primary.ok) {
    planObj = primary.data;
    if (primary.repaired) {
      pushDecision(memory, "planner", "json_repair_attempt", "extractor repaired primary");
    }
  } else {
    pushDecision(memory, "planner", "json_parse_failed", "planner primary invalid_json");
    const strict = await callAgent(
      "planner",
      [
        {
          role: "system",
          content: `Верни строго валидный JSON: {"pages":[],"sections":[],"goals":[]}. pages и sections — массивы объектов {"type":"hero"} (допустимы и строки-синонимы). goals — строки.${JSON_OUTPUT_CRITICAL_RULES}`,
        },
        { role: "user", content: userBlock },
      ],
      cfg,
      callOpts,
    );
    const retry = safeParseJson<unknown>(strict.content);
    if (retry.ok) {
      planObj = retry.data;
      pushDecision(memory, "planner", "json_repair_attempt", "planner retry recovered");
    } else {
      pushDecision(memory, "planner", "json_fallback_used", "planner default plan");
      usedFallback = true;
    }
  }
  memory.plan = normalizePlannerRawToOutput(planObj ?? {});
  pushDecision(
    memory,
    "planner",
    usedFallback ? "plan_saved_fallback" : "plan_saved",
    `model:${modelUsed}`,
  );
}

async function architect(
  memory: ProjectMemory,
  cfg: PipelineConfig,
  callOpts: CallChatOptions,
): Promise<void> {
  memory.plan = ensurePlannerMemoryPlan(memory.plan);
  const ui = await getToolContextIfEnabled(
    cfg,
    {
      tool: "ui",
      query: memory.intentType ?? memory.userIntent,
      agent: "architect",
      intent: memory.userIntent,
      traceId: memory.sessionId,
      sessionEpoch: memory.sessionGenerationEpoch,
      onInvocation: (e) => recordToolInvocation(memory, e),
      onToolPhase: cfg.onToolLifecycle,
      onToolHardening: (s, d) => pushToolHardening(memory, s, d),
    },
    { onSkipped: (r) => pushDecision(memory, "tool", "channel_skipped", r) },
  );
  pushDecision(memory, "architect", "ui_tool", `tokens:${ui.tokens}`);

  const sys = `Ты архитектор UI. По плану верни ТОЛЬКО JSON: {"layout":{},"components":[],"designSystem":{}}.
layout и designSystem — свободные объекты. Учти UI PATTERNS из user. promptVersion: ${PROMPT_VERSION.architect}
${toolAwareSystemAppendix(cfg)}${JSON_OUTPUT_CRITICAL_RULES}`;
  const userBlock = `${formatAgentMemoryBlock(memory, "architect", cfg)}

UI PATTERNS:
${ui.text}`;

  const { content, modelUsed } = await callAgent(
    "architect",
    [
      { role: "system", content: sys },
      { role: "user", content: userBlock },
    ],
    cfg,
    callOpts,
  );
  let p = safeParseJSON(content, architectSchema);
  if (!p.ok) {
    pushDecision(memory, "architect", "json_parse_failed", `architect primary: ${p.error}`);
    const strict = await callAgent(
      "architect",
      [
        {
          role: "system",
          content: `Строго JSON с ключами layout (object), components (array), designSystem (object).${JSON_OUTPUT_CRITICAL_RULES}`,
        },
        { role: "user", content: userBlock },
      ],
      cfg,
      callOpts,
    );
    p = safeParseJSON(strict.content, architectSchema);
    if (!p.ok) {
      pushDecision(memory, "architect", "json_fallback_used", `architect default after retry: ${p.error}`);
      memory.architecture = {
        layout: memory.architecture?.layout ?? {},
        components: Array.isArray(memory.architecture?.components)
          ? memory.architecture!.components
          : [],
        designSystem: memory.architecture?.designSystem ?? {},
      };
      pushDecision(memory, "architect", "architecture_default", `model:${modelUsed}`);
      return;
    }
    pushDecision(memory, "architect", "json_repair_attempt", "architect retry recovered");
  }
  memory.architecture = {
    layout: p.data.layout ?? {},
    components: p.data.components,
    designSystem: p.data.designSystem ?? {},
  };
  pushDecision(memory, "architect", "architecture_saved", `model:${modelUsed}`);
}

/** §7 — одна попытка исправить designSystem по результатам validateDesignSystem. */
async function architectRepairDesignSystem(
  memory: ProjectMemory,
  cfg: PipelineConfig,
  callOpts: CallChatOptions,
  validation: DesignSystemValidation,
): Promise<void> {
  const ui = await getToolContextIfEnabled(
    cfg,
    {
      tool: "ui",
      query: memory.intentType ?? memory.userIntent,
      agent: "architect",
      intent: memory.userIntent,
      traceId: memory.sessionId,
      sessionEpoch: memory.sessionGenerationEpoch,
      onInvocation: (e) => recordToolInvocation(memory, e),
      onToolPhase: cfg.onToolLifecycle,
      onToolHardening: (s, d) => pushToolHardening(memory, s, d),
    },
    { onSkipped: (r) => pushDecision(memory, "tool", "channel_skipped", r) },
  );

  const sys = `Ты архитектор UI. designSystem в PREV_ARCHITECTURE не проходит проверку. Верни ТОЛЬКО JSON: {"layout":{},"components":[],"designSystem":{}}
Исправь designSystem: контраст пар цветов (≥4.5:1 для UI текста где возможно), шкала spacing (массив или объект положительных ступеней), typography (fontFamily или fonts + размеры).
Ошибки: ${validation.allIssues.join("; ")}
promptVersion: ${PROMPT_VERSION.architect}
${toolAwareSystemAppendix(cfg)}${JSON_OUTPUT_CRITICAL_RULES}`;

  const userBlock = `${formatAgentMemoryBlock(memory, "architect", cfg)}

UI PATTERNS:
${ui.text}

PREV_ARCHITECTURE:
${JSON.stringify(memory.architecture).slice(0, 14_000)}`;

  const { content, modelUsed } = await callAgent(
    "architect",
    [
      { role: "system", content: sys },
      { role: "user", content: userBlock },
    ],
    cfg,
    callOpts,
  );
  let p = safeParseJSON(content, architectSchema);
  if (!p.ok) {
    pushDecision(memory, "architect", "json_parse_failed", `repair primary: ${p.error}`);
    const strict = await callAgent(
      "architect",
      [
        {
          role: "system",
          content: `Строго JSON layout+components+designSystem.${JSON_OUTPUT_CRITICAL_RULES}`,
        },
        { role: "user", content: userBlock },
      ],
      cfg,
      callOpts,
    );
    p = safeParseJSON(strict.content, architectSchema);
    if (!p.ok) {
      pushDecision(memory, "architect", "json_fallback_used", `repair default: ${p.error}`);
      pushDecision(memory, "architect", "design_system_repair_failed", p.error);
      return;
    }
    pushDecision(memory, "architect", "json_repair_attempt", "repair retry recovered");
  }
  memory.architecture = {
    layout: p.data.layout ?? memory.architecture?.layout ?? {},
    components: p.data.components ?? memory.architecture?.components ?? [],
    designSystem: p.data.designSystem ?? {},
  };
  pushDecision(memory, "architect", "design_system_repaired", `model:${modelUsed}`);
}

async function engineerSiteJson(
  memory: ProjectMemory,
  cfg: PipelineConfig,
  callOpts: CallChatOptions,
  repairHint?: string,
  loopContext?: { designLoopIndex: number; previousAggregateQuality?: number },
): Promise<{ raw: string; modelUsed: string }> {
  memory.plan = ensurePlannerMemoryPlan(memory.plan);
  const traceId = memory.sessionId;
  const audit = (e: ToolInvocationRecord) => recordToolInvocation(memory, e);
  const skipLog = { onSkipped: (r: string) => pushDecision(memory, "tool", "channel_skipped", r) };

  const emptyPack = (): ToolContextPack => ({
    text: "",
    feedback: { useful: false, quality: 0 },
    tokens: 0,
    summary: undefined,
  });

  const skipExternal = shouldSkipEngineerExternalTools({
    cfg,
    memory,
    designLoopIndex: loopContext?.designLoopIndex ?? 0,
    previousAggregateQuality: loopContext?.previousAggregateQuality,
  });

  let docs: ToolContextPack;
  let images: ToolContextPack;

  if (skipExternal) {
    pushDecision(
      memory,
      "engineer",
      "adaptive_skip_external_tools",
      `prevAgg=${loopContext?.previousAggregateQuality ?? "n/a"} inv=${memory.toolInvocations?.length ?? 0}`,
    );
    docs = emptyPack();
    images = emptyPack();
  } else {
    [docs, images] = await Promise.all([
      getToolContextIfEnabled(
        cfg,
        {
          tool: "context",
          query: "react tailwind framer motion best practices",
          agent: "engineer",
          intent: memory.userIntent,
          traceId,
          sessionEpoch: memory.sessionGenerationEpoch,
          onInvocation: audit,
          onToolPhase: cfg.onToolLifecycle,
          onToolHardening: (s, d) => pushToolHardening(memory, s, d),
        },
        skipLog,
      ),
      getToolContextIfEnabled(
        cfg,
        {
          tool: "image",
          query: memory.userIntent,
          agent: "engineer",
          intent: memory.userIntent,
          traceId,
          sessionEpoch: memory.sessionGenerationEpoch,
          onInvocation: audit,
          onToolPhase: cfg.onToolLifecycle,
          onToolHardening: (s, d) => pushToolHardening(memory, s, d),
        },
        skipLog,
      ),
    ]);
  }

  pushDecision(
    memory,
    "engineer",
    "context_image_tools",
    `context~${docs.tokens} image~${images.tokens}`,
  );

  const memBlock = formatAgentMemoryBlock(memory, "engineer", cfg);
  const userBits = [
    memBlock,
    `BEST PRACTICES (docs):\n${docs.text}`,
    `IMAGES (URLs / refs):\n${images.text}`,
    repairHint ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { content, modelUsed } = await callAgent(
    "engineer",
    [
      {
        role: "system",
        content: `${SITE_JSON_SYSTEM_PROMPT}
${toolAwareSystemAppendix(cfg)}${memory.schemaAutoFixed ? ENGINEER_SCHEMA_AUTOFIX_APPENDIX : ""}${JSON_OUTPUT_CRITICAL_RULES}`,
      },
      { role: "user", content: userBits },
    ],
    cfg,
    callOpts,
  );
  return { raw: content, modelUsed };
}

async function selfCorrectSiteJson(
  memory: ProjectMemory,
  cfg: PipelineConfig,
  callOpts: CallChatOptions,
  broken: string,
  err: string,
): Promise<{ raw: string; modelUsed: string }> {
  const sys = `${SITE_JSON_SYSTEM_PROMPT}

Исправь JSON ниже. Ошибка: ${err}
Верни ТОЛЬКО исправленный сырой JSON (без markdown). promptVersion: ${PROMPT_VERSION.engineer}${memory.schemaAutoFixed ? ENGINEER_SCHEMA_AUTOFIX_APPENDIX : ""}${JSON_OUTPUT_CRITICAL_RULES}`;
  return callAgent(
    "engineer",
    [
      { role: "system", content: sys },
      {
        role: "user",
        content: `${formatAgentMemoryBlock(memory, "engineer", cfg)}\n\n---\nBROKEN_JSON:\n${broken}`,
      },
    ],
    cfg,
    callOpts,
  ).then((r) => ({ raw: r.content, modelUsed: r.modelUsed }));
}

/** Layout QA fixer: правит spacing/читаемость по списку замечаний (тот же канал, что engineer). */
async function fixerSiteJsonForLayout(
  memory: ProjectMemory,
  cfg: PipelineConfig,
  callOpts: CallChatOptions,
  site: SiteSchema,
  issues: string[],
): Promise<{ raw: string; modelUsed: string }> {
  const blob = issues.slice(0, 24).join("\n");
  const sys = `${SITE_JSON_SYSTEM_PROMPT}

Ты FIXER: исправь вёрстку и читаемость по замечаниям ниже. Сохрани структуру секций и смысл брифа.
- Увеличь font-size слабых блоков (минимум ~15–16px эквивалент в clamp/rem).
- line-height не ниже 1.25–1.45.
- padding/margin/gap секций разумные (не «слипшиеся» блоки).
- Убери риск наложений: меньше position:absolute без необходимости.

Замечания:
${blob}

Верни ТОЛЬКО полный валидный JSON SiteSchema (сырой JSON). promptVersion: ${PROMPT_VERSION.engineer}${JSON_OUTPUT_CRITICAL_RULES}`;
  const user = `${formatAgentMemoryBlock(memory, "engineer", cfg)}

CURRENT_SITE_JSON:
${JSON.stringify(site).slice(0, 16_000)}`;
  return callAgent(
    "engineer",
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    cfg,
    callOpts,
  ).then((r) => ({ raw: r.content, modelUsed: r.modelUsed }));
}

async function critic(
  memory: ProjectMemory,
  rawJson: string,
  cfg: PipelineConfig,
  callOpts: CallChatOptions,
  loopCtx?: { iteration: number; previousAggregateQuality?: number },
): Promise<CriticReport> {
  const skipMarket =
    loopCtx != null &&
    shouldSkipCriticMarketSearch({
      cfg,
      memory,
      loopIteration: loopCtx.iteration,
      previousAggregateQuality: loopCtx.previousAggregateQuality,
    });
  if (skipMarket) {
    pushDecision(memory, "critic", "adaptive_skip_market_search", `iter=${loopCtx?.iteration}`);
  }

  const emptyPack = (): ToolContextPack => ({
    text: "",
    feedback: { useful: false, quality: 0 },
    tokens: 0,
    summary: undefined,
  });

  const market = skipMarket
    ? emptyPack()
    : await getToolContextIfEnabled(
        cfg,
        {
          tool: "search",
          query: "top modern landing pages",
          agent: "critic",
          intent: memory.userIntent,
          traceId: memory.sessionId,
          sessionEpoch: memory.sessionGenerationEpoch,
          onInvocation: (e) => recordToolInvocation(memory, e),
          onToolPhase: cfg.onToolLifecycle,
          onToolHardening: (s, d) => pushToolHardening(memory, s, d),
        },
        { onSkipped: (r) => pushDecision(memory, "tool", "channel_skipped", r) },
      );
  pushDecision(memory, "critic", "market_search", `tokens:${market.tokens}`);

  const sys = `Ты design/UX критик. Оцени черновик сайта (JSON).
Верни ТОЛЬКО JSON: {"findings": string[], "qualityScore": {"design":0-100,"ux":0-100,"performance":0-100,"accessibility":0-100}}
Учитывай: герой и цели сайта, логичность CTA, противоречия между блоками, соответствие рыночным трендам (MARKET).
promptVersion: ${PROMPT_VERSION.critic}
${toolAwareSystemAppendix(cfg)}${JSON_OUTPUT_CRITICAL_RULES}`;

  const siteSlice = rawJson.slice(0, 12_000);
  const userCritic = `${formatAgentMemoryBlock(memory, "critic", cfg)}

MARKET / refs:
${market.text}

SITE JSON:
${siteSlice}`;

  const run = async (strict: boolean) => {
    const s = strict ? `${sys}\nСтрого числа 0-100, только JSON.` : sys;
    const { content } = await callAgent(
      "critic",
      [
        { role: "system", content: s },
        {
          role: "user",
          content: userCritic,
        },
      ],
      cfg,
      callOpts,
    );
    return safeParseJSON(content, criticSchema);
  };

  let p = await run(false);
  if (!p.ok) p = await run(true);
  if (!p.ok) {
    return {
      findings: [`critic-parse: ${p.error}`],
      qualityScore: {
        design: 70,
        ux: 70,
        performance: 70,
        accessibility: 70,
      },
    };
  }
  return p.data;
}

async function reviewerPolish(
  memory: ProjectMemory,
  rawJson: string,
  cfg: PipelineConfig,
  callOpts: CallChatOptions,
): Promise<{ raw: string; modelUsed: string }> {
  const sys = `Ты редактор. Улучши JSON сайта (типографика-формулировки, консистентность), не ломая структуру SiteSchema.
Верни ТОЛЬКО сырой JSON. promptVersion: ${PROMPT_VERSION.reviewer}`;
  const { content, modelUsed } = await callAgent(
    "reviewer",
    [
      { role: "system", content: sys },
      {
        role: "user",
        content: `${formatAgentMemoryBlock(memory, "reviewer", cfg)}\n\n---\n${rawJson.slice(0, 18_000)}`,
      },
    ],
    cfg,
    callOpts,
  );
  return { raw: content, modelUsed };
}

// -----------------------------------------------------------------------------
// Progress
// -----------------------------------------------------------------------------

function progressForStage(
  stage: "intent" | "plan" | "arch" | "loop" | "review" | "done",
  loopIndex: number,
  loopTotal: number,
): number {
  const base = {
    intent: [0, 8],
    plan: [8, 22],
    arch: [22, 38],
    loop: [38, 88],
    review: [88, 97],
    done: [100, 100],
  } as const;
  if (stage === "loop" && loopTotal > 0) {
    const [a, b] = base.loop;
    return Math.round(a + ((b - a) * loopIndex) / loopTotal);
  }
  return base[stage][0];
}

// -----------------------------------------------------------------------------
// Core pipeline
// -----------------------------------------------------------------------------

export async function runPipeline(args: {
  prompt: string;
  onEvent?: (event: PipelineEvent) => void;
  signal?: AbortSignal;
  config?: Partial<PipelineConfig>;
  /** Не транслировать токены LLM в onEvent (меньше шума в UI). */
  disableLlmTokenStream?: boolean;
  /** §9 — вызывается при `enableHITL`; пока Promise не resolved, пайплайн ждёт. */
  onHitl?: (payload: HitlAwaitPayload) => Promise<HITLAction>;
  /** Сид Style DNA из UI до первого HITL (не переписывает pipeline). */
  initialStyleDNA?: StyleDNA;
}): Promise<ProjectMemory> {
  const cfgBase: PipelineConfig = { ...DEFAULT_PIPELINE_CONFIG, ...args.config };
  const callOpts: CallChatOptions = { signal: args.signal, maxRetries: 2 };

  let lastPipelineProgress = 0;
  const pipelineEmit = (e: PipelineEvent) => {
    if (typeof e.progress === "number" && e.progress >= 0) lastPipelineProgress = e.progress;
    emit(args.onEvent, e);
  };

  const memory: ProjectMemory = {
    sessionId: crypto.randomUUID(),
    userIntent: args.prompt,
    decisionLog: [],
    sessionGenerationEpoch: 0,
    sessionMetrics: createSessionMetrics(),
    ...(args.initialStyleDNA
      ? { styleDNA: { ...args.initialStyleDNA } }
      : {}),
  };
  if (memory.sessionMetrics) {
    memory.sessionMetrics.promptVersions = getPromptVersionsFlat();
    memory.sessionMetrics.partialRegens = 0;
    memory.sessionMetrics.iterationsFix = 0;
    memory.sessionMetrics.realQaRuns = 0;
    memory.sessionMetrics.realQaPassCount = 0;
  }

  const userToolHook = cfgBase.onToolLifecycle;
  const userLlmHook = cfgBase.onLlmToken;

  const cfg: PipelineConfig = {
    ...cfgBase,
    onToolLifecycle: (info) => {
      userToolHook?.(info);
      if (info.phase === "end" && memory.sessionMetrics) {
        memory.sessionMetrics.toolCallsCompleted += 1;
        if (info.failed) memory.sessionMetrics.toolFailures += 1;
      }
      pipelineEmit({
        stage: info.phase === "start" ? "tool_start" : "tool_end",
        progress: lastPipelineProgress,
        detail:
          info.phase === "start"
            ? `${info.tool}: ${info.query.slice(0, 200)}`
            : `${info.tool}: ${(info.summary ?? "").slice(0, 240)} hit=${info.cacheHit ?? false}`,
        toolType: info.tool,
        toolQuery: info.query,
        toolSummary: info.summary,
        toolCacheHit: info.cacheHit,
      });
    },
    onLlmToken:
      args.disableLlmTokenStream === true
        ? userLlmHook
        : (agent, chunk) => {
            userLlmHook?.(agent, chunk);
            pipelineEmit({
              stage: "llm_token",
              progress: lastPipelineProgress,
              agent,
              tokenDelta: chunk,
            });
          },
  };

  try {
    pipelineEmit({ stage: "intent", progress: 0, agent: "intent" });
    await classifyIntent(memory, cfg, callOpts);
    pipelineEmit({ stage: "intent", progress: 8, agent: "intent" });

    pipelineEmit({ stage: "planner", progress: 10, agent: "planner" });
    await planner(memory, cfg, callOpts);
    pipelineEmit({ stage: "planner", progress: 22, agent: "planner" });

    const planSnap = memory.plan ?? { pages: [], sections: [], goals: [] };
    const planHitlPayload: HitlAwaitPayload = {
      checkpoint: "confirm_plan",
      plan: {
        pages: [...planSnap.pages],
        sections: [...planSnap.sections],
        goals: [...planSnap.goals],
      },
      styleDNA: memory.styleDNA ? { ...memory.styleDNA } : undefined,
    };
    await hitlGate(args, cfg, memory, pipelineEmit, 22, "planner", "confirm_plan", planHitlPayload);
    memory.styleLocked = true;

    memory.designSeed = createSeed();

    pipelineEmit({ stage: "architect", progress: 24, agent: "architect" });
    await architect(memory, cfg, callOpts);
    const dsVal = validateDesignSystem(memory.architecture?.designSystem);
    pushDecision(
      memory,
      "architect",
      "design_system_validation",
      dsVal.hasErrors ? dsVal.allIssues.join("; ") : "ok",
    );
    if (dsVal.hasErrors) {
      await architectRepairDesignSystem(memory, cfg, callOpts, dsVal);
      const ds2 = validateDesignSystem(memory.architecture?.designSystem);
      pushDecision(
        memory,
        "architect",
        "design_system_revalidation",
        ds2.hasErrors ? ds2.allIssues.join("; ") : "ok",
      );
    }
    pipelineEmit({ stage: "architect", progress: 38, agent: "architect" });

    const arch = memory.architecture;
    const archHitlPayload: HitlAwaitPayload = {
      checkpoint: "confirm_architecture",
      architecture: {
        layout: arch?.layout ?? {},
        components: Array.isArray(arch?.components) ? [...(arch.components as unknown[])] : [],
        designSystem: arch?.designSystem ?? {},
      },
      architectureJson: JSON.stringify(
        arch ?? { layout: {}, components: [], designSystem: {} },
        null,
        2,
      ).slice(0, 14_000),
      planSections: (memory.plan?.sections ?? []).map((s) => s.type),
    };
    await hitlGate(args, cfg, memory, pipelineEmit, 38, "architect", "confirm_architecture", archHitlPayload);

    let iteration = 0;
    let rawSiteJson = "";
    let lastModel = "";
    let previousAggregateQuality: number | undefined;
    let postProcessHint = "";

    while (iteration < cfg.designIterations) {
      const prog = progressForStage("loop", iteration, cfg.designIterations);
      const innerCap = 28;
      let innerStep = 0;
      let needEngineer = true;
      let needDraftHitl = cfg.enableHITL && iteration === 0;
      let semTry = 0;
      /** Один бонусный прогон engineer, если схема потребовала серверной нормализации. */
      let schemaStrictRetryUsed = false;
      let parsed: ParsedSiteSchemaOk | null = null;

      inner: while (innerStep < innerCap) {
        innerStep += 1;
        if (needEngineer) {
          pipelineEmit({
            stage: "engineer",
            progress: prog,
            agent: "engineer",
            iteration,
          });
          const engineerHint = [
            iteration > 0
              ? `Итерация улучшения ${iteration}: учти decisionLog и подтяни качество.`
              : "",
            postProcessHint,
          ]
            .filter(Boolean)
            .join("\n\n");
          postProcessHint = "";
          let engineered = await engineerSiteJson(
            memory,
            cfg,
            callOpts,
            engineerHint || undefined,
            { designLoopIndex: iteration, previousAggregateQuality },
          );
          lastModel = engineered.modelUsed;
          let p = tryParseSiteSchema(engineered.raw);
          let attempts = 0;
          while (!p.ok && attempts < cfg.jsonRepairAttempts) {
            pipelineEmit({
              stage: "engineer_fix",
              progress: prog,
              detail: p.error,
              iteration,
            });
            engineered = await selfCorrectSiteJson(memory, cfg, callOpts, engineered.raw, p.error);
            lastModel = engineered.modelUsed;
            p = tryParseSiteSchema(engineered.raw);
            attempts += 1;
          }
          if (!p.ok) {
            pushDecision(
              memory,
              "engineer",
              "json_fallback_used",
              `engineer fallback site after ${cfg.jsonRepairAttempts} repairs: ${p.error}`,
            );
            const fb = generateFallbackSiteSchema(memory.userIntent);
            p = { ok: true, data: fb, schemaAutoFixed: true };
            memory.schemaAutoFixed = true;
          }
          if (p.schemaAutoFixed) {
            memory.schemaAutoFixed = true;
            if (!schemaStrictRetryUsed) {
              schemaStrictRetryUsed = true;
              pushDecision(
                memory,
                "pipeline",
                "schema_autofixed_retry_engineer",
                "Normalized loose schema; strict JSON retry.",
              );
              postProcessHint = `Схема была автоматически приведена к виду SiteSchema (строки в массивах и т.д.). Пересобери тот же замысел в строго валидном JSON: только объекты в pages/sections/components, content всегда объект.`;
              needEngineer = true;
              parsed = null;
              continue inner;
            }
            pushDecision(
              memory,
              "pipeline",
              "schema_autofixed_accept",
              "Accepting normalized schema after engineer retry.",
            );
          }
          parsed = p;
          needEngineer = false;
          semTry = 0;
        }

        if (!parsed) throw new Error("Engineer: draft inner loop без parse");

        rawSiteJson = JSON.stringify(parsed.data);
        memory.rawSiteJson = rawSiteJson;

        if (needDraftHitl) {
          const preQa = combinedStaticSiteQa(parsed.data);
          const draftPayload: HitlAwaitPayload = {
            checkpoint: "review_draft",
            preview: rawSiteJson.slice(0, 12_000),
            sectionOptions: (parsed.data.sections ?? []).map((s, i) => ({
              id: `${s.type}-${i}`,
              type: s.type,
            })),
            structuralQualityScore: preQa.score,
          };
          pipelineEmit({
            stage: "await_user",
            progress: prog,
            agent: "engineer",
            detail: "review_draft",
            hitl: draftPayload,
          });
          const dAct = args.onHitl ? await args.onHitl(draftPayload) : defaultHitlAction(draftPayload);
          pushDecision(
            memory,
            "hitl",
            "draft_review",
            JSON.stringify(
              dAct.type === "compound"
                ? { compound: dAct.actions.map((x) => x.type) }
                : dAct,
            ).slice(0, 800),
          );
          pipelineEmit({
            stage: "hitl_resumed",
            progress: prog,
            agent: "engineer",
            detail: dAct.type === "compound" ? `compound:${dAct.actions.length}` : dAct.type,
          });

          memory.userEdits ??= [];
          memory.userEdits.push({
            type: dAct.type === "compound" ? "compound" : dAct.type,
            payload: dAct,
            timestamp: Date.now(),
            checkpoint: "review_draft",
          });

          const atoms = flattenHitlActions(dAct);
          const nonConfirm = atoms.filter((x) => x.type !== "confirm_draft");
          if (nonConfirm.length === 0) {
            needDraftHitl = false;
          } else {
            const regenOnly =
              nonConfirm.length > 0 &&
              nonConfirm.every((a) => a.type === "regenerate_section");
            for (const atom of nonConfirm) {
              if (atom.type === "regenerate_section") {
                await regenerateSection({
                  memory,
                  sectionId: atom.sectionId,
                  signal: args.signal,
                  config: args.config,
                });
                const after = tryParseSiteSchema(memory.rawSiteJson ?? "");
                if (!after.ok) throw new Error(after.error);
                if (after.schemaAutoFixed) memory.schemaAutoFixed = true;
                parsed = after;
                rawSiteJson = memory.rawSiteJson ?? "";
                needEngineer = false;
              } else if (atom.type === "refine_all") {
                postProcessHint =
                  atom.hint ??
                  "Пользователь просит усилить весь сайт: тексты, иерархию блоков и визуальную связность.";
                needEngineer = true;
                parsed = null;
              } else if (atom.type === "change_style") {
                memory.designSeed = createSeed();
                applyHitlAction(memory, atom);
                postProcessHint =
                  "Смена стиля: пересобери визуал и тон под обновлённый Style DNA / seed, без потери структуры.";
                needEngineer = true;
                parsed = null;
              }
            }
            if (regenOnly) needDraftHitl = false;
            continue inner;
          }
        }

        const staticGate = combinedStaticSiteQa(parsed.data);
        if (parsed.schemaAutoFixed) {
          pushDecision(
            memory,
            "pipeline",
            "schema_autofix_note",
            "Normalized loose LLM output; aggregate quality penalized.",
          );
        }
        if (staticGate.issues.some((i) => i.severity === "high")) {
          pushDecision(
            memory,
            "pipeline",
            "static_component_qa",
            staticGate.issues
              .filter((i) => i.severity === "high")
              .map((i) => i.message)
              .join("; "),
          );
          postProcessHint = `Структура и компоненты (§11): ${staticGate.issues.map((i) => i.message).join("; ")}`;
          needEngineer = true;
          continue inner;
        }

        const sem = semanticCheckSite(parsed.data, memory.userIntent);
        if (!sem.passed) {
          if (semTry >= cfg.semanticRefineMaxAttempts) {
            pushDecision(memory, "pipeline", "semantic_gate_exhausted", sem.issues.join("; "));
          } else {
            semTry += 1;
            pushDecision(
              memory,
              "pipeline",
              `semantic_refine:${semTry}`,
              sem.issues.join("; "),
            );
            pipelineEmit({
              stage: "semantic_refine",
              progress: prog,
              iteration,
              detail: sem.issues.slice(0, 3).join("; "),
            });
            postProcessHint = `Смысл / структура (§20.8): ${sem.issues.join("; ")}`;
            needEngineer = true;
            continue inner;
          }
        }

        const tmpl = templateSimilarityCheck(parsed.data);
        if (tmpl.suspicious) {
          const br = tmpl.breakdown
            ? `s=${tmpl.breakdown.structure.toFixed(2)} lp=${tmpl.breakdown.layoutPattern.toFixed(2)} r=${tmpl.breakdown.repetition.toFixed(2)} c=${tmpl.breakdown.cliché.toFixed(2)}`
            : "";
          pushDecision(
            memory,
            "pipeline",
            "template_similarity_v41",
            `score=${tmpl.score.toFixed(3)} thr=${TEMPLATE_SIMILARITY_THRESHOLD} ${br}`.trim(),
          );
          memory.designSeed = createSeed();
          postProcessHint =
            "§20.9 Шаблонность / similarity: варьируй порядок и тип секций, формулировки и плотность блоков; сохрани бриф.";
          needEngineer = true;
          continue inner;
        }

        break inner;
      }

      if (innerStep >= innerCap) {
        pushDecision(memory, "pipeline", "draft_inner_cap", `steps=${innerStep}`);
      }

      if (!parsed) throw new Error("Engineer: draft loop ended without parse");

      let workingParsed: ParsedSiteSchemaOk = parsed;
      let workingRaw = rawSiteJson;

      for (let li = 0; li < 2; li++) {
        const lq = layoutSchemaQA(workingParsed.data);
        if (lq.ok) break;
        pushDecision(memory, "qa", "layout_schema_qa", lq.issues.join("; ").slice(0, 900));
        pipelineEmit({
          stage: "layout_fix",
          progress: progressForStage("loop", iteration + 0.15, cfg.designIterations),
          detail: lq.issues[0]?.slice(0, 160),
          iteration,
        });
        const fx = await fixerSiteJsonForLayout(memory, cfg, callOpts, workingParsed.data, lq.issues);
        const fp = tryParseSiteSchema(fx.raw);
        if (!fp.ok) {
          pushDecision(memory, "qa", "layout_fixer_parse_failed", fp.error.slice(0, 240));
          const patched = applyLayoutReadabilityFallback(workingParsed.data);
          workingParsed = { ok: true, data: patched, schemaAutoFixed: true };
          workingRaw = JSON.stringify(patched);
          memory.rawSiteJson = workingRaw;
          memory.schemaAutoFixed = true;
          break;
        }
        workingParsed = fp;
        workingRaw = JSON.stringify(fp.data);
        memory.rawSiteJson = workingRaw;
        if (fp.schemaAutoFixed) memory.schemaAutoFixed = true;
      }

      parsed = workingParsed;
      rawSiteJson = workingRaw;

      const parsedFinal = parsed;

      let criticResult: CriticReport | null = null;
      let qaResult: QAReport | null = null;

      const criticLoop = { iteration, previousAggregateQuality };
      if (cfg.parallelQaAndCritic && cfg.enableCritic && cfg.enableQA) {
        const [c, q] = await Promise.all([
          critic(memory, rawSiteJson, cfg, callOpts, criticLoop),
          qaWithToolContext(memory, parsedFinal.data, cfg),
        ]);
        criticResult = c;
        qaResult = q;
      } else {
        if (cfg.enableCritic) criticResult = await critic(memory, rawSiteJson, cfg, callOpts, criticLoop);
        if (cfg.enableQA) qaResult = await qaWithToolContext(memory, parsedFinal.data, cfg);
      }

      if (!cfg.enableCritic) {
        criticResult = {
          findings: [],
          qualityScore: {
            design: 90,
            ux: 90,
            performance: 90,
            accessibility: 90,
          },
        };
      }
      if (!cfg.enableQA) {
        qaResult = { issues: [], score: 100 };
      }

      let realQaBlocked = false;
      if (cfg.enableRealQaArtifact) {
        try {
          const rq = await serverRealQa({ data: { rawSiteJson } });
          if (memory.sessionMetrics) {
            memory.sessionMetrics.realQaRuns = (memory.sessionMetrics.realQaRuns ?? 0) + 1;
          }
          if (rq.buildPath) {
            memory.codeRef = {
              versionId: memory.sessionId,
              sectionsHash: siteSectionsFingerprint(parsedFinal.data),
              lastBuildPath: rq.buildPath,
            };
          }
          pushDecision(
            memory,
            "pipeline",
            "real_qa",
            JSON.stringify({
              lint: rq.lint,
              lh: rq.lighthouse,
            }).slice(0, 900),
          );
          const lintFail = !rq.lint.skipped && !rq.lint.ok;
          const perfFail =
            rq.lighthouse.ran && (rq.lighthouse.performance ?? 0) < cfg.realQaMinPerformance;
          const a11yFail =
            rq.lighthouse.ran && (rq.lighthouse.accessibility ?? 0) < cfg.realQaMinAccessibility;
          realQaBlocked = lintFail || perfFail || a11yFail;
          if (memory.sessionMetrics && !realQaBlocked) {
            memory.sessionMetrics.realQaPassCount = (memory.sessionMetrics.realQaPassCount ?? 0) + 1;
          }
          if (realQaBlocked) {
            pushDecision(
              memory,
              "pipeline",
              "real_qa_block",
              `lint=${lintFail} perf=${perfFail} a11y=${a11yFail}`,
            );
          }
        } catch (e) {
          pushDecision(
            memory,
            "pipeline",
            "real_qa_skip",
            (e instanceof Error ? e.message : String(e)).slice(0, 400),
          );
        }
      }

      let aggregateQuality = aggregatePipelineQualityScore(
        criticResult?.qualityScore ?? null,
        qaResult?.score ?? null,
        cfg,
      );
      if (parsedFinal.schemaAutoFixed) {
        aggregateQuality = Math.max(0, aggregateQuality - 10);
        pushDecision(memory, "pipeline", "schema_autofix_agg_penalty", "-10 aggregate quality");
      }
      pushDecision(memory, "pipeline", "quality_aggregate", String(aggregateQuality));
      if (memory.sessionMetrics) {
        memory.sessionMetrics.qualityHistory.push(aggregateQuality);
        memory.sessionMetrics.designLoopIterations = iteration + 1;
      }

      await refreshLongTermSummaryIfNeeded(memory, cfg, callOpts);
      const criticOk =
        criticResult != null && minQualityScore(criticResult.qualityScore) >= cfg.qualityThreshold;
      const qaOk =
        qaResult != null &&
        qaResult.score >= cfg.qualityThreshold &&
        !qaResult.issues.some((i) => i.severity === "high") &&
        !realQaBlocked;

      pipelineEmit({
        stage: "quality_gate",
        progress: progressForStage("loop", iteration + 0.85, cfg.designIterations),
        detail: JSON.stringify({
          critic: criticResult?.qualityScore,
          qaScore: qaResult?.score,
          aggregateQuality,
          realQaBlocked,
        }),
        iteration,
      });

      if (criticOk && qaOk) {
        previousAggregateQuality = aggregateQuality;
        break;
      }

      if (!(criticOk && qaOk)) {
        if (realQaBlocked) {
          postProcessHint =
            "§16 Real QA: пройди lint на сгенерированном TSX и целевые пороги Lighthouse (performance / accessibility) — скорректируй контент и структуру секций.";
        }
        pushDecision(
          memory,
          "pipeline",
          `design_loop_retry:${iteration}`,
          `criticMin=${criticResult ? minQualityScore(criticResult.qualityScore) : "n/a"} qa=${qaResult?.score} agg=${aggregateQuality} findings=${criticResult?.findings.slice(0, 3).join(";")}`,
        );
        if (memory.sessionMetrics) {
          memory.sessionMetrics.iterationsFix = (memory.sessionMetrics.iterationsFix ?? 0) + 1;
        }
        previousAggregateQuality = aggregateQuality;
        iteration += 1;
      }
    }

    if (cfg.enableReviewer) {
      pipelineEmit({ stage: "reviewer", progress: 90, agent: "reviewer" });
      const polished = await reviewerPolish(memory, rawSiteJson, cfg, callOpts);
      const after = tryParseSiteSchema(polished.raw);
      if (after.ok) {
        rawSiteJson = JSON.stringify(after.data);
        memory.rawSiteJson = rawSiteJson;
        if (after.schemaAutoFixed) memory.schemaAutoFixed = true;
        pushDecision(memory, "reviewer", "polish_ok", `model:${polished.modelUsed}`);
      } else {
        pushDecision(memory, "reviewer", "polish_skipped", after.error);
      }
    }

    let finalParse = tryParseSiteSchema(rawSiteJson);
    if (!finalParse.ok) {
      pushDecision(
        memory,
        "pipeline",
        "json_fallback_used",
        `final fallback site: ${finalParse.error}`,
      );
      const fb = generateFallbackSiteSchema(memory.userIntent);
      rawSiteJson = JSON.stringify(fb);
      memory.rawSiteJson = rawSiteJson;
      finalParse = { ok: true, data: fb, schemaAutoFixed: true };
      memory.schemaAutoFixed = true;
    }
    if (finalParse.schemaAutoFixed) memory.schemaAutoFixed = true;
    memory.siteSchema = finalParse.data;
    memory.code = {
      files: [{ path: "site.json", content: rawSiteJson }],
    };

    applyUsedInFinalFromArtifact(memory.toolInvocations, rawSiteJson);
    const nInv = memory.toolInvocations?.length ?? 0;
    if (nInv > 0) {
      const nUsed = memory.toolInvocations!.filter((i) => i.usedInFinal).length;
      pushDecision(memory, "pipeline", "tool_used_in_final", `heuristic ${nUsed}/${nInv}`);
    }

    pipelineEmit({
      stage: "done",
      progress: 100,
      detail: `lastEngineer:${lastModel}`,
    });
    await refreshLongTermSummaryIfNeeded(memory, cfg, callOpts);
    if (memory.sessionMetrics) {
      memory.sessionMetrics.success = true;
      const qs = (memory.toolInvocations ?? [])
        .map((i) => i.feedbackQuality)
        .filter((q) => typeof q === "number" && !Number.isNaN(q));
      if (qs.length) {
        memory.sessionMetrics.avgToolQuality = Math.round(
          qs.reduce((a, b) => a + b, 0) / qs.length,
        );
      }
      finalizeSessionMetrics(memory.sessionMetrics);
    }
    memory.codeRef = {
      versionId: memory.sessionId,
      sectionsHash: siteSectionsFingerprint(memory.siteSchema!),
      lastBuildPath: memory.codeRef?.lastBuildPath,
    };
    return memory;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (memory.sessionMetrics) {
      memory.sessionMetrics.errors.push(msg);
      memory.sessionMetrics.toolFailures += 1;
      memory.sessionMetrics.success = false;
      finalizeSessionMetrics(memory.sessionMetrics);
    }
    pipelineEmit({ stage: "error", progress: 0, detail: msg });
    throw e;
  }
}

/** Частичная регенерация: пересобирает JSON сайта с акцентом на секцию. */
export async function regenerateSection(args: {
  memory: ProjectMemory;
  sectionId: string;
  signal?: AbortSignal;
  config?: Partial<PipelineConfig>;
}): Promise<ProjectMemory> {
  const cfg: PipelineConfig = { ...DEFAULT_PIPELINE_CONFIG, ...args.config };
  const callOpts: CallChatOptions = { signal: args.signal, maxRetries: 2 };
  const hint = `Сфокусируйся на секции/блоке "${args.sectionId}": улучши контент и стиль, сохрани остальные секции согласованными.`;
  const engineered = await engineerSiteJson(args.memory, cfg, callOpts, hint, {
    designLoopIndex: 0,
    previousAggregateQuality: undefined,
  });
  let parsed = tryParseSiteSchema(engineered.raw);
  let attempts = 0;
  let raw = engineered.raw;
  while (!parsed.ok && attempts < cfg.jsonRepairAttempts) {
    const fixed = await selfCorrectSiteJson(args.memory, cfg, callOpts, raw, parsed.error);
    raw = fixed.raw;
    parsed = tryParseSiteSchema(raw);
    attempts++;
  }
  if (!parsed.ok) throw new Error(parsed.error);
  if (parsed.schemaAutoFixed) args.memory.schemaAutoFixed = true;
  args.memory.siteSchema = parsed.data;
  args.memory.rawSiteJson = JSON.stringify(parsed.data);
  args.memory.code = {
    files: [{ path: "site.json", content: args.memory.rawSiteJson }],
  };
  pushDecision(args.memory, "engineer", "regen_section", args.sectionId);
  if (args.memory.sessionMetrics) {
    args.memory.sessionMetrics.partialRegens = (args.memory.sessionMetrics.partialRegens ?? 0) + 1;
  }
  applyUsedInFinalFromArtifact(args.memory.toolInvocations, args.memory.rawSiteJson ?? "");
  return args.memory;
}
