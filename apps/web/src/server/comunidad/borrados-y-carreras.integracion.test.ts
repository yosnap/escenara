import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Lo que rodea a una publicación: borrar el original, la cuenta (con su gracia), las carreras publicar↔borrar y
 * aprobar↔retirar, los logros (una sola vez, solo tras el hito real) y los retos. Contra PostgreSQL y el almacenamiento.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_comunidad_borrados");
}

const { and, eq } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { accountDeletions, communityPostMedia, communityPosts, media, userAchievements, users } = await import(
  "../db/esquema"
);
const { guardarAjustes } = await import("../ajustes");
const { leerObjeto } = await import("../almacenamiento");
const { pasadaDeBorradosDeCuenta } = await import("../datos/borrado-cuenta-worker");
const { borrarPersonaje } = await import("../personajes/borrado");
const { barrerPublicacionesHuerfanas } = await import("./borrado");
const { galeria } = await import("./consulta");
const { logrosDe, marcarCelebrados, reconocerLogros } = await import("./logros");
const { moderar } = await import("./moderacion");
const { publicar, retirar } = await import("./publicar");
const { crearReto, listarRetos } = await import("./retos");
const f = await import("./comunidad-de-prueba");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
const actorDe = (s: Sesion, esAdmin = false) => ({ id: s.id, esAdmin });
const datos = (origen: { tipo: "personaje" | "medio"; id: string }, tipo = "clip") => ({
  origen,
  tipo,
  titulo: "Publicación de prueba",
  firma: "Firma",
  declaracion: true,
});
const copiasDe = async (id: string) =>
  (await db().select().from(communityPostMedia).where(eq(communityPostMedia.postId, id))).map((c) => c.storageKey);
const existe = async (clave: string) => await leerObjeto(clave).exists();

