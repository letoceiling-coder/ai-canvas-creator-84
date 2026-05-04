/**
 * §20.5 — реестр версий промптов (откаты, A/B, аудит качества).
 * Текст промптов остаётся в ai-prompt / orchestrator; здесь — SSOT по версии и дате.
 */

export type PromptRegistryEntry = {
  version: string;
  /** Короткий маркер; полный текст в коде агентов. */
  contentRef: string;
  updatedAt: string;
};

export const PROMPT_REGISTRY = {
  intent: {
    version: "v1.0",
    contentRef: "orchestrator:classifyIntent",
    updatedAt: "2026-05-04",
  },
  planner: {
    version: "v1.0",
    contentRef: "orchestrator:planner",
    updatedAt: "2026-05-04",
  },
  architect: {
    version: "v1.0",
    contentRef: "orchestrator:architect+designSystem",
    updatedAt: "2026-05-04",
  },
  engineer: {
    version: "v1.0",
    contentRef: "orchestrator:engineerSiteJson",
    updatedAt: "2026-05-04",
  },
  critic: {
    version: "v1.0",
    contentRef: "orchestrator:critic",
    updatedAt: "2026-05-04",
  },
  reviewer: {
    version: "v1.0",
    contentRef: "orchestrator:reviewerPolish",
    updatedAt: "2026-05-04",
  },
} as const satisfies Record<string, PromptRegistryEntry>;

/** Плоский объект для интерполяции в system prompts (как раньше в orchestrator). */
export const PROMPT_VERSION = {
  intent: PROMPT_REGISTRY.intent.version,
  planner: PROMPT_REGISTRY.planner.version,
  architect: PROMPT_REGISTRY.architect.version,
  engineer: PROMPT_REGISTRY.engineer.version,
  critic: PROMPT_REGISTRY.critic.version,
  reviewer: PROMPT_REGISTRY.reviewer.version,
} as const;

/** Плоский словарь для sessionMetrics / логов. */
export function getPromptVersionsFlat(): Record<string, string> {
  return {
    intent: PROMPT_REGISTRY.intent.version,
    planner: PROMPT_REGISTRY.planner.version,
    architect: PROMPT_REGISTRY.architect.version,
    engineer: PROMPT_REGISTRY.engineer.version,
    critic: PROMPT_REGISTRY.critic.version,
    reviewer: PROMPT_REGISTRY.reviewer.version,
  };
}
