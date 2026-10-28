/**
 * Transcribe un video/audio en español con timestamps por palabra.
 *
 * Uso:
 *   npx tsx scripts/transcribe.ts <projectId>               (usa projects/<id>/raw/*)
 *   npx tsx scripts/transcribe.ts <archivo> [--out <carpeta>]
 *
 * Pasos: extrae audio WAV 16 kHz mono con FFmpeg -> whisper.cpp (modelo medium,
 * idioma es, una palabra por segmento + DTW) -> guarda transcript.json en la
 * carpeta del proyecto (o en --out / junto al archivo).
 */
import { transcribe } from "@remotion/install-whisper-cpp";
import fs from "node:fs";
import path from "node:path";
import type { Transcript, Word } from "../src/pipeline/types";
import {
  WHISPER_LANGUAGE,
  WHISPER_MODEL,
  WHISPER_PATH,
  WHISPER_VERSION,
  projectDir,
  projectPaths,
} from "./lib/config";
import { detectSilences, extractWav16k, findMedia, probeDurationMs, writeJson } from "./lib/media";
import { projectIdFromPath, setStatus } from "./lib/status";

type RawToken = {
  text: string;
  offsets: { from: number; to: number };
  p: number;
  t_dtw: number;
};
type RawItem = {
  text: string;
  offsets: { from: number; to: number };
  tokens?: RawToken[];
};

