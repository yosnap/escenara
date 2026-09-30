import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Elegibilidad de la comunidad contra PostgreSQL: la lista blanca de origen en su nivel `comunidad`. Cada caso de «no»
 * es una forma distinta de colar una persona real, una foto subida o un audio propio; cada «sí» es una cadena generada
 * de principio a fin con un personaje inventado.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_comunidad_elegibilidad");
}

const { eq } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characterReferences, characterVersions, characters, placeReferences, sceneCharacters, scenes } = await import(
  "../db/esquema"
);
const { elegibilidadDe } = await import("./elegibilidad");
const { and } = await import("drizzle-orm");
const { media } = await import("../db/esquema");
const { condicionDeOrigenSeguro } = await import("../prompts/demos");
/** La condición que decide, sola (sin las columnas que explican el «no»). */
const origenSeguro = async (id: string) =>
  (
    await db()
      .select({ id: media.id })
      .from(media)
      .where(and(eq(media.id, id), condicionDeOrigenSeguro("comunidad")))
  ).length > 0;
const f = await import("./comunidad-de-prueba");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;

describe.skipIf(!hayBaseDeDatos)("elegibilidad de la comunidad (lista blanca de origen)", () => {
  let ana: Sesion;
  let otra: Sesion;
  const medio = (id: string) => elegibilidadDe(db(), ana.id, { tipo: "medio", id });
  const personaje = (id: string) => elegibilidadDe(db(), ana.id, { tipo: "personaje", id });

  beforeAll(async () => {
    await aplicarMigraciones();
    [ana, otra] = await Promise.all([crearSesionDePrueba("user"), crearSesionDePrueba("user")]);
  });
  afterAll(async () => {
    await Promise.all([ana?.borrar(), otra?.borrar()]);
  });

  describe("clips e imágenes", () => {
    test("un clip de un inventado es publicable y se copia a sí mismo", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      const clip = await f.clipDePrueba(ana.id, inventado);
      const r = await medio(clip.id);
      expect(r.publicable).toBe(true);
      expect(r.motivos).toEqual([]);
      expect(r.medios.map((m) => m.id)).toEqual([clip.id]);
      expect(await origenSeguro(clip.id)).toBe(true);
    });

    test("una subida directa no lo es (nada generado)", async () => {
      const subida = await f.medioDePrueba(ana.id, "imagen");
      const r = await medio(subida.id);
      expect(r.publicable).toBe(false);
      expect(r.motivos.join(" ")).toContain("subida tuya");
      expect(r.medios).toEqual([]);
    });

    test("foto real: un clip hecho con una persona real no lo es", async () => {
      const real = await f.personajeRealDePrueba(ana.id);
      const clip = await f.clipDePrueba(ana.id, real);
      const r = await medio(clip.id);
      expect(r.publicable).toBe(false);
      expect(r.motivos.join(" ")).toContain("no es inventado");
      expect(await origenSeguro(clip.id)).toBe(false);
    });

    test("una mascota real tampoco (sus fotos son reales), aunque sirva para los ejemplos de plantilla", async () => {
      const mascota = await f.personajeRealDePrueba(ana.id, "animal");
      const clip = await f.clipDePrueba(ana.id, mascota);
      expect((await medio(clip.id)).publicable).toBe(false);
      expect(await origenSeguro(clip.id)).toBe(false);
    });

    test("un inventado al que se le coló una foto original deja de valer", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      const clip = await f.clipDePrueba(ana.id, inventado);
      const foto = await f.medioDePrueba(ana.id, "imagen");
      await db()
        .insert(characterReferences)
        .values({ characterId: inventado, mediaId: foto.id, origin: "foto_original" });
      expect((await medio(clip.id)).publicable).toBe(false);
    });

    test("cadena mixta: clip de un inventado animado desde una foto subida", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      const foto = await f.medioDePrueba(ana.id, "imagen");
      const clip = await f.clipDePrueba(ana.id, inventado, { origen: foto.id });
      const r = await medio(clip.id);
      expect(r.publicable).toBe(false);
      expect(r.motivos.length).toBeGreaterThan(0);
    });

    test("cadena mixta: fotograma de una persona real animado con un inventado", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      const real = await f.personajeRealDePrueba(ana.id);
      const fotograma = await f.medioDePrueba(ana.id, "imagen");
      await f.trabajoDePrueba(ana.id, { personajeId: real, resultado: fotograma.id });
      const clip = await f.clipDePrueba(ana.id, inventado, { origen: fotograma.id });
      expect((await medio(clip.id)).publicable).toBe(false);
    });

    test("cadena generada: fotograma de un inventado animado con el mismo inventado sí vale", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      const fotograma = await f.medioDePrueba(ana.id, "imagen");
      await f.trabajoDePrueba(ana.id, { personajeId: inventado, resultado: fotograma.id });
      const clip = await f.clipDePrueba(ana.id, inventado, { origen: fotograma.id });
      expect((await medio(clip.id)).publicable).toBe(true);
      // El fotograma también es publicable por sí solo (es resultado de un trabajo sintético).
      expect((await medio(fotograma.id)).publicable).toBe(true);
    });

    test("lugar real: con un lugar de fotos no; con uno generado sí; con uno borrado tampoco", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      const conFotos = await f.lugarDePrueba(ana.id, "fotos");
      const generado = await f.lugarDePrueba(ana.id, "generado");
      const a = await f.clipDePrueba(ana.id, inventado, { lugarId: conFotos, lugarVersion: 1 });
      const b = await f.clipDePrueba(ana.id, inventado, { lugarId: generado, lugarVersion: 1 });
      const c = await f.clipDePrueba(ana.id, inventado, { lugarId: null, lugarVersion: 2 });
      expect((await medio(a.id)).motivos.join(" ")).toContain("lugar");
      expect((await medio(a.id)).publicable).toBe(false);
      expect((await medio(b.id)).publicable).toBe(true);
      expect((await medio(c.id)).publicable).toBe(false);
    });

    test("un lugar «generado» al que se le subió una foto deja de valer", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      const lugar = await f.lugarDePrueba(ana.id, "generado");
      const clip = await f.clipDePrueba(ana.id, inventado, { lugarId: lugar, lugarVersion: 1 });
      const foto = await f.medioDePrueba(ana.id, "imagen");
      await db()
        .insert(placeReferences)
        .values({ placeId: lugar, mediaId: foto.id, kind: "maestra", origin: "foto_original" });
      expect((await medio(clip.id)).publicable).toBe(false);
    });

    test("con producto (fotos subidas) no, aunque el producto ya se haya borrado", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      const clip = await f.clipDePrueba(ana.id, inventado, { productAction: "sostener" });
      const r = await medio(clip.id);
      expect(r.publicable).toBe(false);
      expect(r.motivos.join(" ")).toContain("producto");
    });

    test("reparto de dos personajes o dualcast: no", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      const clip = await f.clipDePrueba(ana.id, inventado, { input: { reparto: { modo: "dualcast" } } });
      expect((await medio(clip.id)).publicable).toBe(false);
    });

    test("escena que canta con audio subido: no", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      const audio = await f.medioDePrueba(ana.id, "audio");
      const { escenaId } = await f.escenaDePrueba(ana.id, { singingAudioMediaId: audio.id });
      const clip = await f.clipDePrueba(ana.id, inventado, { escenaId });
      await db().update(scenes).set({ clipMediaId: clip.id }).where(eq(scenes.id, escenaId));
      const r = await medio(clip.id);
      expect(r.publicable).toBe(false);
      expect(r.motivos.join(" ")).toContain("audio");
    });

    test("escena con una persona real en el reparto: no, aunque el clip lo firme el inventado", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      const real = await f.personajeRealDePrueba(ana.id);
      const { escenaId } = await f.escenaDePrueba(ana.id);
      await db().insert(sceneCharacters).values({ sceneId: escenaId, characterId: real, sortOrder: 1 });
      const clip = await f.clipDePrueba(ana.id, inventado, { escenaId });
      expect((await medio(clip.id)).publicable).toBe(false);
    });

    test("un audio nunca, aunque sea generado", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      const audio = await f.medioDePrueba(ana.id, "audio");
      await f.trabajoDePrueba(ana.id, { personajeId: inventado, resultado: audio.id });
      const r = await medio(audio.id);
      expect(r.publicable).toBe(false);
      expect(r.motivos.join(" ")).toContain("voz real");
    });

    test("un archivo ajeno responde 404, sin decir si existe", async () => {
      const inventado = await f.inventadoDePrueba(otra.id);
      const clip = await f.clipDePrueba(otra.id, inventado);
      await expect(medio(clip.id)).rejects.toMatchObject({ estado: 404 });
    });

    test("un trend de la instalación con el que se hizo se ofrece como tipo; su texto nunca", async () => {
      const { promptTemplates } = await import("../db/esquema");
      const [plantilla] = await db()
        .insert(promptTemplates)
        .values({
          slug: `trend-comunidad-${crypto.randomUUID().slice(0, 6)}`,
          name: "Trend de prueba",
          kind: "trend",
          trendStatus: "vigente",
          capability: "image_to_video",
          template: "texto-secreto-del-trend {{escena}}",
        })
        .returning({ id: promptTemplates.id });
      const inventado = await f.inventadoDePrueba(ana.id);
      const clip = await f.clipDePrueba(ana.id, inventado, { plantillaId: plantilla?.id });
      const r = await medio(clip.id);
      expect(r.tipos).toEqual(["clip", "trend"]);
      expect(r.plantilla).toEqual({ id: plantilla?.id ?? "", nombre: "Trend de prueba", tipo: "trend" });
      expect(JSON.stringify(r)).not.toContain("texto-secreto-del-trend");
      await db()
        .delete(promptTemplates)
        .where(eq(promptTemplates.id, plantilla?.id ?? ""));
    });
  });

  describe("personajes", () => {
    test("un inventado declarado con una vista generada es publicable y copia solo esa vista", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      const vista = await f.vistaGeneradaDePrueba(ana.id, inventado);
      const r = await personaje(inventado);
      expect(r.publicable).toBe(true);
      expect(r.medios.map((m) => m.id)).toEqual([vista.id]);
    });

    test("foto real: una persona real no, con su motivo y la propuesta de crear uno de demostración", async () => {
      const real = await f.personajeRealDePrueba(ana.id);
      const r = await personaje(real);
      expect(r.publicable).toBe(false);
      expect(r.motivos.join(" ")).toContain("crea un personaje inventado");
    });

    test("un inventado sin declaración vigente no", async () => {
      const inventado = await f.inventadoDePrueba(ana.id, { declarado: false });
      await f.vistaGeneradaDePrueba(ana.id, inventado);
      expect((await personaje(inventado)).motivos.join(" ")).toContain("declaración");
    });

    test("un inventado sin retratos todavía no (no hay nada que enseñar)", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      expect((await personaje(inventado)).motivos.join(" ")).toContain("retrato");
    });

    test("una versión antigua con una imagen que no es suya lo invalida", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      await f.vistaGeneradaDePrueba(ana.id, inventado);
      const ajena = await f.medioDePrueba(ana.id, "imagen");
      await db()
        .insert(characterVersions)
        .values({
          characterId: inventado,
          number: 1,
          sheet: {} as never,
          referenceMediaIds: [ajena.id],
          changedFields: [],
        });
      expect((await personaje(inventado)).publicable).toBe(false);
    });

    test("la hoja de identidad 3×3 nunca se copia", async () => {
      const inventado = await f.inventadoDePrueba(ana.id);
      const vista = await f.vistaGeneradaDePrueba(ana.id, inventado);
      const hoja = await f.medioDePrueba(ana.id, "imagen");
      await f.trabajoDePrueba(ana.id, { personajeId: inventado, resultado: hoja.id });
      await db()
        .insert(characterReferences)
        .values({ characterId: inventado, mediaId: hoja.id, origin: "vista_generada" });
      await db().update(characters).set({ identitySheetMediaId: hoja.id }).where(eq(characters.id, inventado));
      expect((await personaje(inventado)).medios.map((m) => m.id)).toEqual([vista.id]);
    });

    test("un personaje ajeno responde 404", async () => {
      const inventado = await f.inventadoDePrueba(otra.id);
      await expect(personaje(inventado)).rejects.toMatchObject({ estado: 404 });
    });
  });
});
