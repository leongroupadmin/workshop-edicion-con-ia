import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Brand, Format, Settings, Word } from "../pipeline/types";
import { fontStack, useCaptionFont } from "./fonts";
import { captionAccent } from "./caption-typography";
import { captionBox } from "./layout";

type Page = { startMs: number; endMs: number; words: Word[] };

/**
 * Los subtítulos se adelantan un poco a la voz. Whisper marca cada palabra
 * ~0.1 s tarde (medido contra el audio de los videos) y la palabra además
 * tarda unas centésimas en aparecer; sin este adelanto se ven atrasados.
 * Un subtítulo apenas adelantado se siente sincronizado; uno atrasado, no.
 */
export const CAPTION_LEAD_MS = 150;

const leadWords = (words: Word[]): Word[] =>
  words.map((w) => ({
    ...w,
    startMs: Math.max(0, w.startMs - CAPTION_LEAD_MS),
    endMs: Math.max(0, w.endMs - CAPTION_LEAD_MS),
  }));

const clean = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zñ0-9]/g, "");

/** Agrupa palabras en "páginas" de máximo N palabras, cortando en puntuación o pausas. */
export const buildPages = (words: Word[], maxWords: number): Page[] => {
  const pages: Page[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) {
      pages.push({ startMs: cur[0].startMs, endMs: cur[cur.length - 1].endMs, words: cur });
      cur = [];
    }
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length && prev && w.startMs - prev.endMs > 450) flush();
    cur.push(w);
    const punct = /[.!?…]$/.test(w.text) || (/[,;:]$/.test(w.text) && cur.length >= 2);
    if (cur.length >= maxWords || punct) flush();
  });
  flush();
  // Cada página dura hasta que empieza la siguiente (máx. 700 ms de cola).
  for (let i = 0; i < pages.length; i++) {
    const next = pages[i + 1];
    const tail = pages[i].endMs + 700;
    pages[i].endMs = next ? Math.min(next.startMs, tail) : tail;
  }
  return pages;
};

