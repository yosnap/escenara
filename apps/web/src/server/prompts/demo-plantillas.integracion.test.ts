import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";

/**
 * Ejemplo (imagen o clip) de las plantillas y los trends, contra PostgreSQL y el almacenamiento.
 *
 * Fija que elegirlo o quitarlo **no crea versión ni cambia el texto**, que solo vale un medio de la biblioteca que
 * pueda ser un ejemplo (imagen o vídeo, fuera de la papelera y sin ser material reservado), y que la ruta que lo sirve
 * es la única puerta de un usuario a un medio de quien administra: solo entrega el ejemplo de una plantilla que se le
 * ofrece, con cabeceras seguras y admitiendo `Range` para reproducir vídeo.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_demo_plantillas");
}

/** Cookie de la sesión que «hace» la petición a una acción de servidor. Sin ella, las cabeceras reales de Next. */
let cookieActual: string | null = null;
const reales = await import("next/headers");
mock.module("next/headers", () => ({
  ...reales,
  headers: async () => (cookieActual === null ? reales.headers() : new Headers({ cookie: cookieActual })),
}));

const { eq, inArray } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const {
  characters,
  generationJobs,
  media,
  projects,
  promptTemplates,
  promptTemplateVersions,
  characterReferences,
  characterVersions,
  sceneCharacters,
  scenes,
  users,
} = await import("../db/esquema");
const { guardarObjeto } = await import("../almacenamiento");
const { guardarAjustes } = await import("../ajustes");
const { crearMedio } = await import("../media/servicio");
const { ErrorPreset } = await import("./errores");
const { exigirRitmoDeEjemplos } = await import("./http");
const { listarPlantillas } = await import("./consulta");
const {
  activarPlantillaDeLaInstalacion,
  caducarTrend,
  crearPlantillaDeLaInstalacion,
  duplicarTrend,
  fijarDemoDePlantilla,
} = await import("./plantillas-admin");
const rutaDemo = await import("@/app/api/prompts/plantillas/[id]/demo/route");
const rutaCatalogo = await import("@/app/api/prompts/catalogo/route");
const rutaTrends = await import("@/app/api/prompts/trends/route");
const rutaArchivoMedio = await import("@/app/api/media/[id]/archivo/route");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const pedir = (s: Sesion | null, url: string, cabeceras: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { headers: { ...(s ? { cookie: s.cookie } : {}), ...cabeceras } });

const VARIABLES = [{ nombre: "escena", tipo: "texto" as const, etiqueta: "Escena", obligatoria: true }];
const CENTINELA_DEL_TEXTO = "centinela-del-texto-de-la-plantilla-de-ejemplo";

async function png(): Promise<File> {
  const datos = await sharp({ create: { width: 64, height: 96, channels: 3, background: "#ff5a5f" } })
    .png()
    .toBuffer();
  return new File([new Uint8Array(datos)], "ejemplo.png", { type: "image/png" });
}

