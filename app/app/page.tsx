"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConfirmDialog, StepBadge, TrashIcon } from "@/components/ui";
import { api, fmtDate, projectContentsText } from "@/lib/client";
import type { ProjectSummary } from "@/lib/types";

export default function Home() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<ProjectSummary[]>("/api/projects")
        .then((p) => alive && (setProjects(p), setError(null)))
        .catch((e) => alive && setError(e.message));
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proyectos de edición</h1>
          <p className="text-neutral-400 mt-1">Cada video que subís se transcribe, se corta y Claude te propone un plan de edición.</p>
        </div>
        <Link href="/nuevo" className="px-4 py-2 rounded-lg bg-accent text-on-accent font-medium hover:bg-accent-hover shadow-[0_8px_24px_-12px_var(--color-accent)]">
          + Nuevo video
        </Link>
      </div>

      {error ? <p className="text-red-300 mb-4">{error}</p> : null}

      {projects === null ? (
        <p className="text-neutral-500">Cargando…</p>
      ) : projects.length === 0 ? (
        <Link
          href="/nuevo"
          className="block border border-dashed border-line rounded-xl p-16 text-center text-neutral-400 transition hover:border-accent/60 hover:text-white"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- ícono local, sin optimizar */}
          <img src="/editor-lg-icono.svg" alt="" className="mx-auto mb-6 block h-20 w-20" />
          Todavía no hay proyectos. <span className="text-accent">Subí tu primer video →</span>
        </Link>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="group relative bg-panel border border-line rounded-xl overflow-hidden transition hover:border-accent/50 hover:shadow-[0_14px_36px_-20px_rgba(0,0,0,0.95)]"
            >
              <Link href={`/p/${p.id}`} className="block">
                <div className="aspect-[9/12] bg-black/60 relative overflow-hidden">
                  {p.hasThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/projects/${p.id}/file/thumb.jpg?t=${encodeURIComponent(p.status.updatedAt)}`}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition"
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-neutral-600 text-xs">sin miniatura</div>
                  )}
                  <div className="absolute top-2 left-2">
                    <StepBadge step={p.status.step} />
                  </div>
                  {p.versions ? (
                    <span className="absolute bottom-2 right-2 text-[11px] bg-black/70 rounded px-1.5 py-0.5">
                      {p.versions} versión{p.versions > 1 ? "es" : ""}
                    </span>
                  ) : null}
                </div>
                <div className="p-3">
                  <div className="font-medium truncate">{p.title}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{fmtDate(p.createdAt)}</div>
                </div>
              </Link>
              <button
                onClick={() => setToDelete(p)}
                title="Eliminar proyecto"
                aria-label={`Eliminar ${p.title}`}
                className="absolute top-2 right-2 p-1.5 rounded-md bg-black/70 text-neutral-300 hover:text-red-300 hover:bg-black/90 transition"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}

      {toDelete ? (
        <ConfirmDialog
          title={`¿Eliminar “${toDelete.title}”?`}
          confirmLabel="Eliminar proyecto"
          onClose={() => setToDelete(null)}
          onConfirm={async () => {
            await api(`/api/projects/${toDelete.id}`, { method: "DELETE" });
            setProjects((list) => list?.filter((x) => x.id !== toDelete.id) ?? null);
            setToDelete(null);
          }}
        >
          Se borra el proyecto completo: {projectContentsText(toDelete.versions)}.
          <br />
          Va a la <b className="text-neutral-200">Papelera de tu Mac</b>: si te arrepentís, lo recuperás desde ahí.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
