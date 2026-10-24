/**
 * Correcciones de palabras en los subtítulos (p.ej. Whisper escribió "guía"
 * donde se dijo "IA"). Cambia el texto de las palabras de la transcripción y
 * conserva sus tiempos, así los subtítulos siguen sincronizados.
 */
import type { Word } from "./types";

export type CorreccionSubtitulo = { find: string; replace: string };

const limpiar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ]/g, "");

const tokens = (t: string) => t.split(/\s+/).filter((x) => limpiar(x));

/**
 * Reemplaza cada aparición de `find` (palabras seguidas, sin importar
 * mayúsculas, tildes ni signos) por `replace`. Si cambia la cantidad de
 * palabras, reparte parejo el tiempo del tramo. Mantiene la puntuación final
 * del tramo original ("guía," → "IA,"). Devuelve las palabras nuevas y cuántos
 * tramos cambió.
 */
export const corregirPalabras = (words: Word[], c: CorreccionSubtitulo): { words: Word[]; cambios: number } => {
  const buscar = tokens(c.find).map(limpiar);
  const poner = tokens(c.replace);
  if (!buscar.length || !poner.length) return { words, cambios: 0 };
  const out: Word[] = [];
  let cambios = 0;
  for (let i = 0; i < words.length; ) {
    const tramo = words.slice(i, i + buscar.length);
    if (tramo.length === buscar.length && tramo.every((w, k) => limpiar(w.text) === buscar[k])) {
      const ini = tramo[0].startMs;
      const fin = tramo[tramo.length - 1].endMs;
      const signo = tramo[tramo.length - 1].text.match(/[.,;:!?…]+$/)?.[0] ?? "";
      const nuevas = poner.map((text, k) => {
        const mismo = poner.length === tramo.length;
        const paso = (fin - ini) / poner.length;
        return {
          text: k === poner.length - 1 && signo && !/[.,;:!?…]$/.test(text) ? text + signo : text,
          startMs: mismo ? tramo[k].startMs : Math.round(ini + paso * k),
          endMs: mismo ? tramo[k].endMs : Math.round(ini + paso * (k + 1)),
          confidence: null,
        };
      });
      out.push(...nuevas);
      cambios++;
      i += buscar.length;
    } else {
      out.push(words[i]);
      i++;
    }
  }
  return { words: out, cambios };
};

/** Las correcciones que mandó la IA, validadas (texto corto, sin vacíos). */
export const correccionesValidas = (value: unknown): CorreccionSubtitulo[] =>
  Array.isArray(value)
    ? value
        .filter(
          (x): x is CorreccionSubtitulo =>
            Boolean(x) && typeof x.find === "string" && typeof x.replace === "string" && x.find.trim().length > 0 && x.replace.trim().length > 0,
        )
        .map((x) => ({ find: x.find.trim().slice(0, 200), replace: x.replace.trim().slice(0, 200) }))
        .slice(0, 20)
    : [];
