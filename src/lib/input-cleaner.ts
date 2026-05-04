/**
 * Input Cleaner — стабилизация входа в pipeline.
 * Детерминированная очистка БЕЗ LLM: безопасно, быстро, не ломает контракт.
 *
 * - Лимит длины (защита от мега-промптов).
 * - Чистка управляющих символов.
 * - Извлечение бросающихся в глаза ограничений ("без воды", "только тёмная тема", цвет, цены, цифры, контакты).
 * - Сохранение хвоста в краткое summary.
 */

const MAX_PROMPT_CHARS = 6_000;
const HEAD_KEEP = 3_500;
const TAIL_KEEP = 1_200;

/** Жёсткие ограничения, которые легко выловить регулярками. */
const CONSTRAINT_PATTERNS: Array<{ id: string; re: RegExp; label: string }> = [
  { id: "dark", re: /\b(тём?ная?|dark[\s-]?theme|чёрн|темн)\b/i, label: "тема: dark" },
  { id: "light", re: /\b(светл|light[\s-]?theme|белый фон|минимализм)\b/i, label: "тема: light" },
  { id: "premium", re: /\b(премиум|luxury|премьер|эксклюз)\b/i, label: "стиль: premium" },
  { id: "playful", re: /\b(весёл|playful|молодёжн|игрив)\b/i, label: "стиль: playful" },
  { id: "corporate", re: /\b(корпорат|enterprise|b2b|официальн)\b/i, label: "стиль: corporate" },
  { id: "ru", re: /[а-яё]/i, label: "язык: ru" },
  { id: "en", re: /\bthe\b|\bof\b|\band\b|english/i, label: "язык: en" },
];

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

export type CleanedInput = {
  /** Очищенный, ограниченный по длине бриф для агентов. */
  prompt: string;
  /** Был ли применён trim. */
  truncated: boolean;
  /** Размер до обрезки. */
  originalLength: number;
  /** Извлечённые жёсткие ограничения (для логов и инструкций агентам). */
  constraints: string[];
  /** Режим: новый сайт vs итерация. */
  mode: "greenfield" | "iterate";
};

function stripControlChars(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
}

function collapseWhitespace(s: string): string {
  return s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Главная функция: чистит prompt и возвращает структуру для дальнейшей передачи. */
export function cleanUserPrompt(rawPrompt: string, hasExistingSite = false): CleanedInput {
  const original = typeof rawPrompt === "string" ? rawPrompt : "";
  const originalLength = original.length;
  const cleaned = collapseWhitespace(stripControlChars(original));

  const constraints = dedupe(
    CONSTRAINT_PATTERNS.filter((p) => p.re.test(cleaned)).map((p) => p.label),
  );

  let truncated = false;
  let prompt = cleaned;
  if (cleaned.length > MAX_PROMPT_CHARS) {
    truncated = true;
    const head = cleaned.slice(0, HEAD_KEEP);
    const tail = cleaned.slice(-TAIL_KEEP);
    prompt = `${head}\n\n[…пропущено ${cleaned.length - HEAD_KEEP - TAIL_KEEP} символов из середины брифа…]\n\n${tail}`;
  }

  return {
    prompt,
    truncated,
    originalLength,
    constraints,
    mode: hasExistingSite ? "iterate" : "greenfield",
  };
}
