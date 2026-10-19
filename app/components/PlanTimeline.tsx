"use client";

import { useState } from "react";
import { api, fmtTime } from "@/lib/client";
import { seekTo, usePlayhead } from "@/lib/playhead";
import { LAYOUT_LABELS, PACE_LABELS, SCENE_TYPES, TYPE_LABELS, sceneLayout } from "@/lib/defaults";
import type { EditStyle, PlanItem, ProjectState, SceneLayout } from "@/lib/types";
import { GraphicsCountField, PACE_HINT } from "./StyleFields";
import { Button, LayoutIcon, Panel, Seg } from "./ui";

const LANES: { key: string; label: string; types: string[]; color: string }[] = [
  { key: "scenes", label: "Escenas", types: ["motion_graphic", "broll"], color: "bg-violet-500/70 border-violet-300/60" },
  { key: "overlays", label: "Títulos / overlays", types: ["title", "overlay", "lower_third"], color: "bg-accent/80 border-accent/60 text-white" },
  { key: "fx", label: "Transiciones / zoom", types: ["transition", "zoom"], color: "bg-sky-500/70 border-sky-300/60" },
  { key: "sfx", label: "Sonido", types: ["sfx"], color: "bg-emerald-500/70 border-emerald-300/60" },
];

const laneOf = (it: PlanItem) => LANES.find((l) => l.types.includes(it.type)) ?? LANES[0];

