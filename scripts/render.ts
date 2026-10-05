/**
 * Monta y renderiza el video final con Remotion (paso 5 y 6 del pipeline).
 *
 * Uso:
 *   npx tsx scripts/render.ts <projectId> [--note "qué cambió"] [--draft]
 *
 * Lee cut.mp4 + cut.transcript.json + plan.json (solo si está aprobado) +
 * settings.json + /assets/brand + /assets/music y escribe versions/vN.mp4
 * (N = siguiente número libre; nunca sobreescribe) y versions/vN.json.
 */
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind-v4";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CutsFile, EditProps, Plan, Transcript } from "../src/pipeline/types";
import { ROOT, projectPaths } from "./lib/config";
import { startFileServer } from "./lib/fileserver";
import { probeVideo, readJson, run, writeJson } from "./lib/media";
import { listVersions, loadBrand, loadSettings, pickMusic } from "./lib/project";
import { setStatus } from "./lib/status";

const hashDir = (dir: string, h = crypto.createHash("sha1")) => {
  for (const f of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) hashDir(full, h);
    else h.update(f).update(fs.readFileSync(full));
  }
  return h;
};

/** Bundle de Remotion cacheado por contenido de src/ (evita re-empaquetar en cada versión). */
const getBundle = async (onProgress: (p: number) => void) => {
  const h = hashDir(path.join(ROOT, "src"));
  h.update(fs.readFileSync(path.join(ROOT, "package.json")));
  const outDir = path.join(ROOT, ".cache", `remotion-bundle-${h.digest("hex").slice(0, 12)}`);
  if (fs.existsSync(path.join(outDir, "index.html"))) return outDir;
  fs.mkdirSync(path.dirname(outDir), { recursive: true });
  // Limpiar bundles viejos
  for (const d of fs.readdirSync(path.dirname(outDir))) {
    if (d.startsWith("remotion-bundle-")) fs.rmSync(path.join(path.dirname(outDir), d), { recursive: true, force: true });
  }
  return bundle({
    entryPoint: path.join(ROOT, "src", "index.ts"),
    outDir,
    webpackOverride: enableTailwind,
    onProgress,
  });
};

/** Reserva el siguiente número de versión creando versions/vN.lock de forma atómica. */
const reserveVersion = (id: string): number => {
  const dir = projectPaths(id).versions;
  fs.mkdirSync(dir, { recursive: true });
  // Los números de versiones borradas desde el panel no se reutilizan (.last-version)
  let n = Math.max(listVersions(id).at(-1) ?? 0, readJson<number>(path.join(dir, ".last-version"), 0)) + 1;
  for (;;) {
    const lock = path.join(dir, `v${n}.lock`);
    if (!fs.existsSync(path.join(dir, `v${n}.mp4`))) {
      try {
        fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
        return n;
      } catch {
        /* ocupado, probar el siguiente */
      }
    }
    n++;
  }
};

/** Momentos de cut.mp4 donde se unen dos tramos (ahí salta el zoom automático). */
const cutPoints = (cuts: CutsFile | null) => {
  if (!cuts) return [];
  const out: number[] = [];
  let acc = 0;
  for (const k of cuts.keep.slice(0, -1)) {
    acc += k.endMs - k.startMs;
    out.push(Math.round(acc));
  }
  return out;
};

