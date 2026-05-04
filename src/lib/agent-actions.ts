/**
 * Действия «агента» — чистые хелперы и обёртки над API/pipeline.
 * Вызов из UI чата (или с будущим tool-calling) без переписывания orchestrator.
 */

import type { StyleDNA } from "@/lib/orchestrator";
import type { SiteBlock, SiteSchema } from "@/lib/site-schema";
import type { InstantAction } from "@/lib/intent-router";
import type { ProjectMemory } from "@/lib/orchestrator";
import { siteExportDocumentTitle } from "@/lib/site-render";
import { exportReactProject } from "@/lib/export-site";
import { inferStyleDNAFromUserIntent } from "@/lib/infer-style-dna";

export function setStyleDNAFromUserText(text: string): StyleDNA {
  return inferStyleDNAFromUserIntent(text);
}

export function buildChatPipelinePrompt(thread: string[], siteSnapshot?: SiteSchema | null): string {
  const lines = thread.map((t, i) => `${i + 1}. ${t}`).join("\n");
  if (!siteSnapshot) {
    return `Диалог с заказчиком (все сообщения — единый бриф):\n${lines}`;
  }
  const json = JSON.stringify(siteSnapshot);
  const cap = 14_000;
  const clipped = json.length > cap ? `${json.slice(0, cap)}\n… [обрезано]` : json;
  return `Диалог с заказчиком:\n${lines}\n\n---\nУже есть SiteSchema (JSON). Учти новые сообщения как правки к этому сайту (пересобери или адаптируй целиком, сохраняя качество):\n${clipped}`;
}

export function reorderSectionsByTypes(site: SiteSchema, typesInOrder: string[]): SiteSchema {
  const pool = [...site.sections];
  const head: SiteSchema["sections"] = [];
  for (const want of typesInOrder) {
    const idx = pool.findIndex((s) => s.type === want);
    if (idx >= 0) {
      const [one] = pool.splice(idx, 1);
      if (one) head.push(one);
    }
  }
  return { ...site, sections: [...head, ...pool] };
}

export const reorderSections = reorderSectionsByTypes;

export function removeSectionAt(site: SiteSchema, index: number): SiteSchema {
  if (index < 0 || index >= site.sections.length) return site;
  return { ...site, sections: site.sections.filter((_, i) => i !== index) };
}

/** Поднять секцию с типом `sectionType` в начало (визуальный «акцент»). */
export function enableSection(site: SiteSchema, sectionType: string): SiteSchema {
  if (!site.sections.some((s) => s.type === sectionType)) return site;
  return reorderSectionsByTypes(site, [
    sectionType,
    ...site.sections.map((s) => s.type).filter((t) => t !== sectionType),
  ]);
}

/** Удалить первую секцию с типом `sectionType`. */
export function disableSection(site: SiteSchema, sectionType: string): SiteSchema {
  const idx = site.sections.findIndex((s) => s.type === sectionType);
  if (idx < 0) return site;
  return removeSectionAt(site, idx);
}

function featContent(c: SiteBlock["content"]): Record<string, unknown> {
  return typeof c === "object" && c !== null ? (c as Record<string, unknown>) : {};
}

function hasReviewsHeuristic(site: SiteSchema): boolean {
  return site.sections.some((s) => {
    if (s.type !== "features") return false;
    const c = featContent(s.content);
    const title = String(c.title ?? c.headline ?? c.heading ?? "").toLowerCase();
    if (/(отзыв|review|testimonial)/i.test(title)) return true;
    const raw = c.items ?? c.features;
    if (!Array.isArray(raw)) return false;
    return raw.some((it) => {
      if (typeof it !== "object" || it === null) return false;
      const o = it as Record<string, unknown>;
      const t = String(o.title ?? o.name ?? "").toLowerCase();
      const d = String(o.description ?? o.text ?? "").toLowerCase();
      return /(отзыв|review|testimonial|★|⭐)/i.test(`${t} ${d}`);
    });
  });
}

function insertBlockBeforeFooter(sections: SiteBlock[], block: SiteBlock): SiteBlock[] {
  const ft = sections.findIndex((s) => s.type === "footer");
  if (ft >= 0) {
    const next = [...sections];
    next.splice(ft, 0, block);
    return next;
  }
  return [...sections, block];
}

function createReviewsSectionBlock(): SiteBlock {
  return {
    type: "features",
    content: {
      title: "Отзывы клиентов",
      subheadline: "Короткие мнения тех, кто уже с вами работал",
      items: [
        { title: "Мария К.", description: "«Быстро, понятно и без лишней суеты.»" },
        { title: "Алексей П.", description: "«Результат совпал с ожиданиями — рекомендую.»" },
        { title: "Елена С.", description: "«Удобно сопровождали на каждом шаге.»" },
      ],
    },
    styles: {},
    animations: {},
  };
}