const isSpecial = (t: string) => /^\s*(\[_|<\|)/.test(t);

/**
 * Con --max-len 1 --split-on-word cada item de whisper.cpp es una palabra.
 * Usamos el texto del item (UTF-8 correcto, a diferencia de los tokens sueltos).
 * Para el INICIO usamos el timestamp DTW del primer token (mucho más preciso
 * que los offsets del segmento, que se corren hasta 1 s). La puntuación suelta
 * se pega a la palabra anterior. Los finales los calcula alignToSpeech().
 */
export const itemsToWords = (items: RawItem[]): Word[] => {
  const words: Word[] = [];
  for (const item of items) {
    const text = item.text.trim();
    if (!text || isSpecial(text)) continue;
    if (/^[.,;:!?¡¿…)"»]+$/.test(text) && words.length) {
      words[words.length - 1].text += text;
      continue;
    }
    const tokens = (item.tokens ?? []).filter((t) => !isSpecial(t.text) && !/^[\s.,;:!?¡¿…]+$/.test(t.text));
    const confidence = tokens.length ? tokens.reduce((sum, t) => sum + t.p, 0) / tokens.length : null;
    const dtw = tokens.find((t) => t.t_dtw >= 0)?.t_dtw;
    const startMs = dtw !== undefined ? dtw * 10 : item.offsets.from;
    words.push({
      text,
      startMs,
      endMs: item.offsets.to,
      confidence: confidence === null ? null : Math.round(confidence * 1000) / 1000,
    });
  }
  // Inicios siempre crecientes
  for (let i = 1; i < words.length; i++) {
    if (words[i].startMs < words[i - 1].startMs + 30) words[i].startMs = words[i - 1].startMs + 30;
  }
  return words;
};

/**
 * Ajusta las palabras a los tramos donde realmente hay voz (según FFmpeg).
 * Whisper tiende a atrasar las palabras; si una cae dentro de un silencio se
 * la asigna al tramo de voz más cercano y, por tramo, se reacomodan los
 * inicios para que entren en la voz real. Cada palabra termina donde empieza
 * la siguiente (o donde empieza el silencio).
 */
export const alignToSpeech = (
  words: Word[],
  silences: { startMs: number; endMs: number }[],
  durationMs: number,
): Word[] => {
  if (!words.length) return words;
  // Tramos de voz = complemento de los silencios
  const regions: { startMs: number; endMs: number }[] = [];
  let cursor = 0;
  for (const s of [...silences].sort((a, b) => a.startMs - b.startMs)) {
    if (s.startMs - cursor > 60) regions.push({ startMs: cursor, endMs: s.startMs });
    cursor = Math.max(cursor, Math.min(durationMs, s.endMs));
  }
  if (durationMs - cursor > 60) regions.push({ startMs: cursor, endMs: durationMs });
  if (!regions.length) return words;

  const regionOf = (t: number) => {
    const inside = regions.findIndex((r) => t >= r.startMs && t < r.endMs);
    if (inside >= 0) return inside;
    // En un silencio: al tramo cuyo borde esté más cerca
    let best = 0;
    let bestDist = Infinity;
    regions.forEach((r, i) => {
      const d = t < r.startMs ? r.startMs - t : t - r.endMs;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  // Orden: un tramo nunca puede ser anterior al de la palabra previa
  const assigned: number[] = [];
  words.forEach((w, i) => {
    const r = regionOf(w.startMs);
    assigned.push(i ? Math.max(r, assigned[i - 1]) : r);
  });

  const out = words.map((w) => ({ ...w }));
  regions.forEach((r, ri) => {
    const idx = assigned.map((a, i) => (a === ri ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    const minS = out[idx[0]].startMs;
    const maxS = out[idx[idx.length - 1]].startMs;
    const tailRoom = Math.min(250, (r.endMs - r.startMs) / (idx.length + 1));
    // La voz arranca al principio del tramo: si la 1ª palabra quedó un poco
    // después (atraso típico de Whisper), se la adelanta hasta ahí.
    const lo =
      minS - r.startMs < 600
        ? r.startMs
        : Math.max(r.startMs, Math.min(minS, r.endMs - tailRoom * idx.length));
    const hi = Math.max(lo, Math.min(r.endMs - tailRoom, maxS));
    idx.forEach((i) => {
      const s = out[i].startMs;
      out[i].startMs = Math.round(maxS === minS ? lo : lo + ((s - minS) * (hi - lo)) / (maxS - minS));
    });
    idx.forEach((i, k) => {
      const next = idx[k + 1];
      out[i].endMs = Math.round(next !== undefined ? out[next].startMs : r.endMs);
      if (out[i].endMs - out[i].startMs < 40) out[i].endMs = out[i].startMs + 40;
    });
  });
  return out;
};

export const transcribeFile = async ({
  input,
  outDir,
  projectId,
  outName = "transcript.json",
}: {
  input: string;
  outDir: string;
  projectId: string | null;
  outName?: string;
}): Promise<Transcript> => {
  // En Windows el binario viene precompilado como whisper-cli.exe.
  const whisperBin = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  if (!fs.existsSync(path.join(WHISPER_PATH, "build", "bin", whisperBin))) {
    throw new Error(
      "whisper.cpp no está instalado. Corré: npx tsx scripts/setup-whisper.ts",
    );
  }
  if (!fs.existsSync(path.join(WHISPER_PATH, `.ready-${WHISPER_MODEL}`))) {
    throw new Error(
      `El modelo de Whisper "${WHISPER_MODEL}" no está listo (falta descargarlo o la descarga no terminó). Corré: npx tsx scripts/setup-whisper.ts`,
    );
  }
  fs.mkdirSync(outDir, { recursive: true });
  const wav = path.join(outDir, outName.replace(/\.json$/, ".wav"));

  setStatus(projectId, "transcribing", "Extrayendo audio (WAV 16 kHz mono)…");
  await extractWav16k(input, wav);
  const durationMs = await probeDurationMs(wav);

  setStatus(projectId, "transcribing", `Transcribiendo con Whisper ${WHISPER_MODEL}…`, {
    progress: 0,
  });
  let lastPct = -1;
  const result = await transcribe({
    inputPath: wav,
    whisperPath: WHISPER_PATH,
    whisperCppVersion: WHISPER_VERSION,
    model: WHISPER_MODEL,
    language: WHISPER_LANGUAGE,
    tokenLevelTimestamps: false,
    tokensPerItem: 1,
    splitOnWord: true,
    printOutput: false,
    additionalArgs: [["--dtw", WHISPER_MODEL]],
    onProgress: (p) => {
      const pct = Math.round(p * 100);
      if (pct >= lastPct + 10 || pct === 100) {
        lastPct = pct;
        setStatus(projectId, "transcribing", `Transcribiendo… ${pct}%`, {
          progress: p,
        });
      }
    },
  });

  // Silencios reales del audio (umbral 0.25 s) para sincronizar bien las palabras
  const { silences } = await detectSilences(wav, 0.25);
  const words = alignToSpeech(itemsToWords(result.transcription as unknown as RawItem[]), silences, durationMs);
  const transcript: Transcript = {
    version: 1,
    source: path.relative(outDir, input),
    language: WHISPER_LANGUAGE,
    model: WHISPER_MODEL,
    durationMs,
    createdAt: new Date().toISOString(),
    text: words.map((w) => w.text).join(" "),
    words,
  };
  writeJson(path.join(outDir, outName), transcript);
  fs.rmSync(wav, { force: true });
  setStatus(projectId, "transcribing", `Transcripción lista: ${words.length} palabras.`, {
    progress: 1,
  });
  return transcript;
};

const main = async () => {
  const args = process.argv.slice(2);
  const target = args[0];
  if (!target) {
    console.error("Uso: npx tsx scripts/transcribe.ts <projectId | archivo> [--out <carpeta>]");
    process.exit(1);
  }
  const outIdx = args.indexOf("--out");
  let input: string;
  let projectId: string | null;
  let outDir: string;

  if (fs.existsSync(projectDir(target)) && !fs.existsSync(target)) {
    projectId = target;
    const media = findMedia(projectPaths(target).raw);
    if (!media) throw new Error(`No hay video en projects/${target}/raw/`);
    input = media;
    outDir = projectDir(target);
  } else {
    input = path.resolve(target);
    if (!fs.existsSync(input)) throw new Error(`No existe: ${input}`);
    projectId = projectIdFromPath(input);
    outDir =
      outIdx >= 0
        ? path.resolve(args[outIdx + 1])
        : projectId
          ? projectDir(projectId)
          : path.dirname(input);
  }

  try {
    const t = await transcribeFile({ input, outDir, projectId });
    console.log(`\n${t.text}\n`);
    console.log(`Guardado en ${path.join(outDir, "transcript.json")}`);
  } catch (err) {
    setStatus(projectId, "error", "Falló la transcripción", {
      error: (err as Error).message,
    });
    throw err;
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
