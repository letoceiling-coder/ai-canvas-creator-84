/**
 * Premium content enricher: дополняет бедный SiteSchema до премиум-уровня.
 * Срабатывает ПОСЛЕ парса и валидации Zod.
 *
 * - Гарантирует header/footer.
 * - Дополняет footer колонками если их нет.
 * - Дополняет features если < 3 элементов.
 * - Дополняет benefits если пусты.
 * - Гарантирует CTA-блок.
 *
 * Все генерируемые тексты — нейтральные, на языке брифа (ru/en по эвристике).
 */

import type { SiteBlock, SiteSchema } from "@/lib/site-schema";

function isRussian(s: string): boolean {
  return /[а-яё]/i.test(s);
}

function emptyBlock(type: string, content: Record<string, unknown>): SiteBlock {
  return {
    type: type as SiteBlock["type"],
    content,
    styles: {},
    animations: {},
  };
}

const RU_DEFAULTS = {
  headerNav: [
    { label: "Возможности", href: "#features" },
    { label: "Преимущества", href: "#benefits" },
    { label: "Тарифы", href: "#pricing" },
    { label: "Отзывы", href: "#testimonials" },
    { label: "Контакты", href: "#contacts" },
  ],
  headerCta: "Связаться",
  features: [
    { title: "Качество без компромиссов", description: "Каждый этап под контролем — от замера до финальной приёмки." },
    { title: "Быстрые сроки", description: "Чёткий график работ и соблюдение дедлайнов без задержек." },
    { title: "Прозрачная цена", description: "Фиксированная стоимость без скрытых доплат и сюрпризов." },
  ],
  benefits: [
    { title: "Гарантия 5 лет", description: "Письменная гарантия на материалы и работы." },
    { title: "Опыт 10+ лет", description: "Сотни реализованных проектов в портфолио." },
    { title: "Сертифицированные мастера", description: "Только профильные специалисты с опытом." },
  ],
  cta: {
    headline: "Готовы начать?",
    subheadline: "Оставьте заявку — рассчитаем стоимость и подберём решение под ваш запрос.",
    buttonText: "Получить расчёт",
  },
  footerCols: [
    {
      title: "Услуги",
      links: [
        { label: "Возможности", href: "#features" },
        { label: "Тарифы", href: "#pricing" },
      ],
    },
    {
      title: "Компания",
      links: [
        { label: "О нас", href: "#about" },
        { label: "Отзывы", href: "#testimonials" },
      ],
    },
    {
      title: "Контакты",
      links: [
        { label: "Связаться", href: "#contacts" },
        { label: "FAQ", href: "#faq" },
      ],
    },
  ],
  footerCopyright: `© ${new Date().getFullYear()} Все права защищены`,
};

const EN_DEFAULTS = {
  headerNav: [
    { label: "Features", href: "#features" },
    { label: "Benefits", href: "#benefits" },
    { label: "Pricing", href: "#pricing" },
    { label: "Reviews", href: "#testimonials" },
    { label: "Contact", href: "#contacts" },
  ],
  headerCta: "Get started",
  features: [
    { title: "Premium quality", description: "Every step is controlled — from start to final delivery." },
    { title: "Fast turnaround", description: "Clear timeline and on-time delivery, every time." },
    { title: "Transparent pricing", description: "Fixed cost with no hidden fees or surprises." },
  ],
  benefits: [
    { title: "5-year warranty", description: "Written guarantee on materials and workmanship." },
    { title: "10+ years experience", description: "Hundreds of completed projects in our portfolio." },
    { title: "Certified specialists", description: "Only skilled professionals work on your project." },
  ],
  cta: {
    headline: "Ready to start?",
    subheadline: "Get in touch — we'll prepare a tailored proposal for you.",
    buttonText: "Get a quote",
  },
  footerCols: [
    {
      title: "Product",
      links: [
        { label: "Features", href: "#features" },
        { label: "Pricing", href: "#pricing" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "#about" },
        { label: "Reviews", href: "#testimonials" },
      ],
    },
    {
      title: "Contact",
      links: [
        { label: "Get in touch", href: "#contacts" },
        { label: "FAQ", href: "#faq" },
      ],
    },
  ],
  footerCopyright: `© ${new Date().getFullYear()} All rights reserved`,
};

function pick(s: string) {
  return isRussian(s) ? RU_DEFAULTS : EN_DEFAULTS;
}

