"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { LAYOUT_USE_LABELS } from "@/lib/defaults";
import type { ProjectState, Settings } from "@/lib/types";
import { InstructionsField } from "./InstructionsField";
import { StyleFields } from "./StyleFields";
import { Button, Panel, Row, Seg } from "./ui";

type Saved = { layouts?: { changed: number } };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-3">
    <h3 className="text-[13px] font-semibold text-neutral-100">{title}</h3>
    {children}
  </div>
);

/**
 * Todos los parámetros del video en un solo lugar. Cada cambio se guarda solo;
 * el video se actualiza con el botón Renderizar / Re-renderizar de arriba.
 */
export const ProjectConfig = ({ id, state }: { id: string; state: ProjectState }) => {
  const savedKey = JSON.stringify(state.settings);
  const [s, setS] = useState<Settings>(state.settings);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [tracks, setTracks] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  // Seguir lo guardado (p.ej. si Claude cambió algo), salvo mientras hay un guardado pendiente
  useEffect(() => {
    if (!dirty.current) setS(JSON.parse(savedKey));
  }, [savedKey]);

  useEffect(() => {
    api<{ tracks: string[] }>("/api/music").then((r) => setTracks(r.tracks)).catch(() => {});
  }, []);

  const save = async (next: Settings, prev: Settings) => {
    setSaving("saving");
    try {
      const { format, subtitles, music, sfx, style } = next;
      const r = await api<Saved>(`/api/projects/${id}/settings`, {
        method: "POST",
        body: JSON.stringify({ settings: { format, subtitles, music, sfx, style } }),
      });
      dirty.current = false;
      setSaving("saved");
      const changed = r.layouts?.changed ?? 0;
      if (changed) {
        setMsg({
          text: `Cambié ${changed === 1 ? "1 gráfico" : `${changed} gráficos`} del plan a ${LAYOUT_USE_LABELS[
            next.style.layoutUse
          ].toLowerCase()}.`,
        });
      } else if (next.style.layoutUse !== prev.style.layoutUse) setMsg(null);
    } catch (e) {
      dirty.current = false;
      setSaving("error");
      setMsg({ text: (e as Error).message, error: true });
    }
  };

  /** Cambia y guarda (los deslizadores esperan a que sueltes). */
  const update = (patch: Partial<Settings>, wait = 0) => {
    const prev = s;
    const next = { ...s, ...patch };
    setS(next);
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next, prev), wait);
  };
  const sub = (patch: Partial<Settings["subtitles"]>, wait = 0) => update({ subtitles: { ...s.subtitles, ...patch } }, wait);
  const music = (patch: Partial<Settings["music"]>, wait = 0) => update({ music: { ...s.music, ...patch } }, wait);
  const sfx = (patch: Partial<Settings["sfx"]>, wait = 0) => update({ sfx: { ...s.sfx, ...patch } }, wait);

  const saveDefaults = async () => {
    try {
      await api("/api/defaults", { method: "POST", body: JSON.stringify({ fromProject: id }) });
      setMsg({ text: "Guardado: los videos nuevos van a arrancar con esta configuración." });
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true });
    }
  };

  return (
    <Panel
      title="Configuración"
      right={
        <span className={`text-[11px] ${saving === "error" ? "text-red-300" : "text-neutral-500"}`}>
          {saving === "saving" ? "Guardando…" : saving === "error" ? "No se pudo guardar" : "Se guarda solo"}
        </span>
      }
      bodyClassName="p-4 flex flex-col gap-5"
    >
      <Section title="Formato">
        <Seg
          value={s.format}
          onChange={(format) => update({ format })}
          options={[
            { value: "vertical", label: "Vertical 9:16" },
            { value: "horizontal", label: "Horizontal 16:9" },
            { value: "square", label: "Cuadrado 1:1" },
          ]}
        />
      </Section>

      <Section title="Subtítulos">
        <Seg
          value={s.subtitles.style}
          onChange={(style) => sub({ style })}
          options={[
            { value: "karaoke", label: "Karaoke" },
            { value: "simple", label: "Simples" },
            { value: "none", label: "Sin subtítulos" },
          ]}
        />
        {s.subtitles.style !== "none" ? (
          <>
            <Row label={`Tamaño · ${s.subtitles.size}px`}>
              <input
                type="range"
                min={40}
                max={120}
                step={2}
                value={s.subtitles.size}
                onChange={(e) => sub({ size: Number(e.target.value) }, 600)}
              />
            </Row>
            <Row label="Posición">
              <Seg
                value={s.subtitles.position}
                onChange={(position) => sub({ position })}
                options={[
                  { value: "top", label: "Arriba" },
                  { value: "middle", label: "Medio" },
                  { value: "bottom", label: "Abajo" },
                ]}
              />
            </Row>
            <div className="flex flex-wrap items-end gap-4">
              <Row label="Palabras en pantalla">
                <Seg
                  value={String(s.subtitles.maxWords) as "1" | "2" | "3" | "4"}
                  onChange={(v) => sub({ maxWords: Number(v) })}
                  options={(["1", "2", "3", "4"] as const).map((v) => ({ value: v, label: v }))}
                />
              </Row>
              <label className="flex items-center gap-2 text-[12px] text-neutral-300 pb-2">
                <input type="checkbox" checked={s.subtitles.uppercase} onChange={(e) => sub({ uppercase: e.target.checked })} />
                MAYÚSCULAS
              </label>
            </div>
          </>
        ) : null}
      </Section>

      <Section title="Música de fondo">
        <div className="flex items-center gap-3">
          <Seg
            value={s.music.enabled ? "on" : "off"}
            onChange={(v) => music({ enabled: v === "on" })}
            options={[
              { value: "on", label: "Con música" },
              { value: "off", label: "Sin música" },
            ]}
          />
          {s.music.enabled ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.music.volume}
                onChange={(e) => music({ volume: Number(e.target.value) }, 600)}
                className="flex-1"
              />
              <span className="text-[12px] text-neutral-400 w-9 text-right">{Math.round(s.music.volume * 100)}%</span>
            </div>
          ) : null}
        </div>
        {s.music.enabled ? (
          tracks.length ? (
            <select
              value={s.music.track}
              onChange={(e) => music({ track: e.target.value })}
              className="bg-panel-2 border border-line rounded-md px-2 py-1.5 text-[12px]"
            >
              <option value="">Automática: Claude elige según el video</option>
              {tracks.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-[12px] text-neutral-500">
              Todavía no hay música. Buscala en{" "}
              <a className="text-accent underline" href="/marca">
                Marca y música
              </a>{" "}
              (más de 10.000 temas) o dejá que Claude elija una al armar el plan.
            </p>
          )
        ) : null}
        <p className="text-[11px] text-neutral-500">
          La música baja sola cuando hablás.{" "}
          <a className="text-accent underline" href="/marca">
            Buscar más música
          </a>
        </p>
      </Section>

      <Section title="Efectos de sonido">
        <div className="flex items-center gap-3">
          <Seg
            value={s.sfx.enabled ? "on" : "off"}
            onChange={(v) => sfx({ enabled: v === "on" })}
            options={[
              { value: "on", label: "Con efectos" },
              { value: "off", label: "Sin efectos" },
            ]}
          />
          {s.sfx.enabled ? (
            <div className="flex-1 flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.sfx.volume}
                onChange={(e) => sfx({ volume: Number(e.target.value) }, 600)}
                className="flex-1"
              />
              <span className="text-[12px] text-neutral-400 w-9 text-right">{Math.round(s.sfx.volume * 100)}%</span>
            </div>
          ) : null}
        </div>
        <p className="text-[11px] text-neutral-500">
          Whoosh, pop, golpes, clicks… los elige Claude en el plan. Podés escucharlos o subir los tuyos en{" "}
          <a className="text-accent underline" href="/marca">
            Marca y música
          </a>
          .
        </p>
      </Section>

      <StyleFields
        value={s.style}
        onChange={(style) => update({ style })}
        format={s.format}
        graphicsWhen="Claude los genera al renderizar"
        videoWhen="Se aplica al renderizar"
        showPace={false}
        stacked
        notes={{
          layoutUse: s.style.layoutUse !== "auto" && state.plan ? "Cambia también el plan de este video." : undefined,
          cut: state.plan ? "Al renderizar se vuelve a cortar y los tiempos del plan se acomodan solos." : undefined,
        }}
      />

      <InstructionsField
        value={s.instructions}
        onChange={(instructions) => update({ instructions }, 800)}
        nota={state.plan ? "Si ya hay un plan, pedile por el chat que lo rehaga para que las aplique." : undefined}
      />

      {msg ? <p className={`text-[12px] ${msg.error ? "text-red-300" : "text-neutral-300"}`}>{msg.text}</p> : null}

      <div className="flex justify-end">
        <Button variant="ghost" onClick={saveDefaults}>
          Usar esta configuración en los videos nuevos
        </Button>
      </div>
    </Panel>
  );
};
