import { describe, expect, test } from "bun:test";
import { selloDelAsistente } from "./texto";

/**
 * El sello de lo que se confirma en el asistente: el modo delante y después los precios de la principal y de las
 * posibles reservas de pago. Con el modo, «NaN por cuota con KIE de reserva» y «solo KIE» no se confunden.
 */
describe("sello del asistente", () => {
  test("el modo distingue dos mapas que sellan el mismo precio de KIE", () => {
    const kie = "kie:gpt-5-6-sol:respuesta de texto@v1";
    expect(selloDelAsistente(true, "", kie)).toBe(`cuota|${kie}`);
    expect(selloDelAsistente(false, kie, "")).toBe(`pago|${kie}`);
    expect(selloDelAsistente(true, "", kie)).not.toBe(selloDelAsistente(false, kie, ""));
  });

  test("nunca está vacío, ni por cuota sin reserva de pago", () => {
    expect(selloDelAsistente(true, "", "")).toBe("cuota|");
  });

  test("con principal y reserva de pago, sella los dos precios", () => {
    expect(selloDelAsistente(false, "kie:a@v1", "kie:b@v2")).toBe("pago|kie:a@v1+kie:b@v2");
  });
});
