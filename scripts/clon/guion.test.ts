import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PALABRAS_POR_SEGUNDO,
  armarBloques,
  contarPalabras,
  faltanGanchoOCta,
  maxPalabras,
  partirGuion,
  promptBloque,
} from "../../app/lib/clon/guion";
import { MODELOS, type ClonModelo } from "../../app/lib/clon/types";
import { textosDeRespuesta } from "./guion-ia";

const GUIONES = {
  corto: "Hola. Esto es una prueba.",
  dosBloques:
    "Hola, soy el personaje de prueba y estoy midiendo si el labial sincroniza bien con el texto. Este es el segundo bloque, pegado justo después, para ver cuánto se nota la unión entre los dos clips.",
  largo: Array.from(
    { length: 14 },
    (_, i) => `Esta es la frase número ${i + 1} del guion, que cuenta algo importante sobre el producto y por qué te conviene.`,
  ).join(" "),
  sinPuntos: Array.from({ length: 90 }, (_, i) => `palabra${i}`).join(" "),
  conComas:
    "Cuando arrancás un negocio, cuando tenés poco tiempo, cuando no sabés por dónde empezar, cuando todos te dicen algo distinto, cuando la plata no alcanza, lo único que importa es dar el primer paso hoy mismo sin esperar.",
  parrafos: "Primera idea del video.\n\n   Segunda idea, con   espacios raros.\nTercera idea y cierre!",
};

const normalizar = (t: string) => t.replace(/\s+/g, " ").trim();

const MODELOS_LISTA = Object.keys(MODELOS) as ClonModelo[];

for (const modelo of MODELOS_LISTA) {
  const reglas = MODELOS[modelo].bloque;
  const kie = MODELOS[modelo].duracionKie;
  const fijas: readonly number[] | undefined = "fijas" in kie ? kie.fijas : undefined;
  for (const [nombre, guion] of Object.entries(GUIONES)) {
    test(`${modelo} · guion ${nombre}: cada bloque dura lo que el modelo acepta y el texto entra`, () => {
      const bloques = armarBloques(partirGuion(guion, reglas), "Plano medio", reglas);
      assert.ok(bloques.length > 0);
      for (const b of bloques) {
        // Una duración que Kie acepta para ESTE modelo.
        assert.ok(Number.isInteger(b.segundos), `${b.segundos} s no es entero`);
        assert.ok(b.segundos >= kie.min && b.segundos <= kie.max, `${b.segundos} s fuera de ${kie.min}-${kie.max}`);
        if (fijas) assert.ok(fijas.includes(b.segundos), `${b.segundos} s no está en ${fijas.join("/")}`);
        assert.ok(b.segundos >= reglas.min && b.segundos <= reglas.max);
        const n = contarPalabras(b.texto);
        assert.ok(n > 0);
        assert.ok(n <= maxPalabras(reglas), `${n} palabras en un bloque`);
        assert.ok(n <= b.segundos * PALABRAS_POR_SEGUNDO, `${n} palabras no entran en ${b.segundos} s`);
        assert.equal(b.estado, "pendiente");
      }
      // No se pierde ni se cambia ninguna palabra, y quedan en orden.
      assert.equal(bloques.map((b) => b.texto).join(" "), normalizar(guion));
      assert.deepEqual(
        bloques.map((b) => b.id),
        bloques.map((_, i) => `b${i + 1}`),
      );
    });
  }
}

const GEMINI = MODELOS["gemini-omni-video"].bloque;
const GROK = MODELOS["grok-imagine/image-to-video"].bloque;

test("Gemini: 16 segundos de guion quedan en dos bloques de 8 s", () => {
  const bloques = armarBloques(partirGuion(GUIONES.dosBloques, GEMINI), "x", GEMINI);
  assert.deepEqual(
    bloques.map((b) => b.segundos),
    [8, 8],
  );
});

test("Grok: clips más largos que Gemini (menos uniones), hasta 15 s y con un segundo de aire", () => {
  const cortas = Array.from({ length: 12 }, (_, i) => `Esta es la idea número ${i + 1} del video de hoy.`).join(" ");
  const grok = armarBloques(partirGuion(cortas, GROK), "x", GROK);
  const gemini = armarBloques(partirGuion(cortas, GEMINI), "x", GEMINI);
  assert.ok(grok.length < gemini.length, `${grok.length} clips de Grok contra ${gemini.length} de Gemini`);
  for (const b of grok) {
    assert.ok(b.segundos <= 15);
    assert.ok(b.segundos >= Math.ceil(contarPalabras(b.texto) / PALABRAS_POR_SEGUNDO) + 1);
  }
  // Un texto corto no baja del mínimo de Grok (6 s).
  assert.equal(armarBloques(["Hola."], "x", GROK)[0].segundos, 6);
});

