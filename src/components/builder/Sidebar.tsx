import { useState } from "react";
import {
  Sparkles,
  LayoutTemplate,
  History,
  Layers,
  Star,
  Grid3x3,
  MessageSquareQuote,
  Tags,
  MousePointerClick,
  Plus,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Tab = "sections" | "templates" | "history";

const tabs: { id: Tab; label: string; icon: typeof Layers }[] = [
  { id: "sections", label: "Секции", icon: Layers },
  { id: "templates", label: "Шаблоны", icon: LayoutTemplate },
  { id: "history", label: "История", icon: History },
];

const blocks = [
  { id: "hero", label: "Герой", icon: Sparkles, hint: "Главный экран" },
  { id: "features", label: "Преимущества", icon: Star, hint: "3–6 пунктов" },
  { id: "grid", label: "Сетка", icon: Grid3x3, hint: "Карточки контента" },
  { id: "reviews", label: "Отзывы", icon: MessageSquareQuote, hint: "Социальное доказательство" },
  { id: "pricing", label: "Тарифы", icon: Tags, hint: "Планы и цены" },
  { id: "cta", label: "CTA", icon: MousePointerClick, hint: "Призыв к действию" },
];

export function Sidebar() {
  const [tab, setTab] = useState<Tab>("sections");
  const [active, setActive] = useState("hero");

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-border/50 bg-sidebar">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-violet)] to-[var(--accent-indigo)] shadow-lg shadow-[var(--accent-violet)]/20">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight">Конструктор</span>
          <span className="text-[11px] text-muted-foreground">AI · v1.0</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-3">
        <div className="flex items-center gap-1 rounded-xl bg-[var(--panel-elevated)]/60 p-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all",
                  isActive
                    ? "bg-[var(--panel)] text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Blocks */}
      <div className="mt-5 flex items-center justify-between px-5 pb-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Блоки
        </span>
        <button className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--panel-elevated)] hover:text-foreground">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="flex flex-col gap-1 pb-4">
          {blocks.map((b) => {
            const Icon = b.icon;
            const isActive = active === b.id;
            return (
              <button
                key={b.id}
                onClick={() => setActive(b.id)}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-[var(--accent-violet)]/15 to-transparent text-foreground"
                    : "text-muted-foreground hover:bg-[var(--panel-elevated)]/60 hover:text-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                    isActive
                      ? "bg-[var(--accent-violet)]/20 text-[oklch(0.78_0.18_290)]"
                      : "bg-[var(--panel-elevated)]/60 group-hover:bg-[var(--panel-elevated)]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{b.label}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{b.hint}</span>
                </div>
                {isActive && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--accent-violet)] shadow-[0_0_8px_var(--accent-violet)]" />
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="m-3 rounded-xl bg-gradient-to-br from-[var(--accent-violet)]/10 to-[var(--accent-indigo)]/5 p-4">
        <div className="text-xs font-semibold">Безлимит на месяц</div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Откройте все шаблоны и AI-генерации без ограничений.
        </p>
        <button className="mt-3 w-full rounded-lg bg-foreground/95 px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90">
          Улучшить план
        </button>
      </div>
    </aside>
  );
}