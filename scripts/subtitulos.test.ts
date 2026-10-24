import assert from "node:assert/strict";
import { test } from "node:test";
import { corregirPalabras, correccionesValidas } from "../app/lib/subtitulos";

const w = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs, confidence: 0.9 });
const frase = [w("mi", 4521, 4700), w("clon", 4700, 4900), w("de", 4900, 5021), w("guía,", 5021, 5301), w("y", 5301, 5400)];

test("cambia la palabra y conserva tiempos y la coma", () => {
  const r = corregirPalabras(frase, { find: "mi clon de guía", replace: "mi clon de IA" });
  assert.equal(r.cambios, 1);
  assert.deepEqual(r.words.map((x) => x.text), ["mi", "clon", "de", "IA,", "y"]);
  assert.equal(r.words[3].startMs, 5021);
  assert.equal(r.words[3].endMs, 5301);
});

test("sin importar mayúsculas ni tildes, y con distinta cantidad de palabras reparte el tiempo", () => {
  const r = corregirPalabras(frase, { find: "GUIA", replace: "inteligencia artificial" });
  assert.equal(r.cambios, 1);
  assert.deepEqual(r.words.slice(3, 5).map((x) => x.text), ["inteligencia", "artificial,"]);
  assert.equal(r.words[3].startMs, 5021);
  assert.equal(r.words[4].endMs, 5301);
  assert.equal(r.words.length, 6);
});

test("si no encuentra la frase no toca nada", () => {
  const r = corregirPalabras(frase, { find: "clon de voz", replace: "clon de IA" });
  assert.equal(r.cambios, 0);
  assert.deepEqual(r.words, frase);
});

test("descarta correcciones vacías o mal formadas", () => {
  assert.deepEqual(correccionesValidas([{ find: " guía ", replace: "IA" }, { find: "", replace: "x" }, "hola", null]), [{ find: "guía", replace: "IA" }]);
  assert.deepEqual(correccionesValidas(undefined), []);
});
