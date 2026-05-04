import { createFileRoute } from "@tanstack/react-router";

function hookRunUrl(): string {
  const u = process.env.LOCAL_DEPLOY_HOOK_URL?.trim();
  if (u) return u;
  return "http://127.0.0.1:3099/run";
}

export const Route = createFileRoute("/api/deploy/self-host")({
  server: {
    handlers: {
      POST: async () => {
        const secret = process.env.DEPLOY_HOOK_SECRET?.trim();
        if (!secret) {
          return Response.json(
            { success: false, error: "Server misconfigured: DEPLOY_HOOK_SECRET is not set" },
            { status: 503 },
          );
        }

        const url = hookRunUrl();
        console.log(`[self-host-deploy] proxy POST hook=${url}`);

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        };

        let res: Response;
        try {
          res = await fetch(url, { method: "POST", headers });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[self-host-deploy] hook fetch error", e);
          return Response.json(
            { success: false, message: "deploy hook unreachable", error: msg },
            { status: 502 },
          );
        }

        const text = await res.text();
        if (!res.ok) {
          console.error(`[self-host-deploy] hook HTTP ${res.status} ${text.slice(0, 400)}`);
          try {
            const j = JSON.parse(text) as { error?: string };
            return Response.json(
              {
                success: false,
                message: "deploy hook error",
                error: j.error ?? text.slice(0, 800),
              },
              { status: res.status >= 400 ? res.status : 502 },
            );
          } catch {
            return Response.json(
              {
                success: false,
                message: "deploy hook error",
                error: text.slice(0, 800),
              },
              { status: res.status },
            );
          }
        }

        try {
          const body = JSON.parse(text) as {
            success?: boolean;
            message?: string;
            jobId?: string;
          };
          if (body.success === true && body.jobId) {
            return Response.json({
              success: true,
              message: body.message ?? "deploy started",
              jobId: body.jobId,
            });
          }
          if (body.jobId) {
            return Response.json({
              success: body.success ?? true,
              message: body.message ?? "deploy started",
              jobId: body.jobId,
            });
          }
        } catch {
          /* fall through */
        }

        return Response.json(
          { success: false, message: "invalid hook response", error: text.slice(0, 500) },
          { status: 502 },
        );
      },
    },
  },
});
