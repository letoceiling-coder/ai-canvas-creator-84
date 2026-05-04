import { useState } from "react";
import { Sparkles, Wand2, Sun, Moon, Globe } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const chips = ["SaaS", "Портфолио", "Агентство", "Продукт", "Лендинг", "Магазин"];
const styles = [
  { id: "minimal", label: "Минимализм" },
  { id: "premium", label: "Премиум" },
  { id: "bold", label: "Смелый" },
];
const themes = [
  { id: "dark", label: "Тёмная", icon: Moon },
  { id: "light", label: "Светлая", icon: Sun },
];
const types = [
  { id: "landing", label: "Лендинг" },
  { id: "multi", label: "Многостраничный" },
  { id: "app", label: "Веб-приложение" },
];

export function ControlPanel({ onGenerate }: { onGenerate: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [chip, setChip] = useState("SaaS");
  const [style, setStyle] = useState("premium");
  const [theme, setTheme] = useState("dark");
  const [type, setType] = useState("landing");

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-border/50 bg-sidebar">
      <div className="flex h-14 items-center gap-2 px-5">
        <Wand2 className="h-4 w-4 text-[oklch(0.78_0.18_290)]" />
        <span className="text-sm font-semibold">Параметры генерации</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 px-5 pb-6">
          {/* Description */}
          <Section label="Описание" hint="Чем подробнее — тем точнее результат">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Например: лендинг для AI-сервиса аналитики продаж. Тёмный, премиальный, с разделом тарифов и отзывами клиентов из ритейла."
              className="min-h-[140px] resize-none rounded-xl border-0 bg-[var(--panel-elevated)]/60 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-[var(--accent-violet)]/60"
            />
          </Section>

          {/* Chips */}
          <Section label="Быстрые шаблоны">
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <button
                  key={c}
                  onClick={() => setChip(c)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                    chip === c
                      ? "bg-foreground text-background"
                      : "bg-[var(--panel-elevated)]/60 text-muted-foreground hover:bg-[var(--panel-elevated)] hover:text-foreground"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </Section>

          {/* Style */}
          <Section label="Стиль">
            <Segmented options={styles} value={style} onChange={setStyle} />
          </Section>

          {/* Theme */}
          <Section label="Тема">
            <div className="grid grid-cols-2 gap-1.5">
              {themes.map((t) => {
                const Icon = t.icon;
                const isActive = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium transition-all",
                      isActive
                        ? "bg-[var(--panel-elevated)] text-foreground ring-1 ring-[var(--accent-violet)]/40"
                        : "bg-[var(--panel-elevated)]/40 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Type */}
          <Section label="Тип сайта">
            <Segmented options={types} value={type} onChange={setType} />
          </Section>

          {/* Language */}
          <Section label="Язык">
            <button className="flex w-full items-center justify-between rounded-lg bg-[var(--panel-elevated)]/60 px-3 py-2.5 text-sm transition-colors hover:bg-[var(--panel-elevated)]">
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                Русский
              </div>
              <span className="text-xs text-muted-foreground">Изменить</span>
            </button>
          </Section>
        </div>
      </ScrollArea>

      {/* CTA */}
      <div className="border-t border-border/50 p-4">
        <button
          onClick={onGenerate}
          className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[var(--accent-violet)] to-[var(--accent-indigo)] text-sm font-semibold text-white shadow-lg shadow-[var(--accent-violet)]/30 transition-all hover:shadow-xl hover:shadow-[var(--accent-violet)]/40 active:scale-[0.99]"
        >
          <Sparkles className="h-4 w-4 transition-transform group-hover:rotate-12" />
          Создать сайт
          <span className="ml-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-medium">
            ⌘ ↵
          </span>
        </button>
        <p className="mt-2.5 text-center text-[11px] text-muted-foreground">
          ≈ 30 секунд · 1 кредит из 50
        </p>
      </div>
    </aside>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold tracking-tight">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-[var(--panel-elevated)]/40 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all",
            value === o.id
              ? "bg-[var(--panel-elevated)] text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}