import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Orden de las plantillas (por capacidad) y de los presets (por categoría) de la instalación: al soltar, **una**
 * acción recibe el orden completo del grupo, comprueba que son exactamente sus elementos y lo renumera de 10 en 10
 * en una transacción. Las acciones exigen el rol de administrador contra la base de datos.
 *
 * Ningún test llama a un proveedor. Al terminar se devuelve el orden que había, porque la base de datos de prueba
 * sobrevive entre ejecuciones y otros ficheros leen ese orden.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);
process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_presets");
}

/** Cookie de la sesión que «hace» la petición. Sin ella, se usan las cabeceras reales de Next. */
let cookieActual: string | null = null;
const reales = await import("next/headers");
mock.module("next/headers", () => ({
  ...reales,
  headers: async () => (cookieActual === null ? reales.headers() : new Headers({ cookie: cookieActual })),
}));

const { and, eq, isNull } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { presets, promptTemplates, users } = await import("../db/esquema");
const { listarPlantillas, listarPresetsDeLaInstalacion } = await import("./consulta");
const { crearPresetDeLaInstalacion, ordenarGrupoDePresets } = await import("./presets-admin");
const { ordenarGrupoDePlantillas } = await import("./plantillas-admin");
const { ordenarGrupoPlantillasAccion } = await import("@/app/admin/plantillas/acciones");
const { ordenarGrupoPresetsAccion } = await import("@/app/admin/presets/acciones");
const { ErrorPreset } = await import("./errores");
type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;

const CLAVE_NUEVA = "prueba-orden-al-final";

