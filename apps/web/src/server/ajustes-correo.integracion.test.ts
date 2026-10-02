import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(path.resolve(import.meta.dirname, "../../../.."), true, { info() {}, error() {} }, true);
const disponible = Boolean(process.env.DATABASE_URL);
if (disponible) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("QA correo solo local.");
  const { usarBaseDeDatosDePrueba } = await import("./db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_ajustes_correo");
}
const { inArray } = await import("drizzle-orm");
const { exigirBaseDeDatosDePrueba } = await import("./db/bd-de-prueba");
const { aplicarMigraciones } = await import("./db/migrar");
const { db } = await import("./db/cliente");
const { settings } = await import("./db/esquema");
const { guardarAjustes, leerAjustes, olvidarAjustes } = await import("./ajustes");
const claves = ["correoProveedor", "smtpHost", "smtpPuerto", "smtpUsuario", "smtpSeguro"];
let previos: (typeof settings.$inferSelect)[] = [];

async function limpiarCorreo() {
  exigirBaseDeDatosDePrueba("escenara_pruebas_ajustes_correo");
  await db().delete(settings).where(inArray(settings.key, claves));
  olvidarAjustes();
}

describe.skipIf(!disponible)("la elección del correo no cambia al guardar campos de otro transporte", () => {
  beforeAll(async () => {
    await aplicarMigraciones();
    previos = await db().select().from(settings).where(inArray(settings.key, claves));
  });
  beforeEach(limpiarCorreo);
  afterAll(async () => {
    await limpiarCorreo();
    if (previos.length) await db().insert(settings).values(previos);
    olvidarAjustes();
  });

  test("Resend implícito se conserva al guardar solo un delta SMTP", async () => {
    const base = await leerAjustes();
    expect(base.correoProveedor).toBe("resend");
    const resultado = await guardarAjustes({ smtpHost: "smtp.example.test" }, null, { smtpHost: base.smtpHost });
    expect(resultado.correoProveedor).toBe("resend");
    expect(resultado.smtpHost).toBe("smtp.example.test");
    olvidarAjustes();
    expect((await leerAjustes()).correoProveedor).toBe("resend");
  });

  test("SMTP legado también queda estable al editar su configuración", async () => {
    await db().insert(settings).values({ key: "smtpHost", value: "smtp.legacy.test" });
    olvidarAjustes();
    expect((await leerAjustes()).correoProveedor).toBe("smtp");
    expect((await guardarAjustes({ smtpPuerto: 465 }, null)).correoProveedor).toBe("smtp");
  });

  test("una elección explícita prevalece sobre las filas SMTP", async () => {
    expect(
      (await guardarAjustes({ correoProveedor: "smtp", smtpHost: "smtp.example.test" }, null)).correoProveedor,
    ).toBe("smtp");
    expect((await guardarAjustes({ correoProveedor: "resend", smtpPuerto: 587 }, null)).correoProveedor).toBe("resend");
    expect((await guardarAjustes({ smtpUsuario: "alex" }, null)).correoProveedor).toBe("resend");
  });

  test("una elección concurrente no se sobrescribe con una base antigua", async () => {
    const base = await leerAjustes();
    await guardarAjustes({ correoProveedor: "smtp" }, null);
    await expect(
      guardarAjustes({ correoProveedor: "resend" }, null, { correoProveedor: base.correoProveedor }),
    ).rejects.toThrow("Otro administrador");
    expect((await leerAjustes()).correoProveedor).toBe("smtp");
  });
});
