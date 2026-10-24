import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { clonDir, congelarPersonaje, launch, saveJob } from "./server";
import { armarBloques, duracionGuion, partirGuion } from "./guion";
import { encuadreDe, reglasDe, validarSettings, type ClonJob } from "./types";

/** Lo que manda el panel al crear un clon (normal o con B-roll). */
export type DatosClon = {
  titulo?: string;
  personaje?: string;
  settings?: Record<string, unknown>;
  modo?: "pegar" | "ia";
  texto?: string;
  /** Con IA: gancho y CTA opcionales, tal cual los escribe el usuario. */
  hook?: string;
  cta?: string;
};

/**
 * Pasos 1 y 2: personaje + ajustes + guion. Con un guion pegado queda listo
 * para aprobar; con un brief, la IA lo escribe en segundo plano.
 * Con `conBroll`, antes del guion se guarda y se mide el B-roll: el video va
 * vertical, la duración la pone el B-roll y el guion lo escribe la IA.
 */
export async function crearClon(
  datos: DatosClon,
  conBroll?: (id: string, dir: string) => Promise<NonNullable<ClonJob["broll"]>>,
): Promise<string> {
  let dir: string | undefined;
  try {
    const settings = validarSettings(datos.settings);
    const texto = typeof datos.texto === "string" ? datos.texto.trim() : "";
    if (datos.modo !== "pegar" && datos.modo !== "ia") throw new Error("Elegí si pegás el guion o lo escribe la IA.");
    const corto = (v: unknown, nombre: string) => {
      const t = datos.modo === "ia" && typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
      if (t.length > 300) throw new Error(`${nombre} es demasiado largo (máximo 300 caracteres).`);
      return t;
    };
    const hook = corto(datos.hook, "El gancho");
    const cta = corto(datos.cta, "El CTA");
    if (!texto && !(datos.modo === "ia" && (hook || cta)))
      throw new Error(datos.modo === "pegar" ? "Pegá el guion." : "Contá de qué trata el video.");
    if (texto.length > 8000) throw new Error("El texto es demasiado largo (máximo 8000 caracteres).");
    if (typeof datos.personaje !== "string" || !datos.personaje) throw new Error("Elegí un personaje.");
    // Con B-roll el guion lo escribe siempre la IA, para que dure lo mismo que el B-roll.
    if (conBroll && datos.modo !== "ia") throw new Error("Con B-roll el guion lo escribe la IA: contá de qué trata el video.");

    const id = `cl-${crypto.randomUUID()}`;
    dir = clonDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const personaje = congelarPersonaje(id, datos.personaje);
    const titulo =
      (typeof datos.titulo === "string" && datos.titulo.trim().slice(0, 120)) ||
      (texto || hook || cta).split(/\s+/).slice(0, 7).join(" ").replace(/[.,;:!?¡¿]+$/, "");
    const job: ClonJob = {
      schema: "clon-v1",
      id,
      createdAt: new Date().toISOString(),
      titulo,
      personaje,
      settings,
      guion: { origen: datos.modo === "ia" ? "ia" : "pegado", bloques: [] },
      paso: "esperando_aprobacion",
      mensaje: "",
    };
    if (conBroll) {
      job.modo = "broll";
      job.broll = await conBroll(id, dir);
      job.settings = { ...settings, formato: "vertical", duracionObjetivoS: Math.round(job.broll.duracionS) };
    }
    if (datos.modo === "pegar") {
      const reglas = reglasDe(job.settings.modelo);
      job.guion.bloques = armarBloques(partirGuion(texto, reglas), encuadreDe(job), reglas);
      const n = job.guion.bloques.length;
      const s = duracionGuion(job.guion.bloques);
      job.mensaje = `Guion partido en ${n} bloque${n === 1 ? "" : "s"}, unos ${s} s. Revisalo y aprobalo.`;
      saveJob(job);
    } else {
      job.guion.brief = texto;
      if (hook) job.guion.hook = hook;
      if (cta) job.guion.cta = cta;
      job.paso = "guion";
      job.mensaje = "La IA está escribiendo el guion…";
      saveJob(job);
      launch(id, "guion");
    }
    return id;
  } catch (error) {
    // Solo se borra la carpeta recién creada y rechazada; nunca un clon existente.
    if (dir && !fs.existsSync(path.join(dir, "job.json"))) fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}
