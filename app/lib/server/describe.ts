import "server-only";
import { CUT_LABELS, GRAPHICS_LABELS, LAYOUT_USE_LABELS, PACE_LABELS } from "../defaults";
import type { Settings } from "../types";

const FORMAT = { vertical: "vertical", horizontal: "horizontal", square: "cuadrado" } as const;
const STYLE = { karaoke: "karaoke", simple: "simples", pop: "pop", none: "sin subtítulos" } as const;
const POS = { bottom: "abajo", middle: "al medio", top: "arriba" } as const;

/**
 * Describe en español qué cambió entre dos ajustes. Con `renderOnly`, solo lo
 * que cambia el video al armarlo (no ritmo, estilo de gráficos ni cuándo usar
 * pantalla dividida: esos cambian el plan o los gráficos). Con `hasSplit:
 * false` se ignora el aspecto de la pantalla dividida (no hay ninguna).
 */
export const describeChanges = (
  a: Settings,
  b: Settings,
  { renderOnly = false, hasSplit = true }: { renderOnly?: boolean; hasSplit?: boolean } = {},
): string[] => {
  const out: string[] = [];
  if (a.format !== b.format) out.push(`formato ${FORMAT[b.format]}`);
  if (a.subtitles.style !== b.subtitles.style) out.push(`subtítulos ${STYLE[b.subtitles.style]}`);
  if (a.subtitles.size !== b.subtitles.size) out.push(`tamaño de subtítulos ${b.subtitles.size}`);
  if (a.subtitles.position !== b.subtitles.position) out.push(`subtítulos ${POS[b.subtitles.position]}`);
  if (a.subtitles.maxWords !== b.subtitles.maxWords) out.push(`${b.subtitles.maxWords} palabras por subtítulo`);
  if (a.subtitles.uppercase !== b.subtitles.uppercase) out.push(b.subtitles.uppercase ? "subtítulos en mayúsculas" : "subtítulos en minúsculas");
  if (a.music.enabled !== b.music.enabled) out.push(b.music.enabled ? "música activada" : "sin música");
  if (a.music.volume !== b.music.volume) out.push(`música al ${Math.round(b.music.volume * 100)}%`);
  if (a.music.track !== b.music.track) out.push(`música: ${b.music.track || "automática"}`);
  if (a.sfx.enabled !== b.sfx.enabled) out.push(b.sfx.enabled ? "con efectos de sonido" : "sin efectos de sonido");
  if (a.sfx.enabled && b.sfx.enabled && a.sfx.volume !== b.sfx.volume) out.push(`efectos al ${Math.round(b.sfx.volume * 100)}%`);
  if ((a.instructions ?? "") !== (b.instructions ?? "")) out.push(b.instructions?.trim() ? "indicaciones nuevas" : "sin indicaciones");
  const sa = a.style;
  const sb = b.style;
  if (sa.cut !== sb.cut) out.push(`cortes ${CUT_LABELS[sb.cut].toLowerCase()}`);
  if (sa.autoZoom !== sb.autoZoom) out.push(sb.autoZoom ? "zoom en cada corte" : "sin zoom en los cortes");
  if (hasSplit && sa.split.position !== sb.split.position) out.push(`gráfico ${sb.split.position === "top" ? "arriba" : "abajo"} en pantalla dividida`);
  if (hasSplit && sa.split.share !== sb.split.share) out.push(`pantalla dividida ${Math.round(sb.split.share * 100)}/${Math.round((1 - sb.split.share) * 100)}`);
  if (renderOnly) return out;
  if (sa.layoutUse !== sb.layoutUse) out.push(`gráficos: ${LAYOUT_USE_LABELS[sb.layoutUse].toLowerCase()}`);
  if (sa.pace !== sb.pace) out.push(`ritmo ${PACE_LABELS[sb.pace].toLowerCase()}`);
  if (sa.graphicsCount !== sb.graphicsCount) {
    out.push(sb.graphicsCount ? `${sb.graphicsCount} gráficos` : "cantidad de gráficos automática");
  }
  if (sa.graphics !== sb.graphics) out.push(`gráficos ${GRAPHICS_LABELS[sb.graphics].toLowerCase()}`);
  return out;
};
