import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  AVISO_BOVEDA_ADMIN,
  bovedaDisponible,
  cifrar,
  descifrar,
  ErrorBoveda,
  idClaveActual,
  idClaveDe,
  leerClaves,
  pistaDe,
} from "./cifrado";

// Claves de prueba generadas al vuelo: nunca hay un secreto real en el repositorio.
const claveNueva = () => randomBytes(32).toString("base64");

const MAESTRA = claveNueva();
const OTRA = claveNueva();
const entorno = (actual?: string, anterior?: string) => ({
  ESCENARA_CLAVE_MAESTRA: actual,
  ESCENARA_CLAVE_MAESTRA_ANTERIOR: anterior,
});

const SECRETO = "sk-clave-de-prueba-que-no-existe-1234";
const CONTEXTO = "credencial:11111111-1111-1111-1111-111111111111:kie";

describe("cifrado de la bóveda", () => {
  test("ida y vuelta con el mismo contexto", () => {
    const valor = cifrar(SECRETO, CONTEXTO, entorno(MAESTRA));
    expect(valor).not.toContain(SECRETO);
    expect(descifrar(valor, CONTEXTO, entorno(MAESTRA))).toBe(SECRETO);
  });

  test("el formato es v1.<idClave>.<iv>.<tag>.<datos> en base64url", () => {
    const partes = cifrar(SECRETO, CONTEXTO, entorno(MAESTRA)).split(".");
    expect(partes).toHaveLength(5);
    expect(partes[0]).toBe("v1");
    for (const parte of partes.slice(1)) expect(parte).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test("dos cifrados del mismo secreto son distintos (iv aleatorio)", () => {
    expect(cifrar(SECRETO, CONTEXTO, entorno(MAESTRA))).not.toBe(cifrar(SECRETO, CONTEXTO, entorno(MAESTRA)));
  });

  test("un valor de otra fila no se descifra: el contexto va como AAD", () => {
    const valor = cifrar(SECRETO, "credencial:usuario-a:kie", entorno(MAESTRA));
    // Otro usuario, mismo proveedor.
    expect(() => descifrar(valor, "credencial:usuario-b:kie", entorno(MAESTRA))).toThrow(ErrorBoveda);
    // Mismo usuario, otro proveedor.
    expect(() => descifrar(valor, "credencial:usuario-a:google", entorno(MAESTRA))).toThrow(ErrorBoveda);
    // Y un ajuste de la instalación tampoco.
    expect(() => descifrar(valor, "ajuste:smtpContrasena", entorno(MAESTRA))).toThrow(ErrorBoveda);
  });

  test("con la maestra equivocada falla de forma explícita", () => {
    const valor = cifrar(SECRETO, CONTEXTO, entorno(MAESTRA));
    let capturado: unknown;
    try {
      descifrar(valor, CONTEXTO, entorno(OTRA));
    } catch (error) {
      capturado = error;
    }
    expect(capturado).toBeInstanceOf(ErrorBoveda);
    expect((capturado as ErrorBoveda).motivo).toBe("clave-desconocida");
    // El mensaje explica qué hacer y no contiene el secreto ni la clave.
    expect((capturado as ErrorBoveda).message).toContain("ESCENARA_CLAVE_MAESTRA_ANTERIOR");
    expect((capturado as ErrorBoveda).message).not.toContain(SECRETO);
    expect((capturado as ErrorBoveda).message).not.toContain(MAESTRA);
  });

  test("un valor manipulado no se descifra", () => {
    const partes = cifrar(SECRETO, CONTEXTO, entorno(MAESTRA)).split(".");
    // Cambia un bit de los datos cifrados: el tag de GCM lo detecta.
    const datos = Buffer.from(partes[4] as string, "base64url");
    datos[0] = (datos[0] as number) ^ 1;
    partes[4] = datos.toString("base64url");
    let capturado: unknown;
    try {
      descifrar(partes.join("."), CONTEXTO, entorno(MAESTRA));
    } catch (error) {
      capturado = error;
    }
    expect((capturado as ErrorBoveda).motivo).toBe("no-descifrable");
  });

  test("un valor con otro formato se rechaza", () => {
    for (const malo of ["", "texto-plano", "v2.a.b.c.d", "v1.a.b.c"]) {
      expect(() => descifrar(malo, CONTEXTO, entorno(MAESTRA))).toThrow(ErrorBoveda);
      if (malo !== "") expect(() => idClaveDe(malo)).toThrow(ErrorBoveda);
    }
  });

  describe("clave maestra", () => {
    test("sin clave la bóveda queda desactivada, no rompe el arranque", () => {
      expect(bovedaDisponible(entorno())).toBe(false);
      expect(leerClaves(entorno())).toBeNull();
    });

    test("sin clave, cifrar avisa de cómo generarla", () => {
      let capturado: unknown;
      try {
        cifrar(SECRETO, CONTEXTO, entorno());
      } catch (error) {
        capturado = error;
      }
      expect((capturado as ErrorBoveda).motivo).toBe("sin-clave");
      expect((capturado as ErrorBoveda).message).toBe(AVISO_BOVEDA_ADMIN);
      expect(AVISO_BOVEDA_ADMIN).toContain("openssl rand -base64 32");
    });

    test("una clave con formato no válido es un error de instalación", () => {
      for (const mala of ["demasiado-corta", randomBytes(16).toString("base64"), randomBytes(48).toString("base64")]) {
        expect(() => leerClaves(entorno(mala))).toThrow(ErrorBoveda);
      }
    });

    test("solo con la clave anterior también es un error", () => {
      expect(() => leerClaves(entorno(undefined, MAESTRA))).toThrow(ErrorBoveda);
    });

    test("admite base64 y base64url con el mismo resultado", () => {
      const bytes = randomBytes(32);
      const claves = [bytes.toString("base64"), bytes.toString("base64url")].map((c) => leerClaves(entorno(c)));
      expect(claves[0]?.actual.id).toBe(claves[1]?.actual.id as string);
    });

    test("el identificador de clave no revela la maestra", () => {
      const id = idClaveActual(entorno(MAESTRA));
      expect(id).toHaveLength(8);
      expect(MAESTRA).not.toContain(id);
    });

    test("la clave anterior solo sirve para descifrar; lo nuevo se cifra con la actual", () => {
      const viejo = cifrar(SECRETO, CONTEXTO, entorno(OTRA));
      const rotando = entorno(MAESTRA, OTRA);
      // Durante la rotación se lee lo viejo…
      expect(descifrar(viejo, CONTEXTO, rotando)).toBe(SECRETO);
      // …y lo nuevo ya lleva el identificador de la clave actual.
      expect(idClaveDe(cifrar(SECRETO, CONTEXTO, rotando))).toBe(idClaveActual(rotando));
      expect(idClaveDe(viejo)).not.toBe(idClaveActual(rotando));
    });
  });

  describe("pista", () => {
    test("son los cuatro últimos caracteres", () => {
      expect(pistaDe(SECRETO)).toBe("1234");
      expect(SECRETO).toEndWith(pistaDe(SECRETO));
    });

    test("un secreto corto no tiene pista: cuatro caracteres serían media contraseña", () => {
      for (const corto of ["", "a", "1234", "1234567"]) expect(pistaDe(corto)).toBe("");
      expect(pistaDe("12345678")).toBe("5678");
    });
  });
});
