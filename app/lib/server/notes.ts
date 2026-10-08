import "server-only";
import path from "node:path";
import { ROOT, readJson, writeJson } from "./fsutil";

/** Recomendaciones: anotaciones sueltas que el usuario va guardando desde el panel. */
export type Note = { id: string; text: string; createdAt: string };

export const NOTES_FILE = path.join(ROOT, "assets", "recomendaciones.json");

const MAX_LEN = 2000;

export const readNotes = (): Note[] => {
  const raw = readJson<{ notes?: Note[] } | Note[]>(NOTES_FILE, { notes: [] });
  const list = Array.isArray(raw) ? raw : (raw.notes ?? []);
  return list.filter((n) => n && typeof n.text === "string");
};

const save = (notes: Note[]) => {
  writeJson(NOTES_FILE, { notes });
  return notes;
};

export const addNote = (text: string): Note[] => {
  const limpio = text.trim().slice(0, MAX_LEN);
  if (!limpio) throw new Error("La anotación está vacía.");
  const note: Note = {
    id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text: limpio,
    createdAt: new Date().toISOString(),
  };
  // La última arriba: es la que acaba de escribir.
  return save([note, ...readNotes()]);
};

export const editNote = (id: string, text: string): Note[] => {
  const limpio = text.trim().slice(0, MAX_LEN);
  if (!limpio) throw new Error("La anotación está vacía.");
  return save(readNotes().map((n) => (n.id === id ? { ...n, text: limpio } : n)));
};

export const deleteNote = (id: string): Note[] => save(readNotes().filter((n) => n.id !== id));
