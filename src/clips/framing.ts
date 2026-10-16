import type { FaceFrame } from "./types";

type Face = FaceFrame["faces"][number];
export type Crop = {
  x: number;
  y: number;
  scale: number;
  track: number | null;
};
export type FramingFrame = {
  timeMs: number;
  layout: "single" | "split";
  crops: Crop[];
  shot: number;
};
export const FRAMING_RULES = {
  confirmMs: 560,
  overlapMs: 800,
  minShotMs: 1800,
  missingMs: 240,
};
const key = (tracks: number[]) => tracks.join(",");
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// Only a sustained, positive audiovisual decision can replace the current shot.
function candidate(faces: Face[]): number[] | null {
  const ranked = [...faces].sort(
    (a, b) => b.score - a.score || a.track - b.track,
  );
  if (!ranked.length) return null;
  if (ranked.length === 1) return [ranked[0].track];
  const [a, b] = ranked;
  if (a.score > 1 && b.score > 1 && a.score - b.score < 1.2)
    return [a, b].sort((x, y) => x.x - y.x).map((f) => f.track);
  return a.score > 0.5 && a.score - b.score > 1.2 ? [a.track] : null;
}

/** Cover every pixel of a slot. Scale never follows face-box size or confidence. */
export function coverCrop(
  width: number,
  height: number,
  slotHeight: number,
  zoom: boolean,
  face?: Face,
  previous?: Crop,
): Crop {
  const scale = Math.max(1080 / width, slotHeight / height) * (zoom ? 1.06 : 1);
  const visibleW = 1080 / (width * scale),
    visibleH = slotHeight / (height * scale);
  let x = face ? face.x + face.w / 2 : (previous?.x ?? 0.5);
  let y = face ? face.y + face.h / 2 + visibleH * 0.1 : (previous?.y ?? 0.5);
  if (previous && face && previous.track === face.track) {
    // A dead zone prevents tiny detector movements from shaking the virtual camera.
    x =
      Math.abs(x - previous.x) < 0.012
        ? previous.x
        : previous.x + (x - previous.x) * 0.16;
    y =
      Math.abs(y - previous.y) < 0.012
        ? previous.y
        : previous.y + (y - previous.y) * 0.16;
    // Keep the face visible even when it moves faster than the smoothing filter.
    if (face.w < visibleW)
      x = clamp(x, face.x + face.w - visibleW / 2, face.x + visibleW / 2);
    if (face.h < visibleH)
      y = clamp(y, face.y + face.h - visibleH / 2, face.y + visibleH / 2);
  }
  return {
    x: clamp(x, visibleW / 2, 1 - visibleW / 2),
    y: clamp(y, visibleH / 2, 1 - visibleH / 2),
    scale,
    track: face?.track ?? previous?.track ?? null,
  };
}

/** Precompute once: deterministic on random seeks, with no per-render-frame decisions. */
export function buildFramingTimeline(
  frames: FaceFrame[],
  width: number,
  height: number,
  zoom: boolean,
): FramingFrame[] {
  const output: FramingFrame[] = [];
  let tracks: number[] = [],
    pending: number[] | null = null,
    pendingSince = 0,
    shotSince = 0,
    missingSince: number | null = null,
    shot = 0;
  let previousCrops: Crop[] = [];
  for (const row of frames) {
    let proposed = candidate(row.faces);
    const present = tracks.every((t) => row.faces.some((f) => f.track === t));
    if (present) missingSince = null;
    else missingSince ??= row.timeMs;
    const lost =
      missingSince !== null &&
      row.timeMs - missingSince >= FRAMING_RULES.missingMs;
    if (!tracks.length || row.shot || (lost && row.faces.length)) {
      proposed ??= row.faces.length
        ? [
            [...row.faces].sort(
              (a, b) => b.score - a.score || b.w * b.h - a.w * a.h,
            )[0].track,
          ]
        : null;
      if (proposed) {
        tracks = proposed;
        shotSince = row.timeMs;
        shot++;
        pending = null;
        previousCrops = [];
        missingSince = null;
      }
    } else if (proposed && key(proposed) !== key(tracks)) {
      if (!pending || key(pending) !== key(proposed)) {
        pending = proposed;
        pendingSince = row.timeMs;
      }
      const confirmation =
        proposed.length === 2
          ? FRAMING_RULES.overlapMs
          : FRAMING_RULES.confirmMs;
      if (
        row.timeMs - pendingSince >= confirmation &&
        row.timeMs - shotSince >= FRAMING_RULES.minShotMs
      ) {
        tracks = proposed;
        shotSince = row.timeMs;
        shot++;
        pending = null;
        previousCrops = [];
      }
    } else {
      pending = null;
    }
    const layout = tracks.length === 2 ? "split" : "single";
    const crops = (tracks.length ? tracks : [null]).map((track, index) =>
      coverCrop(
        width,
        height,
        layout === "split" ? 960 : 1920,
        zoom,
        row.faces.find((f) => f.track === track),
        previousCrops[index],
      ),
    );
    output.push({ timeMs: row.timeMs, layout, crops, shot });
    previousCrops = crops;
  }
  return output.length
    ? output
    : [
        {
          timeMs: 0,
          layout: "single",
          crops: [coverCrop(width, height, 1920, zoom)],
          shot: 0,
        },
      ];
}
export function framingAt(
  timeline: FramingFrame[],
  timeMs: number,
): FramingFrame {
  // Use timestamps, not an assumed sampling rate. Never interpolate across a shot cut.
  let low = 0,
    high = timeline.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (timeline[mid].timeMs <= timeMs) low = mid;
    else high = mid - 1;
  }
  return timeline[low];
}
