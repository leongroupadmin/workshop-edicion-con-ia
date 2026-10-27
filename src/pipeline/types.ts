// Tipos compartidos entre los scripts del pipeline (/scripts), la composición
// de Remotion (/src) y el panel (/app). Mantener en sync con CLAUDE.md.

export type Word = {
  /** Palabra tal como la transcribió Whisper (puede incluir puntuación). */
  text: string;
  startMs: number;
  endMs: number;
  confidence: number | null;
};

export type Transcript = {
  version: 1;
  /** Archivo transcripto, relativo a la carpeta del proyecto. */
  source: string;
  language: string;
  model: string;
  durationMs: number;
  createdAt: string;
  text: string;
  words: Word[];
};

/** Tramo del video original que se conserva en cut.mp4. */
export type KeepSegment = { startMs: number; endMs: number };

export type CutReason = "silence" | "filler" | "retake" | "manual";

export type RemovedRange = {
  startMs: number;
  endMs: number;
  reason: CutReason;
  text?: string;
};

/** cuts.json: decisión de corte (editable a mano o por Claude). */
export type CutsFile = {
  version: 1;
  sourceDurationMs: number;
  cutDurationMs: number;
  keep: KeepSegment[];
  removed: RemovedRange[];
  /** Preset de corte con el que se calculó (settings.style.cut); sin valor = a mano / con opciones. */
  style?: "soft" | "normal" | "aggressive";
};

/** Una imagen que subió el usuario para un video (projects/<id>/images.json). */
export type ProjectImage = {
  file: string;
  /** Qué se ve / para qué sirve. Lo escribe el usuario; ayuda a Claude a ubicarla. */
  note?: string;
};

export type PlanItemType =
  | "title"
  | "motion_graphic"
  | "overlay"
  | "lower_third"
  | "broll"
  | "transition"
  | "sfx"
  | "zoom";

/**
 * overlay: la escena va encima del video con transparencia.
 * fullscreen: la escena tapa el video (inserto); la voz sigue.
 * split: pantalla dividida, escena arriba y video abajo (en horizontal:
 *   escena a la izquierda, video a la derecha).
 */
export type SceneLayout = "overlay" | "fullscreen" | "split" | "pip" | "frame";

/**
 * Layouts donde el gráfico ocupa toda la pantalla y el video se dibuja ENCIMA,
 * metido en un rectángulo: "pip" (vos chiquito en una esquina) y "frame" (tu
 * video enmarcado, con lugar para el título arriba y la marca abajo).
 * La escena se genera a pantalla completa y tiene que dejar ese rectángulo
 * libre (el BRIEF.md de cada escena dice exactamente dónde cae).
 */
export const INSET_LAYOUTS = new Set<SceneLayout>(["pip", "frame"]);

/** Tipos de ítem que llevan una escena de HyperFrames. */
export const SCENE_TYPES = new Set(["title", "motion_graphic", "overlay", "lower_third", "broll"]);

/** Ítems del plan que van al video: sin escenas cuando el estilo es "sin motion graphics". */
export const itemsForStyle = <T extends { type: string }>(items: T[], style: { noGraphics?: boolean }): T[] =>
  style.noGraphics ? items.filter((i) => !SCENE_TYPES.has(i.type)) : items;
/**
 * Regla de edición: una escena visual necesita tiempo suficiente para leerse.
 * Aplica a motion, b-rolls, overlays, títulos y lower thirds; no a subtítulos,
 * transiciones, zooms ni efectos de sonido.
 */
export const MIN_SCENE_READ_MS = 2_000;
// Reserva para entrada (0.6s), escalonado (<0.5s), anticipación (0.07s),
// salida (0.4s) y respiro (0.2s), redondeada hacia arriba.
export const SCENE_ANIMATION_BUDGET_MS = 1_800;
export const MIN_SCENE_DURATION_MS = MIN_SCENE_READ_MS + SCENE_ANIMATION_BUDGET_MS;
const OVERLAY_BY_DEFAULT = new Set(["title", "overlay", "lower_third"]);

/**
 * "Combinado" (layoutUse "mixed"): los gráficos rotan entre los layouts
 * disponibles sin repetir dos iguales seguidos. Arranca a pantalla completa
 * porque el primer gráfico es el gancho de los primeros segundos.
 *
 * Los gráficos con fotos nunca van en overlay: ahí la foto queda chica y se
 * desperdicia (ver CLAUDE.md). En ese caso se usa el layout grande que no
 * repita con el anterior.
 */
