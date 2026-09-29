import { describe, expect, test } from "bun:test";
import {
  duracionTotalDeFragmentos,
  type EscenaDelMontaje,
  erroresDeMontaje,
  FRAGMENTOS_MAXIMOS,
  type Fragmento,
  montajeInicial,
  SEGUNDOS_MAXIMOS_MONTAJE,
  subtitulosDeFragmento,
  subtitulosDelMontaje,
  tieneSubtitulos,
  volumenNormalizado,
} from "./montaje";

/**
 * Reglas puras de la línea de tiempo (RF08, 0.32.0). Sin base de datos y sin FFmpeg: lo que se comprueba aquí es
 * que un recorte imposible no se puede guardar y que los tiempos de los subtítulos se corren con los recortes, que
 * es de donde salen los dos fallos que arruinan un montaje en silencio.
 */

const escenas: EscenaDelMontaje[] = [
  { escenaId: "e1", orden: 1, duracionClip: 8 },
  { escenaId: "e2", orden: 2, duracionClip: 8 },
  { escenaId: "e3", orden: 3, duracionClip: null },
];

const fragmento = (escenaId: string, entrada: number, salida: number): Fragmento => ({ escenaId, entrada, salida });

describe("validación de la línea de tiempo", () => {
  test("una línea de tiempo con recortes dentro del clip no tiene errores", () => {
    expect(erroresDeMontaje([fragmento("e1", 0, 8), fragmento("e2", 1.5, 6)], escenas)).toEqual([]);
  });

  test("un montaje vacío lo dice y no lo deja pasar", () => {
    expect(erroresDeMontaje([], escenas)[0]).toContain("no tiene ningún fragmento");
  });

  test("una escena que no es del proyecto se rechaza diciendo qué fragmento es", () => {
    expect(erroresDeMontaje([fragmento("ajena", 0, 4)], escenas)[0]).toContain("no es de este proyecto");
  });

  test("una escena sin clip se rechaza diciendo cuál es", () => {
    expect(erroresDeMontaje([fragmento("e3", 0, 4)], escenas)[0]).toContain("escena 3");
  });

  test("un recorte más largo que el clip dice cuánto dura el clip de verdad", () => {
    const error = erroresDeMontaje([fragmento("e1", 0, 20)], escenas)[0] ?? "";
    expect(error).toContain("el clip de la escena 1 dura 8 s");
  });

  test("medio segundo de margen al final: un recorte hasta el final del clip vale", () => {
    expect(erroresDeMontaje([fragmento("e1", 0, 8.4)], escenas)).toEqual([]);
  });

  test("un trozo demasiado corto se rechaza", () => {
    expect(erroresDeMontaje([fragmento("e1", 1, 1.1)], escenas)[0]).toContain("dura menos de");
  });

  test("se acota el número de fragmentos y la duración total", () => {
    const muchos = Array.from({ length: FRAGMENTOS_MAXIMOS + 1 }, () => fragmento("e1", 0, 8));
    const errores = erroresDeMontaje(muchos, escenas);
    expect(errores.some((e) => e.includes(`más de ${FRAGMENTOS_MAXIMOS} fragmentos`))).toBe(true);
    expect(errores.some((e) => e.includes(`${SEGUNDOS_MAXIMOS_MONTAJE} s`))).toBe(true);
  });

  test("la duración total suma los recortes, no los clips", () => {
    expect(duracionTotalDeFragmentos([fragmento("e1", 2, 5), fragmento("e2", 0, 1.5)])).toBe(4.5);
  });

  test("la línea de tiempo propuesta deja fuera las escenas sin clip", () => {
    expect(montajeInicial(escenas)).toEqual([fragmento("e1", 0, 8), fragmento("e2", 0, 8)]);
  });
});

describe("volúmenes", () => {
  test("se recortan a la horquilla de 0 a 200 %", () => {
    expect(volumenNormalizado(-1)).toBe(0);
    expect(volumenNormalizado(5)).toBe(2);
    expect(volumenNormalizado(1.239)).toBe(1.24);
  });
});

describe("subtítulos del montaje", () => {
  const subtitulos = [
    { desde: 0, hasta: 2, texto: "Primera frase" },
    { desde: 2, hasta: 4, texto: "Segunda frase" },
    { desde: 4, hasta: 6, texto: "Tercera frase" },
  ];

  test("el recorte descarta lo que queda fuera y acorta lo que lo cruza", () => {
    const dentro = subtitulosDeFragmento(fragmento("e1", 3, 5), subtitulos);
    expect(dentro).toEqual([
      { desde: 0, hasta: 1, texto: "Segunda frase" },
      { desde: 1, hasta: 2, texto: "Tercera frase" },
    ]);
  });

  test("los tiempos se corren fragmento a fragmento con la duración recortada", () => {
    const srt = subtitulosDelMontaje(
      [fragmento("e1", 0, 2), fragmento("e2", 0, 2)],
      [
        { escenaId: "e1", subtitulos: [{ desde: 0, hasta: 1, texto: "Uno" }] },
        { escenaId: "e2", subtitulos: [{ desde: 0, hasta: 1, texto: "Dos" }] },
      ],
      "srt",
    );
    expect(srt).toContain("00:00:00,000 --> 00:00:01,000\nUno");
    // El segundo fragmento empieza donde acaba el primero: en el segundo 2, no en el 8 del clip entero.
    expect(srt).toContain("00:00:02,000 --> 00:00:03,000\nDos");
  });

  test("un montaje sin ningún subtítulo no ofrece fichero", () => {
    expect(tieneSubtitulos([fragmento("e1", 0, 2)], [{ escenaId: "e1", subtitulos: [] }])).toBe(false);
    expect(
      tieneSubtitulos([fragmento("e1", 0, 2)], [{ escenaId: "e1", subtitulos: [{ desde: 0, hasta: 1, texto: "  " }] }]),
    ).toBe(false);
  });

  test("el texto hostil sale tal cual en el fichero, sin interpretarse", () => {
    const texto = `Dice "hola"; $(rm -rf /) y 'adiós'`;
    const srt = subtitulosDelMontaje(
      [fragmento("e1", 0, 2)],
      [{ escenaId: "e1", subtitulos: [{ desde: 0, hasta: 1, texto }] }],
      "srt",
    );
    expect(srt).toContain(texto);
  });
});
