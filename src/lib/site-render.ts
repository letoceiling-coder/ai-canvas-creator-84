import type { SiteBlock, SiteSchema } from "@/lib/site-schema";
import { safeParseJson } from "@/lib/json-extract";

function esc(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function pickContent(c: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = c[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return "";
}

function sectionTagOpen(block: SiteBlock, index: number): string {
  const delay = block.animations?.delay;
  const d = typeof delay === "string" || typeof delay === "number" ? Number(delay) : index * 80;
  const parts: string[] = [`--d:${d}ms`];
  for (const [k, v] of Object.entries(block.styles)) {
    if (typeof v === "string" && v.trim()) {
      const prop = k.replace(/([A-Z])/g, "-$1").toLowerCase();
      parts.push(`${prop}:${v}`);
    }
  }
  const styleAttr = ` style="${escAttr(parts.join(";"))}"`;
  const reveal = block.animation ? "" : " reveal";
  return `<section class="block ${block.type}${reveal}" data-i="${index}"${styleAttr}>`;
}

function galleryInner(c: Record<string, unknown>): string {
  const items = c.items ?? c.images ?? c.gallery;
  if (!Array.isArray(items) || !items.length) {
    const cap = pickContent(c, "caption", "description", "text");
    return cap ? `<p class="muted">${esc(cap)}</p>` : "";
  }
  return `<div class="gallery-grid">${items
    .map((it) => {
      if (typeof it === "object" && it !== null) {
        const o = it as Record<string, unknown>;
        const img = pickContent(o, "imageUrl", "image", "src");
        const t = pickContent(o, "title", "caption", "label", "name", "heading");
        const d = pickContent(o, "description", "alt");
        const figure = img
          ? `<div class="g-img"><img src="${escAttr(img)}" alt="${escAttr(t || "photo")}" loading="lazy"/></div>`
          : "";
        return `<div class="g-card glass">${figure}<div class="g-body"><strong>${esc(t || "—")}</strong>${d ? `<p class="muted">${esc(d)}</p>` : ""}</div></div>`;
      }
      return `<div class="g-card glass">${esc(String(it))}</div>`;
    })
    .join("")}</div>`;
}

function pricingInner(c: Record<string, unknown>): string {
  const plans = c.plans ?? c.tiers ?? c.items;
  if (!Array.isArray(plans) || !plans.length) return "";
  return `<div class="pricing-grid">${plans
    .map((p) => {
      if (typeof p !== "object" || p === null) return "";
      const o = p as Record<string, unknown>;
      const name = pickContent(o, "name", "title", "plan");
      const price = pickContent(o, "price", "cost");
      const desc = pickContent(o, "description", "text", "subtitle");
      return `<div class="plan-card glass"><h4>${esc(name || "План")}</h4><div class="price-tag">${esc(price || "—")}</div>${desc ? `<p class="muted">${esc(desc)}</p>` : ""}</div>`;
    })
    .join("")}</div>`;
}

function featuresInner(c: Record<string, unknown>): string {
  const items = c.items ?? c.features;
  if (!Array.isArray(items) || !items.length) {
    return `<p class="lead">${esc(pickContent(c, "description", "text", "lead"))}</p>`;
  }
  return `<div class="feat-grid">${items
    .map((it) => {
      if (typeof it !== "object" || it === null) return "";
      const o = it as Record<string, unknown>;
      const t = pickContent(o, "title", "name", "headline");
      const d = pickContent(o, "description", "text", "body");
      const img = pickContent(o, "imageUrl", "image", "src");
      const visual = img
        ? `<div class="feat-img"><img src="${escAttr(img)}" alt="" loading="lazy"/></div>`
        : `<div class="feat-icon" aria-hidden="true"></div>`;
      return `<article class="feat-card glass">${visual}<h3>${esc(t)}</h3><p class="muted">${esc(d)}</p></article>`;
    })
    .join("")}</div>`;
}

function benefitsInner(c: Record<string, unknown>): string {
  const items = c.items ?? c.bullets ?? c.points;
  const lead = pickContent(c, "lead", "description", "subtitle", "text");
  if (Array.isArray(items) && items.length) {
    return `<ul class="benefit-list">${items
      .map((it) => {
        if (typeof it === "object" && it !== null) {
          const o = it as Record<string, unknown>;
          const t = pickContent(o, "title", "label");
          const d = pickContent(o, "description", "text");
          return `<li class="glass"><span class="b-dot"></span><div><strong>${esc(t)}</strong><p class="muted">${esc(d)}</p></div></li>`;
        }
        return `<li class="glass"><span class="b-dot"></span><span>${esc(String(it))}</span></li>`;
      })
      .join("")}</ul>`;
  }
  return lead ? `<p class="lead">${esc(lead)}</p>` : "";
}

function headerInner(c: Record<string, unknown>): string {
  const brand = pickContent(c, "brand", "name", "logo", "title") || "Brand";
  const cta = pickContent(c, "ctaLabel", "buttonText", "cta", "primaryCta");
  const navRaw = c.nav ?? c.links ?? c.menu;
  const navItems = Array.isArray(navRaw)
    ? navRaw
        .map((it) => {
          if (typeof it === "string") return { label: it, href: "#" };
          if (typeof it === "object" && it !== null) {
            const o = it as Record<string, unknown>;
            return {
              label: pickContent(o, "label", "text", "name", "title") || "—",
              href: pickContent(o, "href", "url", "link") || "#",
            };
          }
          return null;
        })
        .filter((x): x is { label: string; href: string } => x !== null)
    : [];
  const nav = navItems.length
    ? `<nav class="hdr-nav">${navItems
        .map((i) => `<a href="${escAttr(i.href)}">${esc(i.label)}</a>`)
        .join("")}</nav>`
    : "";
  const ctaBtn = cta ? `<a class="btn-primary btn-sm" href="#">${esc(cta)}</a>` : "";
  return `<div class="wrap hdr-wrap"><div class="hdr-row"><a class="hdr-brand" href="#"><span class="hdr-mark"></span><strong>${esc(brand)}</strong></a>${nav}<div class="hdr-cta">${ctaBtn}</div></div></div>`;
}

function testimonialsInner(c: Record<string, unknown>): string {
  const items = c.items ?? c.testimonials ?? c.quotes ?? c.reviews;
  if (!Array.isArray(items) || !items.length) return "";
  return `<div class="testi-grid">${items
    .map((it) => {
      if (typeof it !== "object" || it === null) return "";
      const o = it as Record<string, unknown>;
      const quote = pickContent(o, "quote", "text", "review", "feedback", "body");
      const author = pickContent(o, "author", "name", "from");
      const role = pickContent(o, "role", "position", "company", "title");
      const avatar = pickContent(o, "avatarUrl", "avatar", "imageUrl", "photo");
      const initials = (author || "•").trim().slice(0, 1).toUpperCase();
      const avatarBlock = avatar
        ? `<div class="testi-avatar"><img src="${escAttr(avatar)}" alt="${escAttr(author)}" loading="lazy"/></div>`
        : `<div class="testi-avatar testi-avatar-fallback">${esc(initials)}</div>`;
      return `<article class="testi-card glass"><p class="testi-quote">${esc(quote)}</p><footer class="testi-foot">${avatarBlock}<div><strong>${esc(author)}</strong>${role ? `<span class="muted">${esc(role)}</span>` : ""}</div></footer></article>`;
    })
    .join("")}</div>`;
}

function statsInner(c: Record<string, unknown>): string {
  const items = c.items ?? c.stats ?? c.metrics ?? c.numbers;
  if (!Array.isArray(items) || !items.length) return "";
  return `<div class="stats-grid">${items
    .map((it) => {
      if (typeof it !== "object" || it === null) return "";
      const o = it as Record<string, unknown>;
      const value = pickContent(o, "value", "number", "metric", "kpi");
      const label = pickContent(o, "label", "title", "description", "name");
      return `<div class="stat-card"><div class="stat-value">${esc(value)}</div><div class="stat-label muted">${esc(label)}</div></div>`;
    })
    .join("")}</div>`;
}

function processInner(c: Record<string, unknown>): string {
  const items = c.items ?? c.steps ?? c.stages ?? c.process;
  if (!Array.isArray(items) || !items.length) return "";
  return `<ol class="process-list">${items
    .map((it, i) => {
      const num = String(i + 1).padStart(2, "0");
      if (typeof it === "string") {
        return `<li class="process-step glass"><span class="process-num">${num}</span><div><strong>${esc(it)}</strong></div></li>`;
      }
      if (typeof it !== "object" || it === null) return "";
      const o = it as Record<string, unknown>;
      const t = pickContent(o, "title", "name", "label", "step");
      const d = pickContent(o, "description", "text", "body");
      return `<li class="process-step glass"><span class="process-num">${num}</span><div><strong>${esc(t)}</strong>${d ? `<p class="muted">${esc(d)}</p>` : ""}</div></li>`;
    })
    .join("")}</ol>`;
}

function faqInner(c: Record<string, unknown>): string {
  const items = c.items ?? c.faq ?? c.questions ?? c.qas;
  if (!Array.isArray(items) || !items.length) return "";
  return `<div class="faq-list">${items
    .map((it) => {
      if (typeof it !== "object" || it === null) return "";
      const o = it as Record<string, unknown>;
      const q = pickContent(o, "question", "q", "title");
      const a = pickContent(o, "answer", "a", "description", "text", "body");
      return `<details class="faq-item glass"><summary>${esc(q)}</summary><p class="muted">${esc(a)}</p></details>`;
    })
    .join("")}</div>`;
}

function contactsInner(c: Record<string, unknown>): string {
  const phone = pickContent(c, "phone", "tel");
  const email = pickContent(c, "email", "mail");
  const address = pickContent(c, "address", "location", "city");
  const hours = pickContent(c, "hours", "schedule", "workingHours");
  const items: { icon: string; label: string; value: string; href?: string }[] = [];
  if (phone)
    items.push({ icon: "☎", label: "Телефон", value: phone, href: `tel:${phone.replace(/\s/g, "")}` });
  if (email) items.push({ icon: "✉", label: "Email", value: email, href: `mailto:${email}` });
  if (address) items.push({ icon: "◎", label: "Адрес", value: address });
  if (hours) items.push({ icon: "◷", label: "Часы работы", value: hours });
  if (!items.length) return "";
  return `<div class="contacts-grid">${items
    .map(
      (i) =>
        `<div class="contact-card glass"><span class="contact-icon" aria-hidden="true">${i.icon}</span><div><span class="muted">${esc(i.label)}</span>${i.href ? `<a href="${escAttr(i.href)}"><strong>${esc(i.value)}</strong></a>` : `<strong>${esc(i.value)}</strong>`}</div></div>`,
    )
    .join("")}</div>`;
}

function ctaInner(c: Record<string, unknown>): string {
  const btn = pickContent(c, "buttonText", "ctaLabel", "primaryCta", "label");
  const sec = pickContent(c, "secondaryLabel", "ctaSecondary");
  return `<div class="cta-row">
    ${btn ? `<a class="btn-primary" href="#">${esc(btn)}</a>` : ""}
    ${sec ? `<a class="btn-ghost" href="#">${esc(sec)}</a>` : ""}
  </div>`;
}

function footerInner(c: Record<string, unknown>): string {
  const brand = pickContent(c, "brand", "title", "name");
  const tag = pickContent(c, "tagline", "subtitle");
  const copy = pickContent(c, "copyright", "rights");
  const columns = c.columns;
  let colsHtml = "";
  if (Array.isArray(columns)) {
    colsHtml = `<div class="foot-cols">${columns
      .map((col) => {
        if (typeof col !== "object" || col === null) return "";
        const o = col as Record<string, unknown>;
        const colTitle = pickContent(o, "title", "heading");
        const links = o.links;
        const linksHtml =
          Array.isArray(links) && links.length
            ? `<ul>${links
                .map((lnk) => {
                  if (typeof lnk !== "object" || lnk === null) return "";
                  const L = lnk as Record<string, unknown>;
                  const lab = pickContent(L, "label", "text", "name");
                  const href = pickContent(L, "href", "url") || "#";
                  return `<li><a href="${escAttr(href)}">${esc(lab)}</a></li>`;
                })
                .join("")}</ul>`
            : "";
        return `<div class="foot-col"><h5>${esc(colTitle)}</h5>${linksHtml}</div>`;
      })
      .join("")}</div>`;
  }
  return `<div class="foot-top">
    <div class="foot-brand"><strong>${esc(brand || "Brand")}</strong><p class="muted">${esc(tag)}</p></div>
    ${colsHtml}
  </div>
  <div class="foot-bottom"><span class="muted">${esc(copy || "© " + String(new Date().getFullYear()))}</span></div>`;
}

/** Внутренняя разметка блока (без обёртки section). */
export function siteBlockInnerHtml(block: SiteBlock, index: number): string {
  const c = block.content;
  const title = pickContent(c, "title", "headline", "heading", "name");
  const body = pickContent(c, "subheadline", "subtitle", "description", "text", "body", "content");

  switch (block.type) {
    case "header":
      return headerInner(c);
    case "testimonials":
      return `<div class="wrap"><p class="eyebrow">Отзывы</p><h2>${esc(title || "Что говорят клиенты")}</h2>${body ? `<p class="section-lead">${esc(body)}</p>` : ""}${testimonialsInner(c)}</div>`;
    case "stats":
      return `<div class="wrap"><p class="eyebrow">${esc(pickContent(c, "eyebrow") || "В цифрах")}</p>${title ? `<h2>${esc(title)}</h2>` : ""}${body ? `<p class="section-lead">${esc(body)}</p>` : ""}${statsInner(c)}</div>`;
    case "process":
      return `<div class="wrap"><p class="eyebrow">Процесс</p><h2>${esc(title || "Как мы работаем")}</h2>${body ? `<p class="section-lead">${esc(body)}</p>` : ""}${processInner(c)}</div>`;
    case "faq":
      return `<div class="wrap"><p class="eyebrow">FAQ</p><h2>${esc(title || "Частые вопросы")}</h2>${body ? `<p class="section-lead">${esc(body)}</p>` : ""}${faqInner(c)}</div>`;
    case "contacts":
      return `<div class="wrap"><p class="eyebrow">Контакты</p><h2>${esc(title || "Свяжитесь с нами")}</h2>${body ? `<p class="section-lead">${esc(body)}</p>` : ""}${contactsInner(c)}</div>`;
    case "hero": {
      const img = pickContent(c, "imageUrl", "image", "backgroundImage", "src");
      const cta = pickContent(c, "ctaLabel", "buttonText", "primaryCta");
      const cta2 = pickContent(c, "ctaSecondary", "secondaryCta");
      const bg = img
        ? `<div class="hero-bg"><img src="${escAttr(img)}" alt="" loading="eager"/></div><div class="hero-gradient"></div>`
        : `<div class="hero-gradient solo"></div>`;
      const ctas = `<div class="hero-cta">${cta ? `<a class="btn-primary" href="#">${esc(cta)}</a>` : ""}${cta2 ? `<a class="btn-ghost light" href="#">${esc(cta2)}</a>` : ""}</div>`;
      return `<div class="hero-inner glass hero-card">${bg}<div class="hero-copy"><span class="eyebrow">New</span><h1>${esc(title || "Build faster")}</h1><p class="hero-lead">${esc(body)}</p>${ctas}</div></div>`;
    }
    case "features":
      return `<div class="wrap"><p class="eyebrow">Features</p><h2>${esc(title || "Everything you need")}</h2>${body ? `<p class="section-lead">${esc(body)}</p>` : ""}${featuresInner(c)}</div>`;
    case "benefits":
      return `<div class="wrap"><p class="eyebrow">Benefits</p><h2>${esc(title || "Why us")}</h2>${body ? `<p class="section-lead">${esc(body)}</p>` : ""}${benefitsInner(c)}</div>`;
    case "cta":
      return `<div class="wrap"><div class="cta-panel glass"><h2>${esc(title || "Ready to start?")}</h2><p class="section-lead">${esc(body)}</p>${ctaInner(c)}</div></div>`;
    case "footer":
      return `<div class="wrap foot-wrap">${footerInner(c)}</div>`;
    case "about":
      return `<div class="wrap"><h2>${esc(title || "About")}</h2><p class="section-lead">${esc(body)}</p></div>`;
    case "gallery":
      return `<div class="wrap"><h2>${esc(title || "Gallery")}</h2>${galleryInner(c)}</div>`;
    case "pricing":
      return `<div class="wrap"><h2>${esc(title || "Pricing")}</h2>${body ? `<p class="section-lead">${esc(body)}</p>` : ""}${pricingInner(c)}</div>`;
    case "page": {
      const name = pickContent(c, "name", "title", "label", "slug");
      const nSec = Array.isArray(c.sections) ? c.sections.length : 0;
      return `<div class="wrap"><p class="eyebrow">Страница</p><h2>${esc(name || "Page")}</h2><p class="muted">Навигация мультистраничного сайта${nSec ? ` · вложенных секций: ${nSec}` : ""}.</p></div>`;
    }
    case "text": {
      const t = pickContent(c, "text", "body", "content") || body;
      return `<div class="wrap"><p class="section-lead">${esc(t)}</p></div>`;
    }
  }
}

function blockToHtml(block: SiteBlock, index: number): string {
  const open = sectionTagOpen(block, index);
  return `${open}${siteBlockInnerHtml(block, index)}</section>`;
}

export function mergeSiteBlocks(site: SiteSchema): SiteBlock[] {
  return [...site.pages, ...site.sections, ...site.components];
}

/** Подставляет URL из `site.images`, если у hero / features / gallery нет своих картинок. */
export function applySiteImageFallbacks(site: SiteSchema): SiteSchema {
  const pool = site.images.filter((u) => typeof u === "string" && u.length > 0);
  if (!pool.length) return site;
  let idx = 0;
  const next = () => pool[idx++ % pool.length]!;

  const mapBlock = (b: SiteBlock): SiteBlock => {
    const c = { ...b.content } as Record<string, unknown>;

    if (b.type === "hero" && !pickContent(c, "imageUrl", "image", "backgroundImage", "src")) {
      c.imageUrl = next();
    }

    if ((b.type === "features" || b.type === "gallery") && Array.isArray(c.items)) {
      c.items = c.items.map((it) => {
        if (typeof it !== "object" || it === null) return it;
        const o = { ...(it as Record<string, unknown>) };
        if (!pickContent(o, "imageUrl", "image", "src")) {
          o.imageUrl = next();
        }
        return o;
      });
    }

    return { ...b, content: c };
  };

  return {
    ...site,
    pages: site.pages.map(mapBlock),
    sections: site.sections.map(mapBlock),
    components: site.components.map(mapBlock),
  };
}

function cssVariables(site: SiteSchema): string {
  const st = site.styles as Record<string, unknown>;
  const isDark = pickContent(st, "theme") !== "light";
  const accent =
    pickContent(st, "accentGradient") ||
    "linear-gradient(135deg, #6366f1 0%, #a855f7 45%, #ec4899 100%)";
  if (isDark) {
    return `:root{--bg0:#030306;--bg1:#0a0a0f;--text:#fafafa;--muted:#a1a1aa;--line:rgba(255,255,255,.08);--accent:${accent};--glass-bg:rgba(255,255,255,.05);--glass-brd:rgba(255,255,255,.1);}`;
  }
  return `:root{--bg0:#f8fafc;--bg1:#ffffff;--text:#0f172a;--muted:#64748b;--line:rgba(15,23,42,.08);--accent:${accent};--glass-bg:rgba(255,255,255,.72);--glass-brd:rgba(15,23,42,.08);}`;
}

function presetMotion(site: SiteSchema): string {
  const a = site.animations as Record<string, unknown>;
  const p = pickContent(a, "preset");
  return p === "bold" ? "motion-bold" : "motion-subtle";
}

/** Стили разметки сайта под превью с Framer Motion (@scope, без глобального body). */
export function sitePreviewStyles(site: SiteSchema): string {
  const vars = cssVariables(site);
  const scopeProps =
    "display:block;position:relative;isolation:isolate;z-index:1;min-height:100%;overflow:hidden;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;line-height:1.6;background:radial-gradient(120% 80% at 80% -10%,rgba(99,102,241,.25),transparent 55%),radial-gradient(90% 60% at 10% 100%,rgba(236,72,153,.12),transparent 50%),var(--bg0);color:var(--text);-webkit-font-smoothing:antialiased;scroll-behavior:smooth";
  const inner = `
    .page{max-width:1200px;margin:0 auto;padding:0 24px 96px;position:relative;z-index:1;isolation:isolate}
    .wrap{max-width:1080px;margin:0 auto;width:100%}
    .glass{background:var(--glass-bg);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--glass-brd);box-shadow:0 24px 80px rgba(0,0,0,.35)}
    .block{padding:clamp(72px,11vw,128px) 0;position:relative;z-index:1}
    .block + .block{margin-top:0}
    .eyebrow{font-size:.75rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-bottom:14px;display:inline-block}
    h1,h2,h3,h4,h5,h6{color:var(--text);text-wrap:balance}
    h1{font-size:clamp(2.5rem,5.4vw,4.25rem);font-weight:700;letter-spacing:-.045em;line-height:1.05;margin-bottom:24px}
    h2{font-size:clamp(1.875rem,3.6vw,3rem);font-weight:650;letter-spacing:-.035em;line-height:1.12;margin-bottom:20px}
    h3{font-size:1.25rem;font-weight:600;margin-bottom:10px;letter-spacing:-.02em;line-height:1.3}
    h4{font-size:1.05rem;font-weight:600;line-height:1.35}
    h5{font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:14px}
    p{line-height:1.6;color:inherit}
    .section-lead,.lead{font-size:clamp(1.05rem,1.8vw,1.2rem);color:var(--muted);max-width:60ch;margin-bottom:36px;line-height:1.6}
    .muted{color:var(--muted);font-size:.95rem;line-height:1.55}
    a{color:inherit}

    /* HEADER */
    .header{padding:0;position:sticky;top:0;z-index:30;background:rgba(3,3,6,.65);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid var(--line)}
    .hdr-wrap{padding:14px 24px}
    .hdr-row{display:flex;align-items:center;justify-content:space-between;gap:24px;width:100%}
    .hdr-brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none;color:var(--text);font-size:1rem}
    .hdr-mark{width:24px;height:24px;border-radius:8px;background:var(--accent);box-shadow:0 6px 24px rgba(99,102,241,.45)}
    .hdr-nav{display:flex;gap:24px;flex-wrap:wrap}
    .hdr-nav a{color:var(--muted);text-decoration:none;font-size:.92rem;font-weight:500;transition:color .2s}
    .hdr-nav a:hover{color:var(--text)}
    .hdr-cta{display:flex;align-items:center}
    .btn-sm{padding:9px 18px;font-size:.85rem}

    /* HERO */
    .hero{position:relative;padding-top:clamp(48px,10vh,96px)}
    .hero-inner{position:relative;border-radius:32px;overflow:hidden;min-height:clamp(440px,68vh,680px);display:flex;align-items:flex-end;isolation:isolate}
    .hero-bg{position:absolute;inset:0;z-index:0}
    .hero-bg img{width:100%;height:100%;object-fit:cover;transform:scale(1.02)}
    .hero-gradient,.hero-gradient.solo{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(180deg,transparent 0%,rgba(3,3,6,.4) 40%,rgba(3,3,6,.85) 100%)}
    .hero-gradient.solo{background:linear-gradient(135deg,rgba(99,102,241,.45) 0%,rgba(168,85,247,.3) 35%,rgba(3,3,6,.95) 100%)}
    .hero-copy{position:relative;z-index:2;padding:clamp(32px,5vw,64px);max-width:760px}
    .hero-copy h1{color:#fff;text-shadow:0 2px 24px rgba(0,0,0,.4)}
    .hero-lead{font-size:clamp(1.1rem,1.8vw,1.3rem);color:rgba(255,255,255,.78);max-width:50ch;margin-bottom:32px;line-height:1.55}
    .hero-cta{display:flex;flex-wrap:wrap;gap:14px}

    /* BUTTONS */
    .btn-primary{display:inline-flex;align-items:center;justify-content:center;padding:14px 28px;border-radius:999px;font-weight:600;font-size:.95rem;color:#fff;background:var(--accent);text-decoration:none;transition:transform .2s,box-shadow .2s;box-shadow:0 12px 40px rgba(99,102,241,.4);white-space:nowrap}
    .btn-primary:hover{transform:translateY(-2px);box-shadow:0 16px 50px rgba(99,102,241,.55)}
    .btn-ghost{display:inline-flex;align-items:center;padding:14px 24px;border-radius:999px;font-weight:600;font-size:.95rem;color:var(--text);border:1px solid var(--line);text-decoration:none;transition:background .2s,border-color .2s;white-space:nowrap}
    .btn-ghost:hover{background:var(--glass-bg);border-color:rgba(255,255,255,.18)}
    .btn-ghost.light{border-color:rgba(255,255,255,.25);color:#fff}
    .btn-ghost.light:hover{background:rgba(255,255,255,.08)}

    /* FEATURES */
    .feat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;margin-top:8px}
    .feat-card{border-radius:1.5rem;padding:32px;display:flex;flex-direction:column;gap:4px;transition:transform .25s,border-color .25s}
    .feat-card:hover{transform:translateY(-4px);border-color:rgba(99,102,241,.35)}
    .feat-img{border-radius:16px;overflow:hidden;margin-bottom:20px;aspect-ratio:16/10;background:rgba(255,255,255,.03)}
    .feat-img img{width:100%;height:100%;object-fit:cover}
    .feat-icon{width:48px;height:48px;border-radius:14px;background:var(--accent);opacity:.9;margin-bottom:18px;box-shadow:0 8px 24px rgba(99,102,241,.35)}

    /* BENEFITS */
    .benefit-list{list-style:none;display:grid;gap:16px;margin-top:12px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
    .benefit-list li{display:flex;gap:18px;align-items:flex-start;padding:24px 26px;border-radius:20px}
    .benefit-list li strong{display:block;margin-bottom:4px;font-size:1.02rem}
    .b-dot{flex-shrink:0;width:10px;height:10px;margin-top:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 16px rgba(99,102,241,.6)}

    /* TESTIMONIALS */
    .testi-grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-top:8px}
    .testi-card{border-radius:1.25rem;padding:28px;display:flex;flex-direction:column;gap:20px}
    .testi-quote{font-size:1.05rem;line-height:1.6;color:var(--text);font-weight:450}
    .testi-quote::before{content:"\\201C";font-size:2.5rem;line-height:0;display:block;margin-bottom:16px;color:var(--muted);opacity:.6;font-family:Georgia,serif}
    .testi-foot{display:flex;gap:14px;align-items:center;margin-top:auto}
    .testi-avatar{width:44px;height:44px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:1.05rem}
    .testi-avatar img{width:100%;height:100%;object-fit:cover}
    .testi-foot strong{display:block;font-size:.95rem}
    .testi-foot .muted{font-size:.85rem;display:block;margin-top:2px}

    /* STATS */
    .stats-grid{display:grid;gap:32px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-top:24px;padding:48px;border-radius:24px;background:var(--glass-bg);border:1px solid var(--glass-brd)}
    .stat-card{text-align:center;display:flex;flex-direction:column;gap:8px}
    .stat-value{font-size:clamp(2.25rem,4vw,3.25rem);font-weight:700;letter-spacing:-.04em;line-height:1;background:var(--accent);-webkit-background-clip:text;background-clip:text;color:transparent}
    .stat-label{font-size:.92rem;line-height:1.4;max-width:24ch;margin:0 auto}

    /* PROCESS */
    .process-list{list-style:none;display:grid;gap:16px;margin-top:8px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
    .process-step{display:flex;gap:20px;align-items:flex-start;padding:26px;border-radius:20px}
    .process-num{flex-shrink:0;font-size:1.6rem;font-weight:700;letter-spacing:-.03em;background:var(--accent);-webkit-background-clip:text;background-clip:text;color:transparent;min-width:48px}
    .process-step strong{display:block;margin-bottom:6px;font-size:1.05rem}

    /* FAQ */
    .faq-list{display:flex;flex-direction:column;gap:12px;margin-top:8px}
    .faq-item{border-radius:16px;padding:0 24px;overflow:hidden}
    .faq-item summary{padding:20px 0;cursor:pointer;font-weight:600;font-size:1rem;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px}
    .faq-item summary::after{content:"+";font-size:1.4rem;color:var(--muted);transition:transform .2s}
    .faq-item[open] summary::after{transform:rotate(45deg)}
    .faq-item p{padding:0 0 20px;line-height:1.6}

    /* CONTACTS */
    .contacts-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-top:8px}
    .contact-card{display:flex;gap:16px;align-items:center;padding:22px;border-radius:18px}
    .contact-icon{width:44px;height:44px;border-radius:12px;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.2rem;flex-shrink:0;opacity:.9}
    .contact-card .muted{font-size:.78rem;display:block;margin-bottom:2px;text-transform:uppercase;letter-spacing:.08em}
    .contact-card strong{font-size:1rem;line-height:1.3;display:block}
    .contact-card a{text-decoration:none;color:inherit}
    .contact-card a:hover strong{color:#a5b4fc}

    /* CTA */
    .cta-panel{border-radius:32px;padding:clamp(48px,6vw,80px);text-align:center;background:linear-gradient(135deg,rgba(99,102,241,.12),rgba(168,85,247,.08)),var(--glass-bg);border:1px solid var(--glass-brd)}
    .cta-panel h2{margin-bottom:14px}
    .cta-panel .section-lead{margin-left:auto;margin-right:auto}
    .cta-row{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-top:32px}

    /* GALLERY */
    .gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px;margin-top:24px}
    .g-card{border-radius:18px;overflow:hidden}
    .g-img{aspect-ratio:4/3}
    .g-img img{width:100%;height:100%;object-fit:cover}
    .g-body{padding:18px}

    /* PRICING */
    .pricing-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-top:24px}
    .plan-card{border-radius:24px;padding:32px}
    .price-tag{font-size:2.25rem;font-weight:700;letter-spacing:-.03em;margin:14px 0;background:var(--accent);-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1}

    /* FOOTER */
    .footer{padding-bottom:48px}
    .foot-wrap{padding-top:64px}
    .foot-top{display:grid;gap:48px;grid-template-columns:1fr;border-top:1px solid var(--line);padding-top:56px}
    @media(min-width:768px){.foot-top{grid-template-columns:1.2fr 2.5fr}}
    .foot-brand p{margin-top:8px;max-width:30ch}
    .foot-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:32px}
    .foot-col h5{margin-bottom:16px}
    .foot-col ul{list-style:none}
    .foot-col a{color:var(--muted);text-decoration:none;font-size:.9rem;line-height:1.5;transition:color .2s}
    .foot-col a:hover{color:var(--text)}
    .foot-col li+li{margin-top:12px}
    .foot-bottom{padding:32px 0 0;margin-top:48px;border-top:1px solid var(--line);font-size:.85rem;display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px}

    /* ABOUT / TEXT */
    .about,.text{padding:clamp(64px,9vw,112px) 0}

    /* MOBILE */
    @media(max-width:640px){
      .hero-inner{min-height:420px}
      .feat-grid,.benefit-list,.testi-grid,.stats-grid,.process-list,.contacts-grid,.pricing-grid{grid-template-columns:1fr}
      .stats-grid{padding:32px}
      .hdr-nav{display:none}
    }
  `;
  return `${vars}
  @scope (.site-motion-preview) {
    :scope { ${scopeProps} }
    * { box-sizing:border-box;margin:0;padding:0; }
    ${inner}
  }
  `.replace(/\s+/g, " ");
}

/**
 * Достаёт JSON из ответа модели (сырой JSON, fenced ```json, текст вокруг).
 * Делегирует общему `safeParseJson` — НЕ кидает SyntaxError при «грязном» JSON.
 * Если совсем не удалось распарсить — кидает один типизированный `Error("invalid_json")`,
 * чтобы вызывающий код мог поймать в существующих try/catch (например, `tryParseSiteSchema`).
 */
export function parseAiSiteJson(raw: string): unknown {
  const r = safeParseJson(raw);
  if (r.ok) return r.data;
  throw new Error("invalid_json");
}

export function siteExportStylesheet(site: SiteSchema): string {
  const vars = cssVariables(site);

  return `
  ${vars}
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;line-height:1.5;background:radial-gradient(120% 80% at 80% -10%,rgba(99,102,241,.25),transparent 55%),radial-gradient(90% 60% at 10% 100%,rgba(236,72,153,.12),transparent 50%),var(--bg0);color:var(--text);-webkit-font-smoothing:antialiased}
  .page{max-width:1200px;margin:0 auto;padding:0 24px 96px}
  .wrap{max-width:1080px;margin:0 auto}
  .glass{background:var(--glass-bg);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--glass-brd);box-shadow:0 24px 80px rgba(0,0,0,.35)}
  .motion-subtle .reveal{animation:fadeUp .85s cubic-bezier(.16,1,.3,1) both;animation-delay:var(--d,.08s)}
  .motion-bold .reveal{animation:fadeUpBig 1s cubic-bezier(.16,1,.3,1) both;animation-delay:var(--d,.08s)}
  @keyframes fadeUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
  @keyframes fadeUpBig{from{opacity:0;transform:translateY(48px) scale(.98)}to{opacity:1;transform:none}}
  .block{padding:clamp(56px,12vw,120px) 0}
  .eyebrow{font-size:.75rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
  h1{font-size:clamp(2.75rem,6vw,4.5rem);font-weight:700;letter-spacing:-.045em;line-height:1.02;margin-bottom:20px}
  h2{font-size:clamp(2rem,4vw,3.25rem);font-weight:650;letter-spacing:-.035em;line-height:1.08;margin-bottom:16px}
  h3{font-size:1.2rem;font-weight:600;margin-bottom:8px;letter-spacing:-.02em}
  h4{font-size:1.05rem;font-weight:600}
  h5{font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:12px}
  .section-lead,.lead{font-size:clamp(1.05rem,2vw,1.25rem);color:var(--muted);max-width:52ch;margin-bottom:32px}
  .muted{color:var(--muted);font-size:.95rem}
  .hero{position:relative;padding-top:clamp(48px,10vh,96px)}
  .hero-inner{position:relative;border-radius:28px;overflow:hidden;min-height:clamp(420px,65vh,640px);display:flex;align-items:flex-end}
  .hero-bg{position:absolute;inset:0}
  .hero-bg img{width:100%;height:100%;object-fit:cover;transform:scale(1.02)}
  .hero-gradient,.hero-gradient.solo{position:absolute;inset:0;background:linear-gradient(180deg,transparent 0%,rgba(3,3,6,.75) 50%,var(--bg0) 100%)}
  .hero-gradient.solo{background:linear-gradient(145deg,rgba(99,102,241,.35),rgba(3,3,6,.9))}
  .hero-copy{position:relative;z-index:2;padding:clamp(28px,5vw,56px);max-width:720px}
  .hero-lead{font-size:clamp(1.1rem,2.2vw,1.35rem);color:var(--muted);max-width:46ch;margin-bottom:28px}
  .hero-cta{display:flex;flex-wrap:wrap;gap:12px}
  .btn-primary{display:inline-flex;align-items:center;justify-content:center;padding:14px 26px;border-radius:999px;font-weight:600;font-size:.95rem;color:#fff;background:var(--accent);text-decoration:none;transition:transform .2s,box-shadow .2s;box-shadow:0 12px 40px rgba(99,102,241,.4)}
  .btn-primary:hover{transform:translateY(-2px)}
  .btn-ghost{display:inline-flex;align-items:center;padding:14px 22px;border-radius:999px;font-weight:600;font-size:.95rem;color:var(--text);border:1px solid var(--line);text-decoration:none;transition:background .2s}
  .btn-ghost:hover{background:var(--glass-bg)}
  .btn-ghost.light{border-color:rgba(255,255,255,.2);color:#fff}
  .feat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-top:8px}
  .feat-card{border-radius:1.25rem;padding:24px}
  .feat-img{border-radius:14px;overflow:hidden;margin-bottom:16px;aspect-ratio:16/10}
  .feat-img img{width:100%;height:100%;object-fit:cover}
  .feat-icon{width:40px;height:40px;border-radius:12px;background:var(--accent);opacity:.85;margin-bottom:14px}
  .benefit-list{list-style:none;display:grid;gap:14px;margin-top:8px}
  .benefit-list li{display:flex;gap:16px;align-items:flex-start;padding:20px 22px;border-radius:18px}
  .b-dot{flex-shrink:0;width:8px;height:8px;margin-top:8px;border-radius:50%;background:var(--accent)}
  .cta-panel{border-radius:28px;padding:clamp(40px,6vw,72px);text-align:center}
  .cta-panel h2{margin-bottom:12px}
  .cta-panel .section-lead{margin-left:auto;margin-right:auto}
  .cta-row{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:28px}
  .gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-top:24px}
  .g-card{border-radius:16px;overflow:hidden}
  .g-img{aspect-ratio:4/3}
  .g-img img{width:100%;height:100%;object-fit:cover}
  .g-body{padding:16px}
  .pricing-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px;margin-top:24px}
  .plan-card{border-radius:20px;padding:28px}
  .price-tag{font-size:2rem;font-weight:700;letter-spacing:-.03em;margin:12px 0;background:var(--accent);-webkit-background-clip:text;background-clip:text;color:transparent}
  .foot-wrap{padding-top:48px}
  .foot-top{display:grid;gap:40px;grid-template-columns:1.2fr 2fr;border-top:1px solid var(--line);padding-top:48px}
  @media(min-width:768px){.foot-top{grid-template-columns:1fr 2fr}}
  .foot-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:32px}
  .foot-col ul{list-style:none}
  .foot-col a{color:var(--muted);text-decoration:none;font-size:.9rem}
  .foot-col a:hover{color:var(--text)}
  .foot-col li+li{margin-top:10px}
  .foot-bottom{padding:32px 0 0;margin-top:40px;border-top:1px solid var(--line);font-size:.85rem}
  .footer{padding-bottom:32px}
  @media(max-width:640px){.hero-inner{min-height:380px}.feat-grid{grid-template-columns:1fr}}
  `.replace(/\s+/g, " ");
}

export function siteExportSectionsMarkup(site: SiteSchema): string {
  const hydrated = applySiteImageFallbacks(site);
  const blocks = mergeSiteBlocks(hydrated);
  return blocks.map((b, i) => blockToHtml(b, i)).join("\n");
}

export function siteExportDocumentTitle(site: SiteSchema): string {
  return esc(pickContent(site.styles as Record<string, unknown>, "pageTitle") || "Site");
}

export function siteExportBodyClass(site: SiteSchema): string {
  return presetMotion(site);
}

/** Полный HTML-документ со встроенным CSS (для превью «Открыть» и обратной совместимости). */
export function siteSchemaToHtml(site: SiteSchema): string {
  const baseCss = siteExportStylesheet(site);
  const bodyInner = siteExportSectionsMarkup(site);
  const title = siteExportDocumentTitle(site);
  const motion = siteExportBodyClass(site);

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title><style>${baseCss}</style></head><body class="${motion}"><div class="page">${bodyInner}</div></body></html>`;
}
