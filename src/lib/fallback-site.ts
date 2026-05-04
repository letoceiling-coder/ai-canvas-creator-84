/**
 * Аварийный валидный сайт, если пайплайн не смог завершиться без ошибки.
 */

import type { SiteSchema } from "@/lib/site-schema";

export function generateFallbackSiteSchema(userIntent: string): SiteSchema {
  const hint = userIntent.slice(0, 120).trim() || "лендинг";
  return {
    pages: [],
    sections: [
      {
        type: "hero",
        content: {
          headline: hint,
          subheadline:
            "Сгенерирован упрощённый вариант — уточните запрос или попробуйте ещё раз для полной версии.",
          ctaLabel: "Связаться",
        },
        styles: { paddingTop: "48px", fontSize: "clamp(1rem,2.5vw,1.125rem)", lineHeight: 1.45 },
        animations: {},
      },
      {
        type: "features",
        content: {
          title: "Почему мы",
          items: [
            { title: "Качество", description: "Внимание к деталям и структуре." },
            { title: "Сроки", description: "Понятный процесс без лишней бюрократии." },
            { title: "Поддержка", description: "Остаёмся на связи после запуска." },
          ],
        },
        styles: { paddingTop: "32px", gap: "20px" },
        animations: {},
      },
      {
        type: "cta",
        content: {
          headline: "Готовы обсудить проект?",
          subheadline: "Опишите задачу в чате — мы доработаем страницу.",
          buttonText: "Написать",
        },
        styles: { paddingTop: "32px" },
        animations: {},
      },
      {
        type: "footer",
        content: {
          brand: "Site",
          tagline: "",
          columns: [],
          copyright: `© ${new Date().getFullYear()}`,
        },
        styles: { paddingTop: "24px" },
        animations: {},
      },
    ],
    components: [],
    styles: {
      theme: "dark",
      pageTitle: "Preview",
      accentGradient: "linear-gradient(135deg, #6366f1, #a855f7)",
    },
    animations: { preset: "subtle" },
    images: [],
    goals: ["generate landing page"],
  };
}