const CaptionPage: React.FC<{
  page: Page;
  settings: Settings["subtitles"];
  brand: Brand;
  keywords: Set<string>;
  format: Format;
  centerY?: number;
}> = ({ page, settings, brand, keywords, format, centerY }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = page.startMs + (frame / fps) * 1000;
  const scale = Math.min(width, height) / 1080;
  const fontSize = settings.size * scale;
  const box = captionBox(format, settings.position, width, height, centerY);
  const accentFont = captionAccent(settings, brand);
  const karaoke = settings.style === "karaoke";
  const popStyle = settings.style === "pop";
  // Minimal: sin contorno grueso ni cápsulas. El movimiento es la palabra
  // subiendo a su lugar cuando se dice, y un subrayado fino en las clave.
  const minimal = settings.style === "minimal";

  // Entrada de la página
  const enter = interpolate(frame, [0, 5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  // Minimal se va con un desvanecido corto: nunca corta de golpe.
  const pageFrames = ((page.endMs - page.startMs) / 1000) * fps;
  const leave = minimal
    ? interpolate(frame, [pageFrames - 6, pageFrames], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.in(Easing.cubic),
      })
    : 1;

  const active = page.words.reduce((acc, w, i) => (w.startMs <= t ? i : acc), -1);
  const activeIndex = Math.max(0, active);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: box.left,
          width: box.width,
          top: "top" in box ? box.top : undefined,
          bottom: "bottom" in box ? box.bottom : undefined,
          transform: `${"translateY" in box ? `translateY(${box.translateY}) ` : ""}translateY(${(1 - enter) * 20}px)`,
          opacity: enter * leave,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          rowGap: fontSize * 0.1,
          columnGap: fontSize * 0.32,
          textAlign: "center",
          fontFamily: fontStack(brand.fonts[settings.primaryFont ?? "heading"]),
          fontWeight: minimal ? 700 : 800,
          letterSpacing: minimal ? fontSize * 0.008 : undefined,
          fontSize,
          lineHeight: minimal ? 1.25 : 1.1,
          textTransform: settings.uppercase ? "uppercase" : "none",
        }}
      >
        {page.words.map((w, i) => {
          const isKeyword = keywords.has(clean(w.text));
          const accent = settings.mixFonts && isKeyword;
          const cursive = accent && accentFont.cursive;
          const typography: React.CSSProperties = accent ? {
            fontFamily: cursive ? '"Clipo Lora", Georgia, serif' : fontStack(accentFont.family),
            fontStyle: cursive ? "italic" : "normal",
            fontWeight: cursive ? 600 : 800,
            // Dar aire a los trazos inclinados sin variar el tamaño durante la frase.
            paddingInline: cursive ? "0.06em" : undefined,
          } : {};
          const spoken = i <= active;
          const isActive = (karaoke && i === active) || (popStyle && i === activeIndex);
          const sinceStart = t - w.startMs;
          const pop = isActive
            ? interpolate(sinceStart, [0, 90, 180], popStyle ? [0.84, 1.2, 1] : [1, 1.14, 1.08], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : 1;
          if (minimal) {
            // Cada palabra sube a su lugar cuando se dice (el espacio ya está
            // reservado, así que la línea no salta), y la clave se subraya sola.
            const appear = interpolate(sinceStart, [0, 170], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            });
            const underline = isKeyword
              ? interpolate(sinceStart, [60, 320], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.out(Easing.cubic),
                })
              : 0;
            return (
              <span
                key={i}
                style={{
                  ...typography,
                  position: "relative",
                  display: "inline-block",
                  transform: `translateY(${(1 - appear) * fontSize * 0.3}px)`,
                  opacity: appear,
                  color: isKeyword ? brand.colors.highlight : settings.color || brand.colors.text,
                  // Contorno fino: la mitad que el karaoke, pero suficiente para
                  // que se lea sobre fondos claros (ropa, pared, cielo).
                  fontWeight: cursive ? 600 : isKeyword ? 800 : undefined,
                  // Sin contorno: a este peso se comería la letra. Un halo oscuro
                  // en capas la despega de fondos claros sin ensuciar el dibujo.
                  textShadow: [
                    `0 ${fontSize * 0.02}px ${fontSize * 0.05}px rgba(0,0,0,0.85)`,
                    `0 ${fontSize * 0.05}px ${fontSize * 0.18}px rgba(0,0,0,0.65)`,
                    `0 0 ${fontSize * 0.45}px rgba(0,0,0,0.45)`,
                  ].join(", "),
                }}
              >
                {w.text}
                {isKeyword ? (
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      bottom: -fontSize * 0.12,
                      height: fontSize * 0.065,
                      width: `${underline * 100}%`,
                      borderRadius: fontSize * 0.03,
                      background: brand.colors.highlight,
                    }}
                  />
                ) : null}
              </span>
            );
          }
          const pill = popStyle || (isKeyword && (!karaoke || spoken));
          const color = pill
            ? brand.colors.background
            : isActive
              ? brand.colors.highlight
              : settings.color || brand.colors.text;
          return (
            <span
              key={i}
              style={{
                ...typography,
                display: popStyle && i !== activeIndex ? "none" : "inline-block",
                transform: `scale(${pop})`,
                // El scale no ocupa lugar en el flex: sin este margen, una palabra larga
                // agrandada se come el espacio y queda pegada a sus vecinas.
                margin: `0 ${(Math.max(0, pop - 1) * w.text.length * fontSize * 0.6) / 2}px`,
                color,
                opacity: karaoke && !spoken ? 0.55 : 1,
                padding: pill ? (popStyle ? `${fontSize * 0.12}px ${fontSize * 0.26}px` : `0 ${fontSize * 0.18}px`) : 0,
                borderRadius: popStyle ? fontSize * 0.24 : fontSize * 0.18,
                background: pill ? brand.colors.primary : "transparent",
                WebkitTextStroke: pill ? undefined : `${fontSize * (cursive ? 0.055 : 0.14)}px rgba(0,0,0,0.9)`,
                paintOrder: "stroke fill",
                textShadow: pill ? (popStyle ? `0 ${fontSize * 0.08}px ${fontSize * 0.2}px rgba(0,0,0,0.35)` : undefined) : `0 ${fontSize * 0.06}px ${fontSize * 0.2}px rgba(0,0,0,0.55)`,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const Captions: React.FC<{
  words: Word[];
  settings: Settings["subtitles"];
  brand: Brand;
  keywords: string[];
  format: Format;
  hiddenRanges: { startMs: number; endMs: number }[];
  /** Tramos en pantalla dividida: los subtítulos van sobre la unión (vertical/cuadrado). */
  splitRanges?: { startMs: number; endMs: number }[];
  /** Altura de la unión de la pantalla dividida (px). */
  splitSeam?: number;
}> = ({ words, settings, brand, keywords, format, hiddenRanges, splitRanges = [], splitSeam }) => {
  useCaptionFont(settings.style !== "none" && !!settings.mixFonts && captionAccent(settings, brand).cursive);
  const { fps } = useVideoConfig();
  const maxWords = Math.max(1, Math.min(4, settings.maxWords));
  const pages = useMemo(() => buildPages(leadWords(words), maxWords), [words, maxWords]);
  const kw = useMemo(() => new Set(keywords.map(clean).filter(Boolean)), [keywords]);

  if (settings.style === "none") return null;

  return (
    <>
      {pages.map((page, i) => {
        const mid = (page.startMs + page.endMs) / 2;
        if (hiddenRanges.some((r) => mid >= r.startMs && mid <= r.endMs)) return null;
        const onSeam = format !== "horizontal" && splitRanges.some((r) => mid >= r.startMs && mid <= r.endMs);
        const from = Math.round((page.startMs / 1000) * fps);
        const dur = Math.max(1, Math.round(((page.endMs - page.startMs) / 1000) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={dur} name={`Subtítulo ${i + 1}`} layout="none">
            <CaptionPage
              page={page}
              settings={settings}
              centerY={onSeam ? splitSeam : undefined}
              brand={brand}
              keywords={kw}
              format={format}
            />
          </Sequence>
        );
      })}
    </>
  );
};
