import { describe, expect, test } from "bun:test";
import type { ProductoResumen } from "@/lib/productos";
import { pideMarca } from "./use-marca-del-producto";

const producto = (id: string, marcaVisible: boolean) => ({ id, marcaVisible }) as unknown as ProductoResumen;

/** La casilla de la marca solo se pide si el producto tiene marca declarada; si no se sabe, se pide. */
describe("casilla de la marca según el producto", () => {
  const lista = [producto("con", true), producto("sin", false)];

  test("sin producto no se pide", () => {
    expect(pideMarca("", lista)).toBe(false);
  });

  test("con marca declarada se pide y sin ella no", () => {
    expect(pideMarca("con", lista)).toBe(true);
    expect(pideMarca("sin", lista)).toBe(false);
  });

  test("mientras no se sabe (lista sin cargar o producto que no aparece) se pide: es el lado seguro", () => {
    expect(pideMarca("sin", null)).toBe(true);
    expect(pideMarca("otro", lista)).toBe(true);
  });
});
