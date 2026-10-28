import fs from "node:fs";
import path from "node:path";
import { DEFAULTS_FILE, MUSIC_DIR, fileResponse, moveToTrash, readJson, safeFilename, safeJoin, saveBody, writeJson } from "@/lib/server/fsutil";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

const EXTS = [".mp3", ".wav", ".m4a", ".aac", ".ogg"];

const list = (dir: string, prefix = ""): string[] =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((d) =>
          d.isDirectory()
            ? d.name === "sfx"
              ? []
              : list(path.join(dir, d.name), `${prefix}${d.name}/`)
            : EXTS.includes(path.extname(d.name).toLowerCase())
              ? [`${prefix}${d.name}`]
              : [],
        )
    : [];

/** GET: lista de pistas (y efectos). ?play=ruta para escuchar una. */
export async function GET(req: Request) {
  const play = new URL(req.url).searchParams.get("play");
  if (play) {
    try {
      return fileResponse(safeJoin(MUSIC_DIR, play), req);
    } catch {
      return new Response("No permitido", { status: 403 });
    }
  }
  return Response.json({
    tracks: list(MUSIC_DIR).sort(),
    sfx: list(path.join(MUSIC_DIR, "sfx")).sort(),
  });
}

/** Subir música (?sfx=1 para efectos de sonido). */
export async function POST(req: Request) {
  const original = decodeURIComponent(req.headers.get("x-filename") ?? "musica.mp3");
  const ext = path.extname(original).toLowerCase();
  if (!EXTS.includes(ext)) return Response.json({ error: "Formato de audio no soportado (MP3, WAV, M4A, AAC u OGG)." }, { status: 400 });
  const sfx = new URL(req.url).searchParams.get("sfx") === "1";
  const dest = path.join(MUSIC_DIR, sfx ? "sfx" : "", safeFilename(original));
  await saveBody(req, dest);
  return Response.json({ ok: true, file: path.relative(MUSIC_DIR, dest) });
}

/**
 * DELETE ?file=ruta (&sfx=1): manda el audio a la Papelera del sistema. Si era la
 * música elegida para los videos nuevos, la deja sin elegir.
 */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const rel = url.searchParams.get("file");
  if (!rel) return Response.json({ error: "Falta el archivo." }, { status: 400 });
  const sfx = url.searchParams.get("sfx") === "1";
  let file: string;
  try {
    file = safeJoin(MUSIC_DIR, sfx ? `sfx/${rel}` : rel);
  } catch {
    return Response.json({ error: "No permitido" }, { status: 403 });
  }
  if (!EXTS.includes(path.extname(file).toLowerCase())) {
    return Response.json({ error: "No permitido" }, { status: 403 });
  }
  try {
    await moveToTrash([file]);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  if (!sfx) {
    const defaults = readJson<Partial<Settings>>(DEFAULTS_FILE, {});
    if (defaults.music?.track === rel) writeJson(DEFAULTS_FILE, { ...defaults, music: { ...defaults.music, track: "" } });
  }
  return Response.json({
    ok: true,
    tracks: list(MUSIC_DIR).sort(),
    sfx: list(path.join(MUSIC_DIR, "sfx")).sort(),
  });
}
