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
import { fontStack } from "./fonts";
import { captionBox } from "./layout";

type Page = { startMs: number; endMs: number; words: Word[] };

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
  const karaoke = settings.style === "karaoke";

  // Entrada de la página
  const enter = interpolate(frame, [0, 5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const active = page.words.reduce((acc, w, i) => (w.startMs <= t ? i : acc), -1);

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
          opacity: enter,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          rowGap: fontSize * 0.1,
          columnGap: fontSize * 0.32,
          textAlign: "center",
          fontFamily: fontStack(brand.fonts.heading),
          fontWeight: 800,
          fontSize,
          lineHeight: 1.1,
          textTransform: settings.uppercase ? "uppercase" : "none",
        }}
      >
        {page.words.map((w, i) => {
          const isKeyword = keywords.has(clean(w.text));
          const spoken = i <= active;
          const isActive = karaoke && i === active;
          const sinceStart = t - w.startMs;
          const pop = isActive
            ? interpolate(sinceStart, [0, 90, 180], [1, 1.14, 1.08], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : 1;
          const pill = isKeyword && (!karaoke || spoken);
          const color = pill
            ? brand.colors.background
            : isActive
              ? brand.colors.highlight
              : brand.colors.text;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                transform: `scale(${pop})`,
                color,
                opacity: karaoke && !spoken ? 0.55 : 1,
                padding: pill ? `0 ${fontSize * 0.18}px` : 0,
                borderRadius: fontSize * 0.18,
                background: pill ? brand.colors.primary : "transparent",
                WebkitTextStroke: pill ? undefined : `${fontSize * 0.14}px rgba(0,0,0,0.9)`,
                paintOrder: "stroke fill",
                textShadow: pill ? undefined : `0 ${fontSize * 0.06}px ${fontSize * 0.2}px rgba(0,0,0,0.55)`,
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
  const { fps } = useVideoConfig();
  const maxWords = Math.max(1, Math.min(4, settings.maxWords));
  const pages = useMemo(() => buildPages(words, maxWords), [words, maxWords]);
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
