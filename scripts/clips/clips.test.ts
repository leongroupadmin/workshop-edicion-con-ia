import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLIP_DEFAULTS,
  validateBounds,
  validateSettings,
} from "../../src/clips/types";
import { buildFramingTimeline, framingAt } from "../../src/clips/framing";
import { proposalsFromAI } from "./select";
import { clipDir } from "./storage";
import type { Transcript } from "../../src/pipeline/types";
const settings = { ...CLIP_DEFAULTS, brand: "test", minSeconds: 5 };
test("accepts 90 seconds, rejects longer, inverted or non-finite boundaries", () => {
  validateBounds(10000, 100000, 900000, settings);
  for (const [start, end] of [
    [0, 90001],
    [-1, 6000],
    [5000, 1000],
    [NaN, 20000],
    [0, Infinity],
    [899000, 904000],
  ])
    assert.throws(() => validateBounds(start, end, 900000, settings));
  assert.throws(() => validateSettings({ ...settings, minSeconds: 91 }));
  assert.throws(() => validateSettings({ ...settings, maxSeconds: 91 }));
});
test("settings reject unsafe filenames, invalid durations and provider choices", () => {
  for (const patch of [
    { brand: "../x" },
    { music: "../../secret.mp3" },
    { count: 1.5 },
    { aiProvider: "anything" },
    { subtitles: { style: "x" } },
    { maxSeconds: NaN },
  ])
    assert.throws(() => validateSettings({ ...settings, ...patch }));
  assert.equal(
    validateSettings({ ...settings, maxSeconds: 90 }).maxSeconds,
    90,
  );
});
test("isolated storage cannot address editing projects or legacy folders", () => {
  for (const id of [
    "../projects/x",
    "20261011002051-28x0oe",
    "c-../../secret",
    "test",
  ])
    assert.throws(() => clipDir(id));
  assert.match(
    clipDir("c-12345678-1234-1234-1234-123456789abc"),
    /\/clips\/c-/,
  );
});
const transcript: Transcript = {
  version: 1,
  source: "source.mp4",
  language: "es",
  model: "test",
  durationMs: 100000,
  createdAt: "",
  text: "",
  words: Array.from({ length: 100 }, (_, i) => ({
    text: `palabra${i}`,
    startMs: i * 1000,
    endMs: i * 1000 + 800,
    confidence: 1,
  })),
};
test("AI selection uses word indices and rejects invented or overlapping fragments", () => {
  const raw = JSON.stringify({
    clips: [{ firstWord: 0, lastWord: 20, title: "Idea", reason: "Completa" }],
  });
  const clips = proposalsFromAI(raw, transcript, settings);
  assert.equal(clips[0].startMs, 0);
  assert.equal(clips[0].endMs, 20920);
  assert.throws(() =>
    proposalsFromAI(
      JSON.stringify({
        clips: [{ firstWord: 0, lastWord: 120, title: "x", reason: "x" }],
      }),
      transcript,
      settings,
    ),
  );
  assert.throws(() =>
    proposalsFromAI(
      JSON.stringify({
        clips: [
          { firstWord: 0, lastWord: 20, title: "x", reason: "x" },
          { firstWord: 10, lastWord: 30, title: "x", reason: "x" },
        ],
      }),
      transcript,
      settings,
    ),
  );
});

const left = { track: 0, x: 0.1, y: 0.2, w: 0.12, h: 0.25, score: 4 };
const right = { track: 1, x: 0.8, y: 0.2, w: 0.12, h: 0.25, score: -2 };
const sequence = (length: number, faces: (i: number) => (typeof left)[]) =>
  Array.from({ length }, (_, i) => ({ timeMs: i * 40, faces: faces(i) }));
test("brief confidence oscillations do not change the shot or scale", () => {
  const rows = sequence(250, (i) => [
    { ...left, score: i % 8 < 4 ? 4 : -1 },
    right,
  ]);
  const timeline = buildFramingTimeline(rows, 1920, 1080, false);
  assert.equal(new Set(timeline.map((f) => f.shot)).size, 1);
  assert.equal(new Set(timeline.map((f) => f.crops[0].scale)).size, 1);
  assert.ok(timeline.every((f) => f.crops[0].x < 0.4));
});
test("a sustained new speaker switches once after confirmation", () => {
  const rows = sequence(150, (i) =>
    i < 65
      ? [left, right]
      : [
          { ...left, score: -2 },
          { ...right, score: 4 },
        ],
  );
  const timeline = buildFramingTimeline(rows, 1920, 1080, false);
  const changes = timeline.filter(
    (r, i) => i && r.shot !== timeline[i - 1].shot,
  );
  assert.equal(changes.length, 1);
  assert.ok(changes[0].timeMs >= 2600 + 560);
  assert.equal(changes[0].crops[0].track, 1);
  assert.equal(framingAt(timeline, 600).crops[0].track, 0);
  // Seeking backward or forward has no stateful render side effects.
  assert.deepEqual(framingAt(timeline, 3200), framingAt(timeline, 3200));
});
test("short detector gaps retain the last portrait framing", () => {
  const timeline = buildFramingTimeline(
    sequence(100, (i) => (i >= 50 && i < 55 ? [] : [left])),
    1920,
    1080,
    false,
  );
  assert.equal(timeline[52].crops[0].x, timeline[49].crops[0].x);
  assert.equal(timeline[52].layout, "single");
  assert.equal(new Set(timeline.map((f) => f.shot)).size, 1);
});
test("sustained overlap uses two filled slots; it never fits a landscape into portrait", () => {
  for (const [w, h] of [
    [1920, 1080],
    [1080, 1920],
    [1000, 1000],
  ]) {
    const timeline = buildFramingTimeline(
      sequence(150, (i) => [left, { ...right, score: i < 60 ? -2 : 3.5 }]),
      w,
      h,
      false,
    );
    assert.equal(timeline.at(-1)?.layout, "split");
    for (const row of timeline)
      for (const c of row.crops) {
        const sh = row.layout === "split" ? 960 : 1920;
        const x = 540 - w * c.scale * c.x,
          y = sh / 2 - h * c.scale * c.y;
        assert.ok(
          x <= 1e-6 &&
            y <= 1e-6 &&
            x + w * c.scale >= 1080 - 1e-6 &&
            y + h * c.scale >= sh - 1e-6,
        );
      }
  }
});
test("real source cuts reset the target immediately and do not interpolate between faces", () => {
  const rows = sequence(60, (i) => (i < 25 ? [left] : [right]));
  const timeline = buildFramingTimeline(
    rows.map((r, i) => ({ ...r, shot: i === 25 })),
    1920,
    1080,
    false,
  );
  assert.equal(timeline[25].crops[0].track, 1);
});
test("empty detections still fill the complete portrait", () => {
  const row = buildFramingTimeline([], 1920, 1080, false)[0];
  assert.equal(row.crops[0].scale, 1920 / 1080);
});
