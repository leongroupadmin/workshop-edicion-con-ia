"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner, TrashIcon } from "@/components/ui";
import { api } from "@/lib/client";

type Note = { id: string; text: string; createdAt: string };

const fecha = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
};

/** Alto justo para el texto, sin barra de scroll propia. */
const filas = (text: string) => Math.min(14, Math.max(2, text.split("\n").length + 1));

/**
 * "Recomendaciones" del menú de arriba: se abre como desplegable en la misma
 * ventana (no es otra pantalla). Son anotaciones fijas que valen para todos
 * los videos; se guardan solas, como el resto del panel.
 */
export const Recomendaciones = () => {
  const [abierto, setAbierto] = useState(false);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [nueva, setNueva] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const nuevaRef = useRef<HTMLTextAreaElement>(null);

  // Cerrar al tocar afuera o con Escape
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const cargar = async () => {
    try {
      const r = await api<{ notes: Note[] }>("/api/recomendaciones");
      setNotes(r.notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude leer las recomendaciones.");
    }
  };

  const abrir = () => {
    const ahora = !abierto;
    setAbierto(ahora);
    if (ahora && notes === null) void cargar();
  };

  const llamar = async (init: RequestInit, url = "/api/recomendaciones") => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ notes: Note[] }>(url, init);
      setNotes(r.notes);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const agregar = async () => {
    if (!nueva.trim() || busy) return;
    const ok = await llamar({ method: "POST", body: JSON.stringify({ text: nueva }) });
    if (ok) setNueva("");
  };

  const guardar = async (id: string, text: string) => {
    const previa = notes?.find((n) => n.id === id);
    if (!previa || previa.text === text.trim() || !text.trim()) {
      // Sin cambios (o quedó vacía): volver a lo guardado
      setNotes((ns) => (ns ? [...ns] : ns));
      return;
    }
    await llamar({ method: "POST", body: JSON.stringify({ id, text }) });
  };

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={abrir}
        aria-expanded={abierto}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition ${
          abierto
            ? "border-accent/40 bg-accent-soft text-white"
            : "border-transparent text-neutral-400 hover:bg-white/[0.06] hover:text-white"
        }`}
      >
        Recomendaciones
        {notes?.length ? (
          <span className="rounded-full bg-white/10 px-1.5 text-[11px] leading-[18px] text-neutral-300">
            {notes.length}
          </span>
        ) : null}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {abierto ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[460px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-panel shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]">
          <div className="border-b border-line px-3 py-2.5">
            <p className="text-[13px] font-semibold text-neutral-100">Recomendaciones</p>
            <p className="text-[11px] text-neutral-500">
              Anotaciones fijas que valen para todos los videos. Se guardan solas.
            </p>
          </div>

          <div className="max-h-[min(60vh,480px)] overflow-y-auto">
            <div className="border-b border-line p-3">
              <textarea
                ref={nuevaRef}
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void agregar();
                  }
                }}
                rows={filas(nueva)}
                placeholder="Escribí una recomendación nueva…"
                className="w-full resize-none rounded-lg border border-line bg-black/30 px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-neutral-600 focus:border-accent/60"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-neutral-600">⌘ + Enter para agregar</span>
                <button
                  type="button"
                  onClick={() => void agregar()}
                  disabled={busy || !nueva.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-accent-hover disabled:opacity-40"
                >
                  {busy ? <Spinner /> : null}
                  Agregar
                </button>
              </div>
            </div>

            {notes === null ? (
              <p className="flex items-center gap-2 p-3 text-[13px] text-neutral-500">
                <Spinner /> Cargando…
              </p>
            ) : notes.length === 0 ? (
              <p className="p-3 text-[13px] text-neutral-500">
                Todavía no hay ninguna. Escribí la primera arriba: la voy a tener en cuenta en todos
                los videos hasta que la cambies.
              </p>
            ) : (
              <ul className="flex flex-col">
                {notes.map((n) => (
                  <li key={n.id} className="group border-b border-line/60 px-3 py-2.5 last:border-b-0">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-neutral-600">{fecha(n.createdAt)}</span>
                      <button
                        type="button"
                        aria-label="Eliminar recomendación"
                        disabled={busy}
                        onClick={() =>
                          void llamar({ method: "DELETE" }, `/api/recomendaciones?id=${encodeURIComponent(n.id)}`)
                        }
                        className="shrink-0 text-neutral-600 opacity-0 transition hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    <textarea
                      defaultValue={n.text}
                      rows={filas(n.text)}
                      onBlur={(e) => void guardar(n.id, e.target.value)}
                      className="w-full resize-none rounded-lg border border-transparent bg-transparent px-2 py-1 text-[13px] leading-relaxed text-neutral-200 outline-none transition hover:border-line focus:border-accent/60 focus:bg-black/30"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error ? <p className="border-t border-line px-3 py-2 text-[12px] text-red-300">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
};
