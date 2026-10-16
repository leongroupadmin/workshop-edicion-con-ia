/** Explicit integration check, uses an existing local video without modifying it. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT } from "../lib/config";
import { run } from "../lib/media";
import { clipDir, saveJob } from "./storage";
import { processJob } from "./worker";
import { CLIP_DEFAULTS } from "../../src/clips/types";
async function main() {
  const source = process.argv[2],
    transcriptFile = process.argv[3];
  if (!source || !transcriptFile)
    throw new Error(
      "Uso: node --import tsx scripts/clips/smoke.ts <video> <transcript.json>",
    );
  const id = `c-${crypto.randomUUID()}`,
    dir = clipDir(id);
  fs.mkdirSync(dir, { recursive: true });
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-ss",
    "15",
    "-i",
    source,
    "-t",
    "8",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-c:a",
    "aac",
    path.join(dir, "source.mp4"),
  ]);
  fs.cpSync(
    path.join(ROOT, "assets/brands/lucas-ia"),
    path.join(dir, "brand"),
    { recursive: true },
  );
  const transcript = JSON.parse(fs.readFileSync(transcriptFile, "utf8"));
  transcript.words = transcript.words
    .filter(
      (w: { startMs: number; endMs: number }) =>
        w.startMs >= 15000 && w.endMs <= 23000,
    )
    .map((w: { startMs: number; endMs: number }) => ({
      ...w,
      startMs: w.startMs - 15000,
      endMs: w.endMs - 15000,
    }));
  transcript.durationMs = 8000;
  fs.writeFileSync(
    path.join(dir, "transcript.json"),
    JSON.stringify(transcript),
  );
  saveJob({
    schema: "clips-v2",
    id,
    title: "Prueba técnica Clips (8 s)",
    source: "source.mp4",
    createdAt: new Date().toISOString(),
    durationMs: 8000,
    settings: { ...CLIP_DEFAULTS, brand: "lucas-ia", minSeconds: 5 },
    clips: [
      {
        id: "clip-1",
        title: "Prueba de subtítulos y seguimiento",
        reason: "Prueba técnica",
        startMs: 0,
        endMs: 7900,
        selected: true,
      },
    ],
    step: "review",
    message: "Prueba técnica",
  });
  console.log(`SMOKE_JOB=${id}`);
  await processJob(id, "render");
  console.log(`SMOKE_DONE=${dir}`);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
