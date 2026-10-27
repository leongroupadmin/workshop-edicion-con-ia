"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Panel, Spinner, TrashIcon } from "@/components/ui";
import { api, uploadFile } from "@/lib/client";
import type { ProjectImage } from "@/lib/types";

const ACCEPT = "image/jpeg,image/png,image/webp,image/svg+xml";

/**
 * Imágenes propias del video. Claude las reparte entre los gráficos cuando
 * arma el plan; la descripción de cada una le dice para qué sirve.
 */
export const Images = ({ id }: { id: string }) => {
  const input = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ProjectImage[] | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const cargar = async () => {
    try {
      const r = await api<{ images: ProjectImage[] }>(`/api/projects/${id}/images`);
      setImages(r.images);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude leer las imágenes.");
    }
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const subir = async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    setSubiendo(true);
    try {
      for (const f of files) await uploadFile(`/api/projects/${id}/images`, f, () => {});
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir.");
    } finally {
      setSubiendo(false);
    }
  };

  const describir = async (file: string, note: string) => {
    setImages((prev) => prev?.map((i) => (i.file === file ? { ...i, note } : i)) ?? prev);
    try {
      await api(`/api/projects/${id}/images`, { method: "PATCH", body: JSON.stringify({ file, note }) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude guardar la descripción.");
    }
  };

  const borrar = async (file: string) => {
    setError(null);
    try {
      const r = await api<{ images: ProjectImage[] }>(`/api/projects/${id}/images?file=${encodeURIComponent(file)}`, {
        method: "DELETE",
      });
      setImages(r.images);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar.");
    }
  };

  return (
    <Panel
      title="Imágenes para el video"
      right={
        <Button onClick={() => input.current?.click()} disabled={subiendo}>
          {subiendo ? <Spinner /> : null}
          {subiendo ? "Subiendo…" : "Subir imágenes"}
        </Button>
      }
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          void subir(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void subir(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")));
        }}
        className={`rounded-lg border border-dashed transition ${drag ? "border-accent bg-accent-soft/30" : "border-line"}`}
      >
        {images === null ? (
          <div className="p-4 text-[13px] text-muted flex items-center gap-2">
            <Spinner /> Cargando…
          </div>
        ) : images.length === 0 ? (
          <div className="p-5 text-center text-[13px] text-muted">
            Arrastrá acá tus fotos, capturas o logos (JPG, PNG, WEBP o SVG).
            <br />
            Claude las reparte solo entre los gráficos, según lo que estés diciendo en cada momento.
          </div>
        ) : (
          <div className="p-2 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
            {images.map((img) => (
              <div key={img.file} className="flex gap-2 rounded-lg border border-line bg-panel-2 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- archivo local del proyecto */}
                <img
                  src={`/api/projects/${id}/file/images/${encodeURIComponent(img.file)}`}
                  alt={img.file}
                  className="w-16 h-16 rounded-md object-cover bg-panel-2 shrink-0"
                />
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <div className="flex items-start gap-1">
                    <span className="text-[12px] text-muted truncate flex-1" title={img.file}>
                      {img.file}
                    </span>
                    <button
                      type="button"
                      aria-label={`Borrar ${img.file}`}
                      onClick={() => void borrar(img.file)}
                      className="text-muted hover:text-red-700 shrink-0"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  <input
                    defaultValue={img.note ?? ""}
                    placeholder="qué se ve (opcional)"
                    onBlur={(e) => void describir(img.file, e.target.value)}
                    className="w-full rounded-md border border-line bg-panel-2 px-2 py-1 text-[12px] outline-none focus:border-muted"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error ? <p className="mt-2 text-[12px] text-red-700">{error}</p> : null}
      {images?.length ? (
        <p className="mt-2 text-[12px] text-muted">
          La descripción ayuda a Claude a elegir el momento (“mi oficina”, “captura del panel”, “el producto”). Si el
          plan ya está hecho, pedile por el chat que lo rehaga para que las incluya.
        </p>
      ) : null}
    </Panel>
  );
};
