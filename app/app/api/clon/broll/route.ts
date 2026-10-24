import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { crearClon, type DatosClon } from "@/lib/clon/crear";
import { BROLL_MAX_S, BROLL_MIN_S } from "@/lib/clon/types";
import { saveBody } from "@/lib/server/fsutil";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXTS = [".mp4", ".mov", ".m4v", ".webm", ".mkv"];

/** Duración y tamaño de la imagen del B-roll (su audio no se usa). */
const medir = async (archivo: string) => {
  const { stdout } = await promisify(execFile)(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", archivo],
    { timeout: 30000 },
  );
  const d = JSON.parse(stdout);
  return {
    ancho: Number(d.streams?.[0]?.width || 0),
    alto: Number(d.streams?.[0]?.height || 0),
    duracionS: Number(d.format?.duration || 0),
  };
};

/**
 * Clon + B-roll: el cuerpo es el video de B-roll; los datos del clon van en
 * el header x-datos (JSON). Se guarda en clones/<id>/broll/ y su duración pasa
 * a ser la duración del video.
 */
export async function POST(req: Request) {
  try {
    const datos = JSON.parse(decodeURIComponent(req.headers.get("x-datos") || "{}")) as DatosClon;
    const nombre = decodeURIComponent(req.headers.get("x-filename") || "broll.mp4");
    const ext = path.extname(nombre).toLowerCase();
    if (!EXTS.includes(ext)) throw new Error("El B-roll tiene que ser un video MP4, MOV, WEBM o MKV.");
    const id = await crearClon(datos, async (_id, dir) => {
      const archivo = `broll/original${ext}`;
      const bytes = await saveBody(req, path.join(dir, archivo));
      if (bytes < 1000) throw new Error("El B-roll llegó vacío.");
      const m = await medir(path.join(dir, archivo)).catch(() => null);
      if (!m || !m.ancho || !m.duracionS) throw new Error("No pude leer el B-roll. Probá exportarlo como MP4.");
      if (m.duracionS < BROLL_MIN_S) throw new Error(`El B-roll dura ${m.duracionS.toFixed(1)} s: tiene que durar al menos ${BROLL_MIN_S} s.`);
      if (m.duracionS > BROLL_MAX_S)
        throw new Error(`El B-roll dura ${Math.round(m.duracionS)} s: el máximo es ${BROLL_MAX_S / 60} minutos. Cortalo y volvé a subirlo.`);
      return { archivo, ...m };
    });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
