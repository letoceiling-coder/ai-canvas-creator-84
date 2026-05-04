import type { SiteSchema } from "@/lib/site-schema";

function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/**
 * Палитра премиум-плейсхолдеров: чистые градиенты без текста.
 * Хеш промпта детерминирует выбор → стабильные между прогонами картинки,
 * но разные между разными темами.
 */
const GRADIENT_PALETTES: ReadonlyArray<readonly [string, string]> = [
  ["1e1b4b", "5b21b6"], // indigo → violet
  ["0c4a6e", "0891b2"], // sky → cyan
  ["18181b", "3f3f46"], // dark slate
  ["1e293b", "475569"], // navy slate
  ["422006", "92400e"], // amber depth
  ["052e16", "166534"], // forest green
  ["4a044e", "a21caf"], // fuchsia
  ["1c1917", "57534e"], // stone
  ["1e3a8a", "1d4ed8"], // royal blue
  ["111827", "374151"], // graphite
];

/**
 * Возвращает SVG-data-URI с радиальным/линейным градиентом.
 * НЕ содержит текста — никаких визуальных «протечек» промпта в карточки.
 */
function gradientDataUri(seedKey: string, idx: number, w = 1600, h = 900): string {
  const palette = GRADIENT_PALETTES[
    parseInt(simpleHash(`${seedKey}:${idx}`).slice(0, 4), 16) % GRADIENT_PALETTES.length
  ]!;
  const [a, b] = palette;
  const angle = (parseInt(simpleHash(`${seedKey}:angle:${idx}`).slice(0, 2), 16) % 360);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' width='${w}' height='${h}'>
  <defs>
    <linearGradient id='g' gradientTransform='rotate(${angle})'>
      <stop offset='0%' stop-color='#${a}'/>
      <stop offset='100%' stop-color='#${b}'/>
    </linearGradient>
    <radialGradient id='r' cx='${30 + (idx % 3) * 20}%' cy='${20 + (idx % 4) * 15}%' r='65%'>
      <stop offset='0%' stop-color='#fff' stop-opacity='0.18'/>
      <stop offset='100%' stop-color='#fff' stop-opacity='0'/>
    </radialGradient>
  </defs>
  <rect width='100%' height='100%' fill='url(#g)'/>
  <rect width='100%' height='100%' fill='url(#r)'/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Премиум-плейсхолдеры по теме промпта: чистые SVG-градиенты без текста. */
export function deterministicFillImageUrls(prompt: string, count = 6): string[] {
  const seedKey = simpleHash(prompt.trim().slice(0, 200) || "default");
  const urls: string[] = [];
  for (let i = 0; i < count; i++) {
    urls.push(gradientDataUri(seedKey, i));
  }
  return urls;
}

/** Дополняет `images` только если массив почти пустой (после OpenAI URLs из tool / LLM). */
export function mergeAutoImages(site: SiteSchema, prompt: string): SiteSchema {
  if ((site.images?.length ?? 0) >= 3) return site;
  const auto = deterministicFillImageUrls(prompt.trim());
  const seen = new Set(site.images ?? []);
  const merged = [...(site.images ?? [])];
  for (const url of auto) {
    if (!seen.has(url)) {
      seen.add(url);
      merged.push(url);
    }
  }
  return { ...site, images: merged };
}
