import { describe, expect, it } from "bun:test";
import { claveDeConfirmacion, renovarClaveTrasFallo } from "./comparativas";

/**
 * La clave de la confirmación de una comparativa A/B en el navegador: la misma mientras se confirma lo mismo (un doble
 * clic o un reintento tras un corte de red no cobran dos veces) y nueva tras un error del servidor (si no, el servidor
 * respondería siempre «esa confirmación ya se intentó» y el botón quedaría en bucle).
 */
describe("clave de la confirmación de una comparativa", () => {
  let n = 0;
  const nueva = () => `clave-${++n}`;

  it("repetir lo mismo manda la misma clave", () => {
    const primera = claveDeConfirmacion(null, "2 ejecuciones|88", 0, nueva);
    expect(claveDeConfirmacion(primera, "2 ejecuciones|88", 0, nueva).valor).toBe(primera.valor);
  });

  it("confirmar otra cosa estrena clave", () => {
    const primera = claveDeConfirmacion(null, "2 ejecuciones|88", 0, nueva);
    expect(claveDeConfirmacion(primera, "2 ejecuciones|90", 0, nueva).valor).not.toBe(primera.valor);
  });

  it("tras un error del servidor la siguiente pulsación lleva clave nueva; tras un fallo de red, la misma", () => {
    const primera = claveDeConfirmacion(null, "2 ejecuciones|88", 0, nueva);
    // 409 «no cabe»: el servidor contestó, así que se sube el intento.
    const intentoTrasError = renovarClaveTrasFallo({}) ? 1 : 0;
    expect(claveDeConfirmacion(primera, "2 ejecuciones|88", intentoTrasError, nueva).valor).not.toBe(primera.valor);
    // Sin conexión: no se sabe si llegó; la misma clave evita el doble cobro.
    const intentoTrasRed = renovarClaveTrasFallo({ red: true }) ? 1 : 0;
    expect(claveDeConfirmacion(primera, "2 ejecuciones|88", intentoTrasRed, nueva).valor).toBe(primera.valor);
  });
});

describe("respuestas que no dicen si la petición llegó", () => {
  it("un 502, 503 o 504 del proxy y una respuesta sin JSON conservan la clave", async () => {
    const { respuestaSinCerteza } = await import("./comparativas");
    for (const estado of [502, 503, 504]) expect(respuestaSinCerteza(estado, true)).toBe(true);
    expect(respuestaSinCerteza(500, false)).toBe(true);
    // Un 409 o un 400 con su error son respuestas de Escenara: la siguiente confirmación es otra.
    expect(respuestaSinCerteza(409, true)).toBe(false);
    expect(respuestaSinCerteza(400, true)).toBe(false);
  });
});
