import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  listClipJobs,
  clipCapabilities,
  clipDir,
  saveJob,
  launch,
} from "@/lib/clips/server";
import { listBrands, BRANDS_DIR } from "@/lib/server/brands";
import { ROOT, saveBody } from "@/lib/server/fsutil";
import { validateSettings, type ClipJob } from "@/lib/clips/types";
import { probeClipVideo } from "@/lib/clips/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  return Response.json({
    jobs: listClipJobs(),
    capabilities: clipCapabilities(),
  });
}
export async function POST(req: Request) {
  let dir: string | undefined;
  try {
    const settings = validateSettings(
      JSON.parse(decodeURIComponent(req.headers.get("x-settings") || "{}")),
    );
    if (!listBrands().some((b) => b.slug === settings.brand))
      throw new Error("Elegí una marca guardada.");
    if (!clipCapabilities().tracking)
      throw new Error(
        "Falta instalar el seguimiento de caras. Ejecutá scripts/clips/setup.sh antes de subir.",
      );
    const name = decodeURIComponent(
      req.headers.get("x-filename") || "video.mp4",
    );
    const ext = path.extname(name).toLowerCase();
    if (![".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"].includes(ext))
      throw new Error("Formato de video no compatible.");
    const id = `c-${crypto.randomUUID()}`;
    dir = clipDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const source = `source${ext}`;
    const bytes = await saveBody(req, path.join(dir, source));
    if (bytes < 1000) throw new Error("El archivo llegó vacío.");
    const info = await probeClipVideo(path.join(dir, source));
    if (
      !info.width ||
      !info.hasAudio ||
      !Number.isFinite(info.durationMs) ||
      info.durationMs <= 0 ||
      info.durationMs > 900000
    )
      throw new Error(
        "El video debe tener audio y durar como máximo 15 minutos.",
      );
    if (info.durationMs < settings.minSeconds * 1000)
      throw new Error("El video es más corto que la duración mínima elegida.");
    fs.cpSync(path.join(BRANDS_DIR, settings.brand), path.join(dir, "brand"), {
      recursive: true,
    });
    if (settings.music)
      fs.copyFileSync(
        path.join(ROOT, "assets/music", settings.music),
        path.join(dir, `music${path.extname(settings.music)}`),
      );
    const job: ClipJob = {
      schema: "clips-v2",
      id,
      title: path.basename(name, ext).slice(0, 160),
      createdAt: new Date().toISOString(),
      source,
      durationMs: info.durationMs,
      settings,
      clips: [],
      step: "uploading",
      message: "Video recibido.",
    };
    saveJob(job);
    launch(id, "analyze");
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    // Only remove the new, rejected upload; existing jobs and Edit are untouched.
    if (dir && !fs.existsSync(path.join(dir, "job.json")))
      fs.rmSync(dir, { recursive: true, force: true });
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
