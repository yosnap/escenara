import { describe, expect, test } from "bun:test";
import {
  esFormatoDeDos,
  esFormatoReparto,
  esLadoReparto,
  esMiradaReparto,
  esPapelReparto,
  FORMATOS_REPARTO,
  ladoOpuesto,
  MAXIMO_PERSONAJES_REPARTO,
  miradaCruzada,
  porDefectoDelReparto,
} from "./reparto";

/**
 * Los valores por defecto del reparto son **puros**: sin base de datos y sin red. Y son los que deciden que dos
 * personajes no nazcan en el mismo lado del cuadro ni mirando los dos a cámara en un podcast, que es lo que hace
 * que dos clips independientes parezcan la misma conversación.
 */

describe("valores por defecto del reparto", () => {
  test("una escena de un personaje es lo de siempre: a la izquierda, a cámara y hablando", () => {
    expect(porDefectoDelReparto("solo", 1)).toEqual({ papel: "hablante", lado: "izquierda", mirada: "camara" });
    // Posición 2 en `solo` no existe como reparto, y aun así devuelve lo de un personaje en lugar de inventarse
    // un segundo sitio: quien la pida está pidiendo algo que ese formato no tiene.
    expect(porDefectoDelReparto("solo", 2)).toEqual({ papel: "hablante", lado: "izquierda", mirada: "camara" });
  });

  test("en podcast los dos hablan, en lados distintos y con la mirada cruzada", () => {
    const primero = porDefectoDelReparto("podcast", 1);
    const segundo = porDefectoDelReparto("podcast", 2);
    expect(primero).toEqual({ papel: "hablante", lado: "izquierda", mirada: "derecha" });
    expect(segundo).toEqual({ papel: "hablante", lado: "derecha", mirada: "izquierda" });
    // Cada uno mira **al lado del otro**: es la definición de mirada cruzada.
    expect(primero.mirada).toBe(segundo.lado);
    expect(segundo.mirada).toBe(primero.lado);
  });

  test("en dualcast comparten plano: lados distintos, uno habla y el otro escucha, los dos a cámara", () => {
    const primero = porDefectoDelReparto("dualcast", 1);
    const segundo = porDefectoDelReparto("dualcast", 2);
    expect(primero).toEqual({ papel: "hablante", lado: "izquierda", mirada: "camara" });
    expect(segundo).toEqual({ papel: "acompanante", lado: "derecha", mirada: "camara" });
    expect(primero.lado).not.toBe(segundo.lado);
  });

  test("el lado opuesto y la mirada cruzada son la misma relación", () => {
    expect(ladoOpuesto("izquierda")).toBe("derecha");
    expect(ladoOpuesto("derecha")).toBe("izquierda");
    expect(miradaCruzada("izquierda")).toBe("derecha");
    expect(miradaCruzada("derecha")).toBe("izquierda");
  });

  test("solo podcast y dualcast llevan dos personajes", () => {
    expect(FORMATOS_REPARTO.filter(esFormatoDeDos)).toEqual(["podcast", "dualcast"]);
    expect(MAXIMO_PERSONAJES_REPARTO).toBe(2);
  });
});

describe("guardas de los enumerados", () => {
  test("solo pasan los valores que existen", () => {
    expect(esFormatoReparto("dualcast")).toBe(true);
    expect(esFormatoReparto("trio")).toBe(false);
    expect(esPapelReparto("acompanante")).toBe(true);
    expect(esPapelReparto("narrador")).toBe(false);
    expect(esLadoReparto("izquierda")).toBe(true);
    expect(esLadoReparto("centro")).toBe(false);
    expect(esMiradaReparto("camara")).toBe(true);
    expect(esMiradaReparto("arriba")).toBe(false);
    for (const valor of [null, undefined, 1, {}, []]) {
      expect(esFormatoReparto(valor)).toBe(false);
      expect(esLadoReparto(valor)).toBe(false);
    }
  });
});
