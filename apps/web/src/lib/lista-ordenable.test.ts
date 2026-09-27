import { describe, expect, it } from "bun:test";
import { mismoOrden, moverEnLista } from "./lista-ordenable";

describe("moverEnLista", () => {
  it("lleva un elemento a otra posición y conserva el resto del orden", () => {
    expect(moverEnLista(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moverEnLista(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moverEnLista(["a", "b", "c"], 1, 2)).toEqual(["a", "c", "b"]);
  });

  it("no altera la lista original", () => {
    const original = ["a", "b", "c"];
    expect(moverEnLista(original, 0, 2)).not.toBe(original);
    expect(original).toEqual(["a", "b", "c"]);
  });

  it("devuelve el mismo orden si el destino es el origen o está fuera de rango", () => {
    expect(moverEnLista(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
    expect(moverEnLista(["a", "b", "c"], 1, 3)).toEqual(["a", "b", "c"]);
    expect(moverEnLista(["a", "b", "c"], -1, 0)).toEqual(["a", "b", "c"]);
    expect(moverEnLista([], 0, 0)).toEqual([]);
  });
});

describe("mismoOrden", () => {
  it("distingue un orden cambiado de uno idéntico", () => {
    expect(mismoOrden(["a", "b"], ["a", "b"])).toBe(true);
    expect(mismoOrden(["a", "b"], ["b", "a"])).toBe(false);
    expect(mismoOrden(["a", "b"], ["a"])).toBe(false);
  });
});
