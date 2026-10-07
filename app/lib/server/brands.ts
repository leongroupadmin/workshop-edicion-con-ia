import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Brand } from "../types";
import { BRAND_DIR, ROOT, projectDir, moveToTrash, readJson, safeFilename, writeJson } from "./fsutil";
import { readBrand } from "./brand";

/** Marcas guardadas: cada una con su brand.json, sus tipografías y su logo. */
export const BRANDS_DIR = path.join(ROOT, "assets", "brands");

export type SavedBrand = Brand & { slug: string };

const slugify = (name: string) =>
  safeFilename(name.trim().toLowerCase().replace(/\s+/g, "-")).replace(/\.+/g, "-").slice(0, 60) || "marca";

const dirOf = (slug: string) => {
  const full = path.join(BRANDS_DIR, path.basename(slug));
  if (!full.startsWith(BRANDS_DIR + path.sep)) throw new Error("ruta inválida");
  return full;
};

export const listBrands = (): SavedBrand[] => {
  if (!fs.existsSync(BRANDS_DIR)) return [];
  return fs
    .readdirSync(BRANDS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(BRANDS_DIR, d.name, "brand.json")))
    .map((d) => ({ slug: d.name, ...readJson<Brand>(path.join(BRANDS_DIR, d.name, "brand.json"), {} as Brand) }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
};

/** Copia brand.json + las tipografías que usa + el logo. Nada más de la carpeta. */
const copyBrand = (brand: Brand, from: string, to: string) => {
  fs.mkdirSync(path.join(to, "fonts"), { recursive: true });
  writeJson(path.join(to, "brand.json"), brand);
  for (const f of brand.fonts.files ?? []) {
    const src = path.join(from, "fonts", f.file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(to, "fonts", f.file));
  }
  if (brand.logo) {
    const src = path.join(from, brand.logo);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(to, brand.logo));
  }
};

/** Guarda la marca que está en uso como una marca más de la biblioteca. */
export const saveCurrentBrand = (name?: string): SavedBrand => {
  const brand = readBrand();
  const final = { ...brand, name: (name?.trim() || brand.name || "Mi marca").slice(0, 60) };
  const slug = slugify(final.name);
  copyBrand(final, BRAND_DIR, dirOf(slug));
  return { slug, ...final };
};

/** Pone una marca guardada como la marca en uso (la que usan todos los videos). */
export const activarBrand = (slug: string): Brand => {
  const from = dirOf(slug);
  const brand = readJson<Brand | null>(path.join(from, "brand.json"), null);
  if (!brand) throw new Error("Esa marca ya no está.");
  copyBrand(brand, from, BRAND_DIR);
  return brand;
};

export const deleteBrand = async (slug: string) => {
  const dir = dirOf(slug);
  if (!fs.existsSync(dir)) return;
  await moveToTrash([dir]);
};

/** Congela la marca elegida y sus archivos dentro del proyecto. */
export const snapshotProjectBrand = (id: string, slug: string) => {
  const saved = listBrands().find((brand) => brand.slug === slug);
  if (!saved) throw new Error("La marca seleccionada ya no existe. Elegí otra marca.");
  const { slug: savedSlug, ...brand } = saved;
  copyBrand(brand, dirOf(savedSlug), path.join(projectDir(id), "brand"));
  return brand;
};
