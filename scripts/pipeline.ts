/**
 * Orquestador de pasos automáticos (sin Claude).
 *
 * Uso:
 *   npx tsx scripts/pipeline.ts prepare <projectId>   pasos 1 + 2 (transcribir y cortar)
 *
 * Lo usa el panel después de una subida.
 */
import fs from "node:fs";
import type { Transcript } from "../src/pipeline/types";
import { CUT_PRESETS } from "../src/pipeline/types";
import { projectPaths } from "./lib/config";
import { findMedia, readJson, run } from "./lib/media";
import { ensureSettings, loadSettings } from "./lib/project";
import { setStatus } from "./lib/status";
import { applyCuts, computeCuts } from "./cut";
import { transcribeFile } from "./transcribe";

const prepare = async (id: string) => {
  const p = projectPaths(id);
  const input = findMedia(p.raw);
  if (!input) throw new Error(`No hay video en projects/${id}/raw/`);
  ensureSettings(id);

  if (!fs.existsSync(p.thumb)) {
    await run("ffmpeg", ["-y", "-v", "error", "-ss", "0.5", "-i", input, "-frames:v", "1", "-vf", "scale=360:-2", p.thumb]).catch(() => {});
  }

  // Paso 1
  const transcript =
    readJson<Transcript | null>(p.transcript, null) ??
    (await transcribeFile({ input, outDir: p.dir, projectId: id }));

  // Paso 2
  setStatus(id, "cutting", "Detectando silencios, muletillas y tomas repetidas…");
  const style = loadSettings(id).style.cut;
  const cuts = { ...(await computeCuts({ input, transcript, ...CUT_PRESETS[style] })), style };
  await applyCuts(id, input, transcript, cuts);

  const s = (ms: number) => (ms / 1000).toFixed(1);
  setStatus(
    id,
    "planning",
    `Corte listo (${s(cuts.sourceDurationMs)}s → ${s(cuts.cutDurationMs)}s). Falta el plan de edición.`,
  );
};

const main = async () => {
  // Acepta "prepare <id>" o "<id> prepare" (el panel pasa el id primero).
  const args = process.argv.slice(2);
  const cmd = args.includes("prepare") ? "prepare" : args[1] ?? "prepare";
  const id = args.find((a) => a !== "prepare");
  if (cmd !== "prepare" || !id) {
    console.error("Uso: npx tsx scripts/pipeline.ts prepare <projectId>");
    process.exit(1);
  }
  try {
    await prepare(id);
  } catch (err) {
    setStatus(id, "error", "Falló la preparación", { error: (err as Error).message });
    throw err;
  }
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
