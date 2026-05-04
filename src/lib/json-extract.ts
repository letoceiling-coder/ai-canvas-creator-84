/**
 * Единый JSON-extractor / safe parser для всех LLM-ответов.
 *
 * Слой 1 — строгий JSON Stability:
 *  - извлечь JSON из любого текста (markdown fence, преамбула, постамбула);
 *  - попытаться починить мусор (trailing commas, незакрытые скобки, JS-комменты);
 *  - вернуть machine-readable результат БЕЗ исключений.
 *
 * НЕ использует eval / new Function.
 */

const MAX_INPUT_LENGTH = 1_000_000;

export type SafeJsonResult<T = unknown> =
  | { ok: true; data: T; repaired: boolean }
  | { ok: false; error: "invalid_json" };

/**
 * Извлекает наиболее правдоподобный JSON-фрагмент из произвольного текста LLM.
 * Возвращает строку, которая является кандидатом на JSON.parse.
 * Если кандидата найти не удалось — вернёт пустую строку.
 */
export function extractJsonFromText(text: string): string {
  if (typeof text !== "string" || text.length === 0) return "";

  let s = text.length > MAX_INPUT_LENGTH ? text.slice(0, MAX_INPUT_LENGTH) : text;

  const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence && fence[1]) {
    s = fence[1];
  }

  s = s.trim();
  if (!s) return "";

  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  let firstIdx = -1;
  if (firstObj === -1) firstIdx = firstArr;
  else if (firstArr === -1) firstIdx = firstObj;
  else firstIdx = Math.min(firstObj, firstArr);
  if (firstIdx < 0) return "";

  s = s.slice(firstIdx);

  const opener = s[0];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastBalanced = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{" || c === "[") {
      depth++;
    } else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) {
        lastBalanced = i;
        break;
      }
    }
  }

  if (lastBalanced >= 0) {
    return s.slice(0, lastBalanced + 1);
  }

  // Незакрытый JSON: попытка починки через стек незакрытых.
  const stack: string[] = [];
  inString = false;
  escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
  }
  let repaired = s;
  if (inString) repaired += '"';
  while (stack.length > 0) {
    const close = stack.pop();
    if (close) repaired += close;
  }
  void closer;
  return repaired;
}

/**
 * Удаляет JS-style comments и trailing commas, безопасно для строк.
 */
function lightRepair(text: string): string {
  if (!text) return text;
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (escape) {
      out += c;
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      out += c;
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      out += c;
      continue;
    }
    if (!inString) {
      if (c === "/" && n === "/") {
        while (i < text.length && text[i] !== "\n") i++;
        continue;
      }
      if (c === "/" && n === "*") {
        i += 2;
        while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
        i++;
        continue;
      }
    }
    out += c;
  }
  out = out.replace(/,(\s*[}\]])/g, "$1");
  return out;
}

/**
 * Безопасный JSON parse для ответов LLM.
 * НИКОГДА не бросает исключение — всегда {ok:true,data} или {ok:false,error:"invalid_json"}.
 *
 * Стратегия:
 *  1) Прямой JSON.parse(trim).
 *  2) extractJsonFromText → JSON.parse.
 *  3) lightRepair (комменты + trailing commas) → JSON.parse.
 */
export function safeParseJson<T = unknown>(text: unknown): SafeJsonResult<T> {
  if (typeof text !== "string" || text.trim().length === 0) {
    return { ok: false, error: "invalid_json" };
  }
  const trimmed = text.trim();
  try {
    const data = JSON.parse(trimmed) as T;
    return { ok: true, data, repaired: false };
  } catch {
    /* fallthrough */
  }
  const extracted = extractJsonFromText(text);
  if (extracted) {
    try {
      const data = JSON.parse(extracted) as T;
      return { ok: true, data, repaired: extracted !== trimmed };
    } catch {
      /* fallthrough */
    }
    const repaired = lightRepair(extracted);
    if (repaired && repaired !== extracted) {
      try {
        const data = JSON.parse(repaired) as T;
        return { ok: true, data, repaired: true };
      } catch {
        /* fallthrough */
      }
    }
  }
  return { ok: false, error: "invalid_json" };
}

/**
 * Удобный helper: возвращает распарсенный объект или undefined без исключения.
 */
export function tryParseJsonObject<T = Record<string, unknown>>(
  text: unknown,
): T | undefined {
  const r = safeParseJson<T>(text);
  return r.ok ? r.data : undefined;
}

/**
 * Универсальное правило для system-prompt всех JSON-ролей.
 * Оставлено в этом модуле как SSOT, чтобы случайно не «размывать» по проекту.
 */
export const JSON_OUTPUT_CRITICAL_RULES = `

CRITICAL OUTPUT RULES:
- Return ONLY a single valid JSON value (object or array). No prose.
- Do NOT include explanations, apologies, or commentary before/after JSON.
- Do NOT wrap JSON in markdown fences \`\`\`json … \`\`\`.
- Do NOT include comments (// or /* */) inside JSON.
- Do NOT use trailing commas.
- All strings MUST use straight double quotes (").
- The output MUST be parseable by JSON.parse on the first character of the response.
`;
