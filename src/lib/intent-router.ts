/**
 * Эвристический маршрутизатор: мгновенные правки vs полный pipeline.
 * Без LLM — детерминированно, для chat-first UX.
 */

import type { SectionType } from "@/lib/site-schema";

export type InstantAction =
  | { type: "style_theme"; theme: "dark" | "light" }
  | { type: "style_accent_premium" }
  | { type: "add_section"; sectionType: SectionType; variant?: "reviews" | "pricing" | "default" }
  | { type: "remove_section"; sectionType: SectionType }
  | { type: "bring_section_forward"; sectionType: SectionType }
  | { type: "increase_spacing" };

export type RoutedIntent =
  | { kind: "full_pipeline"; reason: string }
  | { kind: "instant"; action: InstantAction; reason: string };

/** Явный запуск полной генерации (новый сайт / пересбор с нуля). */
function wantsFullSiteBlueprint(lower: string, t: string): boolean {
  if (
    /(^|\s)(создай|сгенерируй|нам нужен|нужен)\s+(новый\s+)?(сайт|лендинг|страниц)/i.test(t)
  ) {
    return true;
  }
  if (/(полн(ый|ая)\s+пересбор|с нуля|заново\s+вс(ё|е))/i.test(t)) return true;
  if (/(новый\s+проект|сайт\s+с\s+нуля)/i.test(lower)) return true;
  // Длинный описательный бриф без явного «добавь» — чаще новая генерация
  if (t.length > 120 && !/(добавь|убери|удали|сделай\s+темн|сделай\s+светл|измени|тариф|отзыв)/i.test(t)) {
    return true;
  }
  return false;
}

function wantsStyleThemeDark(t: string): boolean {
  return (
    (/(тёмн|темн|dark|noir)/i.test(t) &&
      /(стил|тем|оформлен|фон|цвет|palette|палитр|интерфейс)/i.test(t)) ||
    /^сделай\s+темн/i.test(t.trim()) ||
    /сделай\s+тёмн/i.test(t)
  );
}

function wantsStyleThemeLight(t: string): boolean {
  return (
    (/(светл|light)/i.test(t) && /(стил|тем|оформлен|фон)/i.test(t)) ||
    /^сделай\s+светл/i.test(t.trim())
  );
}

function wantsReviews(t: string): boolean {
  return /(отзыв|testimonial|reviews?|клиенты\s+говор)/i.test(t);
}

function wantsPricing(t: string): boolean {
  return /(тариф|прайс|цен|pricing|подписк)/i.test(t);
}

function wantsMoreSpacing(t: string): boolean {
  return /(отступ|побольше\s+воздух|больше\s+пространств|больше\s+воздуха|spacing|padding|разреж)/i.test(
    t,
  );
}

function wantsRemove(lower: string, t: string): SectionType | null {
  if (!/(убери|удали|убрать|удалить|убрать\s+секц)/i.test(t)) return null;
  if (/(тариф|прайс|pricing|цен)/i.test(t)) return "pricing";
  if (/(отзыв|testimonial)/i.test(t)) return "features"; // эвристика: отзывы в features
  if (/(герой|hero)/i.test(lower)) return "hero";
  if (/(футер|footer|подвал)/i.test(lower)) return "footer";
  if (/(галере)/i.test(lower)) return "gallery";
  if (/(преимуществ|features)/i.test(lower)) return "features";
  return null;
}

function wantsBringForward(t: string): SectionType | null {
  if (!/(выше|в начал|подними|bring\s+up)/i.test(t)) return null;
  if (/(отзыв)/i.test(t)) return "features";
  if (/(тариф|pricing)/i.test(t)) return "pricing";
  return null;
}

/**
 * @param message — последнее сообщение пользователя
 * @param hasSite — есть ли текущий SiteSchema (иначе всегда full_pipeline)
 */
export function resolveUserIntent(message: string, hasSite: boolean): RoutedIntent {
  const t = message.trim();
  const lower = t.toLowerCase();

  if (!hasSite) {
    return { kind: "full_pipeline", reason: "Ещё нет сайта — нужна полная генерация." };
  }

  if (wantsFullSiteBlueprint(lower, t)) {
    return { kind: "full_pipeline", reason: "Запрошена новая страница/полная пересборка." };
  }

  if (wantsStyleThemeDark(t)) {
    return { kind: "instant", action: { type: "style_theme", theme: "dark" }, reason: "Смена темы на тёмную." };
  }
  if (wantsStyleThemeLight(t)) {
    return { kind: "instant", action: { type: "style_theme", theme: "light" }, reason: "Смена темы на светлую." };
  }

  if (wantsMoreSpacing(t)) {
    return {
      kind: "instant",
      action: { type: "increase_spacing" },
      reason: "Увеличение отступов между секциями.",
    };
  }

  if (/(премиум|premium)\s*(стил|вид|оформл)/i.test(t) || /^сделай\s+премиум/i.test(t.trim())) {
    return {
      kind: "instant",
      action: { type: "style_accent_premium" },
      reason: "Усиление премиального акцента в стилях.",
    };
  }

  const removeType = wantsRemove(lower, t);
  if (removeType) {
    return {
      kind: "instant",
      action: { type: "remove_section", sectionType: removeType },
      reason: `Удаление секции типа ${removeType}.`,
    };
  }

  const bring = wantsBringForward(t);
  if (bring) {
    return {
      kind: "instant",
      action: { type: "bring_section_forward", sectionType: bring },
      reason: `Секция ${bring} выше по странице.`,
    };
  }

  if (/(добавь|вставь|ещё|еще)\s*/i.test(t) || /^\+/.test(t)) {
    if (wantsReviews(t)) {
      return {
        kind: "instant",
        action: { type: "add_section", sectionType: "features", variant: "reviews" },
        reason: "Добавление блока отзывов.",
      };
    }
    if (wantsPricing(t)) {
      return {
        kind: "instant",
        action: { type: "add_section", sectionType: "pricing", variant: "pricing" },
        reason: "Добавление блока тарифов.",
      };
    }
  }

  // Короткие команды без «добавь»
  if (wantsReviews(t) && t.length < 80) {
    return {
      kind: "instant",
      action: { type: "add_section", sectionType: "features", variant: "reviews" },
      reason: "Добавление отзывов.",
    };
  }
  if (wantsPricing(t) && t.length < 80) {
    return {
      kind: "instant",
      action: { type: "add_section", sectionType: "pricing", variant: "pricing" },
      reason: "Добавление тарифов.",
    };
  }

  return { kind: "full_pipeline", reason: "Запрос лучше обработать полным пайплайном." };
}
