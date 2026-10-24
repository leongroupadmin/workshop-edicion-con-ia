import assert from "node:assert/strict";
import { test } from "node:test";
import { ESTIRAR_MAX, ajusteBroll } from "./partido";

test("B-roll más largo que la voz: se corta, sin estirar ni congelar", () => {
  assert.deepEqual(ajusteBroll(30, 26), { estirar: 1, congelarS: 0 });
  assert.deepEqual(ajusteBroll(26, 26), { estirar: 1, congelarS: 0 });
});

test("B-roll un poco más corto: se estira apenas y cubre toda la voz", () => {
  const r = ajusteBroll(25, 27);
  assert.ok(r.estirar > 1 && r.estirar <= ESTIRAR_MAX);
  assert.ok(Math.abs(25 * r.estirar - 27) < 1e-9);
  assert.equal(r.congelarS, 0);
});

test("B-roll mucho más corto: se estira el máximo y el resto queda quieto", () => {
  const r = ajusteBroll(20, 30);
  assert.equal(r.estirar, ESTIRAR_MAX);
  assert.ok(Math.abs(20 * ESTIRAR_MAX + r.congelarS - 30) < 1e-9);
});

test("un B-roll sin duración es un error", () => {
  assert.throws(() => ajusteBroll(0, 10));
});
