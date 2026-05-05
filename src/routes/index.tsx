import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentChat, type AgentChatMessage } from "@/components/agent/AgentChat";
import {
  SettingsDrawer,
  type AdvancedBuilderSettings,
} from "@/components/agent/SettingsDrawer";
import { Canvas } from "@/components/builder/Canvas";
import { WhyPanel } from "@/components/builder/WhyPanel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { ProjectMemory, HitlAwaitPayload, HITLAction } from "@/lib/orchestrator";
import { serverRunPipeline } from "@/lib/pipeline-server-fn";
import type { PlanPatch, StyleDNAShape, ArchitecturePatch, HITLAtomicAction } from "@/lib/hitl";
import { exportSite, exportReactZip, exportReactProject } from "@/lib/export-site";
import { type SiteSchema } from "@/lib/site-schema";
import { siteExportDocumentTitle, siteSchemaToHtml } from "@/lib/site-render";
import { mergeAutoImages } from "@/lib/site-image-fill";
import { styleDNAFromControlPanel } from "@/lib/style-dna-from-ui";
import { inferStyleDNAFromUserIntent } from "@/lib/infer-style-dna";
import { applyInstantSiteAction, buildChatPipelinePrompt } from "@/lib/agent-actions";
import { resolveUserIntent } from "@/lib/intent-router";
import type { DeployHistoryEntry } from "@/components/builder/Canvas";

const DEPLOY_HISTORY_KEY = "ai-builder-deploy-history-v1";

/** Ниже nginx proxy_read_timeout (1800s), чтобы UI не «висел» бесконечно при обрыве. */
const PIPELINE_CLIENT_TIMEOUT_MS = 1_650_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

function readDeployHistory(): DeployHistoryEntry[] {
  try {
    const raw = localStorage.getItem(DEPLOY_HISTORY_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as DeployHistoryEntry[];
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function pushDeployHistoryEntry(entry: DeployHistoryEntry): void {
  try {
    const cur = readDeployHistory();
    cur.unshift(entry);
    localStorage.setItem(DEPLOY_HISTORY_KEY, JSON.stringify(cur.slice(0, 20)));
  } catch {
    /* noop */
  }
}

type ProjectSummary = { id: string; prompt: string; createdAt: string; updatedAt: string };

const CHAT_QUICK_ACTIONS = [
  { id: "reviews", label: "➕ Отзывы", text: "Добавь отзывы" },
  { id: "dark", label: "🎨 Темнее", text: "Сделай тёмный стиль" },
  { id: "pricing", label: "💰 Тарифы", text: "Добавь тарифы" },
] as const;

const defaultAdvanced: AdvancedBuilderSettings = {
  style: "premium",
  theme: "dark",
  type: "landing",
  useManualStyleDNA: false,
  enableHITL: false,
  designIterations: 2,
  qualityThreshold: 80,
};

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "AI Website Builder — чат и превью" },
      {
        name: "description",
        content:
          "Опишите сайт в чате — агент подберёт стиль и структуру. Превью и деплой справа.",
      },
    ],
  }),
});

