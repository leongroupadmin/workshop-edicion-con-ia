import type { Brand, Settings, Word } from "../types";

export type ClipSettings = {
  brand: string;
  aiProvider: "anthropic" | "openai";
  count: number;
  minSeconds: number;
  maxSeconds: number;
  criterion: "auto" | "education" | "highlights" | "qa";
  instructions: string;
  cut: "soft" | "normal" | "aggressive";
  zoom: boolean;
  subtitles: Settings["subtitles"];
  music: string;
  musicVolume: number;
};
export const CLIP_DEFAULTS: ClipSettings = {
  brand: "",
  aiProvider: "anthropic",
  count: 0,
  minSeconds: 20,
  maxSeconds: 90,
  criterion: "auto",
  instructions: "",
  cut: "normal",
  zoom: false,
  subtitles: {
    style: "karaoke",
    size: 64,
    position: "bottom",
    maxWords: 4,
    uppercase: false,
  },
  music: "",
  musicVolume: 0.07,
};
export type ClipProposal = {
  id: string;
  title: string;
  reason: string;
  startMs: number;
  endMs: number;
  selected: boolean;
  file?: string;
  warning?: string;
};
export type ClipJob = {
  schema: "clips-v2";
  id: string;
  title: string;
  createdAt: string;
  source: string;
  durationMs: number;
  settings: ClipSettings;
  clips: ClipProposal[];
  step:
    | "uploading"
    | "transcribing"
    | "analyzing"
    | "review"
    | "tracking"
    | "rendering"
    | "done"
    | "error";
  message: string;
  error?: string;
  progress?: number;
};
export type FaceFrame = {
  timeMs: number;
  /** Hard source-camera cut: restart framing without panning across shots. */
  shot?: boolean;
  faces: {
    x: number;
    y: number;
    w: number;
    h: number;
    score: number;
    track: number;
  }[];
};
export type ClipRenderProps = {
  baseUrl: string;
  video: string;
  durationMs: number;
  sourceWidth: number;
  sourceHeight: number;
  words: Word[];
  settings: ClipSettings;
  brand: Brand;
  brandPath: string;
  faces: FaceFrame[];
  music?: string;
};

export function validateSettings(raw: unknown): ClipSettings {
  if (!raw || typeof raw !== "object")
    throw new Error("Configuración inválida.");
  const x = raw as Partial<ClipSettings>;
  const result = {
    ...CLIP_DEFAULTS,
    ...x,
    subtitles: { ...CLIP_DEFAULTS.subtitles, ...x.subtitles },
  };
  if (!Number.isInteger(result.count) || result.count < 0 || result.count > 10)
    throw new Error("Elegí entre 1 y 10 clips, o automático.");
  if (
    ![result.minSeconds, result.maxSeconds].every(Number.isFinite) ||
    result.minSeconds < 5 ||
    result.maxSeconds > 90 ||
    result.minSeconds > result.maxSeconds
  )
    throw new Error(
      "La duración debe estar entre 5 y 90 segundos; el mínimo no puede superar al máximo.",
    );
  if (
    !["anthropic", "openai"].includes(result.aiProvider) ||
    !["soft", "normal", "aggressive"].includes(result.cut) ||
    !["auto", "education", "highlights", "qa"].includes(result.criterion)
  )
    throw new Error("Opción de edición inválida.");
  if (typeof result.brand !== "string" || !/^[a-z0-9_-]+$/i.test(result.brand))
    throw new Error("Elegí una marca.");
  if (
    typeof result.instructions !== "string" ||
    result.instructions.length > 4000
  )
    throw new Error("Las indicaciones admiten hasta 4000 caracteres.");
  if (
    typeof result.zoom !== "boolean" ||
    typeof result.subtitles.uppercase !== "boolean"
  )
    throw new Error("Configuración inválida.");
  if (
    !["karaoke", "pop", "minimal", "simple", "none"].includes(
      result.subtitles.style,
    ) ||
    !["top", "middle", "bottom"].includes(result.subtitles.position)
  )
    throw new Error("Estilo de subtítulos inválido.");
  if (
    !Number.isFinite(result.subtitles.size) ||
    result.subtitles.size < 30 ||
    result.subtitles.size > 100 ||
    !Number.isInteger(result.subtitles.maxWords) ||
    result.subtitles.maxWords < 1 ||
    result.subtitles.maxWords > 4
  )
    throw new Error("Tamaño o cantidad de palabras inválidos.");
  if (
    typeof result.music !== "string" ||
    (result.music && !/^[\w .-]+\.(mp3|wav|m4a)$/i.test(result.music)) ||
    !Number.isFinite(result.musicVolume) ||
    result.musicVolume < 0 ||
    result.musicVolume > 0.3
  )
    throw new Error("Música inválida.");
  return result;
}
export function validateBounds(
  startMs: number,
  endMs: number,
  durationMs: number,
  settings: ClipSettings,
) {
  if (
    ![startMs, endMs, durationMs].every(Number.isFinite) ||
    startMs < 0 ||
    endMs > durationMs ||
    endMs <= startMs
  )
    throw new Error("El fragmento está fuera del video.");
  const duration = endMs - startMs;
  if (
    duration < settings.minSeconds * 1000 ||
    duration > settings.maxSeconds * 1000 ||
    duration > 90000
  )
    throw new Error(
      `Cada clip debe durar entre ${settings.minSeconds} y ${settings.maxSeconds} segundos.`,
    );
}
