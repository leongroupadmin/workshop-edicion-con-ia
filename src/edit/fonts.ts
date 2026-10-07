import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import type { Brand } from "../pipeline/types";

const loaded = new Set<string>();

/** Carga las tipografías de /assets/brand/fonts antes de renderizar. */
export const useBrandFonts = (brand: Brand, baseUrl: string, assetsPath = "assets/brand") => {
  const [handle] = useState(() => delayRender("Cargando tipografías de marca"));

  useEffect(() => {
    const files = brand.fonts.files ?? [];
    Promise.all(
      files.map(async (f) => {
        const url = `${baseUrl}/${assetsPath}/fonts/${encodeURIComponent(f.file)}`;
        const key = `${url}|${f.family}|${f.weight ?? "normal"}`;
        if (loaded.has(key)) return;
        const face = new FontFace(f.family, `url(${url})`, {
          weight: f.weight ? String(f.weight) : "100 900",
        });
        await face.load();
        document.fonts.add(face);
        loaded.add(key);
      }),
    )
      .catch((err) => {
        // Si una fuente falla, seguimos con la fuente del sistema en vez de cortar el render.
        console.warn("No se pudo cargar una tipografía de marca", err);
      })
      .finally(() => continueRender(handle));
  }, [brand, baseUrl, assetsPath, handle]);
};

export const fontStack = (family: string) =>
  `"${family}", "Futura", "Helvetica Neue", Helvetica, Arial, sans-serif`;
