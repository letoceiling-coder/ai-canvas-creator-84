import { Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type AgentChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: number;
};

export type AgentChatQuickAction = { id: string; label: string; text: string };

export function AgentChat({
  messages,
  onSend,
  disabled,
  statusLine,
  hitlPanel,
  quickActions = [],
  placeholder = "Опишите сайт или правку…",
  showBrandHeader = true,
  className,
}: {
  messages: AgentChatMessage[];
  onSend: (text: string) => void;
  disabled: boolean;
  statusLine: string | null;
  hitlPanel?: React.ReactNode;
  quickActions?: AgentChatQuickAction[];
  placeholder?: string;
  showBrandHeader?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, statusLine, hitlPanel, quickActions.length]);

  const submit = () => {
    const t = draft.trim();
    if (!t || disabled) return;
    setDraft("");
    onSend(t);
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 max-w-[420px] flex-1 flex-col border-r border-border/50 bg-sidebar",
        showBrandHeader === false && "max-w-none border-0",
        className,
      )}
    >
      {showBrandHeader ? (
        <div className="shrink-0 border-b border-border/40 px-4 py-3">
          <h1 className="text-sm font-semibold tracking-tight">AI Website Builder</h1>
          <p className="text-[11px] text-muted-foreground">
            Пишите запросы — стиль и структура определяются автоматически.
          </p>
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1 px-3 py-3">
        <div className="flex flex-col gap-3 pr-2">
          {messages.length === 0 ? (
            <p className="rounded-lg border border-border/40 bg-[var(--panel-elevated)]/30 px-3 py-2.5 text-xs text-muted-foreground">
              Например: «Сайт для натяжных потолков в Москве, тёмный премиум» или «Добавь секцию
              отзывов».
            </p>
          ) : null}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "rounded-xl px-3 py-2 text-xs leading-relaxed",
                m.role === "user"
                  ? "ml-6 bg-[var(--accent-violet)]/15 text-foreground"
                  : "mr-6 border border-border/35 bg-[var(--panel-elevated)]/40 text-muted-foreground",
              )}
            >
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide opacity-70">
                {m.role === "user" ? "Вы" : "Агент"}
              </span>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
          {quickActions.length > 0 ? (
            <div className="space-y-1.5 rounded-xl border border-border/30 bg-[var(--panel-elevated)]/25 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Что дальше
              </p>
              <div className="flex flex-wrap gap-1.5">
                {quickActions.map((a) => (
                  <Button
                    key={a.id}
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    className="h-7 rounded-full px-2.5 text-[10px] font-normal"
                    onClick={() => onSend(a.text)}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {statusLine ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/30 bg-background/30 px-2 py-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin opacity-80" />
              <span className="line-clamp-3">{statusLine}</span>
            </div>
          ) : null}
          {hitlPanel ? <div className="rounded-xl border border-[var(--accent-violet)]/30">{hitlPanel}</div> : null}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border/40 p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="min-h-[72px] resize-none rounded-xl border border-border/60 bg-[var(--panel-elevated)]/40 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button
          type="button"
          className="mt-2 w-full"
          disabled={disabled || !draft.trim()}
          onClick={() => submit()}
        >
          {disabled ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Думаю…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Отправить
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
