import { Monitor, Tablet, Smartphone, RotateCcw, Share2, Sparkles, Loader2 } from "lucide-react";
import { useState } from "react";
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

export function Canvas({
  state,
  html,
  onReset,
}: {
  state: State;
  html: string;
  onReset: () => void;
}) {
  const [device, setDevice] = useState<Device>("desktop");

  const handleShare = async () => {
    if (!html) return;
    try {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      /* noop */
    }
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-[var(--canvas)]">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium">Без названия</div>
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
                  active && "bg-[var(--panel-elevated)] text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            disabled={state !== "result"}
            className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--panel)]/70 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Сбросить
          </button>
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

      <div className="flex flex-1 items-center justify-center p-6 pt-2">
        <div className="canvas-grid relative flex h-full w-full max-w-[1200px] items-center justify-center overflow-hidden rounded-2xl border border-border/40 bg-[var(--panel)]/40 shadow-2xl shadow-black/40">
          {state === "empty" && <EmptyState />}
          {state === "loading" && <LoadingState />}
          {state === "result" && (
            <div className="flex h-full w-full items-start justify-center overflow-auto p-6 transition-all">
              <iframe
                title="preview"
                srcDoc={html}
                className="h-full rounded-xl border border-border/40 bg-white shadow-xl transition-all duration-300"
                style={{ width: widths[device], minHeight: "100%" }}
              />
            </div>
          )}
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
        <kbd className="rounded-md border border-border/50 bg-[var(--panel-elevated)] px-1.5 py-0.5 font-mono">⌘</kbd>
        <kbd className="rounded-md border border-border/50 bg-[var(--panel-elevated)] px-1.5 py-0.5 font-mono">↵</kbd>
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
