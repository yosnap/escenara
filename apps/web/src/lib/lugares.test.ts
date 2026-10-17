import { describe, expect, test } from "bun:test";
import * as lugares from "./lugares";

/**
 * Para usar las fotos de un lugar no se pide el permiso de quien gestiona el sitio, ni en un interior ni en un
 * exterior, ni con fotos reales ni generadas. Lo que se declara es **una** cosa: que esas imágenes se pueden usar,
 * porque no son de un sitio donde esté prohibido fotografiar.
 */
describe("declaración de un lugar: puedo usar estas imágenes", () => {
  test("la casilla dice qué se declara, con un ejemplo de sitio prohibido", () => {
    expect(lugares.DECLARACION_PUEDO_USAR).toContain("Puedo usar estas imágenes");
    expect(lugares.DECLARACION_PUEDO_USAR).toContain("prohibido fotografiar");
    expect(lugares.AYUDA_PUEDO_USAR.length).toBeGreaterThan(20);
  });

  test("el rechazo dice la causa y qué hacer", () => {
    expect(lugares.RECHAZO_SIN_PUEDO_USAR).toContain("prohibido fotografiar");
  });

  test("ya no existe el requisito del permiso de quien gestiona el sitio", () => {
    expect("exigePermisoDelLugar" in lugares).toBe(false);
    expect("AVISO_INTERIOR" in lugares).toBe(false);
  });

  test("el texto de la declaración estrena versión, que es lo que separa las declaraciones antiguas", () => {
    expect(lugares.VERSION_TEXTO_DECLARACION_LUGAR >= lugares.VERSION_DESDE_PUEDO_USAR).toBe(true);
    expect("2026-09-30.2" < lugares.VERSION_DESDE_PUEDO_USAR).toBe(true);
  });
});
