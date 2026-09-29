import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);
process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_animados");
}

const { eq } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characterReferences, characters, generationJobs, media, projects, sceneCharacters, scenes, users } =
  await import("../db/esquema");
const { crearPersonajeInventado } = await import("../personajes/inventado");
const { crearPersonaje, actualizarPersonaje } = await import("../personajes/servicio");
const { contextoAnimadoDeEscena } = await import("./contexto-escena");
const { contextoDeVersion, mejorReferenciaDe } = await import("../personajes/contexto");
const { ultimaVersion } = await import("../personajes/ficha");
const { adjuntarVistaGenerada } = await import("../personajes/vista-sintetica");
const { hechosDePersonajeCitado } = await import("../controles/hechos");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;

describe.skipIf(!hayBaseDeDatos)("animados: identidad, estilo heredado y versiones", () => {
  let sesion: Sesion;
  let actor: { id: string; esAdmin: false };

  beforeAll(async () => {
    await aplicarMigraciones();
    sesion = await crearSesionDePrueba("user");
    actor = { id: sesion.id, esAdmin: false };
  });

  afterAll(async () => {
    if (sesion) await db().delete(users).where(eq(users.id, sesion.id));
  });

  test("una persona real no acepta acabado animado y un inventado sí conserva la guía en su versión", async () => {
    const real = await crearPersonaje(actor, { nombre: `Real ${crypto.randomUUID()}`, tipo: "persona" });
    await expect(actualizarPersonaje(actor, real.id, { estiloAnimado: "anime" })).rejects.toThrow(
      "Solo un personaje inventado",
    );

    const inventado = await crearPersonajeInventado(actor, {
      nombre: `Animada ${crypto.randomUUID()}`,
      descripcion: "Una exploradora de pelo violeta, gafas redondas y abrigo amarillo.",
      declaracion: true,
      estiloAnimado: "anime",
      guiaPaleta: "violeta y amarillo",
    });
    const [fila] = await db().select().from(characters).where(eq(characters.id, inventado.id));
    const version = await ultimaVersion(inventado.id);
    expect(fila?.renderStyle).toBe("animado");
    if (!version) throw new Error("Falta la versión inicial del personaje.");
    expect(contextoDeVersion(version, "persona")).toContain("violeta y amarillo");
    expect(contextoDeVersion(version, "persona")).toContain("anime");
  });

  test("el proyecto transmite el acabado a los planos sin personaje y rechaza una mezcla", async () => {
    const inventado = await crearPersonajeInventado(actor, {
      nombre: `Protagonista ${crypto.randomUUID()}`,
      descripcion: "Una aventurera con una mochila azul y cabello cobrizo corto.",
      declaracion: true,
      estiloAnimado: "ilustracion-plana",
    });
    const [maestro] = await db()
      .insert(media)
      .values({
        ownerId: actor.id,
        kind: "imagen",
        storageKey: `pruebas/animados/${crypto.randomUUID()}.png`,
        originalName: "maestro.png",
        mimeType: "image/png",
        sizeBytes: 100,
      })
      .returning();
    if (!maestro) throw new Error("No se creó el medio de prueba.");
    await db().update(characters).set({ masterFrameMediaId: maestro.id }).where(eq(characters.id, inventado.id));
    const [proyecto] = await db()
      .insert(projects)
      .values({ userId: actor.id, title: "Ilustración", mainCharacterId: inventado.id, renderStyle: "animado" })
      .returning();
    if (!proyecto) throw new Error("No se creó el proyecto de prueba.");
    const [escena] = await db().insert(scenes).values({ projectId: proyecto.id, sortOrder: 1 }).returning();
    if (!escena) throw new Error("No se creó la escena de prueba.");

    expect(await contextoAnimadoDeEscena(escena.id, null)).toContain("Flat editorial illustration");
    expect(await mejorReferenciaDe(inventado.id, "persona")).toBe(maestro.id);
    const real = await crearPersonaje(actor, { nombre: `Actriz ${crypto.randomUUID()}`, tipo: "persona" });
    await expect(contextoAnimadoDeEscena(escena.id, { id: real.id, renderStyle: "realista" })).rejects.toThrow(
      "no coinciden",
    );
    await db().insert(sceneCharacters).values({ sceneId: escena.id, characterId: real.id, sortOrder: 1 });
    await expect(contextoAnimadoDeEscena(escena.id, null)).rejects.toThrow("acabado distinto");
  });

  test("cambiar el estilo crea versión y retira las vistas y el maestro anteriores", async () => {
    const inventado = await crearPersonajeInventado(actor, {
      nombre: `Versión ${crypto.randomUUID()}`,
      descripcion: "Un ciclista con casco azul, chaqueta verde y sonrisa amplia.",
      declaracion: true,
      estiloAnimado: "anime",
    });
    const [maestro] = await db()
      .insert(media)
      .values({
        ownerId: actor.id,
        kind: "imagen",
        storageKey: `pruebas/animados/${crypto.randomUUID()}.png`,
        originalName: "anterior.png",
        mimeType: "image/png",
        sizeBytes: 100,
      })
      .returning();
    if (!maestro) throw new Error("No se creó el medio de prueba.");
    await db().update(characters).set({ masterFrameMediaId: maestro.id }).where(eq(characters.id, inventado.id));
    await db()
      .insert(characterReferences)
      .values({ characterId: inventado.id, mediaId: maestro.id, origin: "vista_generada", sortOrder: 1 });
    const anterior = await ultimaVersion(inventado.id);
    const cambiada = await actualizarPersonaje(actor, inventado.id, { estiloAnimado: "tres-d-estilizado" });
    const actual = await ultimaVersion(inventado.id);
    const [fila] = await db().select().from(characters).where(eq(characters.id, inventado.id));
    const referencias = await db()
      .select()
      .from(characterReferences)
      .where(eq(characterReferences.characterId, inventado.id));
    expect(cambiada.estiloAnimado).toBe("tres-d-estilizado");
    expect(actual?.number).toBe((anterior?.number ?? 0) + 1);
    expect(fila?.masterFrameMediaId).toBeNull();
    expect(referencias).toHaveLength(0);
  });

  test("un maestro aprobado permite generar las vistas que completan el mínimo, pero aún no una escena", async () => {
    const inventado = await crearPersonajeInventado(actor, {
      nombre: `Maestro ${crypto.randomUUID()}`,
      descripcion: "Una ilustradora de pelo naranja, chaqueta amarilla y ojos verdes grandes.",
      declaracion: true,
      estiloAnimado: "ilustracion-plana",
    });
    const [maestro] = await db()
      .insert(media)
      .values({
        ownerId: actor.id,
        kind: "imagen",
        storageKey: `pruebas/animados/${crypto.randomUUID()}.png`,
        originalName: "maestro.png",
        mimeType: "image/png",
        sizeBytes: 100,
      })
      .returning();
    if (!maestro) throw new Error("No se creó el maestro de prueba.");
    await db().update(characters).set({ masterFrameMediaId: maestro.id }).where(eq(characters.id, inventado.id));
    await db()
      .insert(characterReferences)
      .values({ characterId: inventado.id, mediaId: maestro.id, origin: "vista_generada", viewKey: "frontal" });

    expect((await hechosDePersonajeCitado(inventado.id)).impedimentos.join(" ")).toContain("Faltan 2");
    expect((await hechosDePersonajeCitado(inventado.id, { vistaSintetica: true })).impedimentos).toEqual([]);

    await db().update(characters).set({ masterFrameMediaId: null }).where(eq(characters.id, inventado.id));
    expect((await hechosDePersonajeCitado(inventado.id, { vistaSintetica: true })).impedimentos.join(" ")).toContain(
      "Aprueba un retrato maestro animado",
    );
  });

  test("una vista que termina tras cambiar el estilo no vuelve a entrar; una del estilo actual sí", async () => {
    const inventado = await crearPersonajeInventado(actor, {
      nombre: `En cola ${crypto.randomUUID()}`,
      descripcion: "Una pintora de cabello naranja, chaqueta azul y pincel en la mano.",
      declaracion: true,
      estiloAnimado: "anime",
    });
    const versionAnterior = await ultimaVersion(inventado.id);
    if (!versionAnterior) throw new Error("Falta la versión inicial.");
    const [medio] = await db()
      .insert(media)
      .values({
        ownerId: actor.id,
        kind: "imagen",
        storageKey: `pruebas/animados/${crypto.randomUUID()}.png`,
        originalName: "vista.png",
        mimeType: "image/png",
        sizeBytes: 100,
      })
      .returning();
    if (!medio) throw new Error("No se creó el medio de prueba.");
    const trabajo = async (versionId: string) => {
      const [creado] = await db()
        .insert(generationJobs)
        .values({
          userId: actor.id,
          kind: "fotograma",
          provider: "kie",
          model: "nano-banana-2-lite",
          state: "listo",
          prompt: "Vista del personaje",
          input: { vistaSintetica: "perfil_izquierdo" },
          characterId: inventado.id,
          characterVersionId: versionId,
          resultMediaId: medio.id,
          estimatedCredits: 4,
        })
        .returning();
      if (!creado) throw new Error("No se creó el trabajo de prueba.");
      return creado;
    };
    const antiguo = await trabajo(versionAnterior.id);
    await actualizarPersonaje(actor, inventado.id, { estiloAnimado: "ilustracion-plana" });
    await adjuntarVistaGenerada(antiguo, medio.id);
    expect(
      await db().select().from(characterReferences).where(eq(characterReferences.characterId, inventado.id)),
    ).toHaveLength(0);

    const versionActual = await ultimaVersion(inventado.id);
    if (!versionActual) throw new Error("Falta la versión nueva.");
    const nuevo = await trabajo(versionActual.id);
    await adjuntarVistaGenerada(nuevo, medio.id);
    expect(
      await db().select().from(characterReferences).where(eq(characterReferences.characterId, inventado.id)),
    ).toHaveLength(1);
  });
});
