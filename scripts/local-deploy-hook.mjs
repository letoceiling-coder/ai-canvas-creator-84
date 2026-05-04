/**
 * Локальный hook: spawn deploy.sh (реальный Node, не worker).
 * POST /run — старт деплоя, ответ с jobId.
 * GET /status?jobId= — статус и хвост лога.
 * Авторизация: Authorization: Bearer DEPLOY_HOOK_SECRET (обязательно).
 */
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import { join } from "node:path";

const PORT = Number(process.env.LOCAL_DEPLOY_HOOK_PORT || 3099);
const ROOT =
  process.env.SELF_HOST_DEPLOY_ROOT?.trim() || "/var/www/botme.siteaacess.store";
const SECRET_RAW = process.env.DEPLOY_HOOK_SECRET;
const SECRET = typeof SECRET_RAW === "string" ? SECRET_RAW.trim() : "";
const DEPLOY_MAX_MS = 35 * 60 * 1000;
const LOG_TAIL_LINES = 120;

/** @type {Map<string, { status: string, exitCode: number | null, signal: string | null, startedAt: number, finishedAt?: number, logAbs: string }>} */
const jobs = new Map();

const JOB_ID_RE = /^deploy_\d+_[a-f0-9]+$/;

function requireAuth(req, res) {
  if (!SECRET) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "hook misconfigured: set DEPLOY_HOOK_SECRET in .env",
      }),
    );
    return false;
  }
  const auth = req.headers.authorization?.trim();
  if (auth !== `Bearer ${SECRET}`) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return false;
  }
  return true;
}

async function tailLog(absPath, maxLines) {
  try {
    const text = await readFile(absPath, "utf8");
    const lines = text.split("\n");
    return lines.slice(-maxLines).join("\n");
  } catch {
    return "";
  }
}

async function handleStatus(res, jobId) {
  if (!JOB_ID_RE.test(jobId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid jobId" }));
    return;
  }

  let entry = jobs.get(jobId);
  const logAbsDefault = join(ROOT, "logs", "deploy-jobs", `${jobId}.log`);

  if (!entry) {
    try {
      const metaPath = join(ROOT, "logs", "deploy-jobs", `${jobId}.meta.json`);
      const raw = await readFile(metaPath, "utf8");
      const meta = JSON.parse(raw);
      entry = {
        status: meta.status ?? "unknown",
        exitCode: meta.exitCode ?? null,
        signal: meta.signal ?? null,
        startedAt: meta.startedAt ?? 0,
        finishedAt: meta.finishedAt,
        logAbs: meta.logAbs ?? logAbsDefault,
      };
    } catch {
      const logSnippet = await tailLog(logAbsDefault, 20);
      if (logSnippet) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jobId,
            status: "unknown",
            log: logSnippet,
            message: "hook restarted or job state lost; log may be stale",
          }),
        );
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "job_not_found" }));
      return;
    }
  }

  const log = await tailLog(entry.logAbs, LOG_TAIL_LINES);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      jobId,
      status: entry.status,
      exitCode: entry.exitCode,
      signal: entry.signal,
      log,
    }),
  );
}

function handleRun(res) {
  const jobId = `deploy_${Date.now()}_${randomBytes(6).toString("hex")}`;
  const logDir = join(ROOT, "logs", "deploy-jobs");
  const logAbs = join(logDir, `${jobId}.log`);
  const metaAbs = join(logDir, `${jobId}.meta.json`);

  void mkdir(logDir, { recursive: true }).then(() => {
    jobs.set(jobId, {
      status: "running",
      exitCode: null,
      signal: null,
      startedAt: Date.now(),
      logAbs,
    });

    console.log(`[local-deploy-hook] start jobId=${jobId} log=${logAbs}`);

    const child = spawn("bash", ["./deploy.sh"], {
      cwd: ROOT,
      env: { ...process.env, DEPLOY_JOB_LOG: logAbs },
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const tag = `[local-deploy-hook ${jobId}]`;
    const killTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        console.error(`${tag} timeout SIGTERM`);
        child.kill("SIGTERM");
      }
    }, DEPLOY_MAX_MS);

    child.stdout?.on("data", (c) => process.stdout.write(`${tag} ${c}`));
    child.stderr?.on("data", (c) => process.stderr.write(`${tag} ${c}`));

    const finish = async (code, signal) => {
      clearTimeout(killTimer);
      const status = code === 0 ? "success" : "failed";
      const prev = jobs.get(jobId) ?? { logAbs, startedAt: Date.now() };
      jobs.set(jobId, {
        ...prev,
        status,
        exitCode: code,
        signal: signal ?? null,
        finishedAt: Date.now(),
        logAbs,
      });
      try {
        await writeFile(
          metaAbs,
          JSON.stringify({
            jobId,
            status,
            exitCode: code,
            signal: signal ?? null,
            startedAt: prev.startedAt,
            finishedAt: Date.now(),
            logAbs,
          }),
          "utf8",
        );
      } catch (e) {
        console.error(`${tag} meta write`, e);
      }
      console.log(`${tag} finished code=${code} signal=${signal ?? "none"}`);
    };

    child.on("close", (code, signal) => {
      void finish(code, signal);
    });

    child.on("error", async (err) => {
      clearTimeout(killTimer);
      console.error(`${tag} spawn error`, err);
      jobs.set(jobId, {
        status: "failed",
        exitCode: null,
        signal: null,
        startedAt: jobs.get(jobId)?.startedAt ?? Date.now(),
        finishedAt: Date.now(),
        logAbs,
      });
      try {
        await writeFile(
          metaAbs,
          JSON.stringify({
            jobId,
            status: "failed",
            error: String(err.message),
            finishedAt: Date.now(),
            logAbs,
          }),
          "utf8",
        );
      } catch (e) {
        console.error(`${tag} meta write`, e);
      }
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        message: "deploy started",
        jobId,
      }),
    );
  }).catch((err) => {
    console.error("[local-deploy-hook] mkdir", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "internal", message: String(err.message) }));
    }
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url || "/", "http://127.0.0.1");

  if (!requireAuth(req, res)) return;

  if (req.method === "POST" && u.pathname === "/run") {
    handleRun(res);
    return;
  }

  if (req.method === "GET" && u.pathname === "/status") {
    const jobId = u.searchParams.get("jobId")?.trim() ?? "";
    void handleStatus(res, jobId);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `[local-deploy-hook] listening http://127.0.0.1:${PORT} (POST /run, GET /status)`,
  );
  if (!SECRET) {
    console.error(
      "[local-deploy-hook] WARNING: DEPLOY_HOOK_SECRET is empty — requests will get 503",
    );
  }
});
