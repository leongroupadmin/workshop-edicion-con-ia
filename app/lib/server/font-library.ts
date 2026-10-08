import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Brand } from "../types";
import { BRAND_DIR, ROOT, readJson } from "./fsutil";

const LIBRARY_DIR = path.join(ROOT, "app", "public", "fonts", "library");
export const fontLibrary = () => readJson<Brand["fonts"]["files"]>(path.join(LIBRARY_DIR, "catalog.json"), []);

/** Materializa las fuentes elegidas para que las marcas guardadas y proyectos sean portables. */
export const withLibraryFonts = (brand: Brand): Brand => {
  const files = [...(brand.fonts.files ?? [])];
  for (const family of new Set([brand.fonts.heading, brand.fonts.body, brand.fonts.subtitleAccent])) {
    if (!family) continue;
    if (files.some((f) => f.family === family)) continue;
    for (const entry of fontLibrary().filter((f) => f.family === family)) {
      const file = `library-${entry.file}`;
      fs.mkdirSync(path.join(BRAND_DIR, "fonts"), { recursive: true });
      fs.copyFileSync(path.join(LIBRARY_DIR, entry.file), path.join(BRAND_DIR, "fonts", file));
      const license = `${family.toLowerCase().replaceAll(" ", "")}-OFL.txt`;
      fs.copyFileSync(path.join(LIBRARY_DIR, license), path.join(BRAND_DIR, "fonts", license));
      files.push({ ...entry, file });
    }
  }
  return { ...brand, fonts: { ...brand.fonts, files } };
};
