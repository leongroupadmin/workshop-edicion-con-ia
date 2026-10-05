/**
 * Paleta de colores desde una imagen (en el navegador, sin subirla a ningún
 * lado) + propuesta de qué color va en cada rol de la marca.
 */
import type { Brand } from "./types";

export type Swatch = { hex: string; rgb: [number, number, number]; share: number };
type Colors = Brand["colors"];

const toHex = ([r, g, b]: number[]) =>
  `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

export const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};

const hsl = ([r, g, b]: number[]) => {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
};

/** Luminancia relativa y contraste WCAG. */
const lum = (rgb: number[]) => {
  const c = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a: string, b: string) => {
  const [la, lb] = [lum(hexToRgb(a)), lum(hexToRgb(b))].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
};

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const lighten = (hex: string, amount: number) => {
  const rgb = hexToRgb(hex);
  return toHex(rgb.map((v) => v + (255 - v) * amount));
};

/** Agrupa los píxeles en hasta `k` colores (k-means) y devuelve los más presentes. */
export const extractPalette = async (file: File, k = 8): Promise<{ swatches: Swatch[]; transparent: boolean }> => {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("No pude abrir esa imagen. Probá con PNG o JPG."));
      i.src = url;
    });
    const w0 = img.naturalWidth || 400;
    const h0 = img.naturalHeight || 400;
    const scale = Math.min(1, 180 / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    const px: number[][] = [];
    let clear = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) clear++;
      else px.push([data[i], data[i + 1], data[i + 2]]);
    }
    if (!px.length) throw new Error("La imagen está vacía o es toda transparente.");

    // k-means++ (semillas separadas) + 12 iteraciones
    const centers: number[][] = [px[Math.floor(px.length / 2)]];
    while (centers.length < Math.min(k, px.length)) {
      let best = px[0];
      let bestD = -1;
      for (let i = 0; i < px.length; i += 7) {
        const d = Math.min(...centers.map((c) => dist(c, px[i])));
        if (d > bestD) {
          bestD = d;
          best = px[i];
        }
      }
      if (bestD < 12) break;
      centers.push(best);
    }
    const counts = new Array(centers.length).fill(0);
    for (let it = 0; it < 12; it++) {
      const sums = centers.map(() => [0, 0, 0]);
      counts.fill(0);
      for (const p of px) {
        let ci = 0;
        let cd = Infinity;
        centers.forEach((c, j) => {
          const d = dist(c, p);
          if (d < cd) {
            cd = d;
            ci = j;
          }
        });
        counts[ci]++;
        sums[ci][0] += p[0];
        sums[ci][1] += p[1];
        sums[ci][2] += p[2];
      }
      centers.forEach((c, j) => {
        if (counts[j]) centers[j] = sums[j].map((v) => v / counts[j]);
      });
    }

    // Unir colores casi iguales y descartar los que casi no aparecen
    let sw = centers
      .map((c, j) => ({ rgb: c.map(Math.round) as [number, number, number], share: counts[j] / px.length }))
      .filter((s) => s.share >= 0.008)
      .sort((a, b) => b.share - a.share);
    const merged: typeof sw = [];
    for (const s of sw) {
      const m = merged.find((x) => dist(x.rgb, s.rgb) < 28);
      if (m) m.share += s.share;
      else merged.push({ ...s });
    }
    sw = merged.sort((a, b) => b.share - a.share);
    return {
      swatches: sw.map((s) => ({ ...s, hex: toHex(s.rgb) })),
      transparent: clear / (data.length / 4) > 0.15,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Propone qué color va en cada rol (fondo, principal, secundario, texto, resaltado). */
export const suggestColors = (swatches: Swatch[]): Colors => {
  const info = swatches.map((s) => ({ ...s, ...hsl(s.rgb) }));
  // Principal: el color más "vivo" (saturado, ni muy claro ni muy oscuro) que tenga presencia
  const vivid = (x: (typeof info)[number]) => x.s * (1 - Math.abs(x.l - 0.5) * 1.3) * Math.sqrt(x.share + 0.03);
  const byVivid = [...info].sort((a, b) => vivid(b) - vivid(a));
  const primaryC = byVivid.find((x) => x.s > 0.25) ?? byVivid[0];
  const primary = primaryC.hex;

  // Fondo: el neutro (poco saturado) más presente; si no hay, negro o blanco según contraste con el principal
  const neutrals = info.filter((x) => (x.s < 0.25 || x.l < 0.12 || x.l > 0.92) && x.hex !== primary);
  const bgC = neutrals.sort((a, b) => b.share - a.share)[0];
  const background =
    bgC && bgC.share >= 0.08 ? bgC.hex : contrast("#0A0A0A", primary) >= contrast("#FFFFFF", primary) ? "#0A0A0A" : "#FFFFFF";

  // Secundario: otro color vivo de distinto tono; si no hay, una versión más clara del principal
  const secondaryC = byVivid.find(
    (x) => x.hex !== primary && x.hex !== background && x.s > 0.2 && Math.min(Math.abs(x.h - primaryC.h), 360 - Math.abs(x.h - primaryC.h)) > 25,
  );
  const secondary = secondaryC?.hex ?? lighten(primary, 0.3);

  // Texto: lo que mejor se lea sobre el fondo
  const textOptions = ["#FFFFFF", "#0A0A0A", ...info.filter((x) => x.s < 0.2).map((x) => x.hex)];
  const text = textOptions.sort((a, b) => contrast(b, background) - contrast(a, background))[0];

  // Resaltado (palabra que se dice en los subtítulos): vivo y que se lea sobre el fondo
  const highlight = [primary, secondary, lighten(primary, 0.35)].find((c) => contrast(c, background) >= 3) ?? text;

  return { primary, secondary, background, text, highlight };
};