describe.skipIf(!hayBaseDeDatos)("ejemplo de las plantillas y los trends", () => {
  let admin: Sesion;
  let ana: Sesion;
  const prefijo = `dm-${crypto.randomUUID().slice(0, 6)}`;
  const claves: string[] = [];
  const medios: string[] = [];
  let imagen: string;
  let clip: string;
  const bytesDelClip = new Uint8Array(1000).map((_, i) => i % 251);

  async function plantilla(sufijo: string, extra: Record<string, unknown> = {}) {
    const clave = `${prefijo}-${sufijo}`;
    claves.push(clave);
    return await crearPlantillaDeLaInstalacion(
      {
        clave,
        nombre: `Plantilla ${sufijo}`,
        descripcion: "Plantilla de prueba.",
        capacidad: "image_edit",
        plantilla: `${CENTINELA_DEL_TEXTO} {{escena}}`,
        variables: VARIABLES,
        restricciones: { modelos: [], minimoReferencias: 0 },
        activa: true,
        ...extra,
      },
      admin.id,
    );
  }
  const trend = (sufijo: string, estado: "vigente" | "revision" = "vigente") =>
    plantilla(sufijo, { kind: "trend", capacidad: "image_to_video", trendStatus: estado, trendPlatform: "TikTok" });

  const versiones = async (id: string) =>
    await db().select().from(promptTemplateVersions).where(eq(promptTemplateVersions.templateId, id));

  beforeAll(async () => {
    await aplicarMigraciones();
    admin = await crearSesionDePrueba("admin");
    ana = await crearSesionDePrueba("user");
    const subida = await crearMedio({ id: admin.id, esAdmin: true }, await png());
    imagen = subida.id;
    medios.push(imagen);
    // Un clip de la biblioteca: la detección de vídeo real no es lo que se prueba aquí, sino cómo se sirve.
    const clave = `pruebas/${prefijo}-clip.mp4`;
    await guardarObjeto(clave, bytesDelClip, "video/mp4");
    const [fila] = await db()
      .insert(media)
      .values({
        ownerId: admin.id,
        kind: "video",
        storageKey: clave,
        originalName: "clip.mp4",
        mimeType: "video/mp4",
        sizeBytes: bytesDelClip.length,
        altEs: "Una mano abre una caja",
      })
      .returning({ id: media.id });
    if (!fila) throw new Error("No se ha creado el clip de prueba.");
    clip = fila.id;
    medios.push(clip);
  });

  afterAll(async () => {
    await guardarAjustes({ trendsVisibles: true }, null);
    if (claves.length > 0) await db().delete(promptTemplates).where(inArray(promptTemplates.slug, claves));
    if (medios.length > 0) await db().delete(media).where(inArray(media.id, medios));
    await Promise.all([admin?.borrar(), ana?.borrar()]);
  });

  describe("poner y quitar", () => {
    test("no crea versión, no cambia el texto y la vista lleva una ruta sin el identificador del medio", async () => {
      const p = await plantilla("versiona");
      const antes = await versiones(p.id);
      const con = await fijarDemoDePlantilla(p.id, imagen, admin.id);
      expect(con.demo).toMatchObject({ tipo: "imagen", ancho: 64, alto: 96 });
      expect(con.demo?.url).toContain(`/api/prompts/plantillas/${p.id}/demo?v=`);
      expect(con.demo?.url).not.toContain(imagen);
      expect(con.demo?.alt).toBe("Imagen de ejemplo de «Plantilla versiona»");
      expect(con.version).toBe(p.version);
      expect(con.versionId).toBe(p.versionId);
      expect(con.plantilla).toBe(p.plantilla);
      expect((await versiones(p.id)).length).toBe(antes.length);

      const sin = await fijarDemoDePlantilla(p.id, null, admin.id);
      expect(sin.demo).toBeNull();
      expect((await versiones(p.id)).length).toBe(antes.length);
    });

    test("un clip se ve como vídeo con el texto alternativo del medio", async () => {
      const p = await plantilla("clip");
      const con = await fijarDemoDePlantilla(p.id, clip, admin.id);
      expect(con.demo).toMatchObject({ tipo: "video", alt: "Una mano abre una caja" });
    });

    test("rechaza lo que no puede ser un ejemplo, con su causa", async () => {
      const p = await plantilla("rechazos");
      const nuevo = async (valores: Partial<typeof media.$inferInsert>) => {
        const [fila] = await db()
          .insert(media)
          .values({
            ownerId: admin.id,
            kind: "imagen",
            storageKey: `pruebas/${prefijo}-${crypto.randomUUID()}.png`,
            originalName: "x.png",
            mimeType: "image/png",
            sizeBytes: 1,
            ...valores,
          })
          .returning({ id: media.id });
        if (!fila) throw new Error("No se ha creado el medio de prueba.");
        medios.push(fila.id);
        return fila.id;
      };
      const audio = await nuevo({ kind: "audio", mimeType: "audio/mpeg" });
      const svg = await nuevo({ mimeType: "image/svg+xml" });
      const papelera = await nuevo({ deletedAt: new Date() });
      const documento = await nuevo({ isDocument: true });
      await expect(fijarDemoDePlantilla(p.id, audio, admin.id)).rejects.toMatchObject({ estado: 400 });
      await expect(fijarDemoDePlantilla(p.id, svg, admin.id)).rejects.toMatchObject({ estado: 400 });
      await expect(fijarDemoDePlantilla(p.id, papelera, admin.id)).rejects.toMatchObject({ estado: 404 });
      await expect(fijarDemoDePlantilla(p.id, documento, admin.id)).rejects.toMatchObject({ estado: 404 });
      await expect(fijarDemoDePlantilla(p.id, crypto.randomUUID(), admin.id)).rejects.toMatchObject({ estado: 404 });
      await expect(fijarDemoDePlantilla(p.id, 5, admin.id)).rejects.toBeInstanceOf(ErrorPreset);
      expect((await listarPlantillas()).find((v) => v.id === p.id)?.demo).toBeNull();
    });

    test("una plantilla de un usuario no admite ejemplo", async () => {
      const [ajena] = await db()
        .insert(promptTemplates)
        .values({
          ownerId: ana.id,
          slug: `${prefijo}-ajena`,
          name: "Ajena",
          capability: "image_edit",
          template: "x {{escena}}",
        })
        .returning({ id: promptTemplates.id });
      claves.push(`${prefijo}-ajena`);
      await expect(fijarDemoDePlantilla(ajena?.id ?? "", imagen, admin.id)).rejects.toMatchObject({ estado: 404 });
    });

    test("al borrar del todo el medio, la plantilla se queda sin ejemplo y sigue entera", async () => {
      const p = await plantilla("borrado");
      const [efimero] = await db()
        .insert(media)
        .values({
          ownerId: admin.id,
          kind: "imagen",
          storageKey: `pruebas/${prefijo}-efimero.png`,
          originalName: "e.png",
          mimeType: "image/png",
          sizeBytes: 1,
        })
        .returning({ id: media.id });
      await fijarDemoDePlantilla(p.id, efimero?.id ?? "", admin.id);
      await db()
        .delete(media)
        .where(eq(media.id, efimero?.id ?? ""));
      const vista = (await listarPlantillas()).find((v) => v.id === p.id);
      expect(vista?.demo).toBeNull();
      expect(vista?.plantilla).toBe(p.plantilla);
    });

    test("duplicar un trend conserva su ejemplo", async () => {
      const t = await trend("dup");
      await fijarDemoDePlantilla(t.id, clip, admin.id);
      claves.push(`${prefijo}-dup-copia`);
      const copia = await duplicarTrend(t.id, `${prefijo}-dup-copia`, admin.id);
      expect(copia.demo?.tipo).toBe("video");
    });

    test("la acción del panel rechaza a un usuario normal y funciona con un administrador (con sesión real)", async () => {
      const { fijarDemoAccion } = await import("@/app/admin/plantillas/acciones");
      const p = await plantilla("puerta");
      const vista = async () => (await listarPlantillas()).find((v) => v.id === p.id)?.demo ?? null;
      try {
        // Un usuario normal, con su sesión de verdad: `exigirAdmin` responde «no existe» y no se toca nada.
        cookieActual = ana.cookie;
        await expect(fijarDemoAccion(p.id, imagen)).rejects.toBeDefined();
        expect(await vista()).toBeNull();
        // Sin sesión: lleva a «Entrar» y tampoco toca nada.
        cookieActual = "";
        await expect(fijarDemoAccion(p.id, imagen)).rejects.toBeDefined();
        expect(await vista()).toBeNull();
        // El administrador sí puede.
        cookieActual = admin.cookie;
        const resultado = await fijarDemoAccion(p.id, imagen);
        expect(resultado.ok).toBe(true);
        expect((await vista())?.tipo).toBe("imagen");
        // Y un medio ajeno lo rechaza con su causa, no con un error genérico.
        const denegado = await fijarDemoAccion(p.id, "no-es-un-uuid");
        expect(denegado).toMatchObject({ ok: false });
        expect(denegado.ok === false && denegado.error).toContain("identificador del medio no es válido");
      } finally {
        cookieActual = null;
      }
    });
  });

  describe("de quién es el medio y a quién muestra", () => {
    let otroAdmin: Sesion;
    let efimero: Sesion;
    const sembrados: string[] = [];

    const medioDe = async (dueno: string, extra: Partial<typeof media.$inferInsert> = {}) => {
      const clave = `pruebas/${prefijo}-${crypto.randomUUID()}.png`;
      await guardarObjeto(clave, new Uint8Array([1, 2, 3, 4]), "image/png");
      const [fila] = await db()
        .insert(media)
        .values({
          ownerId: dueno,
          kind: "imagen",
          storageKey: clave,
          originalName: "m.png",
          mimeType: "image/png",
          sizeBytes: 1,
          ...extra,
        })
        .returning({ id: media.id });
      if (!fila) throw new Error("No se ha creado el medio de prueba.");
      medios.push(fila.id);
      return fila.id;
    };
    const personaje = async (valores: {
      kind: "persona" | "animal";
      virtual: boolean;
      renderStyle?: "realista" | "animado";
    }) => {
      const [fila] = await db()
        .insert(characters)
        .values({ ownerId: admin.id, name: `Personaje ${crypto.randomUUID()}`, ...valores })
        .returning({ id: characters.id });
      if (!fila) throw new Error("No se ha creado el personaje de prueba.");
      sembrados.push(fila.id);
      return fila.id;
    };
    const trabajo = async (
      personajeId: string | null,
      medioId: string,
      campo: "resultMediaId" | "sourceMediaId",
      extra: { sceneId?: string; input?: Record<string, unknown> } = {},
    ) => {
      await db()
        .insert(generationJobs)
        .values({
          sceneId: extra.sceneId ?? null,
          userId: admin.id,
          kind: "fotograma",
          provider: "kie",
          model: "modelo-de-prueba",
          prompt: "x",
          input: extra.input ?? {},
          estimatedCredits: 0,
          characterId: personajeId,
          ...(campo === "resultMediaId" ? { resultMediaId: medioId } : { sourceMediaId: medioId }),
        });
    };

    beforeAll(async () => {
      [otroAdmin, efimero] = await Promise.all([crearSesionDePrueba("admin"), crearSesionDePrueba("admin")]);
    });
    afterAll(async () => {
      await db().delete(generationJobs).where(eq(generationJobs.model, "modelo-de-prueba"));
      if (sembrados.length > 0) await db().delete(characters).where(inArray(characters.id, sembrados));
      await Promise.all([otroAdmin?.borrar(), efimero?.borrar()]);
    });

    test("no vale el medio privado de un usuario normal ni el de otro administrador", async () => {
      const p = await plantilla("ajeno");
      const deAna = await medioDe(ana.id);
      const deOtroAdmin = await medioDe(otroAdmin.id);
      for (const ajeno of [deAna, deOtroAdmin]) {
        await expect(fijarDemoDePlantilla(p.id, ajeno, admin.id)).rejects.toMatchObject({ estado: 404 });
      }
      expect((await listarPlantillas()).find((v) => v.id === p.id)?.demo).toBeNull();
      // El de otro administrador sí lo puede poner ese otro administrador.
      expect((await fijarDemoDePlantilla(p.id, deOtroAdmin, otroAdmin.id)).demo).not.toBeNull();
    });

    test("un identificador que no es UUID responde 400 con su causa, sin consultar la base", async () => {
      const p = await plantilla("uuid");
      await expect(fijarDemoDePlantilla(p.id, "no-es-uuid", admin.id)).rejects.toMatchObject({
        estado: 400,
        message: expect.stringContaining("no es válido"),
      });
    });

    test("si el medio deja de ser de quien lo puso, o este pierde el rol, deja de servirse", async () => {
      const p = await plantilla("dueno");
      const mio = await medioDe(efimero.id);
      await fijarDemoDePlantilla(p.id, mio, efimero.id);
      const url = `/api/prompts/plantillas/${p.id}/demo`;
      expect((await rutaDemo.GET(pedir(ana, url), ctx(p.id))).status).toBe(200);
      // El medio pasa a otro dueño (aunque sea administrador): ya no coincide con quien lo puso.
      await db().update(media).set({ ownerId: otroAdmin.id }).where(eq(media.id, mio));
      expect((await rutaDemo.GET(pedir(ana, url), ctx(p.id))).status).toBe(404);
      expect((await rutaDemo.GET(pedir(admin, url), ctx(p.id))).status).toBe(404);
      expect((await listarPlantillas()).find((v) => v.id === p.id)?.demo).toBeNull();
      await db().update(media).set({ ownerId: efimero.id }).where(eq(media.id, mio));
      expect((await rutaDemo.GET(pedir(ana, url), ctx(p.id))).status).toBe(200);
      // Quien lo puso pierde el rol de administrador: sus ejemplos dejan de salir.
      await db().update(users).set({ role: "user" }).where(eq(users.id, efimero.id));
      try {
        expect((await rutaDemo.GET(pedir(ana, url), ctx(p.id))).status).toBe(404);
      } finally {
        await db().update(users).set({ role: "admin" }).where(eq(users.id, efimero.id));
      }
    });

    test("no vale un fotograma ni un clip hecho con un personaje real, ni como resultado ni como punto de partida", async () => {
      const p = await plantilla("real");
      const real = await personaje({ kind: "persona", virtual: false });
      const resultado = await medioDe(admin.id);
      const partida = await medioDe(admin.id);
      await trabajo(real, resultado, "resultMediaId");
      await trabajo(real, partida, "sourceMediaId");
      for (const m of [resultado, partida])
        await expect(fijarDemoDePlantilla(p.id, m, admin.id)).rejects.toMatchObject({ estado: 404 });
    });

    test("no vale un medio de una escena con un personaje real en el reparto o de protagonista, ni un fotograma maestro real", async () => {
      const p = await plantilla("escena-real");
      const real = await personaje({ kind: "persona", virtual: false });
      const [proyecto] = await db()
        .insert(projects)
        .values({ userId: admin.id, title: "P", clipSeconds: 8 })
        .returning();
      const conReparto = await medioDe(admin.id);
      const [escena] = await db()
        .insert(scenes)
        .values({ projectId: proyecto?.id ?? "", sortOrder: 1, clipMediaId: conReparto })
        .returning();
      await db()
        .insert(sceneCharacters)
        .values({ sceneId: escena?.id ?? "", characterId: real });
      const deProtagonista = await medioDe(admin.id);
      const [proyecto2] = await db()
        .insert(projects)
        .values({ userId: admin.id, title: "P2", clipSeconds: 8, mainCharacterId: real })
        .returning();
      await db()
        .insert(scenes)
        .values({ projectId: proyecto2?.id ?? "", sortOrder: 1, approvedFrameMediaId: deProtagonista });
      const maestro = await medioDe(admin.id);
      await db().update(characters).set({ masterFrameMediaId: maestro }).where(eq(characters.id, real));
      for (const m of [conReparto, deProtagonista, maestro])
        await expect(fijarDemoDePlantilla(p.id, m, admin.id)).rejects.toMatchObject({ estado: 404 });
      await db()
        .delete(projects)
        .where(inArray(projects.id, [proyecto?.id ?? "", proyecto2?.id ?? ""]));
    });

    test("sí valen los de un personaje inventado, un animal o una subida directa", async () => {
      const p = await plantilla("virtual");
      const inventado = await personaje({ kind: "persona", virtual: true });
      const mascota = await personaje({ kind: "animal", virtual: false });
      const deInventado = await medioDe(admin.id);
      const deMascota = await medioDe(admin.id);
      await trabajo(inventado, deInventado, "resultMediaId");
      await trabajo(mascota, deMascota, "resultMediaId");
      for (const m of [deInventado, deMascota, imagen])
        expect((await fijarDemoDePlantilla(p.id, m, admin.id)).demo).not.toBeNull();
    });

    test("si un medio ya elegido pasa a estar vinculado a un personaje real, deja de servirse y de verse", async () => {
      const p = await plantilla("vinculo");
      const m = await medioDe(admin.id);
      await fijarDemoDePlantilla(p.id, m, admin.id);
      const url = `/api/prompts/plantillas/${p.id}/demo`;
      expect((await listarPlantillas()).find((v) => v.id === p.id)?.demo).not.toBeNull();
      await trabajo(await personaje({ kind: "persona", virtual: false }), m, "resultMediaId");
      expect((await rutaDemo.GET(pedir(ana, url), ctx(p.id))).status).toBe(404);
      expect((await rutaDemo.GET(pedir(admin, url), ctx(p.id))).status).toBe(404);
      expect((await listarPlantillas()).find((v) => v.id === p.id)?.demo).toBeNull();
    });

    test("duplicar un trend no hereda un ejemplo que ya no vale", async () => {
      const t = await trend("dup-real");
      const m = await medioDe(admin.id);
      await fijarDemoDePlantilla(t.id, m, admin.id);
      await trabajo(await personaje({ kind: "persona", virtual: false }), m, "resultMediaId");
      claves.push(`${prefijo}-dup-real-copia`);
      expect((await duplicarTrend(t.id, `${prefijo}-dup-real-copia`, admin.id)).demo).toBeNull();
    });

    /** Escena de un proyecto de prueba con el reparto indicado (el primero es el protagonista del proyecto). */
    const escenaConReparto = async (reparto: string[], valores: Partial<typeof scenes.$inferInsert> = {}) => {
      const [proyecto] = await db()
        .insert(projects)
        .values({ userId: admin.id, title: "P", clipSeconds: 8, mainCharacterId: reparto[0] ?? null })
        .returning();
      const [escena] = await db()
        .insert(scenes)
        .values({ projectId: proyecto?.id ?? "", sortOrder: 1, ...valores })
        .returning();
      for (const [i, characterId] of reparto.entries())
        await db()
          .insert(sceneCharacters)
          .values({ sceneId: escena?.id ?? "", characterId, sortOrder: i + 1 });
      return { proyecto: proyecto?.id ?? "", escena: escena?.id ?? "" };
    };
    const rechazado = async (m: string) => {
      const p = await plantilla(`wl-${crypto.randomUUID().slice(0, 6)}`);
      await expect(fijarDemoDePlantilla(p.id, m, admin.id)).rejects.toMatchObject({ estado: 404 });
    };
    const aceptado = async (m: string) => {
      const p = await plantilla(`ok-${crypto.randomUUID().slice(0, 6)}`);
      expect((await fijarDemoDePlantilla(p.id, m, admin.id)).demo).not.toBeNull();
    };

    test("versión anterior de un dualcast con protagonista inventado y una persona real: rechazada", async () => {
      const inventado = await personaje({ kind: "persona", virtual: true });
      const real = await personaje({ kind: "persona", virtual: false });
      const { escena, proyecto } = await escenaConReparto([inventado, real]);
      const anterior = await medioDe(admin.id);
      const vigente = await medioDe(admin.id);
      // Los dos trabajos guardan solo al inventado en `character_id`, aunque en el clip salgan los dos.
      const viaje = { personajesOmni: ["a", "b"], reparto: { modo: "dualcast" } };
      await trabajo(inventado, anterior, "resultMediaId", { sceneId: escena, input: viaje });
      await trabajo(inventado, vigente, "resultMediaId", { sceneId: escena, input: viaje });
      await db().update(scenes).set({ clipMediaId: vigente }).where(eq(scenes.id, escena));
      await rechazado(anterior);
      await rechazado(vigente);
      await db().delete(projects).where(eq(projects.id, proyecto));
    });

    test("quitar a la persona real del reparto después de generar no libera el clip", async () => {
      const inventado = await personaje({ kind: "persona", virtual: true });
      const real = await personaje({ kind: "persona", virtual: false });
      const { escena, proyecto } = await escenaConReparto([inventado, real]);
      const clipDelReparto = await medioDe(admin.id);
      const otroClip = await medioDe(admin.id);
      await trabajo(inventado, clipDelReparto, "resultMediaId", {
        sceneId: escena,
        input: { reparto: { modo: "dualcast" } },
      });
      // Un trabajo sin marcas de reparto, pero de una escena en la que otro trabajo se hizo con la persona real.
      await trabajo(inventado, otroClip, "resultMediaId", { sceneId: escena });
      await trabajo(real, await medioDe(admin.id), "resultMediaId", { sceneId: escena });
      await db().delete(sceneCharacters).where(eq(sceneCharacters.characterId, real));
      await rechazado(clipDelReparto);
      await rechazado(otroClip);
      await db().delete(projects).where(eq(projects.id, proyecto));
    });

    test("la foto de una persona real quitada de su personaje, pero anotada en su versión 1, sigue rechazada", async () => {
      const real = await personaje({ kind: "persona", virtual: false });
      const foto = await medioDe(admin.id);
      await db()
        .insert(characterVersions)
        .values({
          characterId: real,
          number: 1,
          sheet: {} as never,
          referenceMediaIds: [foto],
          changedFields: [],
        });
      // Nunca hubo `character_references` (o se borró): solo queda la versión.
      await db().delete(characterReferences).where(eq(characterReferences.mediaId, foto));
      await rechazado(foto);
    });

    test("un medio de una escena sin ningún trabajo que lo explique (origen desconocido) se rechaza", async () => {
      const inventado = await personaje({ kind: "persona", virtual: true });
      const { escena, proyecto } = await escenaConReparto([inventado]);
      const sinOrigen = await medioDe(admin.id);
      await db().update(scenes).set({ referenceImageMediaId: sinOrigen }).where(eq(scenes.id, escena));
      await rechazado(sinOrigen);
      await db().delete(projects).where(eq(projects.id, proyecto));
    });

    test("un clip de una escena de un solo personaje sintético sí vale, y deja de valer si luego entra una persona real", async () => {
      const animado = await personaje({ kind: "persona", virtual: true, renderStyle: "animado" });
      const { escena, proyecto } = await escenaConReparto([animado]);
      const clipPropio = await medioDe(admin.id);
      await trabajo(animado, clipPropio, "resultMediaId", { sceneId: escena });
      await db().update(scenes).set({ clipMediaId: clipPropio }).where(eq(scenes.id, escena));
      await aceptado(clipPropio);
      // Se añade una segunda persona al reparto: el clip deja de servirse y de verse.
      const p = await plantilla("wl-luego");
      await fijarDemoDePlantilla(p.id, clipPropio, admin.id);
      await db()
        .insert(sceneCharacters)
        .values({
          sceneId: escena,
          characterId: await personaje({ kind: "persona", virtual: false }),
          sortOrder: 2,
        });
      expect((await rutaDemo.GET(pedir(ana, `/api/prompts/plantillas/${p.id}/demo`), ctx(p.id))).status).toBe(404);
      expect((await listarPlantillas()).find((v) => v.id === p.id)?.demo).toBeNull();
      await db().delete(projects).where(eq(projects.id, proyecto));
    });

    test("un personaje inventado, un animado y una mascota valen; una subida directa no vinculada, también", async () => {
      const inventado = await personaje({ kind: "persona", virtual: true });
      const animado = await personaje({ kind: "persona", virtual: true, renderStyle: "animado" });
      const mascota = await personaje({ kind: "animal", virtual: false });
      for (const c of [inventado, animado, mascota]) {
        const m = await medioDe(admin.id);
        await trabajo(c, m, "resultMediaId");
        await aceptado(m);
      }
      await aceptado(await medioDe(admin.id));
    });

    test("un medio sin personaje en el trabajo (origen no determinable) se rechaza", async () => {
      const m = await medioDe(admin.id);
      await trabajo(null, m, "resultMediaId");
      await rechazado(m);
    });

    test("la ruta corta las lecturas excesivas con 429", async () => {
      const actor = { id: crypto.randomUUID(), esAdmin: false };
      let rechazada = false;
      for (let i = 0; i < 601 && !rechazada; i++) {
        rechazada = await exigirRitmoDeEjemplos(actor).then(
          () => false,
          (e) => e instanceof ErrorPreset && e.estado === 429,
        );
      }
      expect(rechazada).toBe(true);
    });
  });

  describe("la ruta que sirve el ejemplo", () => {
    test("un usuario recibe el ejemplo de una plantilla activa con cabeceras seguras", async () => {
      const p = await plantilla("ruta");
      await fijarDemoDePlantilla(p.id, imagen, admin.id);
      const r = await rutaDemo.GET(pedir(ana, `/api/prompts/plantillas/${p.id}/demo`), ctx(p.id));
      expect(r.status).toBe(200);
      // La biblioteca reconvierte las imágenes al subirlas: se comprueba el tipo real, no el de origen.
      expect(r.headers.get("content-type")).toMatch(/^image\/(png|webp|jpeg)$/);
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("content-disposition")).toBe("inline");
      expect(r.headers.get("cache-control")).toBe("private, no-store");
      expect(r.headers.get("content-security-policy")).toContain("sandbox");
      expect(r.headers.get("cross-origin-resource-policy")).toBe("same-origin");
      expect((await r.arrayBuffer()).byteLength).toBeGreaterThan(50);
    });

    test("sin sesión responde 401", async () => {
      const p = await plantilla("sinsesion");
      await fijarDemoDePlantilla(p.id, imagen, admin.id);
      const r = await rutaDemo.GET(pedir(null, `/api/prompts/plantillas/${p.id}/demo`), ctx(p.id));
      expect(r.status).toBe(401);
    });

    test("un clip admite Range: tramo, cola, entero y fuera de rango", async () => {
      const p = await trend("rango");
      await fijarDemoDePlantilla(p.id, clip, admin.id);
      const url = `/api/prompts/plantillas/${p.id}/demo`;
      const entero = await rutaDemo.GET(pedir(ana, url), ctx(p.id));
      expect(entero.status).toBe(200);
      expect(entero.headers.get("accept-ranges")).toBe("bytes");
      expect(entero.headers.get("content-length")).toBe("1000");
      expect(new Uint8Array(await entero.arrayBuffer())).toEqual(bytesDelClip);

      const tramo = await rutaDemo.GET(pedir(ana, url, { range: "bytes=10-19" }), ctx(p.id));
      expect(tramo.status).toBe(206);
      expect(tramo.headers.get("content-range")).toBe("bytes 10-19/1000");
      expect(new Uint8Array(await tramo.arrayBuffer())).toEqual(bytesDelClip.slice(10, 20));

      const cola = await rutaDemo.GET(pedir(ana, url, { range: "bytes=-5" }), ctx(p.id));
      expect(cola.status).toBe(206);
      expect(new Uint8Array(await cola.arrayBuffer())).toEqual(bytesDelClip.slice(995));

      const fuera = await rutaDemo.GET(pedir(ana, url, { range: "bytes=5000-" }), ctx(p.id));
      expect(fuera.status).toBe(416);
      expect(fuera.headers.get("content-range")).toBe("bytes */1000");
    });

    test("no enseña el ejemplo de una plantilla desactivada, de un trend caducado ni de uno en revisión", async () => {
      const desactivada = await plantilla("off");
      const caducado = await trend("caducado");
      const enRevision = await trend("revision", "revision");
      for (const p of [desactivada, caducado, enRevision]) await fijarDemoDePlantilla(p.id, imagen, admin.id);
      await activarPlantillaDeLaInstalacion(desactivada.id, false);
      await caducarTrend(caducado.id);
      for (const p of [desactivada, caducado, enRevision]) {
        const r = await rutaDemo.GET(pedir(ana, `/api/prompts/plantillas/${p.id}/demo`), ctx(p.id));
        expect(r.status, p.nombre).toBe(404);
        // Quien administra sí lo ve, para revisarlo antes de publicar o después de retirar.
        const admin200 = await rutaDemo.GET(pedir(admin, `/api/prompts/plantillas/${p.id}/demo`), ctx(p.id));
        expect(admin200.status, p.nombre).toBe(200);
      }
    });

    test("con los trends ocultos en los ajustes, el ejemplo de un trend no se sirve", async () => {
      const t = await trend("oculto");
      await fijarDemoDePlantilla(t.id, imagen, admin.id);
      const url = `/api/prompts/plantillas/${t.id}/demo`;
      expect((await rutaDemo.GET(pedir(ana, url), ctx(t.id))).status).toBe(200);
      await guardarAjustes({ trendsVisibles: false }, null);
      try {
        expect((await rutaDemo.GET(pedir(ana, url), ctx(t.id))).status).toBe(404);
        expect((await rutaDemo.GET(pedir(admin, url), ctx(t.id))).status).toBe(200);
      } finally {
        await guardarAjustes({ trendsVisibles: true }, null);
      }
    });

    test("una plantilla sin ejemplo, un identificador inventado y uno mal escrito responden 404", async () => {
      const p = await plantilla("vacia");
      for (const id of [p.id, crypto.randomUUID(), "no-es-un-uuid"]) {
        const r = await rutaDemo.GET(pedir(ana, `/api/prompts/plantillas/${id}/demo`), ctx(id));
        expect(r.status, id).toBe(404);
      }
    });

    test("no abre el resto de la biblioteca de quien administra: el archivo sigue siendo solo suyo", async () => {
      const p = await plantilla("biblioteca");
      await fijarDemoDePlantilla(p.id, imagen, admin.id);
      const ajeno = await rutaArchivoMedio.GET(pedir(ana, `/api/media/${imagen}/archivo`), ctx(imagen));
      expect(ajeno.status).toBe(404);
      // Ni tampoco un identificador de medio puesto donde va el de plantilla.
      const cruzado = await rutaDemo.GET(pedir(ana, `/api/prompts/plantillas/${imagen}/demo`), ctx(imagen));
      expect(cruzado.status).toBe(404);
    });

    test("un medio que pasa a ser reservado o a la papelera deja de servirse y de verse", async () => {
      const p = await plantilla("reservado");
      expect((await fijarDemoDePlantilla(p.id, clip, admin.id)).demo).not.toBeNull();
      const url = `/api/prompts/plantillas/${p.id}/demo`;
      expect((await rutaDemo.GET(pedir(ana, url), ctx(p.id))).status).toBe(200);
      try {
        await db().update(media).set({ isDocument: true }).where(eq(media.id, clip));
        expect((await rutaDemo.GET(pedir(ana, url), ctx(p.id))).status).toBe(404);
        expect((await rutaDemo.GET(pedir(admin, url), ctx(p.id))).status).toBe(404);
        expect((await listarPlantillas()).find((v) => v.id === p.id)?.demo).toBeNull();
        await db().update(media).set({ isDocument: false, deletedAt: new Date() }).where(eq(media.id, clip));
        expect((await rutaDemo.GET(pedir(ana, url), ctx(p.id))).status).toBe(404);
      } finally {
        await db().update(media).set({ isDocument: false, deletedAt: null }).where(eq(media.id, clip));
      }
    });
  });

  describe("lo que llega al navegador de un usuario", () => {
    test("el catálogo y los trends llevan el ejemplo pero nunca el texto de la plantilla ni el medio", async () => {
      const base = await plantilla("catalogo");
      const t = await trend("catalogo-trend");
      await fijarDemoDePlantilla(base.id, imagen, admin.id);
      await fijarDemoDePlantilla(t.id, clip, admin.id);

      const cat = await rutaCatalogo.GET(pedir(ana, "/api/prompts/catalogo?tipo=fotograma"), undefined);
      const textoCat = await cat.text();
      const catalogo = JSON.parse(textoCat) as {
        plantillas: { id: string; demo: { tipo: string; url: string } | null }[];
      };
      expect(catalogo.plantillas.find((x) => x.id === base.id)?.demo?.tipo).toBe("imagen");

      const tr = await rutaTrends.GET(pedir(ana, "/api/prompts/trends"), undefined);
      const textoTrends = await tr.text();
      const trends = JSON.parse(textoTrends) as { trends: { id: string; demo: { tipo: string } | null }[] };
      expect(trends.trends.find((x) => x.id === t.id)?.demo?.tipo).toBe("video");

      for (const cuerpo of [textoCat, textoTrends]) {
        expect(cuerpo).not.toContain(CENTINELA_DEL_TEXTO);
        expect(cuerpo).not.toContain(imagen);
        expect(cuerpo).not.toContain(clip);
        expect(cuerpo).not.toContain("pruebas/");
      }
    });

    test("una plantilla desactivada no sale en el catálogo, y su ejemplo tampoco", async () => {
      const p = await plantilla("catalogo-off");
      await fijarDemoDePlantilla(p.id, imagen, admin.id);
      await activarPlantillaDeLaInstalacion(p.id, false);
      const cat = await rutaCatalogo.GET(pedir(ana, "/api/prompts/catalogo?tipo=fotograma"), undefined);
      expect(await cat.text()).not.toContain(p.id);
    });
  });
});
