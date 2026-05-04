/** OpenAI-совместимый /v1/chat/completions (Ollama proxy и т.п.). */

const DEFAULT_CHAT_URL = "https://ollama.siteaacess.store/v1/chat/completions";
export const OLLAMA_REQUEST_TIMEOUT_MS = 120_000;

type NodeProc = { env?: Record<string, string | undefined> };

/**
 * Чтение env в runtime. Важно: Cloudflare/Vite при сборке воркера может за-inline-ить
 * статические `process.env.MY_KEY` в значения этапа сборки; динамический доступ `env[key]` сохраняет значения из PM2 / .dev.vars.
 */
function readEnv(...keys: string[]): string | undefined {
  try {
    const proc = globalThis.process as NodeProc | undefined;
    const envObj = proc?.env;
    if (envObj && typeof envObj === "object") {
      for (const key of keys) {
        const v = envObj[key];
        if (v != null && String(v).trim() !== "") return String(v).trim();
      }
    }
  } catch {
    /* ignore */
  }
  const meta = import.meta.env as Record<string, string | boolean | undefined>;
  for (const key of keys) {
    const v = meta[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return undefined;
}

/** Полный URL …/chat/completions или база …/v1 (как в прокси siteaacess). */
function normalizeChatCompletionsUrl(url: string): string {
  const t = url.trim().replace(/\/+$/, "");
  if (t.endsWith("/chat/completions")) return t;
  if (t.endsWith("/v1")) return `${t}/chat/completions`;
  return t;
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function getOllamaChatCompletionsUrl(): string {
  const raw = readEnv("OLLAMA_CHAT_URL", "VITE_OLLAMA_CHAT_URL");
  if (raw) return normalizeChatCompletionsUrl(raw);
  return DEFAULT_CHAT_URL;
}

export function getOllamaToken(): string {
  const token = readEnv("OLLAMA_API_TOKEN", "VITE_OLLAMA_API_TOKEN");
  if (!token) {
    throw new Error(
      "Ollama token is not set: set OLLAMA_API_TOKEN or VITE_OLLAMA_API_TOKEN in .env on the server (PM2), see .env.example",
    );
  }
  return token;
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === "AbortError";
  return err instanceof Error && err.name === "AbortError";
}

async function fetchCompletionOnce(
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(getOllamaChatCompletionsUrl(), {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${getOllamaToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages,
    }),
  });

  if (res.status === 401) throw new Error("Ollama API: 401 unauthorized");
  if (res.status === 503) throw new Error("Ollama API: 503 service unavailable");
  if (!res.ok) throw new Error(`Ollama API: HTTP ${res.status}`);

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (text == null || typeof text !== "string") {
    throw new Error("Ollama API: empty or invalid response content");
  }
  return text;
}

async function fetchCompletionStreamOnce(
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal,
  onChunk: (text: string) => void,
): Promise<string> {
  const res = await fetch(getOllamaChatCompletionsUrl(), {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${getOllamaToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages,
    }),
  });

  if (res.status === 401) throw new Error("Ollama API: 401 unauthorized");
  if (res.status === 503) throw new Error("Ollama API: 503 service unavailable");
  if (!res.ok) throw new Error(`Ollama API: HTTP ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Ollama API: no response body");

  const decoder = new TextDecoder();
  let carry = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    const parts = carry.split("\n");
    carry = parts.pop() ?? "";
    for (const line of parts) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string | null }; message?: { content?: string | null } }>;
        };
        const ch = j.choices?.[0];
        const piece = ch?.delta?.content ?? ch?.message?.content ?? "";
        if (piece) {
          full += piece;
          onChunk(piece);
        }
      } catch {
        /* ignore malformed chunk */
      }
    }
  }
  if (carry.trim()) {
    const t = carry.trim();
    if (t.startsWith("data:")) {
      const payload = t.slice(5).trim();
      if (payload !== "[DONE]") {
        try {
          const j = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string | null } }>;
          };
          const piece = j.choices?.[0]?.delta?.content ?? "";
          if (piece) {
            full += piece;
            onChunk(piece);
          }
        } catch {
          /* ignore */
        }
      }
    }
  }
  return full;
}

export type CallChatOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Повтор при сетевой ошибке / 5xx */
  maxRetries?: number;
  /** §20.12 SSE: поток дельт контента (OpenAI-совместимый stream) */
  onTokenChunk?: (chunk: string) => void;
};

/**
 * Один вызов чата с таймаутом и простыми ретраями.
 */
export async function callChatCompletions(
  model: string,
  messages: ChatMessage[],
  options: CallChatOptions = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? OLLAMA_REQUEST_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? 1;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const onParentAbort = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", onParentAbort, { once: true });
    }

    try {
      const content = options.onTokenChunk
        ? await fetchCompletionStreamOnce(model, messages, controller.signal, options.onTokenChunk)
        : await fetchCompletionOnce(model, messages, controller.signal);
      clearTimeout(timeoutId);
      return content;
    } catch (err) {
      clearTimeout(timeoutId);
      lastErr = err;
      if (options.signal?.aborted) throw err;
      if (isAbortError(err)) {
        throw new Error("Ollama API: request timeout");
      }
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        msg.includes("HTTP 5") ||
        msg.includes("fetch") ||
        msg.includes("network") ||
        msg.includes("Failed to fetch");
      if (!retryable || attempt >= maxRetries) throw err;
    }
  }
  throw lastErr;
}

export type CallWithFallbackResult = { content: string; modelUsed: string };

/** Сначала primary, затем по очереди fallback-модели при ошибке. */
export async function callChatCompletionsWithFallback(
  primaryModel: string,
  fallbackModels: string[],
  messages: ChatMessage[],
  options: CallChatOptions = {},
): Promise<CallWithFallbackResult> {
  const chain = [primaryModel, ...fallbackModels];
  let lastErr: unknown;
  for (const model of chain) {
    try {
      const content = await callChatCompletions(model, messages, options);
      return { content, modelUsed: model };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
