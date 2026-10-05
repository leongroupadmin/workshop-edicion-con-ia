"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Chat } from "@/components/Chat";
import { Images } from "@/components/Images";
import { PlanTimeline } from "@/components/PlanTimeline";
import { Preview } from "@/components/Preview";
import { ProjectConfig } from "@/components/ProjectConfig";
import { RenderBar } from "@/components/RenderBar";
import { StatusBar } from "@/components/StatusBar";
import { Button, ConfirmDialog, TrashIcon } from "@/components/ui";
import { api, projectContentsText, useProject } from "@/lib/client";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { state, error, live, refresh } = useProject(id);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  if (error && !state) {
    return (
      <div className="p-10 text-center text-neutral-400">
        {error} · <Link href="/" className="text-accent underline">Volver</Link>
      </div>
    );
  }
  if (!state) return <div className="p-10 text-neutral-500">Cargando proyecto…</div>;

  const busy = Boolean(state.running);
  const retry = async () => {
    setRetryError(null);
    try {
      await api(`/api/projects/${id}/retry`, { method: "POST" });
      void refresh();
    } catch (e) {
      setRetryError((e as Error).message);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 h-11 flex items-center gap-3 border-b border-line">
        <Link href="/" className="text-neutral-500 hover:text-white">
          Proyectos
        </Link>
        <span className="text-neutral-700">/</span>
        <h1 className="font-semibold truncate">{state.meta.title}</h1>
        <span className="text-[11px] text-neutral-600 font-mono truncate">{id}</span>
        <Button variant="ghost" className="ml-auto shrink-0 hover:text-red-300" onClick={() => setConfirmDelete(true)}>
          <TrashIcon />
          Eliminar proyecto
        </Button>
      </div>
      {confirmDelete ? (
        <ConfirmDialog
          title={`¿Eliminar “${state.meta.title}”?`}
          confirmLabel="Eliminar proyecto"
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await api(`/api/projects/${id}`, { method: "DELETE" });
            router.push("/");
          }}
        >
          Se borra el proyecto completo: {projectContentsText(state.versions.length)}.
          <br />
          Va a la <b className="text-neutral-200">Papelera de tu Mac</b>: si te arrepentís, lo recuperás desde ahí.
          {busy ? (
            <span className="block mt-2 text-amber-300">
              Ahora hay un proceso trabajando en este proyecto: detenelo primero desde la barra de estado.
            </span>
          ) : null}
        </ConfirmDialog>
      ) : null}
      <StatusBar id={id} state={state} onRetry={retry} />
      {retryError ? <div className="px-4 py-2 text-red-300 text-[13px]">{retryError}</div> : null}
      <RenderBar id={id} state={state} busy={busy} />

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-3 p-3 overflow-y-auto xl:overflow-hidden">
        <div className="xl:min-h-0 xl:overflow-y-auto flex flex-col gap-3 xl:pr-1 [&>*]:shrink-0">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] gap-3 items-start">
            <Preview id={id} state={state} />
            <ProjectConfig id={id} state={state} />
          </div>
          <Images id={id} />
          <PlanTimeline id={id} state={state} busy={busy} />
          {state.transcriptText ? (
            <details className="bg-panel border border-line rounded-xl">
              <summary className="px-4 py-3 cursor-pointer text-[13px] font-semibold text-neutral-200">
                Transcripción (después del corte)
              </summary>
              <p className="px-4 pb-4 text-neutral-400 leading-relaxed text-[13px]">{state.transcriptText}</p>
            </details>
          ) : null}
        </div>
        <div className="h-[640px] xl:h-auto xl:min-h-0">
          <Chat id={id} state={state} live={live} />
        </div>
      </div>
    </div>
  );
}
