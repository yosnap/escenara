import { describe, expect, test } from "bun:test";
import { abreConPrimeraImagen, rutaConPrimeraImagen } from "./primera-imagen";

describe("paso de la primera imagen", () => {
  test("la ruta de la ficha recién creada lleva el paso", () => {
    expect(rutaConPrimeraImagen("/lugares/l1")).toBe("/lugares/l1?primera-imagen=1");
  });

  test("se abre solo si se pide y la ficha no tiene ninguna imagen", () => {
    expect(abreConPrimeraImagen("1", 0)).toBe(true);
    expect(abreConPrimeraImagen("1", 2)).toBe(false);
    expect(abreConPrimeraImagen(null, 0)).toBe(false);
    expect(abreConPrimeraImagen("0", 0)).toBe(false);
  });
});
