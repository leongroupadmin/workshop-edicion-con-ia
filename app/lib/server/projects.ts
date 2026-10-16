import "server-only";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { mergeSettings } from "../defaults";
import type {
  ChatEntry,
  CutsFile,
  Plan,
  ProjectMeta,
  ProjectState,
  ProjectStatus,
  ProjectSummary,
  Settings,
  Transcript,
  VersionInfo,
} from "../types";
import { emit, getRunning, store } from "./bus";
import { DEFAULTS_FILE, PROJECTS_DIR, moveToTrash, projectDir, readJson, writeJson } from "./fsutil";

export const paths = (id: string) => {
  const dir = projectDir(id);
  return {
    dir,
    raw: path.join(dir, "raw"),
    meta: path.join(dir, "project.json"),
    status: path.join(dir, "status.json"),
    settings: path.join(dir, "settings.json"),
    plan: path.join(dir, "plan.json"),
    images: path.join(dir, "images"),
    imagesMeta: path.join(dir, "images.json"),
    broll: path.join(dir, "broll"),
    brollMeta: path.join(dir, "broll.json"),
    cuts: path.join(dir, "cuts.json"),
    cut: path.join(dir, "cut.mp4"),
    transcript: path.join(dir, "transcript.json"),
    cutTranscript: path.join(dir, "cut.transcript.json"),
    cutsApplied: path.join(dir, ".cuts-applied.json"),
    chat: path.join(dir, "chat.json"),
    versions: path.join(dir, "versions"),
    logs: path.join(dir, "logs"),
    thumb: path.join(dir, "thumb.jpg"),
  };
};

export const exists = (id: string) => {
  try {
    return fs.existsSync(paths(id).meta) || fs.existsSync(paths(id).raw);
  } catch {
    return false;
  }
};

const IDLE: ProjectStatus = { step: "idle", message: "", updatedAt: new Date(0).toISOString() };

export const readStatus = (id: string): ProjectStatus => readJson(paths(id).status, IDLE);

export const writeStatus = (id: string, step: ProjectStatus["step"], message: string, extra: Partial<ProjectStatus> = {}) => {
  const status: ProjectStatus = { step, message, updatedAt: new Date().toISOString(), ...extra };
  writeJson(paths(id).status, status);
  emit(id, { type: "status", status });
  appendLog(id, "pipeline.log", `[${step}] ${message}${extra.error ? `\n${extra.error}` : ""}`);
  return status;
};

export const appendLog = (id: string, file: string, line: string) => {
  const p = paths(id);
  fs.mkdirSync(p.logs, { recursive: true });
  fs.appendFileSync(path.join(p.logs, file), `${new Date().toISOString()} ${line}\n`);
};

export const readMeta = (id: string): ProjectMeta =>
  readJson<ProjectMeta>(paths(id).meta, { id, title: id, createdAt: new Date(0).toISOString(), originalName: "" });

export const writeMeta = (id: string, patch: Partial<ProjectMeta>) => {
  const meta = { ...readMeta(id), ...patch };
  writeJson(paths(id).meta, meta);
  return meta;
};

export const readSettings = (id: string): Settings => mergeSettings(readJson<Partial<Settings>>(paths(id).settings, {}));

/** Ajustes con los que arrancan los videos nuevos (assets/defaults.json sobre los de fábrica). */
export const readDefaultSettings = (): Settings => mergeSettings(readJson<Partial<Settings>>(DEFAULTS_FILE, {}));
export const writeDefaultSettings = (s: Settings) => writeJson(DEFAULTS_FILE, s);

export const readPlan = (id: string) => readJson<Plan | null>(paths(id).plan, null);
export const writePlan = (id: string, plan: Plan) => writeJson(paths(id).plan, plan);

export const readChat = (id: string) => readJson<ChatEntry[]>(paths(id).chat, []);
export const appendChat = (id: string, entry: ChatEntry) => {
  const chat = readChat(id);
  chat.push(entry);
  writeJson(paths(id).chat, chat);
  emit(id, { type: "chat", entry });
};

export const listVersions = (id: string): VersionInfo[] => {
  const dir = paths(id).versions;
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((f) => /^v(\d+)\.mp4$/.exec(f))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => {
      const n = Number(m[1]);
      const meta = readJson<Partial<VersionInfo> & { createdAt?: string; note?: string }>(
        path.join(dir, `v${n}.json`),
        {},
      );
      const stat = fs.statSync(path.join(dir, m[0]));
      return {
        version: n,
        file: `versions/${m[0]}`,
        createdAt: meta.createdAt ?? stat.mtime.toISOString(),
        note: meta.note ?? "",
        sizeBytes: stat.size,
        format: meta.format,
        durationMs: meta.durationMs,
      };
    })
    .sort((a, b) => a.version - b.version);
};

