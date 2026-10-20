import { describe, expect, test } from "bun:test";
import type { ProductoResumen } from "@/lib/productos";
import { avisoDeCoherencia, pideMarca } from "./use-producto-de-crear";

const resumen = (id: string, marcaVisible: boolean | null) =>
  ({ id, nombre: id, marcaVisible }) as unknown as ProductoResumen;

/** La casilla de la marca se pide con marca o sin responder; con un «no» explícito, no. */
describe("casilla de la marca según el producto", () => {
  test("sin producto no se pide", () => {
    expect(pideMarca("", resumen("a", true), "")).toBe(false);
  });

  test("con marca o sin responder se pide; con «no», no", () => {
    expect(pideMarca("a", resumen("a", true), "")).toBe(true);
    expect(pideMarca("a", resumen("a", null), "")).toBe(true);
    expect(pideMarca("a", resumen("a", false), "")).toBe(false);
  });

  test("sin saber nada del producto se pide: es el lado seguro", () => {
    expect(pideMarca("a", null, "")).toBe(true);
    expect(pideMarca("a", resumen("otro", false), "")).toBe(true);
  });

  test("si el servidor la ha exigido para ese producto, aparece aunque la ficha dijera que no", () => {
    expect(pideMarca("a", resumen("a", false), "a")).toBe(true);
    expect(pideMarca("b", resumen("b", false), "a")).toBe(false);
  });
});

describe("aviso del clip si su producto no es el del fotograma", () => {
  const conA = { productoId: "a", nombre: "Botella Ondina" };
  test("sin fotograma o con el mismo producto no hay aviso", () => {
    expect(avisoDeCoherencia(null, conA)).toBeNull();
    expect(avisoDeCoherencia(conA, conA)).toBeNull();
  });

  test("quitarlo en el clip, añadirlo o cambiarlo se explica con los nombres", () => {
    expect(avisoDeCoherencia(conA, { productoId: "", nombre: "" })).toContain(
      "El fotograma se generó con «Botella Ondina», pero en el clip no has elegido ningún producto",
    );
    expect(avisoDeCoherencia({ productoId: "", nombre: "" }, conA)).toContain(
      "El fotograma se generó sin producto y en el clip has elegido «Botella Ondina»",
    );
    expect(avisoDeCoherencia(conA, { productoId: "b", nombre: "Crema Aurora" })).toContain(
      "El fotograma se generó con «Botella Ondina» y en el clip has elegido «Crema Aurora»",
    );
  });
});
