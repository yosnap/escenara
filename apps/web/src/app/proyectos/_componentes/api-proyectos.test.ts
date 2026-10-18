import { describe, expect, test } from "bun:test";
import { renovarClaveTrasFallo } from "@/lib/comparativas";
import { leerRespuesta } from "./api-proyectos";

/**
 * Pedir un guion gasta dinero: solo se estrena clave de idempotencia cuando Escenara ha terminado de responder. Un
 * 502, 503 o 504 del proxy, o una respuesta sin JSON, no dice si el servidor siguió trabajando detrás.
 */
describe("respuesta de la API de proyectos", () => {
  test("un 502, 503 o 504 se trata como sin certeza y conserva la clave", () => {
    for (const estado of [502, 503, 504]) {
      const resultado = leerRespuesta(estado, false, { error: "Bad gateway" });
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) {
        expect(resultado.red).toBe(true);
        expect(renovarClaveTrasFallo(resultado)).toBe(false);
      }
    }
  });

  test("una respuesta sin JSON tampoco da certeza", () => {
    const resultado = leerRespuesta(500, false, null);
    expect(!resultado.ok && resultado.red).toBe(true);
  });

  test("un error que Escenara termina de responder (409, 400) renueva la clave", () => {
    const resultado = leerRespuesta(409, false, { error: "Ya tiene escenas en producción." });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).toBe("Ya tiene escenas en producción.");
      expect(renovarClaveTrasFallo(resultado)).toBe(true);
    }
  });

  test("una respuesta correcta devuelve los datos", () => {
    expect(leerRespuesta(200, true, { id: "p1" })).toEqual({ ok: true, datos: { id: "p1" } });
  });
});
