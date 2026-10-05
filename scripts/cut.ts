/**
 * Corta silencios, muletillas y tomas repetidas usando la transcripción.
 *
 * Uso:
 *   npx tsx scripts/cut.ts <projectId>                 (decide cortes + renderiza cut.mp4)
 *   npx tsx scripts/cut.ts <projectId> --from-cuts     (re-renderiza desde cuts.json editado)
 *   Opciones: --min-silence 0.5  --keep-gap 0.15  --no-fillers  --no-retakes
 *   Sin opciones usa el preset de settings.json (style.cut: soft | normal | aggressive).
 *   Si ya había un plan, sus tiempos se re-sincronizan al corte nuevo.
 *
 * Salidas en projects/<id>/:
 *   cuts.json             tramos conservados y quitados (con motivo)
 *   cut.mp4               video sin silencios/muletillas/repeticiones
 *   cut.transcript.json   transcripción re-sincronizada al tiempo de cut.mp4
 */
import fs from "node:fs";
import type {
  CutsFile,
  KeepSegment,
  Plan,
  RemovedRange,
  Transcript,
  Word,
} from "../src/pipeline/types";
import { CUT_PRESETS } from "../src/pipeline/types";
import { projectPaths } from "./lib/config";
import { detectSilences, findMedia, probeVideo, readJson, run, writeJson } from "./lib/media";
import { loadSettings } from "./lib/project";
import { log, setStatus } from "./lib/status";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zñ0-9 ]/g, "")
    .trim();

// Muletillas que se quitan siempre que aparezcan sueltas.
const ALWAYS_FILLERS = new Set(["eh", "ehh", "ehm", "em", "emm", "mm", "mmm", "hmm", "ah", "aa", "eeh"]);
// Muletillas que solo se quitan si van "sueltas" (con coma o pausa alrededor).
const SOFT_FILLERS = new Set(["e", "este", "esteee", "bueno", "osea"]);

const hasTrailingComma = (w: Word) => /[,…]$/.test(w.text.trim()) || /\.\.\.$/.test(w.text);

/** Encuentra muletillas en la transcripción. Devuelve índices de palabras a quitar. */
const findFillers = (words: Word[]): Set<number> => {
  const out = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    const w = norm(words[i].text);
    const prev = words[i - 1];
    const next = words[i + 1];
    const gapBefore = prev ? words[i].startMs - prev.endMs : 1000;
    const gapAfter = next ? next.startMs - words[i].endMs : 1000;
    const isolated =
      hasTrailingComma(words[i]) ||
      (prev && hasTrailingComma(prev)) ||
      (gapBefore > 150 && gapAfter > 150);

    if (ALWAYS_FILLERS.has(w)) out.add(i);
    else if (SOFT_FILLERS.has(w) && isolated && w !== "bueno") out.add(i);
    // "o sea" suelto
    else if (w === "o" && next && norm(next.text) === "sea") {
      const after = words[i + 2];
      const pauseAfter = after ? after.startMs - next.endMs : 1000;
      if (hasTrailingComma(next) || pauseAfter > 200 || (prev && hasTrailingComma(prev))) {
        out.add(i);
        out.add(i + 1);
      }
    }
  }
  return out;
};

type Phrase = { from: number; to: number; text: string };

/** Agrupa palabras en frases por puntuación fuerte o pausas largas. */
const toPhrases = (words: Word[], skip: Set<number>): Phrase[] => {
  const phrases: Phrase[] = [];
  let from = -1;
  for (let i = 0; i < words.length; i++) {
    if (from === -1) from = i;
    const next = words[i + 1];
    const endsSentence = /[.!?…]$/.test(words[i].text.trim());
    const pause = next ? next.startMs - words[i].endMs > 450 : true;
    if (endsSentence || pause || !next) {
      const text = words
        .slice(from, i + 1)
        .filter((_, k) => !skip.has(from + k))
        .map((w) => norm(w.text))
        .filter(Boolean)
        .join(" ");
      phrases.push({ from, to: i, text });
      from = -1;
    }
  }
  return phrases;
};

const similarity = (a: string, b: string) => {
  const aw = a.split(" ").filter(Boolean);
  const bw = b.split(" ").filter(Boolean);
  if (!aw.length || !bw.length) return { prefix: 0, jaccard: 0 };
  let prefix = 0;
  while (prefix < aw.length && prefix < bw.length && aw[prefix] === bw[prefix]) prefix++;
  const sa = new Set(aw);
  const sb = new Set(bw);
  const inter = [...sa].filter((x) => sb.has(x)).length;
  return { prefix: prefix / aw.length, jaccard: inter / new Set([...sa, ...sb]).size };
};

