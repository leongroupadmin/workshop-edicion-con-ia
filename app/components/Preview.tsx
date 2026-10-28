"use client";

import { useEffect, useState } from "react";
import { api, fmtDate, fmtSize, fmtTime } from "@/lib/client";
import { setPlayhead, setSeeker } from "@/lib/playhead";
import type { ProjectState } from "@/lib/types";
import { ConfirmDialog, Panel, TrashIcon } from "./ui";

/** Alto del video vertical o cuadrado: el mismo que tenía antes (62% de la pantalla, hasta 640 px). */
const VIDEO_H = "min(62vh, 640px)";

export const Preview = ({ id, state }: { id: string; state: ProjectState }) => {
  const versions = state.versions;
  const latest = versions.at(-1)?.version ?? null;
  const [selected, setSelected] = useState<number | null>(latest);
  const [compare, setCompare] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<number | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);

  // El marcador de la línea de tiempo sigue a este video (el principal, no el de comparar).
  useEffect(() => {
    if (!video) return;
    let raf = 0;
    const sync = () => setPlayhead({ id, ms: video.currentTime * 1000 });
    // Mientras se reproduce, en cada cuadro: timeupdate solo avisa ~4 veces por segundo.
    const loop = () => {
      sync();
      raf = requestAnimationFrame(loop);
    };
    const play = () => {
      cancelAnimationFrame(raf);
      loop();
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      sync();
    };
    video.addEventListener("play", play);
    video.addEventListener("pause", stop);
    video.addEventListener("ended", stop);
    video.addEventListener("seeked", sync);
    video.addEventListener("loadedmetadata", sync);
    // Respaldo: si el navegador frena las animaciones (pestaña oculta), igual avanza.
    video.addEventListener("timeupdate", sync);
    setSeeker((ms) => {
      video.currentTime = ms / 1000;
    });
    sync();
    if (!video.paused) play();
    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener("play", play);
      video.removeEventListener("pause", stop);
      video.removeEventListener("ended", stop);
      video.removeEventListener("seeked", sync);
      video.removeEventListener("loadedmetadata", sync);
      video.removeEventListener("timeupdate", sync);
      setSeeker(null);
      setPlayhead(null);
    };
  }, [video, id]);

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
  // Vertical o cuadrado: versiones y datos al costado del video, así ocupa menos alto.
  const side = !other && state.settings.format !== "horizontal";

  const bar = versions.length ? (
    <div className="flex flex-wrap gap-1">
      {versions.map((v) => (
        <button
          key={v.version}
          onClick={() => setSelected(v.version)}
          className={`px-2.5 py-1 rounded-md text-[12px] border ${
            v.version === current?.version
              ? "bg-accent text-on-accent border-accent font-medium"
              : "border-line text-fg-2 hover:bg-fg/5"
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
  ) : null;

  const info = current ? (
    <div className="text-[12px] text-muted leading-relaxed">
      <div className="flex items-start gap-2">
        <span className="flex-1">
          <span className="text-fg">v{current.version}</span> · {fmtDate(current.createdAt)} · {fmtSize(current.sizeBytes)}
          {current.durationMs ? ` · ${fmtTime(current.durationMs)}` : ""}
        </span>
        <button
          onClick={() => setToDelete(current.version)}
          className="shrink-0 inline-flex items-center gap-1 text-muted hover:text-red-700"
        >
          <TrashIcon className="w-3 h-3" />
          Eliminar v{current.version}
        </button>
      </div>
      {current.note ? <div className="text-fg-2 mt-0.5">“{current.note}”</div> : null}
    </div>
  ) : state.cut ? (
    <div className="text-[12px] text-muted">
      Corte: {fmtTime(state.cut.sourceMs)} → {fmtTime(state.cut.cutMs)} · {state.cut.silences} silencios ·{" "}
      {state.cut.fillers} muletillas · {state.cut.retakes} tomas repetidas
    </div>
  ) : null;

  return (
    <Panel
      title="Preview"
      right={
        current ? (
          <a
            href={`/api/projects/${id}/file/${current.file}?download=1`}
            className="text-[12px] px-2.5 py-1 rounded-md bg-accent text-on-accent font-medium hover:bg-accent-hover"
          >
            ⬇ Descargar v{current.version}
          </a>
        ) : null
      }
      bodyClassName={`p-3 flex gap-3 ${side ? "flex-col sm:flex-row sm:items-start" : "flex-col"}`}
    >
      {side ? null : bar}
      <div
        className={`grid gap-2 ${other ? "grid-cols-2" : "grid-cols-1"} ${side ? "shrink-0" : ""}`}
        style={side ? { width: portrait ? `calc(${VIDEO_H} * 9 / 16)` : VIDEO_H } : undefined}
      >
        {[current ? { label: `v${current.version}`, src } : { label: fallback ? "Video cortado (sin edición)" : "", src }, other ? { label: `v${other.version}`, src: `/api/projects/${id}/file/${other.file}?v=${other.createdAt}` } : null]
          .filter(Boolean)
          .map((item, i) => (
            <div key={i} className="flex flex-col gap-1">
              {other ? <div className="text-[11px] text-muted">{item!.label}</div> : null}
              <div
                style={{ maxWidth: portrait ? "calc(62vh * 9 / 16)" : state.settings.format === "square" ? "62vh" : undefined }}
                className={`bg-black rounded-lg overflow-hidden mx-auto w-full ${
                  portrait ? "aspect-[9/16] max-h-[62vh]" : state.settings.format === "square" ? "aspect-square max-h-[62vh]" : "aspect-video"
                }`}
              >
                {item!.src ? (
                  <video
                    key={item!.src}
                    ref={i === 0 ? setVideo : undefined}
                    src={item!.src}
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-faint text-sm p-6 text-center">
                    Todavía no hay video para mostrar.
                  </div>
                )}
              </div>
            </div>
          ))}
      </div>

      {side ? (
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {bar}
          {info}
        </div>
      ) : (
        info
      )}
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
          Va a la <b className="text-fg">Papelera de tu computadora</b>: si te arrepentís, lo recuperás desde ahí.
        </ConfirmDialog>
      ) : null}
    </Panel>
  );
};
