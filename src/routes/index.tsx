import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
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

export type GenParams = {
  prompt: string;
  template: string;
  style: string;
  theme: string;
  type: string;
};

function buildMockHtml(p: GenParams) {
  const isDark = p.theme === "dark";
  const bg = isDark ? "#0b1020" : "#f8fafc";
  const fg = isDark ? "#e2e8f0" : "#0f172a";
  const muted = isDark ? "#94a3b8" : "#475569";
  const card = isDark ? "#111a33" : "#ffffff";
  const border = isDark ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.08)";
  const accent = "linear-gradient(135deg,#8b5cf6,#6366f1)";

  const title =
    p.template === "Портфолио"
      ? "Портфолио дизайнера"
      : p.template === "Агентство"
        ? "Цифровое агентство нового поколения"
        : p.template === "Магазин"
          ? "Магазин премиальных товаров"
          : p.template === "Продукт"
            ? "Продукт, который меняет правила"
            : "AI-платформа для роста бизнеса";

  const subtitle = p.prompt?.trim()
    ? p.prompt.trim().slice(0, 180)
    : "Создано AI за 30 секунд. Адаптивно, быстро, красиво.";

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Manrope','Inter',system-ui,sans-serif;background:${bg};color:${fg};line-height:1.55;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1120px;margin:0 auto;padding:0 24px}
  header{padding:22px 0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ${border}}
  .logo{display:flex;align-items:center;gap:10px;font-weight:700}
  .logo i{width:28px;height:28px;border-radius:8px;background:${accent};display:inline-block}
  nav a{color:${muted};text-decoration:none;margin-left:22px;font-size:14px}
  .hero{padding:96px 0 72px;text-align:center}
  .badge{display:inline-block;padding:6px 12px;border:1px solid ${border};border-radius:999px;font-size:12px;color:${muted};margin-bottom:22px}
  h1{font-size:56px;line-height:1.05;letter-spacing:-.03em;font-weight:800;max-width:820px;margin:0 auto 18px}
  .sub{color:${muted};font-size:18px;max-width:620px;margin:0 auto 32px}
  .cta{display:inline-flex;gap:12px}
  .btn{padding:14px 22px;border-radius:12px;font-weight:600;font-size:14px;border:0;cursor:pointer}
  .btn.primary{background:${accent};color:#fff}
  .btn.ghost{background:transparent;color:${fg};border:1px solid ${border}}
  section{padding:72px 0}
  h2{font-size:34px;letter-spacing:-.02em;margin-bottom:12px;font-weight:700}
  .lead{color:${muted};margin-bottom:40px;max-width:560px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
  .card{background:${card};border:1px solid ${border};border-radius:18px;padding:26px}
  .card h3{font-size:18px;margin-bottom:8px;font-weight:600}
  .card p{color:${muted};font-size:14px}
  .price{font-size:36px;font-weight:700;margin:8px 0 16px}
  .ul{list-style:none;color:${muted};font-size:14px}
  .ul li{padding:6px 0;border-top:1px solid ${border}}
  footer{padding:40px 0;border-top:1px solid ${border};color:${muted};font-size:13px;text-align:center}
  @media(max-width:780px){h1{font-size:38px}.grid{grid-template-columns:1fr}}
</style></head><body>
<div class="wrap">
  <header>
    <div class="logo"><i></i><span>${title.split(" ")[0]}</span></div>
    <nav><a href="#">Возможности</a><a href="#">Тарифы</a><a href="#">Контакты</a></nav>
  </header>

  <section class="hero">
    <span class="badge">✨ ${p.style} · ${p.type}</span>
    <h1>${title}</h1>
    <p class="sub">${subtitle}</p>
    <div class="cta">
      <button class="btn primary">Начать бесплатно</button>
      <button class="btn ghost">Смотреть демо</button>
    </div>
  </section>

  <section>
    <h2>Преимущества</h2>
    <p class="lead">Всё, что нужно, чтобы запустить продукт быстрее.</p>
    <div class="grid">
      <div class="card"><h3>Скорость</h3><p>Запуск за минуты, а не недели.</p></div>
      <div class="card"><h3>Дизайн</h3><p>Премиальный визуал из коробки.</p></div>
      <div class="card"><h3>Адаптивность</h3><p>Идеально на любом устройстве.</p></div>
    </div>
  </section>

  <section>
    <h2>Тарифы</h2>
    <p class="lead">Гибкие планы под любой этап роста.</p>
    <div class="grid">
      <div class="card"><h3>Старт</h3><div class="price">0 ₽</div><ul class="ul"><li>1 проект</li><li>Базовые блоки</li><li>Поддержка</li></ul></div>
      <div class="card" style="border-color:#8b5cf6"><h3>Pro</h3><div class="price">990 ₽</div><ul class="ul"><li>Безлимит проектов</li><li>Все шаблоны</li><li>Приоритет</li></ul></div>
      <div class="card"><h3>Команда</h3><div class="price">2 990 ₽</div><ul class="ul"><li>До 10 человек</li><li>Совместная работа</li><li>SLA</li></ul></div>
    </div>
  </section>

  <footer>© ${new Date().getFullYear()} ${title} · Создано AI</footer>
</div>
</body></html>`;
}

function Index() {
  const [prompt, setPrompt] = useState("");
  const [template, setTemplate] = useState("SaaS");
  const [style, setStyle] = useState("premium");
  const [theme, setTheme] = useState("dark");
  const [type, setType] = useState("landing");
  const [loading, setLoading] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState("");

  const handleGenerate = useCallback(() => {
    if (loading) return;
    setLoading(true);
    setGeneratedHtml("");
    const params: GenParams = { prompt, template, style, theme, type };
    // Mock generation — replace with real fetch('/generate', ...) when API is ready
    window.setTimeout(() => {
      setGeneratedHtml(buildMockHtml(params));
      setLoading(false);
    }, 1500);
  }, [loading, prompt, template, style, theme, type]);

  // ⌘/Ctrl + Enter to generate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleGenerate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleGenerate]);

  const canvasState: "empty" | "loading" | "result" = loading
    ? "loading"
    : generatedHtml
      ? "result"
      : "empty";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <Canvas
        state={canvasState}
        html={generatedHtml}
        onReset={() => {
          setGeneratedHtml("");
          setPrompt("");
        }}
      />
      <ControlPanel
        prompt={prompt}
        onPromptChange={setPrompt}
        template={template}
        onTemplateChange={setTemplate}
        style={style}
        onStyleChange={setStyle}
        theme={theme}
        onThemeChange={setTheme}
        type={type}
        onTypeChange={setType}
        loading={loading}
        onGenerate={handleGenerate}
      />
    </div>
  );
}
