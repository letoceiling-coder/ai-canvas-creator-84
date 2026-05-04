import { z } from "zod";

export const sectionTypeSchema = z.enum([
  "hero",
  "features",
  "benefits",
  "cta",
  "footer",
  "about",
  "gallery",
  "pricing",
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

/**
 * Убирает из pages/sections/components элементы, которые не похожи на блок
 * (строки с названиями страниц, числа и т.д.). Это снимает типичный сбой модели,
 * когда планировщик кладёт string[] в `pages` вместо объектов SiteBlock.
 */
export function normalizeLooseSiteSchemaInput(input: unknown): unknown {
  if (!isPlainRecord(input)) return input;
  const out: Record<string, unknown> = { ...input };
  for (const key of SITE_BLOCK_ARRAY_KEYS) {
    const arr = out[key];
    if (!Array.isArray(arr)) continue;
    out[key] = arr.filter(
      (item): item is Record<string, unknown> =>
        isPlainRecord(item) && typeof item.type === "string",
    );
  }
  return out;
}

/** Парсит неизвестные данные в `SiteSchema` или кидает `ZodError`. */
export function validateSiteSchema(input: unknown): SiteSchema {
  return siteSchemaSchema.parse(normalizeLooseSiteSchemaInput(input));
}

/** Без исключений: результат парсинга или ошибка Zod. */
export function safeValidateSiteSchema(input: unknown) {
  return siteSchemaSchema.safeParse(normalizeLooseSiteSchemaInput(input));
}
