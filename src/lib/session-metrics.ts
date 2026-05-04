/**
 * §13 / §20.10 — метрики сессии генерации (SaaS / тарифы / оптимизация).
 */

export type SessionMetrics = {
  startedAtMs: number;
  endedAtMs?: number;
  /** Выставляется в finalize */
  generationTimeMs: number;
  /** Завершённые вызовы tools (phase end) */
  toolCallsCompleted: number;
  /** metadata.failed у провайдера или пустой полезный ответ после провайдера */
  toolFailures: number;
  /** Сумма injectTokens по audit toolInvocations */
  injectTokensTotal: number;
  /** Сколько раз вошли в design loop (0-based счётчик итераций +1 в конце каждой) */
  designLoopIterations: number;
  /** aggregateQuality после каждого quality gate */
  qualityHistory: number[];
  /** Тексты ошибок пайплайна / провайдера (SaaS-аудит). */
  errors: string[];
  /** Успех пайплайна до `finalize` */
  success?: boolean;
  /** Частичные регенерации секций (HITL). */
  partialRegens?: number;
  /** Повторы design loop после quality gate. */
  iterationsFix?: number;
  /** Запуски server Real QA. */
  realQaRuns?: number;
  /** Среднее feedbackQuality по toolInvocations. */
  avgToolQuality?: number;
  /** §13 — дублирует toolCallsCompleted при finalize (удобство API / биллинг). */
  toolCalls?: number;
  /** Успешные прогоны Real QA (без block) за сессию. */
  realQaPassCount?: number;
  /** Доля успешных Real QA: pass / runs (после finalize). */
  realQaPassRate?: number;
  /** §20.5 снимок версий промптов на старте */
  promptVersions?: Record<string, string>;
};

export function createSessionMetrics(): SessionMetrics {
  const now = Date.now();
  return {
    startedAtMs: now,
    generationTimeMs: 0,
    toolCallsCompleted: 0,
    toolFailures: 0,
    injectTokensTotal: 0,
    designLoopIterations: 0,
    qualityHistory: [],
    errors: [],
};
}

export function finalizeSessionMetrics(m: SessionMetrics): void {
  m.endedAtMs = Date.now();
  m.generationTimeMs = Math.max(0, m.endedAtMs - m.startedAtMs);
  m.toolCalls = m.toolCallsCompleted;
  const runs = m.realQaRuns ?? 0;
  if (runs > 0) {
    m.realQaPassRate = (m.realQaPassCount ?? 0) / runs;
  }
}
