/**
 * §7 Минимальная валидация designSystem после Architect (до Engineer).
 * Эвристики по unknown JSON от LLM — без жёсткой схемы.
 */

export type DesignSystemValidationSlice = {
  ok: boolean;
  issues: string[];
};

export type DesignSystemValidation = {
  contrast: DesignSystemValidationSlice;
  spacing: DesignSystemValidationSlice;
  typography: DesignSystemValidationSlice;
  hasErrors: boolean;
  allIssues: string[];
};

const HEX_RE = /#([0-9a-f]{3}|[0-9a-f]{6})\b/gi;

function parseHexRgb(hex: string): [number, number, number] | null {
  let h = hex.replace("#", "").trim().toLowerCase();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6) return null;
  const n = Number.parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const l1 = luminance(a) + 0.05;
  const l2 = luminance(b) + 0.05;
  return l1 > l2 ? l1 / l2 : l2 / l1;
}

function collectHexFromValue(v: unknown, out: Set<string>, depth = 0): void {
  if (depth > 8) return;
  if (v == null) return;
  if (typeof v === "string") {
    let m: RegExpExecArray | null;
    const s = v;
    const re = new RegExp(HEX_RE.source, HEX_RE.flags);
    while ((m = re.exec(s)) != null) {
      const body = m[1];
      const full = body.length === 3 ? expandShortHex(body) : body;
      out.add(`#${full}`);
    }
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) collectHexFromValue(x, out, depth + 1);
    return;
  }
  if (typeof v === "object") {
    for (const x of Object.values(v as Record<string, unknown>)) {
      collectHexFromValue(x, out, depth + 1);
    }
  }
}

function expandShortHex(h3: string): string {
  return h3
    .split("")
    .map((c) => c + c)
    .join("");
}

function checkContrast(ds: unknown): DesignSystemValidationSlice {
  const issues: string[] = [];
  const set = new Set<string>();
  collectHexFromValue(ds, set);
  const colors = [...set]
    .map((h) => parseHexRgb(h))
    .filter((x): x is [number, number, number] => x != null);

  if (colors.length >= 2) {
    let worst = Infinity;
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const r = contrastRatio(colors[i], colors[j]);
        if (r < worst) worst = r;
      }
    }
    if (worst < 3) {
      issues.push(`contrast: минимальный контраст среди пар цветов ${worst.toFixed(2)}:1 (нужно ≥ 3:1 для крупного текста)`);
    }
    if (worst < 4.5 && worst >= 3) {
      issues.push(`contrast: ${worst.toFixed(2)}:1 — для основного текста желательно ≥ 4.5:1`);
    }
  }

  return { ok: issues.length === 0, issues };
}

function checkSpacing(ds: unknown): DesignSystemValidationSlice {
  const issues: string[] = [];
  if (ds == null || typeof ds !== "object") {
    return { ok: true, issues: [] };
  }
  const root = ds as Record<string, unknown>;
  const sp =
    root.spacing ??
    root.space ??
    root.spacingScale ??
    (root.designTokens as Record<string, unknown> | undefined)?.spacing;

  if (sp == null) {
    issues.push("spacing: нет шкалы (spacing | space | spacingScale)");
  } else if (Array.isArray(sp)) {
    const nums = sp.filter((x) => typeof x === "number") as number[];
    if (nums.some((n) => n <= 0)) {
      issues.push("spacing: в масштабе есть неположительные значения");
    }
    if (nums.length < 2) {
      issues.push("spacing: слишком мало ступеней в масштабе");
    }
  } else if (typeof sp === "object" && sp !== null) {
    const vals = Object.values(sp as Record<string, unknown>).filter((x) => typeof x === "number") as number[];
    if (vals.length === 0) {
      issues.push("spacing: объект spacing не содержит числовых ступеней");
    }
    if (vals.some((n) => n <= 0)) {
      issues.push("spacing: неположительные значения в шкале");
    }
  } else {
    issues.push("spacing: неподдерживаемый формат (ожидался object | array)");
  }

  return { ok: issues.length === 0, issues };
}

function checkTypography(ds: unknown): DesignSystemValidationSlice {
  const issues: string[] = [];
  if (ds == null || typeof ds !== "object") {
    return { ok: true, issues: [] };
  }
  const root = ds as Record<string, unknown>;
  const ty =
    root.typography ??
    root.type ??
    root.fonts ??
    (root.designTokens as Record<string, unknown> | undefined)?.typography;

  if (ty == null) {
    issues.push("typography: нет блока typography / type / fonts");
  } else if (typeof ty === "object" && ty !== null) {
    const o = ty as Record<string, unknown>;
    const hasFamily =
      typeof o.fontFamily === "string" ||
      typeof o.font === "string" ||
      (Array.isArray(o.fonts) && o.fonts.length > 0);
    if (!hasFamily) {
      issues.push("typography: не найден fontFamily / font / fonts[]");
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Валидация designSystem из Architect. Любой блок с issues → hasErrors.
 */
export function validateDesignSystem(designSystem: unknown): DesignSystemValidation {
  const contrast = checkContrast(designSystem);
  const spacing = checkSpacing(designSystem);
  const typography = checkTypography(designSystem);
  const allIssues = [...contrast.issues, ...spacing.issues, ...typography.issues];
  const hasErrors = allIssues.length > 0;
  return {
    contrast,
    spacing,
    typography,
    hasErrors,
    allIssues,
  };
}
