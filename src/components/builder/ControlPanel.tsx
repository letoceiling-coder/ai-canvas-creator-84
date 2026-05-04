import { Sparkles, Wand2, Sun, Moon, Globe, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const chipPrompts: Record<string, string> = {
  SaaS: "Создай SaaS-лендинг для AI-сервиса аналитики продаж: hero, преимущества, тарифы, отзывы.",
  Портфолио: "Создай портфолио дизайнера: обо мне, избранные работы, услуги, контакты.",
  Агентство: "Создай сайт цифрового агентства: услуги, кейсы, команда, форма заявки.",
  Продукт: "Создай страницу продукта: фичи, сравнение, тарифы, FAQ, CTA.",
  Лендинг: "Создай продающий лендинг: оффер, выгоды, социальные доказательства, форма заявки.",
  Магазин: "Создай интернет-магазин: каталог, карточка товара, корзина, доставка.",
};
const chips = Object.keys(chipPrompts);

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

type Props = {
  prompt: string;
  onPromptChange: (v: string) => void;
  template: string;
  onTemplateChange: (v: string) => void;
  style: string;
  onStyleChange: (v: string) => void;
  theme: string;
  onThemeChange: (v: string) => void;
  type: string;
  onTypeChange: (v: string) => void;
  loading: boolean;
  onGenerate: () => void;
  /** Доп. классы для корневого aside (например flex-1 min-h-0 при колонке с WhyPanel). */
  className?: string;
};

export function ControlPanel({
  prompt,
  onPromptChange,
  template,
  onTemplateChange,
  style,
  onStyleChange,
  theme,
  onThemeChange,
  type,
  onTypeChange,
  loading,
  onGenerate,
  className,
}: Props) {
  const handleChip = (c: string) => {
    onTemplateChange(c);
    onPromptChange(chipPrompts[c]);
  };

  return (
    <aside
      className={cn(
        "flex h-full w-[360px] shrink-0 flex-col border-l border-border/50 bg-sidebar",
        className,
      )}
    >
      <div className="flex h-14 items-center gap-2 px-5">
        <Wand2 className="h-4 w-4 text-[oklch(0.78_0.18_290)]" />
        <span className="text-sm font-semibold">Параметры генерации</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 px-5 pb-6">
          <Section label="Описание" hint="Чем подробнее — тем точнее результат">
            <Textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Например: лендинг для AI-сервиса аналитики продаж. Тёмный, премиальный, с разделом тарифов и отзывами клиентов из ритейла."
              className="min-h-[140px] resize-none rounded-xl border-0 bg-[var(--panel-elevated)]/60 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-[var(--accent-violet)]/60"
            />
          </Section>

          <Section label="Быстрые шаблоны">
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <button
                  key={c}
                  onClick={() => handleChip(c)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                    template === c
                      ? "bg-foreground text-background"
                      : "bg-[var(--panel-elevated)]/60 text-muted-foreground hover:bg-[var(--panel-elevated)] hover:text-foreground"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </Section>

          <Section label="Стиль">
            <Segmented options={styles} value={style} onChange={onStyleChange} />
          </Section>

          <Section label="Тема">
            <div className="grid grid-cols-2 gap-1.5">
              {themes.map((t) => {
                const Icon = t.icon;
                const isActive = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onThemeChange(t.id)}
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

          <Section label="Тип сайта">
            <Segmented options={types} value={type} onChange={onTypeChange} />
          </Section>

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

      <div className="border-t border-border/50 p-4">
        <button
          onClick={onGenerate}
          disabled={loading || !prompt.trim()}
          className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[var(--accent-violet)] to-[var(--accent-indigo)] text-sm font-semibold text-white shadow-lg shadow-[var(--accent-violet)]/30 transition-all hover:shadow-xl hover:shadow-[var(--accent-violet)]/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-lg"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Генерация…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 transition-transform group-hover:rotate-12" />
              Создать сайт
              <span className="ml-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-medium">
                ⌘ ↵
              </span>
            </>
          )}
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

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
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
