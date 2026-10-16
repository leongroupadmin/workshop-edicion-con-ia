import type { WhisperModel } from "@remotion/install-whisper-cpp";
import path from "node:path";

// Raíz del repo (scripts/lib/ -> ../../)
export const ROOT = path.resolve(__dirname, "..", "..");

export const PROJECTS_DIR = path.join(ROOT, "projects");
export const ASSETS_DIR = path.join(ROOT, "assets");
export const BRAND_DIR = path.join(ASSETS_DIR, "brand");
export const MUSIC_DIR = path.join(ASSETS_DIR, "music");

export const WHISPER_PATH = path.join(ROOT, "whisper.cpp");
export const WHISPER_VERSION = "1.7.6";
// Se puede forzar otro modelo con la variable WHISPER_MODEL (p.ej. "small" para probar rápido).
export const WHISPER_MODEL = (process.env.WHISPER_MODEL || "medium") as WhisperModel;
export const WHISPER_LANGUAGE = "es" as const;

export const projectDir = (id: string) => path.join(PROJECTS_DIR, id);

export const projectPaths = (id: string) => {
  const dir = projectDir(id);
  return {
    dir,
    raw: path.join(dir, "raw"),
    audio: path.join(dir, "audio.wav"),
    transcript: path.join(dir, "transcript.json"),
    cut: path.join(dir, "cut.mp4"),
    cutTranscript: path.join(dir, "cut.transcript.json"),
    /** Cortes con los que se generó el cut.mp4 actual (para re-sincronizar el plan si cambia). */
    cutsApplied: path.join(dir, ".cuts-applied.json"),
    cuts: path.join(dir, "cuts.json"),
    plan: path.join(dir, "plan.json"),
    /** Imágenes que subió el usuario para este video (las usa Claude en las escenas). */
    images: path.join(dir, "images"),
    /** Descripción corta de cada imagen, para que Claude sepa cuándo usarla. */
    imagesMeta: path.join(dir, "images.json"),
    broll: path.join(dir, "broll"),
    brollMeta: path.join(dir, "broll.json"),
    scenes: path.join(dir, "scenes"),
    scenesSrc: path.join(dir, "scenes-src"),
    versions: path.join(dir, "versions"),
    chat: path.join(dir, "chat.json"),
    settings: path.join(dir, "settings.json"),
    status: path.join(dir, "status.json"),
    meta: path.join(dir, "project.json"),
    logs: path.join(dir, "logs"),
    thumb: path.join(dir, "thumb.jpg"),
  };
};
