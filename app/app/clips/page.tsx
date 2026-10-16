"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Panel } from "@/components/ui";
import {
  CLIP_DEFAULTS,
  validateSettings,
  type ClipSettings,
  type ClipJob,
} from "@/lib/clips/types";
const input =
  "w-full rounded-lg border border-line bg-black/30 px-3 py-2 text-sm outline-none focus:border-accent";
const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="flex flex-col gap-2 text-xs text-neutral-400">
    {label}
    {children}
  </label>
);
export default function ClipsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<ClipSettings>(CLIP_DEFAULTS);
  const [brands, setBrands] = useState<{ slug: string; name: string }[]>([]);
  const [music, setMusic] = useState<string[]>([]);
  const [jobs, setJobs] = useState<ClipJob[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [tracking, setTracking] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [remember, setRemember] = useState(true);
  const picker = useRef<HTMLInputElement>(null);
  const request = useRef<XMLHttpRequest | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/brands").then((r) => r.json()),
      fetch("/api/clips").then((r) => r.json()),
      fetch("/api/music").then((r) => r.json()),
    ])
      .then(([b, c, m]) => {
        if (!alive) return;
        setBrands(b.brands || []);
        setJobs(c.jobs || []);
        setTracking(!!c.capabilities?.tracking);
        setMusic(
          (m.tracks || []).filter((f: string) =>
            /^[\w .-]+\.(mp3|wav|m4a)$/i.test(f),
          ),
        );
        const saved = localStorage.getItem("clipo-clips-settings-v2");
        if (saved) {
          try {
            const s = validateSettings(JSON.parse(saved));
            setSettings({
              ...s,
              brand: b.brands.some((x: { slug: string }) => x.slug === s.brand)
                ? s.brand
                : b.brands[0]?.slug || "",
            });
            return;
          } catch {}
        }
        setSettings((s) => ({ ...s, brand: b.brands[0]?.slug || "" }));
      })
      .catch(
        () =>
          alive &&
          setError("No se pudo cargar la configuración. Recargá la página."),
      );
    return () => {
      alive = false;
      request.current?.abort();
    };
  }, []);
  const change = <K extends keyof ClipSettings>(
    key: K,
    value: ClipSettings[K],
  ) => setSettings((s) => ({ ...s, [key]: value }));
  const captions = (patch: Partial<ClipSettings["subtitles"]>) =>
    setSettings((s) => ({ ...s, subtitles: { ...s.subtitles, ...patch } }));
  async function remove(job: ClipJob) {
    if (
      !window.confirm(
        `¿Eliminar “${job.title}”? Se borrarán el video subido, sus propuestas y todos sus clips renderizados. Esta acción no se puede deshacer.`,
      )
    )
      return;
    setDeleting(job.id);
    setDeleteError("");
    try {
      const response = await fetch(`/api/clips/${job.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "No se pudo eliminar el video.");
      setJobs((previous) => previous.filter((j) => j.id !== job.id));
    } catch (error) {
      setDeleteError((error as Error).message);
    } finally {
      setDeleting(null);
    }
  }
  async function start() {
    if (!file) return;
    setError("");
    try {
      validateSettings(settings);
      const url = URL.createObjectURL(file);
      try {
        const duration = await new Promise<number>((resolve, reject) => {
          const v = document.createElement("video");
          v.preload = "metadata";
          v.onloadedmetadata = () => resolve(v.duration);
          v.onerror = () => reject(new Error("No se pudo leer el video."));
          v.src = url;
        });
        if (!Number.isFinite(duration) || duration > 900)
          throw new Error("El video debe durar como máximo 15 minutos.");
        if (duration < settings.minSeconds)
          throw new Error("El video dura menos que el mínimo elegido.");
      } finally {
        URL.revokeObjectURL(url);
      }
      if (remember)
        localStorage.setItem(
          "clipo-clips-settings-v2",
          JSON.stringify(settings),
        );
      const xhr = new XMLHttpRequest();
      request.current = xhr;
      xhr.open("POST", "/api/clips");
      xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));
      xhr.setRequestHeader(
        "x-settings",
        encodeURIComponent(JSON.stringify(settings)),
      );
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          setUpload(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 400)
            throw new Error(data.error || "Falló la subida.");
          router.push(`/clips/${data.id}`);
        } catch (e) {
          setError((e as Error).message);
          setUpload(null);
        }
      };
      xhr.onerror = () => {
        setError("Se interrumpió la conexión. Reintentá la subida.");
        setUpload(null);
      };
      setUpload(0);
      xhr.send(file);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="mx-auto w-full max-w-6xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clips</h1>
          <p className="mt-2 text-neutral-400">
            De un video largo a ideas que se entienden solas.
          </p>
        </div>
        <span className="rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs">
          Vertical 9:16 · hasta 90 s
        </span>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300"
        >
          {error}
        </p>
      )}
      {tracking === false && (
        <p
          role="alert"
          className="rounded-lg bg-amber-500/10 p-3 text-amber-200"
        >
          Falta preparar el seguimiento de caras. Ejecutá{" "}
          <code>bash scripts/clips/setup.sh</code> para habilitar las subidas.
        </p>
      )}
      <fieldset
        disabled={upload !== null}
        className="grid gap-5 lg:grid-cols-[1.4fr_1fr] disabled:opacity-70"
      >
        <Panel title="1. Configurá tus clips">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Marca">
              <select
                aria-label="Marca"
                className={input}
                value={settings.brand}
                onChange={(e) => change("brand", e.target.value)}
              >
                <option value="">Elegí una marca</option>
                {brands.map((b) => (
                  <option key={b.slug} value={b.slug}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="IA para seleccionar fragmentos">
              <select
                className={input}
                value={settings.aiProvider}
                onChange={(e) =>
                  change(
                    "aiProvider",
                    e.target.value as ClipSettings["aiProvider"],
                  )
                }
              >
                <option value="anthropic">Claude</option>
                <option value="openai">OpenAI</option>
              </select>
            </Field>
            <Field label="Cantidad objetivo">
              <select
                className={input}
                value={settings.count}
                onChange={(e) => change("count", Number(e.target.value))}
              >
                <option value={0}>Automática</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} clips
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Qué momentos buscar">
              <select
                className={input}
                value={settings.criterion}
                onChange={(e) =>
                  change(
                    "criterion",
                    e.target.value as ClipSettings["criterion"],
                  )
                }
              >
                <option value="auto">Lo decide la IA</option>
                <option value="education">Consejos y aprendizajes</option>
                <option value="highlights">Momentos fuertes</option>
                <option value="qa">Preguntas y respuestas</option>
              </select>
            </Field>
            <Field label="Duración mínima (segundos)">
              <input
                className={input}
                type="number"
                min={5}
                max={90}
                value={settings.minSeconds}
                onChange={(e) => change("minSeconds", Number(e.target.value))}
              />
            </Field>
            <Field label="Duración máxima (segundos)">
              <input
                className={input}
                type="number"
                min={5}
                max={90}
                value={settings.maxSeconds}
                onChange={(e) => change("maxSeconds", Number(e.target.value))}
              />
            </Field>
            <Field label="Ritmo de corte">
              <select
                className={input}
                value={settings.cut}
                onChange={(e) =>
                  change("cut", e.target.value as ClipSettings["cut"])
                }
              >
                <option value="soft">Suave</option>
                <option value="normal">Normal</option>
                <option value="aggressive">Ágil</option>
              </select>
            </Field>
            <Field label="Subtítulos">
              <select
                className={input}
                value={settings.subtitles.style}
                onChange={(e) =>
                  captions({
                    style: e.target.value as ClipSettings["subtitles"]["style"],
                  })
                }
              >
                <option value="karaoke">Palabra destacada</option>
                <option value="minimal">Minimal</option>
                <option value="simple">Simple</option>
                <option value="pop">Pop</option>
                <option value="none">Sin subtítulos</option>
              </select>
            </Field>
            <Field label="Tamaño del subtítulo">
              <input
                className={input}
                type="number"
                min={30}
                max={100}
                value={settings.subtitles.size}
                onChange={(e) => captions({ size: Number(e.target.value) })}
              />
            </Field>
            <Field label="Posición del subtítulo">
              <select
                className={input}
                value={settings.subtitles.position}
                onChange={(e) =>
                  captions({
                    position: e.target
                      .value as ClipSettings["subtitles"]["position"],
                  })
                }
              >
                <option value="bottom">Abajo</option>
                <option value="middle">Centro</option>
                <option value="top">Arriba</option>
              </select>
            </Field>
            <Field label="Música de fondo">
              <select
                className={input}
                value={settings.music}
                onChange={(e) => change("music", e.target.value)}
              >
                <option value="">Sin música</option>
                {music.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={`Volumen de música · ${Math.round(settings.musicVolume * 100)}%`}
            >
              <input
                type="range"
                min={0}
                max={0.3}
                step={0.01}
                value={settings.musicVolume}
                onChange={(e) => change("musicVolume", Number(e.target.value))}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.zoom}
                onChange={(e) => change("zoom", e.target.checked)}
              />
              Acercamiento suave al hablante
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.subtitles.uppercase}
                onChange={(e) => captions({ uppercase: e.target.checked })}
              />
              Subtítulos en mayúsculas
            </label>
            <div className="sm:col-span-2">
              <Field label="Indicaciones para la IA">
                <textarea
                  className={input}
                  rows={3}
                  maxLength={4000}
                  value={settings.instructions}
                  onChange={(e) => change("instructions", e.target.value)}
                  placeholder="Por ejemplo: priorizá consejos prácticos sobre ventas."
                />
              </Field>
            </div>
          </div>
        </Panel>
        <div className="space-y-5">
          <Panel title="2. Subí el video">
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => picker.current?.click()}
                className="w-full rounded-xl border border-dashed border-white/20 bg-white/[.02] px-5 py-12 text-center hover:border-accent/60"
              >
                <span className="block text-lg font-medium">
                  {file ? file.name : "Elegir video"}
                </span>
                <span className="mt-2 block text-xs text-neutral-500">
                  Hasta 15 minutos · MP4, MOV, WEBM o MKV
                </span>
              </button>
              <input
                ref={picker}
                type="file"
                accept="video/*,.mkv"
                aria-label="Video original"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <label className="flex gap-2 text-sm text-neutral-400">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Recordar estos ajustes para Clips
              </label>
              <Button
                variant="primary"
                className="w-full py-3"
                disabled={
                  !file ||
                  !settings.brand ||
                  tracking !== true ||
                  upload !== null
                }
                onClick={start}
              >
                {upload === null
                  ? "Analizar y proponer clips"
                  : upload < 100
                    ? `Subiendo ${upload}%…`
                    : "Validando el video…"}
              </Button>
              {upload !== null && (
                <progress
                  className="w-full accent-red-500"
                  value={upload}
                  max={100}
                />
              )}
              {!brands.length && (
                <Link href="/marca" className="block text-sm text-accent">
                  Guardá una marca para empezar →
                </Link>
              )}
            </div>
          </Panel>
          <Panel title="El encuadre sigue la conversación">
            <div className="space-y-3 text-sm text-neutral-400">
              <p>
                Seguimiento de caras y detección de quién habla, siempre en
                vertical.
              </p>
              <p>
                Cuando hay varias voces o la detección es incierta, se mantiene
                un encuadre vertical estable. Dos hablantes pueden mostrarse
                apilados.
              </p>
              <p>
                Primero revisás la selección. Después se generan los clips con
                cortes y subtítulos, sin motion graphics.
              </p>
            </div>
          </Panel>
        </div>
      </fieldset>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Tus videos en Clips</h2>
        {deleteError && (
          <p role="alert" className="text-sm text-red-300">
            {deleteError}
          </p>
        )}
        {!jobs.length ? (
          <p className="text-sm text-neutral-500">
            Todavía no subiste videos a este flujo.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((j) => (
              <article
                key={j.id}
                className="rounded-xl border border-line bg-panel p-4 hover:border-white/25"
              >
                <Link href={`/clips/${j.id}`} className="block">
                  <h3 className="truncate font-medium">{j.title}</h3>
                  <p className="mt-2 text-xs text-neutral-500">
                    {Math.round(j.durationMs / 1000)} s de origen ·{" "}
                    {j.clips.length} propuestas
                  </p>
                  <p className="mt-3 text-sm text-neutral-400">{j.message}</p>
                </Link>
                <div className="mt-4 flex justify-end border-t border-line pt-3">
                  <Button
                    variant="danger"
                    aria-label={`Eliminar video: ${j.title}`}
                    disabled={deleting !== null}
                    onClick={() => remove(j)}
                  >
                    {deleting === j.id ? "Eliminando…" : "Eliminar"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