export const PlanTimeline = ({ id, state, busy }: { id: string; state: ProjectState; busy: boolean }) => {
  const plan = state.plan;
  const [hover, setHover] = useState<string | null>(null);
  const [changes, setChanges] = useState("");
  const [showChanges, setShowChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [styleChanged, setStyleChanged] = useState(false);
  const style = state.settings.style;
  const playhead = usePlayhead(id);

  /** Ritmo y cantidad de gráficos: se guardan y se ofrece rehacer el plan. */
  const saveStyle = async (patch: Partial<EditStyle>) => {
    setError(null);
    try {
      await api(`/api/projects/${id}/settings`, {
        method: "POST",
        body: JSON.stringify({ settings: { style: { ...style, ...patch } } }),
      });
      setStyleChanged(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const replan = async () => {
    setError(null);
    setPending(true);
    try {
      await api(`/api/projects/${id}/replan`, { method: "POST" });
      setStyleChanged(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const act = async (body: object) => {
    setError(null);
    setPending(true);
    try {
      await api(`/api/projects/${id}/plan`, { method: "POST", body: JSON.stringify(body) });
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  };

  if (!plan) {
    return (
      <Panel title="Plan de edición">
        <p className="text-neutral-500 text-[13px]">
          {state.status.step === "planning"
            ? "Claude está armando el plan…"
            : state.cut
              ? "Todavía no hay plan. Pedíselo a Claude por el chat o tocá Reintentar."
              : "El plan aparece cuando el video esté transcripto y cortado."}
        </p>
      </Panel>
    );
  }

  const duration = Math.max(state.durationMs, ...plan.items.map((i) => i.endMs), 1);
  const items = [...plan.items].sort((a, b) => a.startMs - b.startMs);
  const draft = plan.status === "draft";
  const sceneCount = items.filter((i) => SCENE_TYPES.has(i.type) && i.status !== "removed").length;
  const ticks = Array.from({ length: Math.floor(duration / 5000) + 1 }, (_, i) => i * 5000);

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Plan de edición
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
              draft ? "bg-accent-soft text-accent border-accent/40" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
            }`}
          >
            {draft ? "Borrador · se aprueba al renderizar" : "Aprobado"}
          </span>
        </span>
      }
      right={
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowChanges((s) => !s)} disabled={busy || pending}>
            ✏️ Pedir cambios
          </Button>
        </div>
      }
      bodyClassName="p-4 flex flex-col gap-4"
    >
      {/* Línea de tiempo */}
      <div className="relative rounded-lg border border-line bg-black/30 p-3">
        {/* Marcador: sigue al video del Preview mientras se reproduce */}
        {playhead !== null ? (
          <div className="pointer-events-none absolute inset-y-3 left-[calc(8rem+0.75rem)] right-3 z-10">
            <div
              className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]"
              style={{ left: `${Math.min(100, (playhead / duration) * 100)}%` }}
            >
              <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 rounded bg-white px-1 font-mono text-[9px] font-semibold text-black">
                {fmtTime(playhead)}
              </span>
            </div>
          </div>
        ) : null}
        <div
          className={`relative h-5 ml-32 text-[10px] text-neutral-500 ${playhead !== null ? "cursor-pointer" : ""}`}
          title={playhead !== null ? "Tocá para saltar a ese momento del video" : undefined}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seekTo(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration);
          }}
        >
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${(t / duration) * 100}%` }}>
              {Math.round(t / 1000)}s
            </span>
          ))}
        </div>
        {LANES.map((lane) => (
          <div key={lane.key} className="flex items-center h-8 border-t border-white/[0.04]">
            <div className="w-32 shrink-0 text-[11px] text-neutral-400 pr-2">{lane.label}</div>
            <div className="relative flex-1 h-6">
              {items
                .filter((it) => laneOf(it) === lane)
                .map((it) => {
                  const left = (it.startMs / duration) * 100;
                  const width = Math.max(0.8, ((it.endMs - it.startMs) / duration) * 100);
                  const removed = it.status === "removed";
                  return (
                    <button
                      key={it.id}
                      onMouseEnter={() => setHover(it.id)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => document.getElementById(`item-${it.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })}
                      className={`absolute top-0 h-6 rounded border text-[10px] font-medium px-1 truncate text-left ${lane.color} ${
                        removed ? "opacity-20 line-through" : ""
                      } ${hover === it.id ? "ring-2 ring-white" : ""}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${it.id} · ${fmtTime(it.startMs)}–${fmtTime(it.endMs)} · ${it.description}`}
                    >
                      {it.text || it.id}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {plan.summary ? <p className="text-neutral-300 text-[13px]">{plan.summary}</p> : null}

      <div className="rounded-lg border border-line bg-black/20 p-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">Cantidad de gráficos</span>
          <GraphicsCountField
            value={style.graphicsCount}
            onChange={(graphicsCount) => void saveStyle({ graphicsCount })}
            durationMs={state.durationMs}
          />
          {style.graphicsCount && sceneCount !== style.graphicsCount ? (
            <span className="text-[11px] text-amber-300">
              El plan actual tiene {sceneCount} {sceneCount === 1 ? "gráfico" : "gráficos"}: rehacelo para que tenga {style.graphicsCount}.
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">Ritmo</span>
          <Seg
            value={style.pace}
            onChange={(v) => void saveStyle({ pace: v })}
            options={(Object.keys(PACE_LABELS) as EditStyle["pace"][]).map((v) => ({ value: v, label: PACE_LABELS[v] }))}
          />
          <span className="text-[11px] text-neutral-500">
            {style.graphicsCount ? "Con cantidad fija, el ritmo cambia zooms, transiciones y sonidos." : PACE_HINT[style.pace]}
          </span>
        </div>
        {styleChanged || (style.graphicsCount > 0 && sceneCount !== style.graphicsCount) ? (
          <div className="lg:col-span-2">
            <Button variant="primary" disabled={busy || pending} onClick={replan}>
              Rehacer el plan con estos ajustes
            </Button>
            <span className="ml-3 text-[11px] text-neutral-500">Claude arma un plan nuevo; después lo revisás y tocás Renderizar.</span>
          </div>
        ) : null}
      </div>

      {showChanges ? (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: "changes", message: changes })) {
              setChanges("");
              setShowChanges(false);
            }
          }}
        >
          <input
            autoFocus
            value={changes}
            onChange={(e) => setChanges(e.target.value)}
            placeholder="Ej: sacá el zoom del final y agregá un título en el segundo 5"
            className="flex-1 bg-panel-2 border border-line rounded-md px-3 py-1.5 outline-none focus:border-accent/60"
          />
          <Button variant="primary" type="submit" disabled={!changes.trim() || busy || pending}>
            Enviar
          </Button>
        </form>
      ) : null}
      {error ? <p className="text-red-300 text-[13px]">{error}</p> : null}

      {/* Lista de elementos */}
      <ul className="flex flex-col divide-y divide-line border border-line rounded-lg overflow-hidden">
        {items.map((it) => {
          const removed = it.status === "removed";
          return (
            <li
              key={it.id}
              id={`item-${it.id}`}
              onMouseEnter={() => setHover(it.id)}
              onMouseLeave={() => setHover(null)}
              className={`flex items-start gap-3 px-3 py-2.5 ${hover === it.id ? "bg-white/[0.04]" : ""} ${removed ? "opacity-45" : ""}`}
            >
              <span className="font-mono text-[12px] text-neutral-400 w-24 shrink-0 pt-0.5">
                {fmtTime(it.startMs)}–{fmtTime(it.endMs)}
              </span>
              <span className={`text-[11px] px-1.5 py-0.5 rounded border shrink-0 ${laneOf(it).color}`}>
                {TYPE_LABELS[it.type] ?? it.type}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] ${removed ? "line-through" : ""}`}>
                  {it.text ? <span className="text-white font-medium">“{it.text}” — </span> : null}
                  {it.description}
                </div>
                <div className="text-[12px] text-neutral-500 mt-0.5">Por qué: {it.reason}</div>
                {it.sound ? <div className="text-[11px] text-emerald-300/80 mt-0.5">🔊 {it.sound}</div> : null}
                {SCENE_TYPES.has(it.type) && !removed ? (
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-[11px] text-neutral-500 mr-1">Cómo aparece:</span>
                    {(Object.keys(LAYOUT_LABELS) as SceneLayout[]).map((layout) => {
                      const on = sceneLayout(it) === layout;
                      return (
                        <button
                          key={layout}
                          disabled={pending || busy || on}
                          onClick={() => act({ action: "layout", itemId: it.id, layout })}
                          className={`flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] transition ${
                            on
                              ? "border-accent bg-accent-soft text-white"
                              : "border-line text-neutral-400 hover:text-white hover:border-neutral-500 disabled:opacity-40"
                          }`}
                        >
                          <LayoutIcon
                            layout={layout}
                            split={state.settings.style.split}
                            horizontal={state.settings.format === "horizontal"}
                            className={state.settings.format === "horizontal" ? "w-7 h-4" : "w-3.5 h-6"}
                          />
                          {LAYOUT_LABELS[layout]}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <span className="text-[11px] text-neutral-500 shrink-0 pt-0.5">
                {it.status === "rendered" ? "✓ generado" : it.status === "error" ? "⚠ error" : ""}
              </span>
              <Button
                variant={removed ? "default" : "ghost"}
                className="shrink-0"
                disabled={pending || busy}
                onClick={() => act({ action: removed ? "restore" : "remove", itemId: it.id })}
              >
                {removed ? "Restaurar" : "Quitar"}
              </Button>
            </li>
          );
        })}
      </ul>
      {!draft ? (
        <p className="text-[12px] text-neutral-500">
          Los cambios que hagas acá (quitar, restaurar, cómo aparece cada gráfico) se aplican con el botón “Re-renderizar” de
          arriba.
        </p>
      ) : null}
    </Panel>
  );
};
