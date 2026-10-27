"use client";

import { useRef, useState } from "react";
import { contrast, extractPalette, suggestColors, type Swatch } from "@/lib/palette";
import type { Brand } from "@/lib/types";
import { Button, Spinner } from "./ui";

type Colors = Brand["colors"];

const ROLES: { key: keyof Colors; label: string; hint: string }[] = [
  { key: "primary", label: "Principal", hint: "el color de la marca: tarjetas, palabras clave" },
  { key: "background", label: "Fondo", hint: "fondo de gráficos y tarjetas" },
  { key: "text", label: "Texto", hint: "tiene que leerse sobre el fondo" },
  { key: "secondary", label: "Secundario", hint: "acentos y detalles" },
  { key: "highlight", label: "Resaltado", hint: "la palabra que estás diciendo en los subtítulos" },
];

/**
 * Subís una imagen (logo, placa, captura de tu web) y saca los colores de la
 * marca. Todo pasa en el navegador: la imagen no se sube.
 */
export const ColorsFromImage = ({
  current,
  onPreview,
  onSave,
}: {
  current: Colors;
  /** Muestra los colores en la página mientras elegís (sin guardar). */
  onPreview: (colors: Colors) => void;
  onSave: (colors: Colors, logo: File | null) => Promise<void>;
}) => {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [palette, setPalette] = useState<Swatch[]>([]);
  const [colors, setColors] = useState<Colors | null>(null);
  const [before, setBefore] = useState<Colors | null>(null);
  const [asLogo, setAsLogo] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async (f: File) => {
    setError(null);
    setWorking(true);
    try {
      const { swatches, transparent } = await extractPalette(f);
      const suggested = suggestColors(swatches);
      if (img) URL.revokeObjectURL(img);
      setFile(f);
      setImg(URL.createObjectURL(f));
      setPalette(swatches);
      setBefore((b) => b ?? current);
      setColors(suggested);
      setAsLogo(transparent);
      onPreview(suggested);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const pick = (key: keyof Colors, hex: string) => {
    if (!colors) return;
    const next = { ...colors, [key]: hex };
    setColors(next);
    onPreview(next);
  };

  const close = (restore: boolean) => {
    if (restore && before) onPreview(before);
    if (img) URL.revokeObjectURL(img);
    setFile(null);
    setImg(null);
    setColors(null);
    setBefore(null);
    setPalette([]);
  };

  const save = async () => {
    if (!colors) return;
    setWorking(true);
    try {
      await onSave(colors, asLogo ? file : null);
      close(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const choices = (key: keyof Colors) => {
    const base = palette.map((s) => s.hex);
    const extra = key === "text" || key === "background" ? ["#FFFFFF", "#0A0A0A"] : [];
    return Array.from(new Set([...base, ...extra, colors?.[key] ?? ""])).filter(Boolean);
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={input}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.svg"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) void open(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {!colors ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void open(f);
          }}
          onClick={() => input.current?.click()}
          className="rounded-lg border border-dashed border-line hover:border-accent/60 px-3 py-3 cursor-pointer flex items-center gap-3"
        >
          <span className="text-2xl">🎨</span>
          <span className="flex-1 text-[12px] text-fg-2">
            <b className="text-fg">Sacar los colores de una imagen</b>
            <span className="block text-muted">Logo, una placa de tu Instagram o una captura de tu web. No se sube a ningún lado.</span>
          </span>
          {working ? <Spinner className="text-accent-strong" /> : null}
        </div>
      ) : (
        <div className="rounded-lg border border-accent/40 bg-accent-soft p-3 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {img ? <img src={img} alt="" className="w-20 h-20 object-contain rounded-md bg-panel-2 border border-line" /> : null}
            <div className="flex-1 flex flex-col gap-1.5">
              <span className="text-[12px] text-fg">Colores que encontré (de más a menos presentes):</span>
              <div className="flex rounded-md overflow-hidden h-6 border border-line">
                {palette.map((s) => (
                  <span key={s.hex} title={`${s.hex} · ${Math.round(s.share * 100)}%`} style={{ background: s.hex, flex: Math.max(s.share, 0.04) }} />
                ))}
              </div>
              <span className="text-[11px] text-muted">Te propongo esto; tocá otro color para cambiar cualquiera. La página ya muestra cómo queda.</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {ROLES.map((r) => (
              <div key={r.key} className="flex flex-wrap items-center gap-2">
                <span className="w-24 text-[12px] text-fg" title={r.hint}>
                  {r.label}
                </span>
                <div className="flex flex-wrap gap-1">
                  {choices(r.key).map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      title={hex}
                      onClick={() => pick(r.key, hex)}
                      className={`w-6 h-6 rounded-md border ${colors[r.key] === hex ? "ring-2 ring-fg border-fg" : "border-line"}`}
                      style={{ background: hex }}
                    />
                  ))}
                </div>
                <span className="font-mono text-[11px] text-muted">{colors[r.key]}</span>
                {r.key === "text" && contrast(colors.text, colors.background) < 4.5 ? (
                  <span className="text-[11px] text-amber-700">se lee poco sobre el fondo</span>
                ) : null}
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 text-[12px] text-fg-2">
            <input type="checkbox" checked={asLogo} onChange={(e) => setAsLogo(e.target.checked)} />
            Usar esta imagen también como logo
          </label>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={working} onClick={() => void save()}>
              {working ? <Spinner /> : null}
              Guardar estos colores
            </Button>
            <Button variant="ghost" onClick={() => input.current?.click()}>
              Probar otra imagen
            </Button>
            <Button variant="ghost" onClick={() => close(true)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {error ? <p className="text-[12px] text-red-700">{error}</p> : null}
    </div>
  );
};
