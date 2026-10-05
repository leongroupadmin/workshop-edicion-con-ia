"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StyleFields } from "@/components/StyleFields";
import { Row, Seg } from "@/components/ui";
import { api, uploadFile } from "@/lib/client";
import type { Settings } from "@/lib/types";

export default function NewVideo() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Cómo querés la edición: arranca con tus ajustes guardados
  const [settings, setSettings] = useState<Settings | null>(null);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    api<Settings>("/api/defaults")
      .then(setSettings)
      .catch((e) => setError((e as Error).message));
  }, []);

  const start = async (f: File) => {
    if (!settings) return;
    setFile(f);
    setError(null);
    setProgress(0);
    const { format, subtitles, style } = settings;
    try {
      const res = await uploadFile("/api/projects", f, setProgress, {
        "x-settings": encodeURIComponent(JSON.stringify({ format, subtitles, style })),
        "x-remember": remember ? "1" : "0",
      });
      router.push(`/p/${res.id as string}`);
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
    }
  };

  return (
    <div className="max-w-4xl w-full mx-auto px-6 py-10 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo video</h1>
        <p className="text-neutral-400 mt-1">
          Elegí cómo querés la edición y después subí el video. Se guarda solo en esta computadora; se transcribe, se corta y Claude arma
          el plan con este estilo.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">1. Cómo querés la edición</h2>
        {settings ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <Row label="Subtítulos">
                <Seg
                  value={settings.subtitles.style}
                  onChange={(style) => setSettings({ ...settings, subtitles: { ...settings.subtitles, style } })}
                  options={[
                    { value: "karaoke", label: "Karaoke" },
                    { value: "simple", label: "Simples" },
                    { value: "none", label: "Sin subtítulos" },
                  ]}
                />
              </Row>
            </div>
            <StyleFields
              value={settings.style}
              onChange={(style) => setSettings({ ...settings, style })}
              format={settings.format}
              graphicsWhen="Claude arma el plan con esto"
              videoWhen="Se aplica al cortar y armar el video"
            />
            <label className="flex items-center gap-2 text-[13px] text-neutral-300">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Recordar estas opciones para los próximos videos
            </label>
            <p className="text-[12px] text-neutral-500">
              Todo esto lo podés cambiar después dentro del proyecto. Tamaño de subtítulos y música están en “Ajustes rápidos”.
            </p>
          </>
        ) : (
          <p className="text-neutral-500">Cargando tus ajustes…</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">2. Subí el video</h2>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) void start(f);
          }}
          onClick={() => progress === null && settings && input.current?.click()}
          className={`rounded-2xl border-2 border-dashed p-14 text-center cursor-pointer transition ${
            drag ? "border-accent bg-accent-soft" : "border-line hover:border-neutral-500 bg-panel"
          }`}
        >
          <input
            ref={input}
            type="file"
            accept="video/*,.mov,.mkv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && start(e.target.files[0])}
          />
          {progress === null ? (
            <>
              <div className="text-4xl mb-3">🎬</div>
              <div className="text-lg font-medium">Soltá el video acá</div>
              <div className="text-neutral-500 mt-1">o hacé click para elegirlo · MP4, MOV, WEBM, MKV</div>
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
    </div>
  );
}