/**
 * Tomas repetidas: si una frase se repite (o es el arranque fallido de la
 * siguiente), se queda la ÚLTIMA. Devuelve índices de palabras a quitar.
 */
const findRetakes = (words: Word[], fillers: Set<number>): Set<number> => {
  const out = new Set<number>();
  const phrases = toPhrases(words, fillers);
  for (let i = 0; i < phrases.length; i++) {
    const a = phrases[i];
    const aLen = a.text.split(" ").filter(Boolean).length;
    if (aLen < 2) continue;
    // Comparar con las 2 frases siguientes.
    for (let j = i + 1; j <= Math.min(i + 2, phrases.length - 1); j++) {
      const b = phrases[j];
      const { prefix, jaccard } = similarity(a.text, b.text);
      const sameStart = a.text.split(" ").slice(0, 2).join(" ") === b.text.split(" ").slice(0, 2).join(" ");
      if ((prefix >= 0.6 && sameStart) || (jaccard >= 0.75 && sameStart)) {
        // Se quita a (y lo que haya entre a y b).
        for (let k = a.from; k < b.from; k++) out.add(k);
        break;
      }
    }
  }
  return out;
};

const mergeRanges = (ranges: RemovedRange[]): RemovedRange[] => {
  const sorted = [...ranges].sort((x, y) => x.startMs - y.startMs);
  const out: RemovedRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.startMs <= last.endMs + 30) {
      last.endMs = Math.max(last.endMs, r.endMs);
      if (r.text) last.text = [last.text, r.text].filter(Boolean).join(" ");
      if (last.reason !== r.reason && r.reason !== "silence") last.reason = r.reason;
    } else out.push({ ...r });
  }
  return out;
};

export const computeCuts = async ({
  input,
  transcript,
  minSilenceS = 0.5,
  keepGapS = 0.15,
  fillers = true,
  retakes = true,
}: {
  input: string;
  transcript: Transcript;
  minSilenceS?: number;
  keepGapS?: number;
  fillers?: boolean;
  retakes?: boolean;
}): Promise<CutsFile> => {
  const info = await probeVideo(input);
  const total = info.durationMs;
  const words = transcript.words;
  const removed: RemovedRange[] = [];
  const halfGap = (keepGapS * 1000) / 2;

  // 1) Silencios > minSilence (dejando un respiro de keepGap).
  const { silences } = await detectSilences(input, minSilenceS);
  for (const s of silences) {
    const end = Math.min(s.endMs, total);
    const startPad = s.startMs <= 0 ? 0 : halfGap;
    const endPad = end >= total ? 0 : halfGap;
    if (end - s.startMs - startPad - endPad > 50) {
      removed.push({ startMs: s.startMs + startPad, endMs: end - endPad, reason: "silence" });
    }
  }
  // Silencios según la transcripción (por si hay ruido de fondo que FFmpeg no ve como silencio).
  for (let i = 0; i < words.length - 1; i++) {
    const gap = words[i + 1].startMs - words[i].endMs;
    if (gap > Math.max(900, minSilenceS * 1000 * 1.8)) {
      removed.push({
        startMs: words[i].endMs + 200,
        endMs: words[i + 1].startMs - 150,
        reason: "silence",
      });
    }
  }
  if (words.length) {
    if (words[0].startMs > 400) removed.push({ startMs: 0, endMs: words[0].startMs - 150, reason: "silence" });
    const last = words[words.length - 1];
    if (total - last.endMs > 600) removed.push({ startMs: last.endMs + 300, endMs: total, reason: "silence" });
  }

  // 2) Muletillas y 3) tomas repetidas.
  const fillerIdx = fillers ? findFillers(words) : new Set<number>();
  const retakeIdx = retakes ? findRetakes(words, fillerIdx) : new Set<number>();
  const wordRange = (i: number, reason: RemovedRange["reason"]) => {
    const w = words[i];
    const prev = words[i - 1];
    const next = words[i + 1];
    // Desde el fin de la palabra anterior (+pequeño margen) hasta el inicio de la siguiente.
    // Nunca empezar después del inicio de la palabra ni terminar antes de su fin.
    const startMs = prev ? Math.min(w.startMs, Math.max(prev.endMs, w.startMs - 80)) : Math.max(0, w.startMs - 80);
    const endMs = next
      ? Math.max(w.endMs, Math.min(next.startMs - 20, w.endMs + 250))
      : Math.min(total, w.endMs + 150);
    removed.push({ startMs, endMs: Math.max(startMs, endMs), reason, text: w.text });
  };
  for (const i of retakeIdx) wordRange(i, "retake");
  for (const i of fillerIdx) if (!retakeIdx.has(i)) wordRange(i, "filler");

  const merged = mergeRanges(removed.filter((r) => r.endMs - r.startMs > 30)).map((r) => ({
    ...r,
    startMs: Math.round(Math.max(0, r.startMs)),
    endMs: Math.round(Math.min(total, r.endMs)),
  }));

  // Tramos conservados = complemento de los quitados (descartando restos muy cortos).
  const MIN_KEEP_MS = 180;
  const keep: KeepSegment[] = [];
  let cursor = 0;
  for (const r of merged) {
    if (r.startMs - cursor >= MIN_KEEP_MS) keep.push({ startMs: cursor, endMs: r.startMs });
    cursor = Math.max(cursor, r.endMs);
  }
  if (total - cursor >= MIN_KEEP_MS) keep.push({ startMs: cursor, endMs: total });

  return {
    version: 1,
    sourceDurationMs: total,
    cutDurationMs: keep.reduce((s, k) => s + (k.endMs - k.startMs), 0),
    keep,
    removed: merged,
  };
};