function hitlSplitLines(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function buildHitlResumeAction(
  payload: HitlAwaitPayload,
  pages: string,
  sections: string,
  goals: string,
  dna: StyleDNAShape,
): HITLAction {
  if (payload.checkpoint !== "confirm_plan") {
    return { type: "confirm_plan" };
  }
  const p = hitlSplitLines(pages).map((type) => ({ type }));
  const sec = hitlSplitLines(sections).map((type) => ({ type }));
  const g = hitlSplitLines(goals);
  const patch: PlanPatch = {};
  if (JSON.stringify(p) !== JSON.stringify(payload.plan.pages)) patch.pages = p;
  if (JSON.stringify(sec) !== JSON.stringify(payload.plan.sections)) patch.sections = sec;
  if (JSON.stringify(g) !== JSON.stringify(payload.plan.goals)) patch.goals = g;

  const baseDna: StyleDNAShape = payload.styleDNA ?? {
    vibe: "",
    density: "",
    motion: "",
    contrast: "",
  };
  const dnaPatch: Partial<StyleDNAShape> = {};
  if (dna.vibe.trim() !== baseDna.vibe) dnaPatch.vibe = dna.vibe.trim();
  if (dna.density.trim() !== baseDna.density) dnaPatch.density = dna.density.trim();
  if (dna.motion.trim() !== baseDna.motion) dnaPatch.motion = dna.motion.trim();
  if (dna.contrast.trim() !== baseDna.contrast) dnaPatch.contrast = dna.contrast.trim();

  const actions: HITLAtomicAction[] = [];
  if (Object.keys(patch).length > 0) actions.push({ type: "edit_plan", patch });
  if (Object.keys(dnaPatch).length > 0) actions.push({ type: "update_style_dna", dna: dnaPatch });

  if (actions.length === 0) return { type: "confirm_plan" };
  if (actions.length === 1) return actions[0];
  return { type: "compound", actions };
}

function Index() {
  const [adv, setAdv] = useState<AdvancedBuilderSettings>(defaultAdvanced);
  const [chatMessages, setChatMessages] = useState<AgentChatMessage[]>([]);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [instantApplying, setInstantApplying] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
  const [generatedHtml, setGeneratedHtml] = useState("");
  const [generatedSite, setGeneratedSite] = useState<SiteSchema | null>(null);
  const [lastRunMemory, setLastRunMemory] = useState<ProjectMemory | null>(null);
  const [lastPipelinePrompt, setLastPipelinePrompt] = useState("");
  const tokenStreamRef = useRef({ buf: "", rafId: 0, agentLabel: "" });
  const hitlResolveRef = useRef<((a: HITLAction) => void) | null>(null);
  const [hitlPayload, setHitlPayload] = useState<HitlAwaitPayload | null>(null);
  const [hitlPages, setHitlPages] = useState("");
  const [hitlSections, setHitlSections] = useState("");
  const [hitlGoals, setHitlGoals] = useState("");
  const [hitlVibe, setHitlVibe] = useState("");
  const [hitlDensity, setHitlDensity] = useState("");
  const [hitlMotion, setHitlMotion] = useState("");
  const [hitlContrast, setHitlContrast] = useState("");
  const [hitlArchJson, setHitlArchJson] = useState("");
  const [hitlSectionOrder, setHitlSectionOrder] = useState("");
  const [hitlDraftSectionId, setHitlDraftSectionId] = useState("");
  const [hitlRefineHint, setHitlRefineHint] = useState("");
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployHistory, setDeployHistory] = useState<DeployHistoryEntry[]>([]);
  const [selfHostLoading, setSelfHostLoading] = useState(false);
  const [selfHostPhase, setSelfHostPhase] = useState<
    "idle" | "running" | "success" | "failed" | "unknown"
  >("idle");
  const [selfHostMessage, setSelfHostMessage] = useState<string | null>(null);
  const selfHostPollAbortRef = useRef<AbortController | null>(null);
  const [projectList, setProjectList] = useState<ProjectSummary[]>([]);
  const [projectIdLoading, setProjectIdLoading] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectMessage, setProjectMessage] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const data = (await res.json()) as { projects?: ProjectSummary[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setProjectList(data.projects ?? []);
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    setDeployHistory(readDeployHistory());
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (!hitlPayload) return;
    if (hitlPayload.checkpoint === "confirm_plan") {
      setHitlPages(hitlPayload.plan.pages.map((x) => x.type).join("\n"));
      setHitlSections(hitlPayload.plan.sections.map((x) => x.type).join("\n"));
      setHitlGoals(hitlPayload.plan.goals.join("\n"));
      const d = hitlPayload.styleDNA;
      setHitlVibe(d?.vibe ?? "");
      setHitlDensity(d?.density ?? "");
      setHitlMotion(d?.motion ?? "");
      setHitlContrast(d?.contrast ?? "");
    } else if (hitlPayload.checkpoint === "confirm_architecture") {
      setHitlArchJson(hitlPayload.architectureJson);
      setHitlSectionOrder(hitlPayload.planSections.join("\n"));
    } else if (hitlPayload.checkpoint === "review_draft") {
      setHitlDraftSectionId(hitlPayload.sectionOptions[0]?.id ?? "");
      setHitlRefineHint("");
    }
  }, [hitlPayload]);

  const submitHitl = useCallback((action: HITLAction) => {
    const r = hitlResolveRef.current;
    hitlResolveRef.current = null;
    setHitlPayload(null);
    setPipelineStatus("Продолжаем пайплайн…");
    r?.(action);
  }, []);

  const continuePlannerHitl = useCallback(() => {
    if (!hitlPayload || hitlPayload.checkpoint !== "confirm_plan" || !hitlResolveRef.current) return;
    const action = buildHitlResumeAction(
      hitlPayload,
      hitlPages,
      hitlSections,
      hitlGoals,
      {
        vibe: hitlVibe,
        density: hitlDensity,
        motion: hitlMotion,
        contrast: hitlContrast,
      },
    );
    submitHitl(action);
  }, [
    hitlPayload,
    hitlPages,
    hitlSections,
    hitlGoals,
    hitlVibe,
    hitlDensity,
    hitlMotion,
    hitlContrast,
    submitHitl,
  ]);

  const applyArchitectHitl = useCallback(() => {
    if (!hitlPayload || hitlPayload.checkpoint !== "confirm_architecture") return;
    let action: HITLAction = { type: "confirm_architecture" };
    try {
      const o = JSON.parse(hitlArchJson) as Record<string, unknown>;
      const patch: ArchitecturePatch = {};
      if ("layout" in o) patch.layout = o.layout;
      if ("components" in o) patch.components = o.components as unknown[];
      if ("designSystem" in o) patch.designSystem = o.designSystem;
      const has = Object.keys(patch).length > 0;
      const order = hitlSplitLines(hitlSectionOrder);
      const orderChanged =
        order.length > 0 && JSON.stringify(order) !== JSON.stringify(hitlPayload.planSections);
      if (has && orderChanged) {
        action = {
          type: "compound",
          actions: [
            { type: "edit_architecture", patch },
            { type: "reorder_sections", order },
          ],
        };
      } else if (has) {
        action = { type: "edit_architecture", patch };
      } else if (orderChanged) {
        action = { type: "reorder_sections", order };
      }
    } catch {
      action = { type: "confirm_architecture" };
    }
    submitHitl(action);
  }, [hitlPayload, hitlArchJson, hitlSectionOrder, submitHitl]);

  const handleChatSend = useCallback(
    async (text: string) => {
      if (pipelineRunning || instantApplying || hitlPayload) return;
      const userLine = text.trim();
      if (!userLine) return;

      const userPrior = chatMessages.filter((m) => m.role === "user").map((m) => m.content);
      const userThread = [...userPrior, userLine];
      const pipelinePrompt = buildChatPipelinePrompt(userThread, generatedSite);

      setChatMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "user", content: userLine, at: Date.now() },
      ]);

      const siteSnapshot = generatedSite;
      const routed = resolveUserIntent(userLine, Boolean(siteSnapshot));

      if (routed.kind === "instant" && siteSnapshot) {
        setInstantApplying(true);
        setHitlPayload(null);
        setPipelineStatus("Анализирую задачу…");
        const ts0 = tokenStreamRef.current;
        ts0.buf = "";
        ts0.agentLabel = "";
        if (ts0.rafId) {
          cancelAnimationFrame(ts0.rafId);
          ts0.rafId = 0;
        }
        await new Promise<void>((r) => requestAnimationFrame(() => r()));

        try {
          setPipelineStatus("Применяю правку к превью…");
          const { site, summary } = applyInstantSiteAction(siteSnapshot, routed.action);
          const merged = mergeAutoImages(site, userLine);
          setDeployUrl(null);
          setDeployError(null);
          setSelfHostPhase("idle");
          setSelfHostMessage(null);
          setLastPipelinePrompt(buildChatPipelinePrompt(userThread, merged));
          setGeneratedSite(merged);
          setGeneratedHtml(siteSchemaToHtml(merged));
          setLastRunMemory((prev) => (prev ? { ...prev, siteSchema: merged } : prev));
          setChatMessages((m) => [
            ...m,
            { id: crypto.randomUUID(), role: "assistant", content: summary, at: Date.now() },
          ]);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Ошибка правки";
          setChatMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `Не удалось применить быструю правку: ${msg}`,
              at: Date.now(),
            },
          ]);
        } finally {
          setPipelineStatus(null);
          setInstantApplying(false);
        }
        return;
      }

      setPipelineRunning(true);
      setPipelineStatus("Анализирую задачу…");
      setHitlPayload(null);
      const ts = tokenStreamRef.current;
      ts.buf = "";
      ts.agentLabel = "";
      if (ts.rafId) {
        cancelAnimationFrame(ts.rafId);
        ts.rafId = 0;
      }

      const initialStyleDNA = adv.useManualStyleDNA
        ? styleDNAFromControlPanel(adv.style, adv.theme, adv.type)
        : inferStyleDNAFromUserIntent(pipelinePrompt);

      try {
        await new Promise<void>((r) => {
          window.setTimeout(r, 350);
        });
        setPipelineStatus("Строю структуру…");
        await new Promise<void>((r) => {
          window.setTimeout(r, 350);
        });
        setPipelineStatus("Улучшаю дизайн…");

        const pipelineResult = await serverRunPipeline({
          data: {
            prompt: pipelinePrompt,
            config: {
              enableHITL: adv.enableHITL,
              designIterations: adv.designIterations,
              qualityThreshold: adv.qualityThreshold,
            },
            initialStyleDNA,
          },
        });

        if (!pipelineResult.ok) {
          setChatMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content:
                "Сервис временно не ответил. Попробуйте отправить запрос ещё раз через несколько секунд.",
              at: Date.now(),
            },
          ]);
          return;
        }

        setPipelineStatus("Финализирую…");
        await new Promise<void>((r) => {
          window.setTimeout(r, 280);
        });

        const memory = pipelineResult.memory;

        const site = memory.siteSchema;
        if (!site) {
          setChatMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content:
                "Подготовил упрощённый вариант превью. Опишите сайт чуть подробнее или попробуйте снова — доработаю полную версию.",
              at: Date.now(),
            },
          ]);
          return;
        }

        const merged = mergeAutoImages(site, pipelinePrompt);
        setDeployUrl(null);
        setDeployError(null);
        setSelfHostPhase("idle");
        setSelfHostMessage(null);
        setLastPipelinePrompt(pipelinePrompt);
        setGeneratedSite(merged);
        setGeneratedHtml(siteSchemaToHtml(merged));
        setLastRunMemory(memory);
        setPipelineStatus(null);
        setChatMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              "Готово. Сайт обновлён в превью справа. Можете попросить правки одним сообщением (например: «добавь отзывы» или «сделай тёмнее»).",
            at: Date.now(),
          },
        ]);
      } catch (e) {
        console.error(e);
        setPipelineStatus(null);
        const timeout =
          e instanceof Error && e.message === "pipeline_client_timeout"
            ? "Генерация прервалась по таймауту (~27 мин). Откройте вкладку заново и отправьте запрос ещё раз; при длинных брифах разбейте задачу на 2 сообщения."
            : "Связь прервалась или ответ ещё обрабатывается. Обновите страницу и отправьте запрос снова; при длинной генерации не закрывайте вкладку — технические детали не показываю.";
        setChatMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: timeout,
            at: Date.now(),
          },
        ]);
      } finally {
        setPipelineRunning(false);
      }
    },
    [
      pipelineRunning,
      instantApplying,
      hitlPayload,
      chatMessages,
      generatedSite,
      adv.useManualStyleDNA,
      adv.style,
      adv.theme,
      adv.type,
      adv.enableHITL,
      adv.designIterations,
      adv.qualityThreshold,
    ],
  );

  const handleExportZip = useCallback(() => {
    if (!generatedSite) return;
    void exportSite(generatedSite).catch((err) => {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Не удалось сформировать ZIP");
    });
  }, [generatedSite]);

  const handleExportReact = useCallback(() => {
    if (!generatedSite) return;
    void exportReactZip(exportReactProject(generatedSite), "react-site-export.zip").catch((err) => {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Не удалось сформировать React ZIP");
    });
  }, [generatedSite]);

  const handleDeploy = useCallback(async () => {
    if (!generatedSite) return;
    setDeployLoading(true);
    setDeployError(null);
    setDeployUrl(null);
    pushDeployHistoryEntry({ ts: Date.now(), kind: "vercel", status: "running" });
    setDeployHistory(readDeployHistory());
    try {
      const files = exportReactProject(generatedSite);
      const projectName = siteExportDocumentTitle(generatedSite).slice(0, 64).trim() || "ai-site";
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files, projectName }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (!data.url) throw new Error("Сервер не вернул url");
      setDeployUrl(data.url);
      pushDeployHistoryEntry({
        ts: Date.now(),
        kind: "vercel",
        status: "success",
        url: data.url,
      });
      setDeployHistory(readDeployHistory());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка деплоя";
      setDeployError(msg);
      pushDeployHistoryEntry({
        ts: Date.now(),
        kind: "vercel",
        status: "failed",
        detail: msg,
      });
      setDeployHistory(readDeployHistory());
    } finally {
      setDeployLoading(false);
    }
  }, [generatedSite]);

  const handleDeploySelfHost = useCallback(async () => {
    if (!generatedSite) return;
    selfHostPollAbortRef.current?.abort();
    const ac = new AbortController();
    selfHostPollAbortRef.current = ac;
    setSelfHostLoading(true);
    setSelfHostPhase("running");
    setSelfHostMessage(null);
    pushDeployHistoryEntry({ ts: Date.now(), kind: "self-host", status: "running" });
    setDeployHistory(readDeployHistory());
    try {
      const res = await fetch("/api/deploy/self-host", { method: "POST", signal: ac.signal });
      const data = (await res.json()) as {
        success?: boolean;
        jobId?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? data.message ?? `HTTP ${res.status}`);
      }
      const jobId = data.jobId;
      if (!jobId) throw new Error("Нет jobId от deploy hook");

      const deadline = Date.now() + 120_000;
      let lastLog = "";
      while (Date.now() < deadline) {
        if (ac.signal.aborted) return;
        await new Promise((r) => setTimeout(r, 2000));
        const st = await fetch(
          `/api/deploy/self-host/status?jobId=${encodeURIComponent(jobId)}`,
          { signal: ac.signal },
        );
        const body = (await st.json()) as {
          status?: string;
          log?: string;
          exitCode?: number | null;
          error?: string;
        };
        if (!st.ok) {
          throw new Error(body.error ?? `status HTTP ${st.status}`);
        }
        lastLog = body.log ?? "";
        setSelfHostMessage(lastLog.slice(-4000));
        const s = (body.status ?? "").toLowerCase();
        const badExit = body.exitCode != null && body.exitCode !== 0;
        if (s === "failed" || s === "error" || badExit) {
          setSelfHostPhase("failed");
          pushDeployHistoryEntry({
            ts: Date.now(),
            kind: "self-host",
            status: "failed",
            detail: lastLog.slice(-500),
            jobId,
          });
          setDeployHistory(readDeployHistory());
          return;
        }
        if (
          s === "done" ||
          s === "completed" ||
          s === "success" ||
          (s === "idle" && body.exitCode === 0)
        ) {
          setSelfHostPhase("success");
          pushDeployHistoryEntry({
            ts: Date.now(),
            kind: "self-host",
            status: "success",
            jobId,
          });
          setDeployHistory(readDeployHistory());
          return;
        }
      }
      setSelfHostPhase("unknown");
      pushDeployHistoryEntry({
        ts: Date.now(),
        kind: "self-host",
        status: "unknown",
        detail: "timeout polling",
        jobId,
      });
      setDeployHistory(readDeployHistory());
    } catch (e) {
      if (ac.signal.aborted) return;
      const msg = e instanceof Error ? e.message : String(e);
      setSelfHostPhase("failed");
      setSelfHostMessage(msg);
      pushDeployHistoryEntry({
        ts: Date.now(),
        kind: "self-host",
        status: "failed",
        detail: msg,
      });
      setDeployHistory(readDeployHistory());
    } finally {
      setSelfHostLoading(false);
    }
  }, [generatedSite]);

  const handleSaveProject = useCallback(async () => {
    if (!generatedSite) return;
    setProjectMessage(null);
    try {
      const bodyPrompt = lastPipelinePrompt.trim();
      if (!bodyPrompt) {
        setProjectMessage("Сначала сгенерируйте сайт из чата.");
        return;
      }
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: bodyPrompt, siteSchema: generatedSite }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setProjectMessage(`Сохранено: ${data.id ?? "ok"}`);
      await refreshProjects();
      if (data.id) setSelectedProjectId(data.id);
    } catch (e) {
      setProjectMessage(e instanceof Error ? e.message : "Ошибка сохранения");
    }
  }, [generatedSite, lastPipelinePrompt, refreshProjects]);

  const handleLoadProject = useCallback(async () => {
    const id = selectedProjectId.trim();
    if (!id) return;
    setProjectIdLoading(id);
    setProjectMessage(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`);
      const data = (await res.json()) as {
        id?: string;
        siteSchema?: SiteSchema;
        prompt?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (!data.siteSchema) throw new Error("нет siteSchema");
      const merged = mergeAutoImages(data.siteSchema, data.prompt ?? "");
      setGeneratedSite(merged);
      setGeneratedHtml(siteSchemaToHtml(merged));
      setLastPipelinePrompt(data.prompt ?? "");
      setLastRunMemory(null);
      setDeployUrl(null);
      setDeployError(null);
      setSelfHostPhase("idle");
      setSelfHostMessage(null);
      setProjectMessage(`Открыт проект ${data.id ?? id}`);
      setChatMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Загружен сохранённый проект. Продолжайте правки в чате.`,
          at: Date.now(),
        },
      ]);
    } catch (e) {
      setProjectMessage(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setProjectIdLoading(null);
    }
  }, [selectedProjectId]);

  const canvasState: "empty" | "loading" | "result" = pipelineRunning
    ? "loading"
    : generatedHtml || generatedSite
      ? "result"
      : "empty";

  const hitlPanel =
    hitlPayload?.checkpoint === "confirm_plan" ? (
      <div className="space-y-2 p-3">
        <p className="text-xs font-semibold">Согласование плана</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
            Страницы
            <Textarea
              value={hitlPages}
              onChange={(e) => setHitlPages(e.target.value)}
              className="min-h-[64px] text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
            Секции
            <Textarea
              value={hitlSections}
              onChange={(e) => setHitlSections(e.target.value)}
              className="min-h-[64px] text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
            Цели
            <Textarea
              value={hitlGoals}
              onChange={(e) => setHitlGoals(e.target.value)}
              className="min-h-[64px] text-xs"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <Input value={hitlVibe} onChange={(e) => setHitlVibe(e.target.value)} className="h-8 text-xs" />
          <Input
            value={hitlDensity}
            onChange={(e) => setHitlDensity(e.target.value)}
            className="h-8 text-xs"
          />
          <Input value={hitlMotion} onChange={(e) => setHitlMotion(e.target.value)} className="h-8 text-xs" />
          <Input
            value={hitlContrast}
            onChange={(e) => setHitlContrast(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <Button type="button" size="sm" className="w-full" onClick={() => continuePlannerHitl()}>
          Продолжить
        </Button>
      </div>
    ) : hitlPayload?.checkpoint === "confirm_architecture" ? (
      <div className="space-y-2 p-3">
        <p className="text-xs font-semibold">Согласование архитектуры</p>
        <Textarea
          value={hitlArchJson}
          onChange={(e) => setHitlArchJson(e.target.value)}
          className="min-h-[100px] font-mono text-[10px]"
        />
        <Textarea
          value={hitlSectionOrder}
          onChange={(e) => setHitlSectionOrder(e.target.value)}
          className="min-h-[48px] text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => submitHitl({ type: "confirm_architecture" })}
          >
            ОК
          </Button>
          <Button type="button" size="sm" onClick={() => applyArchitectHitl()}>
            Применить
          </Button>
        </div>
      </div>
    ) : hitlPayload?.checkpoint === "review_draft" ? (
      <div className="space-y-2 p-3">
        <p className="text-xs font-semibold">Черновик сайта</p>
        <pre className="max-h-[120px] overflow-auto rounded border bg-background/40 p-2 text-[9px]">
          {hitlPayload.preview.slice(0, 4000)}
        </pre>
        <select
          className="h-8 w-full rounded-md border bg-background px-2 text-xs"
          value={hitlDraftSectionId}
          onChange={(e) => setHitlDraftSectionId(e.target.value)}
        >
          {hitlPayload.sectionOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.id} ({o.type})
            </option>
          ))}
        </select>
        <Input
          value={hitlRefineHint}
          onChange={(e) => setHitlRefineHint(e.target.value)}
          className="h-8 text-xs"
          placeholder="Подсказка refine"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => submitHitl({ type: "confirm_draft" })}>
            Дальше
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => submitHitl({ type: "regenerate_section", sectionId: hitlDraftSectionId })}
          >
            Секция
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => submitHitl({ type: "refine_all", hint: hitlRefineHint.trim() || undefined })}
          >
            Усилить
          </Button>
        </div>
      </div>
    ) : undefined;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <div className="flex h-full min-w-0 w-[min(100%,420px)] shrink-0 flex-col border-r border-border/50 bg-sidebar">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/40 px-3 py-2">
          <span className="mr-1 text-xs font-semibold tracking-tight">Builder</span>
          <SettingsDrawer settings={adv} onChange={setAdv} />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!generatedSite || Boolean(projectIdLoading)}
            onClick={() => void handleSaveProject()}
          >
            Сохранить
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!selectedProjectId || Boolean(projectIdLoading)}
            onClick={() => void handleLoadProject()}
          >
            {projectIdLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Открыть"}
          </Button>
          <select
            className="h-8 max-w-[140px] rounded-md border border-border/60 bg-[var(--panel-elevated)]/60 px-2 text-[11px]"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          >
            <option value="">Проект…</option>
            {projectList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id.slice(0, 8)}…
              </option>
            ))}
          </select>
        </div>
        {projectMessage ? (
          <p className="px-3 py-1 text-[10px] text-muted-foreground">{projectMessage}</p>
        ) : null}
        <div className="min-h-0 flex-1">
          <AgentChat
            showBrandHeader={false}
            className="h-full"
            messages={chatMessages}
            onSend={(t) => void handleChatSend(t)}
            disabled={pipelineRunning || instantApplying || Boolean(hitlPayload)}
            statusLine={pipelineStatus}
            hitlPanel={hitlPanel}
            quickActions={generatedSite ? [...CHAT_QUICK_ACTIONS] : []}
          />
        </div>
        <WhyPanel
          memory={lastRunMemory}
          compact
          className="max-h-[30vh] shrink-0 border-t border-border/40 rounded-none border-x-0 border-b-0"
        />
      </div>

      <Canvas
        state={canvasState}
        html={generatedHtml}
        siteSchema={generatedSite}
        onReset={() => {
          setGeneratedHtml("");
          setGeneratedSite(null);
          setLastRunMemory(null);
          setChatMessages([]);
          setDeployUrl(null);
          setDeployError(null);
          setSelfHostPhase("idle");
          setSelfHostMessage(null);
          setLastPipelinePrompt("");
        }}
        onExportZip={generatedSite ? handleExportZip : null}
        onExportReact={generatedSite ? handleExportReact : null}
        onDeploy={generatedSite ? handleDeploy : null}
        onDeploySelfHost={generatedSite ? handleDeploySelfHost : null}
        deployLoading={deployLoading}
        selfHostLoading={selfHostLoading}
        deployUrl={deployUrl}
        deployError={deployError}
        selfHostPhase={selfHostPhase}
        selfHostMessage={selfHostMessage}
        deployHistory={deployHistory}
        onRedeploy={generatedSite ? handleDeploy : null}
      />
    </div>
  );
}
