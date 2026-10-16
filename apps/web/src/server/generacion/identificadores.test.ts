import { expect, test } from "bun:test";
import { uuidOpcional } from "./identificadores";

test("un identificador opcional vacío cuenta como ausente y uno mal formado se rechaza con 400", () => {
  const id = crypto.randomUUID();
  expect(uuidOpcional(id, "personaje")).toBe(id);
  for (const ausente of [undefined, null, ""]) expect(uuidOpcional(ausente, "personaje")).toBeNull();
  for (const malo of ["no-es-un-uuid", 42, {}, ["x"]]) {
    let error: unknown = null;
    try {
      uuidOpcional(malo, "personaje");
    } catch (e) {
      error = e;
    }
    expect((error as { estado?: number } | null)?.estado).toBe(400);
    expect((error as Error).message).toBe("Ese personaje no es válido.");
  }
});
