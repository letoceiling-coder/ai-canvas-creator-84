import { SITE_JSON_SYSTEM_PROMPT } from "@/lib/ai-prompt";
import { callChatCompletions, OLLAMA_REQUEST_TIMEOUT_MS } from "@/lib/ollama-openai";

/**
 * Одношаговая генерация SiteSchema (без multi-agent пайплайна).
 * @see runPipeline — полный оркестратор.
 */
export async function generateWebsite(prompt: string): Promise<string> {
  return callChatCompletions(
    "qwen2.5-coder:7b",
    [
      { role: "system", content: SITE_JSON_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    { timeoutMs: OLLAMA_REQUEST_TIMEOUT_MS, maxRetries: 1 },
  );
}
