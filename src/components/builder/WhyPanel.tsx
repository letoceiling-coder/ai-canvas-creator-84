import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProjectMemory } from "@/lib/orchestrator";
import { cn } from "@/lib/utils";

type Props = {
  memory: ProjectMemory | null;
  className?: string;
  /** Упрощённый вид под chat-first: стиль, данные, краткий список tools */
  compact?: boolean;
};

/**
 * Explainable AI после runPipeline.
 */
export function WhyPanel({ memory, className, compact }: Props) {
  if (!memory) {
    return (
      <div
        className={cn(
          "rounded-xl border border-border/50 bg-[var(--panel-elevated)]/40 p-4 text-sm text-muted-foreground",
          className,
        )}
      >
        После генерации здесь будет краткое объяснение: стиль, данные и инструменты.
      </div>
    );
  }

  if (compact) {
    const tools = (memory.toolInvocations ?? []).slice(-12);
    const dataCalls = tools.filter((t) => t.channel === "data");
    return (
      <div
        className={cn(
          "flex flex-col gap-2 rounded-xl border border-border/50 bg-[var(--panel-elevated)]/40 px-3 py-2.5",
          className,
        )}
      >
        <p className="text-[11px] font-semibold text-foreground/90">Почему так</p>
        {memory.styleDNA ? (
          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/85">Стиль: </span>
            {memory.styleDNA.vibe} · density {memory.styleDNA.density} · motion {memory.styleDNA.motion} ·
            contrast {memory.styleDNA.contrast}
            {memory.styleLocked ? " (зафиксирован после плана)" : ""}
          </p>
        ) : null}
        {dataCalls.length > 0 ? (
          <div className="text-[11px] text-muted-foreground">
            <span className="font-medium text-amber-200/85">Данные: </span>
            {dataCalls.map((t) => (
              <span key={t.id} className="mr-2 inline-block">
                {t.provider ?? "—"}
                {t.dataGaps?.length ? ` (пробелы: ${t.dataGaps.join(", ")})` : ""}
              </span>
            ))}
          </div>
        ) : null}
        {tools.length > 0 ? (
          <ScrollArea className="max-h-[100px]">
            <ul className="space-y-0.5 pr-2 text-[10px] text-muted-foreground">
              {tools.map((t) => (
                <li key={t.id}>
                  {t.channel} · {t.provider ?? "—"}
                  {t.cacheHit ? " · cache" : ""}
                </li>
              ))}
            </ul>
          </ScrollArea>
        ) : null}
      </div>
    );
  }

  const metrics = memory.sessionMetrics;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border/50 bg-[var(--panel-elevated)]/50",
        className,
      )}
    >
      <div className="border-b border-border/40 px-4 py-3">
        <h3 className="text-sm font-semibold">Почему так</h3>
        <p className="text-[11px] text-muted-foreground">
          Решения пайплайна и аудит инструментов
        </p>
      </div>

      {metrics && (
        <div className="grid grid-cols-2 gap-2 px-4 text-[11px] text-muted-foreground sm:grid-cols-3">
          <Metric label="Время, мс" value={String(metrics.generationTimeMs)} />
          <Metric label="Tool calls" value={String(metrics.toolCalls ?? metrics.toolCallsCompleted)} />
          <Metric label="Inject tok." value={String(metrics.injectTokensTotal)} />
          <Metric label="Quality σ" value={metrics.qualityHistory.join("→") || "—"} />
          <Metric label="Success" value={String(metrics.success ?? "—")} />
        </div>
      )}

      {memory.styleDNA ? (
        <div className="px-4 pb-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Style DNA {memory.styleLocked ? "(зафиксирован после HITL плана)" : ""}
          </p>
          <dl className="mt-1 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
            <dt className="opacity-70">vibe</dt>
            <dd className="text-foreground/85">{memory.styleDNA.vibe || "—"}</dd>
            <dt className="opacity-70">density</dt>
            <dd className="text-foreground/85">{memory.styleDNA.density || "—"}</dd>
            <dt className="opacity-70">motion</dt>
            <dd className="text-foreground/85">{memory.styleDNA.motion || "—"}</dd>
            <dt className="opacity-70">contrast</dt>
            <dd className="text-foreground/85">{memory.styleDNA.contrast || "—"}</dd>
          </dl>
        </div>
      ) : null}

      <ScrollArea className="max-h-[220px] px-4 pb-4">
        <div className="space-y-2 pr-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Decision log
          </p>
          <ul className="space-y-1.5 text-xs">
            {memory.decisionLog.slice(-24).map((e) => (
              <li
                key={`${e.createdAt}-${e.agent}-${e.summary}`}
                className="rounded-md bg-background/40 px-2 py-1.5"
              >
                <span className="font-medium text-foreground/90">{e.agent}</span>
                <span className="text-muted-foreground"> — {e.summary}</span>
              </li>
            ))}
          </ul>

          {(memory.toolInvocations?.length ?? 0) > 0 && (
            <>
              <p className="pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Tool invocations
              </p>
              <ul className="space-y-1 text-[11px] text-muted-foreground">
                {memory.toolInvocations!.map((t) => (
                  <li key={t.id} className="rounded-md border border-border/30 px-2 py-1">
                    <span className="text-foreground/85">{t.channel}</span> · {t.agent} · cache
                    {t.cacheHit ? "✓" : "✗"} · tok {t.injectTokens}
                    {t.provider ? ` · ${t.provider}` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}

          {memory.toolInvocations?.some((t) => t.channel === "data") ? (
            <div className="pt-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-amber-200/80">
                Data · источники
              </p>
              <ul className="mt-1 space-y-1.5 text-[11px] text-muted-foreground">
                {memory.toolInvocations!
                  .filter((t) => t.channel === "data")
                  .map((t) => (
                    <li key={t.id} className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5">
                      <div className="font-medium text-foreground/85">{t.provider ?? "—"}</div>
                      {t.dataGaps?.length ? (
                        <div className="mt-0.5 text-[10px] text-amber-200/90">{t.dataGaps.join("; ")}</div>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-background/30 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="truncate font-mono text-foreground/90">{value}</div>
    </div>
  );
}
