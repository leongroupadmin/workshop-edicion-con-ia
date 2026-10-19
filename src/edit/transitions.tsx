import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { PlanItem } from "../pipeline/types";

/**
 * Transiciones del montaje (ítems `type: "transition"` del plan, centrados en
 * un corte). Hay dos familias:
 * - Las que se dibujan ENCIMA (flash, fade, wipe/slide, glitch, lightleak):
 *   <TransitionOverlay>.
 * - Las que mueven o desenfocan la imagen de abajo (whip, blur, glitch):
 *   transitionFx() devuelve el transform y el filtro para el cuadro. Los
 *   subtítulos no se tocan, así siempre se leen.
 * "zoom" lo aplica el video base (ver useBaseScale en Edit.tsx).
 */
export const TRANSITION_KINDS = ["flash", "fade", "wipe", "slide", "zoom", "whip", "blur", "glitch", "lightleak"] as const;

/** Número pseudoaleatorio fijo por cuadro (el render tiene que dar siempre lo mismo). */
const rand = (frame: number, seed: number) => {
  const x = Math.sin(frame * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const progress = (it: PlanItem, t: number) => (t - it.startMs) / Math.max(1, it.endMs - it.startMs);

/** Transform y filtro del cuadro en el ms `t` (null si no hay transición que mueva la imagen). */
export const transitionFx = (
  items: PlanItem[],
  t: number,
  frame: number,
): { transform: string; filter: string } | null => {
  const transforms: string[] = [];
  const filters: string[] = [];
  for (const it of items) {
    if (it.type !== "transition" || t < it.startMs || t >= it.endMs) continue;
    const p = progress(it, t);
    const bell = Math.sin(Math.PI * p);
    switch (it.transition) {
      case "whip": {
        // Barrido: la imagen se va rápido a la izquierda y vuelve desde la derecha.
        // El zoom tapa los bordes que deja el desplazamiento.
        const x = p < 0.5 ? -Math.pow(p * 2, 2) * 14 : Math.pow(1 - (p - 0.5) * 2, 2) * 14;
        transforms.push(`scale(${1 + 0.34 * bell}) translateX(${x}%)`);
        filters.push(`blur(${(22 * bell).toFixed(1)}px)`, `brightness(${(1 + 0.12 * bell).toFixed(3)})`);
        break;
      }
      case "blur": {
        transforms.push(`scale(${1 + 0.06 * bell})`);
        filters.push(`blur(${(26 * bell).toFixed(1)}px)`, `brightness(${(1 + 0.15 * bell).toFixed(3)})`);
        break;
      }
      case "glitch": {
        // Tirones cortos y colores corridos, no en todos los cuadros (se siente cortado).
        if (rand(frame, 1) < 0.35) break;
        const dx = (rand(frame, 2) - 0.5) * 7 * (0.4 + bell);
        const dy = (rand(frame, 3) - 0.5) * 2;
        transforms.push(`translate(${dx.toFixed(2)}%, ${dy.toFixed(2)}%) scale(1.04)`);
        filters.push(`hue-rotate(${Math.round((rand(frame, 4) - 0.5) * 140)}deg)`, "saturate(1.8)", "contrast(1.35)");
        break;
      }
    }
  }
  return transforms.length || filters.length ? { transform: transforms.join(" ") || "none", filter: filters.join(" ") || "none" } : null;
};

/** Lo que se dibuja encima del cuadro. Va dentro de un <Sequence> que dura lo que la transición. */
export const TransitionOverlay: React.FC<{ item: PlanItem; color: string }> = ({ item, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = Math.max(1, ((item.endMs - item.startMs) / 1000) * fps);
  const p = frame / dur;
  const bell = Math.sin(Math.PI * Math.min(1, Math.max(0, p)));
  const kind = item.transition ?? "flash";
  if (kind === "zoom" || kind === "whip" || kind === "blur") return null; // mueven la imagen, no dibujan encima

  if (kind === "wipe" || kind === "slide") {
    const x = interpolate(p, [0, 1], [-110, 110], { easing: Easing.inOut(Easing.cubic) });
    return <AbsoluteFill style={{ transform: `translateX(${x}%) skewX(-12deg)`, backgroundColor: color }} />;
  }

  if (kind === "glitch") {
    const colors = [color, "#00E5FF", "#FF2BD6"];
    const bars = Array.from({ length: 6 }, (_, k) => k).filter((k) => rand(frame, k + 10) > 0.45);
    return (
      <AbsoluteFill style={{ opacity: 0.35 + 0.65 * bell }}>
        {bars.map((k) => (
          <div
            key={k}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${rand(frame, k + 20) * 95}%`,
              height: `${1.5 + rand(frame, k + 30) * 7}%`,
              transform: `translateX(${(rand(frame, k + 40) - 0.5) * 20}%)`,
              backgroundColor: colors[k % colors.length],
              opacity: 0.55,
              mixBlendMode: "screen",
            }}
          />
        ))}
        {/* Líneas de barrido de pantalla vieja */}
        <AbsoluteFill
          style={{
            backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 2px, transparent 2px, transparent 5px)",
          }}
        />
      </AbsoluteFill>
    );
  }

  if (kind === "lightleak") {
    // Destello de luz cálida que cruza la pantalla en diagonal, con el color de la marca.
    const x = -30 + 160 * p;
    const y = 20 + 50 * p;
    return (
      <AbsoluteFill
        style={{
          opacity: Math.pow(bell, 0.8),
          mixBlendMode: "screen",
          backgroundImage: [
            `radial-gradient(ellipse 60% 45% at ${x}% ${y}%, rgba(255,236,200,0.95), transparent 70%)`,
            `radial-gradient(ellipse 75% 60% at ${x - 18}% ${y + 12}%, ${color}d9, transparent 72%)`,
            `radial-gradient(ellipse 80% 70% at ${x + 20}% ${y - 15}%, rgba(255,140,60,0.8), transparent 70%)`,
          ].join(", "),
        }}
      />
    );
  }

  const peak = kind === "fade" ? 1 : 0.85;
  const opacity = interpolate(p, [0, 0.5, 1], [0, peak, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ backgroundColor: kind === "fade" ? "#000" : "#fff", opacity }} />;
};
