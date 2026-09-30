import { describe, expect, it } from "bun:test";
import { PASO_ORDEN_DE_GRUPO, renumerarGrupo } from "./orden-de-grupo";

const GRUPO = ["a", "b", "c", "d"];

describe("renumerarGrupo", () => {
  it("numera de 10 en 10 desde 10, en el orden recibido y sin empates", () => {
    const nuevo = renumerarGrupo(GRUPO, ["c", "a", "d", "b"]);
    expect(nuevo).toEqual([
      { id: "c", orden: 10 },
      { id: "a", orden: 20 },
      { id: "d", orden: 30 },
      { id: "b", orden: 40 },
    ]);
    expect(new Set(nuevo.map((n) => n.orden)).size).toBe(GRUPO.length);
    expect(PASO_ORDEN_DE_GRUPO).toBe(10);
  });

  it("rechaza un identificador que no es del grupo", () => {
    expect(() => renumerarGrupo(GRUPO, ["a", "b", "c", "otro"])).toThrow("no es de este grupo");
  });

  it("rechaza un orden incompleto", () => {
    expect(() => renumerarGrupo(GRUPO, ["a", "b", "c"])).toThrow("todos los elementos del grupo");
  });

  it("rechaza repetidos y lo que no es una lista de textos", () => {
    expect(() => renumerarGrupo(GRUPO, ["a", "a", "b", "c"])).toThrow("repite");
    expect(() => renumerarGrupo(GRUPO, "abcd")).toThrow("lista de identificadores");
    expect(() => renumerarGrupo(GRUPO, ["a", 2, "c", "d"])).toThrow("lista de identificadores");
  });
});
