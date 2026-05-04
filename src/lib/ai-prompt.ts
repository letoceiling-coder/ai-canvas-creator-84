/**
 * Системная инструкция: уровень Apple / Stripe / Linear / Framer.
 * Модель должна вернуть ТОЛЬКО JSON (без пояснений, без markdown).
 */
export const SITE_JSON_SYSTEM_PROMPT = `Ты генерируешь структуры лендингов уровня Apple, Stripe, Linear и Framer.

Качество: современный UI/UX, плавные анимации, крупная типографика (clamp), градиенты, glassmorphism (полупрозрачные панели, blur), полностью responsive. Для imageUrl используй **реальные https URL** из блока IMAGE REFERENCES в user (результат image tool: OpenAI или детерминированные placeholder), либо нейтральные векторные композиции по теме — **не выдумывай** несуществующие домены.

Обязательная структура секций по порядку в массиве "sections":
1) hero — главный экран: headline, subheadline, ctaLabel, ctaSecondary (опц.), imageUrl (https)
2) features — сетка фич: title, items[{ title, description, imageUrl? }]
3) benefits — выгоды: title, items[{ title, description }] или lead + bullets
4) cta — призыв: headline, subheadline, buttonText
5) footer — подвал: brand, tagline, columns[{ title, links[{ label, href }] }], copyright

Также задай глобально в "styles": theme ("dark"|"light"), accentGradient (строка CSS linear-gradient).

В "animations" на уровне сайта можно задать preset: "subtle" | "bold" (строкой в record).

У каждого блока опционально поле "animation": { "type": "fade-in" | "slide-up" | "scale" | "parallax", "duration": number } — duration в секундах (или миллисекундах если значение > 10).

Формат ответа — ОДИН JSON-объект SiteSchema:
- Поля "pages" и "components": только [] либо массив объектов блоков (type, content, styles, animations). Не клади голые строки в эти массивы. Если нужны имена страниц для мультистраничности — используй type "page" и content вида { "name": "Главная", "sections": [] }. Для одностраничного лендинга можно "pages": [].

{
  "pages": [],
  "sections": [
    { "type": "hero", "content": { ... }, "styles": {}, "animations": {}, "animation": { "type": "slide-up", "duration": 0.7 } },
    { "type": "features", "content": { ... }, "styles": {}, "animations": {} },
    { "type": "benefits", "content": { ... }, "styles": {}, "animations": {} },
    { "type": "cta", "content": { ... }, "styles": {}, "animations": {} },
    { "type": "footer", "content": { ... }, "styles": {}, "animations": {} }
  ],
  "components": [],
  "styles": { "theme": "dark", "pageTitle": "Product", "accentGradient": "linear-gradient(135deg, #6366f1, #a855f7)" },
  "animations": { "preset": "subtle" },
  "images": []
}

Допустимые type у блока: hero | features | benefits | cta | footer | about | gallery | pricing | page (навигация/имя страницы) | text (простой текстовый блок из строки — лучше избегать, используй нормальные секции).

Правила вывода:
- Верни ТОЛЬКЕ сырой JSON. Ноль символов до или после.
- Запрещено: markdown, \`\`\`json, комментарии, пояснения, "Вот JSON".
- Все строки в JSON с валидным экранированием.
- imageUrl — только валидный https (из IMAGE REFERENCES / placehold.co / прямой URL провайдера).
- "images": [] — массив URL превью (можно пустой: клиент добавит детерминированные placehold.co по ключевым словам промпта).

Поведение chat-first: theme (dark/light), характер секций и визуала выводи из текста брифа пользователя. Не предполагай, что пользователь выберет стиль в отдельной форме.`;

/** Доп. системный текст для engineer после серверного авто-исправления схемы (см. normalizeLooseSiteSchemaInputDetailed). */
export const ENGINEER_SCHEMA_AUTOFIX_APPENDIX = `

[SCHEMA / КРИТИЧНО] Предыдущий ответ не прошёл строгую схему и был частично исправлен на сервере (например строки внутри pages/sections/components или content не-объект).
Выведи полностью валидный SiteSchema: каждый элемент массивов pages, sections, components — объект с полями type (строка), content (объект JSON), styles (объект), animations (объект).
Имена страниц — только как блоки type "page" с content { "name": string, "sections": [] }, либо пустой pages для одностраничника.
STRICTLY follow this schema — zero raw strings as array elements.`;
