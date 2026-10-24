/**
 * Cartesia (https://api.cartesia.ai): lista de voces y cambio de voz
 * (voice changer), que conserva la entonación y los tiempos.
 *
 * Lo usan el panel (voces, probar la clave) y scripts/clon (re-exportado en
 * scripts/clon/cartesia.ts). La clave se pasa siempre como parámetro.
 */
import fs from "node:fs";
import path from "node:path";

export const CARTESIA = "https://api.cartesia.ai";
export const CARTESIA_VERSION = process.env.CARTESIA_VERSION || "2024-11-13";

const headers = (clave: string) => ({ "X-API-Key": clave, "Cartesia-Version": CARTESIA_VERSION });

export type Voz = { id: string; name: string; description?: string; language?: string };

const errorHttp = async (res: Response, que: string) => {
  if (res.status === 401 || res.status === 403) return new Error("La clave de Cartesia no funciona. Revisala en la pestaña Personajes.");
  if (res.status === 402) return new Error("No quedan créditos en Cartesia.");
  return new Error(`Cartesia no pudo ${que} (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
};

/** Voces disponibles, primero las de español. */
export const listarVoces = async (clave: string): Promise<Voz[]> => {
  const voces: Voz[] = [];
  let despues = "";
  // Hasta 5 páginas de 100 (si la API pagina; si devuelve una lista, es una sola).
  for (let pagina = 0; pagina < 5; pagina++) {
    const res = await fetch(`${CARTESIA}/voices/?limit=100${despues ? `&starting_after=${encodeURIComponent(despues)}` : ""}`, {
      headers: headers(clave),
    });
    if (!res.ok) {
      if (pagina > 0) break;
      throw await errorHttp(res, "traer las voces");
    }
    const json = await res.json();
    const lista: Voz[] = Array.isArray(json) ? json : (json.data ?? []);
    voces.push(...lista);
    if (Array.isArray(json) || !json.has_more || !lista.length) break;
    despues = lista[lista.length - 1].id;
  }
  const es = (v: Voz) => (v.language ?? "").toLowerCase().startsWith("es");
  return voces
    .filter((v, i, all) => v.id && all.findIndex((o) => o.id === v.id) === i)
    .map((v) => ({ id: v.id, name: v.name, description: v.description, language: v.language }))
    .sort((a, b) => Number(es(b)) - Number(es(a)) || a.name.localeCompare(b.name, "es"));
};

/** Cambia la voz de un audio conservando la entonación. Escribe un mp3 en `destino`. */
export const cambiarVoz = async (clave: string, audio: string, vozId: string, destino: string) => {
  const form = new FormData();
  form.set("clip", new Blob([fs.readFileSync(audio)]), path.basename(audio));
  form.set("voice[id]", vozId);
  form.set("output_format[container]", "mp3");
  form.set("output_format[sample_rate]", "44100");
  form.set("output_format[bit_rate]", "128000");
  const res = await fetch(`${CARTESIA}/voice-changer/bytes`, { method: "POST", headers: headers(clave), body: form });
  if (!res.ok) throw await errorHttp(res, "cambiar la voz");
  const tmp = `${destino}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(tmp, destino);
  return destino;
};

/** Versión de la API para leer texto (la misma que usa play.cartesia.ai → "Use API"). */
export const CARTESIA_VERSION_TTS = "2026-08-14";
export const MODELO_TTS = "sonic-3.6";

/**
 * Lee un texto con una voz (texto a voz, como en play.cartesia.ai) y escribe
 * un WAV en `destino`. Es la voz del clon: suena mucho mejor que cambiarle la
 * voz al audio de Kie, porque Cartesia arma la entonación desde cero.
 * Ojo: Cartesia acepta cualquier nombre de emoción sin dar error.
 */
export const leerTexto = async (
  clave: string,
  p: { texto: string; vozId: string; emocion: string; velocidad?: number; destino: string },
) => {
  const res = await fetch(`${CARTESIA}/tts/bytes`, {
    method: "POST",
    headers: { "X-API-Key": clave, "Cartesia-Version": CARTESIA_VERSION_TTS, "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: MODELO_TTS,
      transcript: p.texto,
      voice: p.vozId,
      locale: "es",
      output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 44100 },
      generation_config: { speed: p.velocidad ?? 1, volume: 1, emotion: p.emocion },
    }),
  });
  if (!res.ok) throw await errorHttp(res, "leer el guion");
  const tmp = `${p.destino}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(tmp, p.destino);
  return p.destino;
};

/** Prueba la clave con GET /voices/. */
export const probarClave = async (clave: string): Promise<{ ok: boolean; mensaje: string }> => {
  try {
    const res = await fetch(`${CARTESIA}/voices/?limit=1`, { headers: headers(clave) });
    if (res.ok) return { ok: true, mensaje: "Funciona." };
    if (res.status === 401 || res.status === 403) return { ok: false, mensaje: "La clave no es válida." };
    return { ok: false, mensaje: `Cartesia respondió HTTP ${res.status}.` };
  } catch (e) {
    return { ok: false, mensaje: `No me pude conectar con Cartesia: ${(e as Error).message}` };
  }
};
