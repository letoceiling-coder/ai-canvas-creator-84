import type { SiteSchema } from "@/lib/site-schema";

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "to",
  "of",
  "in",
  "on",
  "with",
  "is",
  "are",
  "из",
  "и",
  "в",
  "на",
  "с",
  "по",
  "для",
  "как",
  "это",
  "к",
  "от",
  "за",
]);

function keywordQueriesFromPrompt(prompt: string): string[] {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return ["hero"];

  const chunks = cleaned
    .split(/[,;.\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
  const out: string[] = [];
  for (const c of chunks) {
    out.push(c.slice(0, 100));
  }

  if (out.length === 0) {
    const words = cleaned.split(" ").filter((w) => {
      const t = w.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, "");
      return t.length > 2 && !STOP.has(t);
    });
    if (words.length >= 2) {
      out.push(words.slice(0, 8).join(" "));
    } else {
      out.push(cleaned.slice(0, 80));
    }
  }

  return [...new Set(out)].slice(0, 6);
}

function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/** Детерминированные визуальные слоты (placehold.co), без source.unsplash.com. */
export function deterministicFillImageUrls(prompt: string, count = 6): string[] {
  const queries = keywordQueriesFromPrompt(prompt);
  const urls: string[] = [];
  for (let i = 0; i < count; i++) {
    const query = queries[i % queries.length];
    const enc = encodeURIComponent(query.slice(0, 40));
    const sig = simpleHash(`${query}:${i}`);
    urls.push(`https://placehold.co/1600x900/1e293b/94a3b8/png?text=${enc}&sig=${sig}`);
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
