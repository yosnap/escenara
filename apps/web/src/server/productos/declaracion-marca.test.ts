import { describe, expect, test } from "bun:test";
import type { FilaTrabajo } from "../db/esquema";
import {
  derechoMarcaDelTrabajo,
  fechaDeLaDeclaracionDeMarca,
  marcaAlEnviar,
  marcaExigidaDe,
} from "./declaracion-marca";

/** La declaración de marca solo se apunta cuando se exigió, y se lee como «no hacía falta» con un «no» explícito. */
const fila = (input: Record<string, unknown>, productId: string | null, brandRightsAt: Date | null) =>
  ({ input, productId, brandRightsAt }) as unknown as FilaTrabajo;

describe("declaración de marca de un trabajo", () => {
  test("se exige con marca y sin responder, no con un «no»", () => {
    expect(marcaAlEnviar({ marcaVisible: true })).toEqual({ marcaExigida: true });
    expect(marcaAlEnviar({ marcaVisible: null })).toEqual({ marcaExigida: true });
    expect(marcaAlEnviar({ marcaVisible: false })).toEqual({ marcaExigida: false });
    expect(marcaAlEnviar(null)).toEqual({});
  });

  test("la fecha solo se apunta cuando se exigió", () => {
    expect(fechaDeLaDeclaracionDeMarca({ marcaVisible: true })).toBeInstanceOf(Date);
    expect(fechaDeLaDeclaracionDeMarca({ marcaVisible: null })).toBeInstanceOf(Date);
    expect(fechaDeLaDeclaracionDeMarca({ marcaVisible: false })).toBeNull();
    expect(fechaDeLaDeclaracionDeMarca(null)).toBeNull();
  });

  test("un trabajo anterior, sin el dato, cuenta como que la exigía", () => {
    expect(marcaExigidaDe(fila({}, "p", null))).toBe(true);
    expect(marcaExigidaDe(fila({ marcaExigida: false }, "p", null))).toBe(false);
  });

  test("vista desde una versión o una conversión", () => {
    // Sin producto, o con uno declarado sin marca, no hacía falta.
    expect(derechoMarcaDelTrabajo(fila({}, null, null))).toBeNull();
    expect(derechoMarcaDelTrabajo(fila({ marcaExigida: false }, "p", null))).toBeNull();
    // Hacía falta: si se hizo o no.
    expect(derechoMarcaDelTrabajo(fila({ marcaExigida: true }, "p", new Date()))).toBe(true);
    expect(derechoMarcaDelTrabajo(fila({ marcaExigida: true }, "p", null))).toBe(false);
    expect(derechoMarcaDelTrabajo(fila({}, "p", null))).toBe(false);
  });
});
