/**
 * Sincroniza el video de Kie con la voz que lee Cartesia, sin otra IA:
 * Whisper marca cuándo empieza cada palabra en la voz de Kie (la que mueve los
 * labios del video) y en la de Cartesia; se emparejan las palabras y el video
 * se acelera o frena tramo por tramo para que cada palabra caiga donde suena en
 * Cartesia. Las pausas que Kie tiene de más (sobre todo en las uniones entre
 * clips) se cortan.
 */
import fs from "node:fs";
import path from "node:path";
import { run } from "../lib/media";

export type Palabra = { text: string; startMs: number; endMs: number };
/** Un punto que se corresponde en los dos audios: segundo en Kie → segundo en Cartesia. */
export type Ancla = [number, number];
/** Un tramo del video de Kie y cuántos cuadros ocupa en el video final. */
export type Pieza = { ini: number; fin: number; frames: number };

export const FPS = 30;
/** Aire al final, después de la última palabra (segundos). */
export const COLA_S = 0.4;
/** Una pausa de Kie más larga que esto se puede cortar. */
const PAUSA_MS = 300;
/** Tramos con voz: cuánto se puede frenar o acelerar el video como máximo (nivel Suave). */
export const VELOCIDAD_MIN = 0.6;
export const VELOCIDAD_MAX = 1.6;

/**
 * Niveles de sincronización (el botón "Mejorar la sincronización" del clon).
 * Más nivel = tramos más cortos y más margen de velocidad: cada palabra cae
 * más justa, a cambio de más cambios de velocidad cortitos en el cuerpo.
 * `silencios`: corrige con el silencio real del audio dónde termina la palabra
 * antes de una pausa (Whisper ahí suele equivocarse).
 */
export const NIVELES = {
  1: { label: "Suave", tramoKie: 0.6, tramoCart: 0.4, vmin: VELOCIDAD_MIN, vmax: VELOCIDAD_MAX, silencios: false },
  2: { label: "Precisa", tramoKie: 0.35, tramoCart: 0.25, vmin: 0.5, vmax: 2, silencios: true },
  3: { label: "Máxima", tramoKie: 0.25, tramoCart: 0.2, vmin: 0.5, vmax: 2, silencios: true },
} as const;
export type Nivel = keyof typeof NIVELES;
export type ReglasSincro = { tramoKie: number; tramoCart: number; vmin: number; vmax: number; silencios: boolean };

/**
 * Corrige los bordes de las palabras con los silencios medidos en el audio:
 * si entre dos palabras hay un silencio de verdad, la primera termina donde
 * empieza el silencio y la segunda empieza donde termina.
 */
export const ajustarConSilencios = <T extends Palabra>(
  palabras: T[],
  silencios: { startMs: number; endMs: number }[],
  minMs = 120,
): T[] => {
  const out = palabras.map((w) => ({ ...w }));
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i];
    const b = out[i + 1];
    const s = silencios
      .filter((x) => x.endMs - x.startMs >= minMs && x.startMs > a.startMs + 60 && x.endMs < b.endMs - 60)
      .sort((x, y) => y.endMs - y.startMs - (x.endMs - x.startMs))[0];
    if (!s) continue;
    a.endMs = Math.min(a.endMs, s.startMs);
    b.startMs = Math.max(b.startMs, s.endMs);
  }
  return out;
};

/** "¿Querés," → "queres": para comparar palabras sin tildes ni signos. */
export const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, "");

/**
 * Empareja las palabras de los dos audios (subsecuencia común más larga): si
 * Kie cambió o se salteó alguna, el resto igual se empareja.
 * Devuelve pares de índices [i en Kie, j en Cartesia].
 */
export const emparejar = (a: Palabra[], b: Palabra[]): [number, number][] => {
  const x = a.map((w) => normalizar(w.text));
  const y = b.map((w) => normalizar(w.text));
  const n = x.length;
  const m = y.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = x[i] && x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pares: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] && x[i] === y[j]) {
      pares.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pares;
};

/**
 * Anclas entre los dos audios. Las de inicio/fin de cada pausa larga de Kie,
 * la del principio y la del final son fijas; las de cada palabra se ralean
 * hasta que ningún tramo con voz quede más corto que lo que dice el nivel ni
 * haya que frenarlo o acelerarlo fuera de su margen de velocidad.
 */
