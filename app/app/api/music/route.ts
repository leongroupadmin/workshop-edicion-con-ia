import fs from "node:fs";
import path from "node:path";
import { MUSIC_DIR, fileResponse, safeFilename, safeJoin, saveBody } from "@/lib/server/fsutil";

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
