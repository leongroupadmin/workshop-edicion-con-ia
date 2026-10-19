import React from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { PlanItem } from "../pipeline/types";
import { TransitionOverlay, transitionFx } from "./transitions";

/**
 * Muestra de una transición para la pestaña "Transiciones" del panel: dos
 * escenas de ejemplo con el corte en el medio y la transición encima, con el
 * mismo código que usa el montaje. Se renderiza con scripts/transition-demos.ts.
 */
export const DEMO_CUT_MS = 1200;
export const DEMO_DURATION_MS = 2400;

/** Duración típica de cada una (la misma guía que CLAUDE.md). */
const DURATIONS: Record<string, number> = {
  flash: 350,
  fade: 500,
  wipe: 450,
  zoom: 350,
  whip: 350,
  blur: 500,
  glitch: 330,
  lightleak: 800,
  shake: 400,
  zoomblur: 450,
  spin: 550,
  iris: 600,
  blinds: 550,
  filmburn: 800,
};

const ACCENT = "#ef233c";

const Shot: React.FC<{ second: boolean }> = ({ second }) => {
  const frame = useCurrentFrame();
  const drift = 1 + frame * 0.0015;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: second ? "#1d2b4a" : "#2a1416",
        backgroundImage: `repeating-linear-gradient(${second ? -35 : 35}deg, rgba(255,255,255,0.05) 0 18px, transparent 18px 52px)`,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, Helvetica, Arial, sans-serif",
        color: "#fff",
        transform: `scale(${drift})`,
      }}
    >
      <div
        style={{
          width: 260,
          height: 260,
          borderRadius: "50%",
          border: `10px solid ${second ? "#8fb8ff" : ACCENT}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 150,
          fontWeight: 800,
        }}
      >
        {second ? "2" : "1"}
      </div>
      <div style={{ marginTop: 36, fontSize: 44, fontWeight: 700, opacity: 0.85 }}>{second ? "Escena 2" : "Escena 1"}</div>
    </AbsoluteFill>
  );
};

export const TransitionDemo: React.FC<{ kind: string }> = ({ kind }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = (frame / fps) * 1000;
  const dur = DURATIONS[kind] ?? 400;
  const item = {
    id: "demo",
    type: "transition",
    // eslint-disable-next-line @remotion/non-pure-animation -- es el tipo de transición del plan, no CSS
    transition: kind,
    startMs: DEMO_CUT_MS - dur / 2,
    endMs: DEMO_CUT_MS + dur / 2,
    description: "",
    reason: "",
    status: "approved",
  } as PlanItem;
  const fx = transitionFx([item], t, frame, width / height);
  // "zoom" en el montaje lo hace el video base: acá se imita igual.
  const zoom =
    kind === "zoom"
      ? interpolate(t, [item.startMs, DEMO_CUT_MS, item.endMs], [1, 1.25, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.quad),
        })
      : 1;
  const from = Math.round((item.startMs / 1000) * fps);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0b", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `${fx?.transform ?? ""} scale(${zoom})`, filter: fx?.filter }}>
        <Shot second={t >= DEMO_CUT_MS} />
      </AbsoluteFill>
      <Sequence from={from} durationInFrames={Math.max(2, Math.round((dur / 1000) * fps))}>
        <TransitionOverlay item={item} color={ACCENT} />
      </Sequence>
    </AbsoluteFill>
  );
};
