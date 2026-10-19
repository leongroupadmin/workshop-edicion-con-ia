"use client";

import { EDITING_PRESETS } from "@/lib/defaults";
import type { EditStyle } from "@/lib/types";

/** Mismo estilo campo por campo (el orden de las claves y los opcionales sin poner no cuentan). */
const sameStyle = (a: EditStyle, b: EditStyle) =>
  a.pace === b.pace &&
  a.graphicsCount === b.graphicsCount &&
  a.graphics === b.graphics &&
  !!a.noGraphics === !!b.noGraphics &&
  a.layoutUse === b.layoutUse &&
  !!a.fixedLayout === !!b.fixedLayout &&
  a.cut === b.cut &&
  a.autoZoom === b.autoZoom &&
  a.split.position === b.split.position &&
  a.split.share === b.split.share;

export const EditingPresets = ({ value, onChange }: { value: EditStyle; onChange: (style: EditStyle) => void }) => (
  <div className="flex flex-col gap-2">
    <div>
      <p className="text-[13px] font-semibold text-neutral-100">Preset de estilo de edición</p>
      <p className="text-[11px] text-neutral-500">
        Cambia el ritmo y el tratamiento visual; los gráficos se adaptan automáticamente a los colores, logo y tipografías de la marca.
      </p>
    </div>
    <div className="grid grid-cols-2 gap-2">
      {Object.entries(EDITING_PRESETS).map(([key, preset]) => {
        const selected = sameStyle(value, preset.style);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange({ ...preset.style })}
            className={`rounded-lg border px-3 py-2 text-left transition ${selected ? "border-accent bg-accent-soft/20" : "border-line bg-black/20 hover:border-accent/60 hover:bg-accent-soft/20"}`}
          >
            <span className="block text-[12px] font-semibold text-neutral-100">{preset.label}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">{preset.description}</span>
          </button>
        );
      })}
    </div>
  </div>
);
