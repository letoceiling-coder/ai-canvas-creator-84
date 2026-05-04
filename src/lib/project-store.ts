/**
 * Файловое хранилище проектов (JSON на диск). Только для Node / server handlers.
 * Каталог: PROJECT_STORE_DIR или <cwd>/data/projects
 */
import type { SiteSchema } from "@/lib/site-schema";

export type StoredProject = {
  id: string;
  siteSchema: SiteSchema;
  prompt: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredProjectSummary = Pick<StoredProject, "id" | "prompt" | "createdAt" | "updatedAt">;

async function getFsPath(): Promise<{ fs: typeof import("node:fs/promises"); path: typeof import("node:path") }> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  return { fs, path };
}

function storeDir(pathMod: typeof import("node:path")): string {
  const fromEnv = process.env.PROJECT_STORE_DIR?.trim();
  if (fromEnv) return fromEnv;
  return pathMod.join(process.cwd(), "data", "projects");
}

async function ensureDir(dir: string, fs: typeof import("node:fs/promises")): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function filePath(dir: string, id: string, pathMod: typeof import("node:path")): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
  if (safe !== id) throw new Error("invalid project id");
  return pathMod.join(dir, `${safe}.json`);
}

export async function projectStoreList(): Promise<StoredProjectSummary[]> {
  const { fs, path } = await getFsPath();
  const dir = storeDir(path);
  await ensureDir(dir, fs);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: StoredProjectSummary[] = [];
  for (const n of names) {
    if (!n.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, n), "utf8");
      const j = JSON.parse(raw) as StoredProject;
      out.push({
        id: j.id,
        prompt: j.prompt,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
      });
    } catch {
      /* skip corrupt */
    }
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return out;
}

export async function projectStoreGet(id: string): Promise<StoredProject | null> {
  const { fs, path } = await getFsPath();
  const dir = storeDir(path);
  const fp = filePath(dir, id, path);
  try {
    const raw = await fs.readFile(fp, "utf8");
    return JSON.parse(raw) as StoredProject;
  } catch {
    return null;
  }
}

export async function projectStoreCreate(input: {
  siteSchema: SiteSchema;
  prompt: string;
  id?: string;
}): Promise<StoredProject> {
  const { fs, path } = await getFsPath();
  const dir = storeDir(path);
  await ensureDir(dir, fs);
  const id = input.id?.trim() || crypto.randomUUID();
  if (id.replace(/[^a-zA-Z0-9_-]/g, "") !== id) throw new Error("invalid project id");
  const now = new Date().toISOString();
  const rec: StoredProject = {
    id,
    siteSchema: input.siteSchema,
    prompt: input.prompt,
    createdAt: now,
    updatedAt: now,
  };
  await fs.writeFile(filePath(dir, id, path), JSON.stringify(rec, null, 2), "utf8");
  return rec;
}

export async function projectStoreUpdate(
  id: string,
  patch: Partial<Pick<StoredProject, "siteSchema" | "prompt">>,
): Promise<StoredProject | null> {
  const cur = await projectStoreGet(id);
  if (!cur) return null;
  const { fs, path } = await getFsPath();
  const dir = storeDir(path);
  const next: StoredProject = {
    ...cur,
    ...(patch.siteSchema != null ? { siteSchema: patch.siteSchema } : {}),
    ...(patch.prompt != null ? { prompt: patch.prompt } : {}),
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(filePath(dir, id, path), JSON.stringify(next, null, 2), "utf8");
  return next;
}
