import type { StyleDNA } from "@/lib/orchestrator";

/** Эвристика из текста запроса (без изменений orchestrator). */
export function inferStyleDNAFromUserIntent(text: string): StyleDNA {
  const lower = text.toLowerCase();
  let vibe: StyleDNA["vibe"] = "premium";
  if (/минимал|minimal|clean|лаконич|строг/i.test(text)) vibe = "minimal";
  if (/смел|ярк|bold|агрессив|контрастн/i.test(text)) vibe = "bold";

  let contrast: StyleDNA["contrast"] = "medium";
  if (/тёмн|темн|dark|black|ночн/i.test(text)) contrast = "high";
  if (/светл|light|white|белоснеж|дневн/i.test(text)) contrast = "low";

  let motion: StyleDNA["motion"] = "subtle";
  if (/анимац|динамич|expressive|плавн|motion/i.test(text)) motion = "expressive";

  let density: StyleDNA["density"] = "comfortable";
  if (/плотн|информ|много блок|всё на одной/i.test(text)) density = "dense";
  if (/лендинг|landing|одна стран|single page/i.test(lower)) density = "balanced";

  return { vibe, density, motion, contrast };
}
