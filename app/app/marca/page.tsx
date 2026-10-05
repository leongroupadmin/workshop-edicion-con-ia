"use client";

import { useEffect, useRef, useState } from "react";
import { ColorsFromImage } from "@/components/ColorsFromImage";
import { MusicSearch } from "@/components/MusicSearch";
import { Button, Panel } from "@/components/ui";
import { api, uploadFile } from "@/lib/client";
import type { Brand } from "@/lib/types";

const COLOR_LABELS: Record<keyof Brand["colors"], string> = {
  primary: "Principal",
  secondary: "Secundario",
  background: "Fondo",
  text: "Texto",
  highlight: "Resaltado de subtítulos",
};

const FilePick = ({
  accept,
  label,
  onFile,
}: {
  accept: string;
  label: string;
  onFile: (f: File) => void;
}) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <Button onClick={() => ref.current?.click()}>{label}</Button>
    </>
  );
};

export default function BrandPage() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [music, setMusic] = useState<{ tracks: string[]; sfx: string[] }>({ tracks: [], sfx: [] });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(0);

  const load = async () => {
    const r = await api<{ brand: Brand }>("/api/brand");
    setBrand(r.brand);
    setSaved(JSON.stringify(r.brand));
    setMusic(await api("/api/music"));
    setStamp(Date.now());
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void load();
  }, []);

  // Previsualizar las tipografías de marca en esta página
  useEffect(() => {
    for (const f of brand?.fonts.files ?? []) {
      const face = new FontFace(f.family, `url(/api/brand/file/fonts/${encodeURIComponent(f.file)})`, {
        weight: f.weight ? String(f.weight) : "100 900",
      });
      face.load().then((ff) => document.fonts.add(ff)).catch(() => {});
    }
  }, [brand?.fonts.files]);

  if (!brand) return <div className="p-10 text-neutral-500">Cargando…</div>;
  const dirty = JSON.stringify(brand) !== saved;
  const families = Array.from(new Set([...(brand.fonts.files ?? []).map((f) => f.family), "Futura", "Helvetica Neue", "Inter"]));

  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ brand: Brand }>("/api/brand", { method: "POST", body: JSON.stringify(brand) });
      setBrand(r.brand);
      setSaved(JSON.stringify(r.brand));
      setMsg("Marca guardada. Se usa en los próximos renders y escenas.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (url: string, f: File, ok: string) => {
    setBusy(true);
    setMsg(`Subiendo ${f.name}…`);
    try {
      await uploadFile(url, f, () => {});
      await load();
      setMsg(ok);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl w-full mx-auto px-6 py-8 flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Marca y música</h1>
          <p className="text-neutral-400 mt-1">
            Se guarda en <code className="text-neutral-300">/assets/brand</code> y <code className="text-neutral-300">/assets/music</code>, y se usa en
            todos los proyectos (subtítulos, escenas de HyperFrames y montaje).
          </p>
        </div>
        <Button variant="primary" disabled={!dirty || busy} onClick={save}>
          Guardar cambios
        </Button>
      </div>
      {msg ? <p className="text-[13px] text-neutral-300">{msg}</p> : null}

      <div className="grid grid-cols-2 gap-5">
        <Panel title="Identidad" bodyClassName="p-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-neutral-500">Nombre</span>
            <input
              value={brand.name}
              onChange={(e) => setBrand({ ...brand, name: e.target.value })}
              className="bg-panel-2 border border-line rounded-md px-3 py-1.5 outline-none focus:border-accent/60"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-neutral-500">Logo</span>
            <div className="flex items-center gap-3">
              <div className="w-24 h-24 rounded-lg border border-line grid place-items-center overflow-hidden" style={{ background: brand.colors.background }}>
                {brand.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/brand/file/${brand.logo}?t=${stamp}`} alt="logo" className="max-w-[80%] max-h-[80%] object-contain" />
                ) : (
                  <span className="text-[11px] text-neutral-500">sin logo</span>
                )}
              </div>
              <FilePick accept=".png,.svg,.jpg,.jpeg,.webp" label="Subir logo" onFile={(f) => upload("/api/brand/upload?kind=logo", f, "Logo actualizado.")} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-wide text-neutral-500">Colores</span>
            <ColorsFromImage
              current={brand.colors}
              onPreview={(colors) => setBrand((b) => (b ? { ...b, colors } : b))}
              onSave={async (colors, logo) => {
                await api("/api/brand", { method: "POST", body: JSON.stringify({ ...brand, colors }) });
                if (logo) await uploadFile("/api/brand/upload?kind=logo", logo, () => {});
                await load();
                setMsg(logo ? "Colores y logo guardados. Se usan en los próximos videos." : "Colores guardados. Se usan en los próximos videos.");
              }}
            />
            {(Object.keys(COLOR_LABELS) as (keyof Brand["colors"])[]).map((k) => (
              <label key={k} className="flex items-center gap-3">
                <input
                  type="color"
                  value={brand.colors[k]}
                  onChange={(e) => setBrand({ ...brand, colors: { ...brand.colors, [k]: e.target.value } })}
                  className="w-9 h-9 rounded-md border border-line bg-transparent cursor-pointer"
                />
                <span className="flex-1">{COLOR_LABELS[k]}</span>
                <span className="font-mono text-[12px] text-neutral-400">{brand.colors[k].toUpperCase()}</span>
              </label>
            ))}
          </div>
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel title="Tipografías" bodyClassName="p-4 flex flex-col gap-4">
            {(["heading", "body"] as const).map((k) => (
              <label key={k} className="flex items-center gap-3">
                <span className="w-28 text-[12px] text-neutral-400">{k === "heading" ? "Títulos y subtítulos" : "Texto"}</span>
                <select
                  value={brand.fonts[k]}
                  onChange={(e) => setBrand({ ...brand, fonts: { ...brand.fonts, [k]: e.target.value } })}
                  className="flex-1 bg-panel-2 border border-line rounded-md px-2 py-1.5"
                >
                  {families.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
            ))}
            <ul className="text-[12px] text-neutral-400 flex flex-col gap-1">
              {(brand.fonts.files ?? []).map((f) => (
                <li key={f.file} className="flex items-center gap-2">
                  <span className="flex-1 truncate" style={{ fontFamily: f.family, fontWeight: f.weight }}>
                    {f.family} {f.weight ?? ""} — Aa Bb 123
                  </span>
                  <button
                    className="text-neutral-600 hover:text-red-300"
                    onClick={async () => {
                      await api(`/api/brand/upload?file=${encodeURIComponent(f.file)}`, { method: "DELETE" });
                      await load();
                    }}
                  >
                    quitar
                  </button>
                </li>
              ))}
            </ul>
            <FilePick accept=".woff2,.woff,.ttf,.otf" label="Subir tipografía (WOFF2/TTF/OTF)" onFile={(f) => upload("/api/brand/upload?kind=font", f, "Tipografía agregada.")} />
          </Panel>

          <Panel title="Vista previa" bodyClassName="p-0">
            <div className="p-6 rounded-b-xl flex flex-col items-center gap-3" style={{ background: brand.colors.background }}>
              <div style={{ fontFamily: `"${brand.fonts.heading}"`, color: brand.colors.text, fontWeight: 800, fontSize: 28 }}>
                Así se ven tus <span style={{ color: brand.colors.highlight }}>subtítulos</span>
              </div>
              <span
                style={{
                  fontFamily: `"${brand.fonts.heading}"`,
                  background: brand.colors.primary,
                  color: brand.colors.background,
                  fontWeight: 800,
                  fontSize: 22,
                  padding: "2px 12px",
                  borderRadius: 8,
                }}
              >
                palabra clave
              </span>
              <div style={{ fontFamily: `"${brand.fonts.body}"`, color: brand.colors.secondary, fontSize: 14 }}>texto secundario</div>
            </div>
          </Panel>
        </div>
      </div>

      <MusicSearch
        onAdded={async (file) => {
          setMusic(await api("/api/music"));
          setMsg(`Música agregada: ${file}. Ya la podés elegir en la Configuración de cada video.`);
        }}
      />

      <Panel title="Tu música y efectos de sonido" bodyClassName="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
        {(["tracks", "sfx"] as const).map((k) => (
          <div key={k} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-neutral-300">{k === "tracks" ? "Música de fondo" : "Efectos de sonido (whoosh, pop…)"}</span>
              <FilePick
                accept=".mp3,.wav,.m4a,.aac,.ogg"
                label="Subir"
                onFile={(f) => upload(`/api/music${k === "sfx" ? "?sfx=1" : ""}`, f, "Audio subido.")}
              />
            </div>
            {music[k].length ? (
              <ul className="flex flex-col gap-1.5">
                {music[k].map((t) => (
                  <li key={t} className="flex items-center gap-2 text-[12px]">
                    <span className="flex-1 truncate text-neutral-300">{t}</span>
                    <audio controls preload="none" src={`/api/music?play=${encodeURIComponent(k === "sfx" ? `sfx/${t}` : t)}`} className="h-7 w-48" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-neutral-500">Nada cargado todavía.</p>
            )}
          </div>
        ))}
      </Panel>
    </div>
  );
}
