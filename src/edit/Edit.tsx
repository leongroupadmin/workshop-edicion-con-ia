import { Audio, Video } from "@remotion/media";
import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { EditProps, EditStyle, Format, PlanItem, SceneLayout } from "../pipeline/types";
import { AUTO_ZOOM_SCALE, INSET_LAYOUTS, SCENE_TYPES, fixedLayoutOf, sceneLayout } from "../pipeline/types";
import { Captions } from "./Captions";
import { useBrandFonts } from "./fonts";
import { autoZoomAt, insetAt, splitAmount, splitRegions, touchesSplit, videoInset } from "./layout";

const activeItems = (items: PlanItem[]) =>
  items.filter((i) => i.status !== "removed" && i.endMs > i.startMs);

/** Layouts en los que el gráfico tapa la pantalla (el video no se ve entero). */
const COVERING = new Set<SceneLayout>(["fullscreen", "split", "pip", "frame"]);

/**
 * Dos gráficos seguidos con un hueco chico entre ellos dejaban asomar 2 o 3
 * frames del video crudo. Acá el primero se sostiene (congela su último
 * cuadro) hasta que entra el segundo, así el corte es limpio.
 */
const BRIDGE_MS = 400;

const bridgeScenes = (items: PlanItem[]) => {
  const scenes = items
    .filter((i) => SCENE_TYPES.has(i.type) && i.file)
    .sort((a, b) => a.startMs - b.startMs);
  const nuevoFin = new Map<string, number>();
  scenes.forEach((it, i) => {
    const next = scenes[i + 1];
    if (!next) return;
    const hueco = next.startMs - it.endMs;
    if (hueco <= 0 || hueco > BRIDGE_MS) return;
    // Si el que sigue es un overlay, el video TIENE que volver: ahí no se estira.
    if (!COVERING.has(sceneLayout(it)) || !COVERING.has(sceneLayout(next))) return;
    nuevoFin.set(it.id, next.startMs);
  });
  return nuevoFin.size
    ? items.map((i) => (nuevoFin.has(i.id) ? { ...i, endMs: nuevoFin.get(i.id)! } : i))
    : items;
};

/** Intervalos en los que hay voz (para el ducking de la música). */
const speechRanges = (words: EditProps["words"]) => {
  const out: { startMs: number; endMs: number }[] = [];
  for (const w of words) {
    const last = out[out.length - 1];
    if (last && w.startMs - last.endMs < 350) last.endMs = Math.max(last.endMs, w.endMs);
    else out.push({ startMs: w.startMs, endMs: w.endMs });
  }
  return out;
};

/** Escala del video base: zoom automático en los cortes + zooms del plan + transiciones tipo "zoom". */
const useBaseScale = (items: PlanItem[], autoZoom: number[] | null) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame / fps) * 1000;
  let scale = autoZoom ? autoZoomAt(autoZoom, t, AUTO_ZOOM_SCALE) : 1;
  for (const it of items) {
    if (it.type === "zoom") {
      const target = Math.min(1.6, Math.max(1, it.scale ?? 1.15));
      const ramp = Math.min(250, (it.endMs - it.startMs) / 3);
      const s = interpolate(
        t,
        [it.startMs, it.startMs + ramp, it.endMs - ramp, it.endMs],
        [1, target, target, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) },
      );
      scale = Math.max(scale, s);
    }
    if (it.type === "transition" && it.transition === "zoom") {
      const mid = (it.startMs + it.endMs) / 2;
      const s = interpolate(t, [it.startMs, mid, it.endMs], [1, 1.25, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.quad),
      });
      scale = Math.max(scale, s);
    }
  }
  return scale;
};

