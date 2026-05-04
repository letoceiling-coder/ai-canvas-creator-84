/**
 * Чистые функции для Context7 API (удобно покрывать тестами без fetch).
 */

export type Context7NormalizedItem = {
  id: string;
  content: string;
  source?: string;
  timestamp?: number;
};

const CONTEXT7_ORIGIN = "https://context7.com";

export { CONTEXT7_ORIGIN };

/** Первое «осмысленное» слово запроса как libraryName для /libs/search. */
export function guessLibraryName(query: string): string {
  const stop = new Set([
    "best",
    "the",
    "for",
    "with",
    "and",
    "how",
    "using",
    "use",
    "docs",
    "documentation",
    "to",
    "in",
    "of",
    "a",
  ]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  for (const w of words) {
    const clean = w.replace(/[^a-z0-9._-]/g, "");
    if (clean.length >= 2 && !stop.has(clean)) return clean.slice(0, 64);
  }
  return "react";
}

/** Разбор JSON ответа GET /api/v2/context → items контракта Tool Layer. */
export function context7JsonToToolItems(json: unknown): Context7NormalizedItem[] {
  const items: Context7NormalizedItem[] = [];
  if (Array.isArray(json)) {
    for (let i = 0; i < json.length; i++) {
      const row = json[i] as Record<string, unknown>;
      const content =
        typeof row.content === "string"
          ? row.content
          : typeof row.text === "string"
            ? row.text
            : "";
      const title = typeof row.title === "string" ? row.title : `doc-${i}`;
      if (content) {
        items.push({
          id: `ctx7-arr-${i}`,
          content: title ? `${title}\n${content}` : content,
          source: typeof row.source === "string" ? row.source : "context7.com",
          timestamp: Date.now(),
        });
      }
    }
    return items;
  }
  if (!json || typeof json !== "object") return items;
  const o = json as Record<string, unknown>;

  const codeSnippets = o.codeSnippets;
  if (Array.isArray(codeSnippets)) {
    for (let s = 0; s < codeSnippets.length; s++) {
      const snippet = codeSnippets[s] as Record<string, unknown>;
      const title = typeof snippet.codeTitle === "string" ? snippet.codeTitle : `code-${s}`;
      const codeList = snippet.codeList;
      if (Array.isArray(codeList)) {
        codeList.forEach((c, i) => {
          const row = c as Record<string, unknown>;
          const code = typeof row.code === "string" ? row.code : "";
          if (code) {
            items.push({
              id: `ctx7-code-${s}-${i}`,
              content: `${title}\n${code}`,
              source: "context7.com",
              timestamp: Date.now(),
            });
          }
        });
      }
    }
  }

  const infoSnippets = o.infoSnippets;
  if (Array.isArray(infoSnippets)) {
    for (let i = 0; i < infoSnippets.length; i++) {
      const info = infoSnippets[i] as Record<string, unknown>;
      const content = typeof info.content === "string" ? info.content : "";
      const title = typeof info.title === "string" ? info.title : "";
      if (content) {
        items.push({
          id: `ctx7-info-${i}`,
          content: title ? `${title}\n${content}` : content,
          source:
            typeof info.source === "string"
              ? info.source
              : typeof info.path === "string"
                ? info.path
                : "context7.com",
          timestamp: Date.now(),
        });
      }
    }
  }

  return items;
}
