"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatEntry, ProjectState, ServerEvent } from "./types";

export const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Error ${res.status}`);
  return data as T;
};

/** Subida binaria con progreso (fetch no da progreso de subida). */
export const uploadFile = (
  url: string,
  file: File,
  onProgress: (p: number) => void,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* sin JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error((data.error as string) || `Error ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Se cortó la conexión con el panel."));
    xhr.send(file);
  });

/**
 * Estado del proyecto + eventos en vivo (SSE): estado del pipeline,
 * respuesta de Claude en streaming y refrescos.
 */
export const useProject = (id: string) => {
  const [state, setState] = useState<ProjectState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<ChatEntry | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api<ProjectState>(`/api/projects/${id}`);
      setState(s);
      setLive(s.liveEntry);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refresh, 250);
  }, [refresh]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void refresh();
    const es = new EventSource(`/api/projects/${id}/events`);
    es.onmessage = (msg) => {
      const e = JSON.parse(msg.data) as ServerEvent | { type: "ping" };
      switch (e.type) {
        case "status":
          setState((s) => (s ? { ...s, status: e.status } : s));
          if (["done", "awaiting_approval", "error", "planning"].includes(e.status.step)) scheduleRefresh();
          break;
        case "running":
          setState((s) => (s ? { ...s, running: e.running } : s));
          break;
        case "chat":
          if (e.entry.role === "assistant" && !e.entry.text && !e.entry.error) setLive(e.entry);
          else {
            setLive((l) => (l && l.id === e.entry.id ? null : l));
            setState((s) =>
              s && !s.chat.some((c) => c.id === e.entry.id) ? { ...s, chat: [...s.chat, e.entry] } : s,
            );
          }
          break;
        case "delta":
          setLive((l) => (l && l.id === e.entryId ? { ...l, text: l.text + e.text } : l));
          break;
        case "tool":
          setLive((l) => (l && l.id === e.entryId ? { ...l, tools: [...(l.tools ?? []), e.tool] } : l));
          break;
        case "refresh":
          scheduleRefresh();
          break;
      }
    };
    return () => es.close();
  }, [id, refresh, scheduleRefresh]);

  return { state, error, live, refresh };
};

export const fmtTime = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export const fmtSize = (b: number) =>
  b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`;

/** "el video original, el corte, … y las 3 versiones renderizadas" (texto al eliminar un proyecto). */
export const projectContentsText = (versions: number) => {
  const parts = ["el video original", "el corte", "el plan", "las escenas", "el chat"];
  if (versions) parts.push(versions === 1 ? "la versión renderizada" : `las ${versions} versiones renderizadas`);
  return `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;
};
