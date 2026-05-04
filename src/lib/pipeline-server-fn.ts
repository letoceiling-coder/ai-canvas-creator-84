/**
 * Запуск полного пайплайна только на сервере (createServerFn).
 * Клиентский бандл не должен импортировать @/lib/orchestrator — иначе getOllamaToken()
 * выполняется в браузере без process.env / .dev.vars.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runPipeline } from "@/lib/orchestrator";
import type { PipelineConfig, ProjectMemory, StyleDNA } from "@/lib/orchestrator";
import { generateFallbackSiteSchema } from "@/lib/fallback-site";
import { createDecisionEntry } from "@/lib/decision-log";
import { createSessionMetrics, finalizeSessionMetrics } from "@/lib/session-metrics";

const styleDNASchema = z.object({
  vibe: z.string(),
  density: z.string(),
  motion: z.string(),
  contrast: z.string(),
});

const inputSchema = z.object({
  prompt: z.string().min(1).max(500_000),
  config: z.object({
    enableHITL: z.boolean(),
    designIterations: z.number().int().min(1).max(10),
    qualityThreshold: z.number().min(0).max(100),
  }),
  initialStyleDNA: styleDNASchema.optional(),
});

export type ServerRunPipelineResult =
  | { ok: true; memory: ProjectMemory }
  | { ok: false; error: string };

export const serverRunPipeline = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<ServerRunPipelineResult> => {
    try {
      const memory = await runPipeline({
        prompt: data.prompt,
        config: data.config as Partial<PipelineConfig>,
        initialStyleDNA: data.initialStyleDNA as StyleDNA | undefined,
        disableLlmTokenStream: true,
        // Интерактивный HITL в UI недоступен при вызове с сервера — сработает defaultHitlAction в orchestrator.
      });
      return { ok: true, memory };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const site = generateFallbackSiteSchema(data.prompt);
      const raw = JSON.stringify(site);
      const sm = createSessionMetrics();
      sm.errors.push(msg);
      sm.success = false;
      finalizeSessionMetrics(sm);
      const memory: ProjectMemory = {
        sessionId: crypto.randomUUID(),
        userIntent: data.prompt,
        decisionLog: [createDecisionEntry("pipeline", "emergency_fallback", msg.slice(0, 500))],
        sessionGenerationEpoch: 0,
        sessionMetrics: sm,
        siteSchema: site,
        rawSiteJson: raw,
        code: { files: [{ path: "site.json", content: raw }] },
        schemaAutoFixed: true,
      };
      return { ok: true, memory };
    }
  });
