import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { Coleccion, EspacioUsado, Medio, PaginaMedios } from "@/lib/media/tipos";

// Autorización de la biblioteca por usuario contra PostgreSQL y SeaweedFS locales.
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

const rutaLista = await import("@/app/api/media/route");
const rutaMedio = await import("@/app/api/media/[id]/route");
const rutaRestaurar = await import("@/app/api/media/[id]/restaurar/route");
const rutaArchivo = await import("@/app/api/media/[id]/archivo/route");
const rutaEspacio = await import("@/app/api/media/espacio/route");
const rutaColecciones = await import("@/app/api/colecciones/route");
const rutaColeccion = await import("@/app/api/colecciones/[id]/route");
const rutaColeccionMedios = await import("@/app/api/colecciones/[id]/medios/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { db } = await import("../db/cliente");
const { users } = await import("../db/esquema");
const { eq } = await import("drizzle-orm");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const pedir = (s: Sesion, url: string, init: RequestInit = {}) =>
  new Request(`http://localhost${url}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), cookie: s.cookie },
  });
const json = (s: Sesion, url: string, metodo: string, cuerpo: unknown) =>
  pedir(s, url, { method: metodo, body: JSON.stringify(cuerpo), headers: { "Content-Type": "application/json" } });

async function subirImagen(s: Sesion, nombre: string): Promise<Medio> {
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#3d6bff" } })
    .png()
    .toBuffer();
  const datos = new FormData();
  datos.set("archivo", new File([png], nombre, { type: "image/png" }));
  const r = await rutaLista.POST(pedir(s, "/api/media", { method: "POST", body: datos }), undefined);
  expect(r.status).toBe(201);
  return r.json();
}

describe.skipIf(!process.env.DATABASE_URL)("biblioteca por usuario", () => {
  let ana: Sesion;
  let beto: Sesion;
  let admin: Sesion;
  let deAna: Medio;
  let deBeto: Medio;

  beforeAll(async () => {
    await aplicarMigraciones();
    [ana, beto, admin] = await Promise.all([
      crearSesionDePrueba("user"),
      crearSesionDePrueba("user"),
      crearSesionDePrueba("admin"),
    ]);
    deAna = await subirImagen(ana, "de-ana.png");
    deBeto = await subirImagen(beto, "de-beto.png");
  });

  afterAll(async () => {
    // Borrar los usuarios borra en cascada sus medios y colecciones.
    await Promise.all([ana.borrar(), beto.borrar(), admin.borrar()]);
  });

  test("cada usuario solo ve sus propios medios", async () => {
    const lista = (await (await rutaLista.GET(pedir(ana, "/api/media"), undefined)).json()) as PaginaMedios;
    expect(lista.elementos.map((m) => m.id)).toEqual([deAna.id]);
    expect(lista.elementos[0]?.propietario).toBeUndefined();
    // Un usuario normal no puede pedir los de todos: el filtro se ignora.
    const intento = (await (
      await rutaLista.GET(pedir(ana, "/api/media?propietario=todos"), undefined)
    ).json()) as PaginaMedios;
    expect(intento.elementos.map((m) => m.id)).toEqual([deAna.id]);
  });

  test("lo ajeno responde 404 en todas las operaciones", async () => {
    const id = deBeto.id;
    const url = `/api/media/${id}`;
    expect((await rutaMedio.GET(pedir(ana, url), ctx(id))).status).toBe(404);
    expect((await rutaMedio.PATCH(json(ana, url, "PATCH", { titulo: "mío" }), ctx(id))).status).toBe(404);
    expect((await rutaMedio.DELETE(pedir(ana, url, { method: "DELETE" }), ctx(id))).status).toBe(404);
    expect((await rutaRestaurar.POST(pedir(ana, `${url}/restaurar`, { method: "POST" }), ctx(id))).status).toBe(404);
    expect((await rutaArchivo.GET(pedir(ana, `${url}/archivo`), ctx(id))).status).toBe(404);
    const datos = new FormData();
    datos.set("archivo", new File([new Uint8Array([1])], "x.png", { type: "image/png" }));
    expect((await rutaMedio.PUT(pedir(ana, url, { method: "PUT", body: datos }), ctx(id))).status).toBe(404);
    // Beto sigue teniendo su medio intacto.
    const suyo = (await (await rutaMedio.GET(pedir(beto, url), ctx(id))).json()) as Medio;
    expect(suyo).toMatchObject({ titulo: "", enPapelera: false });
  });

  test("el admin ve los de todos con su dueño, edita datos y usa la papelera", async () => {
    const todos = (await (
      await rutaLista.GET(pedir(admin, "/api/media?propietario=todos&busqueda=de-"), undefined)
    ).json()) as PaginaMedios;
    const deBetoVisto = todos.elementos.find((m) => m.id === deBeto.id);
    expect(deBetoVisto?.propietario?.nombre).toBe("Prueba user");
    expect(deBetoVisto?.permisos).toEqual({ editarImagen: false, borrarDefinitivo: false });

    const url = `/api/media/${deBeto.id}`;
    const editado = await rutaMedio.PATCH(json(admin, url, "PATCH", { altEs: "Revisado" }), ctx(deBeto.id));
    expect(await editado.json()).toMatchObject({ altEs: "Revisado" });
    expect((await rutaMedio.DELETE(pedir(admin, url, { method: "DELETE" }), ctx(deBeto.id))).status).toBe(200);
    expect(
      (await rutaRestaurar.POST(pedir(admin, `${url}/restaurar`, { method: "POST" }), ctx(deBeto.id))).status,
    ).toBe(200);
  });

  test("el admin no borra para siempre ni edita la imagen de lo ajeno", async () => {
    const url = `/api/media/${deBeto.id}`;
    await rutaMedio.DELETE(pedir(admin, url, { method: "DELETE" }), ctx(deBeto.id));
    const borrado = await rutaMedio.DELETE(pedir(admin, `${url}?definitivo=1`, { method: "DELETE" }), ctx(deBeto.id));
    expect(borrado.status).toBe(403);
    await rutaRestaurar.POST(pedir(beto, `${url}/restaurar`, { method: "POST" }), ctx(deBeto.id));
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } })
      .png()
      .toBuffer();
    const datos = new FormData();
    datos.set("archivo", new File([png], "x.png", { type: "image/png" }));
    expect((await rutaMedio.PUT(pedir(admin, url, { method: "PUT", body: datos }), ctx(deBeto.id))).status).toBe(403);
  });

  test("colecciones privadas: solo con archivos propios y el admin solo las lee", async () => {
    const creada = (await (
      await rutaColecciones.POST(json(ana, "/api/colecciones", "POST", { nombre: "  Viajes  " }), undefined)
    ).json()) as Coleccion;
    expect(creada.nombre).toBe("Viajes");
    const url = `/api/colecciones/${creada.id}/medios`;

    // No se puede meter un archivo ajeno.
    expect((await rutaColeccionMedios.POST(json(ana, url, "POST", { ids: [deBeto.id] }), ctx(creada.id))).status).toBe(
      404,
    );
    expect((await rutaColeccionMedios.POST(json(ana, url, "POST", { ids: [deAna.id] }), ctx(creada.id))).status).toBe(
      200,
    );

    const lista = (await (
      await rutaLista.GET(pedir(ana, `/api/media?coleccion=${creada.id}`), undefined)
    ).json()) as PaginaMedios;
    expect(lista.elementos.map((m) => m.id)).toEqual([deAna.id]);

    // Beto no la ve ni la modifica; el admin la lee pero no la cambia.
    expect((await rutaLista.GET(pedir(beto, `/api/media?coleccion=${creada.id}`), undefined)).status).toBe(404);
    expect(
      (await rutaColeccion.PATCH(json(beto, `/api/colecciones/${creada.id}`, "PATCH", { nombre: "X" }), ctx(creada.id)))
        .status,
    ).toBe(404);
    const [filaAna] = await db().select({ id: users.id }).from(users).where(eq(users.email, ana.email));
    const vistas = (await (
      await rutaColecciones.GET(pedir(admin, `/api/colecciones?propietario=${filaAna?.id}`), undefined)
    ).json()) as Coleccion[];
    expect(vistas).toEqual([{ id: creada.id, nombre: "Viajes", total: 1 }]);
    expect(
      (await rutaColeccion.DELETE(pedir(admin, `/api/colecciones/${creada.id}`, { method: "DELETE" }), ctx(creada.id)))
        .status,
    ).toBe(404);

    // Borrar la colección no borra los archivos.
    expect(
      (await rutaColeccion.DELETE(pedir(ana, `/api/colecciones/${creada.id}`, { method: "DELETE" }), ctx(creada.id)))
        .status,
    ).toBe(204);
    expect((await rutaMedio.GET(pedir(ana, `/api/media/${deAna.id}`), ctx(deAna.id))).status).toBe(200);
  });

  test("la cuota impide subir por encima del límite; el admin no tiene límite", async () => {
    const antes = (await leerAjustes()).cuotaMb;
    const [filaAdmin] = await db().select({ id: users.id }).from(users).where(eq(users.email, admin.email));
    try {
      const espacio = (await (
        await rutaEspacio.GET(pedir(ana, "/api/media/espacio"), undefined)
      ).json()) as EspacioUsado;
      expect(espacio.usadoBytes).toBe(deAna.tamano);
      expect(espacio.cuotaBytes).toBe(antes * 1024 * 1024);

      // Cuota mínima (1 MB) y un archivo que la supera: 900 KB de ruido difícil de comprimir, dos veces.
      await guardarAjustes({ cuotaMb: 1 }, filaAdmin?.id ?? "");
      const ruido = new Uint8Array(900 * 1024).map(() => Math.floor(Math.random() * 256));
      const audio = (n: string) => {
        const datos = new FormData();
        datos.set("archivo", new File([new Uint8Array([0x66, 0x4c, 0x61, 0x43]), ruido], n, { type: "audio/flac" }));
        return datos;
      };
      expect(
        (await rutaLista.POST(pedir(ana, "/api/media", { method: "POST", body: audio("a.flac") }), undefined)).status,
      ).toBe(201);
      const excedido = await rutaLista.POST(
        pedir(ana, "/api/media", { method: "POST", body: audio("b.flac") }),
        undefined,
      );
      expect(excedido.status).toBe(413);
      expect((await excedido.json()).error).toContain("límite de espacio");
      expect(
        (await rutaLista.POST(pedir(admin, "/api/media", { method: "POST", body: audio("c.flac") }), undefined)).status,
      ).toBe(201);
    } finally {
      await guardarAjustes({ cuotaMb: antes }, filaAdmin?.id ?? "");
    }
  });

  test("la cuota aguanta subidas simultáneas", async () => {
    const antes = (await leerAjustes()).cuotaMb;
    const [filaAdmin] = await db().select({ id: users.id }).from(users).where(eq(users.email, admin.email));
    const carlos = await crearSesionDePrueba("user");
    try {
      await guardarAjustes({ cuotaMb: 1 }, filaAdmin?.id ?? "");
      const ruido = () => new Uint8Array(700 * 1024).map(() => Math.floor(Math.random() * 256));
      const subida = (n: string) => {
        const datos = new FormData();
        datos.set("archivo", new File([new Uint8Array([0x66, 0x4c, 0x61, 0x43]), ruido()], n, { type: "audio/flac" }));
        return rutaLista.POST(pedir(carlos, "/api/media", { method: "POST", body: datos }), undefined);
      };
      const estados = (await Promise.all([subida("1.flac"), subida("2.flac"), subida("3.flac")])).map((r) => r.status);
      expect(estados.filter((e) => e === 201)).toHaveLength(1);
      expect(estados.filter((e) => e === 413)).toHaveLength(2);
      const espacio = (await (
        await rutaEspacio.GET(pedir(carlos, "/api/media/espacio"), undefined)
      ).json()) as EspacioUsado;
      expect(espacio.usadoBytes).toBeLessThanOrEqual(1024 * 1024);
    } finally {
      await guardarAjustes({ cuotaMb: antes }, filaAdmin?.id ?? "");
      await carlos.borrar();
    }
  });

  test("los filtros no válidos responden 404 o 400, nunca 500", async () => {
    expect((await rutaLista.GET(pedir(ana, "/api/media?coleccion=no-es-uuid"), undefined)).status).toBe(404);
    expect((await rutaLista.GET(pedir(admin, "/api/media?propietario=pepito"), undefined)).status).toBe(400);
    expect((await rutaColecciones.GET(pedir(admin, "/api/colecciones?propietario=pepito"), undefined)).status).toBe(
      400,
    );
  });

  test("los ajustes rechazan remitentes con saltos de línea o sin correo", async () => {
    const [filaAdmin] = await db().select({ id: users.id }).from(users).where(eq(users.email, admin.email));
    for (const malo of ["a@b.es>\r\nBcc: victima@x.es", "sin correo", "Nombre <no-es-correo>"]) {
      await expect(guardarAjustes({ correoRemitente: malo }, filaAdmin?.id ?? "")).rejects.toThrow("correo@dominio");
    }
  });
});
