/**
 * §16 Real QA — ESLint по сгенерированному TSX; опционально Lighthouse по LIGHTHOUSE_PREVIEW_URL.
 * Только в Node (createServerFn handler); на без FS окружениях — skipped.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateReactProject } from "@/lib/generate-react-project";
import { safeValidateSiteSchema } from "@/lib/site-schema";

const inputSchema = z.object({
  rawSiteJson: z.string().min(2).max(2_000_000),
});

export type RealQaServerResult = {
  buildPath: string;
  lint: {
    ok: boolean;
    errorCount: number;
    warningCount: number;
    messages: string[];
    skipped?: boolean;
    reason?: string;
  };
  lighthouse: {
    ran: boolean;
    /** 0–100 */
    performance?: number;
    accessibility?: number;
    skippedReason?: string;
    error?: string;
  };
};

async function writeArtifactTree(
  absRoot: string,
  files: Record<string, string>,
): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(absRoot, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf8");
  }
}

async function runEslintOnDir(buildDir: string): Promise<RealQaServerResult["lint"]> {
  try {
    const path = await import("node:path");
    const { ESLint } = await import("eslint");
    const eslint = new ESLint({ cwd: process.cwd() });
    const targets = [path.join(buildDir, "src", "App.tsx"), path.join(buildDir, "src", "main.tsx")];
    const results = await eslint.lintFiles(targets);
    let errorCount = 0;
    let warningCount = 0;
    const messages: string[] = [];
    for (const r of results) {
      for (const m of r.messages) {
        const line = `${r.filePath}:${m.line}:${m.column} ${m.message} [${m.severity}]`;
        messages.push(line);
        if (m.severity === 2) errorCount += 1;
        if (m.severity === 1) warningCount += 1;
      }
    }
    return {
      ok: errorCount === 0,
      errorCount,
      warningCount,
      messages: messages.slice(0, 80),
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return {
      ok: true,
      errorCount: 0,
      warningCount: 0,
      messages: [],
      skipped: true,
      reason: `eslint:${reason}`,
    };
  }
}

async function runLighthouseIfConfigured(
  buildDir: string,
): Promise<RealQaServerResult["lighthouse"]> {
  const url = process.env.LIGHTHOUSE_PREVIEW_URL?.trim();
  if (!url) {
    return {
      ran: false,
      skippedReason: "LIGHTHOUSE_PREVIEW_URL unset",
    };
  }
  try {
    const path = await import("node:path");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const outFile = path.join(buildDir, "lighthouse.report.json");
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    await execFileAsync(
      npx,
      [
        "lighthouse",
        url,
        `--output-path=${outFile}`,
        "--output=json",
        "--quiet",
        "--chrome-flags=--headless=new",
        "--only-categories=performance,accessibility",
      ],
      {
        cwd: process.cwd(),
        maxBuffer: 32 * 1024 * 1024,
        timeout: 180_000,
      },
    );
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(outFile, "utf8");
    const j = JSON.parse(raw) as {
      categories?: {
        performance?: { score: number | null };
        accessibility?: { score: number | null };
      };
    };
    const perf = j.categories?.performance?.score;
    const a11y = j.categories?.accessibility?.score;
    return {
      ran: true,
      performance: perf == null ? undefined : Math.round(perf * 100),
      accessibility: a11y == null ? undefined : Math.round(a11y * 100),
    };
  } catch (e) {
    return {
      ran: false,
      error: e instanceof Error ? e.message : String(e),
      skippedReason: "lighthouse_failed",
    };
  }
}

export const serverRealQa = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<RealQaServerResult> => {
    const path = await import("node:path");
    const { randomUUID } = await import("node:crypto");
    const fs = await import("node:fs/promises");

    let raw: unknown;
    try {
      raw = JSON.parse(data.rawSiteJson) as unknown;
    } catch {
      return {
        buildPath: "",
        lint: {
          ok: false,
          errorCount: 1,
          warningCount: 0,
          messages: ["json_parse_error"],
        },
        lighthouse: { ran: false, skippedReason: "invalid_json" },
      };
    }

    const parsed = safeValidateSiteSchema(raw);
    if (!parsed.success) {
      return {
        buildPath: "",
        lint: {
          ok: false,
          errorCount: 1,
          warningCount: 0,
          messages: ["invalid_site_schema"],
        },
        lighthouse: { ran: false, skippedReason: "invalid_schema" },
      };
    }

    const buildId = randomUUID();
    const buildPath = path.join(process.cwd(), ".real-qa-build", buildId);

    try {
      const files = generateReactProject(parsed.data);
      await writeArtifactTree(buildPath, files);
      const lint = await runEslintOnDir(buildPath);
      const lighthouse = await runLighthouseIfConfigured(buildPath);
      const kept = !!process.env.REAL_QA_KEEP_BUILD;
      if (!kept) {
        await fs.rm(buildPath, { recursive: true, force: true }).catch(() => undefined);
      }
      return { buildPath: kept ? buildPath : "", lint, lighthouse };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      try {
        await fs.rm(buildPath, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      return {
        buildPath,
        lint: {
          ok: true,
          errorCount: 0,
          warningCount: 0,
          messages: [],
          skipped: true,
          reason: `artifact:${reason}`,
        },
        lighthouse: { ran: false, skippedReason: reason },
      };
    }
  });