export const MIXED_ORDER: SceneLayout[] = ["fullscreen", "overlay", "split", "pip", "frame"];

export const mixedLayout = (index: number, hasImages = false, prev?: SceneLayout): SceneLayout => {
  // Candidatos: la rotación empezando por el que le toca a este gráfico.
  const turno = index % MIXED_ORDER.length;
  const candidatos = MIXED_ORDER.map((_, i) => MIXED_ORDER[(turno + i) % MIXED_ORDER.length]);
  const sirve = (l: SceneLayout) => l !== prev && (!hasImages || l !== "overlay");
  return candidatos.find(sirve) ?? candidatos.find((l) => l !== prev) ?? candidatos[0];
};

/** Layouts que se pueden dejar fijos todo el video ("Fijo" en el panel). */
export const FIXABLE_LAYOUTS = new Set<EditStyle["layoutUse"]>(["split", "pip", "frame"]);

/** El layout que queda fijo todo el video, o null si no hay ninguno. */
export const fixedLayoutOf = (style: EditStyle): "split" | "pip" | "frame" | null =>
  style.fixedLayout && FIXABLE_LAYOUTS.has(style.layoutUse) ? (style.layoutUse as "split" | "pip" | "frame") : null;

export const sceneLayout = (it: Pick<PlanItem, "type" | "layout">): SceneLayout =>
  it.layout ?? (OVERLAY_BY_DEFAULT.has(it.type) ? "overlay" : "fullscreen");

export type PlanItem = {
  id: string;
  type: PlanItemType;
  /** Tiempos sobre el video CORTADO (cut.mp4), en ms. */
  startMs: number;
  endMs: number;
  description: string;
  reason: string;
  /** Cómo se combina la escena con el video (ver SceneLayout). */
  layout?: SceneLayout;
  /** Texto principal que aparece en pantalla, si aplica. */
  text?: string;
  /**
   * Imágenes del usuario que usa esta escena (nombres de archivo de
   * projects/<id>/images). scene.ts las copia a assets/img de la escena.
   */
  images?: string[];
  /** Archivo generado, relativo a la carpeta del proyecto (scenes/xx.mov, assets de sfx, etc.). */
  file?: string;
  /** Para sfx: archivo de /assets/music (relativo a /assets). */
  sound?: string;
  /** Para transition: flash, fade, wipe/slide, zoom, whip, blur, glitch, lightleak, shake, zoomblur, spin, iris, blinds o filmburn (ver src/edit/transitions.tsx). */
  transition?: string;
  /** Para zoom: escala (1.0-1.5). */
  scale?: number;
  /** Para zoom: "in" (acerca y vuelve, por defecto) u "out" (arranca cerca y se aleja despacio). */
  zoom?: "in" | "out";
  /** Ocultar subtítulos mientras dura este elemento (si la escena ya tiene texto). */
  hideCaptions?: boolean;
  /** Uso interno del panel: escena anterior, para volver a ella sin regenerar si se deshace un cambio de layout. */
  prevScene?: { layout: SceneLayout; file: string };
  /** Con qué formato/tamaño/estilo se generó la escena (si cambia, hay que regenerarla). Lo escribe scene.ts. */
  sceneSpec?: SceneSpec;
  status?: "pending" | "approved" | "removed" | "rendered" | "error";
};

/** Verificación compartida antes de crear o montar cualquier escena visual. */
export const hasMinimumSceneDuration = (item: Pick<PlanItem, "type" | "startMs" | "endMs">) =>
  !SCENE_TYPES.has(item.type) || item.endMs - item.startMs >= MIN_SCENE_DURATION_MS;

export type Plan = {
  version: 1;
  status: "draft" | "approved";
  createdAt: string;
  approvedAt?: string;
  summary?: string;
  /** Palabras a resaltar en los subtítulos. */
  keywords?: string[];
  items: PlanItem[];
};

export type Format = "vertical" | "horizontal" | "square";
export type SubtitleStyle = "karaoke" | "simple" | "pop" | "minimal" | "none";
export type SubtitlePosition = "bottom" | "middle" | "top";

