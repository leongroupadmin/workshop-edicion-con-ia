import path from "node:path";
import { clonDir, readJob } from "@/lib/clon/server";
import { fileResponse, safeFilename } from "@/lib/server/fsutil";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  try {
    const { id, name } = await params;
    const job = readJob(id);
    const dir = clonDir(id);
    // Lista blanca: nunca logs, job.json, audios intermedios ni nada fuera de esto.
    let file: string | null = null;
    if (name === "final.mp4" || name === "pegado.mp4") file = path.join(dir, name);
    else if (name === "foto" && /^personaje\/foto\.(jpe?g|png|webp)$/.test(job.personaje.foto)) file = path.join(dir, job.personaje.foto);
    else if (name === "broll" && job.broll && /^broll\/original\.(mp4|mov|m4v|webm|mkv)$/.test(job.broll.archivo))
      file = path.join(dir, job.broll.archivo);
    else if (/^c\d+\.mp4$/.test(name) && job.guion.bloques.some((b) => b.file === name)) file = path.join(dir, "clips", name);
    if (!file) return new Response("No encontrado", { status: 404 });
    const download = new URL(req.url).searchParams.has("download");
    return fileResponse(file, req, download ? `${safeFilename(job.titulo)}.mp4` : undefined);
  } catch {
    return new Response("No encontrado", { status: 404 });
  }
}
