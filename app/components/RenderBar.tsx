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
  if (busy) text = "Mirá el avance en esta misma barra (pasá el cursor por el estado para ver los pasos). Cuando termine, el video nuevo aparece en el reproductor.";
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

  // En la barra va una frase corta; el detalle aparece al pasar el cursor.
  const short = busy
    ? null
    : b.mode === "rerender" && b.pending.length
      ? `${b.pending.length === 1 ? "1 cambio" : `${b.pending.length} cambios`} sin renderizar`
      : b.mode === "render"
        ? `~${minutes} min`
        : null;

  return (
    <div className="group relative flex shrink-0 items-center gap-2" tabIndex={-1}>
      {short ? <span className="hidden text-[12px] text-neutral-400 lg:inline">{short}</span> : null}
      <button
        onClick={run}
        disabled={!actionable || busy || pending}
        className={`shrink-0 inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-[13px] font-semibold transition ${
          actionable && !busy
            ? "bg-accent text-on-accent hover:bg-accent-hover shadow-[0_10px_28px_-14px_var(--color-accent)]"
            : "bg-white/[0.06] text-neutral-400 border border-line cursor-default"
        }`}
      >
        {busy || pending ? <Spinner /> : null}
        {label}
      </button>
      <div className="absolute right-0 top-full z-30 mt-1 hidden w-[360px] rounded-lg border border-line bg-panel-2 p-3 text-[12px] leading-relaxed text-neutral-400 shadow-xl group-hover:block group-focus-within:block">
        {text}
      </div>
      {error ? <span className="max-w-[260px] truncate text-[12px] text-red-300" title={error}>{error}</span> : null}
    </div>
  );
};
