import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Lo que oculta una publicación ya aprobada sin recomprobarlo todo en cada visita (revocar la declaración de inventado,
 * la papelera), lo que hace un rechazo con la copia, lo que ve quien modera y lo que se exporta (también en la gracia
 * del borrado de la cuenta y en el ZIP de un proyecto). Contra PostgreSQL y el almacenamiento.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_comunidad_ocultar");
}

const { eq } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { accountDeletions, communityPostMedia, communityPosts, consentRecords, media } = await import("../db/esquema");
const { guardarAjustes } = await import("../ajustes");
const { leerObjeto } = await import("../almacenamiento");
const { armarPaquete } = await import("../datos/paquete");
const { colaDeModeracion, galeria, misPublicaciones } = await import("./consulta");
const { moderar } = await import("./moderacion");
const { editar, publicar } = await import("./publicar");
const f = await import("./comunidad-de-prueba");
const rutaExportacion = await import("@/app/api/comunidad/exportacion/route");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
const actorDe = (s: Sesion, esAdmin = false) => ({ id: s.id, esAdmin });
const visible = async (id: string) => (await galeria()).some((p) => p.id === id);
const copias = async (id: string) =>
  (await db().select().from(communityPostMedia).where(eq(communityPostMedia.postId, id))).map((c) => c.storageKey);

