"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { STEP_LABELS } from "@/lib/defaults";
import type { PipelineStep } from "@/lib/types";

export const Button = ({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" | "danger" }) => {
  const styles = {
    default: "bg-white/[0.04] hover:bg-white/[0.08] border border-line text-neutral-100 hover:border-white/20",
    primary: "bg-accent text-on-accent font-medium hover:bg-accent-hover shadow-[0_6px_18px_-10px_var(--color-accent)]",
    ghost: "text-neutral-400 hover:text-white hover:bg-white/[0.06]",
    danger: "bg-red-500/10 hover:bg-red-500/15 text-red-300 border border-red-500/25",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] transition active:translate-y-px disabled:opacity-40 disabled:pointer-events-none ${styles} ${className}`}
    />
  );
};

export const Seg = <T extends string>({
  value,
  options,
  onChange,
  /** Si hay muchas opciones, repartirlas en varias filas de `cols` columnas. */
  cols,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  cols?: number;
}) => (
  <div
    className={`grid gap-1 bg-black/40 p-1 rounded-lg border border-line ${cols ? "" : "grid-flow-col auto-cols-fr"}`}
    style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}
  >
    {options.map((o) => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        className={`px-2 py-1.5 rounded-md text-[12px] ${
          value === o.value
            ? "bg-accent-soft text-white font-medium border border-accent/40"
            : "border border-transparent text-neutral-400 hover:text-white hover:bg-white/[0.05]"
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <div className="font-heading text-[11px] font-semibold uppercase tracking-[0.07em] text-neutral-500">{label}</div>
    {children}
  </div>
);

export const Panel = ({
  title,
  right,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) => (
  <section
    className={`bg-panel border border-line rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.6)] transition-colors hover:border-white/15 flex flex-col min-h-0 ${className}`}
  >
    {title ? (
      <div className="h-11 shrink-0 px-4 flex items-center justify-between border-b border-line">
        <h2 className="font-heading text-[13px] font-semibold tracking-tight text-neutral-100">{title}</h2>
        {right}
      </div>
    ) : null}
    <div className={`min-h-0 ${bodyClassName}`}>{children}</div>
  </section>
);

const STEP_COLORS: Partial<Record<PipelineStep, string>> = {
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  error: "bg-red-500/15 text-red-300 border-red-500/30",
  awaiting_approval: "bg-amber-400/10 text-amber-300 border-amber-400/30",
  idle: "bg-white/5 text-neutral-400 border-line",
};

export const StepBadge = ({ step }: { step: PipelineStep }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
      STEP_COLORS[step] ?? "bg-sky-500/10 text-sky-300 border-sky-500/30"
    }`}
  >
    {!["done", "error", "idle", "awaiting_approval"].includes(step) ? (
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
    ) : null}
    {STEP_LABELS[step] ?? step}
  </span>
);

export const Spinner = ({ className = "" }: { className?: string }) => (
  <span
    className={`inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
  />
);

export const TrashIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 5v6m4-6v6" />
  </svg>
);

/** Ventana de confirmación para acciones que borran algo. Montarla solo cuando se muestra. */
export const ConfirmDialog = ({
  title,
  children,
  confirmLabel = "Eliminar",
  onConfirm,
  onClose,
}: {
  title: ReactNode;
  children: ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[3px] grid place-items-center p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md bg-panel-2 border border-line rounded-xl p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-neutral-100">{title}</h2>
        <div className="mt-2 text-[13px] text-neutral-400 leading-relaxed">{children}</div>
        {error ? <p className="mt-3 text-[13px] text-red-300">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy} autoFocus>
            Cancelar
          </Button>
          <Button variant="danger" onClick={confirm} disabled={busy}>
            {busy ? <Spinner /> : <TrashIcon />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * Dibujito de cómo aparece un gráfico: celular con el video (gris, con una
 * persona) y el gráfico (amarillo). En horizontal, pantalla apaisada.
 */
export const LayoutIcon = ({
  layout,
  split = { position: "top", share: 0.5 },
  horizontal = false,
  className = "w-5 h-8",
}: {
  layout: "overlay" | "fullscreen" | "split" | "pip" | "frame";
  split?: { position: "top" | "bottom"; share: number };
  horizontal?: boolean;
  className?: string;
}) => {
  const W = horizontal ? 34 : 20;
  const H = horizontal ? 20 : 34;
  const inner = { x: 2, y: 2, w: W - 4, h: H - 4 };
  // Zona del gráfico y del video dentro de la pantalla
  let graphic: { x: number; y: number; w: number; h: number } | null = null;
  let video = inner;
  if (layout === "fullscreen") {
    graphic = inner;
    video = { ...inner, w: 0, h: 0 };
  } else if (layout === "pip") {
    // El gráfico ocupa todo y el video va chiquito arriba a la izquierda
    graphic = inner;
    const vw = inner.w * 0.38;
    video = { x: inner.x + 1.5, y: inner.y + 1.5, w: vw, h: vw * (horizontal ? 0.62 : 1.25) };
  } else if (layout === "frame") {
    // El gráfico ocupa todo y el video va enmarcado en el centro
    graphic = inner;
    const vw = inner.w * 0.74;
    const vh = inner.h * (horizontal ? 0.6 : 0.46);
    video = { x: inner.x + (inner.w - vw) / 2, y: inner.y + inner.h * (horizontal ? 0.2 : 0.26), w: vw, h: vh };
  } else if (layout === "split") {
    const first = split.position === "top";
    if (horizontal) {
      const gw = inner.w * split.share;
      graphic = { ...inner, x: first ? inner.x : inner.x + inner.w - gw, w: gw };
      video = { ...inner, x: first ? inner.x + gw : inner.x, w: inner.w - gw };
    } else {
      const gh = inner.h * split.share;
      graphic = { ...inner, y: first ? inner.y : inner.y + inner.h - gh, h: gh };
      video = { ...inner, y: first ? inner.y + gh : inner.y, h: inner.h - gh };
    }
  }
  const head = Math.min(video.w, video.h) * 0.22;
  // En "pip" y "frame" el gráfico ocupa toda la pantalla y el video va ENCIMA.
  const videoArriba = layout === "pip" || layout === "frame";
  const persona =
    video.w > 0 ? (
      <g>
        <rect x={video.x} y={video.y} width={video.w} height={video.h} rx={1.5} fill="#3f3f46" stroke={videoArriba ? "#0b0b0d" : "none"} strokeWidth={videoArriba ? 0.8 : 0} />
        <circle cx={video.x + video.w / 2} cy={video.y + video.h * 0.45} r={head} fill="#a1a1aa" />
        <rect
          x={video.x + video.w / 2 - head * 1.8}
          y={video.y + video.h * 0.45 + head * 1.25}
          width={head * 3.6}
          height={Math.max(0, video.y + video.h - (video.y + video.h * 0.45 + head * 1.25))}
          rx={head}
          fill="#a1a1aa"
        />
      </g>
    ) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden>
      <rect x={0.75} y={0.75} width={W - 1.5} height={H - 1.5} rx={3} fill="#0b0b0d" stroke="currentColor" strokeWidth={1.5} />
      {videoArriba ? null : persona}
      {graphic ? <rect x={graphic.x} y={graphic.y} width={graphic.w} height={graphic.h} rx={1.5} fill="var(--color-accent)" /> : null}
      {videoArriba ? persona : null}
      {layout === "overlay" ? (
        <rect x={inner.x + inner.w * 0.15} y={inner.y + inner.h * 0.14} width={inner.w * 0.7} height={inner.h * 0.16} rx={1.5} fill="var(--color-accent)" />
      ) : null}
    </svg>
  );
};
