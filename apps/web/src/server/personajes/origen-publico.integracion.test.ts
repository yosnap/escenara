import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);
const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_origen_publico");
}

const { POST } = await import("@/app/api/personajes/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");

describe.skipIf(!hayBaseDeDatos)("crear un personaje tras el proxy de producción", () => {
  let sesion: Awaited<ReturnType<typeof crearSesionDePrueba>>;

  beforeAll(async () => {
    await aplicarMigraciones();
    sesion = await crearSesionDePrueba("user");
  });

  afterAll(async () => {
    await sesion?.borrar();
  });

  const pedir = (origen?: string) =>
    new Request("http://0.0.0.0:3021/api/personajes", {
      method: "POST",
      headers: {
        cookie: sesion.cookie,
        "content-type": "application/json",
        ...(origen ? { origin: origen } : {}),
      },
      body: JSON.stringify({ nombre: "Personaje tras proxy", tipo: "persona" }),
    });

  test("la ruta autenticada crea una persona con el origen público configurado", async () => {
    const origen = new URL(process.env.BETTER_AUTH_URL ?? "http://0.0.0.0:3021").origin;
    const respuesta = await POST(pedir(origen), undefined);
    expect(respuesta.status).toBe(201);
    expect(await respuesta.json()).toMatchObject({ nombre: "Personaje tras proxy", tipo: "persona" });
  });

  test("la misma sesión no permite crear desde otra web ni sin Origin", async () => {
    for (const origen of ["https://atacante.test", undefined]) {
      const respuesta = await POST(pedir(origen), undefined);
      expect(respuesta.status).toBe(403);
    }
  });
});
