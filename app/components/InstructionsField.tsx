"use client";

import { Row } from "./ui";

const EJEMPLOS = [
  "No pongas gráficos sobre mi cara",
  "Usá siempre inglés en los títulos",
  "Nombrá la marca en el primer gráfico",
];

/**
 * Indicaciones libres para Claude (opcional). Van al pedido del plan y al
 * BRIEF de cada escena, así que valen tanto para QUÉ se muestra como para
 * CÓMO se diseña.
 */
export const InstructionsField = ({
  value,
  onChange,
  nota,
}: {
  value: string;
  onChange: (v: string) => void;
  nota?: string;
}) => (
  <Row label="Indicaciones para Claude (opcional)">
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      maxLength={2000}
      placeholder={`Ej: ${EJEMPLOS.join(" · ")}`}
      className="w-full resize-y rounded-lg border border-line bg-panel-2 px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-faint"
    />
    <p className="text-[11px] text-muted">
      Lo que escribas acá lo tiene en cuenta al armar el plan y al diseñar cada gráfico. Dejalo vacío si no hace falta.
      {nota ? ` ${nota}` : ""}
      {value.length > 1800 ? ` Quedan ${2000 - value.length} caracteres.` : ""}
    </p>
  </Row>
);
