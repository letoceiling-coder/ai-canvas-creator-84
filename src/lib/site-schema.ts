import { z } from "zod";

export const sectionTypeSchema = z.enum([
  /** Sticky-навигация с логотипом и CTA. */
  "header",
  "hero",
  "features",
  "benefits",
  /** Социальное доказательство — отзывы клиентов с автором/должностью. */
  "testimonials",
  /** Цифры/метрики — KPI блок. */
  "stats",
  /** Этапы работы / процесс — нумерованные шаги. */
  "process",
  /** Часто задаваемые вопросы. */
  "faq",
  /** Контакты — телефон, email, адрес, форма. */
  "contacts",
  "about",
  "gallery",
  "pricing",
  "cta",
  "footer",
  /** Плейсхолдер мультистраничной навигации (название страницы от планировщика). */
  "page",
  /** Строковый элемент массива секций/компонентов, приведённый к блоку. */
  "text",
]);

export const blockAnimationTypeSchema = z.enum(["fade-in", "slide-up", "scale", "parallax"]);

export const blockAnimationSchema = z.object({
  type: blockAnimationTypeSchema,
  /** Длительность в секундах (если число > 10 — трактуется как миллисекунды). */
  duration: z.number().positive().max(120).optional(),
});

export const siteBlockSchema = z.object({
  type: sectionTypeSchema,
  content: z.record(z.unknown()),
  styles: z.record(z.unknown()),
  animations: z.record(z.unknown()),
  animation: blockAnimationSchema.optional(),
});

export const siteSchemaSchema = z.object({
  pages: z.array(siteBlockSchema),
  sections: z.array(siteBlockSchema),
  components: z.array(siteBlockSchema),
  styles: z.record(z.unknown()),
  animations: z.record(z.unknown()),
  /** Цели генерации (совместимость с планировщиком / SSOT). */
  goals: z
    .union([z.array(z.string()), z.null(), z.undefined()])
    .transform((v) =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [],
    ),
  images: z
    .union([z.array(z.string()), z.null(), z.undefined()])
    .transform((v) =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [],
    ),
});

export type SectionType = z.infer<typeof sectionTypeSchema>;
export type BlockAnimationType = z.infer<typeof blockAnimationTypeSchema>;
export type BlockAnimation = z.infer<typeof blockAnimationSchema>;
export type SiteBlock = z.infer<typeof siteBlockSchema>;
export type SiteSchema = z.infer<typeof siteSchemaSchema>;

const SITE_BLOCK_ARRAY_KEYS = ["pages", "sections", "components"] as const;

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function emptyRecord(): Record<string, unknown> {
  return {};
}

/** Строка названия страницы из планировщика → объект блока `page`. */
export function coerceStringToPageBlock(title: string): Record<string, unknown> {
  return {
    type: "page",
    content: {
      name: title,
      sections: [] as unknown[],
    },
    styles: emptyRecord(),
    animations: emptyRecord(),
  };
}

/** Случайная строка в sections/components → блок `text`. */
export function coerceStringToTextBlock(text: string): Record<string, unknown> {
  return {
    type: "text",
    content: { text },
    styles: emptyRecord(),
    animations: emptyRecord(),
  };
}

function coerceAnimationsStyles(
  v: unknown,
): { value: Record<string, unknown>; fixed: boolean } {
  if (v == null) return { value: emptyRecord(), fixed: true };
  if (isPlainRecord(v)) return { value: v, fixed: false };
  return { value: emptyRecord(), fixed: true };
}

function normalizeBlockObjectLoose(raw: Record<string, unknown>): {
  block: Record<string, unknown>;
  fixed: boolean;
} {
  let fixed = false;
  const type = raw.type;
  if (typeof type !== "string" || !type.trim()) {
    return {
      block: coerceStringToTextBlock(JSON.stringify(raw).slice(0, 200)),
      fixed: true,
    };
  }

  const { value: styles, fixed: fs } = coerceAnimationsStyles(raw.styles);
  if (fs) fixed = true;
  const { value: animations, fixed: fa } = coerceAnimationsStyles(raw.animations);
  if (fa) fixed = true;

  let content: Record<string, unknown>;
  const c = raw.content;
  if (typeof c === "string") {
    content = { text: c };
    fixed = true;
  } else if (c == null) {
    content = {};
    fixed = true;
  } else if (isPlainRecord(c)) {
    content = { ...c };
  } else {
    content = { body: String(c) };
    fixed = true;
  }

  const block: Record<string, unknown> = {
    type,
    content,
    styles,
    animations,
  };
  if ("animation" in raw && raw.animation != null) block.animation = raw.animation;
  return { block, fixed };
}

