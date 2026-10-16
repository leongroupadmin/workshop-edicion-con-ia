import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Video, Audio } from "@remotion/media";
import { Captions } from "../edit/Captions";
import { useBrandFonts } from "../edit/fonts";
import { buildFramingTimeline, framingAt } from "./framing";
import type { ClipRenderProps } from "./types";
export const Clip: React.FC<ClipRenderProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  useBrandFonts(p.brand, p.baseUrl, p.brandPath);
  const t = (frame / fps) * 1000;
  const timeline = useMemo(
    () =>
      buildFramingTimeline(
        p.faces,
        p.sourceWidth,
        p.sourceHeight,
        p.settings.zoom,
      ),
    [p.faces, p.sourceWidth, p.sourceHeight, p.settings.zoom],
  );
  const shot = framingAt(timeline, t);
  const speaking = p.words.some(
    (w) => t >= w.startMs - 100 && t <= w.endMs + 200,
  );
  const fade = Math.min(1, t / 350, (p.durationMs - t) / 500);
  return (
    <AbsoluteFill style={{ backgroundColor: "#080808", overflow: "hidden" }}>
      {shot.crops.map((crop, index) => {
        const slotHeight = shot.layout === "split" ? 960 : 1920;
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: 0,
              top: index * slotHeight,
              width: 1080,
              height: slotHeight,
              overflow: "hidden",
            }}
          >
            <Video
              src={`${p.baseUrl}/${p.video}`}
              muted={index > 0}
              style={{
                position: "absolute",
                maxWidth: "none",
                width: p.sourceWidth * crop.scale,
                height: p.sourceHeight * crop.scale,
                left: 540 - p.sourceWidth * crop.scale * crop.x,
                top: slotHeight / 2 - p.sourceHeight * crop.scale * crop.y,
              }}
            />
          </div>
        );
      })}
      <Captions
        words={p.words}
        settings={p.settings.subtitles}
        brand={p.brand}
        keywords={[]}
        format="vertical"
        hiddenRanges={[]}
      />
      {p.music ? (
        <Audio
          src={`${p.baseUrl}/${p.music}`}
          loop
          volume={
            p.settings.musicVolume * (speaking ? 0.4 : 1) * Math.max(0, fade)
          }
        />
      ) : null}
    </AbsoluteFill>
  );
};
