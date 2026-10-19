import { describe, expect, test } from "bun:test";
import { gastoDeLasLlamadas, techoDeReserva } from "./guion-por-bloques";

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

/**
 * Lo que puede costar una reserva de pago en cada trozo: lo confirmado menos lo gastado y menos lo que se aparta para
 * los trozos que faltan. Decrece a medida que se gasta, y nunca baja de 0.
 */
describe("techo de la reserva de pago", () => {
  test("con la principal por cuota, lo que queda de la reserva baja con cada trozo que escribe la de pago", () => {
    // 1 min: plan y una parte, todo por cuota, con 2 créditos de reserva confirmados.
    expect(techoDeReserva(2, 0, 1, 0)).toBe(2);
    expect(techoDeReserva(2, 1.5, 0, 0)).toBe(0.5);
  });

  test("con la principal de pago, aparta lo de los trozos que faltan para que la reserva no se lo coma", () => {
    // 3 min a 2 créditos: 4 llamadas (8) más 2 de reserva = 10. Antes del plan quedan 3 trozos por delante.
    expect(techoDeReserva(10, 0, 3, 2)).toBe(4);
    expect(techoDeReserva(10, 4, 2, 2)).toBe(2);
    expect(techoDeReserva(10, 9, 1, 2)).toBe(0);
  });
});
