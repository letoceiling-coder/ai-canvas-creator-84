import {
  Monitor,
  Tablet,
  Smartphone,
  RotateCcw,
  Share2,
  Sparkles,
  Loader2,
  Download,
  FileCode2,
  Rocket,
} from "lucide-react";
import { useState } from "react";
import type { SiteSchema } from "@/lib/site-schema";
import { siteExportDocumentTitle, siteSchemaToHtml } from "@/lib/site-render";
import { cn } from "@/lib/utils";

type State = "empty" | "loading" | "result";
type Device = "desktop" | "tablet" | "mobile";

const devices: { id: Device; icon: typeof Monitor }[] = [
  { id: "desktop", icon: Monitor },
  { id: "tablet", icon: Tablet },
  { id: "mobile", icon: Smartphone },
];

const widths: Record<Device, string> = {
  desktop: "100%",
  tablet: "820px",
  mobile: "390px",
};

/** §15 — ограниченный sandbox: скрипты только для навигации по якорям (без eval в нашем выводе). */
const PREVIEW_SANDBOX = "allow-scripts allow-forms";

export type DeployHistoryEntry = {
  ts: number;
  kind: "vercel" | "self-host";
  status: string;
  detail?: string;
  url?: string;
  jobId?: string;
};

export function Canvas({
  state,
  html,
  siteSchema,
  onReset,
  onOpenAiGenerate,
  onExportZip,
  onExportReact,
  onDeploy,
  onDeploySelfHost,
  deployLoading,
  selfHostLoading,
  deployUrl,
  deployError,
  selfHostPhase,
  selfHostMessage,
  deployHistory,
  onRedeploy,
}: {
  state: State;
  html: string;
  siteSchema: SiteSchema | null;
  onReset: () => void;
  /** Если не задан — кнопка «Сгенерировать» скрыта (chat-first). */
  onOpenAiGenerate?: () => void;
  onExportZip: (() => void) | null;
  onExportReact?: (() => void) | null;
  onDeploy?: (() => void) | null;
  /** Деплой на свой сервер (PM2 + deploy.sh через hook). */
  onDeploySelfHost?: (() => void) | null;
  deployLoading?: boolean;
  selfHostLoading?: boolean;
  deployUrl?: string | null;
  deployError?: string | null;
  selfHostPhase?: "idle" | "running" | "success" | "failed" | "unknown";
  selfHostMessage?: string | null;
  deployHistory?: DeployHistoryEntry[];
  onRedeploy?: (() => void) | null;
}) {
  const [device, setDevice] = useState<Device>("desktop");

  const previewHtml =
    state === "result" ? (siteSchema ? siteSchemaToHtml(siteSchema) : html) : "";

  const handleShare = async () => {
    if (!previewHtml) return;
    try {
      const blob = new Blob([previewHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      /* noop */
    }
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-[var(--canvas)]">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="truncate text-sm font-medium">
            {siteSchema ? siteExportDocumentTitle(siteSchema) : "Превью"}
          </div>
          <span className="rounded-md bg-[var(--panel-elevated)]/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {state === "result" ? "Готово" : "Черновик"}
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-[var(--panel)]/70 p-1">
          {devices.map((d) => {
            const Icon = d.icon;
            const active = device === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setDevice(d.id)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:text-foreground",
                  active && "bg-[var(--panel-elevated)] text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {onOpenAiGenerate ? (
            <button
              type="button"
              onClick={onOpenAiGenerate}
              disabled={state === "loading"}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-[var(--panel)]/50 px-3 text-xs font-medium text-foreground transition-colors hover:bg-[var(--panel-elevated)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Сгенерировать
            </button>
          ) : null}
          <button
            onClick={onReset}
            disabled={state !== "result"}
            className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--panel)]/70 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Сбросить
          </button>
          <button
            type="button"
            onClick={() => onExportZip?.()}
            disabled={state !== "result" || !onExportZip}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-[var(--panel)]/50 px-3 text-xs font-medium text-foreground transition-colors hover:bg-[var(--panel-elevated)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            ZIP
          </button>
          <button
            type="button"
            onClick={() => onExportReact?.()}
            disabled={state !== "result" || !siteSchema || !onExportReact}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-[var(--panel)]/50 px-3 text-xs font-medium text-foreground transition-colors hover:bg-[var(--panel-elevated)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileCode2 className="h-3.5 w-3.5" />
            React проект
          </button>
          <button
            type="button"
            onClick={() => onDeploy?.()}
            disabled={
              state !== "result" || !siteSchema || !onDeploy || Boolean(deployLoading)
            }
            className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deployLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            Vercel
          </button>
          <button
            type="button"
            onClick={() => onDeploySelfHost?.()}
            disabled={
              state !== "result" ||
              !siteSchema ||
              !onDeploySelfHost ||
              Boolean(selfHostLoading)
            }
            className="flex h-8 items-center gap-1.5 rounded-lg border border-sky-500/35 bg-sky-500/10 px-3 text-xs font-medium text-sky-200 transition-colors hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {selfHostLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            Self-host
          </button>
          {onRedeploy && state === "result" && siteSchema ? (
            <button
              type="button"
              onClick={() => onRedeploy()}
              disabled={Boolean(deployLoading) || Boolean(selfHostLoading)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border/60 px-2 text-[11px] font-medium text-muted-foreground hover:bg-[var(--panel-elevated)] disabled:opacity-40"
            >
              Повторить Vercel
            </button>
          ) : null}
          <button
            onClick={handleShare}
            disabled={state !== "result"}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--panel)]/70 px-3 text-xs font-medium transition-colors hover:bg-[var(--panel-elevated)] disabled:opacity-40"
          >
            <Share2 className="h-3.5 w-3.5" />
            Открыть
          </button>
        </div>
      </div>

      {(deployUrl ||
        deployError ||
        (selfHostPhase && selfHostPhase !== "idle") ||
        selfHostMessage ||
        (deployHistory && deployHistory.length > 0)) &&
      state === "result" ? (
        <div className="border-b border-border/30 px-6 py-2 text-xs space-y-2">
          <div className="flex flex-wrap gap-4">
            <div>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Vercel
              </span>
              {deployLoading ? (
                <p className="text-amber-200/90">running…</p>
              ) : deployUrl ? (
                <p className="text-emerald-200">
                  success:{" "}
                  <a
                    href={deployUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline underline-offset-2"
                  >
                    {deployUrl}
                  </a>
                </p>
              ) : deployError ? (
                <p className="text-destructive">
                  failed: {deployError}
                  {deployError.includes("VERCEL_TOKEN") ? (
                    <span className="mt-1 block text-muted-foreground">
                      Задайте VERCEL_TOKEN в `.env` на сервере.
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="text-muted-foreground">idle</p>
              )}
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Self-host
              </span>
              {selfHostLoading || selfHostPhase === "running" ? (
                <p className="text-amber-200/90">running…</p>
              ) : selfHostPhase === "success" ? (
                <p className="text-emerald-200">success (см. логи PM2 / logs/deploy-*)</p>
              ) : selfHostPhase === "failed" ? (
                <p className="text-destructive">failed</p>
              ) : selfHostPhase === "unknown" ? (
                <p className="text-muted-foreground">unknown state</p>
              ) : (
                <p className="text-muted-foreground">idle</p>
              )}
              {selfHostMessage ? (
                <pre className="mt-1 max-h-24 max-w-2xl overflow-auto rounded bg-background/30 p-2 text-[10px] text-muted-foreground">
                  {selfHostMessage}
                </pre>
              ) : null}
            </div>
          </div>
          {deployHistory && deployHistory.length > 0 ? (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Последние деплои (локально)
              </p>
              <ul className="mt-1 max-h-28 overflow-auto text-[10px] text-muted-foreground">
                {deployHistory.slice(0, 8).map((h, i) => (
                  <li key={`${h.ts}-${i}`}>
                    {new Date(h.ts).toLocaleString()} · {h.kind} · {h.status}
                    {h.url ? ` · ${h.url.slice(0, 48)}…` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-1 items-center justify-center p-6 pt-2">
        <div className="canvas-grid relative flex h-full w-full max-w-[1200px] items-center justify-center overflow-hidden rounded-2xl border border-border/40 bg-[var(--panel)]/40 shadow-2xl shadow-black/40">
          {state === "empty" && <EmptyState />}
          {state === "loading" && <LoadingState />}
          {state === "result" && previewHtml ? (
            <div className="flex h-full w-full items-start justify-center overflow-auto p-6 transition-all">
              <iframe
                title="site-preview-sandbox"
                srcDoc={previewHtml}
                sandbox={PREVIEW_SANDBOX}
                referrerPolicy="no-referrer"
                className="h-full rounded-xl border border-border/40 bg-white shadow-xl transition-all duration-300"
                style={{ width: widths[device], minHeight: "100%" }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="flex max-w-md flex-col items-center text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-2xl bg-[var(--accent-violet)]/30 blur-2xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent-violet)] to-[var(--accent-indigo)] shadow-xl">
          <Sparkles className="h-7 w-7 text-white" />
        </div>
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">Здесь появится ваш сайт</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Опишите задачу справа и нажмите{" "}
        <span className="rounded-md bg-[var(--panel-elevated)] px-1.5 py-0.5 text-xs font-medium text-foreground">
          «Создать сайт»
        </span>
        . AI соберёт первую версию за 30 секунд.
      </p>
      <div className="mt-8 flex items-center gap-2 text-[11px] text-muted-foreground">
        <kbd className="rounded-md border border-border/50 bg-[var(--panel-elevated)] px-1.5 py-0.5 font-mono">
          ⌘
        </kbd>
        <kbd className="rounded-md border border-border/50 bg-[var(--panel-elevated)] px-1.5 py-0.5 font-mono">
          ↵
        </kbd>
        <span>чтобы запустить генерацию</span>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4 p-10">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-violet)]" />
        AI генерирует структуру…
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-gradient-to-r from-[var(--panel-elevated)]/40 via-[var(--panel-elevated)]/80 to-[var(--panel-elevated)]/40" />
      <div className="grid grid-cols-3 gap-4">
        <div className="h-24 animate-pulse rounded-xl bg-[var(--panel-elevated)]/60" />
        <div className="h-24 animate-pulse rounded-xl bg-[var(--panel-elevated)]/60" />
        <div className="h-24 animate-pulse rounded-xl bg-[var(--panel-elevated)]/60" />
      </div>
      <div className="h-32 animate-pulse rounded-xl bg-[var(--panel-elevated)]/60" />
    </div>
  );
}
