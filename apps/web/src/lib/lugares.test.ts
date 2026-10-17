import { describe, expect, test } from "bun:test";
import { exigePermisoDelLugar } from "./lugares";

/**
 * El permiso de quien gestiona el sitio protege a un sitio **real**: un interior fotografiado. Un lugar inventado, con
 * las imágenes generadas en Escenara, no tiene gestor al que pedírselo. La misma regla la aplican la ficha y el servidor.
 */
describe("permiso de quien gestiona el sitio", () => {
  test("un interior con fotos reales lo exige, sean tuyas o de otra persona", () => {
    expect(exigePermisoDelLugar("interior", "propias")).toBe(true);
    expect(exigePermisoDelLugar("interior", "con_permiso")).toBe(true);
  });

  test("un lugar generado aquí no lo exige, ni interior ni exterior", () => {
    expect(exigePermisoDelLugar("interior", "generadas")).toBe(false);
    expect(exigePermisoDelLugar("exterior", "generadas")).toBe(false);
  });

  test("un exterior no lo exige", () => {
    expect(exigePermisoDelLugar("exterior", "propias")).toBe(false);
  });

  test("con un origen que no se entiende se exige: ante la duda, es una foto real", () => {
    expect(exigePermisoDelLugar("interior", "otra-cosa")).toBe(true);
  });
});