describe.skipIf(!hayBaseDeDatos)("ocultar, rechazar y exportar en la comunidad", () => {
  let admin: Sesion;
  let ana: Sesion;
  const aprobar = async (id: string, revision = 1) =>
    await moderar(actorDe(admin, true), id, revision, { accion: "aprobar" });
  const publicarClip = async (s: Sesion, extra: Partial<import("./comunidad-de-prueba").OpcionesTrabajo> = {}) => {
    const inventado = await f.inventadoDePrueba(s.id);
    const clip = await f.clipDePrueba(s.id, inventado, extra);
    const { publicacion } = await publicar(actorDe(s), {
      origen: { tipo: "medio", id: clip.id },
      tipo: "clip",
      titulo: "Clip de prueba",
      firma: "Ana",
      declaracion: true,
    });
    return { inventado, clip, id: publicacion.id };
  };

  beforeAll(async () => {
    await aplicarMigraciones();
    [admin, ana] = await Promise.all([crearSesionDePrueba("admin"), crearSesionDePrueba("user")]);
    await guardarAjustes({ comunidadActiva: true, comunidadMaximoPendientes: 50 }, null);
  });
  afterAll(async () => {
    await guardarAjustes({ comunidadActiva: false, comunidadMaximoPendientes: 5 }, null);
    await Promise.all([admin?.borrar(), ana?.borrar()]);
  });

  test("revocar la declaración la oculta, se dice al autor y a quien modera, y no vuelve sola", async () => {
    const { inventado, id } = await publicarClip(ana);
    await aprobar(id);
    expect(await visible(id)).toBe(true);
    await db().update(consentRecords).set({ revokedAt: new Date() }).where(eq(consentRecords.characterId, inventado));
    expect(await visible(id)).toBe(false);
    // El autor y quien modera la ven «oculta», con el motivo, y no «publicada».
    const mia = (await misPublicaciones(actorDe(ana))).find((p) => p.id === id);
    expect(mia?.estado).toBe("aprobada");
    expect(mia?.oculta).toContain("declaración");
    const enCola = (await colaDeModeracion(actorDe(admin, true))).aprobadas.find((p) => p.id === id);
    expect(enCola?.oculta).toContain("declaración");
    // Salvaguarda: aunque apareciera otra declaración (hoy la aplicación no deja volver a declararlo), sería posterior a
    // la aprobación y no la vuelve a enseñar sola.
    await db()
      .insert(consentRecords)
      .values({ characterId: inventado, holderType: "inventado", syntheticDeclared: true, registeredBy: ana.id });
    expect(await visible(id)).toBe(false);
    // La nueva declaración es posterior a la aprobación: hay que volver a enviarla y aprobarla.
    const editada = await editar(actorDe(ana), id, { titulo: "Clip de prueba", firma: "Ana" });
    await aprobar(id, editada.revision);
    expect(await visible(id)).toBe(true);
  });

  test("mover el original a la papelera la oculta; restaurarlo la vuelve a enseñar", async () => {
    const { clip, id } = await publicarClip(ana);
    await aprobar(id);
    await db().update(media).set({ deletedAt: new Date() }).where(eq(media.id, clip.id));
    expect(await visible(id)).toBe(false);
    expect((await misPublicaciones(actorDe(ana))).find((p) => p.id === id)?.oculta).toContain("papelera");
    // Quien modera lo lee en tercera persona: nada de «Restáuralo» en una publicación ajena.
    const enCola = (await colaDeModeracion(actorDe(admin, true))).aprobadas.find((p) => p.id === id);
    expect(enCola?.oculta).toContain("papelera del autor");
    expect(enCola?.oculta).not.toContain("Restáuralo");
    await db().update(media).set({ deletedAt: null }).where(eq(media.id, clip.id));
    expect(await visible(id)).toBe(true);
    expect((await misPublicaciones(actorDe(ana))).find((p) => p.id === id)?.oculta).toBeNull();
  });

  test("rechazar borra la copia del almacenamiento; corregir y reenviar la vuelve a copiar", async () => {
    const { id } = await publicarClip(ana);
    const [copia] = await copias(id);
    await moderar(actorDe(admin, true), id, 1, { accion: "rechazar", motivo: "Sale una cara que parece real." });
    expect(await leerObjeto(copia ?? "-").exists()).toBe(false);
    expect(await copias(id)).toEqual([]);
    const [fila] = await db().select().from(communityPosts).where(eq(communityPosts.id, id));
    expect(fila?.rejectionReason).toBe("Sale una cara que parece real.");
    // Sin copia no se puede aprobar.
    await expect(aprobar(id, 1)).rejects.toMatchObject({ estado: 409 });
    const reenviada = await editar(actorDe(ana), id, { titulo: "Corregido", firma: "Ana" });
    expect(reenviada.estado).toBe("pendiente");
    const [nueva] = await copias(id);
    expect(nueva).toBeDefined();
    expect(await leerObjeto(nueva ?? "-").exists()).toBe(true);
    await aprobar(id, reenviada.revision);
    expect(await visible(id)).toBe(true);
    // Retirar de la galería (rechazar lo aprobado) también borra la copia.
    await moderar(actorDe(admin, true), id, reenviada.revision, {
      accion: "rechazar",
      motivo: "Se retira de la galería.",
    });
    expect(await leerObjeto(nueva ?? "-").exists()).toBe(false);
  });

  test("quien modera ve la procedencia: lo publicado y lo que se envió al generarlo, con su origen", async () => {
    const inventado = await f.inventadoDePrueba(ana.id);
    const vista = await f.vistaGeneradaDePrueba(ana.id, inventado);
    const clip = await f.clipDePrueba(ana.id, inventado, { origen: vista.id });
    const { publicacion } = await publicar(actorDe(ana), {
      origen: { tipo: "medio", id: clip.id },
      tipo: "clip",
      titulo: "Con vista",
      firma: "Ana",
      declaracion: true,
    });
    const enCola = (await colaDeModeracion(actorDe(admin, true))).pendientes.find((p) => p.id === publicacion.id);
    expect(enCola?.procedencia.map((e) => e.paso)).toEqual([0, 1]);
    expect(enCola?.procedencia.every((e) => e.seguro)).toBe(true);
    expect(enCola?.procedencia[1]?.descripcion).toContain("(inventado)");
  });

  test("el texto alternativo que escribió el usuario no se publica", async () => {
    const inventado = await f.inventadoDePrueba(ana.id);
    const clip = await f.clipDePrueba(ana.id, inventado);
    await db().update(media).set({ altEs: "Foto de mi vecina Marta" }).where(eq(media.id, clip.id));
    const { publicacion } = await publicar(actorDe(ana), {
      origen: { tipo: "medio", id: clip.id },
      tipo: "clip",
      titulo: "Sin alt libre",
      firma: "Ana",
      declaracion: true,
    });
    await aprobar(publicacion.id);
    expect(JSON.stringify(await galeria())).not.toContain("Marta");
  });

  test("en la gracia del borrado de la cuenta se puede descargar lo publicado", async () => {
    const eva = await crearSesionDePrueba("user");
    const { id } = await publicarClip(eva);
    const lejos = new Date(Date.now() + 86_400_000);
    await db().insert(accountDeletions).values({ userId: eva.id, scheduledFor: lejos, availableAt: lejos });
    const r = await rutaExportacion.GET(
      new Request("http://localhost/api/comunidad/exportacion", { headers: { cookie: eva.cookie } }),
      undefined,
    );
    expect(r.status).toBe(200);
    expect((await r.json()).publicaciones.map((p: { id: string }) => p.id)).toEqual([id]);
    await eva.borrar();
  });

  test("el ZIP de un proyecto lleva comunidad.json con las publicaciones que salen de él", async () => {
    const inventado = await f.inventadoDePrueba(ana.id);
    const { proyectoId, escenaId } = await f.escenaDePrueba(ana.id);
    const clip = await f.clipDePrueba(ana.id, inventado, { escenaId });
    const { publicacion } = await publicar(actorDe(ana), {
      origen: { tipo: "medio", id: clip.id },
      tipo: "clip",
      titulo: "Del proyecto",
      firma: "Ana",
      declaracion: true,
    });
    const { paquete } = await armarPaquete(proyectoId, ana.id, []);
    const json = paquete.textos.find((t) => t.ruta === "comunidad.json");
    expect(json).toBeDefined();
    const datos = JSON.parse(json?.contenido ?? "{}");
    expect(datos.publicaciones.map((p: { id: string }) => p.id)).toEqual([publicacion.id]);
    expect(datos.publicaciones[0].estado).toBe("pendiente");
  });
});
