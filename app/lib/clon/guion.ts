/**
 * Guion en bloques: cada bloque es un clip de Kie. Cuánto puede durar cada
 * clip depende del modelo (`MODELOS[...].bloque` en types.ts): Gemini Omni solo
 * 8 o 10 s; Grok cualquier segundo entero entre su mínimo y su máximo. La
 * cantidad de palabras por bloque sale de un ritmo de habla natural en español.
 */
import {
  ENCUADRE_BASE,
  ENCUADRE_MEDIA_PANTALLA,
  RESTRICCIONES,
  RESTRICCIONES_BASE,
  energiaDe,
  textoAcento,
  type Bloque,
  type Personaje,
  type ReglasBloque,
} from "./types";

/** Ritmo natural de habla en español (unas 150 palabras por minuto). */
export const PALABRAS_POR_SEGUNDO = 2.5;
/** Un bloque con menos palabras que esto se pega al anterior si entra. */
const MIN_PALABRAS = 8;

/**
 * Palabras que entran como máximo en un bloque. Con duraciones libres se deja
 * 1 s de aire (para arrancar y cerrar sin cortar la última palabra).
 */
export const maxPalabras = (r: ReglasBloque) =>
  Math.floor((r.fijas ? Math.max(...r.fijas) : r.max - 1) * PALABRAS_POR_SEGUNDO);

const limpiar = (t: string) => t.replace(/\s+/g, " ").trim();
const palabras = (t: string) => limpiar(t).split(" ").filter(Boolean);
export const contarPalabras = (t: string) => palabras(t).length;

/** Segundos de clip que necesita un texto según el modelo. */
export const segundosPara = (texto: string, r: ReglasBloque) => {
  const n = contarPalabras(texto);
  if (r.fijas) return r.fijas.find((f) => n <= f * PALABRAS_POR_SEGUNDO) ?? Math.max(...r.fijas);
  return Math.min(r.max, Math.max(r.min, Math.ceil(n / PALABRAS_POR_SEGUNDO) + 1));
};

/** Parte una lista de palabras en trozos parejos de como máximo `max`. */
const trozosParejos = (ws: string[], max: number) => {
  const n = Math.ceil(ws.length / max);
  const tam = Math.ceil(ws.length / n);
  const out: string[] = [];
  for (let i = 0; i < ws.length; i += tam) out.push(ws.slice(i, i + tam).join(" "));
  return out;
};

/** Junta piezas en grupos de como máximo `max` palabras, sin partir ninguna. */
const empaquetar = (piezas: string[], max: number, objetivo = max) => {
  const out: string[] = [];
  let actual: string[] = [];
  let n = 0;
  for (const p of piezas) {
    const k = contarPalabras(p);
    if (n > 0 && (n + k > max || n >= objetivo)) {
      out.push(actual.join(" "));
      actual = [];
      n = 0;
    }
    actual.push(p);
    n += k;
  }
  if (actual.length) out.push(actual.join(" "));
  return out;
};

/** Frases de como máximo `max` palabras: corta por oraciones, después por comas y si no alcanza por palabras. */
const unidades = (texto: string, max: number) =>
  limpiar(texto)
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean)
    .flatMap((oracion) => {
      if (contarPalabras(oracion) <= max) return [oracion];
      const partes = oracion
        .split(/(?<=[,;:])\s+/)
        .flatMap((p) => (contarPalabras(p) <= max ? [p] : trozosParejos(palabras(p), max)));
      return empaquetar(partes, max);
    });

/**
 * Parte un guion en textos de bloque. Ninguno pasa del máximo del modelo y se
 * reparten parejos: mejor dos bloques de 15 palabras que uno de 25 y otro de 5.
 */
export const partirGuion = (texto: string, r: ReglasBloque): string[] => {
  const max = maxPalabras(r);
  const us = unidades(texto, max);
  const total = us.reduce((a, u) => a + contarPalabras(u), 0);
  if (!total) return [];
  const objetivo = total / Math.ceil(total / max);
  const bloques = empaquetar(us, max, objetivo);
  // Un último bloque muy corto se pega al anterior si entra.
  if (bloques.length > 1) {
    const ultimo = bloques[bloques.length - 1];
    const previo = bloques[bloques.length - 2];
    if (contarPalabras(ultimo) < MIN_PALABRAS && contarPalabras(previo) + contarPalabras(ultimo) <= max) {
      bloques.splice(-2, 2, `${previo} ${ultimo}`);
    }
  }
  return bloques;
};

/**
 * Arma los bloques del guion a partir de textos (uno por bloque). Un texto
 * demasiado largo se parte en varios; uno vacío se descarta.
 */
