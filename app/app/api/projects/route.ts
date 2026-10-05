import fs from "node:fs";
import path from "node:path";
import { saveBody, safeFilename, writeJson } from "@/lib/server/fsutil";
import { startPrepare } from "@/lib/server/pipeline";
import {
  listProjects,
  newProjectId,
  paths,
  readDefaultSettings,
  writeDefaultSettings,
  writeMeta,
  writeStatus,
} from "@/lib/server/projects";
import { normalizeSettings } from "@/lib/server/settings";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

const VIDEO_EXTS = [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"];

export async function GET() {
  return Response.json(listProjects());
}

/**
 * Subida: el cuerpo es el archivo crudo; el nombre va en el header x-filename.
 * x-settings (JSON) = cómo querés la edición, elegido antes de subir; con
 * x-remember: 1 también queda como predeterminado para los videos nuevos.
 */
export async function POST(req: Request) {
  const original = decodeURIComponent(req.headers.get("x-filename") ?? "video.mp4");
  const ext = path.extname(original).toLowerCase();
  if (!VIDEO_EXTS.includes(ext)) {
    return Response.json({ error: `Formato no soportado (${ext || "sin extensión"}). Subí un MP4, MOV, WEBM o MKV.` }, { status: 400 });
  }
  const id = newProjectId(original);
  const p = paths(id);
  fs.mkdirSync(p.raw, { recursive: true });
  writeMeta(id, {
    id,
    title: original.replace(/\.[^.]+$/, ""),
    createdAt: new Date().toISOString(),
    originalName: original,
  });
  let chosen: Partial<Settings> = {};
  try {
    chosen = JSON.parse(decodeURIComponent(req.headers.get("x-settings") ?? "{}"));
  } catch {
    /* sin ajustes elegidos: los predeterminados */
  }
  const settings = normalizeSettings(chosen, readDefaultSettings());
  writeJson(p.settings, settings);
  if (req.headers.get("x-remember") === "1") writeDefaultSettings(settings);
  writeStatus(id, "uploading", "Recibiendo el video…");
  try {
    const dest = path.join(p.raw, `original${ext}`);
    const bytes = await saveBody(req, dest);
    if (bytes < 1000) throw new Error("El archivo llegó vacío.");
    fs.writeFileSync(path.join(p.raw, ".source-name"), safeFilename(original));
  } catch (err) {
    writeStatus(id, "error", "Falló la subida", { error: (err as Error).message });
    return Response.json({ id, error: (err as Error).message }, { status: 500 });
  }
  startPrepare(id);
  return Response.json({ id });
}
