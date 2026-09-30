import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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

const { eq, inArray } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { media, promptTemplates, promptTemplateVersions } = await import("../db/esquema");
const { guardarObjeto } = await import("../almacenamiento");
const { guardarAjustes } = await import("../ajustes");
const { crearMedio } = await import("../media/servicio");
const { ErrorPreset } = await import("./errores");
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
      const con = await fijarDemoDePlantilla(p.id, imagen);
      expect(con.demo).toMatchObject({ tipo: "imagen", ancho: 64, alto: 96 });
      expect(con.demo?.url).toContain(`/api/prompts/plantillas/${p.id}/demo?v=`);
      expect(con.demo?.url).not.toContain(imagen);
      expect(con.demo?.alt).toBe("Imagen de ejemplo de «Plantilla versiona»");
      expect(con.version).toBe(p.version);
      expect(con.versionId).toBe(p.versionId);
      expect(con.plantilla).toBe(p.plantilla);
      expect((await versiones(p.id)).length).toBe(antes.length);

      const sin = await fijarDemoDePlantilla(p.id, null);
      expect(sin.demo).toBeNull();
      expect((await versiones(p.id)).length).toBe(antes.length);
    });

    test("un clip se ve como vídeo con el texto alternativo del medio", async () => {
      const p = await plantilla("clip");
      const con = await fijarDemoDePlantilla(p.id, clip);
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
      await expect(fijarDemoDePlantilla(p.id, audio)).rejects.toMatchObject({ estado: 400 });
      await expect(fijarDemoDePlantilla(p.id, svg)).rejects.toMatchObject({ estado: 400 });
      await expect(fijarDemoDePlantilla(p.id, papelera)).rejects.toMatchObject({ estado: 404 });
      await expect(fijarDemoDePlantilla(p.id, documento)).rejects.toMatchObject({ estado: 404 });
      await expect(fijarDemoDePlantilla(p.id, crypto.randomUUID())).rejects.toMatchObject({ estado: 404 });
      await expect(fijarDemoDePlantilla(p.id, 5)).rejects.toBeInstanceOf(ErrorPreset);
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
      await expect(fijarDemoDePlantilla(ajena?.id ?? "", imagen)).rejects.toMatchObject({ estado: 404 });
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
      await fijarDemoDePlantilla(p.id, efimero?.id ?? "");
      await db()
        .delete(media)
        .where(eq(media.id, efimero?.id ?? ""));
      const vista = (await listarPlantillas()).find((v) => v.id === p.id);
      expect(vista?.demo).toBeNull();
      expect(vista?.plantilla).toBe(p.plantilla);
    });

    test("duplicar un trend conserva su ejemplo", async () => {
      const t = await trend("dup");
      await fijarDemoDePlantilla(t.id, clip);
      claves.push(`${prefijo}-dup-copia`);
      const copia = await duplicarTrend(t.id, `${prefijo}-dup-copia`, admin.id);
      expect(copia.demo?.tipo).toBe("video");
    });

    test("solo el panel de administración puede cambiarlo", async () => {
      const { fijarDemoAccion } = await import("@/app/admin/plantillas/acciones");
      const p = await plantilla("puerta");
      await expect(fijarDemoAccion(p.id, imagen)).rejects.toThrow();
      expect((await listarPlantillas()).find((v) => v.id === p.id)?.demo).toBeNull();
      const codigo = await Bun.file(path.resolve(import.meta.dirname, "../../app/admin/plantillas/acciones.ts")).text();
      const cuerpo = /export async function fijarDemoAccion\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(codigo)?.[1] ?? "";
      expect(cuerpo).toContain("aplicar(");
      // `aplicar` es lo único que toca la base, y empieza exigiendo el rol.
      const aplicar = /async function aplicar\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(codigo)?.[1] ?? "";
      expect(aplicar.indexOf("exigirAdmin")).toBeGreaterThanOrEqual(0);
      expect(aplicar.indexOf("exigirAdmin")).toBeLessThan(aplicar.indexOf("accion("));
    });
  });

  describe("la ruta que sirve el ejemplo", () => {
    test("un usuario recibe el ejemplo de una plantilla activa con cabeceras seguras", async () => {
      const p = await plantilla("ruta");
      await fijarDemoDePlantilla(p.id, imagen);
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
      await fijarDemoDePlantilla(p.id, imagen);
      const r = await rutaDemo.GET(pedir(null, `/api/prompts/plantillas/${p.id}/demo`), ctx(p.id));
      expect(r.status).toBe(401);
    });

    test("un clip admite Range: tramo, cola, entero y fuera de rango", async () => {
      const p = await trend("rango");
      await fijarDemoDePlantilla(p.id, clip);
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
      for (const p of [desactivada, caducado, enRevision]) await fijarDemoDePlantilla(p.id, imagen);
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
      await fijarDemoDePlantilla(t.id, imagen);
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
      await fijarDemoDePlantilla(p.id, imagen);
      const ajeno = await rutaArchivoMedio.GET(pedir(ana, `/api/media/${imagen}/archivo`), ctx(imagen));
      expect(ajeno.status).toBe(404);
      // Ni tampoco un identificador de medio puesto donde va el de plantilla.
      const cruzado = await rutaDemo.GET(pedir(ana, `/api/prompts/plantillas/${imagen}/demo`), ctx(imagen));
      expect(cruzado.status).toBe(404);
    });

    test("un medio que pasa a ser reservado o a la papelera deja de servirse y de verse", async () => {
      const p = await plantilla("reservado");
      expect((await fijarDemoDePlantilla(p.id, clip)).demo).not.toBeNull();
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
      await fijarDemoDePlantilla(base.id, imagen);
      await fijarDemoDePlantilla(t.id, clip);

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
      await fijarDemoDePlantilla(p.id, imagen);
      await activarPlantillaDeLaInstalacion(p.id, false);
      const cat = await rutaCatalogo.GET(pedir(ana, "/api/prompts/catalogo?tipo=fotograma"), undefined);
      expect(await cat.text()).not.toContain(p.id);
    });
  });
});
