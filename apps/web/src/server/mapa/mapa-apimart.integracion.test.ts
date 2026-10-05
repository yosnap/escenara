import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { respuestaGrabada } from "../proveedores/compatible/fixtures";

/**
 * Mezcla **KIE + APIMart** en el mapa de modelos de vídeo (0.52.0, ADR-0044).
 *
 * **Ningún test sale a la red ni gasta un crédito**: KIE y APIMart se simulan con respuestas grabadas (el
 * saldo de APIMart es el de la API real del 2026-10-04). Lo que se fija es lo que decide **con quién se paga**:
 *
 * - con credencial de ambos, el mapa de vídeo ofrece modelos de KIE **y** de APIMart;
 * - sin mapa propio, manda KIE (el predeterminado) y APIMart queda detrás (`predeterminado: false`);
 * - un mapa mixto se resuelve **en el orden que eligió el usuario** (APIMart de principal, KIE de reserva);
 * - sin la clave de APIMart, sus entradas no se usan y la pantalla dice por qué.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_mapa_apimart");
}

const { and, eq } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { providerCredentials, users } = await import("../db/esquema");
const { guardarCredencial } = await import("../boveda/credenciales");
const { olvidarCatalogo } = await import("../proveedores/catalogo");
const { guardarMapa, mapaVista, opcionesDe, recomendadasDe, resolverMapa } = await import("./mapa");
type Buscador = import("../proveedores/codigos").Buscador;

const CLAVE_KIE = "sk-kie-ana-inventada-ffffff";
const CLAVE_APIMART = "sk-apimart-ana-inventada-aaaaaa";

/** Simula los dos proveedores: el saldo de KIE y el de APIMart (API real, 2026-10-04). */
const buscar: Buscador = async (url) => {
  if (url.includes("/user/balance")) {
    return respuestaGrabada({ success: true, code: 0, remain_balance: 5.42, remain_credits: 54.2 });
  }
  if (url.includes("/chat/credit")) {
    return respuestaGrabada({ code: 200, msg: "success", data: 5000 });
  }
  throw new Error(`URL no simulada: ${url}`);
};

describe.skipIf(!hayBaseDeDatos)("mapa de vídeo: mezcla KIE + APIMart", () => {
  type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
  let ana: Sesion;

  beforeAll(async () => {
    await aplicarMigraciones();
  });

  beforeEach(async () => {
    ana = await crearSesionDePrueba("user");
    await guardarCredencial(ana.id, "kie", CLAVE_KIE, buscar);
    await guardarCredencial(ana.id, "apimart", CLAVE_APIMART, buscar);
    olvidarCatalogo();
  });

  afterEach(async () => {
    await db().delete(users).where(eq(users.id, ana.id));
  });

  test("con clave de ambos, el mapa de vídeo ofrece modelos de KIE y de APIMart", async () => {
    const opciones = (await opcionesDe(ana.id, "video")).map((o) => `${o.proveedor}:${o.modelo}`);
    expect(opciones).toEqual(
      expect.arrayContaining([
        "kie:veo3_fast",
        "apimart:veo3.1-lite-ext",
        "apimart:gemini-omni-1.1-flash-ext",
        "apimart:MiniMax-Hailuo-2.3-Fast",
      ]),
    );
  });

  test("sin mapa propio, manda KIE (el predeterminado) y APIMart queda detrás", async () => {
    const recomendadas = await recomendadasDe("video");
    expect(recomendadas.length).toBeGreaterThan(0);
    expect(recomendadas[0]?.proveedor).toBe("kie");
    const orden = recomendadas.map((e) => e.proveedor);
    expect(orden.indexOf("kie")).toBeLessThan(orden.indexOf("apimart"));
  });

  test("un mapa mixto se resuelve en el orden elegido: APIMart de principal, KIE de reserva", async () => {
    await guardarMapa(ana.id, "video", [
      { proveedor: "apimart", compatibleId: null, modelo: "veo3.1-lite-ext" },
      { proveedor: "kie", compatibleId: null, modelo: "veo3_lite" },
    ]);
    const resueltas = await resolverMapa(ana.id, "video");
    expect(resueltas).toHaveLength(2);
    expect(resueltas[0]).toMatchObject({ proveedor: "apimart", modelo: "veo3.1-lite-ext" });
    expect(resueltas[1]).toMatchObject({ proveedor: "kie", modelo: "veo3_lite" });
    // La principal lleva su clave (descifrada) y el nombre visible de cada proveedor.
    expect(resueltas[0]?.nombreProveedor).toBe("APIMart");
    expect(resueltas[0]?.clave).toBe(CLAVE_APIMART);
    expect(resueltas[1]?.clave).toBe(CLAVE_KIE);

    const vista = await mapaVista(ana.id, "video");
    expect(vista.propio).toBe(true);
    expect(vista.entradas.map((e) => e.proveedor)).toEqual(["apimart", "kie"]);
  });

  test("sin la clave de APIMart, su entrada no se usa y la pantalla dice por qué", async () => {
    await guardarMapa(ana.id, "video", [
      { proveedor: "apimart", compatibleId: null, modelo: "veo3.1-lite-ext" },
      { proveedor: "kie", compatibleId: null, modelo: "veo3_lite" },
    ]);
    await db()
      .delete(providerCredentials)
      .where(and(eq(providerCredentials.userId, ana.id), eq(providerCredentials.provider, "apimart")));

    const resueltas = await resolverMapa(ana.id, "video");
    expect(resueltas.map((r) => r.proveedor)).toEqual(["kie"]);
    const vista = await mapaVista(ana.id, "video");
    expect(vista.entradas[0]?.utilizable).toBe(false);
    expect(vista.entradas[0]?.motivo).toContain("APIMart");
  });
});
