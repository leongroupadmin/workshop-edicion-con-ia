/**
 * Kie (https://api.kie.ai): sube la foto del personaje y genera cada clip con
 * Gemini Omni Video. Ojo: Kie contesta HTTP 200 aunque falle; lo que manda es
 * el campo `code` (200 = ok) y `msg`.
 *
 * Lo usan el panel (probar la clave) y scripts/clon (re-exportado en
 * scripts/clon/kie.ts). La clave se pasa siempre como parámetro.
 */
import fs from "node:fs";
import path from "node:path";
import { MODELOS, type ClonModelo, type ClonResolucion } from "./types";

export const KIE = "https://api.kie.ai";
/**
 * La subida de archivos vive en OTRO servidor (docs.kie.ai/file-upload-api/quickstart):
 * en api.kie.ai/api/file-stream-upload contesta 404.
 */
export const KIE_SUBIDAS = "https://kieai.redpandaai.co";

type Respuesta<T> = { code?: number; msg?: string; data?: T };

const headers = (clave: string) => ({ Authorization: `Bearer ${clave}` });

const leer = async <T>(res: Response, que: string): Promise<Respuesta<T>> => {
  const texto = await res.text();
  try {
    return JSON.parse(texto) as Respuesta<T>;
  } catch {
    throw new Error(`Kie devolvió una respuesta rara al ${que} (HTTP ${res.status}): ${texto.slice(0, 200)}`);
  }
};

const falla = (que: string, json: Respuesta<unknown>) => {
  if (json.code === 401 || json.code === 403) return new Error("La clave de Kie no funciona. Revisala en la pestaña Personajes.");
  if (json.code === 402) return new Error("No quedan créditos en Kie. Cargá saldo en kie.ai y reintentá.");
  return new Error(`Kie no pudo ${que}: ${json.msg ?? JSON.stringify(json).slice(0, 300)}`);
};

/** Sube un archivo y devuelve su URL pública (Kie la borra a las 24 h). */
export const subirFoto = async (clave: string, archivo: string, uploadPath = "images/clon") => {
  const form = new FormData();
  form.set("file", new Blob([fs.readFileSync(archivo)]), path.basename(archivo));
  form.set("uploadPath", uploadPath);
  form.set("fileName", `${Date.now()}-${path.basename(archivo)}`);
  const res = await fetch(`${KIE_SUBIDAS}/api/file-stream-upload`, { method: "POST", headers: headers(clave), body: form });
  const json = await leer<{ downloadUrl?: string }>(res, "subir la foto");
  if (json.code !== 200 || !json.data?.downloadUrl) throw falla("subir la foto", json);
  return json.data.downloadUrl;
};

export type PedidoClip = {
  prompt: string;
  fotoUrl: string;
  segundos: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  resolucion: ClonResolucion;
  modelo?: ClonModelo;
};

/**
 * Pide un clip. Devuelve el taskId. Cada modelo tiene su forma de pedido
 * (ver MODELOS en types.ts y docs.kie.ai/market):
 * - Grok Imagine: `mode: "normal"` (el "spicy" no anda con fotos propias) y
 *   duración en texto.
 * - Grok 1.5 preview: duración como número y audio activado.
 * - Gemini Omni: duración en texto ("4", "6", "8" o "10").
 */
