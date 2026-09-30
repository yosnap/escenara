import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Publicar, moderar, ver, editar, retirar, usar y exportar, contra PostgreSQL y el almacenamiento, **por las rutas**
 * (con sesiones reales) donde lo que se prueba es la autorización. Ningún proveedor ni ningún crédito.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_comunidad_publicacion");
}

const { eq } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { communityPostMedia, communityPosts, communityUses, media, promptTemplates } = await import("../db/esquema");
const { guardarAjustes } = await import("../ajustes");
const { leerObjeto } = await import("../almacenamiento");
const { galeria, misPublicaciones } = await import("./consulta");
const { exportarMiComunidad } = await import("./exportacion");
const { moderar: moderarDirecto } = await import("./moderacion");
const f = await import("./comunidad-de-prueba");
const rutaPublicar = await import("@/app/api/comunidad/publicaciones/route");
const rutaPublicacion = await import("@/app/api/comunidad/publicaciones/[id]/route");
const rutaMedio = await import("@/app/api/comunidad/publicaciones/[id]/medios/[posicion]/route");
const rutaUsar = await import("@/app/api/comunidad/publicaciones/[id]/usar/route");
const rutaModerar = await import("@/app/api/admin/moderacion/[id]/route");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
const ORIGEN = "http://localhost";
const pedir = (s: Sesion, metodo: string, url: string, cuerpo?: unknown) =>
  new Request(`${ORIGEN}${url}`, {
    method: metodo,
    headers: { cookie: s.cookie, origin: ORIGEN, "content-type": "application/json" },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const ctxMedio = (id: string, posicion = "0") => ({ params: Promise.resolve({ id, posicion }) });
const existe = async (clave: string) => await leerObjeto(clave).exists();
const CENTINELA_PROMPT = "centinela-del-prompt-interno";
const CENTINELA_MODELO = "modelo-de-pago-centinela";

describe.skipIf(!hayBaseDeDatos)("publicar y moderar en la comunidad", () => {
  let ana: Sesion;
  let beto: Sesion;
  let admin: Sesion;
  let otroAdmin: Sesion;

  const publicarClip = async (s: Sesion, medioId: string, extra: Record<string, unknown> = {}) =>
    await rutaPublicar.POST(
      pedir(s, "POST", "/api/comunidad/publicaciones", {
        origen: { tipo: "medio", id: medioId },
        tipo: "clip",
        titulo: "Mi clip sintético",
        descripcion: "Hecho con mi personaje inventado.",
        firma: "Ana crea",
        declaracion: true,
        ...extra,
      }),
      undefined,
    );
  const moderar = async (s: Sesion, id: string, cuerpo: Record<string, unknown>) =>
    await rutaModerar.POST(pedir(s, "POST", `/api/admin/moderacion/${id}`, cuerpo), ctx(id));
  const clipSintetico = async (s: Sesion, extra: Partial<import("./comunidad-de-prueba").OpcionesTrabajo> = {}) =>
    await f.clipDePrueba(s.id, await f.inventadoDePrueba(s.id), {
      prompt: CENTINELA_PROMPT,
      model: CENTINELA_MODELO,
      ...extra,
    });

  beforeAll(async () => {
    await aplicarMigraciones();
    [ana, beto, admin, otroAdmin] = await Promise.all([
      crearSesionDePrueba("user"),
      crearSesionDePrueba("user"),
      crearSesionDePrueba("admin"),
      crearSesionDePrueba("admin"),
    ]);
    await guardarAjustes({ comunidadActiva: true }, null);
  });
  afterAll(async () => {
    await guardarAjustes({ comunidadActiva: false }, null);
    await Promise.all([ana?.borrar(), beto?.borrar(), admin?.borrar(), otroAdmin?.borrar()]);
  });

  test("apagada (de fábrica), no se publica nada y se dice por qué", async () => {
    await guardarAjustes({ comunidadActiva: false }, null);
    const clip = await clipSintetico(ana);
    const r = await publicarClip(ana, clip.id);
    expect(r.status).toBe(409);
    expect((await r.json()).error).toContain("apagada");
    await guardarAjustes({ comunidadActiva: true }, null);
  });

  test("sin la declaración expresa no se publica", async () => {
    const clip = await clipSintetico(ana);
    const r = await publicarClip(ana, clip.id, { declaracion: false });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("Confirmo que es contenido sintético");
  });

  test("lo no elegible (una persona real) se rechaza con su causa y sin copiar nada", async () => {
    const clip = await f.clipDePrueba(ana.id, await f.personajeRealDePrueba(ana.id));
    const r = await publicarClip(ana, clip.id);
    expect(r.status).toBe(422);
    expect((await r.json()).error).toContain("no es inventado");
    expect(await db().select().from(communityPosts).where(eq(communityPosts.sourceMediaId, clip.id))).toEqual([]);
  });

  test("nada es visible sin aprobación; la copia es idéntica y propia; nadie aprueba lo suyo", async () => {
    const clip = await clipSintetico(ana);
    const r = await publicarClip(ana, clip.id);
    expect(r.status).toBe(201);
    const pub = await r.json();
    expect(pub.estado).toBe("pendiente");
    // Idempotencia: publicar lo mismo otra vez devuelve la misma publicación, sin otra copia.
    const otra = await publicarClip(ana, clip.id);
    expect(otra.status).toBe(200);
    expect((await otra.json()).id).toBe(pub.id);
    const copias = await db().select().from(communityPostMedia).where(eq(communityPostMedia.postId, pub.id));
    expect(copias).toHaveLength(1);
    const copia = copias[0];
    if (!copia) throw new Error("sin copia");
    expect(copia.storageKey.startsWith(`comunidad/${pub.id}/`)).toBe(true);
    expect(copia.storageKey).not.toBe(clip.clave);
    expect(new Uint8Array(await leerObjeto(copia.storageKey).arrayBuffer())).toEqual(clip.bytes);

    // Pendiente: fuera de la galería; su archivo solo para su autor y quien modera.
    expect((await galeria()).some((p) => p.id === pub.id)).toBe(false);
    expect((await rutaMedio.GET(pedir(beto, "GET", pub.medios[0].url), ctxMedio(pub.id))).status).toBe(404);
    expect((await rutaMedio.GET(pedir(ana, "GET", pub.medios[0].url), ctxMedio(pub.id))).status).toBe(200);
    expect((await rutaMedio.GET(pedir(admin, "GET", pub.medios[0].url), ctxMedio(pub.id))).status).toBe(200);

    // Autorización por rol: un usuario no modera (404, como si no existiera).
    expect((await moderar(beto, pub.id, { accion: "aprobar", revision: 1 })).status).toBe(404);
    expect((await moderar(ana, pub.id, { accion: "aprobar", revision: 1 })).status).toBe(404);
    // Y la función, aunque alguien la llame sin pasar por la ruta.
    await expect(
      moderarDirecto({ id: beto.id, esAdmin: false }, pub.id, 1, { accion: "aprobar" }),
    ).rejects.toMatchObject({
      estado: 404,
    });
    expect((await galeria()).some((p) => p.id === pub.id)).toBe(false);

    const aprobada = await moderar(admin, pub.id, { accion: "aprobar", revision: 1 });
    expect(aprobada.status).toBe(200);
    expect((await galeria()).some((p) => p.id === pub.id)).toBe(true);
    const archivo = await rutaMedio.GET(pedir(beto, "GET", pub.medios[0].url), ctxMedio(pub.id));
    expect(archivo.status).toBe(200);
    expect(archivo.headers.get("x-content-type-options")).toBe("nosniff");
    expect(archivo.headers.get("cache-control")).toBe("private, no-store");
    // Una posición que no existe responde 404.
    expect((await rutaMedio.GET(pedir(beto, "GET", pub.medios[0].url), ctxMedio(pub.id, "7"))).status).toBe(404);
  });

  test("nadie aprueba lo suyo, aunque sea administrador", async () => {
    const clip = await clipSintetico(admin);
    const pub = await (await publicarClip(admin, clip.id)).json();
    const r = await moderar(admin, pub.id, { accion: "aprobar", revision: 1 });
    expect(r.status).toBe(403);
    expect((await r.json()).error).toContain("Nadie modera lo suyo");
    expect((await moderar(otroAdmin, pub.id, { accion: "aprobar", revision: 1 })).status).toBe(200);
  });

  test("campos filtrados: la galería no lleva prompt, modelo, correo, claves ni identificadores del original", async () => {
    const clip = await clipSintetico(ana);
    const pub = await (await publicarClip(ana, clip.id)).json();
    await moderar(admin, pub.id, { accion: "aprobar", revision: 1 });
    const [fila] = await db().select().from(communityPostMedia).where(eq(communityPostMedia.postId, pub.id));
    const texto = JSON.stringify(await galeria());
    for (const prohibido of [
      CENTINELA_PROMPT,
      CENTINELA_MODELO,
      ana.email,
      ana.id,
      clip.id,
      clip.clave,
      fila?.storageKey ?? "-",
    ]) {
      expect(texto).not.toContain(prohibido);
    }
    const vista = (await galeria()).find((p) => p.id === pub.id);
    expect(Object.keys(vista ?? {}).sort()).toEqual(
      ["descripcion", "firma", "id", "medios", "plantilla", "publicadaEl", "reto", "tipo", "titulo", "usos"].sort(),
    );
  });

  test("editar la vuelve a moderación: deja de verse y la revisión vieja ya no se puede aprobar", async () => {
    const clip = await clipSintetico(ana);
    const pub = await (await publicarClip(ana, clip.id)).json();
    await moderar(admin, pub.id, { accion: "aprobar", revision: 1 });
    const editada = await rutaPublicacion.PATCH(
      pedir(ana, "PATCH", `/api/comunidad/publicaciones/${pub.id}`, { titulo: "Nuevo título", firma: "Ana crea" }),
      ctx(pub.id),
    );
    expect(editada.status).toBe(200);
    expect((await editada.json()).estado).toBe("pendiente");
    expect((await galeria()).some((p) => p.id === pub.id)).toBe(false);
    expect((await moderar(admin, pub.id, { accion: "aprobar", revision: 1 })).status).toBe(409);
    expect((await moderar(admin, pub.id, { accion: "aprobar", revision: 2 })).status).toBe(200);
    // Otra persona no puede editar la de Ana.
    const ajena = await rutaPublicacion.PATCH(
      pedir(beto, "PATCH", `/api/comunidad/publicaciones/${pub.id}`, { titulo: "Robado", firma: "Beto" }),
      ctx(pub.id),
    );
    expect(ajena.status).toBe(404);
  });

  test("rechazar exige motivo escrito y el autor lo ve", async () => {
    const clip = await clipSintetico(ana);
    const pub = await (await publicarClip(ana, clip.id)).json();
    expect((await moderar(admin, pub.id, { accion: "rechazar", revision: 1, motivo: "corto" })).status).toBe(400);
    const motivo = "Sale un logotipo real en la camiseta; quítalo y vuelve a enviarlo.";
    expect((await moderar(admin, pub.id, { accion: "rechazar", revision: 1, motivo })).status).toBe(200);
    const mia = (await misPublicaciones({ id: ana.id, esAdmin: false })).find((p) => p.id === pub.id);
    expect(mia?.estado).toBe("rechazada");
    expect(mia?.motivoRechazo).toBe(motivo);
    expect((await galeria()).some((p) => p.id === pub.id)).toBe(false);
  });

  test("retirar borra la publicación y la copia, deja el original y se puede repetir", async () => {
    const clip = await clipSintetico(ana);
    const pub = await (await publicarClip(ana, clip.id)).json();
    await moderar(admin, pub.id, { accion: "aprobar", revision: 1 });
    const [copia] = await db().select().from(communityPostMedia).where(eq(communityPostMedia.postId, pub.id));
    if (!copia) throw new Error("sin copia");
    // Otra persona no puede retirarla: responde igual, pero no pasa nada.
    await rutaPublicacion.DELETE(pedir(beto, "DELETE", `/api/comunidad/publicaciones/${pub.id}`), ctx(pub.id));
    expect(await existe(copia.storageKey)).toBe(true);

    const r = await rutaPublicacion.DELETE(pedir(ana, "DELETE", `/api/comunidad/publicaciones/${pub.id}`), ctx(pub.id));
    expect(r.status).toBe(200);
    expect(await db().select().from(communityPosts).where(eq(communityPosts.id, pub.id))).toEqual([]);
    expect(await existe(copia.storageKey)).toBe(false);
    expect(await existe(clip.clave)).toBe(true);
    expect(await db().select({ id: media.id }).from(media).where(eq(media.id, clip.id))).toHaveLength(1);
    const otra = await rutaPublicacion.DELETE(
      pedir(ana, "DELETE", `/api/comunidad/publicaciones/${pub.id}`),
      ctx(pub.id),
    );
    expect(otra.status).toBe(200);
    expect((await rutaMedio.GET(pedir(ana, "GET", pub.medios[0].url), ctxMedio(pub.id))).status).toBe(404);
  });

  test("usar un trend compartido: atribución, un uso por persona, sin texto del prompt; un clip no se «usa»", async () => {
    const [plantilla] = await db()
      .insert(promptTemplates)
      .values({
        slug: `trend-usar-${crypto.randomUUID().slice(0, 6)}`,
        name: "Trend para usar",
        kind: "trend",
        trendStatus: "vigente",
        capability: "image_to_video",
        template: `${CENTINELA_PROMPT} {{escena}}`,
      })
      .returning({ id: promptTemplates.id });
    if (!plantilla) throw new Error("sin plantilla");
    const clip = await clipSintetico(ana, { plantillaId: plantilla.id });
    const pub = await (await publicarClip(ana, clip.id, { tipo: "trend" })).json();
    expect(pub.plantilla).toEqual({ id: plantilla.id, nombre: "Trend para usar" });
    // Sin aprobar, nadie la usa.
    expect((await rutaUsar.POST(pedir(beto, "POST", "/x"), ctx(pub.id))).status).toBe(404);
    await moderar(admin, pub.id, { accion: "aprobar", revision: 1 });
    for (let i = 0; i < 2; i++) {
      const r = await rutaUsar.POST(pedir(beto, "POST", "/x"), ctx(pub.id));
      expect(r.status).toBe(200);
      const cuerpo = await r.json();
      expect(cuerpo.destino).toBe(`/crear?plantilla=${plantilla.id}&desde=${pub.id}`);
      expect(JSON.stringify(cuerpo)).not.toContain(CENTINELA_PROMPT);
    }
    expect(await db().select().from(communityUses).where(eq(communityUses.postId, pub.id))).toHaveLength(1);
    expect((await galeria({ tipo: "trend" })).find((p) => p.id === pub.id)?.usos).toBe(1);

    const soloClip = await (await publicarClip(ana, (await clipSintetico(ana)).id)).json();
    await moderar(admin, soloClip.id, { accion: "aprobar", revision: 1 });
    expect((await rutaUsar.POST(pedir(beto, "POST", "/x"), ctx(soloClip.id))).status).toBe(409);
    await rutaPublicacion.DELETE(pedir(ana, "DELETE", `/x`), ctx(pub.id));
    await db().delete(promptTemplates).where(eq(promptTemplates.id, plantilla.id));
  });

  test("exportar: tus publicaciones (con estado y motivo) y nada de otras cuentas", async () => {
    const deBeto = await (await publicarClip(beto, (await clipSintetico(beto)).id, { firma: "Beto" })).json();
    const exportado = await exportarMiComunidad({ id: ana.id, esAdmin: false });
    expect(exportado.esquema).toBe("escenara.comunidad");
    expect(exportado.publicaciones.length).toBeGreaterThan(0);
    expect(exportado.publicaciones.every((p) => "estado" in p && "motivoRechazo" in p)).toBe(true);
    expect(exportado.publicaciones.some((p) => p.id === deBeto.id)).toBe(false);
    const texto = JSON.stringify(exportado);
    expect(texto).not.toContain(CENTINELA_PROMPT);
    expect(texto).not.toContain("pruebas/comunidad/");
  });

  test("con la comunidad apagada, lo aprobado deja de verse para los demás pero su autor lo sigue viendo", async () => {
    const clip = await clipSintetico(ana);
    const pub = await (await publicarClip(ana, clip.id)).json();
    await moderar(admin, pub.id, { accion: "aprobar", revision: 1 });
    await guardarAjustes({ comunidadActiva: false }, null);
    expect(await galeria()).toEqual([]);
    expect((await rutaMedio.GET(pedir(beto, "GET", pub.medios[0].url), ctxMedio(pub.id))).status).toBe(404);
    expect((await rutaMedio.GET(pedir(ana, "GET", pub.medios[0].url), ctxMedio(pub.id))).status).toBe(200);
    await guardarAjustes({ comunidadActiva: true }, null);
  });
});
