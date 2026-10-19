"use client";

import { CUT_LABELS, GRAPHICS_LABELS, LAYOUT_USE_LABELS, PACE_LABELS, SPLIT_SHARES } from "@/lib/defaults";
import type { EditStyle, Format } from "@/lib/types";
import { LayoutIcon, Row, Seg } from "./ui";

const options = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));

export const Hint = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] text-neutral-500 leading-snug">{children}</p>
);

const Group = ({ title, when, children }: { title: string; when: string; children: React.ReactNode }) => (
  <div className="rounded-lg border border-line bg-black/20 p-3 flex flex-col gap-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-[13px] font-semibold text-neutral-100">{title}</h3>
      <span className="text-[11px] text-neutral-500">{when}</span>
    </div>
    {children}
  </div>
);

/** Con estos tres, el armado se puede dejar fijo todo el video. */
const FIXABLE = new Set<EditStyle["layoutUse"]>(["split", "pip", "frame"]);

const FIXED_HINT: Partial<Record<EditStyle["layoutUse"], string>> = {
  split: "La pantalla queda dividida de principio a fin: tu cara nunca vuelve a ocupar todo.",
  pip: "Quedás en el recuadro de la esquina todo el video.",
  frame: "Tu video queda enmarcado todo el tiempo.",
};