test("los bloques salen parejos: nada de un bloque lleno y otro con dos palabras", () => {
  for (const r of [GEMINI, GROK]) {
    const tam = armarBloques(partirGuion(GUIONES.largo, r), "x", r).map((b) => contarPalabras(b.texto));
    assert.ok(Math.min(...tam) >= 8, `bloque muy corto: ${tam.join(", ")}`);
  }
});

test("un bloque editado que quedó largo se parte en varios", () => {
  const bloques = armarBloques([GUIONES.largo, "Cierre."], "x", GEMINI);
  assert.ok(bloques.length > 2);
  assert.ok(bloques.every((b) => contarPalabras(b.texto) <= maxPalabras(GEMINI)));
  assert.equal(bloques.at(-1)!.texto, "Cierre.");
  assert.equal(armarBloques(["   ", ""], "x", GEMINI).length, 0);
});

test("el pedido a Kie lleva el encuadre y el texto exacto entre comillas", () => {
  const p = promptBloque(
    { texto: 'Hola, "mundo".', encuadre: "Plano medio, cámara fija" },
    { descripcion: "Mujer de 30 años", acento: "cordobes", restricciones: ["subtitulos", "musica"] },
  );
  assert.match(p, /^Plano medio, cámara fija\./);
  assert.match(p, /Mujer de 30 años\./);
  assert.match(p, /tonada cordobesa/);
  // Sin energía elegida (personajes viejos): entusiasta.
  assert.match(p, /con entusiasmo y energía/);
  assert.match(p, /"Hola, 'mundo'\."/);
  assert.match(p, /El video va sin subtítulos, sin música de fondo\./);
  assert.doesNotMatch(p, /Solo se escucha su voz/);
  // Personaje guardado antes de que existieran: rioplatense y todas las restricciones.
  const viejo = promptBloque({ texto: "Hola.", encuadre: "" }, { descripcion: "" });
  assert.match(viejo, /^Plano medio de la persona/);
  assert.match(viejo, /rioplatense/);
  assert.match(viejo, /sin motion graphics/);
  assert.match(viejo, /misma postura corporal/);
  assert.match(viejo, /Solo se escucha su voz\.$/);
  // Sin restricciones tildadas no se agrega nada; "otro" usa lo que escribió el usuario.
  const libre = promptBloque({ texto: "Hola.", encuadre: "x" }, { descripcion: "", acento: "otro", acentoOtro: "rosarino", restricciones: [] });
  assert.match(libre, /con acento rosarino/);
  assert.match(promptBloque({ texto: "Hola.", encuadre: "x" }, { descripcion: "", energia: "tranquilo" }), /con calma/);
  assert.doesNotMatch(libre, /El video va/);
});

test("para Grok el pedido va en inglés, con la foto citada y lo que dice en español", () => {
  const p = promptBloque(
    { texto: "Hola, ¿cómo andás?", encuadre: "" },
    { descripcion: "", acento: "cordobes", restricciones: ["musica", "sonidos", "subtitulos"] },
    { en: true },
  );
  assert.match(p, /^@image1 Medium shot of the person/);
  assert.match(p, /speaks in Spanish with a Cordoba, Argentina accent/);
  assert.match(p, /with enthusiasm and energy/);
  assert.match(
    promptBloque({ texto: "Hola.", encuadre: "" }, { descripcion: "", energia: "energico" }, { en: true }),
    /with a lot of energy and passion/,
  );
  assert.match(p, /says exactly these words, without adding or removing any: "Hola, ¿cómo andás\?"/);
  assert.match(p, /No background music, no sound effects or added noises, no subtitles or captions\./);
  assert.match(p, /Only their voice is heard\.$/);
});

test("la respuesta de la IA se lee aunque venga en un bloque de código", () => {
  assert.deepEqual(textosDeRespuesta('```json\n{"bloques":["Uno.","Dos."]}\n```'), ["Uno.", "Dos."]);
  assert.deepEqual(textosDeRespuesta('{"bloques":[{"texto":"Uno."}]}'), ["Uno."]);
  assert.throws(() => textosDeRespuesta('{"bloques":[]}'));
  assert.throws(() => textosDeRespuesta('{"bloques":[""]}'));
});

test("gancho y CTA: se aceptan tal cual, sin importar signos ni mayúsculas", () => {
  const textos = ["¿Sabías que el 80 % de los anuncios pierden plata? Te cuento por qué.", "Escribime INFO y te cuento cómo."];
  assert.deepEqual(faltanGanchoOCta(textos, "¿Sabías que el 80% de los anuncios pierden plata?", "escribime info y te cuento como"), []);
  assert.deepEqual(faltanGanchoOCta(textos), []);
});

test("gancho y CTA: avisa cuál cambió la IA", () => {
  const textos = ["Mirá esto: el 80 % de los anuncios pierden plata.", "Escribime y te cuento."];
  assert.deepEqual(faltanGanchoOCta(textos, "¿Sabías que el 80 % de los anuncios pierden plata?", "Escribime INFO y te cuento."), [
    "el gancho",
    "el CTA",
  ]);
});