function normalizeImagesLoose(raw: unknown): { images: unknown[]; fixed: boolean } {
  if (!Array.isArray(raw)) return { images: [], fixed: false };
  let fixed = false;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x === "string") {
      const s = x.trim();
      if (s) out.push(s);
      continue;
    }
    if (isPlainRecord(x)) {
      const u =
        typeof x.url === "string"
          ? x.url
          : typeof x.src === "string"
            ? x.src
            : typeof x.href === "string"
              ? x.href
              : "";
      const t = u.trim();
      if (t) {
        out.push(t);
        fixed = true;
      } else fixed = true;
      continue;
    }
    fixed = true;
  }
  return { images: out, fixed };
}

export type NormalizeLooseSiteSchemaResult = {
  value: unknown;
  /** Были приведения строк / мусора / content как string / images не-URL. */
  schemaAutoFixed: boolean;
};

/**
 * Приводит типичный «битый» вывод LLM к виду, который пройдёт Zod:
 * - строки в `pages` → блоки `page` (имя страницы сохраняется);
 * - строки в `sections`/`components` → блоки `text`;
 * - у блоков `content` должен быть object; styles/animations — object;
 * - `images`: только строки URL; объекты с url/src по возможности извлекаются.
 */
export function normalizeLooseSiteSchemaInputDetailed(
  input: unknown,
): NormalizeLooseSiteSchemaResult {
  if (!isPlainRecord(input)) {
    return { value: input, schemaAutoFixed: false };
  }
  let schemaAutoFixed = false;
  const out: Record<string, unknown> = { ...input };

  for (const key of SITE_BLOCK_ARRAY_KEYS) {
    const arr = out[key];
    if (!Array.isArray(arr)) continue;
    const next: Record<string, unknown>[] = [];
    for (const item of arr) {
      if (typeof item === "string") {
        schemaAutoFixed = true;
        const block =
          key === "pages" ? coerceStringToPageBlock(item) : coerceStringToTextBlock(item);
        next.push(block);
        continue;
      }
      if (!isPlainRecord(item)) {
        schemaAutoFixed = true;
        continue;
      }
      if (typeof item.type !== "string" || !item.type.trim()) {
        schemaAutoFixed = true;
        continue;
      }
      const { block, fixed } = normalizeBlockObjectLoose(item);
      if (fixed) schemaAutoFixed = true;
      next.push(block);
    }
    out[key] = next;
  }

  if ("images" in out) {
    if (!Array.isArray(out.images)) {
      out.images = [];
      schemaAutoFixed = true;
    } else {
      const { images, fixed } = normalizeImagesLoose(out.images);
      if (fixed) schemaAutoFixed = true;
      out.images = images;
    }
  }

  if (!("goals" in out) || !Array.isArray(out.goals)) {
    out.goals = ["generate landing page"];
    schemaAutoFixed = true;
  } else {
    out.goals = (out.goals as unknown[]).filter((x): x is string => typeof x === "string");
  }

  return { value: out, schemaAutoFixed };
}

export function normalizeLooseSiteSchemaInput(input: unknown): unknown {
  return normalizeLooseSiteSchemaInputDetailed(input).value;
}

/** Парсит неизвестные данные в `SiteSchema` или кидает `ZodError`. */
export function validateSiteSchema(input: unknown): SiteSchema {
  const { value } = normalizeLooseSiteSchemaInputDetailed(input);
  return siteSchemaSchema.parse(value);
}

/** Без исключений: результат парсинга или ошибка Zod. */
export function safeValidateSiteSchema(input: unknown) {
  const { value } = normalizeLooseSiteSchemaInputDetailed(input);
  return siteSchemaSchema.safeParse(value);
}
