/**
 * Деплой на Vercel через HTTPS API (`/v13/deployments`), без CLI и без `child_process`.
 * Превью-сервер (Worker + unenv) не реализует spawn/execFile — REST совместим с этим рантаймом.
 */

import { Buffer } from "node:buffer";

const VERCEL_DEPLOYMENTS_URL = "https://api.vercel.com/v13/deployments";

function slugProjectName(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "ai-site";
}

function normalizeDeploymentUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  return t.startsWith("http://") || t.startsWith("https://") ? t : `https://${t}`;
}

export async function deployReactProjectToVercel(params: {
  token: string;
  files: Record<string, string>;
  projectName?: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { token, files, projectName = "ai-site" } = params;
  const slug = slugProjectName(projectName);

  const fileList: { file: string; data: string; encoding: string }[] = [];
  for (const [rel, content] of Object.entries(files)) {
    const normalized = rel.replace(/^[/\\]+/, "").replace(/\\/g, "/");
    if (!normalized || normalized.includes("..")) {
      return { ok: false, error: `Invalid path: ${rel}` };
    }
    fileList.push({
      file: normalized,
      data: Buffer.from(content, "utf8").toString("base64"),
      encoding: "base64",
    });
  }

  const endpoint = new URL(VERCEL_DEPLOYMENTS_URL);
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  if (teamId) endpoint.searchParams.set("teamId", teamId);
  /** Иначе Vercel требует `projectSettings` для новых проектов. */
  endpoint.searchParams.set("skipAutoDetectionConfirmation", "1");

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: slug,
        files: fileList,
        target: "production",
      }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.slice(0, 2500) };
  }

  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* не JSON */
  }

  if (!res.ok) {
    const errField = parsed.error;
    const fromNested =
      errField &&
      typeof errField === "object" &&
      "message" in errField && typeof (errField as { message: unknown }).message === "string"
        ? (errField as { message: string }).message
        : null;
    const errMsg =
      fromNested ??
      (typeof parsed.message === "string" ? parsed.message : text);
    return { ok: false, error: String(errMsg).slice(0, 2500) };
  }

  const urlRaw = parsed.url;
  if (typeof urlRaw === "string" && urlRaw.length > 0) {
    return { ok: true, url: normalizeDeploymentUrl(urlRaw) };
  }

  return {
    ok: false,
    error: `Не удалось извлечь url из ответа Vercel: ${text.slice(0, 2000)}`,
  };
}
