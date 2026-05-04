import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { projectStoreCreate, projectStoreList } from "@/lib/project-store";
import { safeValidateSiteSchema } from "@/lib/site-schema";

const postSchema = z.object({
  prompt: z.string().min(1).max(100_000),
  siteSchema: z.unknown(),
  id: z.string().min(1).max(80).optional(),
});

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const projects = await projectStoreList();
          return Response.json({ projects });
        } catch (e) {
          console.error("[api/projects] GET", e);
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          let json: unknown;
          try {
            json = await request.json();
          } catch {
            return Response.json({ error: "Invalid JSON" }, { status: 400 });
          }
          const parsed = postSchema.safeParse(json);
          if (!parsed.success) {
            return Response.json(
              { error: "Validation failed", details: parsed.error.flatten() },
              { status: 400 },
            );
          }
          const v = safeValidateSiteSchema(parsed.data.siteSchema);
          if (!v.success) {
            return Response.json(
              { error: "Invalid siteSchema", details: v.error.flatten() },
              { status: 400 },
            );
          }
          const rec = await projectStoreCreate({
            prompt: parsed.data.prompt,
            siteSchema: v.data,
            id: parsed.data.id,
          });
          return Response.json(rec);
        } catch (e) {
          console.error("[api/projects] POST", e);
          return Response.json({ error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
