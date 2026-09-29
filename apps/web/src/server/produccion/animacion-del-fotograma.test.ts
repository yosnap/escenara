import { describe, expect, it } from "bun:test";
import type { FilaTrabajo } from "../db/esquema";
import { animacionDelFotograma } from "./animacion-del-fotograma";

describe("animación tras regenerar un fotograma", () => {
  it("ignora el fallo del clip anterior y conserva el del fotograma actual", () => {
    const anterior = { id: "clip-anterior", parentJobId: "foto-anterior", state: "fallido" } as FilaTrabajo;
    expect(animacionDelFotograma("foto-nueva", anterior)).toBeNull();

    const actual = { id: "clip-actual", parentJobId: "foto-nueva", state: "fallido" } as FilaTrabajo;
    expect(animacionDelFotograma("foto-nueva", actual)).toBe(actual);
    expect(animacionDelFotograma("foto-nueva", null)).toBeNull();
  });
});
