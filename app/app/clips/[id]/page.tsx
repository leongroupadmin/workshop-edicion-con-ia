"use client";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import {
  validateBounds,
  type ClipJob,
  type ClipProposal,
} from "@/lib/clips/types";
const timestamp = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const input =
  "w-full rounded-lg border border-line bg-black/30 px-3 py-2 text-sm outline-none focus:border-accent";
export default function ClipProject({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [job, setJob] = useState<ClipJob | null>(null),
    [clips, setClips] = useState<ClipProposal[]>([]);
  const [activeId, setActiveId] = useState(""),
    [view, setView] = useState<"result" | "source">("result");
  const [running, setRunning] = useState(false),
    [interrupted, setInterrupted] = useState(false),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false),
    [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const dirty = useRef(false),
    player = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let alive = true,
      fetching = false;
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const res = await fetch(`/api/clips/${id}`, { cache: "no-store" }),
          data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (alive) {
          setJob(data.job);
          setRunning(data.running);
          setInterrupted(data.interrupted);
          if (!dirty.current) setClips(data.job.clips);
          setActiveId((previous) =>
            data.job.clips.some((c: ClipProposal) => c.id === previous)
              ? previous
              : data.job.clips.find((c: ClipProposal) => c.file)?.id ||
                data.job.clips[0]?.id ||
                "",
          );
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        fetching = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id]);
  const edit = (clipId: string, patch: Partial<ClipProposal>) => {
    dirty.current = true;
    setHasChanges(true);
    setSaved(false);
    setClips((old) =>
      old.map((c) =>
        c.id === clipId
          ? {
              ...c,
              ...patch,
              ...("startMs" in patch || "endMs" in patch
                ? { file: undefined }
                : {}),
            }
          : c,
      ),
    );
  };
  async function action(name: "save" | "render" | "analyze", only?: string) {
    setSending(true);
    setError("");
    setSaved(false);
    try {
      if (job && name !== "analyze")
        for (const c of clips)
          validateBounds(c.startMs, c.endMs, job.durationMs, job.settings);
      const res = await fetch(`/api/clips/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: name, clips, only }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      dirty.current = false;
      setHasChanges(false);
      if (data.job) {
        setJob(data.job);
        setClips(data.job.clips);
      }
      if (name !== "save") setRunning(true);
      else setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  if (!job)
    return (
      <div className="p-6 text-neutral-400">{error || "Cargando Clips…"}</div>
    );
  const active = clips.find((c) => c.id === activeId),
    index = clips.findIndex((c) => c.id === activeId);
  const previewView = active?.file ? view : "source";
  const fileUrl = (name: string) =>
    `/api/clips/${id}/file/${encodeURIComponent(name)}`;
  const selected = clips.filter((c) => c.selected).length,
    ready = clips.filter((c) => c.file).length;
  const busy = running || sending;
  let invalid = "";
  if (active)
    try {
      validateBounds(
        active.startMs,
        active.endMs,
        job.durationMs,
        job.settings,
      );
    } catch (e) {
      invalid = (e as Error).message;
    }
  const pick = (clip: ClipProposal) => {
    player.current?.pause();
    setActiveId(clip.id);
    setView("result");
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line px-5 py-4 lg:px-7">
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <Link href="/clips" className="hover:text-white">
            ← Todos los videos
          </Link>
          <span>/</span>
          <span>Resultados</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1
              className="truncate text-xl font-semibold tracking-tight"
              title={job.title}
            >
              {job.title}
            </h1>
            <p className="mt-1 text-xs text-neutral-500">
              {clips.length} propuestas · {ready} listas · Vertical 9:16
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-3 py-1 text-xs ${running ? "border-accent/30 bg-accent-soft text-white" : "border-white/10 text-neutral-400"}`}
          >
            {running
              ? "Procesando"
              : job.step === "error" || interrupted
                ? "Revisar"
                : ready
                  ? "Listos para revisar"
                  : "Elegí tus clips"}
          </span>
        </div>
        {running && (
          <div aria-live="polite" className="mt-3 text-xs text-neutral-400">
            <p>{job.message}</p>
            <progress
              className="mt-2 h-1 w-full accent-red-500"
              {...(job.progress !== undefined
                ? { value: job.progress, max: 100 }
                : {})}
            />
          </div>
        )}
        {(error || job.error || interrupted) && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300"
          >
            {error ||
              job.error ||
              "El proceso se interrumpió. Podés reintentarlo."}
          </p>
        )}
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[250px_minmax(0,1fr)_280px] lg:overflow-hidden xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside
          aria-label="Lista de clips"
          className="min-w-0 border-b border-line bg-panel/40 lg:overflow-y-auto lg:border-b-0 lg:border-r"
        >
          <div className="flex items-center justify-between px-4 py-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Tus clips{" "}
              <span className="ml-1 text-neutral-300">{clips.length}</span>
            </h2>
            <button
              disabled={busy || !clips.length}
              className="text-xs text-neutral-400 hover:text-white disabled:opacity-40"
              onClick={() => {
                dirty.current = true;
                setHasChanges(true);
                setSaved(false);
                setClips((cs) =>
                  cs.map((c) => ({
                    ...c,
                    selected: selected !== clips.length,
                  })),
                );
              }}
            >
              {selected === clips.length ? "Quitar selección" : "Elegir todos"}
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto px-3 pb-4 lg:flex-col lg:overflow-x-visible">
            {clips.map((clip, i) => (
              <div
                key={clip.id}
                className={`flex min-w-[220px] items-start gap-3 rounded-xl border p-3 transition lg:min-w-0 ${clip.id === activeId ? "border-accent/40 bg-accent-soft" : "border-transparent hover:border-line hover:bg-white/[.025]"}`}
              >
                <input
                  aria-label={`Seleccionar clip ${i + 1}`}
                  type="checkbox"
                  className="mt-1 accent-red-500"
                  checked={clip.selected}
                  disabled={busy}
                  onChange={(e) =>
                    edit(clip.id, { selected: e.target.checked })
                  }
                />
                <button
                  aria-label={`Ver clip ${i + 1}: ${clip.title}`}
                  aria-pressed={clip.id === activeId}
                  onClick={() => pick(clip)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="mb-2 block text-[10px] uppercase tracking-widest text-neutral-500">
                    Clip {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="line-clamp-2 block text-sm font-medium leading-5">
                    {clip.title}
                  </span>
                  <span className="mt-3 flex items-center gap-2 text-[11px] text-neutral-500">
                    <span>
                      {((clip.endMs - clip.startMs) / 1000).toFixed(1)} s
                    </span>
                    <span>·</span>
                    <span
                      className={
                        clip.file ? "text-emerald-400" : "text-neutral-400"
                      }
                    >
                      {clip.file ? "Listo" : "Sin renderizar"}
                    </span>
                  </span>
                </button>
              </div>
            ))}
          </div>
          {!clips.length && (
            <p className="px-4 pb-6 text-sm text-neutral-500">
              Las propuestas aparecerán acá cuando termine el análisis.
            </p>
          )}
        </aside>
        <section
          aria-label="Vista previa del clip"
          className="flex min-w-0 flex-col bg-black/20 px-5 py-4 lg:overflow-y-auto"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Vista previa</h2>
            <div className="flex rounded-lg border border-line bg-black/30 p-1">
              <button
                aria-pressed={previewView === "result"}
                disabled={!active?.file}
                title={
                  !active?.file ? "Disponible después de renderizar" : undefined
                }
                className={`rounded-md px-3 py-1 text-xs ${previewView === "result" ? "bg-white/10 text-white" : "text-neutral-500"}`}
                onClick={() => {
                  player.current?.pause();
                  setView("result");
                }}
              >
                Resultado
              </button>
              <button
                aria-pressed={previewView === "source"}
                className={`rounded-md px-3 py-1 text-xs ${previewView === "source" ? "bg-white/10 text-white" : "text-neutral-500"}`}
                onClick={() => {
                  player.current?.pause();
                  setView("source");
                }}
              >
                Ver original
              </button>
            </div>
          </div>
          {active ? (
            <>
              <div className="flex flex-1 items-center justify-center py-2">
                {previewView === "result" && active.file ? (
                  <div className="relative aspect-[9/16] h-[min(50dvh,calc(100dvh-390px),620px)] min-h-56 max-w-full overflow-hidden rounded-xl border border-white/10 bg-[#101010] shadow-2xl">
                    <video
                      key={active.file}
                      ref={player}
                      aria-label="Resultado vertical"
                      poster={fileUrl(active.file.replace(/\.mp4$/, ".jpg"))}
                      src={fileUrl(active.file)}
                      controls
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                    <span className="pointer-events-none absolute right-3 top-3 rounded bg-black/60 px-2 py-1 text-[10px] text-white/70">
                      9:16
                    </span>
                  </div>
                ) : (
                  <div className="w-full max-w-2xl">
                    <video
                      key={`${active.id}-${active.startMs}-${active.endMs}`}
                      ref={player}
                      aria-label="Fragmento original"
                      src={fileUrl(job.source)}
                      controls
                      preload="metadata"
                      className="aspect-video w-full rounded-xl bg-black"
                      onLoadedMetadata={() => {
                        if (player.current)
                          player.current.currentTime = active.startMs / 1000;
                      }}
                      onPlay={() => {
                        const video = player.current;
                        if (
                          video &&
                          (video.currentTime < active.startMs / 1000 ||
                            video.currentTime >= active.endMs / 1000)
                        )
                          video.currentTime = active.startMs / 1000;
                      }}
                      onTimeUpdate={() => {
                        if (
                          player.current &&
                          player.current.currentTime >= active.endMs / 1000
                        ) {
                          player.current.pause();
                          player.current.currentTime = active.startMs / 1000;
                        }
                      }}
                    />
                    <p className="mt-3 text-center text-xs text-neutral-500">
                      Original · {timestamp(active.startMs)} a{" "}
                      {timestamp(active.endMs)} · antes del recorte vertical
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <Button
                        disabled={!!invalid}
                        onClick={async () => {
                          const video = player.current;
                          if (!video) return;
                          try {
                            if (
                              video.currentTime < active.startMs / 1000 ||
                              video.currentTime >= active.endMs / 1000
                            )
                              video.currentTime = active.startMs / 1000;
                            await video.play();
                          } catch {
                            setError(
                              "No se pudo reproducir el original. Volvé a intentarlo.",
                            );
                          }
                        }}
                      >
                        Reproducir fragmento
                      </Button>
                      {!active.file && (
                        <Button
                          variant="primary"
                          disabled={busy || !!invalid}
                          onClick={() => action("render", active.id)}
                        >
                          Renderizar este clip
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="mx-auto mt-4 w-full max-w-md text-center">
                <p className="text-[10px] uppercase tracking-widest text-neutral-500">
                  Clip {index + 1} de {clips.length}
                </p>
                <h3 className="mt-2 text-sm font-medium leading-5">
                  {active.title}
                </h3>
              </div>
            </>
          ) : (
            <div className="flex min-h-64 flex-1 items-center justify-center text-sm text-neutral-500">
              Seleccionando las mejores ideas del video…
            </div>
          )}
        </section>
        <aside
          aria-label="Ajustes del clip"
          className="min-w-0 border-t border-line bg-panel/40 p-5 lg:overflow-y-auto lg:border-l lg:border-t-0"
        >
          <h2 className="mb-5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Ajustes del clip
          </h2>
          {active ? (
            <div className="space-y-6">
              <div className="rounded-xl border border-line bg-black/20 p-4">
                <p className="text-xs text-neutral-500">
                  Duración seleccionada
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">
                  {((active.endMs - active.startMs) / 1000).toFixed(1)}
                  <span className="ml-1 text-sm font-normal text-neutral-500">
                    s
                  </span>
                </p>
                <p className="mt-2 text-[11px] text-neutral-500">
                  Permitido: {job.settings.minSeconds}–{job.settings.maxSeconds}{" "}
                  s
                </p>
              </div>
              <fieldset disabled={busy} className="grid grid-cols-2 gap-3">
                <label className="space-y-2 text-xs text-neutral-400">
                  <span>Inicio (s)</span>
                  <input
                    aria-label={`Inicio clip ${index + 1}`}
                    className={input}
                    type="number"
                    min={0}
                    max={job.durationMs / 1000}
                    step={0.1}
                    value={active.startMs / 1000}
                    onChange={(e) =>
                      edit(active.id, {
                        startMs: Math.round(Number(e.target.value) * 1000),
                      })
                    }
                  />
                </label>
                <label className="space-y-2 text-xs text-neutral-400">
                  <span>Final (s)</span>
                  <input
                    aria-label={`Final clip ${index + 1}`}
                    className={input}
                    type="number"
                    min={0}
                    max={job.durationMs / 1000}
                    step={0.1}
                    value={active.endMs / 1000}
                    onChange={(e) =>
                      edit(active.id, {
                        endMs: Math.round(Number(e.target.value) * 1000),
                      })
                    }
                  />
                </label>
              </fieldset>
              {invalid && (
                <p role="alert" className="text-xs text-red-300">
                  {invalid}
                </p>
              )}
              <p className="text-xs leading-5 text-neutral-500">
                Estos tiempos corresponden al original. Cambiarlos requiere
                volver a renderizar el clip.
              </p>
              <details className="border-y border-line py-4">
                <summary className="cursor-pointer text-sm text-neutral-300">
                  Por qué se eligió
                </summary>
                <p className="mt-3 text-xs leading-6 text-neutral-500">
                  {active.reason}
                </p>
              </details>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Formato</span>
                  <span>Vertical · 9:16</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Encuadre</span>
                  <span>Seguimiento estable</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Subtítulos</span>
                  <span>
                    {job.settings.subtitles.style === "none"
                      ? "Desactivados"
                      : "Activados"}
                  </span>
                </div>
              </div>
              {active.warning && (
                <p className="rounded-lg bg-amber-500/10 p-3 text-xs leading-5 text-amber-200">
                  {active.warning}
                </p>
              )}
              {active.file && (
                <a
                  className="block rounded-lg border border-line bg-white/5 px-3 py-2.5 text-center text-sm hover:bg-white/10"
                  href={`${fileUrl(active.file)}?download=1`}
                  download
                >
                  Descargar este clip ↓
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">
              Elegí un clip para ver sus ajustes.
            </p>
          )}
        </aside>
      </div>
      <footer className="z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-panel px-5 py-3 lg:px-7">
        <div>
          <p className="text-sm">
            <strong>{selected}</strong>
            <span className="text-neutral-400">
              {" "}
              de {clips.length} seleccionados
            </span>
          </p>
          <p aria-live="polite" className="mt-1 text-[11px] text-neutral-500">
            {hasChanges
              ? "Cambios sin guardar"
              : saved
                ? "Ajustes guardados"
                : running
                  ? "Procesando en segundo plano"
                  : "Elegí los clips que querés exportar"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg px-3 py-2 text-sm text-neutral-500 hover:text-white">
              Más opciones ···
            </summary>
            <div className="absolute bottom-full right-0 mb-3 w-64 rounded-xl border border-line bg-panel p-3 shadow-xl">
              <p className="mb-3 text-xs leading-5 text-neutral-500">
                Un nuevo análisis reemplaza las propuestas de esta lista. Los
                archivos anteriores se conservan.
              </p>
              <Button disabled={busy} onClick={() => action("analyze")}>
                {clips.length
                  ? "Volver a proponer clips"
                  : "Reintentar análisis"}
              </Button>
            </div>
          </details>
          <Button
            disabled={busy || !hasChanges || !!invalid}
            onClick={() => action("save")}
          >
            Guardar ajustes
          </Button>
          <Button
            variant="primary"
            disabled={busy || !selected || !!invalid}
            onClick={() => action("render")}
          >
            {running ? "Procesando…" : "Renderizar seleccionados"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
