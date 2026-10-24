import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, mergeSettings, sceneSpecFor, type EditStyle } from "../src/pipeline/types";
import { sceneSpecFor as panelSpec } from "../app/lib/defaults";
import { normalizeSettings } from "../app/lib/server/settings";
import { dimensionParts } from "./lib/scene-dimension";

test("settings antiguos conservan 2D y panel/pipeline acuerdan la dimensión", () => {
  const legacy = mergeSettings({ style: { graphics: "bold" } as EditStyle });
  assert.equal(legacy.style.graphicsDimension, "2d");
  for (const dimension of ["2d", "2.5d", "3d"] as const) {
    const settings = normalizeSettings({ style: { graphicsDimension: dimension } as EditStyle }, DEFAULT_SETTINGS);
    assert.equal(settings.style.graphicsDimension, dimension);
    const item = { type: "motion_graphic" as const, layout: "split" as const };
    assert.deepEqual(panelSpec(item, settings), sceneSpecFor(item, settings));
    assert.equal(sceneSpecFor(item, settings).graphicsDimension, dimension);
    assert.equal(normalizeSettings({style: {graphicsDimension: "invalid"} as unknown as EditStyle}, settings).style.graphicsDimension, dimension);
  }
});

test("cada dimensión genera el motor correcto y 3D usa tiempo absoluto", () => {
  assert.deepEqual(dimensionParts("2d", 960, 540, 4), {head:"",css:"",markup:"",timeline:"",script:""});
  const simulated = dimensionParts("2.5d", 960, 540, 4);
  assert.match(simulated.css, /perspective/);
  assert.match(simulated.timeline, /rotationY/);
  assert.equal(simulated.script, "");
  const real = dimensionParts("3d", 960, 540, 4);
  assert.match(real.head, /assets\/three\/three.module.js/);
  assert.match(real.script, /WebGLRenderer/);
  assert.match(real.script, /hf-seek/);
  assert.match(real.script, /alpha: true/);
  assert.doesNotMatch(real.script, /requestAnimationFrame|setAnimationLoop|Date.now|Math.random/);
});