const BaseVideo: React.FC<{ props: EditProps; items: PlanItem[]; splits: { startMs: number; endMs: number }[] }> = ({
  props,
  items,
  splits,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const scale = useBaseScale(items, props.settings.style.autoZoom ? (props.cutPoints ?? []) : null);
  // Pantalla dividida: el video pasa a su parte de la pantalla (corte directo)
  const split = splitAmount(splits, (frame / fps) * 1000);
  const { video: region } = splitRegions(props.settings.format, width, height, props.settings.style.split);
  const box = {
    left: region.x * split,
    top: region.y * split,
    width: width + (region.width - width) * split,
    height: height + (region.height - height) * split,
  };
  const src = `${props.baseUrl}/${props.cutVideo}`;
  const srcAR = props.sourceWidth / Math.max(1, props.sourceHeight);
  const dstAR = width / height;
  // Si el aspecto es muy distinto (p.ej. vertical -> horizontal), fondo desenfocado + video entero.
  const letterbox = Math.abs(Math.log(srcAR / dstAR)) > 0.45;

  return (
    <AbsoluteFill style={{ backgroundColor: props.brand.colors.background }}>
      {letterbox ? (
        <AbsoluteFill style={{ filter: "blur(40px) brightness(0.55)", transform: "scale(1.2)" }}>
          <Video src={src} muted objectFit="cover" style={{ width: "100%", height: "100%" }} />
        </AbsoluteFill>
      ) : null}
      <div style={{ position: "absolute", ...box, overflow: "hidden" }}>
        {/* Zoom centrado un poco arriba del medio, donde suele estar la cara */}
        <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: "50% 40%" }}>
          <Video
            name="Video cortado"
            src={src}
            objectFit={letterbox ? "contain" : "cover"}
            // En la mitad de abajo, encuadrar un poco más arriba para no cortar la cabeza
            style={{ width: "100%", height: "100%", objectPosition: `50% ${50 - 20 * split}%` }}
          />
        </AbsoluteFill>
      </div>
    </AbsoluteFill>
  );
};

/** Escena de pantalla dividida: aparece en su parte de la pantalla con corte directo (sin transición). */
const SplitScene: React.FC<{
  src: string;
  background: string;
  format: Format;
  splitStyle: EditStyle["split"];
}> = ({ src, background, format, splitStyle }) => {
  const { width, height } = useVideoConfig();
  const { scene: region } = splitRegions(format, width, height, splitStyle);
  return (
    <div
      style={{
        position: "absolute",
        left: region.x,
        top: region.y,
        width: region.width,
        height: region.height,
        overflow: "hidden",
        backgroundColor: background,
      }}
    >
      {/* contain: si la escena se generó con otra proporción, no se recorta */}
      <Video src={src} muted objectFit="contain" style={{ width: "100%", height: "100%" }} />
    </div>
  );
};

/**
 * Tu video metido en un rectángulo, dibujado ENCIMA del gráfico a pantalla
 * completa: "pip" (una esquina) o "frame" (enmarcado).
 *
 * Va montado en la línea de tiempo principal (no dentro de un Sequence) para
 * que siempre muestre el mismo momento que el video de abajo. El audio sale
 * del video base, por eso acá va en silencio.
 */
const InsetVideo: React.FC<{
  props: EditProps;
  insets: { startMs: number; endMs: number; layout: ReturnType<typeof sceneLayout> }[];
}> = ({ props, insets }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const layout = insetAt(insets, (frame / fps) * 1000);
  if (!layout) return null;
  const r = videoInset(props.settings.format, width, height, layout);
  return (
    <div
      style={{
        position: "absolute",
        left: r.x,
        top: r.y,
        width: r.width,
        height: r.height,
        overflow: "hidden",
        borderRadius: r.radius,
        backgroundColor: props.brand.colors.background,
        boxShadow: `0 0 0 ${r.border}px ${props.brand.colors.primary}, 0 24px 60px rgba(0,0,0,0.45)`,
      }}
    >
      <Video
        name={`Video ${layout}`}
        src={`${props.baseUrl}/${props.cutVideo}`}
        muted
        objectFit="cover"
        // Encuadre un poco más arriba: en un recuadro chico la cara tiene que quedar centrada
        style={{ width: "100%", height: "100%", objectPosition: "50% 35%" }}
      />
    </div>
  );
};

/**
 * Fondo de marca para cuando el armado es "fijo" y no hay ninguna escena:
 * la mitad del gráfico (o la pantalla detrás del recuadro) nunca queda vacía
 * ni muestra el video. Dos manchas de color de la marca respiran despacio.
 */