const Switch = ({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    onClick={() => onChange(!on)}
    className="flex items-center gap-2 self-start text-[13px] text-neutral-200"
  >
    <span
      className={`relative h-5 w-9 shrink-0 rounded-full border transition ${
        on ? "border-accent bg-accent" : "border-line bg-black/40"
      }`}
    >
      <span
        className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`}
      />
    </span>
    {label}
  </button>
);

const LAYOUT_USE_HINT: Record<EditStyle["layoutUse"], string> = {
  auto: "Claude mezcla los tres según el contenido. En el plan lo podés cambiar gráfico por gráfico.",
  mixed: "Los gráficos rotan entre las cinco formas, sin repetir dos iguales seguidas: pantalla completa, encima del video, pantalla dividida, vos en una esquina y video enmarcado.",
  overlay: "Todos los gráficos van encima del video, sin tapar tu cara.",
  split: "Todos los gráficos van en pantalla dividida: el gráfico y tu cara a la vez.",
  fullscreen: "Cada gráfico tapa la pantalla unos segundos, como un b-roll, y después volvés a aparecer. Tu voz sigue.",
  pip: "El gráfico ocupa toda la pantalla y vos quedás chiquito en un recuadro arriba a la izquierda.",
  frame: "Tu video queda enmarcado en una tarjeta, con el título arriba y tu marca abajo.",
};

export const PACE_HINT: Record<EditStyle["pace"], string> = {
  calm: "Pocos elementos: uno cada 6-10 segundos.",
  normal: "Un elemento cada 4-8 segundos.",
  dynamic: "Muchos elementos: uno cada 2-4 segundos, más zooms y sonidos.",
};

const GRAPHICS_HINT: Record<EditStyle["graphics"], string> = {
  minimal: "Limpio, con mucho aire y animaciones suaves.",
  bold: "Letras grandes, mucho contraste y animaciones con energía.",
  corporate: "Prolijo y sobrio: tarjetas, íconos y movimientos suaves.",
};

const CUT_HINT: Record<EditStyle["cut"], string> = {
  soft: "Solo saca pausas largas (más de 0.9 s). Deja las muletillas.",
  normal: "Saca pausas de más de medio segundo, muletillas y tomas repetidas.",
  aggressive: "Saca casi todas las pausas (más de 0.3 s). Ritmo muy rápido.",
};

const fmtS = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });

/**
 * Cuántos gráficos va a tener el video. Se reparten parejos: duración / cantidad.
 * Con `durationMs` (video ya cortado) dice cada cuántos segundos va uno.
 */
export const GraphicsCountField = ({
  value,
  onChange,
  durationMs,
}: {
  value: number;
  onChange: (n: number) => void;
  durationMs?: number;
}) => {
  const fixed = value > 0;
  const secs = durationMs ? durationMs / 1000 : null;
  const every = fixed && secs ? secs / value : null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Seg
          value={fixed ? "fixed" : "auto"}
          onChange={(v) => onChange(v === "auto" ? 0 : value || 3)}
          options={[
            { value: "auto", label: "Automática" },
            { value: "fixed", label: "Elegir cantidad" },
          ]}
        />
        {fixed ? (
          <div className="inline-flex items-center rounded-lg border border-line bg-black/30">
            <button
              type="button"
              aria-label="Menos gráficos"
              disabled={value <= 1}
              onClick={() => onChange(value - 1)}
              className="px-3 py-1.5 text-[15px] text-neutral-300 hover:text-white disabled:opacity-30"
            >
              −
            </button>
            <span className="w-8 text-center text-[14px] font-semibold tabular-nums">{value}</span>
            <button
              type="button"
              aria-label="Más gráficos"
              disabled={value >= 30}
              onClick={() => onChange(value + 1)}
              className="px-3 py-1.5 text-[15px] text-neutral-300 hover:text-white disabled:opacity-30"
            >
              +
            </button>
          </div>
        ) : null}
      </div>
      <Hint>
        {!fixed
          ? "Claude decide cuántos según el ritmo."
          : every
            ? `Tu video dura ${fmtS(secs!)} s: va 1 gráfico cada ${fmtS(every)} s.`
            : `Se reparten parejos en todo el video: con ${value} en un video de 60 s va 1 cada ${fmtS(60 / value)} s; en uno de 10 s, 1 cada ${fmtS(10 / value)} s.`}
        {every !== null && every < 2 ? " Ojo: quedan muy seguidos (menos de 2 s entre uno y otro)." : ""}
      </Hint>
    </div>
  );
};

/**
 * Opciones de estilo de edición (controladas). Se usan al subir un video
 * (antes de que arranque la edición) y dentro del proyecto (para ajustar).
 */
export const StyleFields = ({
  value: st,
  onChange,
  format,
  graphicsWhen,
  videoWhen,
  notes = {},
  showPace = true,
  stacked = false,
}: {
  value: EditStyle;
  onChange: (style: EditStyle) => void;
  format: Format;
  graphicsWhen: string;
  videoWhen: string;
  /** Aclaraciones extra por opción (p.ej. "cambia también el plan"). */
  notes?: Partial<Record<"layoutUse" | "cut", string>>;
  /** Ritmo y cantidad de gráficos cambian el plan entero: dentro del proyecto viven en el plan. */
  showPace?: boolean;
  /** Una sola columna (para paneles angostos). */
  stacked?: boolean;
}) => {
  const set = (patch: Partial<EditStyle>) => onChange({ ...st, ...patch });
  const horizontal = format === "horizontal";
  const splitText = `Gráfico ${
    horizontal ? (st.split.position === "top" ? "a la izquierda" : "a la derecha") : st.split.position === "top" ? "arriba" : "abajo"
  }, ocupa el ${Math.round(st.split.share * 100)}% de la pantalla.`;

  return (
    <div className={`grid grid-cols-1 gap-3 ${stacked ? "" : "lg:grid-cols-2"}`}>
      <Group title="Gráficos" when={graphicsWhen}>
        <Row label="Cómo se ven los gráficos">
          <Seg value={st.layoutUse} onChange={(layoutUse) => set({ layoutUse })} options={options(LAYOUT_USE_LABELS)} cols={4} />
          <Hint>
            {LAYOUT_USE_HINT[st.layoutUse]}
            {notes.layoutUse ? ` ${notes.layoutUse}` : ""}
          </Hint>
          {FIXABLE.has(st.layoutUse) ? (
            <>
              <Switch on={!!st.fixedLayout} onChange={(fixedLayout) => set({ fixedLayout })} label="Fijo" />
              <Hint>
                {st.fixedLayout
                  ? `${FIXED_HINT[st.layoutUse]} Entre gráfico y gráfico se ve un fondo con tu marca; las transiciones y los zooms siguen.`
                  : "Activalo para que este armado quede todo el video, sin volver a tu cara en pantalla completa entre gráficos."}
              </Hint>
            </>
          ) : null}
        </Row>

        {st.layoutUse === "auto" || st.layoutUse === "split" ? (
          <Row label="Cómo se ve la pantalla dividida">
            <div className="flex flex-wrap gap-1.5">
              {(["top", "bottom"] as const).flatMap((position) =>
                SPLIT_SHARES.map((o) => {
                  const on = st.split.position === position && st.split.share === o.value;
                  return (
                    <button
                      key={`${position}-${o.value}`}
                      type="button"
                      onClick={() => set({ split: { position, share: o.value } })}
                      title={o.label}
                      className={`flex flex-col items-center gap-1 rounded-md border px-2 py-1.5 transition ${
                        on ? "border-accent bg-accent-soft text-white" : "border-line text-neutral-500 hover:text-white hover:border-neutral-500"
                      }`}
                    >
                      <LayoutIcon
                        layout="split"
                        split={{ position, share: o.value }}
                        horizontal={horizontal}
                        className={horizontal ? "w-10 h-6" : "w-6 h-10"}
                      />
                      <span className="text-[10px] tabular-nums">{Math.round(o.value * 100)}% gráfico</span>
                    </button>
                  );
                }),
              )}
            </div>
            <Hint>{splitText}</Hint>
          </Row>
        ) : null}

        <Row label="Estilo de los gráficos">
          <Seg value={st.graphics} onChange={(graphics) => set({ graphics })} options={options(GRAPHICS_LABELS)} />
          <Hint>{GRAPHICS_HINT[st.graphics]}</Hint>
        </Row>

        {showPace ? (
          <Row label="Cantidad de gráficos">
            <GraphicsCountField value={st.graphicsCount} onChange={(graphicsCount) => set({ graphicsCount })} />
          </Row>
        ) : null}

        {showPace ? (
          <Row label="Ritmo">
            <Seg value={st.pace} onChange={(pace) => set({ pace })} options={options(PACE_LABELS)} />
            <Hint>{PACE_HINT[st.pace]}</Hint>
          </Row>
        ) : null}
      </Group>

      <Group title="Video" when={videoWhen}>
        <Row label="Cortes">
          <Seg value={st.cut} onChange={(cut) => set({ cut })} options={options(CUT_LABELS)} />
          <Hint>
            {CUT_HINT[st.cut]}
            {notes.cut ? ` ${notes.cut}` : ""}
          </Hint>
        </Row>

        <Row label="Zoom en cada corte">
          <Seg
            value={st.autoZoom ? "on" : "off"}
            onChange={(v) => set({ autoZoom: v === "on" })}
            options={[
              { value: "on", label: "Sí" },
              { value: "off", label: "No" },
            ]}
          />
          <Hint>El video se acerca y se aleja en cada corte, como en los reels con ritmo.</Hint>
        </Row>
      </Group>
    </div>
  );
};
