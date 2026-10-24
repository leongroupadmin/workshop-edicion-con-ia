"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { CaptionTypographyFields } from "@/components/CaptionTypographyFields";
import { EditingPresets } from "@/components/EditingPresets";
import { InstructionsField } from "@/components/InstructionsField";
import { StyleFields } from "@/components/StyleFields";
import { Button, Row, Seg, Spinner } from "@/components/ui";
import { api, uploadFile } from "@/lib/client";
import type { ClonJob } from "@/lib/clon/types";
import type { Brand, Settings } from "@/lib/types";

export default function NewVideo({ searchParams }: { searchParams: Promise<{ clon?: string | string[] }> }) {
  const router = useRouter();
  // Viene de "Pasar a edición" de un clon: el video ya está, no se sube.
  const parametro = use(searchParams).clon;
  const clonId = typeof parametro === "string" ? parametro : null;
  const [clon, setClon] = useState<ClonJob | null>(null);
  const [creando, setCreando] = useState(false);
  // Clon + B-roll: la edición solo pone subtítulos (el resto lo apaga el servidor).
  const soloSubtitulos = clon?.modo === "broll";
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cómo querés la edición: arranca con tus ajustes guardados
  const [settings, setSettings] = useState<Settings | null>(null);
  const [brands, setBrands] = useState<(Brand & { slug: string })[] | null>(null);
  const [brandSlug, setBrandSlug] = useState("");
  const uploading = useRef(false);
  const canUpload = Boolean(settings && brands?.some((brand) => brand.slug === brandSlug) && progress === null);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    api<{ brands: (Brand & { slug: string })[] }>("/api/brands")
      .then((result) => setBrands(result.brands))
      .catch((e) => setError((e as Error).message));
    Promise.all([api<Settings>("/api/defaults"), clonId ? api<{ job: ClonJob }>(`/api/clon/${clonId}`) : null])
      .then(([defaults, c]) => {
        if (!c) return setSettings(defaults);
        setClon(c.job);
        // Propone el formato del clon y corte suave (no tiene silencios ni muletillas); se puede cambiar.
        setSettings({
          ...defaults,
          format: c.job.settings.formato,
          style: { ...defaults.style, cut: "soft" },
          // Con B-roll los subtítulos van al medio, sobre la unión de las dos mitades.
          subtitles: c.job.modo === "broll" ? { ...defaults.subtitles, position: "middle" } : defaults.subtitles,
        });
      })
      .catch((e) => setError((e as Error).message));
  }, [clonId]);

  const start = async (f: File) => {
    if (!settings || !canUpload || uploading.current) return;
    uploading.current = true;
    setFile(f);
    setError(null);
    setProgress(0);
    const { aiProvider, format, subtitles, style, instructions } = settings;
    try {
      const res = await uploadFile("/api/projects", f, setProgress, {
        "x-settings": encodeURIComponent(JSON.stringify({ aiProvider, format, subtitles, style, instructions })),
        "x-brand": brandSlug,
        "x-remember": remember ? "1" : "0",
      });
      router.push(`/p/${res.id as string}`);
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
      uploading.current = false;
    }
  };

  /** Crea el proyecto con el video del clon y estos ajustes (sin subir nada). */
  const crearDesdeClon = async () => {
    if (!settings || !clonId || !brandSlug) return;
    setCreando(true);
    setError(null);
    const { aiProvider, format, subtitles, style, instructions } = settings;
    try {
      const r = await api<{ proyectoId: string }>(`/api/clon/${clonId}/edicion`, {
        method: "POST",
        body: JSON.stringify({ brand: brandSlug, settings: { aiProvider, format, subtitles, style, instructions } }),
      });
      router.push(`/p/${r.proyectoId}`);
    } catch (e) {
      setError((e as Error).message);
      setCreando(false);
    }
  };

  return (
    <div className="max-w-4xl w-full mx-auto px-6 py-10 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{clonId ? "Pasar el clon a edición" : "Nuevo video"}</h1>
        <p className="text-neutral-400 mt-1">
          {soloSubtitulos
            ? "Este clon tiene B-roll: la edición solo le pone los subtítulos, al medio, entre las dos mitades. Sin gráficos, zooms, transiciones ni música. Elegí la marca y cómo querés los subtítulos."
            : clonId
            ? "Elegí la marca y cómo querés la edición, igual que con cualquier video. Cuando confirmes se transcribe, se corta y Claude arma el plan con este estilo."
            : "Elegí cómo querés la edición y después subí el video. Se guarda solo en esta computadora; se transcribe, se corta y Claude arma el plan con este estilo."}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">1. Cómo querés la edición</h2>
        {settings ? (
          <>
            <label className="flex flex-col gap-2 text-[13px]">
              <span className="font-semibold">Marca · obligatoria</span>
              <select
                value={brandSlug}
                onChange={(e) => setBrandSlug(e.target.value)}
                required
                disabled={!brands?.length || progress !== null}
                className="rounded-lg border border-line bg-panel-2 px-3 py-2 disabled:opacity-50"
              >
                <option value="">{brands === null ? "Cargando marcas…" : "Seleccioná una marca"}</option>
                {brands?.map((brand) => <option key={brand.slug} value={brand.slug}>{brand.name}</option>)}
              </select>
              <span className="text-neutral-400">
                {brands?.length === 0 ? "Todavía no tenés marcas guardadas. " : "Elegí la marca que va a usar este proyecto. "}
                <a href="/marca" className="text-accent underline">Administrar marcas</a>
              </span>
            </label>
            {soloSubtitulos ? null : (
              <EditingPresets
                value={settings.style}
                onChange={(style) => setSettings({ ...settings, style })}
              />
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {soloSubtitulos ? null : (
              <Row label="IA">
                <Seg
                  value={settings.aiProvider}
                  onChange={(aiProvider) => setSettings({ ...settings, aiProvider })}
                  options={[
                    { value: "anthropic", label: "Claude" },
                    { value: "openai", label: "OpenAI" },
                  ]}
                />
              </Row>
              )}
              {soloSubtitulos ? null : (
              <Row label="Formato">
                <Seg
                  value={settings.format}
                  onChange={(format) => setSettings({ ...settings, format })}
                  options={[
                    { value: "vertical", label: "Vertical 9:16" },
                    { value: "horizontal", label: "Horizontal 16:9" },
                    { value: "square", label: "Cuadrado 1:1" },
                  ]}
                />
              </Row>
              )}
              <Row label="Subtítulos">
                <Seg
                  cols={3}
                  value={settings.subtitles.style}
                  onChange={(style) => setSettings({ ...settings, subtitles: { ...settings.subtitles, style } })}
                  options={[
                    { value: "karaoke", label: "Karaoke" },
                    { value: "simple", label: "Simples" },
                    { value: "pop", label: "Pop" },
                    { value: "minimal", label: "Finos" },
                    { value: "none", label: "Sin subtítulos" },
                  ]}
                />
                {settings.subtitles.style !== "none" ? (
                  <CaptionTypographyFields value={settings.subtitles}
                    onChange={(patch) => setSettings({ ...settings, subtitles: { ...settings.subtitles, ...patch } })} />
                ) : null}
              </Row>
            </div>
            {soloSubtitulos ? null : (
              <>
                <StyleFields
                  value={settings.style}
                  onChange={(style) => setSettings({ ...settings, style })}
                  format={settings.format}
                  graphicsWhen="Claude arma el plan con esto"
                  videoWhen="Se aplica al cortar y armar el video"
                />
                <InstructionsField
                  value={settings.instructions}
                  onChange={(instructions) => setSettings({ ...settings, instructions })}
                />
              </>
            )}
            {/* Desde un clon no se recuerdan: el corte suave no sirve para videos grabados. */}
            {clonId ? null : (
              <label className="flex items-center gap-2 text-[13px] text-neutral-300">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Recordar estas opciones para los próximos videos
              </label>
            )}
            <p className="text-[12px] text-neutral-500">
              La marca queda guardada en este proyecto. Los ajustes de edición los podés cambiar después. Tamaño de subtítulos y música están en “Configuración” dentro del proyecto.
            </p>
          </>
        ) : (
          <p className="text-neutral-500">Cargando tus ajustes…</p>
        )}
      </section>

      {clonId ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold">2. El video del clon</h2>
          <div className="rounded-2xl border border-line bg-panel p-5 flex flex-col sm:flex-row gap-5 items-start">
            {clon?.paso === "listo" ? (
              <video
                src={`/api/clon/${clonId}/file/final.mp4`}
                controls
                playsInline
                className={`rounded-lg bg-black shrink-0 ${clon.settings.formato === "vertical" ? "w-40 aspect-[9/16]" : "w-72 aspect-video"}`}
              />
            ) : null}
            <div className="flex flex-col gap-3 min-w-0">
              <div>
                <div className="text-lg font-medium truncate">{clon?.titulo ?? "Cargando…"}</div>
                <div className="text-neutral-500 text-[13px]">
                  {clon ? `${clon.personaje.nombre} · con su voz · ya hecho en la pestaña Clon` : ""}
                </div>
              </div>
              {clon && clon.paso !== "listo" ? (
                <p className="text-amber-300 text-[13px]">Este clon todavía no está listo. <Link href={`/clon/${clonId}`} className="underline">Volver al clon</Link></p>
              ) : null}
              <Button
                variant="primary"
                className="py-2.5 px-4 self-start"
                onClick={crearDesdeClon}
                disabled={!settings || !brandSlug || creando || clon?.paso !== "listo"}
              >
                {creando ? <Spinner /> : null}
                {!brandSlug ? "Primero seleccioná una marca" : soloSubtitulos ? "Crear el proyecto y ponerle los subtítulos" : "Crear el proyecto y empezar la edición"}
              </Button>
            </div>
          </div>
          {error ? <p className="text-red-300">{error}</p> : null}
        </section>
      ) : (
      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">2. Subí el video</h2>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (canUpload) setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) void start(f);
          }}
          onClick={() => canUpload && input.current?.click()}
          role="button"
          tabIndex={canUpload ? 0 : -1}
          aria-disabled={!canUpload}
          onKeyDown={(e) => {
            if (canUpload && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              input.current?.click();
            }
          }}
          className={`rounded-2xl border-2 border-dashed p-14 text-center transition ${!canUpload ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${
            drag ? "border-accent bg-accent-soft" : "border-line hover:border-neutral-500 bg-panel"
          }`}
        >
          <input
            ref={input}
            type="file"
            disabled={!canUpload}
            accept="video/*,.mov,.mkv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && start(e.target.files[0])}
          />
          {progress === null ? (
            <>
              <div className="text-4xl mb-3">🎬</div>
              <div className="text-lg font-medium">{brandSlug ? "Soltá el video acá" : "Primero seleccioná una marca"}</div>
              <div className="text-neutral-500 mt-1">{brandSlug ? "o hacé click para elegirlo · MP4, MOV, WEBM, MKV" : "La marca es obligatoria para crear el proyecto."}</div>
            </>
          ) : (
            <div className="max-w-md mx-auto">
              <div className="font-medium truncate mb-3">{file?.name}</div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <div className="text-neutral-400 mt-2 text-sm">
                {progress < 1 ? `Subiendo… ${Math.round(progress * 100)}%` : "Creando el proyecto…"}
              </div>
            </div>
          )}
        </div>
        {error ? <p className="text-red-300">{error}</p> : null}
      </section>
      )}
    </div>
  );
}
