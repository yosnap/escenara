import { expect, test } from "bun:test";
import { esDocumentoLegal } from "@/app/legal/textos";
import { AJUSTES_LEGALES_POR_DEFECTO, identidadLegalCompleta, VALIDACION_LEGALES } from "./ajustes-legales";

test("identifica la configuración pendiente sin inventar un titular", () => {
  expect(identidadLegalCompleta(AJUSTES_LEGALES_POR_DEFECTO)).toBe(false);
  expect(
    identidadLegalCompleta({
      ...AJUSTES_LEGALES_POR_DEFECTO,
      legalTitular: "Titular de prueba",
      legalNif: "NIF de prueba",
      legalDomicilio: "Dirección de prueba",
      legalCorreo: "privacidad@ejemplo.test",
    }),
  ).toBe(true);
});
test("limita campos publicados y rechaza correo peligroso o inválido", () => {
  expect(VALIDACION_LEGALES.legalCorreo.valido("a@ejemplo.test")).toBe(true);
  expect(VALIDACION_LEGALES.legalCorreo.valido("javascript:alert(1)")).toBe(false);
  expect(VALIDACION_LEGALES.legalCorreo.valido("a@ejemplo.test\nBcc:otra@ejemplo.test")).toBe(false);
  expect(VALIDACION_LEGALES.legalTitular.valido("a".repeat(201))).toBe(false);
});
test("las rutas legales usan una lista cerrada, también frente a claves de prototipo", () => {
  expect(esDocumentoLegal("cookies")).toBe(true);
  expect(esDocumentoLegal("privacidad")).toBe(true);
  expect(esDocumentoLegal("constructor")).toBe(false);
  expect(esDocumentoLegal("__proto__")).toBe(false);
});
