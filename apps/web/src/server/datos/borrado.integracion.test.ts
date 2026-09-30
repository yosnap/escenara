import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Borrado de un proyecto y de la cuenta, contra el PostgreSQL y el almacenamiento de pruebas (nunca un proveedor).
 *
 * Lo que comprueba: que no queda ni una fila ni un objeto de lo borrado (y sí lo que se usa fuera o subió el usuario),
 * que nadie borra lo de otro (404), la sesión reciente, la frase, el único administrador, el periodo de gracia con la
 * cuenta desactivada y su cancelación, que de la cuenta solo sobrevive lo anónimo y lo agregado, y que un fallo a
 * mitad no deja nada a medias y el reintento del worker termina sin contar dos veces.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);
process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_borrado_datos");
}

const { and, count, eq, inArray, sql } = await import("drizzle-orm");
const rutaProyecto = await import("@/app/api/proyectos/[id]/route");
const rutaResumen = await import("@/app/api/proyectos/[id]/borrado/route");
const rutaBorradoCuenta = await import("@/app/api/cuenta/borrado/route");
const rutaExportaciones = await import("@/app/api/proyectos/[id]/exportaciones/route");
const rutaDescarga = await import("@/app/api/proyectos/[id]/exportaciones/[exportacion]/descarga/route");
const rutaTrabajos = await import("@/app/api/generacion/trabajos/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { auth } = await import("../auth/auth");
const { guardarAjustes, olvidarAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { leerObjeto } = await import("../almacenamiento");
const e = await import("../db/esquema");
const { lugarDeclaradoDePrueba } = await import("../lugares/lugar-de-prueba");
const { borrarLugar } = await import("../lugares/borrado");
const { pasadaDeBorradosDeCuenta } = await import("./borrado-cuenta-worker");
const { empaquetar, pedirExportacionProyecto, tomarExportacionProyecto } = await import("./exportacion-proyecto");
const { medioDePrueba, proyectoProducido } = await import("./datos-de-prueba");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Buscador = import("../proveedores/codigos").Buscador;

const WORKER = "worker-de-prueba-borrado";
const buscar: Buscador = async (url) => {
  if (url.includes("/chat/credit")) {
    return new Response(JSON.stringify({ code: 200, msg: "success", data: 1000 }), { status: 200 });
  }
  throw new Error(`URL no simulada: ${url}`);
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const pedir = (s: Sesion, url: string, metodo = "GET", cuerpo?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: metodo,
    headers: {
      cookie: s.cookie,
      ...(metodo === "GET" ? {} : { origin: "http://localhost", "Content-Type": "application/json" }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
const errorDe = async (r: Response) => ((await r.json()) as { error?: string }).error ?? "";
const existe = (clave: string) => leerObjeto(clave).exists();
const total = async (consulta: Promise<{ total: number }[]>) => (await consulta)[0]?.total ?? 0;

/** Suma del agregado de un modelo y tipo de apunte, para medir cuánto añade un borrado. */
async function agregado(modelo: string, tipo: "consumo" | "reserva"): Promise<{ creditos: number; entradas: number }> {
  const [f] = await db()
    .select({
      creditos: sql<number>`coalesce(sum(${e.usageAggregates.credits}), 0)::float8`,
      entradas: sql<number>`coalesce(sum(${e.usageAggregates.entries}), 0)::int`,
    })
    .from(e.usageAggregates)
    .where(and(eq(e.usageAggregates.model, modelo), eq(e.usageAggregates.entryType, tipo)));
  return { creditos: Number(f?.creditos ?? 0), entradas: Number(f?.entradas ?? 0) };
}

describe.skipIf(!hayBaseDeDatos)("borrado de proyecto y de cuenta", () => {
  const sesiones: Sesion[] = [];
  const nueva = async (rol: "admin" | "user" = "user") => {
    const s = await crearSesionDePrueba(rol);
    sesiones.push(s);
    return s;
  };

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_borrado_datos");
    await aplicarMigraciones();
    await guardarAjustes({ borradoCuentaDiasGracia: 7 }, null);
  });

  afterAll(async () => {
    for (const s of sesiones) await s.borrar();
    olvidarAjustes();
  });

  beforeEach(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_borrado_datos");
    await db().delete(e.rateLimits);
  });

  // ── Proyecto ────────────────────────────────────────────────────────────────────────────────────────────

  test("borrar un proyecto elimina sus filas y sus objetos y conserva lo subido y lo usado fuera", async () => {
    const ana = await nueva();
    const actor = { id: ana.id, esAdmin: false };
    const p = await proyectoProducido(actor);
    // Un fotograma generado que ahora es foto de referencia de un personaje: se usa fuera, se queda.
    const [personaje] = await db()
      .insert(e.characters)
      .values({ ownerId: ana.id, name: "Elisa", kind: "persona" })
      .returning();
    const enUso = p.generados[0];
    if (!personaje || !enUso) throw new Error("sin datos");
    await db().insert(e.characterReferences).values({ characterId: personaje.id, mediaId: enUso.id });
    // Y un paquete exportado, cuyo ZIP también se borra.
    await pedirExportacionProyecto(actor, p.proyectoId);
    const tomada = await tomarExportacionProyecto(WORKER);
    if (!tomada) throw new Error("sin exportación");
    await empaquetar(tomada, WORKER);
    const [paquete] = await db().select().from(e.projectExports).where(eq(e.projectExports.id, tomada.id));
    const zip = paquete?.storageKey ?? "";
    expect(await existe(zip)).toBe(true);

    const resumen = await rutaResumen.GET(pedir(ana, `/api/proyectos/${p.proyectoId}/borrado`), ctx(p.proyectoId));
    expect(await resumen.json()).toMatchObject({
      escenas: 2,
      trabajos: 4,
      generados: 3,
      generadosEnUsoFuera: 1,
      videosMontados: 1,
      paquetesExportados: 1,
      trabajosEnMarcha: 0,
    });

    const borrado = await rutaProyecto.DELETE(
      pedir(ana, `/api/proyectos/${p.proyectoId}`, "DELETE"),
      ctx(p.proyectoId),
    );
    expect(borrado.status).toBe(200);

    const idsBorrados = [...p.generados.slice(1).map((g) => g.id), p.montado.id];
    expect(await total(db().select({ total: count() }).from(e.media).where(inArray(e.media.id, idsBorrados)))).toBe(0);
    for (const g of [...p.generados.slice(1), p.montado]) expect(await existe(g.clave)).toBe(false);
    expect(await existe(zip)).toBe(false);
    // Lo que se queda: lo usado fuera y lo que subió el usuario, fila y objeto.
    for (const g of [enUso, p.subida]) {
      expect(await total(db().select({ total: count() }).from(e.media).where(eq(e.media.id, g.id)))).toBe(1);
      expect(await existe(g.clave)).toBe(true);
    }
    // Sin huérfanos: ninguna fila apunta ya al proyecto ni a sus trabajos.
    for (const [tabla, columna] of [
      [e.scenes, e.scenes.projectId],
      [e.montages, e.montages.projectId],
      [e.montageExports, e.montageExports.projectId],
      [e.projectExports, e.projectExports.projectId],
      [e.assistantRuns, e.assistantRuns.projectId],
    ] as const) {
      expect(await total(db().select({ total: count() }).from(tabla).where(eq(columna, p.proyectoId)))).toBe(0);
    }
    expect(
      await total(
        db().select({ total: count() }).from(e.generationJobs).where(inArray(e.generationJobs.id, p.trabajos)),
      ),
    ).toBe(0);
    // El gasto ocurrió: los apuntes se quedan, sin trabajo y diciendo de qué proyecto venían.
    const apuntes = await db().select().from(e.usageLedger).where(eq(e.usageLedger.userId, ana.id));
    expect(apuntes).toHaveLength(12);
    expect(apuntes.every((a) => a.jobId === null && a.note.includes("borrado con el proyecto"))).toBe(true);
  });

  test("un trabajo en el proveedor impide borrar el proyecto y no se borra nada; otra cuenta recibe 404", async () => {
    const ana = await nueva();
    const beto = await nueva();
    const p = await proyectoProducido({ id: ana.id, esAdmin: false });
    await db()
      .update(e.generationJobs)
      .set({ state: "enviado" })
      .where(eq(e.generationJobs.id, p.trabajos[0] ?? ""));

    const ajeno = await rutaProyecto.DELETE(pedir(beto, `/api/proyectos/${p.proyectoId}`, "DELETE"), ctx(p.proyectoId));
    expect(ajeno.status).toBe(404);
    const resumenAjeno = await rutaResumen.GET(
      pedir(beto, `/api/proyectos/${p.proyectoId}/borrado`),
      ctx(p.proyectoId),
    );
    expect(resumenAjeno.status).toBe(404);

    const bloqueado = await rutaProyecto.DELETE(
      pedir(ana, `/api/proyectos/${p.proyectoId}`, "DELETE"),
      ctx(p.proyectoId),
    );
    expect(bloqueado.status).toBe(409);
    expect(await errorDe(bloqueado)).toContain("No se ha borrado nada");
    expect(await total(db().select({ total: count() }).from(e.projects).where(eq(e.projects.id, p.proyectoId)))).toBe(
      1,
    );
    for (const g of p.generados) expect(await existe(g.clave)).toBe(true);
  });

  test("borrar un lugar no deja filas que lo apunten y conserva sus fotos y su declaración revocada", async () => {
    const ana = await nueva();
    const actor = { id: ana.id, esAdmin: false };
    const { lugar, maestra } = await lugarDeclaradoDePrueba(actor, "Patio");
    await borrarLugar(actor, lugar.id);
    for (const [tabla, columna] of [
      [e.placeReferences, e.placeReferences.placeId],
      [e.placeVersions, e.placeVersions.placeId],
      [e.placeDeclarations, e.placeDeclarations.placeId],
      [e.scenes, e.scenes.placeId],
      [e.generationJobs, e.generationJobs.placeId],
    ] as const) {
      expect(await total(db().select({ total: count() }).from(tabla).where(eq(columna, lugar.id)))).toBe(0);
    }
    expect(await total(db().select({ total: count() }).from(e.media).where(eq(e.media.id, maestra)))).toBe(1);
  });

  // ── Cuenta ──────────────────────────────────────────────────────────────────────────────────────────────

  /** Una cuenta con de todo: proyecto producido, personaje con consentimiento, lugar declarado, canto, afirmación, llave. */
  async function cuentaCompleta(s: Sesion) {
    const actor = { id: s.id, esAdmin: false };
    const p = await proyectoProducido(actor);
    const [personaje] = await db()
      .insert(e.characters)
      .values({ ownerId: s.id, name: "Nombre Muy Personal", kind: "persona" })
      .returning();
    if (!personaje) throw new Error("sin personaje");
    await db()
      .insert(e.consentRecords)
      .values({ characterId: personaje.id, holderType: "yo", adultDeclared: true, registeredBy: s.id });
    const { lugar } = await lugarDeclaradoDePrueba(actor, "Casa de Mi Abuela");
    const cancion = await medioDePrueba(actor, "cancion.png");
    await db().insert(e.musicRightsDeclarations).values({
      userId: s.id,
      mediaId: cancion.id,
      kind: "propia",
      acceptedText: "Declaro que la canción es mía, Nombre Muy Personal.",
      ip: "10.1.2.3",
    });
    await db().insert(e.sensitiveClaimDeclarations).values({
      projectId: p.proyectoId,
      anglePresetKey: "antes-despues",
      acceptedText: "Acepto la afirmación.",
      ip: "10.1.2.3",
      acceptedBy: s.id,
    });
    await guardarCredencial(s.id, "kie", `sk-cuenta-${randomBytes(10).toString("hex")}`, buscar);
    await db().insert(e.passkeys).values({
      userId: s.id,
      publicKey: "clave-publica",
      credentialID: "cred",
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
    });
    const claves = (
      await db().select({ clave: e.media.storageKey }).from(e.media).where(eq(e.media.ownerId, s.id))
    ).map((f) => f.clave);
    return { p, personaje, lugar, claves };
  }

  const pedirBorrado = (s: Sesion, frase = "borrar mi cuenta") =>
    rutaBorradoCuenta.POST(pedir(s, "/api/cuenta/borrado", "POST", { frase }));

  async function vencerGracia(usuarioId: string) {
    await db()
      .update(e.accountDeletions)
      .set({ scheduledFor: new Date(Date.now() - 1000), availableAt: new Date(Date.now() - 1000), lockedUntil: null })
      .where(eq(e.accountDeletions.userId, usuarioId));
  }

  test("pedir el borrado exige la frase, sesión reciente y no ser el único administrador", async () => {
    const ana = await nueva();
    const sinFrase = await pedirBorrado(ana, "borrar");
    expect(sinFrase.status).toBe(400);
    await db()
      .update(e.sessions)
      .set({ createdAt: new Date(Date.now() - 3600_000) })
      .where(eq(e.sessions.userId, ana.id));
    const antigua = await pedirBorrado(ana);
    expect(antigua.status).toBe(403);
    expect(await errorDe(antigua)).toContain("vuelve a entrar");

    const admin = await nueva("admin");
    // Se deja solo a este administrador (y se devuelve el rol a los demás al terminar).
    const degradados = await db()
      .update(e.users)
      .set({ role: "user" })
      .where(and(eq(e.users.role, "admin"), sql`${e.users.id} <> ${admin.id}`))
      .returning({ id: e.users.id });
    const unico = await pedirBorrado(admin);
    expect(unico.status).toBe(409);
    expect(await errorDe(unico)).toContain("único administrador");
    const otro = await nueva("admin");
    expect((await pedirBorrado(admin)).status).toBe(201);
    await rutaBorradoCuenta.DELETE(pedir(admin, "/api/cuenta/borrado", "DELETE"));
    expect(otro.id).not.toBe(admin.id);
    if (degradados.length > 0) {
      await db()
        .update(e.users)
        .set({ role: "admin" })
        .where(
          inArray(
            e.users.id,
            degradados.map((d) => d.id),
          ),
        );
    }
    expect(
      await total(
        db().select({ total: count() }).from(e.accountDeletions).where(eq(e.accountDeletions.userId, ana.id)),
      ),
    ).toBe(0);
  });

  test("gracia: la cuenta queda desactivada, el worker espera, se cancela y vuelve a funcionar", async () => {
    const ana = await nueva();
    const p = await proyectoProducido({ id: ana.id, esAdmin: false });
    // Otra sesión abierta de la misma cuenta: se cierra al pedir el borrado.
    await (await auth()).api.signInEmail({ body: { email: ana.email, password: ana.password } });
    expect(await total(db().select({ total: count() }).from(e.sessions).where(eq(e.sessions.userId, ana.id)))).toBe(2);

    // Un paquete ya preparado antes de pedir el borrado.
    await pedirExportacionProyecto({ id: ana.id, esAdmin: false }, p.proyectoId);
    const tomada = await tomarExportacionProyecto(WORKER);
    if (!tomada) throw new Error("sin exportación");
    expect(await empaquetar(tomada, WORKER)).toBe(true);
    const beto = await nueva();
    const deBeto = await proyectoProducido({ id: beto.id, esAdmin: false });

    const pedido = await pedirBorrado(ana);
    expect(pedido.status).toBe(201);
    expect(await total(db().select({ total: count() }).from(e.sessions).where(eq(e.sessions.userId, ana.id)))).toBe(1);
    // Desactivada: nada de editar, generar ni gastar (403 con el motivo)…
    const bloqueada = await rutaProyecto.GET(pedir(ana, `/api/proyectos/${p.proyectoId}`), ctx(p.proyectoId));
    expect(bloqueada.status).toBe(403);
    expect(await errorDe(bloqueada)).toContain("borrado programado");
    expect(
      (await rutaTrabajos.POST(pedir(ana, "/api/generacion/trabajos", "POST", {}), undefined as never)).status,
    ).toBe(403);
    // …pero sí llevarse sus proyectos: listar, pedir y descargar lo exportado.
    expect(
      (await rutaExportaciones.GET(pedir(ana, `/api/proyectos/${p.proyectoId}/exportaciones`), ctx(p.proyectoId)))
        .status,
    ).toBe(200);
    const descarga = await rutaDescarga.GET(
      pedir(ana, `/api/proyectos/${p.proyectoId}/exportaciones/${tomada.id}/descarga`),
      { params: Promise.resolve({ id: p.proyectoId, exportacion: tomada.id }) },
    );
    expect(descarga.status).toBe(302);
    const otra = await rutaExportaciones.POST(
      pedir(ana, `/api/proyectos/${p.proyectoId}/exportaciones`, "POST"),
      ctx(p.proyectoId),
    );
    expect([200, 201]).toContain(otra.status);
    await db().delete(e.projectExports).where(eq(e.projectExports.projectId, p.proyectoId));
    // Lo ajeno sigue siendo ajeno (404), también en la gracia.
    expect(
      (
        await rutaExportaciones.GET(
          pedir(ana, `/api/proyectos/${deBeto.proyectoId}/exportaciones`),
          ctx(deBeto.proyectoId),
        )
      ).status,
    ).toBe(404);
    const estado = await rutaBorradoCuenta.GET(pedir(ana, "/api/cuenta/borrado"));
    expect(((await estado.json()) as { borrado: { cancelable: boolean } }).borrado.cancelable).toBe(true);
    // Antes del plazo, el worker no toca nada.
    expect(await pasadaDeBorradosDeCuenta(WORKER)).toBeNull();
    expect(await total(db().select({ total: count() }).from(e.users).where(eq(e.users.id, ana.id)))).toBe(1);

    // Mientras el worker lo tiene tomado no se puede cancelar (podría estar ya cancelando trabajos o borrando filas).
    await db()
      .update(e.accountDeletions)
      .set({ lockedBy: "otro-worker", lockedUntil: new Date(Date.now() + 60_000) })
      .where(eq(e.accountDeletions.userId, ana.id));
    const tomado = await rutaBorradoCuenta.DELETE(pedir(ana, "/api/cuenta/borrado", "DELETE"));
    expect(tomado.status).toBe(409);
    expect(await errorDe(tomado)).toContain("empezando justo ahora");
    await db()
      .update(e.accountDeletions)
      .set({ lockedBy: null, lockedUntil: null })
      .where(eq(e.accountDeletions.userId, ana.id));
    expect((await rutaBorradoCuenta.DELETE(pedir(ana, "/api/cuenta/borrado", "DELETE"))).status).toBe(200);
    expect((await rutaProyecto.GET(pedir(ana, `/api/proyectos/${p.proyectoId}`), ctx(p.proyectoId))).status).toBe(200);
    // Cancelado, vencer el plazo no hace nada.
    await vencerGracia(ana.id);
    expect(await pasadaDeBorradosDeCuenta(WORKER)).toBeNull();
    expect(await total(db().select({ total: count() }).from(e.users).where(eq(e.users.id, ana.id)))).toBe(1);
  });

  test("pasada la gracia se borra todo: credenciales, medios y objetos; solo queda lo anónimo y lo agregado", async () => {
    const ana = await nueva();
    const { p, personaje, lugar, claves } = await cuentaCompleta(ana);
    // El nombre de un servicio compatible lo escribe el usuario: no puede sobrevivir en el agregado.
    await db().insert(e.usageLedger).values({
      userId: ana.id,
      provider: "compatible",
      providerName: "Servidor de Ana en casa",
      model: "modelo-compatible-de-prueba",
      entryType: "consumo",
      credits: 1,
    });
    const antes = await agregado("modelo-de-prueba", "consumo");
    const pruebasAntes = await total(db().select({ total: count() }).from(e.consentEvidence));
    expect((await pedirBorrado(ana)).status).toBe(201);
    await vencerGracia(ana.id);

    expect(await pasadaDeBorradosDeCuenta(WORKER)).toBe("completado");
    const compatibles = await db()
      .select()
      .from(e.usageAggregates)
      .where(eq(e.usageAggregates.model, "modelo-compatible-de-prueba"));
    expect(compatibles.length).toBeGreaterThan(0);
    expect(compatibles.every((c) => c.providerName === "")).toBe(true);

    for (const [tabla, columna] of [
      [e.users, e.users.id],
      [e.sessions, e.sessions.userId],
      [e.accounts, e.accounts.userId],
      [e.passkeys, e.passkeys.userId],
      [e.providerCredentials, e.providerCredentials.userId],
      [e.openaiProviders, e.openaiProviders.userId],
      [e.media, e.media.ownerId],
      [e.usageLedger, e.usageLedger.userId],
      [e.generationJobs, e.generationJobs.userId],
      [e.projects, e.projects.userId],
      [e.characters, e.characters.ownerId],
      [e.places, e.places.ownerId],
      [e.musicRightsDeclarations, e.musicRightsDeclarations.userId],
    ] as const) {
      expect(await total(db().select({ total: count() }).from(tabla).where(eq(columna, ana.id)))).toBe(0);
    }
    expect(
      await total(
        db().select({ total: count() }).from(e.consentRecords).where(eq(e.consentRecords.characterId, personaje.id)),
      ),
    ).toBe(0);
    expect(
      await total(
        db()
          .select({ total: count() })
          .from(e.placeDeclarations)
          .where(eq(e.placeDeclarations.placeName, lugar.nombre)),
      ),
    ).toBe(0);
    for (const clave of claves) expect(await existe(clave)).toBe(false);

    // Lo agregado: los 4 consumos del proyecto (8 créditos cada uno) suman una sola vez, sin cuenta.
    const despues = await agregado("modelo-de-prueba", "consumo");
    expect(despues.creditos - antes.creditos).toBe(32);
    expect(despues.entradas - antes.entradas).toBe(4);
    // Lo anónimo: una prueba por consentimiento o declaración, sin nombres, IP ni cuenta.
    const pruebas = await db().select().from(e.consentEvidence).orderBy(e.consentEvidence.archivedAt);
    expect(pruebas.length - pruebasAntes).toBe(4);
    const texto = JSON.stringify(pruebas.slice(pruebasAntes));
    for (const dato of ["Nombre Muy Personal", "Casa de Mi Abuela", "10.1.2.3", ana.email, ana.id, p.proyectoId]) {
      expect(texto.includes(dato)).toBe(false);
    }
    expect(
      pruebas
        .slice(pruebasAntes)
        .map((x) => x.kind)
        .sort(),
    ).toEqual(["afirmacion", "lugar", "musica", "personaje"]);

    const [registro] = await db()
      .select()
      .from(e.accountDeletions)
      .where(eq(e.accountDeletions.state, "completado"))
      .orderBy(sql`${e.accountDeletions.completedAt} desc`)
      .limit(1);
    expect(registro?.userId).toBeNull();
    expect(registro?.deletedObjects).toBe(claves.length);
    expect(registro?.summary).toMatchObject({ proyectos: 1, personajes: 1, lugares: 1, pruebasConservadas: 4 });
  });

  test("un fallo a mitad no deja nada a medias y el reintento del worker termina sin contar dos veces", async () => {
    const ana = await nueva();
    const { claves } = await cuentaCompleta(ana);
    const antes = await agregado("modelo-de-prueba", "consumo");
    const pruebasAntes = await total(db().select({ total: count() }).from(e.consentEvidence));
    expect((await pedirBorrado(ana)).status).toBe(201);
    await vencerGracia(ana.id);

    // La fila del usuario no se deja borrar: la transacción entera tiene que deshacerse.
    await db().execute(sql`
      create or replace function fallo_de_prueba_al_borrar() returns trigger language plpgsql as
      $$ begin raise exception 'fallo simulado al borrar la cuenta'; end $$`);
    await db().execute(
      sql.raw(`create trigger fallo_de_prueba_al_borrar before delete on users for each row
               when (old.id = '${ana.id}') execute function fallo_de_prueba_al_borrar()`),
    );
    try {
      expect(await pasadaDeBorradosDeCuenta(WORKER)).toBe("reintentar");
    } finally {
      await db().execute(sql`drop trigger if exists fallo_de_prueba_al_borrar on users`);
    }
    expect(await total(db().select({ total: count() }).from(e.users).where(eq(e.users.id, ana.id)))).toBe(1);
    expect(await total(db().select({ total: count() }).from(e.media).where(eq(e.media.ownerId, ana.id)))).toBe(
      claves.length,
    );
    expect(await total(db().select({ total: count() }).from(e.consentEvidence))).toBe(pruebasAntes);
    expect(await agregado("modelo-de-prueba", "consumo")).toEqual(antes);
    for (const clave of claves) expect(await existe(clave)).toBe(true);
    const [abierto] = await db().select().from(e.accountDeletions).where(eq(e.accountDeletions.userId, ana.id));
    expect(abierto?.state).toBe("programado");
    expect(abierto?.lastError).not.toBe("");

    // El almacenamiento también falla en el primer objeto: las filas se borran y ese objeto queda pendiente.
    await vencerGracia(ana.id);
    const primera = claves[0] ?? "";
    let fallos = 0;
    const borrarConFallo = async (clave: string) => {
      if (clave === primera && fallos++ === 0) throw new Error("almacenamiento caído");
      await (await import("../almacenamiento")).borrarObjeto(clave);
    };
    expect(await pasadaDeBorradosDeCuenta(WORKER, borrarConFallo)).toBe("reintentar");
    expect(await total(db().select({ total: count() }).from(e.users).where(eq(e.users.id, ana.id)))).toBe(0);
    const [aMedias] = await db()
      .select()
      .from(e.accountDeletions)
      .where(eq(e.accountDeletions.state, "borrando_objetos"));
    // La clave pendiente está apuntada en `storage_deletions` (no en un registro de texto), con su retroceso.
    const pendientes = await db()
      .select()
      .from(e.storageDeletions)
      .where(eq(e.storageDeletions.accountDeletionId, aMedias?.id ?? ""));
    expect(pendientes.map((p) => p.storageKey)).toEqual([primera]);
    expect(pendientes[0]?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(await existe(primera)).toBe(true);
    // El registro que sobrevive a la cuenta no lleva su identificador en ningún sitio (ni en claves de objetos).
    expect(JSON.stringify(aMedias)).not.toContain(ana.id);

    await db()
      .update(e.storageDeletions)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(e.storageDeletions.accountDeletionId, aMedias?.id ?? ""));
    await db()
      .update(e.accountDeletions)
      .set({ availableAt: new Date(Date.now() - 1000) })
      .where(eq(e.accountDeletions.id, aMedias?.id ?? ""));
    expect(await pasadaDeBorradosDeCuenta(WORKER, borrarConFallo)).toBe("completado");
    expect(await existe(primera)).toBe(false);
    const despues = await agregado("modelo-de-prueba", "consumo");
    expect(despues.creditos - antes.creditos).toBe(32);
    expect((await total(db().select({ total: count() }).from(e.consentEvidence))) - pruebasAntes).toBe(4);
    const [final] = await db()
      .select()
      .from(e.accountDeletions)
      .where(eq(e.accountDeletions.id, aMedias?.id ?? ""));
    expect(final?.orphanObjects).toBe(0);
    expect(JSON.stringify(final)).not.toContain(ana.id);
    expect(
      await total(
        db()
          .select({ total: count() })
          .from(e.storageDeletions)
          .where(eq(e.storageDeletions.accountDeletionId, final?.id ?? "")),
      ),
    ).toBe(0);
  });
});
