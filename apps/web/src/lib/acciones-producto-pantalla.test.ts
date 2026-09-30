import { describe, expect, test } from "bun:test";
import {
  accionEstaPlegada,
  FAMILIAS_PLEGADAS,
  masAccionesAbierto,
  masAccionesSePuedeCerrar,
  resumenAccionElegida,
  seccionesMontadas,
} from "./acciones-producto-pantalla";

const ACCIONES = [
  { clave: "abrirlo", nombre: "Abrirlo" },
  { clave: "moda-giro-360", nombre: "Giro de 360 grados" },
  { clave: "skincare-extender", nombre: "Extender el producto" },
];

describe("qué familias de acciones se pliegan", () => {
  test("moda y cuidado de la piel van plegadas; la general, no", () => {
    expect(FAMILIAS_PLEGADAS).toEqual(["moda", "skincare"]);
  });

  test("una acción general o ninguna no abre «Más acciones»", () => {
    expect(accionEstaPlegada("")).toBe(false);
    expect(accionEstaPlegada("abrirlo")).toBe(false);
    expect(masAccionesAbierto(false, "abrirlo")).toBe(false);
  });

  test("una acción de moda o de piel lo abre sola", () => {
    expect(accionEstaPlegada("moda-giro-360")).toBe(true);
    expect(accionEstaPlegada("skincare-extender")).toBe(true);
    expect(masAccionesAbierto(false, "skincare-extender")).toBe(true);
  });

  test("la persona lo abre aunque la acción sea general", () => {
    expect(masAccionesAbierto(true, "abrirlo")).toBe(true);
    expect(masAccionesAbierto(true, "")).toBe(true);
  });

  test("con una acción de esa familia elegida no se puede cerrar, haya hecho lo que haya hecho la persona", () => {
    expect(masAccionesAbierto(false, "moda-giro-360")).toBe(true);
    expect(masAccionesSePuedeCerrar("moda-giro-360")).toBe(false);
    expect(masAccionesSePuedeCerrar("skincare-extender")).toBe(false);
    expect(masAccionesSePuedeCerrar("abrirlo")).toBe(true);
    expect(masAccionesSePuedeCerrar("")).toBe(true);
  });

  test("cambiar la acción por otra vía reabre el bloque: no queda estado fijado", () => {
    // La persona lo cerró (false) y luego llega una acción de moda (otro producto, dirección guardada).
    expect(masAccionesAbierto(false, "abrirlo")).toBe(false);
    expect(masAccionesAbierto(false, "moda-pasarela")).toBe(true);
  });
});

describe("qué partes se montan", () => {
  const PARTES = ["moda", "skincare"];

  test("cerrado no se monta ninguna: el grupo solo tiene radios visibles", () => {
    expect(seccionesMontadas(PARTES, false)).toEqual([]);
  });

  test("abierto se montan todas", () => {
    expect(seccionesMontadas(PARTES, true)).toEqual(PARTES);
  });
});

describe("el resumen «Elegida»", () => {
  test("dice el nombre de la acción elegida, sea de la familia que sea", () => {
    expect(resumenAccionElegida("abrirlo", ACCIONES)).toBe("Elegida: Abrirlo");
    expect(resumenAccionElegida("moda-giro-360", ACCIONES)).toBe("Elegida: Giro de 360 grados");
  });

  test("sin acción dice que la decide el modelo", () => {
    expect(resumenAccionElegida("", ACCIONES)).toContain("ninguna");
  });

  test("una clave que ya no está en el catálogo no rompe: se enseña tal cual", () => {
    expect(resumenAccionElegida("retirada", ACCIONES)).toBe("Elegida: retirada");
  });
});
