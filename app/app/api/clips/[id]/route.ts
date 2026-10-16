import { clipDir, readJob, saveJob, busy, launch } from "@/lib/clips/server";
import { validateBounds } from "@/lib/clips/types";
import fs from "node:fs";
import path from "node:path";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function DELETE(_req: Request, ctx: Context) {
  const { id } = await ctx.params;
  try {
    readJob(id);
  } catch {
    return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
  }
  if (busy(id))
    return Response.json(
      {
        error:
          "Esperá a que termine el procesamiento antes de eliminar este video.",
      },
      { status: 409 },
    );
  try {
    fs.rmSync(clipDir(id), { recursive: true });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "No se pudo eliminar el video. Volvé a intentarlo." },
      { status: 500 },
    );
  }
}
export async function GET(_req: Request, ctx: Context) {
  try {
    const { id } = await ctx.params,
      job = readJob(id),
      running = busy(id);
    const interrupted =
      !running &&
      ["transcribing", "analyzing", "tracking", "rendering"].includes(job.step);
    return Response.json({ job, running, interrupted });
  } catch {
    return Response.json({ error: "Proyecto no encontrado." }, { status: 404 });
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    const { id } = await ctx.params;
    if (busy(id))
      return Response.json(
        { error: "Este proyecto ya está trabajando." },
        { status: 409 },
      );
    const body = await req.json();
    // Recheck after reading the body: the project may have changed meanwhile.
    if (busy(id))
      return Response.json(
        { error: "Este proyecto ya está trabajando." },
        { status: 409 },
      );
    const job = readJob(id);
    if (body.action === "analyze") {
      launch(id, "analyze");
      return Response.json({ ok: true });
    }
    if (body.action !== "save" && body.action !== "render")
      throw new Error("Acción inválida.");
    if (!Array.isArray(body.clips) || body.clips.length !== job.clips.length)
      throw new Error("Lista de clips inválida.");
    const seen = new Set<string>();
    for (const change of body.clips) {
      const clip = job.clips.find((c) => c.id === change.id);
      if (!clip || seen.has(change.id) || typeof change.selected !== "boolean")
        throw new Error("Clip inválido.");
      seen.add(change.id);
      validateBounds(
        change.startMs,
        change.endMs,
        job.durationMs,
        job.settings,
      );
      if (clip.startMs !== change.startMs || clip.endMs !== change.endMs) {
        delete clip.file;
        delete clip.warning;
      }
      Object.assign(clip, {
        selected: change.selected,
        startMs: change.startMs,
        endMs: change.endMs,
      });
    }
    if (
      body.only !== undefined &&
      (typeof body.only !== "string" ||
        !job.clips.some((c) => c.id === body.only))
    )
      throw new Error("Clip inválido.");
    if (
      body.action === "render" &&
      !body.only &&
      !job.clips.some((c) => c.selected)
    )
      throw new Error("Seleccioná al menos un clip.");
    if (!fs.existsSync(path.join(clipDir(id), "transcript.json")))
      throw new Error("Falta analizar el video.");
    saveJob(job);
    if (body.action === "render") launch(id, "render", body.only);
    return Response.json({ ok: true, job });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
