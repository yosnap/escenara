import { describe, expect, test } from "bun:test";
import { ErrorDeTexto } from "../mapa/texto";
import { fraseDeTraduccionPorEncima } from "./traduccion";

/**
 * La traducción se confirma al precio del modelo de texto de la instalación, no al de la primera entrada del mapa.
 * Si esa entrada es de pago y más cara, no se llama, y el mensaje lo dice así: a qué precio se confirmó, qué entrada
 * cuesta más y qué hacer. Nunca «revisa el coste: verás el de la primera entrada de tu mapa», que aquí sería falso.
 */
describe("traducción con una entrada del mapa más cara que lo confirmado", () => {
  const techo = { creditos: 2, proveedor: "kie" };
  const porEncima = [{ nombreProveedor: "KIE.ai", creditos: 5, techo: 2 }];

  test("dice a qué precio se confirma, qué entrada cuesta más y qué hacer, sin cobrar nada", () => {
    const error = new ErrorDeTexto([], true, [], porEncima);
    const mensaje = error.mensaje("No se ha podido traducir tu texto al inglés", {
      porEncima: fraseDeTraduccionPorEncima(techo, error.porEncima),
    });
    expect(mensaje).toContain("La traducción del prompt se confirma al precio de KIE.ai (2 créditos)");
    expect(mensaje).toContain("la de KIE.ai (5 créditos por llamada), cuesta más");
    expect(mensaje).toContain("un servicio de cuota o un modelo que no pase de 2 créditos");
    expect(mensaje).toContain("no se ha cobrado nada");
    expect(mensaje).not.toContain("el que verás será el de la primera entrada");
    expect(error.estado).toBe(409);
  });

  test("sin entradas por encima, el mensaje es el de siempre", () => {
    const intento = { proveedor: "NaN builders", modelo: "gemma4", codigo: "limite", cobro: "sin-cobro" } as const;
    const error = new ErrorDeTexto([intento], true);
    const mensaje = error.mensaje("No se ha podido traducir", {
      porEncima: fraseDeTraduccionPorEncima(techo, error.porEncima),
    });
    expect(mensaje).not.toContain("se confirma al precio");
    expect(mensaje).toContain("NaN builders ha pedido esperar");
    expect(error.estado).toBe(502);
  });
});