export type Settings = {
  /** Proveedor que arma el plan y atiende el chat de este proyecto. */
  aiProvider: "anthropic" | "openai";
  format: Format;
  fps: number;
  subtitles: {
    style: SubtitleStyle;
    /** Tamaño de fuente en px sobre un lienzo de 1080 de ancho. */
    size: number;
    position: SubtitlePosition;
    maxWords: number;
    uppercase: boolean;
    mixFonts?: boolean;
    primaryFont?: "heading" | "body";
    accentFont?: "brand" | "lora" | "heading" | "body";
    /** Color del texto de los subtítulos (hex). Vacío = el color de texto de la marca. */
    color?: string;
  };
  music: {
    enabled: boolean;
    /** 0-1, volumen cuando NO hablás. */
    volume: number;
    /** 0-1, multiplicador mientras hablás (ducking). */
    duckTo: number;
    /** Archivo de /assets/music. Vacío = el primero que haya. */
    track: string;
  };
  /** Efectos de sonido del plan (whoosh, pop, impact…; archivos en /assets/music/sfx). */
  sfx: {
    enabled: boolean;
    /** 0-1. Van por debajo de la voz (~0.4). */
    volume: number;
  };
  style: EditStyle;
  /**
   * Indicaciones libres del usuario para esta edición (opcional). Claude las
   * tiene en cuenta al armar el plan y al diseñar las escenas.
   */
  instructions: string;
};

/** Estilo de edición (sección "Estilo de edición" del panel). */
export type EditStyle = {
  /** Cuántos elementos pone Claude en el plan: calm 1 cada 6-10 s, normal 4-8 s, dynamic 2-4 s. */
  pace: "calm" | "normal" | "dynamic";
  /**
   * Cantidad exacta de gráficos (ítems con escena) repartidos parejos en el
   * video: duración / cantidad. 0 = automática (según el ritmo).
   */
  graphicsCount: number;
  /** Estilo visual con el que Claude diseña los motion graphics. */
  graphics: "minimal" | "bold" | "corporate";
  /** Ausente en proyectos anteriores: equivale a 2D. */
  graphicsDimension?: "2d" | "2.5d" | "3d";
  /**
   * Sin motion graphics (p.ej. monólogos): el plan no lleva ítems con escena,
   * solo zooms, transiciones y sonidos. Si el plan tiene escenas, no se usan.
   */
  noGraphics?: boolean;
  /**
   * Cómo se muestran los gráficos sobre el video:
   * - auto: lo decide Claude según el contenido (mezcla los tres).
   * - overlay: siempre encima del video, con fondo transparente.
   * - split: siempre en pantalla dividida (gráfico y cara a la vez).
   * - fullscreen: siempre tapando la pantalla, como un b-roll; la voz sigue.
   */
  layoutUse: "auto" | "mixed" | "overlay" | "split" | "fullscreen" | "pip" | "frame";
  /**
   * "Fijo": con layoutUse split, pip o frame, ese armado queda TODO el video
   * (la pantalla nunca vuelve a la cara completa). Entre escena y escena se ve
   * un fondo de marca; transiciones y zooms siguen funcionando.
   */
  fixedLayout?: boolean;
  split: {
    /** Dónde va el gráfico en pantalla dividida: top = arriba (en horizontal, a la izquierda). */
    position: "top" | "bottom";
    /** Parte de la pantalla que ocupa el gráfico: 0.4, 0.5 o 0.6. */
    share: number;
  };
  /** Qué tanto corta (ver CUT_PRESETS). */
  cut: "soft" | "normal" | "aggressive";
  /** Zoom alternado en cada corte (estilo jump cut). */
  autoZoom: boolean;
};

export const CUT_PRESETS: Record<
  EditStyle["cut"],
  { minSilenceS: number; keepGapS: number; fillers: boolean; retakes: boolean }
> = {
  soft: { minSilenceS: 0.9, keepGapS: 0.25, fillers: false, retakes: true },
  normal: { minSilenceS: 0.5, keepGapS: 0.15, fillers: true, retakes: true },
  aggressive: { minSilenceS: 0.3, keepGapS: 0.08, fillers: true, retakes: true },
};

/** Escala del zoom automático en los tramos "acercados". */
export const AUTO_ZOOM_SCALE = 1.12;

