/**
 * Archivos del pipeline de clon: clones/<id>/job.json, personajes y claves.
 * Lo usan el panel y el worker (scripts/clon/storage.ts lo re-exporta).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CLON_ID, PERSONAJE_SLUG, type ClonJob, type Personaje } from "./types";

const ROOT =
  process.env.REPO_ROOT ||
  path.resolve(process.cwd(), path.basename(process.cwd()) === "app" ? ".." : ".");

export const CLONES_DIR = path.join(ROOT, "clones");
export const PERSONAJES_DIR = path.join(ROOT, "assets", "personajes");
const CLAVES_FILE = path.join(PERSONAJES_DIR, "claves.json");

// ---------- clones ----------

export function clonDir(id: string) {
  if (!CLON_ID.test(id)) throw new Error("Clon inválido.");
  return path.join(CLONES_DIR, id);
}

export function readJob(id: string): ClonJob {
  const job = JSON.parse(fs.readFileSync(path.join(clonDir(id), "job.json"), "utf8")) as ClonJob;
  if (job.schema !== "clon-v1" || job.id !== id) throw new Error("Clon inválido.");
  return job;
}

export function saveJob(job: ClonJob) {
  const dir = clonDir(job.id);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.job-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2));
  fs.renameSync(tmp, path.join(dir, "job.json"));
}

export function busy(id: string) {
  const lock = path.join(clonDir(id), ".lock");
  try {
    const pid = Number(fs.readFileSync(lock, "utf8"));
    if (!Number.isInteger(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function claim(id: string) {
  const lock = path.join(clonDir(id), ".lock");
  if (busy(id)) throw new Error("Este clon ya está trabajando.");
  fs.rmSync(lock, { force: true });
  fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
  return () => fs.rmSync(lock, { force: true });
}

// ---------- personajes ----------

export function personajeDir(slug: string) {
  if (!PERSONAJE_SLUG.test(slug)) throw new Error("Personaje inválido.");
  return path.join(PERSONAJES_DIR, slug);
}

export function readPersonaje(slug: string): Personaje | null {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(personajeDir(slug), "personaje.json"), "utf8")) as Personaje;
    return { ...p, slug };
  } catch {
    return null;
  }
}

export function listPersonajes(): Personaje[] {
  if (!fs.existsSync(PERSONAJES_DIR)) return [];
  return fs
    .readdirSync(PERSONAJES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && PERSONAJE_SLUG.test(d.name))
    .flatMap((d) => {
      const p = readPersonaje(d.name);
      return p ? [p] : [];
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// ---------- claves de API ----------

export type Servicio = "kie" | "cartesia";
const ENV: Record<Servicio, string> = { kie: "KIE_API_KEY", cartesia: "CARTESIA_API_KEY" };

const leerClaves = (): Partial<Record<Servicio, string>> => {
  try {
    return JSON.parse(fs.readFileSync(CLAVES_FILE, "utf8"));
  } catch {
    return {};
  }
};

/** La clave en uso: la variable de entorno tiene prioridad sobre la guardada. */
export function leerClave(servicio: Servicio): string | null {
  const env = process.env[ENV[servicio]]?.trim();
  if (env) return env;
  const guardada = leerClaves()[servicio]?.trim();
  return guardada || null;
}

/** Solo si cada clave está cargada y de dónde sale. Nunca el valor. */
export function estadoClaves() {
  const guardadas = leerClaves();
  const estado = (s: Servicio) => ({
    cargada: Boolean(leerClave(s)),
    origen: process.env[ENV[s]]?.trim() ? ("entorno" as const) : guardadas[s]?.trim() ? ("panel" as const) : null,
  });
  return { kie: estado("kie"), cartesia: estado("cartesia") };
}

/** Guarda (o borra con null) una clave en claves.json, con permisos 600. */
export function guardarClave(servicio: Servicio, valor: string | null) {
  const claves = leerClaves();
  if (valor?.trim()) claves[servicio] = valor.trim();
  else delete claves[servicio];
  fs.mkdirSync(PERSONAJES_DIR, { recursive: true });
  const tmp = `${CLAVES_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(claves, null, 2), { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, CLAVES_FILE);
}
