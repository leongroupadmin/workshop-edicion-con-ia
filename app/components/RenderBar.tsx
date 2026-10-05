"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { ProjectState } from "@/lib/types";
import { Spinner } from "./ui";

/**
 * El único botón para armar el video. "Renderizar" la primera vez,
 * "Re-renderizar" si cambiaste algo después, "✓ Video al día" si no hay cambios.
 * Hace todo: aprueba el plan, re-corta si hace falta, Claude genera los
 * gráficos que faltan o cambiaron, y arma la versión nueva.
 */
export const RenderBar = ({ id, state, busy }: { id: string; state: ProjectState; busy: boolean }) => {
  const b = state.build;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setPending(true);
    try {
      await api(`/api/projects/${id}/build`, { method: "POST" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const actionable = b.mode === "render" || b.mode === "rerender";
  const label = busy
    ? "Trabajando…"
    : b.mode === "render"
      ? "Renderizar"
      : b.mode === "rerender"
        ? "Re-renderizar"
        : b.mode === "uptodate"
          ? "✓ Video al día"
          : "Preparando el video…";

  // Qué va a pasar al tocar el botón, en criollo
  const steps: string[] = [];
  if (b.planDraft) steps.push("aprueba el plan");
  if (b.recut) steps.push("vuelve a cortar el video");
  if (b.scenes.length) steps.push(`Claude genera ${b.scenes.length === 1 ? "1 gráfico" : `${b.scenes.length} gráficos`}`);
  steps.push("arma el video");
  const minutes = Math.max(1, Math.round(0.6 + (b.recut ? 0.3 : 0) + b.scenes.length * 1.2));

  let text: React.ReactNode;
  if (busy) text = "Mirá el avance en la barra de arriba. Cuando termine, el video nuevo aparece en el reproductor.";
  else if (b.mode === "waiting") text = "Se está transcribiendo y cortando el video. Después vas a poder renderizar.";
  else if (b.mode === "uptodate") text = "El video tiene todos tus ajustes. Si cambiás algo, este botón se activa.";
  else {
    text = (
      <>
        {b.mode === "rerender" && b.pending.length ? (
          <span className="block text-neutral-200">
            Cambios sin renderizar: <b>{b.pending.join(", ")}</b>.
          </span>
        ) : null}
        <span className="block">
          Al tocarlo: {steps.join(" → ")} · ~{minutes} min
          {b.scenes.length ? " (usa Claude)" : ""}.
        </span>
        {b.scenes.length ? (
          <span className="block text-neutral-500">Gráficos: {b.scenes.map((s) => s.label).join(" · ")}</span>
        ) : null}
      </>
    );
  }

  return (
    <div
      className={`mx-3 mt-3 rounded-xl border px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 ${
        actionable && !busy ? "border-accent/30 bg-panel-2" : "border-line bg-panel"
      }`}
    >
      <button
        onClick={run}
        disabled={!actionable || busy || pending}
        className={`shrink-0 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[15px] font-semibold transition ${
          actionable && !busy
            ? "bg-accent text-white hover:bg-accent-hover shadow-[0_10px_28px_-14px_var(--color-accent)]"
            : "bg-white/[0.06] text-neutral-400 border border-line cursor-default"
        }`}
      >
        {busy || pending ? <Spinner /> : null}
        {label}
      </button>
      <div className="flex-1 min-w-[240px] text-[12px] text-neutral-400 leading-relaxed">
        {text}
        {error ? <span className="block text-red-300 mt-1">{error}</span> : null}
      </div>
    </div>
  );
};
