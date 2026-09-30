import { describe, expect, test } from "bun:test";
import {
  accionEstaPlegada,
  FAMILIAS_PLEGADAS,
  masAccionesAbierto,
  resumenAccionElegida,
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
    expect(masAccionesAbierto(null, "abrirlo")).toBe(false);
  });

  test("una acción de moda o de piel lo abre sola", () => {
    expect(accionEstaPlegada("moda-giro-360")).toBe(true);
    expect(accionEstaPlegada("skincare-extender")).toBe(true);
    expect(masAccionesAbierto(null, "skincare-extender")).toBe(true);
  });

  test("lo que decide la persona manda sobre la acción elegida", () => {
    expect(masAccionesAbierto(true, "abrirlo")).toBe(true);
    expect(masAccionesAbierto(false, "moda-giro-360")).toBe(false);
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
