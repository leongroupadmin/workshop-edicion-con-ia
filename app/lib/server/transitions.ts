import "server-only";
import path from "node:path";
import { TRANSITIONS } from "../transitions";
import { ROOT, readJson, writeJson } from "./fsutil";

/** Las transiciones que el usuario apagó en la pestaña "Transiciones" (vale para todos los videos). */
export const TRANSITIONS_FILE = path.join(ROOT, "assets", "transitions.json");

const IDS = new Set(TRANSITIONS.map((t) => t.id));

export const readTransitionsOff = (): string[] =>
  (readJson<{ off?: unknown }>(TRANSITIONS_FILE, {}).off as string[] | undefined)?.filter((id) => IDS.has(id)) ?? [];

export const writeTransitionsOff = (off: string[]) =>
  writeJson(TRANSITIONS_FILE, { off: TRANSITIONS.map((t) => t.id).filter((id) => off.includes(id)) });

/** La regla para la IA (vacía si están todas prendidas). */
export const transitionsRule = () => {
  const off = readTransitionsOff();
  if (!off.length) return "";
  const on = TRANSITIONS.filter((t) => !off.includes(t.id)).map((t) => t.id);
  return on.length
    ? `TRANSICIONES: el usuario apagó ${off.join(", ")} en la pestaña "Transiciones". En los ítems type "transition" usá SOLO: ${on.join(", ")}. Una apagada va solo si el usuario la pide con su nombre en el chat.`
    : `TRANSICIONES: el usuario apagó todas en la pestaña "Transiciones". No pongas ítems type "transition" (los cortes van directos), salvo que el usuario pida una con su nombre en el chat.`;
};
