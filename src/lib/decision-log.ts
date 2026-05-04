/**
 * §3 Структурированный decisionLog для explainability / аналитики / UI «Почему так».
 */

export type DecisionLogEntry = {
  agent: string;
  summary: string;
  detail?: string;
  createdAt: string;
};

export function createDecisionEntry(
  agent: string,
  summary: string,
  detail?: string,
): DecisionLogEntry {
  return {
    agent,
    summary,
    detail,
    createdAt: new Date().toISOString(),
  };
}

export function pushDecision(
  memory: { decisionLog: DecisionLogEntry[] },
  agent: string,
  summary: string,
  detail?: string,
): void {
  memory.decisionLog.push(createDecisionEntry(agent, summary, detail));
}

/** Компактные поля для §20.2 — только хвост в промпт. */
export function briefDecisionTail(
  entries: DecisionLogEntry[],
  tail: number,
): { agent: string; summary: string }[] {
  return entries.slice(-tail).map((e) => ({ agent: e.agent, summary: e.summary }));
}
