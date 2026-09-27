import { describe, expect, test } from "bun:test";
import {
  type ConsentimientoEfectivo,
  consentimientoVigente,
  estadoDePersonaje,
  impedimentosDePersonaje,
  personajePuedeGenerar,
} from "./estado";

/**
 * La regla que decide si la cara de alguien sale hacia un proveedor. Se prueba sin base de datos a propósito:
 * es una función pura y conviene que cada caso quede escrito.
 */

const consentimiento = (parcial: Partial<ConsentimientoEfectivo> = {}): ConsentimientoEfectivo => ({
  titular: "yo",
  aceptado: null,
  revocado: false,
  ...parcial,
});

const datos = (parcial: Partial<Parameters<typeof estadoDePersonaje>[0]> = {}) => ({
  consentimiento: consentimiento(),
  referencias: 3,
  minimoReferencias: 3,
  ...parcial,
});

describe("vigencia del consentimiento", () => {
  test("«soy yo» y «animal propio» valen sin revisión", () => {
    expect(consentimientoVigente(consentimiento({ titular: "yo" }))).toBe(true);
    expect(consentimientoVigente(consentimiento({ titular: "animal_propio" }))).toBe(true);
  });

  test("un tercero no vale hasta que la revisión lo acepta", () => {
    expect(consentimientoVigente(consentimiento({ titular: "tercero", aceptado: null }))).toBe(false);
    expect(consentimientoVigente(consentimiento({ titular: "tercero", aceptado: false }))).toBe(false);
    expect(consentimientoVigente(consentimiento({ titular: "tercero", aceptado: true }))).toBe(true);
  });

  test("sin consentimiento, o revocado, nunca vale", () => {
    expect(consentimientoVigente(null)).toBe(false);
    expect(consentimientoVigente(consentimiento({ revocado: true }))).toBe(false);
    // Ni siquiera uno de tercero ya aceptado: la revocación manda sobre la revisión.
    expect(consentimientoVigente(consentimiento({ titular: "tercero", aceptado: true, revocado: true }))).toBe(false);
  });
});

describe("estado del personaje", () => {
  test("sin consentimiento es borrador y no genera", () => {
    const sinConsentimiento = datos({ consentimiento: null });
    expect(estadoDePersonaje(sinConsentimiento)).toBe("borrador");
    expect(personajePuedeGenerar(sinConsentimiento)).toBe(false);
    expect(impedimentosDePersonaje(sinConsentimiento)[0]).toContain("Falta registrar el consentimiento");
  });

  test("con consentimiento propio y referencias suficientes está listo", () => {
    expect(estadoDePersonaje(datos())).toBe("listo");
    expect(personajePuedeGenerar(datos())).toBe(true);
    expect(impedimentosDePersonaje(datos())).toEqual([]);
  });

  test("por debajo del mínimo de referencias sigue en borrador y dice cuántas faltan", () => {
    const pocas = datos({ referencias: 1, minimoReferencias: 3 });
    expect(estadoDePersonaje(pocas)).toBe("borrador");
    expect(personajePuedeGenerar(pocas)).toBe(false);
    expect(impedimentosDePersonaje(pocas)[0]).toContain("Faltan 2 fotos");
  });

  test("un tercero sin revisar queda en revisión y no genera", () => {
    const enRevision = datos({ consentimiento: consentimiento({ titular: "tercero" }) });
    expect(estadoDePersonaje(enRevision)).toBe("en_revision");
    expect(personajePuedeGenerar(enRevision)).toBe(false);
    expect(impedimentosDePersonaje(enRevision)[0]).toContain("espera la revisión");
  });

  test("revocar o rechazar bloquea, aunque las referencias sobren", () => {
    const revocado = datos({ consentimiento: consentimiento({ revocado: true }), referencias: 10 });
    expect(estadoDePersonaje(revocado)).toBe("bloqueado");
    expect(personajePuedeGenerar(revocado)).toBe(false);
    const rechazado = datos({ consentimiento: consentimiento({ titular: "tercero", aceptado: false }) });
    expect(estadoDePersonaje(rechazado)).toBe("bloqueado");
    expect(impedimentosDePersonaje(rechazado)[0]).toContain("rechazado");
  });

  test("un tercero aceptado con referencias suficientes sí genera", () => {
    const listo = datos({ consentimiento: consentimiento({ titular: "tercero", aceptado: true }) });
    expect(estadoDePersonaje(listo)).toBe("listo");
    expect(personajePuedeGenerar(listo)).toBe(true);
  });
});
