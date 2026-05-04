import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sidebar } from "@/components/builder/Sidebar";
import { Canvas } from "@/components/builder/Canvas";
import { ControlPanel } from "@/components/builder/ControlPanel";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "AI Конструктор сайтов — создавайте сайты за 30 секунд" },
      {
        name: "description",
        content:
          "Премиальный AI-инструмент для создания сайтов: опишите идею, выберите стиль и получите готовый дизайн.",
      },
    ],
  }),
});

function Index() {
  const [state, setState] = useState<"empty" | "loading" | "result">("empty");

  const handleGenerate = () => {
    setState("loading");
    setTimeout(() => setState("empty"), 2400);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <Canvas state={state} />
      <ControlPanel onGenerate={handleGenerate} />
    </div>
  );
}
