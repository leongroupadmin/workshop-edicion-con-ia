import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

/** Raíz del repo (el panel corre desde /app). */
export const ROOT = process.env.REPO_ROOT
  ? path.resolve(process.env.REPO_ROOT)
  : path.resolve(process.cwd(), "..");

export const PROJECTS_DIR = path.join(ROOT, "projects");
export const BRAND_DIR = path.join(ROOT, "assets", "brand");
export const MUSIC_DIR = path.join(ROOT, "assets", "music");
/** Ajustes por defecto para videos nuevos (los guarda el panel). */
export const DEFAULTS_FILE = path.join(ROOT, "assets", "defaults.json");

export const projectDir = (id: string) => {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(id)) throw new Error("id inválido");
  return path.join(PROJECTS_DIR, id);
};

export const readJson = <T>(file: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
};

export const writeJson = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
};

/** Resuelve una ruta relativa dentro de `base`, rechazando ../ */
export const safeJoin = (base: string, rel: string) => {
  const full = path.resolve(base, rel);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error("ruta inválida");
  return full;
};

export const safeFilename = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "archivo";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".json": "application/json",
  ".log": "text/plain; charset=utf-8",
};

/** Sirve un archivo con soporte de Range (para el reproductor de video). */
export const fileResponse = (file: string, req: Request, download?: string) => {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return new Response("No encontrado", { status: 404 });
  }
  const size = fs.statSync(file).size;
  const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };
  if (download) headers["Content-Disposition"] = `attachment; filename="${download}"`;
  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m?.[1] ? parseInt(m[1], 10) : 0;
    let end = m?.[2] ? parseInt(m[2], 10) : size - 1;
    if (!m?.[1] && m?.[2]) {
      start = Math.max(0, size - parseInt(m[2], 10));
      end = size - 1;
    }
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
      },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
};

/** Guarda el cuerpo de un request (subida binaria) en disco sin cargarlo en memoria. */
export const saveBody = async (req: Request, dest: string) => {
  if (!req.body) throw new Error("Sin contenido");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const out = fs.createWriteStream(dest);
  const reader = req.body.getReader();
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
    }
  } finally {
    await new Promise<void>((r) => out.end(() => r()));
  }
  return bytes;
};

/**
 * Mueve archivos o carpetas a la Papelera de macOS (se pueden recuperar desde
 * el Finder). Nunca borra de forma definitiva.
 */
export const moveToTrash = async (targets: string[]) => {
  const existing = targets.filter((t) => fs.existsSync(t));
  if (!existing.length) return;
  const bin = "/usr/bin/trash";
  if (!fs.existsSync(bin)) throw new Error("No encontré la Papelera del sistema (hace falta macOS 15 o más nuevo).");
  await new Promise<void>((resolve, reject) =>
    execFile(bin, existing, (err, _stdout, stderr) =>
      err ? reject(new Error(`No se pudo mover a la Papelera: ${stderr.trim() || err.message}`)) : resolve(),
    ),
  );
};

export const tail = (file: string, maxLines = 200) => {
  try {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    return lines.slice(-maxLines).join("\n");
  } catch {
    return "";
  }
};