function getArrayField(b: SiteBlock, ...keys: string[]): unknown[] {
  const c = b.content as Record<string, unknown>;
  for (const k of keys) {
    const v = c[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function setContent<T extends Record<string, unknown>>(
  b: SiteBlock,
  patch: T,
): SiteBlock {
  return { ...b, content: { ...b.content, ...patch } };
}

/** Усиливает SiteSchema до премиум-структуры. Возвращает новый объект. */
export function enrichSitePremium(site: SiteSchema, brief: string): SiteSchema {
  const lang = pick(brief);
  const sections = [...site.sections];

  const idxOf = (t: string) => sections.findIndex((b) => b.type === t);

  // 1. Header — всегда в начале.
  if (idxOf("header") < 0) {
    const brand =
      (site.styles as Record<string, unknown>).pageTitle &&
      typeof (site.styles as Record<string, unknown>).pageTitle === "string"
        ? String((site.styles as Record<string, unknown>).pageTitle)
        : isRussian(brief)
          ? "Бренд"
          : "Brand";
    sections.unshift(
      emptyBlock("header", {
        brand,
        nav: lang.headerNav,
        ctaLabel: lang.headerCta,
      }),
    );
  }

  // 2. Hero — обязательный.
  if (idxOf("hero") < 0) {
    const title = isRussian(brief) ? "Премиум-решение под ваш запрос" : "Premium solution for your need";
    const sub = isRussian(brief)
      ? "Подбираем оптимальный вариант под ваши задачи, бюджет и сроки."
      : "Tailored to your goals, budget and timeline.";
    const heroIdx = idxOf("header") + 1;
    sections.splice(heroIdx, 0, emptyBlock("hero", {
      headline: title,
      subheadline: sub,
      ctaLabel: lang.cta.buttonText,
    }));
  }

  // 3. Features — минимум 3 элемента.
  const fIdx = idxOf("features");
  if (fIdx >= 0) {
    const items = getArrayField(sections[fIdx]!, "items", "features");
    if (items.length < 3) {
      const filled = [...items, ...lang.features].slice(0, Math.max(3, items.length));
      sections[fIdx] = setContent(sections[fIdx]!, {
        title:
          (sections[fIdx]!.content as Record<string, unknown>).title ||
          (isRussian(brief) ? "Что вы получаете" : "What you get"),
        items: filled,
      });
    }
  }

  // 4. Benefits — минимум 3 элемента.
  const bIdx = idxOf("benefits");
  if (bIdx >= 0) {
    const items = getArrayField(sections[bIdx]!, "items", "bullets", "points");
    if (items.length < 3) {
      const filled = [...items, ...lang.benefits].slice(0, Math.max(3, items.length));
      sections[bIdx] = setContent(sections[bIdx]!, {
        title:
          (sections[bIdx]!.content as Record<string, unknown>).title ||
          (isRussian(brief) ? "Почему выбирают нас" : "Why choose us"),
        items: filled,
      });
    }
  }

  // 5. CTA — гарантировать перед footer.
  if (idxOf("cta") < 0) {
    const ftIdx = idxOf("footer");
    const ctaBlock = emptyBlock("cta", lang.cta);
    if (ftIdx >= 0) sections.splice(ftIdx, 0, ctaBlock);
    else sections.push(ctaBlock);
  }

  // 6. Footer — гарантировать в конце с минимум 3 колонками.
  const ftIdx = idxOf("footer");
  if (ftIdx < 0) {
    sections.push(
      emptyBlock("footer", {
        brand: isRussian(brief) ? "Бренд" : "Brand",
        tagline: isRussian(brief) ? "Премиум-сервис под ключ" : "Premium service",
        columns: lang.footerCols,
        copyright: lang.footerCopyright,
      }),
    );
  } else {
    const ft = sections[ftIdx]!;
    const cols = getArrayField(ft, "columns");
    if (cols.length < 2) {
      sections[ftIdx] = setContent(ft, { columns: lang.footerCols });
    }
    const c = ft.content as Record<string, unknown>;
    if (!c.copyright || (typeof c.copyright === "string" && !c.copyright.trim())) {
      sections[ftIdx] = setContent(sections[ftIdx]!, { copyright: lang.footerCopyright });
    }
    if (!c.brand || (typeof c.brand === "string" && !c.brand.trim())) {
      sections[ftIdx] = setContent(sections[ftIdx]!, {
        brand: isRussian(brief) ? "Бренд" : "Brand",
      });
    }
  }

  return { ...site, sections };
}