const BrandBackdrop: React.FC<{ colors: EditProps["brand"]["colors"]; region?: { x: number; y: number; width: number; height: number } }> = ({
  colors,
  region,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const ax = 30 + Math.sin(t * 0.35) * 12;
  const ay = 35 + Math.cos(t * 0.27) * 10;
  const bx = 70 + Math.cos(t * 0.31) * 12;
  const by = 68 + Math.sin(t * 0.23) * 10;
  const style: React.CSSProperties = {
    position: "absolute",
    overflow: "hidden",
    backgroundColor: colors.background,
    backgroundImage: [
      `radial-gradient(circle at ${ax}% ${ay}%, ${colors.primary}38, transparent 55%)`,
      `radial-gradient(circle at ${bx}% ${by}%, ${colors.secondary}2e, transparent 50%)`,
      `radial-gradient(${colors.text}14 1.5px, transparent 1.5px)`,
    ].join(", "),
    backgroundSize: "100% 100%, 100% 100%, 36px 36px",
    ...(region
      ? { left: region.x, top: region.y, width: region.width, height: region.height }
      : { left: 0, top: 0, right: 0, bottom: 0 }),
  };
  return <div style={style} />;
};

const Transition: React.FC<{ item: PlanItem; color: string }> = ({ item, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = Math.max(1, ((item.endMs - item.startMs) / 1000) * fps);
  const p = frame / dur;
  const kind = item.transition ?? "flash";
  if (kind === "zoom") return null; // se aplica sobre el video base
  if (kind === "wipe" || kind === "slide") {
    const x = interpolate(p, [0, 1], [-110, 110], { easing: Easing.inOut(Easing.cubic) });
    return (
      <AbsoluteFill style={{ transform: `translateX(${x}%) skewX(-12deg)`, backgroundColor: color }} />
    );
  }
  const peak = kind === "fade" ? 1 : 0.85;
  const opacity = interpolate(p, [0, 0.5, 1], [0, peak, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{ backgroundColor: kind === "fade" ? "#000" : "#fff", opacity }}
    />
  );
};

export const Edit: React.FC<EditProps> = (props) => {
  const { fps, durationInFrames, width, height } = useVideoConfig();
  useBrandFonts(props.brand, props.baseUrl, props.brandAssetsPath);
  const all = useMemo(() => bridgeScenes(activeItems(props.plan?.items ?? [])), [props.plan]);
  const speech = useMemo(() => speechRanges(props.words), [props.words]);
  const f = (ms: number) => Math.round((ms / 1000) * fps);
  const url = (rel: string) => `${props.baseUrl}/${rel}`;

  const scenes = all.filter((i) => SCENE_TYPES.has(i.type) && i.file);
  const splitScenes = scenes.filter((i) => sceneLayout(i) === "split");
  // "Fijo": el armado elegido queda de principio a fin, con o sin escena.
  const fixed = fixedLayoutOf(props.settings.style);
  const whole = { startMs: 0, endMs: props.durationMs };
  // Con pantalla dividida (no fija) no hay transiciones (ni su sonido): corte directo.
  // Fija, la división nunca entra ni sale: las transiciones van dentro de la mitad del gráfico.
  const items = fixed
    ? all
    : all.filter((i) => !(i.type === "transition" && touchesSplit(i, splitScenes)));
  // pip y frame también tapan la pantalla: el video se dibuja encima, aparte.
  const fullscreen = scenes.filter(
    (i) => sceneLayout(i) === "fullscreen" || INSET_LAYOUTS.has(sceneLayout(i)),
  );
  const insets =
    fixed === "pip" || fixed === "frame"
      ? [{ ...whole, layout: fixed }]
      : scenes
          .filter((i) => INSET_LAYOUTS.has(sceneLayout(i)))
          .map((i) => ({ startMs: i.startMs, endMs: i.endMs, layout: sceneLayout(i) }));
  const splits = scenes.filter((i) => sceneLayout(i) === "split");
  // Tramos con la pantalla dividida (video en su mitad, subtítulos en la unión).
  const splitRanges = fixed === "split" ? [whole] : splits;
  const regions = splitRegions(props.settings.format, width, height, props.settings.style.split);
  const overlays = scenes.filter((i) => sceneLayout(i) === "overlay");
  const sounds = props.settings.sfx.enabled ? items.filter((i) => i.sound) : [];
  const hiddenRanges = items.filter((i) => i.hideCaptions);

  const transitions = items
    .filter((i) => i.type === "transition")
    .map((it) => (
      <Sequence
        key={it.id}
        name={`Transición ${it.id}`}
        from={f(it.startMs)}
        durationInFrames={Math.max(2, f(it.endMs - it.startMs))}
      >
        <Transition item={it} color={props.brand.colors.primary} />
      </Sequence>
    ));

  const music = props.settings.music;
  const musicVolume = (frame: number) => {
    const t = (frame / fps) * 1000;
    let dist = Infinity;
    for (const r of speech) {
      if (t >= r.startMs && t <= r.endMs) {
        dist = 0;
        break;
      }
      dist = Math.min(dist, Math.abs(t - r.startMs), Math.abs(t - r.endMs));
    }
    const duck = interpolate(dist, [0, 300], [music.duckTo, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const fadeIn = interpolate(frame, [0, fps * 0.6], [0, 1], { extrapolateRight: "clamp" });
    const fadeOut = interpolate(frame, [durationInFrames - fps * 1.2, durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return music.volume * duck * fadeIn * fadeOut;
  };

  return (
    <AbsoluteFill style={{ backgroundColor: props.brand.colors.background }}>
      {props.cutVideo ? <BaseVideo props={props} items={items} splits={splitRanges} /> : null}

      {fixed ? (
        <BrandBackdrop colors={props.brand.colors} region={fixed === "split" ? regions.scene : undefined} />
      ) : null}

      {splits.map((it) => (
        <Sequence
          key={it.id}
          name={`Pantalla dividida ${it.id}`}
          from={f(it.startMs)}
          durationInFrames={Math.max(1, f(it.endMs - it.startMs))}
          premountFor={fps}
        >
          <SplitScene
            src={url(it.file!)}
            background={props.brand.colors.background}
            format={props.settings.format}
            splitStyle={props.settings.style.split}
          />
        </Sequence>
      ))}

      {fullscreen.map((it) => (
        <Sequence
          key={it.id}
          name={`Escena ${it.id}`}
          from={f(it.startMs)}
          durationInFrames={Math.max(1, f(it.endMs - it.startMs))}
          premountFor={fps}
        >
          <AbsoluteFill style={{ backgroundColor: props.brand.colors.background }}>
            <Video src={url(it.file!)} muted objectFit="contain" style={{ width: "100%", height: "100%" }} />
          </AbsoluteFill>
        </Sequence>
      ))}

      {/* Fijo con recuadro: la transición pasa detrás de tu video, que nunca se tapa */}
      {fixed === "pip" || fixed === "frame" ? transitions : null}

      {insets.length ? <InsetVideo props={props} insets={insets} /> : null}

      {overlays.map((it) => (
        <Sequence
          key={it.id}
          name={`Overlay ${it.id}`}
          from={f(it.startMs)}
          durationInFrames={Math.max(1, f(it.endMs - it.startMs))}
          premountFor={fps}
        >
          <Video
            src={url(it.file!)}
            muted
            objectFit="contain"
            style={{ width: "100%", height: "100%" }}
          />
        </Sequence>
      ))}

      <Captions
        words={props.words}
        settings={props.settings.subtitles}
        brand={props.brand}
        keywords={props.plan?.keywords ?? []}
        format={props.settings.format}
        hiddenRanges={hiddenRanges}
        splitRanges={splitRanges}
        splitSeam={regions.seam}
      />

      {fixed === "split" ? (
        // Fija: la transición queda dentro de la mitad del gráfico (tu cara no se tapa)
        <div
          style={{
            position: "absolute",
            left: regions.scene.x,
            top: regions.scene.y,
            width: regions.scene.width,
            height: regions.scene.height,
            overflow: "hidden",
          }}
        >
          {transitions}
        </div>
      ) : fixed ? null : (
        transitions
      )}

      {sounds.map((it) => (
        <Sequence key={`sfx-${it.id}`} name={`SFX ${it.id}`} from={f(it.startMs)} premountFor={fps}>
          <Audio src={url(`assets/${it.sound}`)} volume={props.settings.sfx.volume} />
        </Sequence>
      ))}

      {music.enabled && props.musicFile ? (
        <Audio
          name="Música"
          src={url(props.musicFile)}
          loop
          loopVolumeCurveBehavior="extend"
          volume={musicVolume}
        />
      ) : null}
    </AbsoluteFill>
  );
};
