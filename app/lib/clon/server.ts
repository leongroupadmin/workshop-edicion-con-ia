import "server-only";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { CLONES_DIR, clonDir, readJob, saveJob, busy, claim, personajeDir, readPersonaje } from "./storage";
import type { Settings } from "../types";
import { CLON_ID, type ClonAccion, type ClonJob, type Personaje } from "./types";
import { ROOT, safeFilename, writeJson } from "../server/fsutil";
import { snapshotProjectBrand, listBrands } from "../server/brands";
import { newProjectId, paths, readDefaultSettings, writeMeta, writeStatus } from "../server/projects";
import { normalizeSettings } from "../server/settings";
import { startPrepare } from "../server/pipeline";
import { runScript } from "../server/jobs";

export { clonDir, readJob, saveJob, busy };

export function listClones() {
  if (!fs.existsSync(CLONES_DIR)) return [];
  return fs
    .readdirSync(CLONES_DIR)
    .filter((id) => CLON_ID.test(id))
    .flatMap((id) => {
      try {
        return [readJob(id)];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Pasos que significan "hay un proceso trabajando". */
const TRABAJANDO: ClonJob["paso"][] = ["guion", "generando", "voz"];

/** Se cortó a mitad de camino (el panel o la compu se cerraron). */
export const interrumpido = (job: ClonJob) => TRABAJANDO.includes(job.paso) && !busy(job.id);

/** Acción que hay que relanzar para seguir (error o interrupción). */
export const accionPendiente = (job: ClonJob): ClonAccion | null => {
  if (job.paso === "error") return job.fallo ?? null;
  if (!interrumpido(job)) return null;
  return job.paso === "guion" ? "guion" : job.paso === "voz" ? "voz" : "generar";
};

/** Lanza el worker afuera del panel (sigue aunque se cierre la pestaña). */
export function launch(id: string, accion: ClonAccion) {
  claim(id);
  const job = readJob(id);
  job.paso = accion === "guion" ? "guion" : accion === "voz" ? "voz" : "generando";
  job.mensaje = "Iniciando…";
  delete job.error;
  delete job.fallo;
  saveJob(job);
  const log = fs.openSync(path.join(clonDir(id), "worker.log"), "a");
  try {
    const child = spawn(
      path.join(ROOT, "node_modules/.bin/tsx"),
      [path.join(ROOT, "scripts/clon/worker.ts"), id, accion, "--locked"],
      { cwd: ROOT, detached: true, stdio: ["ignore", log, log] },
    );
    if (child.pid) fs.writeFileSync(path.join(clonDir(id), ".lock"), String(child.pid));
    child.on("error", (error) => {
      const current = readJob(id);
      Object.assign(current, { paso: "error", fallo: accion, error: error.message, mensaje: "No se pudo iniciar el proceso." });
      saveJob(current);
      fs.rmSync(path.join(clonDir(id), ".lock"), { force: true });
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        const current = readJob(id);
        if (current.paso !== "error") {
          Object.assign(current, { paso: "error", fallo: accion, error: "El proceso se interrumpió. Podés reintentarlo." });
          saveJob(current);
        }
      }
    });
    child.unref();
  } catch (error) {
    fs.rmSync(path.join(clonDir(id), ".lock"), { force: true });
    throw error;
  } finally {
    fs.closeSync(log);
  }
}

/** Congela el personaje (datos + foto) dentro del clon. */
export function congelarPersonaje(id: string, slug: string): ClonJob["personaje"] {
  const p: Personaje | null = readPersonaje(slug);
  if (!p) throw new Error("Ese personaje ya no existe. Elegí otro.");
  if (!p.foto || !fs.existsSync(path.join(personajeDir(slug), p.foto)))
    throw new Error("El personaje no tiene foto. Subila en la pestaña Personajes.");
  if (!p.vozId) throw new Error("El personaje no tiene voz elegida. Elegila en la pestaña Personajes.");
  const destino = path.join(clonDir(id), "personaje");
  fs.mkdirSync(destino, { recursive: true });
  fs.copyFileSync(path.join(personajeDir(slug), p.foto), path.join(destino, p.foto));
  writeJson(path.join(destino, "personaje.json"), p);
  return {
    slug,
    nombre: p.nombre,
    descripcion: p.descripcion,
    encuadre: p.encuadre,
    vozId: p.vozId,
    vozNombre: p.vozNombre,
    acento: p.acento,
    acentoOtro: p.acentoOtro,
    restricciones: p.restricciones,
    energia: p.energia,
    registro: p.registro,
    foto: `personaje/${p.foto}`,
  };
}

/**
 * Paso 5: crea un proyecto de edición normal con final.mp4 en raw/ (igual que
 * subirlo desde "Nuevo video", con la marca y los ajustes que el usuario elige
 * en esa misma pantalla) y arranca el pipeline de edición de siempre. Se puede
 * repetir: cada vez es un proyecto nuevo (p.ej. para probar otro estilo).
 */
export function pasarAEdicion(id: string, brandSlug: string, elegidos: Partial<Settings> = {}) {
  const job = readJob(id);
  if (job.paso !== "listo") throw new Error("El video todavía no está listo.");
  const final = path.join(clonDir(id), "final.mp4");
  if (!fs.existsSync(final)) throw new Error("No encuentro el video final. Volvé a crear el video.");
  if (!brandSlug || !listBrands().some((b) => b.slug === brandSlug))
    throw new Error("Seleccioná una marca válida antes de pasar a edición.");

  const original = `${job.titulo}.mp4`;
  const proyecto = newProjectId(original);
  const p = paths(proyecto);
  const brand = snapshotProjectBrand(proyecto, brandSlug);
  fs.mkdirSync(p.raw, { recursive: true });
  writeMeta(proyecto, {
    id: proyecto,
    title: job.titulo,
    createdAt: new Date().toISOString(),
    originalName: original,
    brandSlug,
    brandName: brand.name,
  });
  // Lo que eligió en "Nuevo video" (la pantalla ya propone el formato del clon y
  // corte suave: el clon no tiene silencios ni muletillas que sacar).
  const base = readDefaultSettings();
  const settings =
    job.modo === "broll" ? normalizeSettings(soloSubtitulos(elegidos, base), base) : normalizeSettings(elegidos, base);
  writeJson(p.settings, settings);
  writeStatus(proyecto, "uploading", "Copiando el video del clon…");
  fs.copyFileSync(final, path.join(p.raw, "original.mp4"));
  fs.writeFileSync(path.join(p.raw, ".source-name"), safeFilename(original));
  job.proyectoId = proyecto;
  saveJob(job);
  if (job.modo === "broll") prepararYRenderizar(proyecto);
  else startPrepare(proyecto);
  return proyecto;
}

/**
 * Clon + B-roll en edición: SOLO subtítulos. De lo elegido se usan la IA y los
 * subtítulos (estilo y tipografía); todo lo demás se apaga: sin motion
 * graphics, zooms, transiciones, efectos ni música, sin indicaciones, corte
 * suave, vertical, y los subtítulos al medio (sobre la unión de las dos mitades).
 */
export const soloSubtitulos = (elegidos: Partial<Settings>, base: Settings): Partial<Settings> => ({
  aiProvider: elegidos.aiProvider ?? base.aiProvider,
  format: "vertical",
  subtitles: { ...base.subtitles, ...(elegidos.subtitles ?? {}), position: "middle" },
  style: { ...base.style, noGraphics: true, autoZoom: false, fixedLayout: false, cut: "soft" },
  music: { ...base.music, enabled: false },
  sfx: { ...base.sfx, enabled: false },
  instructions: "",
});

/**
 * Transcribir y cortar como siempre (los subtítulos salen de ahí) y renderizar
 * directo, sin pedirle el plan a Claude: no gasta tokens ni agrega nada. Usa
 * los mismos scripts que el pipeline de edición, sin cambiarlos.
 */
const prepararYRenderizar = (proyecto: string) => {
  writeStatus(proyecto, "transcribing", "Preparando…");
  runScript(proyecto, "Transcribir y cortar", "pipeline.ts", [], (ok) => {
    if (!ok) return;
    try {
      runScript(proyecto, "Renderizar", "render.ts", ["--note", "Solo subtítulos (Clon + B-roll)"]);
    } catch (err) {
      writeStatus(proyecto, "error", "No se pudo renderizar", { error: (err as Error).message });
    }
  });
};
