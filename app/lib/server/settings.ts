import "server-only";
import { CUT_LABELS, GRAPHICS_DIMENSION_LABELS, GRAPHICS_LABELS, LAYOUT_USE_LABELS, PACE_LABELS, mergeSettings } from "../defaults";
import type { EditStyle, Settings } from "../types";

const pick = <T extends string>(v: unknown, options: Record<T, unknown>, fallback: T): T =>
  typeof v === "string" && v in options ? (v as T) : fallback;

/** Deja el estilo dentro de los valores válidos. */
const cleanStyle = (st: EditStyle, prev: EditStyle): EditStyle => ({
  pace: pick(st.pace, PACE_LABELS, prev.pace),
  graphicsCount: Math.max(0, Math.min(30, Math.round(Number(st.graphicsCount) || 0))),
  graphics: pick(st.graphics, GRAPHICS_LABELS, prev.graphics),
  graphicsDimension: pick(st.graphicsDimension, GRAPHICS_DIMENSION_LABELS, prev.graphicsDimension ?? "2d"),
  noGraphics: st.noGraphics === true,
  layoutUse: pick(st.layoutUse, LAYOUT_USE_LABELS, prev.layoutUse),
  fixedLayout: st.fixedLayout === true,
  cut: pick(st.cut, CUT_LABELS, prev.cut),
  autoZoom: Boolean(st.autoZoom),
  split: {
    position: st.split.position === "bottom" ? "bottom" : "top",
    share: [0.4, 0.5, 0.6].reduce((best, v) => (Math.abs(v - st.split.share) < Math.abs(best - st.split.share) ? v : best), 0.5),
  },
});

/** Aplica un cambio parcial de ajustes y deja todo dentro de valores válidos. */
export const normalizeSettings = (patch: Partial<Settings>, base: Settings): Settings => {
  const next = mergeSettings(patch, base);
  if (next.aiProvider !== "openai" && next.aiProvider !== "anthropic") next.aiProvider = base.aiProvider;
  if (!["vertical", "horizontal", "square"].includes(next.format)) next.format = base.format;
  if (!["karaoke", "simple", "pop", "minimal", "none"].includes(next.subtitles.style)) next.subtitles.style = base.subtitles.style;
  next.subtitles.mixFonts = next.subtitles.mixFonts === true;
  next.subtitles.primaryFont = next.subtitles.primaryFont === "body" ? "body" : "heading";
  if (!["brand", "lora", "heading", "body"].includes(next.subtitles.accentFont ?? "")) next.subtitles.accentFont = "brand";
  if (next.subtitles.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(next.subtitles.color)) delete next.subtitles.color;
  next.style = cleanStyle(next.style, base.style);
  next.subtitles.size = Math.max(32, Math.min(140, Math.round(next.subtitles.size)));
  next.subtitles.maxWords = Math.max(1, Math.min(4, Math.round(next.subtitles.maxWords)));
  next.music.volume = Math.max(0, Math.min(1, next.music.volume));
  next.sfx.enabled = Boolean(next.sfx.enabled);
  next.sfx.volume = Math.max(0, Math.min(1, Number(next.sfx.volume) || 0));
  // Indicaciones libres: texto plano, con un tope para que no desborde el prompt.
  next.instructions = typeof next.instructions === "string" ? next.instructions.slice(0, 2000) : "";
  return next;
};
