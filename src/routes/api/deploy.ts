import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { deployReactProjectToVercel } from "@/lib/deploy-vercel-server";

const MAX_TOTAL_CHARS = 2_800_000;
const MAX_FILES = 100;

const deployBodySchema = z
  .object({
    files: z.record(z.string(), z.string()),
    projectName: z.string().min(1).max(64).optional(),
  })
  .superRefine((val, ctx) => {
    const keys = Object.keys(val.files);
    if (keys.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "files must not be empty" });
    }
    if (keys.length > MAX_FILES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `at most ${MAX_FILES} file entries allowed`,
      });
    }
    let total = 0;
    for (const k of keys) {
      if (k.includes("..")) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `invalid path: ${k}` });
        return;
      }
      total += val.files[k].length;
      if (val.files[k].length > 1_500_000) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `file too large: ${k}` });
        return;
      }
    }
    if (total > MAX_TOTAL_CHARS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "total payload too large" });
    }
  });

export const Route = createFileRoute("/api/deploy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.VERCEL_TOKEN?.trim();
        if (!token) {
          return Response.json(
            { error: "Server misconfigured: VERCEL_TOKEN is not set" },
            { status: 503 },
          );
        }

        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const parsed = deployBodySchema.safeParse(json);
        if (!parsed.success) {
          return Response.json(
            { error: "Validation failed", details: parsed.error.flatten() },
            { status: 400 },
          );
        }

        const result = await deployReactProjectToVercel({
          token,
          files: parsed.data.files,
          projectName: parsed.data.projectName,
        });

        if (!result.ok) {
          return Response.json({ error: result.error }, { status: 502 });
        }

        return Response.json({ url: result.url });
      },
    },
  },
});
