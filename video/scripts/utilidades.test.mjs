// Pruebas de la lógica pura de los scripts: similitud de transcripciones,
// corte de la sílaba arrastrada por el clon de voz y troceo de subtítulos.
// Ejecutar: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { corteEstructural, leerGuion, similitud } from "./comun.mjs";
import { equilibrar, MAX_LINEA, trocear } from "./subtitulos.mjs";

test("similitud: ignora mayúsculas, tildes y puntuación", () => {
  assert.equal(similitud("Esto es Escenara.", "esto es escenara"), 1);
  assert.equal(similitud("Guión", "guion"), 1);
});

test("similitud: penaliza palabras de más o de menos", () => {
  const conSobrante = similitud("Adiós. Crear vídeos con personajes", "Crear vídeos con personajes");
  const cortada = similitud("Esto es", "Esto es Escenara");
  assert.ok(conSobrante < 1 && conSobrante > 0.8);
  assert.ok(cortada < 0.9);
  assert.equal(similitud("", "algo"), 0);
});

// Envolvente sintética en dB por ventanas de 20 ms
const env = (...tramos) => tramos.flatMap(([db, n]) => Array(n).fill(db));

test("corte: detecta una sílaba corta seguida de hueco y corta 60 ms antes de la voz", () => {
  // silencio 0,1 s · sílaba 0,3 s · hueco 0,5 s · voz real
  const e = env([-70, 5], [-12, 15], [-55, 25], [-10, 80]);
  assert.equal(corteEstructural(e), (45 - 3) * 0.02);
});

test("corte: no corta si el primer tramo sonoro es largo (es la frase real)", () => {
  const e = env([-70, 5], [-12, 60], [-55, 10], [-10, 50]);
  assert.equal(corteEstructural(e), null);
});

test("corte: no corta si no hay hueco claro tras el inicio", () => {
  assert.equal(corteEstructural(env([-12, 120])), null);
  assert.equal(corteEstructural(env([-80, 120])), null);
});

test("subtítulos: cada bloque cabe en dos líneas de 42 y conserva el texto", () => {
  for (const e of leerGuion().escenas) {
    const bloques = trocear(e.subtitulo);
    assert.equal(bloques.flat().join(" "), e.subtitulo, e.id);
    for (const b of bloques) {
      const lineas = equilibrar(b).split("\n");
      assert.ok(lineas.length <= 2, `${e.id}: más de dos líneas`);
      for (const l of lineas) assert.ok(l.length <= MAX_LINEA, `${e.id}: «${l}» supera ${MAX_LINEA}`);
    }
  }
});

test("subtítulos: un bloque muy corto se une al siguiente", () => {
  assert.deepEqual(
    trocear("Escenara. Da vida a cada escena.").map((b) => b.join(" ")),
    ["Escenara. Da vida a cada escena."],
  );
});

test("subtítulos: una línea imposible de partir se rechaza con un error claro", () => {
  assert.throws(() => equilibrar(["x".repeat(50)]), /No cabe en dos líneas/);
});
