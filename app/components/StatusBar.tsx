"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { PIPELINE_ORDER, STEP_LABELS } from "@/lib/defaults";
import type { ProjectState } from "@/lib/types";
import { Button, Spinner } from "./ui";

const SHORT: Record<string, string> = {
  transcribing: "Transcribir",
  cutting: "Cortar",
  planning: "Plan",
  awaiting_approval: "Revisar plan",
  generating_scenes: "Escenas",
  assembling: "Montaje",
  rendering: "Render",
  done: "Listo",
};

export const StatusBar = ({ id, state, onRetry }: { id: string; state: ProjectState; onRetry: () => void }) => {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<{ pipeline: string; jobs: string; agent: string } | null>(null);
  const [tab, setTab] = useState<"pipeline" | "jobs" | "agent">("pipeline");
  const { status, running } = state;
  const isError = status.step === "error";
  const current = PIPELINE_ORDER.indexOf(status.step as (typeof PIPELINE_ORDER)[number]);

  useEffect(() => {
    if (!open) return;
    const load = () => api<typeof logs>(`/api/projects/${id}/logs`).then(setLogs).catch(() => {});
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [open, id]);

  const stop = () => api(`/api/projects/${id}/stop`, { method: "POST" }).catch(() => {});

  return (
    <div className="border-b border-line bg-panel/60">
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ol className="flex items-center gap-1 text-[12px] whitespace-nowrap overflow-x-auto shrink-0 max-w-full">
          {PIPELINE_ORDER.map((s, i) => {
            const done = current > i || status.step === "done";
            const active = current === i && status.step !== "done";
            return (
              <li key={s} className="flex items-center gap-1">
                <span
                  className={`px-2 py-1 rounded-md border ${
                    active
                      ? "border-accent/60 bg-accent-soft text-accent"
                      : done
                        ? "border-transparent text-neutral-300"
                        : "border-transparent text-neutral-600"
                  }`}
                >
                  {done ? "✓ " : ""}
                  {SHORT[s]}
                </span>
                {i < PIPELINE_ORDER.length - 1 ? <span className="text-neutral-700">›</span> : null}
              </li>
            );
          })}
        </ol>
        <div className={`flex-1 min-w-[220px] flex items-center gap-2 ${isError ? "text-red-300" : "text-neutral-300"}`}>
          {running ? <Spinner className="text-accent" /> : null}
          <span className="truncate">
            {isError ? "⚠️ " : ""}
            {status.message || STEP_LABELS[status.step]}
            {typeof status.progress === "number" && status.progress > 0 && status.progress < 1
              ? ` (${Math.round(status.progress * 100)}%)`
              : ""}
          </span>
        </div>
        {isError && !running ? (
          <Button variant="primary" onClick={onRetry}>
            Reintentar
          </Button>
        ) : null}
        {running ? (
          <Button variant="danger" onClick={stop}>
            Detener
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => setOpen((o) => !o)}>
          {open ? "Ocultar logs" : "Ver logs"}
        </Button>
      </div>
      {isError && status.error ? (
        <div className="mx-4 mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-200 text-[13px] whitespace-pre-wrap">
          {status.error}
        </div>
      ) : null}
      {open ? (
        <div className="mx-4 mb-3 rounded-lg border border-line bg-black/50">
          <div className="flex gap-1 p-1 border-b border-line">
            {(["pipeline", "jobs", "agent"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2.5 py-1 rounded text-xs ${tab === t ? "bg-white/10 text-white" : "text-neutral-400"}`}
              >
                {t === "pipeline" ? "Pipeline" : t === "jobs" ? "Procesos" : "Claude"}
              </button>
            ))}
          </div>
          <pre className="max-h-64 overflow-auto p-3 text-[11px] leading-relaxed text-neutral-300 font-mono whitespace-pre-wrap">
            {logs?.[tab] || "Sin registros todavía."}
          </pre>
        </div>
      ) : null}
    </div>
  );
};
