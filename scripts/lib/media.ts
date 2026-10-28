import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const VIDEO_EXTS = [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"];
export const AUDIO_EXTS = [".wav", ".mp3", ".m4a", ".aac", ".aiff", ".flac", ".ogg"];

/**
 * En Windows `npx` es un .cmd y Node no lo lanza sin shell: ahí corro
 * npx-cli.js (viene con Node) con el mismo Node. En Mac/Linux, sin cambios.
 */
export const comando = (bin: string, args: string[]): [string, string[]] => {
  if (process.platform === "win32" && bin === "npx") {
    const cli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
    if (fs.existsSync(cli)) return [process.execPath, [cli, ...args]];
  }
  return [bin, args];
};

/** Ejecuta un comando y devuelve stdout. Rechaza con stderr si falla. */
export const run = (
  bin: string,
  args: string[],
  opts: { cwd?: string; quiet?: boolean } = {},
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(...comando(bin, args), { cwd: opts.cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          new Error(
            `${bin} terminó con código ${code}\n${stderr.split("\n").slice(-15).join("\n")}`,
          ),
        );
    });
  });

export const probeDurationMs = async (file: string): Promise<number> => {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    file,
  ]);
  return Math.round(parseFloat(stdout.trim()) * 1000);
};

export type VideoInfo = {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  hasAudio: boolean;
  rotation: number;
};

export const probeVideo = async (file: string): Promise<VideoInfo> => {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    file,
  ]);
  const data = JSON.parse(stdout);
  const v = data.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  const a = data.streams.find((s: { codec_type: string }) => s.codec_type === "audio");
  let rotation = 0;
  const sideRot = v?.side_data_list?.find((s: { rotation?: number }) => s.rotation !== undefined);
  if (sideRot) rotation = Math.abs(Number(sideRot.rotation)) % 360;
  else if (v?.tags?.rotate) rotation = Math.abs(Number(v.tags.rotate)) % 360;
  let width = v ? Number(v.width) : 0;
  let height = v ? Number(v.height) : 0;
  if (rotation === 90 || rotation === 270) [width, height] = [height, width];
  const [num, den] = String(v?.avg_frame_rate ?? "30/1").split("/").map(Number);
  return {
    width,
    height,
    fps: den ? num / den : 30,
    durationMs: Math.round(parseFloat(data.format.duration) * 1000),
    hasAudio: Boolean(a),
    rotation,
  };
};

/** Primer archivo de video/audio dentro de una carpeta (p.ej. raw/). */
export const findMedia = (dir: string): string | null => {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => !f.startsWith("."))
    .filter((f) => [...VIDEO_EXTS, ...AUDIO_EXTS].includes(path.extname(f).toLowerCase()))
    .sort();
  return files.length ? path.join(dir, files[0]) : null;
};

/** Extrae audio mono 16 kHz PCM 16-bit (lo que pide whisper.cpp). */
export const extractWav16k = async (input: string, output: string) => {
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    input,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    output,
  ]);
};

export const writeJson = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
};

export const readJson = <T>(file: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
};

/** Detecta silencios reales en el audio con FFmpeg (umbral relativo al volumen medio). */
export const detectSilences = async (input: string, minSilenceS: number) => {
  const vol = await run("ffmpeg", ["-hide_banner", "-i", input, "-vn", "-af", "volumedetect", "-f", "null", "-"]);
  const mean = parseFloat(/mean_volume:\s*(-?[\d.]+) dB/.exec(vol.stderr)?.[1] ?? "-25");
  const noise = Math.max(-55, Math.min(-28, mean - 18));
  const { stderr } = await run("ffmpeg", [
    "-hide_banner",
    "-i",
    input,
    "-vn",
    "-af",
    `silencedetect=noise=${noise.toFixed(1)}dB:d=${minSilenceS}`,
    "-f",
    "null",
    "-",
  ]);
  const silences: { startMs: number; endMs: number }[] = [];
  let start: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    const e = /silence_end:\s*(-?[\d.]+)/.exec(line);
    if (s) start = Math.max(0, parseFloat(s[1]) * 1000);
    if (e && start !== null) {
      silences.push({ startMs: start, endMs: parseFloat(e[1]) * 1000 });
      start = null;
    }
  }
  if (start !== null) silences.push({ startMs: start, endMs: Infinity });
  return { silences, noise };
};
