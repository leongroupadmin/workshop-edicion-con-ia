"use client";

import { useEffect, useRef, useState } from "react";
import { ColorsFromImage } from "@/components/ColorsFromImage";
import { SavedBrands } from "@/components/SavedBrands";
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
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [library, setLibrary] = useState<Brand["fonts"]["files"]>([]);
  const [stamp, setStamp] = useState(0);

  const load = async () => {
    const r = await api<{ brand: Brand; library: Brand["fonts"]["files"] }>("/api/brand");
    setBrand(r.brand);
    setLibrary(r.library);
    setSaved(JSON.stringify(r.brand));
    setStamp(Date.now());
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void load();
  }, []);

  // Previsualizar las tipografías de marca en esta página
  useEffect(() => {
    const uploaded = brand?.fonts.files ?? [];
    const selected = new Set([brand?.fonts.heading, brand?.fonts.body, brand?.fonts.subtitleAccent]);
    const builtin = library.filter((f) => selected.has(f.family) && !uploaded.some((u) => u.family === f.family));
    for (const f of [...uploaded, ...builtin]) {
      const url = builtin.includes(f) ? `/fonts/library/${encodeURIComponent(f.file)}` : `/api/brand/file/fonts/${encodeURIComponent(f.file)}`;
      const face = new FontFace(f.family, `url(${url})`, {
        weight: f.weight ? String(f.weight) : "100 900",
      });
      face.load().then((ff) => document.fonts.add(ff)).catch(() => {});
    }
  }, [brand?.fonts.files, brand?.fonts.heading, brand?.fonts.body, brand?.fonts.subtitleAccent, library]);

  // La marca se guarda sola (igual que la configuración de cada proyecto).
  useEffect(() => {
    if (!brand) return;
    const body = JSON.stringify(brand);
    if (body === saved) return;
    const t = setTimeout(async () => {
      setSaving("saving");
      try {
        const r = await api<{ brand: Brand }>("/api/brand", { method: "POST", body });
        setBrand(r.brand);
        setSaved(JSON.stringify(r.brand));
        setSaving("saved");
      } catch (e) {
        setMsg((e as Error).message);
        setSaving("error");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [brand, saved]);

  if (!brand) return <div className="p-10 text-neutral-500">Cargando…</div>;
  const dirty = JSON.stringify(brand) !== saved;
  const families = Array.from(new Set([...library.map((f) => f.family), ...(brand.fonts.files ?? []).map((f) => f.family), brand.fonts.heading, brand.fonts.body, brand.fonts.subtitleAccent ?? "Lora cursiva", "Lora cursiva", "Futura", "Helvetica", "Helvetica Neue"]));

  const upload = async (url: string, f: File, ok: string) => {
    setMsg(`Subiendo ${f.name}…`);
    try {
      await uploadFile(url, f, () => {});
      await load();
      setMsg(ok);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="max-w-5xl w-full mx-auto px-6 py-8 flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Marca</h1>
          <p className="text-neutral-400 mt-1">
            Se guarda en <code className="text-neutral-300">/assets/brand</code> y se usa en todos los proyectos
            (subtítulos, escenas de HyperFrames y montaje).
          </p>
        </div>
        <span className={`text-[11px] ${saving === "error" ? "text-red-300" : "text-neutral-500"}`}>
          {saving === "saving" || dirty ? "Guardando…" : saving === "error" ? "No se pudo guardar" : "Se guarda solo"}
        </span>
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
              <div className="flex flex-col items-start gap-2">
                <FilePick accept=".png,.svg,.jpg,.jpeg,.webp" label={brand.logo ? "Cambiar logo" : "Subir logo"} onFile={(f) => upload("/api/brand/upload?kind=logo", f, "Logo actualizado.")} />
                {brand.logo ? (
                  <button
                    type="button"
                    className="text-[12px] text-neutral-500 hover:text-red-300"
                    onClick={async () => {
                      await api("/api/brand/upload?kind=logo", { method: "DELETE" });
                      await load();
                      setMsg("Logo quitado.");
                    }}
                  >
                    Quitar logo
                  </button>
                ) : null}
              </div>
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
            {(["heading", "body", "subtitleAccent"] as const).map((k) => (
              <label key={k} className="flex items-center gap-3">
                <span className="w-28 text-[12px] text-neutral-400">{k === "heading" ? "Títulos y subtítulos" : k === "body" ? "Texto" : "Énfasis de subtítulos"}</span>
                <select
                  value={brand.fonts[k] ?? "Lora cursiva"}
                  onChange={(e) => setBrand({ ...brand, fonts: { ...brand.fonts, [k]: e.target.value } })}
                  className="flex-1 bg-panel-2 border border-line rounded-md px-2 py-1.5"
                >
                  {families.filter((f) => f !== "Lora cursiva" || k === "subtitleAccent").map((f) => (
                    <option key={f} value={f}>{f === "Helvetica" ? "Helvetica (del sistema)" : f}</option>
                  ))}
                  {!families.includes("Neue Haas Grotesk") ? <option disabled>Neue Haas Grotesk — requiere archivo</option> : null}
                </select>
              </label>
            ))}
            <style>{`@font-face { font-family: 'Lora cursiva'; src: url('/fonts/Lora-Italic.ttf') format('truetype'); font-style: italic; font-weight: 400 700; font-display: swap; }`}</style>
            <p className="text-[12px] text-neutral-400">Al activar “Combinar tipografías”, los subtítulos usan la fuente de títulos y las palabras clave usan la de énfasis. Guardá la marca para elegir esta combinación al crear un video.</p>
            <p className="text-[12px] text-neutral-400">Biblioteca incluida: {new Set(library.map((f) => f.family)).size} familias. Elegí una arriba para verla en la vista previa. Helvetica usa la fuente instalada en este equipo.</p>
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
            <div className="rounded-lg border border-line p-3 flex flex-col gap-2">
              <p className="text-[12px] text-neutral-400">Neue Haas Grotesk requiere tu archivo con licencia.</p>
              <FilePick accept=".woff2,.woff,.ttf,.otf" label="Subir Neue Haas Grotesk" onFile={(f) => upload("/api/brand/upload?kind=font&family=Neue%20Haas%20Grotesk", f, "Neue Haas Grotesk agregada.")} />
            </div>
            <FilePick accept=".woff2,.woff,.ttf,.otf" label="Subir tipografía (WOFF2/TTF/OTF)" onFile={(f) => upload("/api/brand/upload?kind=font", f, "Tipografía agregada.")} />
          </Panel>

          <Panel title="Vista previa" bodyClassName="p-0">
            <div className="p-6 rounded-b-xl flex flex-col items-center gap-3" style={{ background: brand.colors.background }}>
              <div style={{ fontFamily: `"${brand.fonts.heading}"`, color: brand.colors.text, fontWeight: 800, fontSize: 28 }}>
                Así se ven tus <span style={{ color: brand.colors.highlight,
                  fontFamily: `"${brand.fonts.subtitleAccent ?? "Lora cursiva"}"`,
                  fontStyle: (brand.fonts.subtitleAccent ?? "Lora cursiva") === "Lora cursiva" ? "italic" : "normal",
                  fontWeight: (brand.fonts.subtitleAccent ?? "Lora cursiva") === "Lora cursiva" ? 600 : 800,
                }}>subtítulos</span>
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

      <SavedBrands actual={brand.name} pendiente={dirty || saving === "saving"} onUsar={load} />

    </div>
  );
}
