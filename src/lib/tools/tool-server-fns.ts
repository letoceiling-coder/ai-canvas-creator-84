/**
 * Сервер-only вызовы провайдеров. API-ключи только из process.env (не VITE_*).
 * Вызываются через createServerFn с клиента — секреты не попадают в бандл.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  CONTEXT7_ORIGIN,
  context7JsonToToolItems,
  guessLibraryName,
} from "@/lib/tools/context7-adapters";

const TOOL_SERVER_TIMEOUT_MS = 5000;

function raceTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("tool_timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

const toolQuerySchema = z.object({
  query: z.string().trim().min(1).max(500),
});

type ServerToolItem = {
  id: string;
  content: string;
  source?: string;
  timestamp?: number;
};

export type ServerToolSearchOutput =
  | {
      ok: true;
      summary: string;
      items: ServerToolItem[];
      metadata: { provider: string };
    }
  | { ok: false; reason: string };

export type ServerToolContextOutput =
  | {
      ok: true;
      summary: string;
      items: ServerToolItem[];
      metadata: { provider: string };
    }
  | { ok: false; reason: string };

/**
 * Прямой Context7 API: search → context (ключ: CONTEXT7_API_KEY).
 * Документация: https://context7.com/docs/api-guide
 */
async function fetchContext7Direct(
  query: string,
  apiKey: string,
): Promise<ServerToolContextOutput> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TOOL_SERVER_TIMEOUT_MS);
  const auth = { Authorization: `Bearer ${apiKey}` };

  try {
    const libraryName = guessLibraryName(query);
    const searchUrl = new URL(`${CONTEXT7_ORIGIN}/api/v2/libs/search`);
    searchUrl.searchParams.set("libraryName", libraryName);
    searchUrl.searchParams.set("query", query.slice(0, 400));

    const searchRes = await fetch(searchUrl, { headers: auth, signal: ac.signal });
    if (searchRes.status === 401) return { ok: false, reason: "context7_unauthorized" };
    if (!searchRes.ok) {
      console.warn("[tool-context] context7 search http", searchRes.status);
      return { ok: false, reason: `context7_search_${searchRes.status}` };
    }

    const searchJson = (await searchRes.json()) as {
      results?: Array<{ id: string; title?: string }>;
    };
    let libraryId = searchJson.results?.[0]?.id;

    if (!libraryId && libraryName !== "react") {
      searchUrl.searchParams.set("libraryName", "react");
      const retry = await fetch(searchUrl, { headers: auth, signal: ac.signal });
      if (retry.ok) {
        const j2 = (await retry.json()) as typeof searchJson;
        libraryId = j2.results?.[0]?.id;
      }
    }

    if (!libraryId) return { ok: false, reason: "context7_no_library" };

    const ctxUrl = new URL(`${CONTEXT7_ORIGIN}/api/v2/context`);
    ctxUrl.searchParams.set("libraryId", libraryId);
    ctxUrl.searchParams.set("query", query.slice(0, 500));
    ctxUrl.searchParams.set("type", "json");

    const ctxRes = await fetch(ctxUrl, { headers: auth, signal: ac.signal });
    if (ctxRes.status === 202) return { ok: false, reason: "context7_library_pending" };
    if (ctxRes.status === 401) return { ok: false, reason: "context7_unauthorized" };
    if (!ctxRes.ok) {
      console.warn("[tool-context] context7 context http", ctxRes.status);
      return { ok: false, reason: `context7_context_${ctxRes.status}` };
    }

    const ctxJson: unknown = await ctxRes.json();
    const items: ServerToolItem[] = context7JsonToToolItems(ctxJson);
    const summary =
      items.length > 0
        ? `Context7: ${libraryId} — ${items.length} фрагмент(ов)`
        : `Context7: ${libraryId} (пусто)`;
    console.info("[tool-context] context7 direct ok", {
      libraryId,
      n: items.length,
    });
    return {
      ok: true,
      summary,
      items,
      metadata: { provider: "context7-api" },
    };
  } catch (e) {
    const reason =
      e instanceof Error && e.name === "AbortError" ? "timeout" : "context7_direct_error";
    console.warn("[tool-context] direct", reason, e);
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchContext7Proxy(
  query: string,
  base: string,
  proxyKey: string | undefined,
): Promise<ServerToolContextOutput> {
  const url = `${base.replace(/\/$/, "")}/resolve`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (proxyKey) headers.Authorization = `Bearer ${proxyKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(TOOL_SERVER_TIMEOUT_MS),
  });
  if (!res.ok) {
    console.warn("[tool-context] proxy http", res.status);
    return { ok: false, reason: `http_${res.status}` };
  }
  const json = res.json() as Promise<{
    chunks?: Array<{ id: string; text: string; source?: string }>;
  }>;
  const data = await json;
  const chunks = data.chunks ?? [];
  const items: ServerToolItem[] = chunks.map((c) => ({
    id: c.id,
    content: c.text,
    source: c.source,
    timestamp: Date.now(),
  }));
  return {
    ok: true,
    summary: `Документация (proxy): ${query.slice(0, 100)}`,
    items,
    metadata: { provider: "context7-proxy" },
  };
}

/** Web search через Tavily (ключ: TAVILY_API_KEY). */
export const serverToolSearch = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => toolQuerySchema.parse(data))
  .handler(async ({ data }): Promise<ServerToolSearchOutput> => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      console.info("[tool-search] tavily skipped: TAVILY_API_KEY unset");
      return { ok: false, reason: "missing_tavily_key" };
    }
    try {
      const { tavily } = await import("@tavily/core");
      const client = tavily({ apiKey });
      const res = await raceTimeout(
        client.search(data.query, {
          maxResults: 15,
          searchDepth: "basic",
        }),
        TOOL_SERVER_TIMEOUT_MS,
      );
      const items: ServerToolItem[] = res.results.map((r) => ({
        id: r.url,
        content: [r.title, r.content].filter(Boolean).join("\n"),
        source: r.url,
        timestamp: Date.now(),
      }));
      const summary =
        typeof res.answer === "string" && res.answer.trim()
          ? res.answer.trim()
          : `Результаты поиска: ${data.query.slice(0, 120)}`;
      console.info("[tool-search] tavily ok", {
        queryLen: data.query.length,
        n: items.length,
      });
      return {
        ok: true,
        summary,
        items,
        metadata: { provider: "tavily" },
      };
    } catch (e) {
      const reason = e instanceof Error && e.message === "tool_timeout" ? "timeout" : "tavily_error";
      console.warn("[tool-search]", reason, e);
      return { ok: false, reason };
    }
  });

/**
 * Context7: приоритет прямой API (CONTEXT7_API_KEY), иначе прокси (CONTEXT7_PROXY_URL).
 * Прокси: POST {base}/resolve JSON { query } → { chunks: [{ id, text, source? }] }.
 */
export const serverToolContext = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => toolQuerySchema.parse(data))
  .handler(async ({ data }): Promise<ServerToolContextOutput> => {
    const apiKey = process.env.CONTEXT7_API_KEY?.trim();
    const base = process.env.CONTEXT7_PROXY_URL?.trim();
    const proxyBearer = process.env.CONTEXT7_PROXY_API_KEY?.trim();

    if (apiKey) {
      const direct = await fetchContext7Direct(data.query, apiKey);
      if (direct.ok && direct.items.length > 0) return direct;
      if (!direct.ok) {
        console.info("[tool-context] direct failed", direct.reason);
      }
    }

    if (base) {
      try {
        const proxied = await fetchContext7Proxy(data.query, base, proxyBearer ?? apiKey);
        if (proxied.ok && proxied.items.length > 0) {
          console.info("[tool-context] proxy ok", { chunks: proxied.items.length });
          return proxied;
        }
        if (!proxied.ok) console.warn("[tool-context] proxy", proxied.reason);
      } catch (e) {
        const reason =
          e instanceof Error && e.name === "TimeoutError" ? "timeout" : "context7_proxy_error";
        console.warn("[tool-context]", reason, e);
      }
    }

    if (!apiKey && !base) {
      console.info("[tool-context] skipped: set CONTEXT7_API_KEY or CONTEXT7_PROXY_URL");
      return { ok: false, reason: "missing_context7_config" };
    }

    return { ok: false, reason: "context7_no_results" };
  });

export type ServerToolImageOutput =
  | {
      ok: true;
      summary: string;
      items: ServerToolItem[];
      metadata: { provider: string };
    }
  | { ok: false; reason: string };

/**
 * Генерация изображения для сайта (ключ: OPENAI_API_KEY).
 * Модель: OPENAI_IMAGE_MODEL или dall-e-3.
 */
export const serverToolImage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => toolQuerySchema.parse(data))
  .handler(async ({ data }): Promise<ServerToolImageOutput> => {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      console.info("[tool-image] skipped: OPENAI_API_KEY unset");
      return { ok: false, reason: "missing_openai_key" };
    }
    const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "dall-e-3";
    const prompt = `Professional marketing photograph for a website hero or section, no text, no logos, clean composition: ${data.query}`.slice(
      0,
      900,
    );
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size: "1024x1024",
          quality: "standard",
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const j = (await res.json()) as {
        data?: Array<{ url?: string }>;
        error?: { message?: string };
      };
      if (!res.ok) {
        console.warn("[tool-image] openai http", res.status, j.error?.message);
        return { ok: false, reason: j.error?.message ?? `openai_${res.status}` };
      }
      const url = j.data?.[0]?.url;
      if (!url) return { ok: false, reason: "openai_no_url" };
      console.info("[tool-image] openai ok", { model });
      return {
        ok: true,
        summary: `Изображение: ${data.query.slice(0, 80)}`,
        items: [
          {
            id: `img-${Date.now()}`,
            content: url,
            source: "openai-images",
            timestamp: Date.now(),
          },
        ],
        metadata: { provider: `openai:${model}` },
      };
    } catch (e) {
      console.warn("[tool-image] error", e);
      const reason = e instanceof Error && e.name === "TimeoutError" ? "timeout" : "openai_error";
      return { ok: false, reason };
    }
  });