export const crearTarea = async (clave: string, p: PedidoClip) => {
  const modelo = p.modelo ?? "gemini-omni-video";
  const spec = MODELOS[modelo];
  const d = spec.duracionKie;
  const fijas: readonly number[] | undefined = "fijas" in d ? d.fijas : undefined;
  if (!Number.isInteger(p.segundos) || p.segundos < d.min || p.segundos > d.max || (fijas && !fijas.includes(p.segundos)))
    throw new Error(`${spec.label} no genera clips de ${p.segundos} s (${fijas ? fijas.join(", ") : `de ${d.min} a ${d.max}`} s).`);
  if (modelo === "gemini-omni-video" && p.aspectRatio === "1:1") throw new Error("Gemini Omni no genera video cuadrado.");
  if (!(spec.resoluciones as readonly string[]).includes(p.resolucion))
    throw new Error(`${spec.label} no genera en ${p.resolucion}.`);
  const base = {
    prompt: p.prompt,
    image_urls: [p.fotoUrl],
    aspect_ratio: p.aspectRatio,
    resolution: p.resolucion,
    duration: d.tipo === "numero" ? p.segundos : String(p.segundos),
  };
  const input =
    modelo === "grok-imagine/image-to-video"
      ? { ...base, mode: "normal" }
      : modelo === "grok-imagine-video-1-5-preview"
        ? { ...base, enable_audio: true }
        : base;
  const res = await fetch(`${KIE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: { ...headers(clave), "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelo, input }),
  });
  const json = await leer<{ taskId?: string }>(res, "pedir el clip");
  if (json.code !== 200 || !json.data?.taskId) throw falla("pedir el clip", json);
  return json.data.taskId;
};

export type EstadoTarea =
  | { estado: "waiting" | "queuing" | "generating" }
  | { estado: "success"; url: string; creditos: number; segundosGeneracion: number }
  | { estado: "fail"; error: string };

/** Consulta una tarea una vez. */
export const consultarTarea = async (clave: string, taskId: string): Promise<EstadoTarea> => {
  const res = await fetch(`${KIE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers: headers(clave) });
  const json = await leer<{
    state?: string;
    resultJson?: string | { resultUrls?: string[] };
    creditsConsumed?: number;
    costTime?: number;
    failMsg?: string;
    failCode?: string;
  }>(res, "consultar el clip");
  if (json.code !== 200 || !json.data) throw falla("consultar el clip", json);
  const d = json.data;
  if (d.state === "success") {
    const r = typeof d.resultJson === "string" ? JSON.parse(d.resultJson) : d.resultJson;
    const url = r?.resultUrls?.[0];
    if (!url) return { estado: "fail", error: "Kie terminó sin devolver el video." };
    return { estado: "success", url, creditos: Number(d.creditsConsumed ?? 0), segundosGeneracion: Number(d.costTime ?? 0) };
  }
  if (d.state === "fail") return { estado: "fail", error: d.failMsg || d.failCode || "Kie no pudo generar el clip." };
  const estado = d.state === "waiting" || d.state === "queuing" ? d.state : "generating";
  return { estado };
};

/** Kie terminó la tarea con error: hay que pedir el clip de nuevo. */
export class FalloKie extends Error {}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera a que termine una tarea (cada 5 s, hasta 20 min). Tira error si falla. */
export const esperarTarea = async (
  clave: string,
  taskId: string,
  { onEstado, limiteMs = 20 * 60_000 }: { onEstado?: (estado: string) => void; limiteMs?: number } = {},
) => {
  const limite = Date.now() + limiteMs;
  let ultimo = "";
  let fallosRed = 0;
  while (Date.now() < limite) {
    let r: EstadoTarea;
    try {
      r = await consultarTarea(clave, taskId);
      fallosRed = 0;
    } catch (e) {
      // Un corte de red no es un fallo del clip: se reintenta la consulta.
      if (e instanceof TypeError && ++fallosRed < 6) {
        await dormir(5000);
        continue;
      }
      throw e;
    }
    if (r.estado !== ultimo) {
      ultimo = r.estado;
      onEstado?.(r.estado);
    }
    if (r.estado === "success") return r;
    if (r.estado === "fail") throw new FalloKie(r.error);
    await dormir(5000);
  }
  throw new Error("Pasaron 20 minutos y Kie no terminó el clip.");
};

/** Baja un archivo de una URL (los videos de Kie viven 14 días). */
export const bajar = async (url: string, destino: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo bajar el clip (HTTP ${res.status}).`);
  const tmp = `${destino}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(tmp, destino);
  return destino;
};

/** Prueba la clave con un GET autenticado (créditos de la cuenta). */
export const probarClave = async (clave: string): Promise<{ ok: boolean; mensaje: string }> => {
  try {
    const res = await fetch(`${KIE}/api/v1/chat/credit`, { headers: headers(clave) });
    const json = await leer<number>(res, "probar la clave");
    if (json.code === 200) {
      const creditos = typeof json.data === "number" ? ` Te quedan ${json.data} créditos.` : "";
      return { ok: true, mensaje: `Funciona.${creditos}` };
    }
    if (json.code === 401 || json.code === 403 || res.status === 401) return { ok: false, mensaje: "La clave no es válida." };
    return { ok: false, mensaje: `Kie respondió: ${json.msg ?? `código ${json.code}`}` };
  } catch (e) {
    return { ok: false, mensaje: `No me pude conectar con Kie: ${(e as Error).message}` };
  }
};
