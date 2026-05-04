import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { projectStoreGet, projectStoreUpdate } from "@/lib/project-store";
import { safeValidateSiteSchema } from "@/lib/site-schema";

const putSchema = z.object({
  prompt: z.string().min(1).max(100_000).optional(),
  siteSchema: z.unknown().optional(),
});

export const Route = createFileRoute("/api/projects/$projectId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const p = await projectStoreGet(params.projectId);
          if (!p) return Response.json({ error: "not_found" }, { status: 404 });
          return Response.json(p);
        } catch (e) {
          console.error("[api/projects/:id] GET", e);
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
      PUT: async ({ params, request }) => {
        try {
          let json: unknown;
          try {
            json = await request.json();
          } catch {
            return Response.json({ error: "Invalid JSON" }, { status: 400 });
          }
          const parsed = putSchema.safeParse(json);
          if (!parsed.success) {
            return Response.json(
              { error: "Validation failed", details: parsed.error.flatten() },
              { status: 400 },
            );
          }
          const patch: { prompt?: string; siteSchema?: import("@/lib/site-schema").SiteSchema } =
            {};
          if (parsed.data.prompt != null) patch.prompt = parsed.data.prompt;
          if (parsed.data.siteSchema !== undefined) {
            const v = safeValidateSiteSchema(parsed.data.siteSchema);
            if (!v.success) {
              return Response.json(
                { error: "Invalid siteSchema", details: v.error.flatten() },
                { status: 400 },
              );
            }
            patch.siteSchema = v.data;
          }
          if (Object.keys(patch).length === 0) {
            return Response.json({ error: "empty patch" }, { status: 400 });
          }
          const next = await projectStoreUpdate(params.projectId, patch);
          if (!next) return Response.json({ error: "not_found" }, { status: 404 });
          return Response.json(next);
        } catch (e) {
          console.error("[api/projects/:id] PUT", e);
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
