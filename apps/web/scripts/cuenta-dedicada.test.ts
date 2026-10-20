import { describe, expect, test } from "bun:test";
import { esCuentaDedicada, rutaDeAcceso } from "./cuenta-dedicada";

const ID = "0b4f3c2e-1d5a-4e6f-9a8b-7c6d5e4f3a2b";

describe("cuenta dedicada", () => {
  test("lo es si su acceso está en alguna de las carpetas dedicadas", () => {
    const rutas = new Set([rutaDeAcceso("/r", "tutoriales", ID)]);
    expect(esCuentaDedicada("/r", ID, undefined, (r) => rutas.has(r))).toBe(true);
  });

  test("no lo es si no hay acceso guardado, aunque exista en otra carpeta", () => {
    const rutas = new Set([rutaDeAcceso("/r", "produccion", ID)]);
    expect(esCuentaDedicada("/r", ID, undefined, (r) => rutas.has(r))).toBe(false);
  });

  test("rechaza identificadores que no son UUID, para no salir de docs/privado", () => {
    expect(() => rutaDeAcceso("/r", "demos", "../../etc")).toThrow();
  });
});