/** Guarda el número de versión más alto que existió, para no reutilizarlo (lo lee scripts/render.ts). */
const lastVersionFile = (id: string) => path.join(paths(id).versions, ".last-version");

/** Número que va a tener la próxima versión (los de versiones borradas no se reutilizan). */
export const nextVersion = (id: string) =>
  Math.max(listVersions(id).at(-1)?.version ?? 0, readJson<number>(lastVersionFile(id), 0)) + 1;

/** Miniatura del proyecto: cuadro de la última versión o, si no hay, del video cortado. */
const refreshThumb = (id: string) => {
  const p = paths(id);
  const latest = listVersions(id).at(-1);
  const src = latest ? path.join(p.dir, latest.file) : fs.existsSync(p.cut) ? p.cut : null;
  if (!src) return Promise.resolve();
  return new Promise<void>((resolve) =>
    execFile("ffmpeg", ["-y", "-v", "error", "-ss", "1", "-i", src, "-frames:v", "1", "-vf", "scale=360:-2", p.thumb], () =>
      resolve(),
    ),
  );
};

/** Manda una versión (vN.mp4 + vN.json) a la Papelera. */
export const deleteVersion = async (id: string, n: number) => {
  const dir = paths(id).versions;
  const files = [`v${n}.mp4`, `v${n}.json`].map((f) => path.join(dir, f));
  if (!fs.existsSync(files[0])) throw new Error(`No existe la versión v${n}.`);
  const numbers = listVersions(id).map((v) => v.version);
  writeJson(lastVersionFile(id), Math.max(readJson<number>(lastVersionFile(id), 0), ...numbers));
  await moveToTrash(files);
  if (n === Math.max(...numbers)) await refreshThumb(id);
  emit(id, { type: "refresh" });
};

/** Manda el proyecto entero (original, corte, escenas, versiones…) a la Papelera. */
export const deleteProject = async (id: string) => {
  if (store.running.has(id)) {
    throw new Error("Hay un proceso trabajando en este proyecto. Detenelo (o esperá a que termine) y volvé a intentar.");
  }
  await moveToTrash([paths(id).dir]);
  store.live.delete(id);
  emit(id, { type: "refresh" });
};

export const newProjectId = (name: string) => {
  const base = name
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "video";
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${stamp}-${base}-${crypto.randomBytes(2).toString("hex")}`;
};

export const listProjects = (): ProjectSummary[] => {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .filter((d) => fs.existsSync(path.join(PROJECTS_DIR, d.name, "project.json")))
    .map((d) => {
      const id = d.name;
      const meta = readMeta(id);
      return {
        id,
        title: meta.title,
        createdAt: meta.createdAt,
        status: readStatus(id),
        hasThumb: fs.existsSync(paths(id).thumb),
        versions: listVersions(id).length,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

/** Ajustes con los que se renderizó la última versión (null si no hay ninguna). */
export const lastRenderedSettings = (id: string): Settings | null => {
  const last = listVersions(id).at(-1);
  if (!last) return null;
  const meta = readJson<{ settings?: Partial<Settings> } | null>(path.join(paths(id).versions, `v${last.version}.json`), null);
  return meta?.settings ? mergeSettings(meta.settings) : null;
};

export const getProjectState = (id: string): Omit<ProjectState, "build"> => {
  const p = paths(id);
  const cuts = readJson<CutsFile | null>(p.cuts, null);
  const t = readJson<Transcript | null>(p.cutTranscript, null) ?? readJson<Transcript | null>(p.transcript, null);
  const n = (r: string) => cuts?.removed.filter((x) => x.reason === r).length ?? 0;
  return {
    meta: readMeta(id),
    status: readStatus(id),
    settings: readSettings(id),
    plan: readPlan(id),
    versions: listVersions(id),
    cut: cuts
      ? {
          sourceMs: cuts.sourceDurationMs,
          cutMs: cuts.cutDurationMs,
          silences: n("silence"),
          fillers: n("filler"),
          retakes: n("retake"),
        }
      : null,
    durationMs: cuts?.cutDurationMs ?? t?.durationMs ?? 0,
    transcriptText: t?.text ?? "",
    chat: readChat(id),
    running: getRunning(id),
    liveEntry: store.live.get(id) ?? null,
    hasThumb: fs.existsSync(p.thumb),
  };
};
