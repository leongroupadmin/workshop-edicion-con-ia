import "server-only";
import type { ChatEntry, ProjectState, ServerEvent } from "../types";

type Listener = (e: ServerEvent) => void;

type Running = {
  kind: "agent" | "job";
  label: string;
  abort?: () => void;
};

/**
 * Estado en memoria del servidor (sobrevive a recargas de módulos en dev
 * porque cuelga de globalThis): suscriptores SSE por proyecto, el proceso
 * que está corriendo y la respuesta de Claude en curso.
 */
type Store = {
  listeners: Map<string, Set<Listener>>;
  running: Map<string, Running>;
  live: Map<string, ChatEntry>;
};

const g = globalThis as unknown as { __editorStore?: Store };
export const store: Store =
  g.__editorStore ??
  (g.__editorStore = { listeners: new Map(), running: new Map(), live: new Map() });

export const subscribe = (id: string, fn: Listener) => {
  if (!store.listeners.has(id)) store.listeners.set(id, new Set());
  store.listeners.get(id)!.add(fn);
  return () => store.listeners.get(id)?.delete(fn);
};

export const emit = (id: string, e: ServerEvent) => {
  for (const fn of store.listeners.get(id) ?? []) {
    try {
      fn(e);
    } catch {
      /* listener cerrado */
    }
  }
};

export const getRunning = (id: string): ProjectState["running"] => {
  const r = store.running.get(id);
  return r ? { kind: r.kind, label: r.label } : null;
};

export const setRunning = (id: string, r: Running | null) => {
  if (r) store.running.set(id, r);
  else store.running.delete(id);
  emit(id, { type: "running", running: getRunning(id) });
};
