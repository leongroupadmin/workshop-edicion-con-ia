/** Regenerate an existing export from its frozen cuts/words/faces. No AI requests. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { clipDir, readJob, saveJob, claim } from "./storage";
import { renderClip } from "./render";
import { renderCut } from "../cut";
import { run, probeVideo } from "../lib/media";
import { buildFramingTimeline } from "../../src/clips/framing";
import type { CutsFile, Word, Brand } from "../../src/pipeline/types";
import type {
  ClipSettings,
  FaceFrame,
  ClipProposal,
} from "../../src/clips/types";
export async function reframeExisting(id: string, clipId: string) {
  const release = claim(id),
    dir = clipDir(id),
    job = readJob(id);
  const tag = `${clipId}-${crypto.randomUUID().slice(0, 8)}`,
    work = path.join(dir, `.${tag}`),
    temporary = path.join(dir, `.${tag}.mp4`);
  try {
    const clip = job.clips.find((c) => c.id === clipId);
    if (!clip?.file) throw new Error("Falta un render previo.");
    const oldFile = clip.file;
    const data = JSON.parse(
      fs.readFileSync(
        path.join(dir, oldFile.replace(/\.mp4$/, ".json")),
        "utf8",
      ),
    ) as {
      clip: ClipProposal;
      settings: ClipSettings;
      cuts: CutsFile;
      faces: FaceFrame[];
      words: Word[];
    };
    if (clip.startMs !== data.clip.startMs || clip.endMs !== data.clip.endMs)
      throw new Error("Los límites cambiaron: usá el render completo.");
    fs.mkdirSync(work);
    job.step = "rendering";
    job.message = "Actualizando el encuadre vertical…";
    delete job.error;
    saveJob(job);
    const fragment = path.join(work, "fragment.mp4"),
      edited = path.join(work, "edited.mp4");
    await run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-ss",
      String(clip.startMs / 1000),
      "-i",
      path.join(dir, job.source),
      "-t",
      String((clip.endMs - clip.startMs) / 1000),
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-c:a",
      "aac",
      fragment,
    ]);
    await renderCut(fragment, data.cuts, edited);
    const info = await probeVideo(edited);
    const brand = JSON.parse(
      fs.readFileSync(path.join(dir, "brand/brand.json"), "utf8"),
    ) as Brand;
    await renderClip(
      dir,
      {
        video: path.relative(dir, edited),
        durationMs: Math.min(info.durationMs, data.settings.maxSeconds * 1000),
        sourceWidth: info.width,
        sourceHeight: info.height,
        words: data.words,
        faces: data.faces,
        settings: data.settings,
        brand,
        brandPath: "brand",
        music: data.settings.music
          ? `music${path.extname(data.settings.music)}`
          : undefined,
      },
      temporary,
      (p) => {
        job.progress = Math.round(p * 100);
        saveJob(job);
      },
    );
    const outputInfo = await probeVideo(temporary);
    if (
      outputInfo.width !== 1080 ||
      outputInfo.height !== 1920 ||
      outputInfo.durationMs > 90034
    )
      throw new Error("El render no cumple el formato vertical o duración.");
    const timeline = buildFramingTimeline(
      data.faces,
      info.width,
      info.height,
      data.settings.zoom,
    );
    clip.file = `${tag}.mp4`;
    if (clip.warning)
      clip.warning =
        "En tramos de voz incierta se mantiene el último encuadre vertical estable. Revisá la vista previa.";
    fs.renameSync(temporary, path.join(dir, clip.file));
    await run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-ss",
      "0.1",
      "-i",
      path.join(dir, clip.file),
      "-frames:v",
      "1",
      "-vf",
      "scale=360:640",
      path.join(dir, clip.file.replace(/\.mp4$/, ".jpg")),
    ]);
    fs.writeFileSync(
      path.join(dir, `${tag}.json`),
      JSON.stringify(
        {
          ...data,
          clip,
          framingVersion: 2,
          previousFile: oldFile,
          shots: timeline.filter(
            (f, i) => !i || f.shot !== timeline[i - 1].shot,
          ),
        },
        null,
        2,
      ),
    );
    job.step = "done";
    job.message = "Encuadre vertical actualizado. Clips listos para revisar.";
    job.progress = 100;
    saveJob(job);
    console.log(
      JSON.stringify({
        file: clip.file,
        previousFile: oldFile,
        durationMs: outputInfo.durationMs,
        shots: new Set(timeline.map((f) => f.shot)).size,
      }),
    );
  } catch (e) {
    job.step = "error";
    job.error = (e as Error).message;
    saveJob(job);
    throw e;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(temporary, { force: true });
    release();
  }
}
if (require.main === module)
  reframeExisting(process.argv[2], process.argv[3]).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
