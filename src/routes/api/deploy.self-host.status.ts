import { createFileRoute } from "@tanstack/react-router";

function hookOrigin(): string {
  const run = process.env.LOCAL_DEPLOY_HOOK_URL?.trim() || "http://127.0.0.1:3099/run";
  const base = run.replace(/\/run\/?$/, "");
  return base.length > 0 ? base : "http://127.0.0.1:3099";
}

export const Route = createFileRoute("/api/deploy/self-host/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.DEPLOY_HOOK_SECRET?.trim();
        if (!secret) {
          return Response.json(
            { error: "Server misconfigured: DEPLOY_HOOK_SECRET is not set" },
            { status: 503 },
          );
        }

        const u = new URL(request.url);
        const jobId = u.searchParams.get("jobId")?.trim() ?? "";
        if (!jobId) {
          return Response.json({ error: "jobId query required" }, { status: 400 });
        }

        const statusUrl = `${hookOrigin()}/status?jobId=${encodeURIComponent(jobId)}`;
        let res: Response;
        try {
          res = await fetch(statusUrl, {
            headers: { Authorization: `Bearer ${secret}` },
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json(
            { error: "deploy hook unreachable", message: msg },
            { status: 502 },
          );
        }

        const text = await res.text();
        if (!res.ok) {
          try {
            const j = JSON.parse(text) as Record<string, unknown>;
            return Response.json(j, { status: res.status });
          } catch {
            return Response.json(
              { error: "hook_error", message: text.slice(0, 800) },
              { status: res.status },
            );
          }
        }

        try {
          const body = JSON.parse(text) as {
            jobId?: string;
            status?: string;
            log?: string;
            exitCode?: number | null;
            signal?: string | null;
          };
          return Response.json({
            jobId: body.jobId ?? jobId,
            status: body.status ?? "unknown",
            log: body.log ?? "",
            exitCode: body.exitCode ?? null,
            signal: body.signal ?? null,
          });
        } catch {
          return Response.json({ error: "invalid hook response", raw: text.slice(0, 500) }, { status: 502 });
        }
      },
    },
  },
});
