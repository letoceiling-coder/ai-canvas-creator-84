import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const styles = [
  { id: "minimal", label: "Минимализм" },
  { id: "premium", label: "Премиум" },
  { id: "bold", label: "Смелый" },
];
const themes = [
  { id: "dark", label: "Тёмная" },
  { id: "light", label: "Светлая" },
];
const types = [
  { id: "landing", label: "Лендинг" },
  { id: "multi", label: "Многостраничный" },
  { id: "app", label: "Веб-приложение" },
];

export type AdvancedBuilderSettings = {
  style: string;
  theme: string;
  type: string;
  /** Явно брать Style DNA из этих полей вместо авто из текста */
  useManualStyleDNA: boolean;
  /** Паузы согласования (экспертный режим) */
  enableHITL: boolean;
  designIterations: number;
  qualityThreshold: number;
};

export function SettingsDrawer({
  settings,
  onChange,
  className,
}: {
  settings: AdvancedBuilderSettings;
  onChange: (next: AdvancedBuilderSettings) => void;
  className?: string;
}) {
  const patch = (p: Partial<AdvancedBuilderSettings>) => onChange({ ...settings, ...p });

  return (
    <div className={cn(className)}>
      <Sheet>
        <SheetTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs">
            <Settings className="h-3.5 w-3.5" />
            Настройки
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[360px] overflow-y-auto sm:max-w-[360px]">
          <SheetHeader>
            <SheetTitle>Расширенные настройки</SheetTitle>
            <SheetDescription>
              По умолчанию стиль и структура выводятся из ваших сообщений в чате. Здесь — ручной
              override и параметры пайплайна.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 flex flex-col gap-4 px-1">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={settings.useManualStyleDNA}
                onChange={(e) => patch({ useManualStyleDNA: e.target.checked })}
                className="rounded border-border"
              />
              Фиксировать стиль из полей ниже (не авто из текста)
            </label>
            <div className="grid gap-2">
              <Label className="text-xs">Стиль</Label>
              <select
                className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                value={settings.style}
                onChange={(e) => patch({ style: e.target.value })}
                disabled={!settings.useManualStyleDNA}
              >
                {styles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Тема</Label>
              <select
                className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                value={settings.theme}
                onChange={(e) => patch({ theme: e.target.value })}
                disabled={!settings.useManualStyleDNA}
              >
                {themes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Тип сайта</Label>
              <select
                className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                value={settings.type}
                onChange={(e) => patch({ type: e.target.value })}
                disabled={!settings.useManualStyleDNA}
              >
                {types.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <hr className="border-border/50" />

            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={settings.enableHITL}
                onChange={(e) => patch({ enableHITL: e.target.checked })}
                className="rounded border-border"
              />
              Чекпоинты HITL (план / архитектура / черновик)
            </label>

            <div className="grid gap-2">
              <Label className="text-xs">Итераций дизайна</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={settings.designIterations}
                onChange={(e) => patch({ designIterations: Math.max(1, Number(e.target.value) || 1) })}
                className="h-9 text-xs"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Порог качества (0–100)</Label>
              <Input
                type="number"
                min={50}
                max={100}
                value={settings.qualityThreshold}
                onChange={(e) =>
                  patch({ qualityThreshold: Math.min(100, Math.max(50, Number(e.target.value) || 80)) })
                }
                className="h-9 text-xs"
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
