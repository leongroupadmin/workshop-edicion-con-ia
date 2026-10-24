import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COLA_S,
  FPS,
  VELOCIDAD_MAX,
  VELOCIDAD_MIN,
  NIVELES,
  ajustarConSilencios,
  calcularAnclas,
  calcularPiezas,
  desfases,
  emparejar,
  normalizar,
  type Nivel,
  type Palabra,
} from "./sincro";

const TEXTO =
  "Pero si tu empresa sigue teniendo los contactos repartidos entre WhatsApp planillas y mensajes sin responder la IA no te está ahorrando tiempo te está sumando más tareas En León Group construimos sistemas de marketing y ventas".split(
    " ",
  );

/** Palabras con un ritmo fijo; `pausas` = { índice de palabra: ms de silencio ANTES de esa palabra }. */
const hablar = (textos: string[], msPorPalabra: number, pausas: Record<number, number> = {}): Palabra[] => {
  let t = 0;
  return textos.map((text, i) => {
    t += pausas[i] ?? 0;
    const w = { text, startMs: t, endMs: t + msPorPalabra * 0.8 };
    t += msPorPalabra;
    return w;
  });
};

test("normalizar compara palabras sin tildes, signos ni mayúsculas", () => {
  assert.equal(normalizar("¿Querés,"), "queres");
  assert.equal(normalizar("LEÓN."), "leon");
  assert.equal(normalizar("Comentá"), normalizar("comenta"));
});

test("emparejar tolera palabras cambiadas o salteadas", () => {
  const a = hablar(["hola", "che", "como", "andas", "hoy"], 400);
  const b = hablar(["Hola", "cómo", "andás", "vos", "hoy"], 400);
  assert.deepEqual(emparejar(a, b), [
    [0, 0],
    [2, 1],
    [3, 2],
    [4, 4],
  ]);
});

test("la pausa larga de Kie (unión entre clips) se corta y cada tramo con voz queda dentro de la velocidad permitida", () => {
  // Kie habla más lento y hace una pausa de 2,6 s en la unión; Cartesia va de corrido.
  const kie = hablar(TEXTO, 450, { 24: 2600 });
  const cart = hablar(TEXTO, 400);
  const { anclas, emparejadas, esPausa } = calcularAnclas(kie, cart);
  assert.equal(emparejadas, TEXTO.length);
  const piezas = calcularPiezas(anclas, esPausa);
  // El video final dura lo que la voz de Cartesia más la cola.
  const frames = piezas.reduce((a, p) => a + p.frames, 0);
  const esperado = Math.round((cart.at(-1)!.endMs / 1000 + COLA_S) * FPS);
  assert.ok(Math.abs(frames - esperado) <= 1, `${frames} cuadros, se esperaban ${esperado}`);
  // La pausa de Kie no aparece en ningún tramo del video final.
  const inicioPausa = kie[23].endMs / 1000 + 0.2;
  const finPausa = kie[24].startMs / 1000 - 0.2;
  assert.ok(!piezas.some((p) => p.ini < finPausa && p.fin > inicioPausa), "la pausa sigue en el video");
  // Los tramos con voz no se aceleran ni frenan de más.
  for (let k = 1; k < anclas.length; k++) {
    const [a, b] = [anclas[k - 1], anclas[k]];
    if (esPausa(a, b)) continue;
    const f = (b[1] - a[1]) / (b[0] - a[0]);
    assert.ok(f >= VELOCIDAD_MIN - 1e-9 && f <= VELOCIDAD_MAX + 1e-9, `tramo con velocidad ${f}`);
  }
  // Cada palabra cae casi donde suena en Cartesia.
  const e = desfases(kie, cart, anclas);
  assert.ok(e[Math.floor(e.length / 2)] < 60, `desfase mediano ${e[Math.floor(e.length / 2)]} ms`);
});

test("si Kie cambió una palabra, el resto igual se sincroniza", () => {
  const otro = [...TEXTO];
  otro[10] = "Instagram";
  const kie = hablar(otro, 430);
  const cart = hablar(TEXTO, 400);
  const { emparejadas } = calcularAnclas(kie, cart);
  assert.equal(emparejadas, TEXTO.length - 1);
  const piezas = calcularPiezas(calcularAnclas(kie, cart).anclas);
  assert.ok(piezas.length > 3);
});

test("si las dos voces dicen cosas distintas, avisa en vez de armar cualquier cosa", () => {
  assert.throws(
    () => calcularAnclas(hablar(TEXTO, 400), hablar("nada que ver con lo que dijo el video de antes".split(" "), 400)),
    /muy distintas/,
  );
});

test("los silencios reales corrigen dónde termina la palabra antes de una pausa", () => {
  // Whisper estiró "tareas" hasta tapar el silencio y empezó "En" antes de tiempo.
  const palabras: Palabra[] = [
    { text: "más", startMs: 0, endMs: 300 },
    { text: "tareas.", startMs: 300, endMs: 1400 },
    { text: "En", startMs: 1450, endMs: 1700 },
  ];
  const r = ajustarConSilencios(palabras, [{ startMs: 900, endMs: 1600 }]);
  assert.equal(r[1].endMs, 900);
  assert.equal(r[2].startMs, 1600);
  // Un silencio muy corto (respiración) no cambia nada, y la lista original no se toca.
  assert.deepEqual(ajustarConSilencios(palabras, [{ startMs: 900, endMs: 980 }]), palabras);
  assert.equal(palabras[1].endMs, 1400);
});

test("cada nivel de sincronización respeta su margen de velocidad y los más altos ajustan más fino", () => {
  // Ritmos distintos palabra por palabra: Kie acelera y frena, Cartesia va parejo.
  const kie = TEXTO.map((text, i) => ({ text, startMs: i * 430 + (i % 3) * 90, endMs: i * 430 + (i % 3) * 90 + 300 }));
  const cart = hablar(TEXTO, 400);
  const p90 = (n: Nivel) => {
    const nivel = NIVELES[n];
    const { anclas, esPausa } = calcularAnclas(kie, cart, nivel);
    for (let k = 1; k < anclas.length; k++) {
      const [a, b] = [anclas[k - 1], anclas[k]];
      if (esPausa(a, b)) continue;
      const f = (b[1] - a[1]) / (b[0] - a[0]);
      assert.ok(f >= nivel.vmin - 1e-9 && f <= nivel.vmax + 1e-9, `nivel ${n}: tramo con velocidad ${f}`);
    }
    assert.ok(calcularPiezas(anclas, esPausa, nivel.vmin).length > 0);
    const e = desfases(kie, cart, anclas);
    return e[Math.floor(e.length * 0.9)];
  };
  assert.ok(p90(3) <= p90(1), `Máxima ${p90(3)} ms contra Suave ${p90(1)} ms`);
});
