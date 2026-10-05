import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { ProjectImage } from "../types";
import { moveToTrash, readJson, writeJson } from "./fsutil";
import { paths } from "./projects";

export const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".svg"];

/**
 * Imágenes que subió el usuario para este video. La lista sale de los archivos
 * que hay en disco; images.json solo guarda la descripción de cada una.
 */
export const listImages = (id: string): ProjectImage[] => {
  const p = paths(id);
  if (!fs.existsSync(p.images)) return [];
  const notes = readJson<ProjectImage[]>(p.imagesMeta, []);
  return fs
    .readdirSync(p.images)
    .filter((f) => IMAGE_EXTS.includes(path.extname(f).toLowerCase()))
    .sort()
    .map((file) => ({ file, note: notes.find((n) => n.file === file)?.note || "" }));
};

export const setImageNote = (id: string, file: string, note: string) => {
  const p = paths(id);
  const rest = readJson<ProjectImage[]>(p.imagesMeta, []).filter((n) => n.file !== file);
  writeJson(p.imagesMeta, note.trim() ? [...rest, { file, note: note.trim() }] : rest);
};

/** Manda la imagen a la Papelera y le saca la descripción. */
export const removeImage = async (id: string, file: string) => {
  const p = paths(id);
  const full = path.join(p.images, path.basename(file));
  if (!full.startsWith(p.images + path.sep)) throw new Error("ruta inválida");
  await moveToTrash([full]);
  setImageNote(id, path.basename(file), "");
};

/**
 * Bloque para el prompt del plan: qué imágenes hay y para qué sirven, para que
 * Claude las reparta entre los gráficos (campo `images` de cada ítem).
 */
export const imagesPromptBlock = (id: string): string => {
  const imgs = listImages(id);
  if (!imgs.length) return "";
  return (
    `\n\nEl usuario subió estas imágenes en projects/${id}/images (usalas: repartilas ` +
    `entre los gráficos que mejor peguen con lo que se dice en ese momento, y poné ` +
    `los nombres de archivo en el campo "images" del ítem; una imagen puede ir en un ` +
    `solo ítem):\n` +
    imgs.map((i) => `- ${i.file}${i.note ? ` — ${i.note}` : ""}`).join("\n")
  );
};
