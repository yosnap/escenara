import { describe, expect, test } from "bun:test";
import type { AnguloVista, BriefVista, OfertaVista } from "./anuncio";
import {
  type AnguloParaVariante,
  camposDeOferta,
  declaracionNecesariaEn,
  elegidosNoElegibles,
  faltaDeclaracion,
  firmaDeVariantes,
  motivoParaNoCrearVariantes,
  opcionalesVacios,
  tituloDeVariante,
  totalDeVariantes,
} from "./anuncio-pantalla";

/**
 * Las cuentas de la pantalla del brief: el total que se confirma, si hace falta declarar veracidad y qué campos de
 * la oferta van a quedarse callados.
 *
 * Todas son puras a propósito: lo que el usuario tiene delante antes de pulsar se prueba sin base de datos, sin red
 * y sin montar la página.
 */

const angulo = (clave: string, exigeDeclaracion = false): AnguloVista => ({
  clave,
  nombre: clave,
  definicion: "",
  porDondeEntra: "",
  ejemplo: "",
  exigeDeclaracion,
});

const paraVariante = (clave: string, elegible: boolean, exigeDeclaracion = false): AnguloParaVariante => ({
  angulo: angulo(clave, exigeDeclaracion),
  elegible,
  motivo: elegible ? "" : "Ya hay un anuncio de este grupo con este ángulo.",
  exigeDeclaracion,
});

const oferta = (campos: Partial<OfertaVista> = {}): OfertaVista => ({
  id: "o",
  productoId: "p",
  productoNombre: "Champú",
  queSeDa: "Un bote de 300 ml",
  precio: "",
  garantia: "",
  urgencia: "",
  bonus: "",
  creado: "2026-09-28T10:00:00.000Z",
  ...campos,
});

describe("los campos de la oferta", () => {
  test("los cuatro opcionales salen siempre, y los vacíos se pueden nombrar", () => {
    const campos = camposDeOferta(oferta({ precio: "19,90 €" }));
    expect(campos.map((c) => c.clave)).toEqual(["precio", "garantia", "urgencia", "bonus"]);
    expect(campos[0]?.valor).toBe("19,90 €");
    expect(opcionalesVacios(oferta({ precio: "19,90 €" }))).toEqual(["Garantía", "Urgencia", "Regalo incluido"]);
  });

  test("un campo con solo espacios está vacío: no se dirá nada de eso en el guion", () => {
    expect(opcionalesVacios(oferta({ garantia: "   " }))).toContain("Garantía");
  });

  test("sin oferta, los cuatro están vacíos", () => {
    expect(opcionalesVacios(null)).toHaveLength(4);
  });
});

describe("la declaración de veracidad del brief", () => {
  const brief = (parcial: Partial<BriefVista>): BriefVista => ({
    proyectoId: "p",
    productoId: null,
    productoNombre: "",
    publico: "",
    versionMejor: "",
    angulo: "",
    anguloVista: null,
    ofertaId: null,
    oferta: null,
    notas: "",
    declaracionRegistrada: false,
    actualizado: "",
    ...parcial,
  });

  test("falta cuando el ángulo la exige y no hay ninguna registrada", () => {
    expect(faltaDeclaracion(brief({ anguloVista: angulo("mecanismo", true) }))).toBe(true);
  });

  test("no falta si ya está registrada, ni si el ángulo no la exige, ni sin brief", () => {
    expect(faltaDeclaracion(brief({ anguloVista: angulo("mecanismo", true), declaracionRegistrada: true }))).toBe(
      false,
    );
    expect(faltaDeclaracion(brief({ anguloVista: angulo("identidad") }))).toBe(false);
    expect(faltaDeclaracion(null)).toBe(false);
  });
});

describe("el total de una tanda de variantes", () => {
  test("es el coste de una por las elegidas, y sin ninguna no se confirma nada", () => {
    expect(totalDeVariantes(12, ["a", "b", "c"])).toBe(36);
    expect(totalDeVariantes(12, [])).toBe(0);
  });

  test("la declaración se pide si alguna de las elegidas afirma algo comprobable", () => {
    const angulos = [paraVariante("identidad", true), paraVariante("mecanismo", true, true)];
    expect(declaracionNecesariaEn(angulos, ["identidad"])).toBe(false);
    expect(declaracionNecesariaEn(angulos, ["identidad", "mecanismo"])).toBe(true);
  });

  test("un ángulo elegido que ya no se puede pedir se nombra", () => {
    const angulos = [paraVariante("identidad", true), paraVariante("mecanismo", false)];
    expect(elegidosNoElegibles(angulos, ["identidad", "mecanismo"])).toEqual(["mecanismo"]);
  });
});

describe("lo que impide crear las variantes", () => {
  const angulos = [paraVariante("identidad", true), paraVariante("mecanismo", true, true), paraVariante("ya", false)];

  test("sin ángulos elegidos, lo dice y no deja pulsar", () => {
    expect(motivoParaNoCrearVariantes(angulos, [], 12, false)).toContain("al menos un ángulo");
  });

  test("por encima del máximo, dice el máximo y cuántas se han elegido", () => {
    const motivo = motivoParaNoCrearVariantes(angulos, ["a", "b", "c"], 2, false);
    expect(motivo).toContain("2 variantes");
    expect(motivo).toContain("has elegido 3");
  });

  test("un elegido que ya no se puede pedir se nombra en el motivo", () => {
    expect(motivoParaNoCrearVariantes(angulos, ["identidad", "ya"], 12, false)).toContain("ya");
  });

  test("con un ángulo que afirma algo comprobable, sin declaración no se puede", () => {
    expect(motivoParaNoCrearVariantes(angulos, ["mecanismo"], 12, false)).toContain("declaración de veracidad");
    expect(motivoParaNoCrearVariantes(angulos, ["mecanismo"], 12, true)).toBe("");
  });

  test("con todo en orden no hay impedimento", () => {
    expect(motivoParaNoCrearVariantes(angulos, ["identidad"], 12, false)).toBe("");
  });
});

describe("la firma de la confirmación agregada", () => {
  test("no cambia por el orden en que se marcaron los ángulos: es la misma tanda", () => {
    expect(firmaDeVariantes("sello", 36, ["c", "a", "b"])).toBe(firmaDeVariantes("sello", 36, ["a", "b", "c"]));
  });

  test("cambia si cambia el precio, el total o los ángulos: entonces es otra confirmación", () => {
    expect(firmaDeVariantes("sello", 36, ["a"])).not.toBe(firmaDeVariantes("otro", 36, ["a"]));
    expect(firmaDeVariantes("sello", 36, ["a"])).not.toBe(firmaDeVariantes("sello", 24, ["a"]));
    expect(firmaDeVariantes("sello", 36, ["a"])).not.toBe(firmaDeVariantes("sello", 36, ["a", "b"]));
  });
});

describe("el título del hermano", () => {
  test("es el del proyecto de partida con su ángulo detrás", () => {
    expect(tituloDeVariante("Champú de verano", "Mecanismo")).toBe("Champú de verano · Mecanismo");
  });

  test("se recorta como la columna, para que lo confirmado sea lo que se verá", () => {
    expect(tituloDeVariante("t".repeat(300), "Mecanismo")).toHaveLength(200);
  });
});
