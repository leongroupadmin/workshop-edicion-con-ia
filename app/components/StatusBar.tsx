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

/**
 * La barra del proyecto, en una sola fila: a la izquierda lo que manda la
 * página (nombre del proyecto), en el medio el estado (la lista de pasos
 * aparece al pasar el cursor) y a la derecha las acciones (Renderizar, IA…).
 * Los errores y los logs se despliegan debajo solo cuando hacen falta.
 */
export const StatusBar = ({
  id,
  state,
  onRetry,
  left,
  right,
}: {
  id: string;
  state: ProjectState;
  onRetry: () => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<{ pipeline: string; jobs: string; agent: string } | null>(null);
  const [tab, setTab] = useState<"pipeline" | "jobs" | "agent">("pipeline");
  const { status, running } = state;
  const isError = status.step === "error";
  const current = PIPELINE_ORDER.indexOf(status.step as (typeof PIPELINE_ORDER)[number]);
  const doneCount = status.step === "done" ? PIPELINE_ORDER.length : Math.max(0, current);

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
      <div className="px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        {left}

        {/* Estado: pasa el cursor para ver los pasos */}
        <div className="group relative min-w-0 flex-1" tabIndex={0}>
          <div
            className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-[13px] hover:bg-fg/[0.04] ${
              isError ? "text-red-700" : "text-fg-2"
            }`}
          >
            {running ? <Spinner className="text-accent-strong" /> : null}
            <span className="shrink-0 rounded border border-line px-1.5 text-[11px] tabular-nums text-muted">
              {isError ? "⚠️" : status.step === "done" ? "✓" : `${doneCount}/${PIPELINE_ORDER.length}`}
            </span>
            <span className="truncate">
              {status.message || STEP_LABELS[status.step]}
              {typeof status.progress === "number" && status.progress > 0 && status.progress < 1
                ? ` (${Math.round(status.progress * 100)}%)`
                : ""}
            </span>
          </div>
          <ol className="absolute left-0 top-full z-30 mt-1 hidden min-w-[200px] flex-col gap-0.5 rounded-lg border border-line bg-panel-2 p-2 text-[12px] shadow-xl group-hover:flex group-focus-within:flex">
            {PIPELINE_ORDER.map((s, i) => {
              const done = current > i || status.step === "done";
              const active = current === i && status.step !== "done";
              return (
                <li
                  key={s}
                  className={`rounded-md px-2 py-1 ${
                    active ? "bg-amber-400/10 text-amber-700" : done ? "text-fg-2" : "text-faint"
                  }`}
                >
                  {done ? "✓ " : active ? "● " : "○ "}
                  {SHORT[s]}
                </li>
              );
            })}
          </ol>
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
        {right}
        <Button variant="ghost" onClick={() => setOpen((o) => !o)}>
          {open ? "Ocultar logs" : "Logs"}
        </Button>
      </div>
      {isError && status.error ? (
        <div className="mx-4 mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-800 text-[13px] whitespace-pre-wrap">
          {status.error}
        </div>
      ) : null}
      {open ? (
        <div className="mx-4 mb-3 rounded-lg border border-line bg-panel-2">
          <div className="flex gap-1 p-1 border-b border-line">
            {(["pipeline", "jobs", "agent"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2.5 py-1 rounded text-xs ${tab === t ? "bg-fg/10 text-fg" : "text-muted"}`}
              >
                {t === "pipeline" ? "Pipeline" : t === "jobs" ? "Procesos" : "Claude"}
              </button>
            ))}
          </div>
          <pre className="max-h-64 overflow-auto p-3 text-[11px] leading-relaxed text-fg-2 font-mono whitespace-pre-wrap">
            {logs?.[tab] || "Sin registros todavía."}
          </pre>
        </div>
      ) : null}
    </div>
  );
};
