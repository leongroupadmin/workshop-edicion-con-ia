import type { EditStyle, Format, PlanItem, SceneLayout, SceneSpec, Settings } from "./types";

// Mantener en sync con DEFAULT_SETTINGS de /src/pipeline/types.ts
export const DEFAULT_SETTINGS: Settings = {
  format: "vertical",
  fps: 30,
  subtitles: { style: "karaoke", size: 72, position: "bottom", maxWords: 3, uppercase: false },
  music: { enabled: true, volume: 0.25, duckTo: 0.3, track: "" },
  sfx: { enabled: true, volume: 0.4 },
  instructions: "",
  style: {
    pace: "normal",
    graphicsCount: 0,
    graphics: "bold",
    layoutUse: "auto",
    split: { position: "top", share: 0.5 },
    cut: "normal",
    autoZoom: false,
  },
};

/**
 * Ajustes viejos: "cómo se ven los gráficos" era `splitUse`
 * (never / auto / always). Así los proyectos que ya existen no cambian.
 */
const LEGACY_LAYOUT: Record<string, EditStyle["layoutUse"]> = {
  never: "overlay",
  auto: "auto",
  always: "split",
};

// Mantener en sync con mergeSettings de /src/pipeline/types.ts
export const mergeSettings = (s: Partial<Settings>, base: Settings = DEFAULT_SETTINGS): Settings => {
  const style = s.style as (Partial<EditStyle> & { splitUse?: string }) | undefined;
  const legacy = !style?.layoutUse && style?.splitUse ? LEGACY_LAYOUT[style.splitUse] : undefined;
  return {
    ...base,
    ...s,
    subtitles: { ...base.subtitles, ...(s.subtitles ?? {}) },
    music: { ...base.music, ...(s.music ?? {}) },
    sfx: { ...base.sfx, ...(s.sfx ?? {}) },
    style: {
      ...base.style,
      ...(s.style ?? {}),
      ...(legacy ? { layoutUse: legacy } : {}),
      split: { ...base.style.split, ...(s.style?.split ?? {}) },
    },
  };
};

export const PACE_LABELS: Record<EditStyle["pace"], string> = {
  calm: "Tranquilo",
  normal: "Normal",
  dynamic: "Dinámico",
};

export const GRAPHICS_LABELS: Record<EditStyle["graphics"], string> = {
  minimal: "Minimalista",
  bold: "Impactante",
  corporate: "Corporativo",
};

export const LAYOUT_USE_LABELS: Record<EditStyle["layoutUse"], string> = {
  auto: "Que decida Claude",
  overlay: "Encima del video",
  split: "Pantalla dividida",
  fullscreen: "Pantalla completa",
};

export const CUT_LABELS: Record<EditStyle["cut"], string> = {
  soft: "Suaves",
  normal: "Normales",
  aggressive: "Agresivos",
};

export const SPLIT_SHARES = [
  { value: 0.4, label: "Más video" },
  { value: 0.5, label: "Mitad y mitad" },
  { value: 0.6, label: "Más gráfico" },
];

export const STEP_LABELS: Record<string, string> = {
  idle: "En espera",
  uploading: "Subiendo",
  transcribing: "Transcribiendo",
  cutting: "Cortando",
  planning: "Armando el plan",
  awaiting_approval: "Listo para renderizar",
  generating_scenes: "Generando escenas",
  assembling: "Montando",
  rendering: "Renderizando",
  done: "Listo",
  error: "Error",
};

export const PIPELINE_ORDER = [
  "transcribing",
  "cutting",
  "planning",
  "awaiting_approval",
  "generating_scenes",
  "assembling",
  "rendering",
  "done",
] as const;

export const TYPE_LABELS: Record<string, string> = {
  title: "Título",
  motion_graphic: "Motion graphic",
  overlay: "Overlay",
  lower_third: "Lower third",
  broll: "B-roll",
  transition: "Transición",
  sfx: "Efecto de sonido",
  zoom: "Zoom",
};

// Mantener en sync con SCENE_TYPES / sceneLayout de /src/pipeline/types.ts
export const SCENE_TYPES = new Set(["title", "motion_graphic", "overlay", "lower_third", "broll"]);
const OVERLAY_BY_DEFAULT = new Set(["title", "overlay", "lower_third"]);
export const sceneLayout = (it: Pick<PlanItem, "type" | "layout">): SceneLayout =>
  it.layout ?? (OVERLAY_BY_DEFAULT.has(it.type) ? "overlay" : "fullscreen");

// Mantener en sync con FORMAT_SIZE / splitSceneSize / sceneSpecFor de /src/pipeline/types.ts
export const FORMAT_SIZE: Record<Format, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
  square: { width: 1080, height: 1080 },
};
export const splitSceneSize = (format: Format, share = 0.5) => {
  const { width, height } = FORMAT_SIZE[format];
  const even = (n: number) => Math.round(n / 2) * 2;
  return format === "horizontal" ? { width: even(width * share), height } : { width, height: even(height * share) };
};
export const sceneSpecFor = (item: Pick<PlanItem, "type" | "layout">, settings: Settings): SceneSpec => {
  const layout = sceneLayout(item);
  const { width, height } =
    layout === "split" ? splitSceneSize(settings.format, settings.style.split.share) : FORMAT_SIZE[settings.format];
  return { layout, width, height, graphics: settings.style.graphics };
};

export const LAYOUT_LABELS: Record<SceneLayout, string> = {
  overlay: "Encima del video",
  fullscreen: "Pantalla completa",
  split: "Pantalla dividida",
};
