/**
 * Обёртка над дефолтным entry TanStack Start для Cloudflare / Miniflare.
 * Секреты из `.dev.vars` приходят во втором аргументе `fetch` (`env`), а не в `process.env`;
 * без этого библиотеки вроде ollama-openai не видят OLLAMA_API_TOKEN.
 */
import tanstackApp from "@tanstack/react-start/server-entry";

function mergeCloudflareEnvIntoProcess(env: Record<string, unknown>): void {
  try {
    const target = globalThis.process?.env as Record<string, string | undefined> | undefined;
    if (!target) return;
    for (const [key, value] of Object.entries(env)) {
      if (value == null) continue;
      const s = typeof value === "string" ? value : String(value);
      if (s.trim() !== "") target[key] = s;
    }
  } catch {
    /* ignore */
  }
}

export default {
  async fetch(request: Request, env: Record<string, unknown>, ctx: unknown) {
    mergeCloudflareEnvIntoProcess(env);
    return tanstackApp.fetch(request, env, ctx);
  },
};
