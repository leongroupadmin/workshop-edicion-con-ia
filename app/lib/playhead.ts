"use client";

import { useSyncExternalStore } from "react";

/**
 * Dónde va el video del Preview, para que la línea de tiempo del plan muestre
 * el marcador en el mismo segundo. El Preview escribe; el plan lee y, al tocar
 * la regla, le pide al video que salte.
 */
type Playhead = { id: string; ms: number } | null;

let current: Playhead = null;
let seeker: ((ms: number) => void) | null = null;
const listeners = new Set<() => void>();

export const setPlayhead = (next: Playhead) => {
  if (next?.id === current?.id && next?.ms === current?.ms) return;
  current = next;
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Milisegundo del video de este proyecto, o null si no hay video cargado. */
export const usePlayhead = (id: string) =>
  useSyncExternalStore(
    subscribe,
    () => (current?.id === id ? current.ms : null),
    () => null,
  );

export const setSeeker = (fn: ((ms: number) => void) | null) => {
  seeker = fn;
};

export const seekTo = (ms: number) => seeker?.(ms);