describe.skipIf(!hayBaseDeDatos)("borrados, carreras, logros y retos de la comunidad", () => {
  let admin: Sesion;
  let ana: Sesion;
  const aprobar = async (id: string, revision = 1) =>
    await moderar(actorDe(admin, true), id, revision, { accion: "aprobar" });

  beforeAll(async () => {
    await aplicarMigraciones();
    [admin, ana] = await Promise.all([crearSesionDePrueba("admin"), crearSesionDePrueba("user")]);
    await guardarAjustes({ comunidadActiva: true, comunidadMaximoPendientes: 50 }, null);
  });
  afterAll(async () => {
    await guardarAjustes({ comunidadActiva: false, comunidadMaximoPendientes: 5 }, null);
    await Promise.all([admin?.borrar(), ana?.borrar()]);
  });

  test("borrar el original la oculta al instante y el barrido la borra con su copia", async () => {
    const clip = await f.clipDePrueba(ana.id, await f.inventadoDePrueba(ana.id));
    const { publicacion } = await publicar(actorDe(ana), datos({ tipo: "medio", id: clip.id }));
    await aprobar(publicacion.id);
    const [copia] = await copiasDe(publicacion.id);
    expect((await galeria()).some((p) => p.id === publicacion.id)).toBe(true);
    await db().delete(media).where(eq(media.id, clip.id));
    expect((await galeria()).some((p) => p.id === publicacion.id)).toBe(false);
    expect(await barrerPublicacionesHuerfanas()).toBeGreaterThan(0);
    expect(await db().select().from(communityPosts).where(eq(communityPosts.id, publicacion.id))).toEqual([]);
    expect(await existe(copia ?? "-")).toBe(false);
  });

  test("borrar el personaje retira su publicación (huérfana, oculta y barrida)", async () => {
    const inventado = await f.inventadoDePrueba(ana.id);
    await f.vistaGeneradaDePrueba(ana.id, inventado);
    const { publicacion } = await publicar(actorDe(ana), datos({ tipo: "personaje", id: inventado }, "personaje"));
    await aprobar(publicacion.id);
    const [copia] = await copiasDe(publicacion.id);
    await borrarPersonaje(actorDe(ana), inventado);
    expect((await galeria()).some((p) => p.id === publicacion.id)).toBe(false);
    await barrerPublicacionesHuerfanas();
    expect(await existe(copia ?? "-")).toBe(false);
  });

  test("carrera publicar ↔ borrar personaje: o no se publica, o queda huérfana y oculta; nunca visible sin original", async () => {
    for (let i = 0; i < 3; i++) {
      const inventado = await f.inventadoDePrueba(ana.id);
      await f.vistaGeneradaDePrueba(ana.id, inventado);
      const [p, b] = await Promise.allSettled([
        publicar(actorDe(ana), datos({ tipo: "personaje", id: inventado }, "personaje")),
        borrarPersonaje(actorDe(ana), inventado),
      ]);
      expect(b.status).toBe("fulfilled");
      if (p.status === "fulfilled") {
        const [fila] = await db().select().from(communityPosts).where(eq(communityPosts.id, p.value.publicacion.id));
        expect(fila?.sourceCharacterId ?? null).toBeNull();
        await barrerPublicacionesHuerfanas();
        for (const clave of await copiasDe(p.value.publicacion.id)) expect(await existe(clave)).toBe(false);
      } else {
        expect(String(p.reason)).toMatch(/no existe|no es tuyo/);
      }
    }
  });

  test("carrera aprobar ↔ retirar: termina retirada y sin copia, pase lo que pase con la aprobación", async () => {
    for (let i = 0; i < 3; i++) {
      const clip = await f.clipDePrueba(ana.id, await f.inventadoDePrueba(ana.id));
      const { publicacion } = await publicar(actorDe(ana), datos({ tipo: "medio", id: clip.id }));
      const [copia] = await copiasDe(publicacion.id);
      const [a] = await Promise.allSettled([aprobar(publicacion.id), retirar(actorDe(ana), publicacion.id)]);
      if (a.status === "rejected") expect(String(a.reason)).toContain("ya no existe");
      expect(await db().select().from(communityPosts).where(eq(communityPosts.id, publicacion.id))).toEqual([]);
      expect(await existe(copia ?? "-")).toBe(false);
    }
  });

  test("borrar la cuenta: en la gracia ya no se ve; al borrarse, sus publicaciones y copias desaparecen", async () => {
    const eva = await crearSesionDePrueba("user");
    const clip = await f.clipDePrueba(eva.id, await f.inventadoDePrueba(eva.id));
    const { publicacion } = await publicar(actorDe(eva), datos({ tipo: "medio", id: clip.id }));
    await aprobar(publicacion.id);
    const [copia] = await copiasDe(publicacion.id);
    expect((await galeria()).some((p) => p.id === publicacion.id)).toBe(true);
    const pasado = new Date(Date.now() - 1000);
    await db()
      .insert(accountDeletions)
      .values({
        userId: eva.id,
        scheduledFor: new Date(Date.now() + 86_400_000),
        availableAt: new Date(Date.now() + 86_400_000),
      });
    expect((await galeria()).some((p) => p.id === publicacion.id)).toBe(false);
    await expect(aprobar(publicacion.id)).resolves.toMatchObject({ estado: "aprobada" });
    await db()
      .update(accountDeletions)
      .set({ scheduledFor: pasado, availableAt: pasado })
      .where(eq(accountDeletions.userId, eva.id));
    for (let i = 0; i < 5; i++) {
      if ((await db().select({ id: users.id }).from(users).where(eq(users.id, eva.id))).length === 0) break;
      await pasadaDeBorradosDeCuenta(`worker-comunidad-${i}`);
    }
    expect(await db().select().from(communityPosts).where(eq(communityPosts.authorId, eva.id))).toEqual([]);
    expect(await db().select().from(communityPosts).where(eq(communityPosts.id, publicacion.id))).toEqual([]);
    expect(await existe(copia ?? "-")).toBe(false);
  });

  test("logros: solo tras el hito real y una sola vez, aunque se reconozcan a la vez", async () => {
    const leo = await crearSesionDePrueba("user");
    await reconocerLogros(leo.id);
    expect((await logrosDe(leo.id)).every((l) => l.conseguidoEl === null)).toBe(true);
    const inventado = await f.inventadoDePrueba(leo.id);
    await Promise.all([reconocerLogros(leo.id), reconocerLogros(leo.id), reconocerLogros(leo.id)]);
    const filas = await db().select().from(userAchievements).where(eq(userAchievements.userId, leo.id));
    expect(filas.map((l) => l.achievement)).toEqual(["primer_personaje"]);
    // La escena aprobada cuenta con la fecha de su aprobación.
    const aprobadaEl = new Date("2026-09-01T10:00:00Z");
    await f.escenaDePrueba(leo.id, { approvedAt: aprobadaEl, state: "aprobada" });
    await reconocerLogros(leo.id);
    const escena = (await logrosDe(leo.id)).find((l) => l.clave === "primera_escena_aprobada");
    expect(escena?.conseguidoEl).toBe(aprobadaEl.toISOString());
    expect(escena?.porCelebrar).toBe(true);
    await marcarCelebrados(leo.id, ["primera_escena_aprobada", "inventado"]);
    expect((await logrosDe(leo.id)).find((l) => l.clave === "primera_escena_aprobada")?.porCelebrar).toBe(false);
    // Dos publicaciones aprobadas: un solo logro.
    for (let i = 0; i < 2; i++) {
      const clip = await f.clipDePrueba(leo.id, inventado);
      const { publicacion } = await publicar(actorDe(leo), datos({ tipo: "medio", id: clip.id }));
      await aprobar(publicacion.id);
    }
    const publicadas = await db()
      .select()
      .from(userAchievements)
      .where(
        and(eq(userAchievements.userId, leo.id), eq(userAchievements.achievement, "primera_publicacion_aprobada")),
      );
    expect(publicadas).toHaveLength(1);
    await leo.borrar();
  });

  test("retos: solo quien administra los crea; participar es publicar con el reto y cuenta solo lo aprobado", async () => {
    await expect(
      crearReto(actorDe(ana), { titulo: "Reto", desde: new Date().toISOString(), hasta: new Date().toISOString() }),
    ).rejects.toMatchObject({ estado: 404 });
    await expect(
      crearReto(actorDe(admin, true), {
        titulo: "Reto al revés",
        desde: new Date(Date.now() + 1000).toISOString(),
        hasta: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ estado: 400 });
    const { id } = await crearReto(actorDe(admin, true), {
      titulo: "Reto de otoño",
      desde: new Date(Date.now() - 60_000).toISOString(),
      hasta: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const clip = await f.clipDePrueba(ana.id, await f.inventadoDePrueba(ana.id));
    const { publicacion } = await publicar(actorDe(ana), { ...datos({ tipo: "medio", id: clip.id }), reto: id });
    const reto = async () => (await listarRetos()).find((r) => r.id === id);
    expect((await reto())?.participaciones).toBe(0);
    await aprobar(publicacion.id);
    expect((await reto())?.participaciones).toBe(1);
    expect((await galeria({ reto: id })).map((p) => p.id)).toEqual([publicacion.id]);
    // Un reto cerrado no admite participaciones.
    const cerrado = await crearReto(actorDe(admin, true), {
      titulo: "Reto de verano",
      desde: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      hasta: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const otro = await f.clipDePrueba(ana.id, await f.inventadoDePrueba(ana.id));
    await expect(
      publicar(actorDe(ana), { ...datos({ tipo: "medio", id: otro.id }), reto: cerrado.id }),
    ).rejects.toMatchObject({ estado: 409 });
  });
});
