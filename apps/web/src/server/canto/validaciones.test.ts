import { describe, expect, test } from "bun:test";
import { capacidadDelTrabajo } from "../cola/entrada-del-trabajo";
import type { FilaMedio, FilaTrabajo } from "../db/esquema";
import { exigirConfirmacion } from "../generacion/comprobaciones";
import { exigirSelloVigente } from "../generacion/precios";
import { motivoAudioIncompatible } from "./audio";
import { validarDatosDeclaracion } from "./declaracion";
import { ErrorCanto } from "./errores";

describe("declaración de derechos del audio", () => {
  test("la música licenciada exige una referencia concreta", () => {
    expect(() => validarDatosDeclaracion({ tipo: "licenciada", aceptado: true })).toThrow(ErrorCanto);
    expect(() => validarDatosDeclaracion({ tipo: "licenciada", aceptado: true })).toThrow(/referencia de la licencia/);
    expect(validarDatosDeclaracion({ tipo: "licenciada", referenciaLicencia: "  LIC-2048  ", aceptado: true })).toEqual(
      {
        tipo: "licenciada",
        referencia: "LIC-2048",
      },
    );
  });

  test("solo acepta las tres afirmaciones expresas y no inventa uso legítimo", () => {
    expect(() => validarDatosDeclaracion({ tipo: "uso_legitimo", aceptado: true })).toThrow(ErrorCanto);
    expect(() => validarDatosDeclaracion({ tipo: "propia", aceptado: false })).toThrow(ErrorCanto);
    expect(validarDatosDeclaracion({ tipo: "hablado_propio", aceptado: true, referenciaLicencia: "ignorar" })).toEqual({
      tipo: "hablado_propio",
      referencia: "",
    });
  });
});

describe("audio compatible con el modelo de canto", () => {
  const medio = (mimeType: string, sizeBytes: number) => ({ mimeType, sizeBytes }) as FilaMedio;

  test("InfiniteTalk limita el audio a 10 MB y a los formatos publicados", () => {
    expect(motivoAudioIncompatible(medio("audio/mpeg", 9 * 1024 * 1024), "infinitalk/from-audio")).toBeNull();
    expect(motivoAudioIncompatible(medio("audio/mpeg", 11 * 1024 * 1024), "infinitalk/from-audio")).toContain("10 MB");
    expect(motivoAudioIncompatible(medio("audio/webm", 1024), "infinitalk/from-audio")).toContain("audio/webm");
  });

  test("Kling admite el límite de su modelo, sin heredar el de InfiniteTalk", () => {
    expect(motivoAudioIncompatible(medio("audio/mpeg", 11 * 1024 * 1024), "kling/v1-avatar-standard")).toBeNull();
  });
});

test("un clip cantado usa la capacidad de audio y confirma el importe y sello exactos", () => {
  // La lectura solo usa estos dos campos; el resto de la fila pertenece a la persistencia.
  const trabajo = { kind: "animacion", input: { canto: true } } as unknown as FilaTrabajo;
  expect(capacidadDelTrabajo(trabajo)).toBe("audio_to_video");
  expect(capacidadDelTrabajo({ ...trabajo, input: {} })).toBe("image_to_video");
  expect(() => exigirConfirmacion(23, 24)).toThrow(/ahora son 24 créditos/);
  expect(() => exigirConfirmacion(24, 24)).not.toThrow();
  expect(() => exigirSelloVigente("anterior", "vigente", true)).toThrow(/precio.*cambiado/);
  expect(() => exigirSelloVigente("vigente", "vigente", true)).not.toThrow();
});
