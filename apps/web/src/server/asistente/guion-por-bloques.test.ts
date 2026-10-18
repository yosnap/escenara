import { describe, expect, test } from "bun:test";
import { gastoDeLasLlamadas } from "./guion-por-bloques";

/**
 * La cuenta prudente de lo gastado en un guion, que decide si la siguiente llamada cabe en lo confirmado: lo que
 * costó cada llamada que contestó, y una llamada entera por cada intento fallido que pudo cobrar.
 */
describe("gasto acumulado del guion", () => {
  const intento = (cobro: "sin-cobro" | "se-desconoce" | "cobrado") => ({
    proveedor: "KIE.ai",
    modelo: "m",
    codigo: "error-proveedor" as const,
    cobro,
  });

  test("suma lo que costó cada llamada", () => {
    expect(
      gastoDeLasLlamadas(
        [
          { creditos: 1.5, intentos: [] },
          { creditos: 2, intentos: [] },
        ],
        2,
      ),
    ).toBe(3.5);
  });

  test("un intento que pudo cobrar cuenta como una llamada entera; uno sin cobro, nada", () => {
    expect(gastoDeLasLlamadas([{ creditos: 0, intentos: [intento("se-desconoce"), intento("sin-cobro")] }], 2)).toBe(2);
  });
});
