import { describe, expect, test } from "bun:test";
import {
  type ContextoFallo,
  esCausaFalloProveedor,
  etiquetaDelFallo,
  MENSAJE_FALLO_GENERICO,
  mensajeDeFalloDelProveedor,
} from "./causa-fallo";
import { ETIQUETA_MOTIVO_FALLO } from "./generacion";

const OMNI: ContextoFallo = {
  proveedor: "KIE",
  modelo: "Gemini Omni 1.1 Flash",
  creditos: 0,
  conProducto: true,
  conPersonaje: true,
};

describe("mensaje del fallo del proveedor", () => {
  test("el bloqueo de seguridad dice quién, que no se ha cobrado y qué probar", () => {
    expect(mensajeDeFalloDelProveedor("bloqueo_seguridad", OMNI)).toBe(
      "El filtro de seguridad de Gemini Omni 1.1 Flash, en KIE, bloqueó la generación (no se ha cobrado nada). No dice qué le ha disgustado. Prueba a: quitar el producto o usar menos fotos suyas, cambiar la descripción o generar con otro modelo.",
    );
  });

  test("sin producto no sugiere quitarlo", () => {
    const mensaje = mensajeDeFalloDelProveedor("bloqueo_seguridad", { ...OMNI, conProducto: false });
    expect(mensaje).not.toContain("producto");
    expect(mensaje).toContain("Prueba a: cambiar la descripción o generar con otro modelo.");
  });

  test("dice lo que se ha cobrado cuando el proveedor cobra el intento, o que no ha informado", () => {
    expect(mensajeDeFalloDelProveedor("bloqueo_seguridad", { ...OMNI, creditos: 12 })).toContain(
      "el proveedor ha cobrado 12 créditos por el intento",
    );
    expect(mensajeDeFalloDelProveedor("saturado", { ...OMNI, creditos: 1 })).toContain("1 crédito por el intento");
    expect(mensajeDeFalloDelProveedor("limite", { ...OMNI, creditos: null })).toContain(
      "el proveedor no ha informado de ningún cobro",
    );
  });

  test("la imagen rechazada solo sugiere las fotos que el envío llevaba", () => {
    expect(mensajeDeFalloDelProveedor("imagen_rechazada", OMNI)).toContain(
      "elegir otras fotos del producto, revisar las fotos del personaje en su ficha o generar con otro modelo",
    );
    const suelta = mensajeDeFalloDelProveedor("imagen_rechazada", { ...OMNI, conProducto: false, conPersonaje: false });
    expect(suelta).toContain("Prueba a: generar con otro modelo.");
  });

  test("lo desconocido sigue con el mensaje genérico de siempre", () => {
    expect(mensajeDeFalloDelProveedor("desconocida", OMNI)).toBe(MENSAJE_FALLO_GENERICO);
    expect(MENSAJE_FALLO_GENERICO).toBe(
      "El proveedor no ha podido completar la generación. No se ha vuelto a enviar nada.",
    );
  });
});

describe("etiqueta del fallo", () => {
  test("con causa conocida se ve la causa; sin causa o desconocida, la etiqueta de siempre", () => {
    expect(etiquetaDelFallo("contenido", "bloqueo_seguridad")).toBe(
      "El filtro de seguridad del proveedor bloqueó la generación",
    );
    expect(etiquetaDelFallo("contenido", null)).toBe(ETIQUETA_MOTIVO_FALLO.contenido);
    expect(etiquetaDelFallo("contenido", "desconocida")).toBe(ETIQUETA_MOTIVO_FALLO.contenido);
    expect(etiquetaDelFallo("saldo", null)).toBe(ETIQUETA_MOTIVO_FALLO.saldo);
  });

  test("solo se aceptan causas de la lista", () => {
    expect(esCausaFalloProveedor("bloqueo_seguridad")).toBe(true);
    expect(esCausaFalloProveedor("Request blocked")).toBe(false);
    expect(esCausaFalloProveedor(null)).toBe(false);
  });
});
