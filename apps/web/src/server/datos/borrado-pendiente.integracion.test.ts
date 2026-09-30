import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Lo que no puede quedarse atascado en silencio al borrar: archivos que el almacenamiento no deja borrar, borrados de
 * cuenta que esperan (con su motivo a la vista), trabajos sin respuesta que no bloquean para siempre, los ejemplos de
 * plantillas de un administrador y dos administradores que piden irse a la vez.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);
process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_borrado_pendiente");
}

const { and, count, eq, sql } = await import("drizzle-orm");
const rutaBorradoCuenta = await import("@/app/api/cuenta/borrado/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, olvidarAjustes } = await import("../ajustes");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { borrarObjeto, leerObjeto } = await import("../almacenamiento");
const e = await import("../db/esquema");
const { borrarProyectoConDerivados } = await import("./borrado-proyecto");
const { borrarObjetosApuntados } = await import("./borrado-de-objetos");
const { pasadaDeBorradosDeCuenta } = await import("./borrado-cuenta-worker");
const { estadoTusDatos } = await import("./estado-admin");
const { medioDePrueba, proyectoProducido } = await import("./datos-de-prueba");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
const WORKER = "worker-de-prueba-pendientes";
const existe = (clave: string) => leerObjeto(clave).exists();
const pedir = (s: Sesion, url: string, metodo = "GET", cuerpo?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: metodo,
    headers: {
      cookie: s.cookie,
      ...(metodo === "GET" ? {} : { origin: "http://localhost", "Content-Type": "application/json" }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
const pedirBorrado = (s: Sesion) =>
  rutaBorradoCuenta.POST(pedir(s, "/api/cuenta/borrado", "POST", { frase: "borrar mi cuenta" }));
const errorDe = async (r: Response) => ((await r.json()) as { error?: string }).error ?? "";
const vencer = (usuarioId: string, dias = 0) =>
  db()
    .update(e.accountDeletions)
    .set({
      scheduledFor: new Date(Date.now() - dias * 24 * 3600_000 - 1000),
      availableAt: new Date(Date.now() - 1000),
      lockedUntil: null,
    })
    .where(eq(e.accountDeletions.userId, usuarioId));

describe.skipIf(!hayBaseDeDatos)("borrados que no pueden quedarse atascados en silencio", () => {
  const sesiones: Sesion[] = [];
  const nueva = async (rol: "admin" | "user" = "user") => {
    const s = await crearSesionDePrueba(rol);
    sesiones.push(s);
    return s;
  };

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_borrado_pendiente");
    await aplicarMigraciones();
    await guardarAjustes({ borradoCuentaDiasGracia: 7, borradoCuentaDiasEsperaDesconocidos: 3 }, null);
  });

  afterAll(async () => {
    for (const s of sesiones) await s.borrar();
    olvidarAjustes();
  });

  beforeEach(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_borrado_pendiente");
    await db().delete(e.rateLimits);
  });

  test("un archivo que el almacenamiento no deja borrar queda apuntado, visible y el reintento lo borra", async () => {
    const ana = await nueva();
    const p = await proyectoProducido({ id: ana.id, esAdmin: false });
    const caido = p.montado.clave;
    const borrarConFallo = async (clave: string) => {
      if (clave === caido) throw new Error("almacenamiento caído");
      await borrarObjeto(clave);
    };
    const hecho = await borrarProyectoConDerivados({ id: ana.id, esAdmin: false }, p.proyectoId, borrarConFallo);
    expect(hecho.objetosPendientes).toBe(1);
    expect(await existe(caido)).toBe(true);
    const [apuntado] = await db().select().from(e.storageDeletions).where(eq(e.storageDeletions.storageKey, caido));
    expect(apuntado?.state).toBe("pendiente");
    expect(apuntado?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect((await estadoTusDatos()).objetosPendientes).toBeGreaterThanOrEqual(1);

    // Aún no le toca: el barrido lo respeta. Cuando le toca, el reintento lo borra y la fila desaparece.
    expect((await borrarObjetosApuntados({ claves: [caido] })).borrados).toBe(0);
    await db()
      .update(e.storageDeletions)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(e.storageDeletions.storageKey, caido));
    expect((await borrarObjetosApuntados()).borrados).toBeGreaterThanOrEqual(1);
    expect(await existe(caido)).toBe(false);
    expect(await db().select().from(e.storageDeletions).where(eq(e.storageDeletions.storageKey, caido))).toHaveLength(
      0,
    );
  });

  test("un archivo generado que otro sitio cita dentro de un JSON (una versión de un personaje) se conserva", async () => {
    const ana = await nueva();
    const p = await proyectoProducido({ id: ana.id, esAdmin: false });
    const citado = p.generados[1];
    if (!citado) throw new Error("sin medio");
    const [personaje] = await db()
      .insert(e.characters)
      .values({ ownerId: ana.id, name: "Citada", kind: "persona" })
      .returning();
    await db()
      .insert(e.characterVersions)
      .values({
        characterId: personaje?.id ?? "",
        number: 1,
        referenceMediaIds: [citado.id],
        changedFields: [],
        sheet: { rasgos: "", estilo: "", vestuario: "", personalidad: "", voz: "", descripcion: "" },
      });
    await borrarProyectoConDerivados({ id: ana.id, esAdmin: false }, p.proyectoId);
    expect(await db().select().from(e.media).where(eq(e.media.id, citado.id))).toHaveLength(1);
    expect(await existe(citado.clave)).toBe(true);
  });

  test("agotados los intentos, el archivo queda como «fallido» a la vista de quien administra", async () => {
    const ana = await nueva();
    const medio = await medioDePrueba({ id: ana.id, esAdmin: false }, "terco.png");
    await db().insert(e.storageDeletions).values({ storageKey: medio.clave, origin: "proyecto", attempts: 7 });
    await borrarObjetosApuntados({ claves: [medio.clave] }, async () => {
      throw new Error("almacenamiento caído");
    });
    const [fila] = await db().select().from(e.storageDeletions).where(eq(e.storageDeletions.storageKey, medio.clave));
    expect(fila?.state).toBe("fallido");
    expect((await estadoTusDatos()).objetosFallidos).toBeGreaterThanOrEqual(1);
    await db().delete(e.storageDeletions).where(eq(e.storageDeletions.storageKey, medio.clave));
  });

  test("un trabajo sin respuesta aplaza el borrado con su motivo a la vista y, pasado el plazo extra, se cancela sin cobro", async () => {
    const ana = await nueva();
    const p = await proyectoProducido({ id: ana.id, esAdmin: false });
    const [trabajo] = await db()
      .update(e.generationJobs)
      .set({ state: "desconocido" })
      .where(eq(e.generationJobs.id, p.trabajos[0] ?? ""))
      .returning();
    // Su reserva vuelve a quedar abierta, como la de un trabajo del que el proveedor no ha contestado.
    await db()
      .delete(e.usageLedger)
      .where(and(eq(e.usageLedger.jobId, trabajo?.id ?? ""), eq(e.usageLedger.entryType, "liberacion")));
    expect((await pedirBorrado(ana)).status).toBe(201);

    // Recién vencida la gracia: espera, con el motivo en su fila (lo enseñan /cuenta/borrado y el admin).
    await vencer(ana.id);
    expect(await pasadaDeBorradosDeCuenta(WORKER)).toBe("aplazado");
    const [aplazado] = await db().select().from(e.accountDeletions).where(eq(e.accountDeletions.userId, ana.id));
    expect(aplazado?.lastError).toContain("sin respuesta");
    expect(aplazado?.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect((await estadoTusDatos()).aplazados.map((a) => a.id)).toContain(aplazado?.id ?? "");
    // El motivo lo ve también el propio usuario al consultar su borrado.
    const estado = (await (await rutaBorradoCuenta.GET(pedir(ana, "/api/cuenta/borrado"))).json()) as {
      borrado: { motivo: string | null };
    };
    expect(estado.borrado.motivo).toContain("sin respuesta");

    // Pasados los días extra: el trabajo se cierra sin cobro y el borrado sigue hasta el final.
    await vencer(ana.id, 4);
    expect(await pasadaDeBorradosDeCuenta(WORKER)).toBe("completado");
    expect(await db().select().from(e.users).where(eq(e.users.id, ana.id))).toHaveLength(0);
    const apuntes = await db()
      .select()
      .from(e.usageAggregates)
      .where(and(eq(e.usageAggregates.model, "modelo-de-prueba"), eq(e.usageAggregates.entryType, "consumo")));
    expect(apuntes.length).toBeGreaterThan(0);
  });

  test("un administrador (no único) avisa de los ejemplos de plantillas y al irse las deja sin ejemplo, sin tocar lo ajeno", async () => {
    const otro = await nueva("admin");
    const admin = await nueva("admin");
    const suyo = await medioDePrueba({ id: admin.id, esAdmin: true }, "ejemplo-suyo.png");
    const ajeno = await medioDePrueba({ id: otro.id, esAdmin: true }, "ejemplo-ajeno.png");
    const [conSuyo, conAjeno] = await db()
      .insert(e.promptTemplates)
      .values([
        {
          slug: `demo-suyo-${randomBytes(4).toString("hex")}`,
          name: "Con ejemplo suyo",
          capability: "image_edit",
          demoMediaId: suyo.id,
          demoSetBy: admin.id,
        },
        {
          slug: `demo-ajeno-${randomBytes(4).toString("hex")}`,
          name: "Con ejemplo ajeno",
          capability: "image_edit",
          demoMediaId: ajeno.id,
          demoSetBy: otro.id,
        },
      ])
      .returning();
    const resumen = await rutaBorradoCuenta.GET(pedir(admin, "/api/cuenta/borrado"));
    expect(
      ((await resumen.json()) as { resumen: { plantillasConTuEjemplo: number } }).resumen.plantillasConTuEjemplo,
    ).toBe(1);
    expect((await pedirBorrado(admin)).status).toBe(201);
    await vencer(admin.id);
    expect(await pasadaDeBorradosDeCuenta(WORKER)).toBe("completado");

    const plantillas = await db()
      .select()
      .from(e.promptTemplates)
      .where(sql`${e.promptTemplates.id} in (${conSuyo?.id ?? null}, ${conAjeno?.id ?? null})`);
    expect(plantillas).toHaveLength(2);
    expect(plantillas.find((t) => t.id === conSuyo?.id)?.demoMediaId).toBeNull();
    expect(plantillas.find((t) => t.id === conAjeno?.id)?.demoMediaId).toBe(ajeno.id);
    expect(await existe(ajeno.clave)).toBe(true);
    expect(await existe(suyo.clave)).toBe(false);
    await db()
      .delete(e.promptTemplates)
      .where(sql`${e.promptTemplates.id} in (${conSuyo?.id ?? null}, ${conAjeno?.id ?? null})`);
  });

  test("dos administradores que piden irse a la vez: el segundo recibe el motivo y nadie queda bloqueado", async () => {
    const uno = await nueva("admin");
    const dos = await nueva("admin");
    // Solo estos dos administradores (los demás de esta base pasan a usuarios mientras dura la prueba).
    const degradados = await db()
      .update(e.users)
      .set({ role: "user" })
      .where(and(eq(e.users.role, "admin"), sql`${e.users.id} not in (${uno.id}, ${dos.id})`))
      .returning({ id: e.users.id });
    try {
      expect((await pedirBorrado(uno)).status).toBe(201);
      const segundo = await pedirBorrado(dos);
      expect(segundo.status).toBe(409);
      expect(await errorDe(segundo)).toContain("único administrador");
      const [{ abiertos } = { abiertos: 0 }] = await db()
        .select({ abiertos: count() })
        .from(e.accountDeletions)
        .where(and(eq(e.accountDeletions.userId, dos.id), eq(e.accountDeletions.state, "programado")));
      expect(abiertos).toBe(0);
      await rutaBorradoCuenta.DELETE(pedir(uno, "/api/cuenta/borrado", "DELETE"));
    } finally {
      for (const d of degradados) await db().update(e.users).set({ role: "admin" }).where(eq(e.users.id, d.id));
    }
  });
});
