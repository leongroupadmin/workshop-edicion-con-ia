/**
 * Clon + B-roll: arma el video vertical partido en dos (1080×1920): arriba el
 * B-roll sin audio, abajo el personaje ya ajustado a la voz, y la voz de
 * Cartesia. Todo local con FFmpeg.
 */
import { run } from "../lib/media";

export const ANCHO = 1080;
/** Cada mitad mide 1080×960 (50 / 50). */
export const ALTO_MITAD = 960;
export const FPS_PARTIDO = 30;
/** Si al B-roll le falta un poco para cubrir la voz, se estira hasta esto (no se nota). */
export const ESTIRAR_MAX = 1.15;
/** Del sobrante vertical del avatar, cuánto se recorta arriba (el resto abajo): así la cara queda adentro. */
const RECORTE_ARRIBA = 0.3;

/**
 * Cómo se acomoda el B-roll a la duración final (la manda la voz):
 * más largo → se corta; un poco más corto → se estira (hasta 15 %); y si aún
 * falta, el último cuadro queda quieto lo que haga falta.
 */
export const ajusteBroll = (brollS: number, finalS: number) => {
  if (brollS <= 0) throw new Error("El B-roll no tiene duración.");
  if (brollS >= finalS) return { estirar: 1, congelarS: 0 };
  const estirar = Math.min(ESTIRAR_MAX, finalS / brollS);
  return { estirar, congelarS: Math.max(0, finalS - brollS * estirar) };
};

/** Arma `destino`: B-roll arriba, avatar abajo, voz de Cartesia. Dura `duracionS` (la de la voz). */
export const armarPartido = async (p: {
  avatar: string;
  broll: string;
  brollS: number;
  audio: string;
  duracionS: number;
  destino: string;
}) => {
  const { estirar, congelarS } = ajusteBroll(p.brollS, p.duracionS);
  const d = p.duracionS.toFixed(3);
  const mitad = `scale=${ANCHO}:${ALTO_MITAD}:force_original_aspect_ratio=increase`;
  const arriba =
    `[1:v]setpts=${estirar.toFixed(5)}*(PTS-STARTPTS),fps=${FPS_PARTIDO},${mitad},crop=${ANCHO}:${ALTO_MITAD},setsar=1,` +
    `tpad=stop_mode=clone:stop_duration=${(congelarS + 1).toFixed(3)},trim=duration=${d},setpts=PTS-STARTPTS[arriba]`;
  const abajo =
    `[0:v]fps=${FPS_PARTIDO},${mitad},crop=${ANCHO}:${ALTO_MITAD}:(in_w-${ANCHO})/2:(in_h-${ALTO_MITAD})*${RECORTE_ARRIBA},setsar=1,` +
    `tpad=stop_mode=clone:stop_duration=1,trim=duration=${d},setpts=PTS-STARTPTS[abajo]`;
  await run("ffmpeg", [
    "-y", "-v", "error",
    "-i", p.avatar, "-i", p.broll, "-i", p.audio,
    "-filter_complex", `${arriba};${abajo};[arriba][abajo]vstack=inputs=2,format=yuv420p[v]`,
    "-map", "[v]", "-map", "2:a",
    "-c:v", "libx264", "-crf", "18", "-preset", "fast",
    "-c:a", "aac", "-b:a", "192k",
    "-t", d, "-movflags", "+faststart", p.destino,
  ]);
  return { estirar, congelarS };
};