/** Mapea un tiempo del original al tiempo de cut.mp4 (null si cae en un tramo quitado). */
export const mapTime = (keep: KeepSegment[], t: number): number | null => {
  let acc = 0;
  for (const k of keep) {
    if (t < k.startMs) return null;
    if (t <= k.endMs) return acc + (t - k.startMs);
    acc += k.endMs - k.startMs;
  }
  return null;
};

/** Tiempo de cut.mp4 -> tiempo del original. */
export const unmapTime = (keep: KeepSegment[], t: number): number => {
  let acc = 0;
  for (const k of keep) {
    const len = k.endMs - k.startMs;
    if (t <= acc + len) return k.startMs + (t - acc);
    acc += len;
  }
  return keep.at(-1)?.endMs ?? t;
};

/** Como mapTime, pero si el momento se quitó devuelve el comienzo del tramo siguiente. */
const mapTimeNearest = (keep: KeepSegment[], t: number): number => {
  let acc = 0;
  for (const k of keep) {
    if (t < k.startMs) return acc;
    if (t <= k.endMs) return acc + (t - k.startMs);
    acc += k.endMs - k.startMs;
  }
  return acc;
};

/** Re-sincroniza el plan a un corte nuevo: cada elemento sigue a su momento del original y mantiene su duración. */
export const remapPlan = (plan: Plan, oldCuts: CutsFile, newCuts: CutsFile): Plan => {
  const total = newCuts.cutDurationMs;
  const items = plan.items.map((it) => {
    const dur = Math.min(it.endMs - it.startMs, total);
    const start = Math.round(mapTimeNearest(newCuts.keep, unmapTime(oldCuts.keep, it.startMs)));
    const startMs = Math.max(0, Math.min(start, total - dur));
    return { ...it, startMs, endMs: startMs + dur };
  });
  return { ...plan, items: items.sort((a, b) => a.startMs - b.startMs) };
};

export const remapTranscript = (t: Transcript, cuts: CutsFile): Transcript => {
  const words: Word[] = [];
  for (const w of t.words) {
    // Whisper suele estirar la última palabra de una frase dentro del silencio
    // siguiente, así que no alcanza con mirar el punto medio: se elige el tramo
    // conservado con más solapamiento y se descarta la palabra si casi no queda.
    let seg: KeepSegment | null = null;
    let best = 0;
    for (const k of cuts.keep) {
      const ov = Math.min(w.endMs, k.endMs) - Math.max(w.startMs, k.startMs);
      if (ov > best) {
        best = ov;
        seg = k;
      }
    }
    const dur = Math.max(1, w.endMs - w.startMs);
    if (!seg || best < Math.min(60, dur * 0.5)) continue;
    const s = mapTime(cuts.keep, Math.max(w.startMs, seg.startMs))!;
    const e = mapTime(cuts.keep, Math.min(w.endMs, seg.endMs))!;
    words.push({ ...w, startMs: Math.round(s), endMs: Math.round(Math.max(e, s + 40)) });
  }
  return {
    ...t,
    source: "cut.mp4",
    durationMs: cuts.cutDurationMs,
    createdAt: new Date().toISOString(),
    text: words.map((w) => w.text).join(" "),
    words,
  };
};

