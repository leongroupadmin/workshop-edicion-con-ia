"use client";

import { useEffect, useState } from "react";
import { api, fmtDate, fmtSize, fmtTime } from "@/lib/client";
import type { ProjectState } from "@/lib/types";
import { ConfirmDialog, Panel, TrashIcon } from "./ui";

export const Preview = ({ id, state }: { id: string; state: ProjectState }) => {
  const versions = state.versions;
  const latest = versions.at(-1)?.version ?? null;
  const [selected, setSelected] = useState<number | null>(latest);
  const [compare, setCompare] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<number | null>(null);

  // Al aparecer una versión nueva, mostrarla.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seguir a la última versión
    setSelected(latest);
  }, [latest]);

  // Si la versión elegida se borró, mostrar la última.
  const current = versions.find((v) => v.version === selected) ?? versions.at(-1) ?? null;
  const other = versions.find((v) => v.version === compare) ?? null;
  const fallback = !current && state.cut ? "cut.mp4" : null;
  const src = current
    ? `/api/projects/${id}/file/${current.file}?v=${current.createdAt}`
    : fallback
      ? `/api/projects/${id}/file/cut.mp4`
      : null;

  const portrait = state.settings.format === "vertical";

  return (
    <Panel
      title="Preview"
      right={
        current ? (
          <a
            href={`/api/projects/${id}/file/${current.file}?download=1`}
            className="text-[12px] px-2.5 py-1 rounded-md bg-accent text-white font-medium hover:bg-accent-hover"
          >
            ⬇ Descargar v{current.version}
          </a>
        ) : null
      }
      bodyClassName="p-3 flex flex-col gap-3"
    >
      {versions.length ? (
        <div className="flex flex-wrap gap-1">
          {versions.map((v) => (
            <button
              key={v.version}
              onClick={() => setSelected(v.version)}
              className={`px-2.5 py-1 rounded-md text-[12px] border ${
                v.version === current?.version
                  ? "bg-accent text-white border-accent font-medium"
                  : "border-line text-neutral-300 hover:bg-white/5"
              }`}
              title={v.note}
            >
              v{v.version}
            </button>
          ))}
          {versions.length > 1 ? (
            <select
              value={compare ?? ""}
              onChange={(e) => setCompare(e.target.value ? Number(e.target.value) : null)}
              className="ml-auto bg-panel-2 border border-line rounded-md text-[12px] px-2"
            >
              <option value="">Comparar con…</option>
              {versions
                .filter((v) => v.version !== current?.version)
                .map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version}
                  </option>
                ))}
            </select>
          ) : null}
        </div>
      ) : null}

      <div className={`grid gap-2 ${other ? "grid-cols-2" : "grid-cols-1"}`}>
        {[current ? { label: `v${current.version}`, src } : { label: fallback ? "Video cortado (sin edición)" : "", src }, other ? { label: `v${other.version}`, src: `/api/projects/${id}/file/${other.file}?v=${other.createdAt}` } : null]
          .filter(Boolean)
          .map((item, i) => (
            <div key={i} className="flex flex-col gap-1">
              {other ? <div className="text-[11px] text-neutral-400">{item!.label}</div> : null}
              <div
                style={{ maxWidth: portrait ? "calc(62vh * 9 / 16)" : state.settings.format === "square" ? "62vh" : undefined }}
                className={`bg-black rounded-lg overflow-hidden mx-auto w-full ${
                  portrait ? "aspect-[9/16] max-h-[62vh]" : state.settings.format === "square" ? "aspect-square max-h-[62vh]" : "aspect-video"
                }`}
              >
                {item!.src ? (
                  <video key={item!.src} src={item!.src} controls playsInline className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-neutral-600 text-sm p-6 text-center">
                    Todavía no hay video para mostrar.
                  </div>
                )}
              </div>
            </div>
          ))}
      </div>

      {current ? (
        <div className="text-[12px] text-neutral-400 leading-relaxed">
          <div className="flex items-start gap-2">
            <span className="flex-1">
              <span className="text-neutral-200">v{current.version}</span> · {fmtDate(current.createdAt)} · {fmtSize(current.sizeBytes)}
              {current.durationMs ? ` · ${fmtTime(current.durationMs)}` : ""}
            </span>
            <button
              onClick={() => setToDelete(current.version)}
              className="shrink-0 inline-flex items-center gap-1 text-neutral-500 hover:text-red-300"
            >
              <TrashIcon className="w-3 h-3" />
              Eliminar v{current.version}
            </button>
          </div>
          {current.note ? <div className="text-neutral-300 mt-0.5">“{current.note}”</div> : null}
        </div>
      ) : state.cut ? (
        <div className="text-[12px] text-neutral-400">
          Corte: {fmtTime(state.cut.sourceMs)} → {fmtTime(state.cut.cutMs)} · {state.cut.silences} silencios ·{" "}
          {state.cut.fillers} muletillas · {state.cut.retakes} tomas repetidas
        </div>
      ) : null}
      {toDelete !== null ? (
        <ConfirmDialog
          title={`¿Eliminar la versión v${toDelete}?`}
          confirmLabel={`Eliminar v${toDelete}`}
          onClose={() => setToDelete(null)}
          onConfirm={async () => {
            await api(`/api/projects/${id}/versions/${toDelete}`, { method: "DELETE" });
            if (compare === toDelete) setCompare(null);
            setToDelete(null);
          }}
        >
          Se borra solo este video. Las otras versiones y el proyecto quedan igual, y la próxima versión
          no reutiliza el número v{toDelete}.
          <br />
          Va a la <b className="text-neutral-200">Papelera de tu Mac</b>: si te arrepentís, lo recuperás desde ahí.
        </ConfirmDialog>
      ) : null}
    </Panel>
  );
};