export const buildProps = async (id: string, baseUrl: string): Promise<EditProps> => {
  const p = projectPaths(id);
  if (!fs.existsSync(p.cut)) throw new Error("Falta cut.mp4 (paso 2). Corré scripts/cut.ts primero.");
  const t = readJson<Transcript | null>(p.cutTranscript, null);
  if (!t) throw new Error("Falta cut.transcript.json (paso 2).");
  const info = await probeVideo(p.cut);
  const settings = loadSettings(id);
  const rawPlan = readJson<Plan | null>(p.plan, null);
  const plan: Plan | null =
    rawPlan && rawPlan.status === "approved"
      ? {
          ...rawPlan,
          items: rawPlan.items
            .filter((i) => i.status !== "removed")
            .map((i) => ({
              ...i,
              // Rutas de escenas: relativas a la carpeta del proyecto -> relativas a la raíz
              file:
                i.file && fs.existsSync(path.join(p.dir, i.file))
                  ? `projects/${id}/${i.file}`
                  : undefined,
              sound:
                i.sound && fs.existsSync(path.join(ROOT, "assets", i.sound)) ? i.sound : undefined,
            })),
        }
      : null;
  return {
    projectId: id,
    baseUrl,
    cutVideo: `projects/${id}/cut.mp4`,
    durationMs: info.durationMs,
    sourceWidth: info.width,
    sourceHeight: info.height,
    words: t.words,
    plan,
    settings,
    brand: loadBrand(),
    musicFile: pickMusic(settings),
    cutPoints: cutPoints(readJson<CutsFile | null>(p.cutsApplied, null) ?? readJson<CutsFile | null>(p.cuts, null)),
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const id = args[0];
  if (!id) {
    console.error('Uso: npx tsx scripts/render.ts <projectId> [--note "qué cambió"] [--draft]');
    process.exit(1);
  }
  const noteIdx = args.indexOf("--note");
  const note = noteIdx >= 0 ? args[noteIdx + 1] : "";
  const draft = args.includes("--draft");
  const p = projectPaths(id);
  if (!fs.existsSync(p.dir)) throw new Error(`No existe projects/${id}`);

  const n = reserveVersion(id);
  const lock = path.join(p.versions, `v${n}.lock`);
  const tmpOut = path.join(p.versions, `.v${n}.rendering.mp4`);
  const finalOut = path.join(p.versions, `v${n}.mp4`);
  const server = await startFileServer();
  const started = Date.now();
  try {
    setStatus(id, "assembling", `Montando v${n} en Remotion…`, { progress: 0 });
    const serveUrl = await getBundle(() => {});
    const inputProps = await buildProps(id, server.url);
    const composition = await selectComposition({ serveUrl, id: "Edit", inputProps });

    let last = -1;
    setStatus(id, "rendering", `Renderizando v${n}…`, { progress: 0 });
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      audioCodec: "aac",
      outputLocation: tmpOut,
      inputProps,
      crf: draft ? 28 : 18,
      imageFormat: "jpeg",
      jpegQuality: draft ? 70 : 90,
      concurrency: Math.max(1, Math.min(3, Math.floor(os.cpus().length / 2))),
      timeoutInMilliseconds: 120000,
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 100);
        if (pct >= last + 5) {
          last = pct;
          setStatus(id, "rendering", `Renderizando v${n}… ${pct}%`, { progress });
        }
      },
    });
    fs.renameSync(tmpOut, finalOut);

    // Miniatura del proyecto (primer segundo de la última versión)
    await run("ffmpeg", ["-y", "-v", "error", "-ss", "1", "-i", finalOut, "-frames:v", "1", "-vf", "scale=360:-2", p.thumb]).catch(() => {});

    writeJson(path.join(p.versions, `v${n}.json`), {
      version: n,
      createdAt: new Date().toISOString(),
      note,
      draft,
      renderSeconds: Math.round((Date.now() - started) / 1000),
      durationMs: inputProps.durationMs,
      format: inputProps.settings.format,
      settings: inputProps.settings,
      planApplied: Boolean(inputProps.plan),
      // Plan tal cual estaba (el panel lo compara para saber si hay cambios sin renderizar)
      planUsed: inputProps.plan ? readJson<Plan | null>(p.plan, null) : null,
      planItems: inputProps.plan?.items.length ?? 0,
      music: inputProps.musicFile,
    });
    setStatus(id, "done", `Versión v${n} lista.`, { progress: 1 });
    console.log(`OK ${path.relative(ROOT, finalOut)}`);
  } catch (err) {
    fs.rmSync(tmpOut, { force: true });
    setStatus(id, "error", `Falló el render de v${n}`, { error: (err as Error).message });
    throw err;
  } finally {
    fs.rmSync(lock, { force: true });
    await server.close();
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}
