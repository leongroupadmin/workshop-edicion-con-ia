import type { EditStyle, Format, SubtitlePosition } from "../pipeline/types";

/**
 * Zonas seguras para no tapar la interfaz de Instagram/TikTok.
 * Vertical 1080x1920: arriba ~250px (usuario/cámara), abajo ~420px (descripción,
 * música, barra), derecha ~150px (likes/comentarios/compartir).
 */
export const SAFE_ZONES: Record<
  Format,
  { top: number; bottom: number; left: number; right: number }
> = {
  vertical: { top: 260, bottom: 440, left: 80, right: 160 },
  horizontal: { top: 80, bottom: 90, left: 120, right: 120 },
  square: { top: 110, bottom: 140, left: 90, right: 120 },
};

/** Posición vertical del bloque de subtítulos dentro de la zona segura. */
export const captionBox = (
  format: Format,
  position: SubtitlePosition,
  width: number,
  height: number,
  /** Si viene, el bloque se centra en esta altura (p.ej. la unión de la pantalla dividida). */
  centerY?: number,
) => {
  const z = SAFE_ZONES[format];
  const boxWidth = width - z.left - z.right;
  const base = { left: z.left, width: boxWidth } as const;
  if (centerY !== undefined) return { ...base, top: centerY, translateY: "-50%" };
  if (position === "top") return { ...base, top: z.top + 40 };
  if (position === "middle") return { ...base, top: height / 2, translateY: "-50%" };
  // bottom: el borde inferior del texto queda por encima de la zona de UI
  return { ...base, bottom: z.bottom + 40 };
};

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Pantalla dividida: el gráfico ocupa `share` de la pantalla, arriba o abajo
 * según `position` (en horizontal: izquierda o derecha). El video, el resto.
 * `seam` es dónde se juntan las dos partes (ahí van los subtítulos).
 */
export const splitRegions = (
  format: Format,
  width: number,
  height: number,
  split: EditStyle["split"],
): { scene: Rect; video: Rect; seam: number } => {
  const share = Math.min(0.7, Math.max(0.3, split.share));
  const first = split.position === "top";
  if (format === "horizontal") {
    const sw = Math.round(width * share);
    return first
      ? { scene: { x: 0, y: 0, width: sw, height }, video: { x: sw, y: 0, width: width - sw, height }, seam: sw }
      : {
          scene: { x: width - sw, y: 0, width: sw, height },
          video: { x: 0, y: 0, width: width - sw, height },
          seam: width - sw,
        };
  }
  const sh = Math.round(height * share);
  return first
    ? { scene: { x: 0, y: 0, width, height: sh }, video: { x: 0, y: sh, width, height: height - sh }, seam: sh }
    : {
        scene: { x: 0, y: height - sh, width, height: sh },
        video: { x: 0, y: 0, width, height: height - sh },
        seam: height - sh,
      };
};

/** Escenas divididas seguidas (o casi) se unen en un solo tramo: la pantalla no vuelve a completa entre ellas. */
const SPLIT_JOIN_MS = 250;

export const mergeSplitRanges = (splits: { startMs: number; endMs: number }[]) => {
  const sorted = [...splits].sort((a, b) => a.startMs - b.startMs);
  const out: { startMs: number; endMs: number }[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.startMs - last.endMs <= SPLIT_JOIN_MS) last.endMs = Math.max(last.endMs, s.endMs);
    else out.push({ startMs: s.startMs, endMs: s.endMs });
  }
  return out;
};

/** 1 = pantalla dividida, 0 = normal. Entra y sale con corte directo (sin transición). */
export const splitAmount = (splits: { startMs: number; endMs: number }[], t: number) =>
  mergeSplitRanges(splits).some((r) => t >= r.startMs && t < r.endMs) ? 1 : 0;

/** Una transición que toca un tramo de pantalla dividida (o sus bordes) no se usa: ahí va corte directo. */
const SPLIT_TRANSITION_MARGIN_MS = 300;
export const touchesSplit = (item: { startMs: number; endMs: number }, splits: { startMs: number; endMs: number }[]) =>
  mergeSplitRanges(splits).some(
    (r) => item.endMs > r.startMs - SPLIT_TRANSITION_MARGIN_MS && item.startMs < r.endMs + SPLIT_TRANSITION_MARGIN_MS,
  );

/**
 * Zoom automático: alterna normal / acercado en cada corte. Los tramos de
 * menos de 0.7 s no cambian el zoom (evita saltos seguidos).
 */
export const autoZoomAt = (cutPoints: number[], t: number, scale: number) => {
  let zoomed = false;
  let last = 0;
  for (const c of cutPoints) {
    if (c > t) break;
    if (c - last >= 700) zoomed = !zoomed;
    last = c;
  }
  return zoomed ? scale : 1;
};
