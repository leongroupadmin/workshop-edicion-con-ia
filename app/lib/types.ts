// Tipos compartidos con el pipeline (fuente: /src/pipeline/types.ts).
export type {
  Brand,
  CutsFile,
  EditStyle,
  Format,
  PipelineStep,
  Plan,
  PlanItem,
  PlanItemType,
  ProjectImage,
  ProjectMeta,
  ProjectStatus,
  SceneLayout,
  SceneSpec,
  Settings,
  SubtitlePosition,
  SubtitleStyle,
  Transcript,
  Word,
} from "../../src/pipeline/types";

import type { Plan, PlanItem, ProjectMeta, ProjectStatus, Settings } from "../../src/pipeline/types";

/** Mantener en sync con /src/pipeline/types.ts. Vive acá para que Next no cargue código fuera de /app. */
export const MIN_SCENE_DURATION_MS = 2_000;
export const SCENE_TYPES = new Set<PlanItem["type"]>(["title", "motion_graphic", "overlay", "lower_third", "broll"]);
export const hasMinimumSceneDuration = (item: Pick<PlanItem, "type" | "startMs" | "endMs">) =>
  !SCENE_TYPES.has(item.type) || item.endMs - item.startMs >= MIN_SCENE_DURATION_MS;

export type ChatTool = { name: string; summary: string };

export type ChatEntry = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
  tools?: ChatTool[];
  costUsd?: number;
  error?: string;
};

export type VersionInfo = {
  version: number;
  file: string;
  createdAt: string;
  note: string;
  sizeBytes: number;
  format?: string;
  durationMs?: number;
};

export type ProjectSummary = {
  id: string;
  title: string;
  createdAt: string;
  status: ProjectStatus;
  hasThumb: boolean;
  versions: number;
};

export type CutSummary = {
  sourceMs: number;
  cutMs: number;
  silences: number;
  fillers: number;
  retakes: number;
};

export type ProjectState = {
  meta: ProjectMeta;
  status: ProjectStatus;
  settings: Settings;
  plan: Plan | null;
  versions: VersionInfo[];
  cut: CutSummary | null;
  durationMs: number;
  transcriptText: string;
  chat: ChatEntry[];
  running: { kind: "agent" | "job"; label: string } | null;
  liveEntry: ChatEntry | null;
  hasThumb: boolean;
  /** Qué haría el botón "Renderizar / Re-renderizar". */
  build: BuildInfo;
};

export type BuildInfo = {
  /** waiting = todavía preparando; render = nunca se renderizó; rerender = hay cambios; uptodate = al día. */
  mode: "waiting" | "render" | "rerender" | "uptodate";
  /** Cambios desde la última versión, en español. */
  pending: string[];
  /** Gráficos que Claude tiene que generar al renderizar. */
  scenes: { id: string; label: string }[];
  /** Hay que volver a cortar el video (cambió "Cortes"). */
  recut: boolean;
  planDraft: boolean;
};

export type ServerEvent =
  | { type: "status"; status: ProjectStatus }
  | { type: "chat"; entry: ChatEntry }
  | { type: "delta"; entryId: string; text: string }
  | { type: "tool"; entryId: string; tool: ChatTool }
  | { type: "running"; running: ProjectState["running"] }
  | { type: "refresh" };