export const DEFAULT_SETTINGS: Settings = {
  aiProvider: "anthropic",
  format: "vertical",
  fps: 30,
  subtitles: {
    style: "karaoke",
    size: 72,
    position: "bottom",
    maxWords: 3,
    uppercase: false,
    mixFonts: false,
    primaryFont: "heading",
    accentFont: "brand",
  },
  music: {
    enabled: true,
    volume: 0.25,
    duckTo: 0.3,
    track: "",
  },
  sfx: { enabled: true, volume: 0.4 },
  instructions: "",
  style: {
    pace: "normal",
    graphicsCount: 0,
    graphics: "bold",
    graphicsDimension: "2d",
    layoutUse: "auto",
    split: { position: "top", share: 0.5 },
    cut: "normal",
    autoZoom: false,
  },
};

/**
 * Ajustes viejos: antes "cómo se ven los gráficos" era `splitUse`
 * (never / auto / always). "Nunca" pasa a "encima del video" y "Siempre" a
 * "pantalla dividida", así los proyectos que ya existen no cambian de aspecto.
 */
const LEGACY_LAYOUT: Record<string, EditStyle["layoutUse"]> = {
  never: "overlay",
  auto: "auto",
  always: "split",
};

/** Completa un settings.json parcial (o viejo) con los valores por defecto. */
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

export const FORMAT_SIZE: Record<Format, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
  square: { width: 1080, height: 1080 },
};

export type SceneSpec = { layout: SceneLayout; width: number; height: number; graphics: string; graphicsDimension?: EditStyle["graphicsDimension"] };

/** Formato, tamaño y estilo que tiene que tener la escena de un ítem con los ajustes actuales. */
export const sceneSpecFor = (item: Pick<PlanItem, "type" | "layout">, settings: Settings): SceneSpec => {
  const layout = sceneLayout(item);
  const { width, height } =
    layout === "split" ? splitSceneSize(settings.format, settings.style.split.share) : FORMAT_SIZE[settings.format];
  return { layout, width, height, graphics: settings.style.graphics, graphicsDimension: settings.style.graphicsDimension ?? "2d" };
};

/** Tamaño de la escena de pantalla dividida (`share` = parte de la pantalla que ocupa el gráfico). */
export const splitSceneSize = (format: Format, share = 0.5) => {
  const { width, height } = FORMAT_SIZE[format];
  const even = (n: number) => Math.round(n / 2) * 2;
  return format === "horizontal" ? { width: even(width * share), height } : { width, height: even(height * share) };
};

export type Brand = {
  name: string;
  /** Marca predefinida que viene con Editor LG (assets/brands/preset-*). */
  preset?: boolean;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    highlight: string;
  };
  fonts: {
    heading: string;
    body: string;
    /** Segunda fuente para palabras clave cuando se combinan subtítulos. */
    subtitleAccent?: string;
    /** Archivos de fuente en /assets/brand/fonts (nombre de archivo). */
    files: { family: string; file: string; weight?: number }[];
  };
  /** Archivo de logo en /assets/brand (nombre de archivo). */
  logo: string;
};

export const DEFAULT_BRAND: Brand = {
  name: "Mi marca",
  colors: {
    primary: "#FFB600",
    secondary: "#FFD04A",
    background: "#0A0A0A",
    text: "#FFFFFF",
    highlight: "#FFB600",
  },
  fonts: {
    heading: "Inter",
    body: "Inter",
    subtitleAccent: "Lora cursiva",
    files: [],
  },
  logo: "",
};

/** Props que recibe la composición "Edit" de Remotion. */
export type EditProps = {
  projectId: string;
  /** URL base desde la que se sirven los archivos (http://127.0.0.1:PORT). */
  baseUrl: string;
  cutVideo: string;
  durationMs: number;
  sourceWidth: number;
  sourceHeight: number;
  words: Word[];
  plan: Plan | null;
  settings: Settings;
  brand: Brand;
  brandAssetsPath?: string;
  musicFile: string | null;
  /** Momentos de cut.mp4 (ms) donde hay un corte; los usa el zoom automático. */
  cutPoints?: number[];
};

export type PipelineStep =
  | "idle"
  | "uploading"
  | "transcribing"
  | "cutting"
  | "planning"
  | "awaiting_approval"
  | "generating_scenes"
  | "assembling"
  | "rendering"
  | "done"
  | "error";

export type ProjectStatus = {
  step: PipelineStep;
  message: string;
  progress?: number;
  error?: string;
  updatedAt: string;
};

export type ProjectMeta = {
  id: string;
  title: string;
  createdAt: string;
  originalName: string;
  brandSlug?: string;
  brandName?: string;
  sessionId?: string;
};