export const calcularAnclas = (kie: Palabra[], cartesia: Palabra[], nivel: ReglasSincro = NIVELES[1]) => {
  const pares = emparejar(kie, cartesia);
  if (pares.length < Math.max(2, Math.min(kie.length, cartesia.length) * 0.5))
    throw new Error("La voz de Cartesia y la del video dicen cosas muy distintas: no se pueden sincronizar.");
  const s = (ms: number) => ms / 1000;
  const clave = (a: Ancla) => `${a[0].toFixed(4)}|${a[1].toFixed(4)}`;
  const inicio: Ancla = [0, 0];
  const anclas: Ancla[] = [inicio];
  const fijas = new Set([clave(inicio)]);
  const pausas = new Set<string>();
  pares.forEach(([i, j], k) => {
    anclas.push([s(kie[i].startMs), s(cartesia[j].startMs)]);
    const sig = pares[k + 1];
    if (sig && kie[sig[0]].startMs - kie[i].endMs > PAUSA_MS) {
      const a: Ancla = [s(kie[i].endMs), s(cartesia[j].endMs)];
      const b: Ancla = [s(kie[sig[0]].startMs), s(cartesia[sig[1]].startMs)];
      anclas.push(a);
      fijas.add(clave(a));
      fijas.add(clave(b));
      pausas.add(`${a[0].toFixed(4)}|${b[0].toFixed(4)}`);
    }
  });
  const [ui, uj] = pares[pares.length - 1];
  const fin: Ancla = [s(kie[ui].endMs), s(cartesia[uj].endMs)];
  const cola: Ancla = [fin[0] + COLA_S, fin[1] + COLA_S];
  anclas.push(fin, cola);
  fijas.add(clave(fin));
  fijas.add(clave(cola));
  // Ordenadas y sin repetidas ni cruzadas (las dos líneas de tiempo tienen que avanzar juntas).
  const unicas = [...new Map(anclas.map((a) => [clave(a), a])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const ordenadas: Ancla[] = [];
  for (const a of unicas) {
    const prev = ordenadas[ordenadas.length - 1];
    if (prev && (a[0] < prev[0] || a[1] < prev[1])) {
      if (!fijas.has(clave(a))) continue;
      if (!fijas.has(clave(prev))) ordenadas.pop();
    }
    ordenadas.push(a);
  }
  const esPausa = (a: Ancla, b: Ancla) => pausas.has(`${a[0].toFixed(4)}|${b[0].toFixed(4)}`);
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (let k = 1; k < ordenadas.length; k++) {
      const a = ordenadas[k - 1];
      const b = ordenadas[k];
      if (esPausa(a, b)) continue;
      const dk = b[0] - a[0];
      const dc = b[1] - a[1];
      const f = dk > 0 ? dc / dk : Infinity;
      if (dk >= nivel.tramoKie && dc >= nivel.tramoCart && f >= nivel.vmin && f <= nivel.vmax) continue;
      if (!fijas.has(clave(b))) ordenadas.splice(k, 1);
      else if (!fijas.has(clave(a))) ordenadas.splice(k - 1, 1);
      else continue;
      cambio = true;
      break;
    }
  }
  return { anclas: ordenadas, emparejadas: pares.length, esPausa };
};

/**
 * Tramos del video de Kie y cuántos cuadros ocupa cada uno en el final. Una
 * pausa de Kie más larga que la de Cartesia se corta: queda su principio a
 * velocidad normal y el resto desaparece (corte limpio, no un adelanto rápido).
 */
export const calcularPiezas = (
  anclas: Ancla[],
  esPausa: (a: Ancla, b: Ancla) => boolean = () => false,
  vmin: number = VELOCIDAD_MIN,
): Pieza[] => {
  const piezas: Pieza[] = [];
  for (let k = 1; k < anclas.length; k++) {
    const [ka, ca] = anclas[k - 1];
    const [kb, cb] = anclas[k];
    const frames = Math.round(cb * FPS) - Math.round(ca * FPS);
    if (frames <= 0 || kb <= ka) continue;
    const corte = esPausa(anclas[k - 1], anclas[k]) && frames / FPS / (kb - ka) < vmin;
    piezas.push({ ini: ka, fin: corte ? ka + frames / FPS : kb, frames });
  }
  return piezas;
};

/** Dónde cae en el video final un segundo del video de Kie (interpolando entre anclas). */
export const mapear = (anclas: Ancla[], t: number) => {
  for (let k = 1; k < anclas.length; k++) {
    const [ka, ca] = anclas[k - 1];
    const [kb, cb] = anclas[k];
    if (t >= ka && t <= kb && kb > ka) return ca + ((t - ka) * (cb - ca)) / (kb - ka);
  }
  return null;
};

/** Cuánto queda corrida cada palabra emparejada (ms): para avisar si la sincronización quedó floja. */
export const desfases = (kie: Palabra[], cartesia: Palabra[], anclas: Ancla[]) =>
  emparejar(kie, cartesia)
    .map(([i, j]) => {
      const m = mapear(anclas, kie[i].startMs / 1000);
      return m === null ? null : Math.abs(m * 1000 - cartesia[j].startMs);
    })
    .filter((e): e is number => e !== null)
    .sort((a, b) => a - b);

/** Arma el video ajustado (sin audio) en `destino`, tramo por tramo. */
export const armarVideo = async (video: string, piezas: Pieza[], trabajo: string, destino: string) => {
  fs.rmSync(trabajo, { recursive: true, force: true });
  fs.mkdirSync(trabajo, { recursive: true });
  const lista: string[] = [];
  for (const [n, p] of piezas.entries()) {
    const salida = path.join(trabajo, `p${String(n).padStart(4, "0")}.mp4`);
    const desde = Math.max(0, p.ini - 1);
    const factor = p.frames / FPS / (p.fin - p.ini);
    await run("ffmpeg", [
      "-y", "-v", "error", "-ss", desde.toFixed(3), "-i", video, "-an",
      "-vf",
      `trim=start=${(p.ini - desde).toFixed(4)}:duration=${(p.fin - p.ini).toFixed(4)},` +
        `setpts=${factor.toFixed(6)}*(PTS-STARTPTS),fps=${FPS},tpad=stop_mode=clone:stop_duration=1`,
      "-frames:v", String(p.frames),
      "-c:v", "libx264", "-crf", "17", "-preset", "fast", "-pix_fmt", "yuv420p", salida,
    ]);
    lista.push(salida);
  }
  const txt = path.join(trabajo, "lista.txt");
  fs.writeFileSync(txt, lista.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
  await run("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", txt, "-c", "copy", destino]);
  fs.rmSync(trabajo, { recursive: true, force: true });
};
