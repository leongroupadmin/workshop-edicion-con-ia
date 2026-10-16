import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { clipDir, readJob, saveJob, claim } from "./storage";
import { selectClips } from "./select";
import { renderClip } from "./render";
import { transcribeFile } from "../transcribe";
import { computeCuts, renderCut, remapTranscript } from "../cut";
import { probeVideo, run, readJson } from "../lib/media";
import { ROOT } from "../lib/config";
import {
  CUT_PRESETS,
  type Transcript,
  type Brand,
} from "../../src/pipeline/types";
import {
  validateBounds,
  type ClipJob,
  type FaceFrame,
} from "../../src/clips/types";

export async function processJob(
  id: string,
  action: string,
  ownsLock = false,
  only?: string,
) {
  const release = ownsLock
    ? () => fs.rmSync(path.join(clipDir(id), ".lock"), { force: true })
    : claim(id);
  const dir = clipDir(id);
  const job = readJob(id);
  const update = (
    step: ClipJob["step"],
    message: string,
    progress?: number,
  ) => {
    Object.assign(job, { step, message, progress, error: undefined });
    saveJob(job);
  };
  try {
    const source = path.join(dir, job.source);
    const info = await probeVideo(source);
    if (
      !info.hasAudio ||
      !info.width ||
      !Number.isFinite(info.durationMs) ||
      info.durationMs <= 0 ||
      info.durationMs > 900000
    )
      throw new Error("Subí un video con audio de hasta 15 minutos.");
    job.durationMs = info.durationMs;
    if (action === "analyze") {
      update("transcribing", "Transcribiendo el video completo…");
      const transcript =
        readJson<Transcript | null>(path.join(dir, "transcript.json"), null) ??
        (await transcribeFile({ input: source, outDir: dir, projectId: null }));
      if (!transcript.words.length)
        throw new Error("No se detectaron palabras en el video.");
      update("analyzing", "Buscando fragmentos con una idea completa…");
      job.clips = await selectClips(transcript, job.settings);
      update("review", "Revisá las propuestas y elegí cuáles exportar.");
    } else if (action === "render") {
      const selected = job.clips.filter((c) =>
        only ? c.id === only : c.selected,
      );
      if (!selected.length) throw new Error("Seleccioná al menos un clip.");
      const transcript = readJson<Transcript | null>(
        path.join(dir, "transcript.json"),
        null,
      );
      if (!transcript) throw new Error("Primero analizá el video.");
      const python = path.join(ROOT, ".cache/clips/venv/bin/python");
      await run(python, [path.join(ROOT, "scripts/clips/faces.py"), "--check"]);
      const brand = readJson<Brand>(
        path.join(dir, "brand/brand.json"),
        {} as Brand,
      );
      for (const [index, clip] of selected.entries()) {
        validateBounds(clip.startMs, clip.endMs, info.durationMs, job.settings);
        const tag = `${clip.id}-${crypto.randomUUID().slice(0, 8)}`;
        const work = path.join(dir, `.${tag}`);
        const tempOutput = path.join(dir, `.${tag}.mp4`);
        fs.mkdirSync(work);
        try {
          update(
            "tracking",
            `${index + 1}/${selected.length}: preparando «${clip.title}»…`,
          );
          const fragment = path.join(work, "fragment.mp4");
          await run("ffmpeg", [
            "-y",
            "-v",
            "error",
            "-ss",
            String(clip.startMs / 1000),
            "-i",
            source,
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
          const local: Transcript = {
            ...transcript,
            durationMs: clip.endMs - clip.startMs,
            words: transcript.words
              .filter((w) => w.startMs >= clip.startMs && w.endMs <= clip.endMs)
              .map((w) => ({
                ...w,
                startMs: w.startMs - clip.startMs,
                endMs: w.endMs - clip.startMs,
              })),
          };
          const cuts = await computeCuts({
            input: fragment,
            transcript: local,
            ...CUT_PRESETS[job.settings.cut],
            retakes: false,
          });
          if (
            !cuts.keep.length ||
            cuts.cutDurationMs < job.settings.minSeconds * 1000
          ) {
            cuts.keep = [{ startMs: 0, endMs: local.durationMs }];
            cuts.removed = [];
            cuts.cutDurationMs = local.durationMs;
          }
          const edited = path.join(work, "edited.mp4");
          await renderCut(fragment, cuts, edited);
          const words = remapTranscript(local, cuts).words;
          const editedInfo = await probeVideo(edited);
          if (editedInfo.durationMs > 90000 + 34)
            throw new Error(
              "La exportación excede 90 segundos. Acortá el fragmento.",
            );
          update(
            "tracking",
            `${index + 1}/${selected.length}: identificando caras y quién habla…`,
          );
          const proxy = path.join(work, "proxy.mp4"),
            audio = path.join(work, "audio.wav"),
            faceFile = path.join(work, "faces.json");
          await run("ffmpeg", [
            "-y",
            "-v",
            "error",
            "-i",
            edited,
            "-vf",
            "scale=640:-2,fps=25",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            proxy,
          ]);
          await run("ffmpeg", [
            "-y",
            "-v",
            "error",
            "-i",
            edited,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            audio,
          ]);
          await run(python, [
            path.join(ROOT, "scripts/clips/faces.py"),
            "--video",
            proxy,
            "--audio",
            audio,
            "--output",
            faceFile,
          ]);
          const faces = readJson<FaceFrame[]>(faceFile, []);
          const speechFrames = faces.filter((f) =>
            words.some((w) => f.timeMs >= w.startMs && f.timeMs <= w.endMs),
          );
          const uncovered = speechFrames.filter((f) => !f.faces.length).length;
          // Do not silently export a center crop when the talking face is absent.
          if (!speechFrames.length || uncovered / speechFrames.length > 0.05)
            throw new Error(
              `«${clip.title}»: no se encontró una cara durante parte de la voz. Ajustá el fragmento; no se exportó un encuadre a ciegas.`,
            );
          const uncertain = speechFrames.filter(
            (f) => !f.faces.some((face) => face.score > 0),
          ).length;
          clip.warning =
            uncertain / speechFrames.length > 0.2
              ? "En tramos de voz incierta se mantiene el último encuadre vertical estable. Revisá la vista previa."
              : undefined;
          update(
            "rendering",
            `${index + 1}/${selected.length}: exportando «${clip.title}»…`,
            0,
          );
          const output = `${tag}.mp4`,
            temp = path.join(dir, `.${output}`);
          const music = job.settings.music
            ? `music${path.extname(job.settings.music)}`
            : undefined;
          await renderClip(
            dir,
            {
              video: path.relative(dir, edited),
              durationMs: Math.min(
                job.settings.maxSeconds * 1000,
                90000,
                editedInfo.durationMs,
              ),
              sourceWidth: editedInfo.width,
              sourceHeight: editedInfo.height,
              words,
              settings: job.settings,
              brand,
              brandPath: "brand",
              faces,
              music,
            },
            temp,
            (p) =>
              update(
                "rendering",
                `${index + 1}/${selected.length}: exportando «${clip.title}»…`,
                Math.round(p * 100),
              ),
          );
          const finalInfo = await probeVideo(temp);
          if (
            finalInfo.width !== 1080 ||
            finalInfo.height !== 1920 ||
            finalInfo.durationMs > 90034
          )
            throw new Error(
              "El archivo exportado no pasó la validación de formato o duración.",
            );
          fs.renameSync(temp, path.join(dir, output));
          clip.file = output;
          await run("ffmpeg", [
            "-y",
            "-v",
            "error",
            "-ss",
            "0.1",
            "-i",
            path.join(dir, output),
            "-frames:v",
            "1",
            "-vf",
            "scale=360:640",
            path.join(dir, output.replace(/\.mp4$/, ".jpg")),
          ]);
          saveJob(job);
          fs.writeFileSync(
            path.join(dir, `${tag}.json`),
            JSON.stringify(
              {
                framingVersion: 2,
                clip,
                settings: job.settings,
                cuts,
                faces,
                words,
              },
              null,
              2,
            ),
          );
        } finally {
          fs.rmSync(work, { recursive: true, force: true });
          fs.rmSync(tempOutput, { force: true });
        }
      }
      update("done", "Clips listos para previsualizar y descargar.", 100);
    } else throw new Error("Acción inválida.");
  } catch (error) {
    job.step = "error";
    job.message = "No se pudo completar el proceso.";
    job.error = (error as Error).message;
    saveJob(job);
    throw error;
  } finally {
    release();
  }
}
if (require.main === module)
  processJob(
    process.argv[2],
    process.argv[3],
    process.argv[4] === "--locked",
    process.argv.includes("--clip")
      ? process.argv[process.argv.indexOf("--clip") + 1]
      : undefined,
  ).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
