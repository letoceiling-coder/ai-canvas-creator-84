/**
 * Генерация минимального React/TSX артефакта для ESLint (Real QA контур).
 * Выход — относительные пути → содержимое файла.
 */

import type { SiteSchema } from "@/lib/site-schema";

export type GeneratedReactFileMap = Record<string, string>;

const APP_TSX_HEAD = `import site from "../site.json";

type Block = {
  type: string;
  content: Record<string, unknown>;
};

function pickContent(c: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = c[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return "";
}

function BlockView({ block }: { block: Block }) {
  const c = block.content;
  const headline = pickContent(c, "headline", "title", "heading", "name");
  const text = pickContent(c, "description", "subtitle", "subheadline", "text", "body", "content");
  const cta = pickContent(c, "ctaLabel", "buttonText", "primaryCta");
  return (
    <section data-type={block.type}>
      {headline ? <h2>{headline}</h2> : null}
      {text ? <p>{text}</p> : null}
      {cta ? <p data-testid="cta">{cta}</p> : null}
    </section>
  );
}

export default function App() {
  const s = site as { pages: Block[]; sections: Block[]; components: Block[] };
  const blocks = [...s.pages, ...s.sections, ...s.components];
  return (
    <main>
      {blocks.map((b, i) => (
`;

/** Литерал шаблонной строки key в сгенерированном TSX (не интерполируется генератором). */
const APP_TSX_MAP_LINE =
  "        <BlockView key={`${b.type}-${i}`} block={b} />\n";

const APP_TSX_TAIL = `      ))}
    </main>
  );
}
`;

const APP_TSX = APP_TSX_HEAD + APP_TSX_MAP_LINE + APP_TSX_TAIL;

const MAIN_TSX = `import { createRoot } from "react-dom/client";
import App from "./App";

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(<App />);
}
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src", "site.json"]
}
`;

const INDEX_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Site</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
`;

/** Минимальный Vite-проект: сборка на Vercel через npm run build. */
const PACKAGE_JSON = {
  name: "ai-export-site",
  private: true,
  type: "module",
  scripts: {
    dev: "vite",
    build: "vite build",
    preview: "vite preview",
  },
  dependencies: {
    react: "^19.2.0",
    "react-dom": "^19.2.0",
  },
  devDependencies: {
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^5.0.4",
    typescript: "^5.8.3",
    vite: "^7.3.1",
  },
};

const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`;

/** §20 / export — карта файлов «проекта» для записи на диск, eslint и Vercel. */
export function generateReactProject(site: SiteSchema): GeneratedReactFileMap {
  return {
    "site.json": JSON.stringify(site, null, 2),
    "tsconfig.json": TSCONFIG,
    "index.html": INDEX_HTML,
    "package.json": JSON.stringify(PACKAGE_JSON, null, 2),
    "vite.config.ts": VITE_CONFIG,
    "src/App.tsx": APP_TSX,
    "src/main.tsx": MAIN_TSX,
  };
}
