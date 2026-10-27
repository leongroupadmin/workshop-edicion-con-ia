"use client";

import type { Settings } from "@/lib/types";
import { Row, Seg } from "./ui";

export const CaptionTypographyFields = ({ value, onChange }: {
  value: Settings["subtitles"];
  onChange: (patch: Partial<Settings["subtitles"]>) => void;
}) => <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-[12px] text-fg-2">
              <input type="checkbox" checked={value.mixFonts ?? false} onChange={(e) => onChange({ mixFonts: e.target.checked, ...(e.target.checked ? { accentFont: "brand" as const } : {}) })} />
              Combinar tipografías
            </label>
            {value.mixFonts ? (
              <>
                <Row label="Tipografía principal">
                  <Seg value={value.primaryFont ?? "heading"} onChange={(primaryFont) => onChange({ primaryFont })}
                    options={[{ value: "heading", label: "Títulos de marca" }, { value: "body", label: "Texto de marca" }]} />
                </Row>
                <Row label="Palabras clave">
                  <Seg value={value.accentFont ?? "brand"} onChange={(accentFont) => onChange({ accentFont })}
                    cols={2} options={[{ value: "brand", label: "Combinación de marca" }, { value: "lora", label: "Lora cursiva" }, { value: "heading", label: "Títulos de marca" }, { value: "body", label: "Texto de marca" }]} />
                </Row>
                <style>{`@font-face { font-family: 'Clipo Lora'; src: url('/fonts/Lora-Italic.ttf') format('truetype'); font-style: italic; font-weight: 400 700; font-display: swap; }`}</style>
                {(value.accentFont ?? "brand") === "lora" ? (
                  <div className="rounded-lg bg-panel-2 p-4 text-center" aria-label="Muestra de Lora cursiva">
                    <p className="text-2xl font-bold">Tu próxima <span style={{ fontFamily: '"Clipo Lora", Georgia, serif', fontStyle: "italic", fontWeight: 600 }} className="text-amber-700">gran idea</span></p>
                    <p className="mt-2 text-[11px] text-muted">Muestra de la cursiva. El video usa las fuentes y colores de tu marca.</p>
                  </div>
                ) : null}
                <p className="text-[11px] text-muted">“Combinación de marca” usa la fuente de énfasis que elegiste en Marca. La segunda fuente se aplica a las palabras clave del plan. Si no hay palabras clave, se usa la principal.</p>
              </>
            ) : null}
</div>;