describe.skipIf(!hayBaseDeDatos)("orden de plantillas y presets de la instalación", () => {
  let admin: Sesion;
  let normal: Sesion;
  let ordenPresets = new Map<string, number>();
  let ordenPlantillas = new Map<string, number>();

  const idsDePresets = async (categoria: string) =>
    (await listarPresetsDeLaInstalacion()).filter((p) => p.categoria === categoria).map((p) => p.id);
  const idsDePlantillas = async (capacidad: string) =>
    (await listarPlantillas()).filter((p) => p.capacidad === capacidad && p.deLaInstalacion).map((p) => p.id);
  const ordenDePreset = async (id: string) => (await listarPresetsDeLaInstalacion()).find((p) => p.id === id)?.orden;

  beforeAll(async () => {
    await aplicarMigraciones();
    admin = await crearSesionDePrueba("admin");
    normal = await crearSesionDePrueba("user");
    ordenPresets = new Map((await listarPresetsDeLaInstalacion()).map((p) => [p.id, p.orden]));
    ordenPlantillas = new Map((await listarPlantillas()).map((p) => [p.id, p.orden]));
  });

  afterAll(async () => {
    cookieActual = null;
    await db()
      .delete(presets)
      .where(and(eq(presets.slug, CLAVE_NUEVA), isNull(presets.ownerId)));
    for (const [id, sortOrder] of ordenPresets) await db().update(presets).set({ sortOrder }).where(eq(presets.id, id));
    for (const [id, sortOrder] of ordenPlantillas) {
      await db().update(promptTemplates).set({ sortOrder }).where(eq(promptTemplates.id, id));
    }
    for (const sesion of [admin, normal]) {
      if (sesion?.email) await db().delete(users).where(eq(users.email, sesion.email));
    }
  });

  test("presets: el orden final es el pedido, renumerado de 10 en 10 y sin empates", async () => {
    const ids = await idsDePresets("especialidad");
    expect(ids.length).toBeGreaterThanOrEqual(3);
    const invertido = [...ids].reverse();
    cookieActual = admin.cookie;
    const resultado = await ordenarGrupoPresetsAccion("especialidad", invertido);
    expect(resultado.ok).toBe(true);
    const despues = (await listarPresetsDeLaInstalacion()).filter((p) => p.categoria === "especialidad");
    expect(despues.map((p) => p.id)).toEqual(invertido);
    expect(despues.map((p) => p.orden)).toEqual(invertido.map((_, i) => (i + 1) * 10));
  });

  test("presets: solo cambia el grupo indicado", async () => {
    const otro = await idsDePresets("estilo");
    const antes = await Promise.all(otro.map(ordenDePreset));
    cookieActual = admin.cookie;
    await ordenarGrupoPresetsAccion("especialidad", await idsDePresets("especialidad"));
    expect(await Promise.all(otro.map(ordenDePreset))).toEqual(antes);
  });

  test("presets: rechaza ids ajenos, orden incompleto y repetidos sin tocar nada", async () => {
    const ids = await idsDePresets("especialidad");
    const ajeno = (await idsDePresets("estilo"))[0] as string;
    const antes = await Promise.all(ids.map(ordenDePreset));
    for (const pedido of [[...ids.slice(1), ajeno], ids.slice(1), [ids[0] as string, ...ids]]) {
      const error = await ordenarGrupoDePresets("especialidad", pedido).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ErrorPreset);
      expect((error as InstanceType<typeof ErrorPreset>).estado).toBe(400);
    }
    expect(await Promise.all(ids.map(ordenDePreset))).toEqual(antes);
  });

  test("presets: una persona sin rol de administrador no puede ordenar", async () => {
    const ids = await idsDePresets("especialidad");
    const antes = await Promise.all(ids.map(ordenDePreset));
    cookieActual = normal.cookie;
    await expect(ordenarGrupoPresetsAccion("especialidad", [...ids].reverse())).rejects.toBeDefined();
    cookieActual = null;
    expect(await Promise.all(ids.map(ordenDePreset))).toEqual(antes);
  });

  test("presets: un preset nuevo sin orden va al final de su categoría", async () => {
    const antes = await idsDePresets("especialidad");
    const creado = await crearPresetDeLaInstalacion({
      categoria: "especialidad",
      clave: CLAVE_NUEVA,
      nombre: "Prueba de orden",
      descripcion: "Va al final.",
      prompt: "test fragment",
      activo: true,
    });
    expect((await idsDePresets("especialidad")).at(-1)).toBe(creado.id);
    expect((await idsDePresets("especialidad")).slice(0, -1)).toEqual(antes);
    const orden = (await ordenDePreset(creado.id)) ?? 0;
    const maximoAnterior = Math.max(...(await Promise.all(antes.map(async (id) => (await ordenDePreset(id)) ?? 0))));
    expect(orden).toBeGreaterThan(maximoAnterior);
  });

  test("plantillas: el orden final es el pedido dentro de su capacidad y sin empates", async () => {
    const todas = await listarPlantillas();
    const capacidad = [...new Set(todas.map((p) => p.capacidad))].find(
      (c) => todas.filter((p) => p.capacidad === c && p.deLaInstalacion).length >= 2,
    );
    if (!capacidad) throw new Error("La semilla no tiene ninguna capacidad con dos plantillas.");
    const ids = await idsDePlantillas(capacidad);
    const invertido = [...ids].reverse();
    cookieActual = admin.cookie;
    const resultado = await ordenarGrupoPlantillasAccion(capacidad, invertido);
    expect(resultado.ok).toBe(true);
    const despues = (await listarPlantillas()).filter((p) => p.capacidad === capacidad && p.deLaInstalacion);
    expect(despues.map((p) => p.id)).toEqual(invertido);
    expect(despues.map((p) => p.orden)).toEqual(invertido.map((_, i) => (i + 1) * 10));

    // Rechaza un grupo incompleto o con una plantilla de otra capacidad, sin tocar nada.
    const ajena = todas.find((p) => p.capacidad !== capacidad)?.id as string;
    for (const pedido of [invertido.slice(1), [...invertido.slice(1), ajena]]) {
      const error = await ordenarGrupoDePlantillas(capacidad, pedido).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ErrorPreset);
    }
    const intacto = (await listarPlantillas()).filter((p) => p.capacidad === capacidad && p.deLaInstalacion);
    expect(intacto.map((p) => p.id)).toEqual(invertido);

    // Y sin rol de administrador no se ordena.
    cookieActual = normal.cookie;
    await expect(ordenarGrupoPlantillasAccion(capacidad, ids)).rejects.toBeDefined();
    cookieActual = null;
    const sigue = (await listarPlantillas()).filter((p) => p.capacidad === capacidad && p.deLaInstalacion);
    expect(sigue.map((p) => p.id)).toEqual(invertido);
  });
});
