import "server-only";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { CLIPS_DIR, clipDir, readJob, saveJob, busy, claim } from "./storage";
import { ROOT } from "../server/fsutil";
export { clipDir, readJob, saveJob, busy };
export function listClipJobs() {
  if (!fs.existsSync(CLIPS_DIR)) return [];
  return fs
    .readdirSync(CLIPS_DIR)
    .filter((id) => /^c-[a-f0-9-]{36}$/.test(id))
    .flatMap((id) => {
      try {
        return [readJob(id)];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function clipCapabilities() {
  const cache = path.join(ROOT, ".cache/clips");
  return {
    tracking: [
      "venv/bin/python",
      "TalkNet/model/talkNetModel.py",
      "talknet.model",
      "face.onnx",
    ].every((f) => fs.existsSync(path.join(cache, f))),
  };
}
export function launch(
  id: string,
  action: "analyze" | "render",
  only?: string,
) {
  claim(id);
  const job = readJob(id);
  job.step = action === "analyze" ? "transcribing" : "tracking";
  job.message = "Iniciando…";
  delete job.error;
  saveJob(job);
  const log = fs.openSync(path.join(clipDir(id), "worker.log"), "a");
  try {
    const child = spawn(
      path.join(ROOT, "node_modules/.bin/tsx"),
      [
        path.join(ROOT, "scripts/clips/worker.ts"),
        id,
        action,
        "--locked",
        ...(only ? ["--clip", only] : []),
      ],
      { cwd: ROOT, detached: true, stdio: ["ignore", log, log] },
    );
    if (child.pid)
      fs.writeFileSync(path.join(clipDir(id), ".lock"), String(child.pid));
    child.on("error", (error) => {
      const current = readJob(id);
      current.step = "error";
      current.error = error.message;
      current.message = "No se pudo iniciar Clips.";
      saveJob(current);
      fs.rmSync(path.join(clipDir(id), ".lock"), { force: true });
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        const current = readJob(id);
        if (current.step !== "error") {
          current.step = "error";
          current.error = "El proceso se interrumpió. Podés reintentarlo.";
          saveJob(current);
        }
      }
    });
    child.unref();
  } catch (error) {
    fs.rmSync(path.join(clipDir(id), ".lock"), { force: true });
    throw error;
  } finally {
    fs.closeSync(log);
  }
}

export async function probeClipVideo(file: string) {
  const { stdout } = await promisify(execFile)(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
    { timeout: 30000 },
  );
  const data = JSON.parse(stdout);
  return {
    width: Number(
      data.streams?.find(
        (s: { codec_type: string }) => s.codec_type === "video",
      )?.width || 0,
    ),
    hasAudio: data.streams?.some(
      (s: { codec_type: string }) => s.codec_type === "audio",
    ),
    durationMs: Math.round(Number(data.format?.duration) * 1000),
  };
}
