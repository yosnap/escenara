import { describe, expect, test } from "bun:test";
import { leerFotosElegidas, leerProductoElegido } from "./eleccion";

const PRODUCTO = "0f8fad5b-d9cb-469f-a165-70867728950e";
const FOTO_A = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const FOTO_B = "16fd2706-8baf-433b-82eb-8c7fada847da";

describe("las fotos elegidas del producto que llegan del navegador", () => {
  test("sin elección no hay nada que leer", () => {
    expect(leerFotosElegidas(undefined)).toEqual([]);
    expect(leerFotosElegidas(null)).toEqual([]);
    expect(leerFotosElegidas([])).toEqual([]);
  });

  test("se leen sin repetir y sin mayúsculas", () => {
    expect(leerFotosElegidas([FOTO_A, FOTO_B.toUpperCase(), FOTO_A])).toEqual([FOTO_A, FOTO_B]);
  });

  test("lo que no es una lista de identificadores se rechaza con su causa", () => {
    expect(() => leerFotosElegidas("no-es-una-lista")).toThrow("no son válidas");
    expect(() => leerFotosElegidas([FOTO_A, "no-es-un-uuid"])).toThrow("no es válida");
    expect(() => leerFotosElegidas(Array.from({ length: 9 }, () => FOTO_A))).toThrow("como máximo 8");
    expect(() => leerFotosElegidas([42])).toThrow("no es válida");
  });

  test("el producto elegido las lleva solo cuando hay alguna", () => {
    expect(leerProductoElegido({ productoId: PRODUCTO, accion: "sostenerlo" })).toEqual({
      productoId: PRODUCTO,
      accion: "sostenerlo",
    });
    expect(leerProductoElegido({ productoId: PRODUCTO, accion: "sostenerlo", fotos: [FOTO_A] })).toEqual({
      productoId: PRODUCTO,
      accion: "sostenerlo",
      fotos: [FOTO_A],
    });
  });

  test("sin producto se ignoran las fotos: no hay de qué elegir", () => {
    expect(leerProductoElegido({ productoId: "", accion: "", fotos: [FOTO_A] })).toEqual({
      productoId: "",
      accion: "",
    });
  });
});
