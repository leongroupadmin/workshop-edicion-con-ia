import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_BRAND,
  DEFAULT_SETTINGS,
  mergeSettings,
  type Brand,
  type Settings,
} from "../../src/pipeline/types";
import { BRAND_DIR, MUSIC_DIR, ROOT, projectPaths } from "./config";
import { readJson, writeJson } from "./media";

/** Ajustes para videos nuevos: assets/defaults.json (lo guarda el panel) sobre los de fábrica. */
export const DEFAULTS_FILE = path.join(ROOT, "assets", "defaults.json");
export const loadDefaultSettings = (): Settings =>
  mergeSettings(readJson<Partial<Settings>>(DEFAULTS_FILE, {}), DEFAULT_SETTINGS);

/** settings.json del proyecto, completando con los valores por defecto. */
export const loadSettings = (id: string): Settings =>
  mergeSettings(readJson<Partial<Settings>>(projectPaths(id).settings, {}));

export const ensureSettings = (id: string) => {
  const p = projectPaths(id);
  if (!fs.existsSync(p.settings)) writeJson(p.settings, loadDefaultSettings());
};

/** /assets/brand/brand.json (se usa siempre que exista). */
export const loadBrand = (): Brand => {
  const b = readJson<Partial<Brand>>(path.join(BRAND_DIR, "brand.json"), {});
  return {
    ...DEFAULT_BRAND,
    ...b,
    colors: { ...DEFAULT_BRAND.colors, ...(b.colors ?? {}) },
    fonts: { ...DEFAULT_BRAND.fonts, ...(b.fonts ?? {}) },
  };
};

const MUSIC_EXTS = [".mp3", ".wav", ".m4a", ".aac", ".ogg"];

/** Pista de música: la elegida en settings o la primera de /assets/music. Ruta relativa a la raíz. */
export const pickMusic = (settings: Settings): string | null => {
  if (!settings.music.enabled) return null;
  if (settings.music.track) {
    const f = path.join(MUSIC_DIR, settings.music.track);
    if (fs.existsSync(f)) return `assets/music/${settings.music.track}`;
  }
  if (!fs.existsSync(MUSIC_DIR)) return null;
  const first = fs
    .readdirSync(MUSIC_DIR)
    .filter((f) => MUSIC_EXTS.includes(path.extname(f).toLowerCase()))
    .sort()[0];
  return first ? `assets/music/${first}` : null;
};

export const listVersions = (id: string): number[] => {
  const dir = projectPaths(id).versions;
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((f) => /^v(\d+)\.mp4$/.exec(f)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b);
};