export const armarBloques = (textos: string[], encuadre: string, r: ReglasBloque): Bloque[] =>
  textos
    .flatMap((t) => (contarPalabras(t) <= maxPalabras(r) ? [limpiar(t)] : partirGuion(t, r)))
    .filter(Boolean)
    .map((texto, i) => ({ id: `b${i + 1}`, texto, encuadre, segundos: segundosPara(texto, r), estado: "pendiente" }));

/** Segundos totales del guion. */
export const duracionGuion = (bloques: Pick<Bloque, "segundos">[]) => bloques.reduce((a, b) => a + b.segundos, 0);

/** Palabras que conviene pedirle a la IA para una duración objetivo (un poco por debajo del máximo, para respirar). */
export const palabrasObjetivo = (segundos: number) => Math.round(segundos * PALABRAS_POR_SEGUNDO * 0.88);

/** Con B-roll: avisa si el guion queda muy largo o muy corto para el video. */
export const avisoDuracion = (guionS: number, brollS: number) =>
  guionS > brollS * 1.15
    ? ` Ojo: el guion dura unos ${guionS} s y el B-roll ${Math.round(brollS)} s; acortalo o el final del B-roll se va a ver más lento o quieto.`
    : guionS < brollS * 0.8
      ? ` Ojo: el guion dura unos ${guionS} s y el B-roll ${Math.round(brollS)} s; el B-roll se va a cortar antes.`
      : "";

/** Encuadre por defecto en inglés (para los modelos que piden prompt en inglés). */
const ENCUADRE_MEDIA_PANTALLA_EN =
  "Chest-up shot of the person in the photo, face clearly visible and centered, looking at the camera, static camera, same lighting and same background";
const ENCUADRE_BASE_EN =
  "Medium shot of the person in the photo, looking at the camera, static camera, same lighting and same background";

/**
 * El pedido a Kie de un bloque: encuadre + quién es + acento + el texto exacto
 * entre comillas (para que lo diga tal cual) + lo que el video no tiene que traer.
 * Con `en` (Grok) las indicaciones van en inglés y lo que dice, en español.
 */
export const promptBloque = (
  bloque: Pick<Bloque, "texto" | "encuadre">,
  personaje: Pick<Personaje, "descripcion" | "acento" | "acentoOtro" | "restricciones" | "energia">,
  { en = false }: { en?: boolean } = {},
) => {
  const texto = limpiar(bloque.texto).replace(/"/g, "'");
  const punto = (t: string) => limpiar(t).replace(/\.?$/, ".");
  const propio = limpiar(bloque.encuadre);
  const encuadre = punto(
    propio === ENCUADRE_MEDIA_PANTALLA && en
      ? ENCUADRE_MEDIA_PANTALLA_EN
      : propio && propio !== ENCUADRE_BASE
        ? propio
        : en
          ? ENCUADRE_BASE_EN
          : ENCUADRE_BASE,
  );
  const quien = personaje.descripcion.trim() ? ` ${punto(personaje.descripcion)}` : "";
  const acento = textoAcento(personaje);
  const energia = energiaDe(personaje.energia);
  const lista = (personaje.restricciones ?? RESTRICCIONES_BASE).filter((r) => r in RESTRICCIONES);
  const soloVoz = lista.includes("musica") && lista.includes("sonidos");
  if (en) {
    const habla = ` The person speaks in Spanish${acento.en ? ` ${acento.en}` : ""}, ${energia.en}, and says exactly these words, without adding or removing any: "${texto}"`;
    const sinNada = lista.length ? ` ${lista.map((r) => RESTRICCIONES[r].en).join(", ").replace(/^./, (c) => c.toUpperCase())}.` : "";
    return `@image1 ${encuadre}${quien}${habla}${sinNada}${soloVoz ? " Only their voice is heard." : ""}`;
  }
  const habla = ` Habla en español${acento.prompt ? ` ${acento.prompt}` : ""}, ${energia.prompt}, y dice exactamente esto, sin agregar ni quitar palabras: "${texto}"`;
  const sinNada = lista.length ? ` El video va ${lista.map((r) => RESTRICCIONES[r].prompt).join(", ")}.` : "";
  return `${encuadre}${quien}${habla}${sinNada}${soloVoz ? " Solo se escucha su voz." : ""}`;
};

const palabrasSueltas = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/**
 * Qué no respetó la IA: el guion tiene que arrancar con el gancho y terminar
 * con el CTA, palabra por palabra (sin contar signos ni mayúsculas).
 */
export const faltanGanchoOCta = (textos: string[], hook?: string, cta?: string) => {
  const todo = palabrasSueltas(textos.join(" "));
  const faltan: string[] = [];
  const h = palabrasSueltas(hook ?? "");
  const c = palabrasSueltas(cta ?? "");
  if (h.length && todo.slice(0, h.length).join(" ") !== h.join(" ")) faltan.push("el gancho");
  if (c.length && todo.slice(-c.length).join(" ") !== c.join(" ")) faltan.push("el CTA");
  return faltan;
};