function createPricingSectionBlock(): SiteBlock {
  return {
    type: "pricing",
    content: {
      title: "Тарифы",
      description: "Выберите план под ваши задачи",
      plans: [
        { name: "Старт", price: "Бесплатно", description: "Базовые возможности" },
        { name: "Про", price: "от 990 ₽/мес", description: "Для растущих команд" },
        { name: "Бизнес", price: "По запросу", description: "Индивидуальные условия" },
      ],
    },
    styles: {},
    animations: {},
  };
}

/** Мгновенные правки SiteSchema без runPipeline (см. intent-router). */
export function applyInstantSiteAction(
  site: SiteSchema,
  action: InstantAction,
): { site: SiteSchema; summary: string } {
  const styles = { ...(site.styles as Record<string, unknown>) };

  switch (action.type) {
    case "style_theme": {
      const theme = action.theme;
      styles.theme = theme;
      const cur = styles.accentGradient;
      const hasAccent = typeof cur === "string" && cur.trim().length > 0;
      if (!hasAccent) {
        styles.accentGradient =
          theme === "dark"
            ? "linear-gradient(135deg, #6366f1, #a855f7)"
            : "linear-gradient(135deg, #0ea5e9, #6366f1)";
      }
      return {
        site: { ...site, styles },
        summary: theme === "dark" ? "Тема превью: тёмная." : "Тема превью: светлая.",
      };
    }
    case "style_accent_premium": {
      styles.accentGradient =
        "linear-gradient(135deg, #8b5cf6 0%, #d946ef 50%, #6366f1 100%)";
      return {
        site: { ...site, styles },
        summary: "Обновил акцент на более выразительный градиент.",
      };
    }
    case "bring_section_forward": {
      const next = enableSection(site, action.sectionType);
      if (next === site) {
        return { site, summary: `Секции «${action.sectionType}» на странице не нашёл — порядок без изменений.` };
      }
      return {
        site: next,
        summary: `Секцию «${action.sectionType}» поднял выше.`,
      };
    }
    case "remove_section": {
      const before = site.sections.length;
      const next = disableSection(site, action.sectionType);
      if (next.sections.length === before) {
        return { site, summary: `Секцию «${action.sectionType}» не нашёл.` };
      }
      return { site: next, summary: `Убрал секцию типа «${action.sectionType}».` };
    }
    case "add_section": {
      if (action.variant === "reviews") {
        if (hasReviewsHeuristic(site)) {
          return { site, summary: "Блок отзывов уже выглядит присутствующим — дубликат не добавлял." };
        }
        const block = createReviewsSectionBlock();
        return {
          site: { ...site, sections: insertBlockBeforeFooter(site.sections, block) },
          summary: "Добавил секцию отзывов.",
        };
      }
      if (action.variant === "pricing") {
        if (site.sections.some((s) => s.type === "pricing")) {
          return { site, summary: "Секция тарифов уже есть." };
        }
        const block = createPricingSectionBlock();
        return {
          site: { ...site, sections: insertBlockBeforeFooter(site.sections, block) },
          summary: "Добавил секцию тарифов.",
        };
      }
      return { site, summary: "Такой блок пока лучше добавить через полную генерацию." };
    }
  }
}

export async function deploySiteVercel(
  site: SiteSchema,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const files = exportReactProject(site);
  const projectName = siteExportDocumentTitle(site).slice(0, 64).trim() || "ai-site";
  const res = await fetch("/api/deploy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files, projectName }),
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
  if (!data.url) return { ok: false, error: "Нет url" };
  return { ok: true, url: data.url };
}

export async function saveProjectApi(site: SiteSchema, prompt: string): Promise<{ id: string } | { error: string }> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, siteSchema: site }),
  });
  const data = (await res.json()) as { id?: string; error?: string };
  if (!res.ok) return { error: data.error ?? `HTTP ${res.status}` };
  if (!data.id) return { error: "Нет id" };
  return { id: data.id };
}

export async function loadProjectApi(
  id: string,
): Promise<{ siteSchema: SiteSchema; prompt: string } | { error: string }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(id)}`);
  const data = (await res.json()) as { siteSchema?: SiteSchema; prompt?: string; error?: string };
  if (!res.ok) return { error: data.error ?? `HTTP ${res.status}` };
  if (!data.siteSchema) return { error: "нет siteSchema" };
  return { siteSchema: data.siteSchema, prompt: data.prompt ?? "" };
}

export async function agentRegenerateSection(params: {
  memory: ProjectMemory;
  sectionId: string;
}): Promise<ProjectMemory> {
  const { regenerateSection: run } = await import("@/lib/orchestrator");
  return run({
    memory: params.memory,
    sectionId: params.sectionId,
    config: { enableHITL: false },
  });
}

export const regenerateSection = agentRegenerateSection;
export const deploySite = deploySiteVercel;
export const saveProject = saveProjectApi;
export const loadProject = loadProjectApi;
