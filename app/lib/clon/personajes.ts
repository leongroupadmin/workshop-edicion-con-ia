import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PERSONAJES_DIR, personajeDir, readPersonaje } from "./storage";
import { ACENTOS, ACENTO_BASE, ENCUADRE_BASE, ENERGIAS, ENERGIA_BASE, type Energia, REGISTROS, REGISTRO_BASE, type Registro, PERSONAJE_SLUG, RESTRICCIONES, type Acento, type Personaje, type Restriccion } from "./types";
import { moveToTrash, safeFilename, writeJson } from "../server/fsutil";

/** Nombres de carpeta que usan las rutas de la API: no pueden ser personajes. */
const RESERVADOS = new Set(["claves", "voces"]);
export const FOTO_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

const RESTRICCIONES_VALIDAS = Object.keys(RESTRICCIONES) as Restriccion[];

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Valida lo que manda el panel. */
export const datosPersonaje = (body: Record<string, unknown>) => {
  const nombre = texto(body.nombre, 60);
  if (!nombre) throw new Error("Poné el nombre del personaje.");
  const acento: Acento = typeof body.acento === "string" && body.acento in ACENTOS ? (body.acento as Acento) : ACENTO_BASE;
  if (acento === "otro" && !texto(body.acentoOtro, 120)) throw new Error("Escribí qué acento tiene el personaje.");
  return {
    nombre,
    descripcion: texto(body.descripcion, 600),
    encuadre: texto(body.encuadre, 400) || ENCUADRE_BASE,
    vozId: texto(body.vozId, 120),
    vozNombre: texto(body.vozNombre, 120) || undefined,
    acento,
    acentoOtro: acento === "otro" ? texto(body.acentoOtro, 120) || undefined : undefined,
    energia: (typeof body.energia === "string" && body.energia in ENERGIAS ? body.energia : ENERGIA_BASE) as Energia,
    registro: (typeof body.registro === "string" && body.registro in REGISTROS ? body.registro : REGISTRO_BASE) as Registro,
    restricciones: Array.isArray(body.restricciones)
      ? RESTRICCIONES_VALIDAS.filter((r) => (body.restricciones as unknown[]).includes(r))
      : RESTRICCIONES_VALIDAS,
  };
};

const slugDe = (nombre: string) => {
  const base =
    safeFilename(nombre.toLowerCase().replace(/\s+/g, "-"))
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "personaje";
  let slug = base;
  for (let i = 2; RESERVADOS.has(slug) || fs.existsSync(path.join(PERSONAJES_DIR, slug)); i++) slug = `${base}-${i}`;
  if (!PERSONAJE_SLUG.test(slug)) throw new Error("No se pudo armar el nombre de la carpeta.");
  return slug;
};

export const crearPersonaje = (body: Record<string, unknown>): Personaje => {
  const ahora = new Date().toISOString();
  const slug = slugDe(texto(body.nombre, 60));
  const p: Personaje = { slug, ...datosPersonaje(body), createdAt: ahora, updatedAt: ahora };
  writeJson(path.join(personajeDir(slug), "personaje.json"), p);
  return p;
};

export const editarPersonaje = (slug: string, body: Record<string, unknown>): Personaje => {
  const actual = readPersonaje(slug);
  if (!actual) throw new Error("Ese personaje ya no existe.");
  const p: Personaje = { ...actual, ...datosPersonaje(body), slug, updatedAt: new Date().toISOString() };
  writeJson(path.join(personajeDir(slug), "personaje.json"), p);
  return p;
};

/** Reemplaza la foto (foto.<ext>) por el archivo recién subido. */
export const ponerFoto = (slug: string, subido: string, ext: string) => {
  const p = readPersonaje(slug);
  if (!p) throw new Error("Ese personaje ya no existe.");
  const dir = personajeDir(slug);
  for (const e of FOTO_EXTS) if (e !== ext) fs.rmSync(path.join(dir, `foto${e}`), { force: true });
  fs.renameSync(subido, path.join(dir, `foto${ext}`));
  const nuevo: Personaje = { ...p, foto: `foto${ext}`, updatedAt: new Date().toISOString() };
  writeJson(path.join(dir, "personaje.json"), nuevo);
  return nuevo;
};

/** Manda la carpeta del personaje a la Papelera (los clones ya creados tienen su copia). */
export const eliminarPersonaje = async (slug: string) => {
  const dir = personajeDir(slug);
  if (!fs.existsSync(dir)) return;
  await moveToTrash([dir]);
};
