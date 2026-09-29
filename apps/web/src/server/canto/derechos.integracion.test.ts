import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);
if (process.env.DATABASE_URL) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_derechos_canto");
}

const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, media, projects, scenes, musicRightsDeclarations } = await import("../db/esquema");
const { eq } = await import("drizzle-orm");
const rutaDeclaracion = await import("@/app/api/canto/declaracion/route");
const rutaEscena = await import("@/app/api/escenas/[id]/canto/route");
const { producirEscenaCantada } = await import("./escena");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
const contexto = (id: string) => ({ params: Promise.resolve({ id }) });
const peticion = (sesion: Sesion, ruta: string, metodo: string, cuerpo?: unknown) =>
  new Request(`http://localhost${ruta}`, {
    method: metodo,
    headers: {
      cookie: sesion.cookie,
      origin: "http://localhost",
      "Content-Type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

describe.skipIf(!process.env.DATABASE_URL)("derechos y propiedad del audio de canto", () => {
  let ana: Sesion;
  let beto: Sesion;
  let audioAna = "";
  let escenaBeto = "";

  beforeAll(async () => {
    await aplicarMigraciones();
    [ana, beto] = await Promise.all([crearSesionDePrueba("user"), crearSesionDePrueba("user")]);
    const [audio] = await db()
      .insert(media)
      .values({
        ownerId: ana.id,
        kind: "audio",
        storageKey: `prueba-canto/${crypto.randomUUID()}`,
        originalName: "propio.wav",
        mimeType: "audio/wav",
        sizeBytes: 1024,
      })
      .returning({ id: media.id });
    audioAna = audio?.id ?? "";
    const [proyecto] = await db()
      .insert(projects)
      .values({ userId: beto.id, title: "Prueba de autorización" })
      .returning({ id: projects.id });
    const [escena] = await db()
      .insert(scenes)
      .values({ projectId: proyecto?.id ?? "", sortOrder: 1, clipFormat: "cantar" })
      .returning({ id: scenes.id });
    escenaBeto = escena?.id ?? "";
  });

  afterAll(async () => {
    await Promise.all([ana.borrar(), beto.borrar()]);
  });

  test("declara un audio propio con texto y fecha, sin exponer la IP en la respuesta", async () => {
    const respuesta = await rutaDeclaracion.POST(
      peticion(ana, "/api/canto/declaracion", "POST", {
        medioId: audioAna,
        tipo: "propia",
        aceptado: true,
      }),
      undefined,
    );
    expect(respuesta.status).toBe(201);
    const cuerpo = await respuesta.json();
    expect(cuerpo.declaracion.textoAceptado).toContain("Declaro que soy titular");
    expect(cuerpo.declaracion.aceptadoEn).toBeTruthy();
    expect(cuerpo.declaracion.ip).toBeUndefined();
    const [guardada] = await db()
      .select()
      .from(musicRightsDeclarations)
      .where(eq(musicRightsDeclarations.mediaId, audioAna));
    expect(guardada?.ip).toBe("127.0.0.1");
  });

  test("el otro usuario no declara ni elige ese audio y un tipo inventado se rechaza", async () => {
    expect(
      (
        await rutaDeclaracion.POST(
          peticion(beto, "/api/canto/declaracion", "POST", {
            medioId: audioAna,
            tipo: "propia",
            aceptado: true,
          }),
          undefined,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await rutaEscena.PUT(
          peticion(beto, `/api/escenas/${escenaBeto}/canto`, "PUT", { medioId: audioAna }),
          contexto(escenaBeto),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await rutaDeclaracion.POST(
          peticion(ana, "/api/canto/declaracion", "POST", {
            medioId: audioAna,
            tipo: "uso_legitimo",
            aceptado: true,
          }),
          undefined,
        )
      ).status,
    ).toBe(400);
  });

  test("un reparto doble no entra en la producción de canto ni crea un trabajo", async () => {
    const [escena] = await db()
      .update(scenes)
      .set({ castFormat: "podcast" })
      .where(eq(scenes.id, escenaBeto))
      .returning();
    if (!escena) throw new Error("Falta la escena de prueba.");
    const [proyecto] = await db().select().from(projects).where(eq(projects.id, escena.projectId));
    if (!proyecto) throw new Error("Falta el proyecto de prueba.");
    try {
      await expect(
        producirEscenaCantada({ id: beto.id, esAdmin: false }, escena, proyecto, {
          derechos: true,
          sinTerceros: true,
          creditosConfirmados: 1,
          selloEstimacion: "precio-de-prueba",
          claveIdempotencia: crypto.randomUUID(),
        }),
      ).rejects.toThrow("mezcla canto");
      const trabajos = await db()
        .select({ id: generationJobs.id })
        .from(generationJobs)
        .where(eq(generationJobs.sceneId, escenaBeto));
      expect(trabajos).toHaveLength(0);
    } finally {
      await db().update(scenes).set({ castFormat: "solo" }).where(eq(scenes.id, escenaBeto));
    }
  });
});