/** Renderiza cut.mp4 concatenando los tramos con trim/atrim (preciso al cuadro). */
export const renderCut = async (input: string, cuts: CutsFile, output: string) => {
  const info = await probeVideo(input);
  const fps = Math.round(info.fps) || 30;
  const parts: string[] = [];
  const labels: string[] = [];
  const fade = 0.012;
  cuts.keep.forEach((k, i) => {
    const s = (k.startMs / 1000).toFixed(3);
    const e = (k.endMs / 1000).toFixed(3);
    const d = (k.endMs - k.startMs) / 1000;
    parts.push(`[0:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS[v${i}]`);
    if (info.hasAudio) {
      parts.push(
        `[0:a]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS,afade=t=in:d=${fade},afade=t=out:st=${Math.max(0, d - fade).toFixed(3)}:d=${fade}[a${i}]`,
      );
      labels.push(`[v${i}][a${i}]`);
    } else labels.push(`[v${i}]`);
  });
  const n = cuts.keep.length;
  parts.push(`${labels.join("")}concat=n=${n}:v=1:a=${info.hasAudio ? 1 : 0}[outv]${info.hasAudio ? "[outa]" : ""}`);
  const filterFile = `${output}.filter.txt`;
  fs.writeFileSync(filterFile, parts.join(";\n"));
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    input,
    // FFmpeg 7+: "-/opcion archivo" lee el valor de la opción desde un archivo
    "-/filter_complex",
    filterFile,
    "-map",
    "[outv]",
    ...(info.hasAudio ? ["-map", "[outa]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000"] : []),
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-movflags",
    "+faststart",
    output,
  ]);
  fs.rmSync(filterFile, { force: true });
};

/**
 * Guarda cuts.json, renderiza cut.mp4 y cut.transcript.json y, si ya había un
 * corte anterior y un plan, re-sincroniza los tiempos del plan.
 */
export const applyCuts = async (id: string, input: string, transcript: Transcript, cuts: CutsFile) => {
  const p = projectPaths(id);
  const prev =
    readJson<CutsFile | null>(p.cutsApplied, null) ??
    (fs.existsSync(p.cut) ? readJson<CutsFile | null>(p.cuts, null) : null);
  writeJson(p.cuts, cuts);
  const byReason = (r: string) => cuts.removed.filter((x) => x.reason === r).length;
  setStatus(
    id,
    "cutting",
    `Cortando: ${byReason("silence")} silencios, ${byReason("filler")} muletillas, ${byReason("retake")} tomas repetidas…`,
  );
  await renderCut(input, cuts, p.cut);
  writeJson(p.cutTranscript, remapTranscript(transcript, cuts));
  writeJson(p.cutsApplied, cuts);
  const plan = readJson<Plan | null>(p.plan, null);
  if (plan && prev && JSON.stringify(prev.keep) !== JSON.stringify(cuts.keep)) {
    writeJson(p.plan, remapPlan(plan, prev, cuts));
    log(id, "[cut] plan.json re-sincronizado al corte nuevo");
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  const id = args[0];
  if (!id) {
    console.error("Uso: npx tsx scripts/cut.ts <projectId> [--from-cuts] [--min-silence 0.5] [--keep-gap 0.15]");
    process.exit(1);
  }
  const num = (flag: string, def: number) => {
    const i = args.indexOf(flag);
    return i >= 0 ? parseFloat(args[i + 1]) : def;
  };
  const p = projectPaths(id);
  try {
    const input = findMedia(p.raw);
    if (!input) throw new Error(`No hay video en projects/${id}/raw/`);
    const transcript = readJson<Transcript | null>(p.transcript, null);
    if (!transcript) throw new Error("Falta transcript.json. Corré primero scripts/transcribe.ts");

    let cuts: CutsFile;
    if (args.includes("--from-cuts")) {
      cuts = readJson<CutsFile | null>(p.cuts, null)!;
      if (!cuts) throw new Error("No existe cuts.json");
      setStatus(id, "cutting", "Usando cuts.json existente…");
    } else {
      const style = loadSettings(id).style.cut;
      const preset = CUT_PRESETS[style];
      const custom = ["--min-silence", "--keep-gap", "--no-fillers", "--no-retakes"].some((f) => args.includes(f));
      setStatus(id, "cutting", "Detectando silencios, muletillas y tomas repetidas…");
      cuts = await computeCuts({
        input,
        transcript,
        minSilenceS: num("--min-silence", preset.minSilenceS),
        keepGapS: num("--keep-gap", preset.keepGapS),
        fillers: preset.fillers && !args.includes("--no-fillers"),
        retakes: preset.retakes && !args.includes("--no-retakes"),
      });
      if (!custom) cuts.style = style;
    }
    await applyCuts(id, input, transcript, cuts);

    const secs = (ms: number) => (ms / 1000).toFixed(1);
    setStatus(
      id,
      "cutting",
      `Corte listo: ${secs(cuts.sourceDurationMs)}s → ${secs(cuts.cutDurationMs)}s (${cuts.keep.length} tramos).`,
    );
  } catch (err) {
    setStatus(id, "error", "Falló el corte", { error: (err as Error).message });
    throw err;
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
