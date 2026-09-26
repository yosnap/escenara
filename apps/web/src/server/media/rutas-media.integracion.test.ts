import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { Medio, PaginaMedios } from "@/lib/media/tipos";

// Pruebas contra PostgreSQL y SeaweedFS locales (`bun run services:up`).
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

const rutaLista = await import("@/app/api/media/route");
const rutaMedio = await import("@/app/api/media/[id]/route");
const rutaRestaurar = await import("@/app/api/media/[id]/restaurar/route");
const rutaArchivo = await import("@/app/api/media/[id]/archivo/route");
const rutaUrl = await import("@/app/api/media/url/route");
const { aplicarMigraciones } = await import("../db/migrar");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");

const BASE = "http://localhost/api/media";
const marca = `prueba-${crypto.randomUUID().slice(0, 8)}`;
const creados: string[] = [];

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

// La API de medios exige una sesión de administrador (0.7.0).
let admin: Awaited<ReturnType<typeof crearSesionDePrueba>>;
let cookie = "";
const peticion = (url: string, init: RequestInit = {}) =>
  new Request(url, { ...init, headers: { ...(init.headers as Record<string, string>), cookie } });

function formulario(archivo: File, campos: Record<string, string> = {}) {
  const datos = new FormData();
  datos.set("archivo", archivo);
  for (const [k, v] of Object.entries(campos)) datos.set(k, v);
  return datos;
}

async function subir(archivo: File, campos?: Record<string, string>) {
  const r = await rutaLista.POST(peticion(BASE, { method: "POST", body: formulario(archivo, campos) }), undefined);
  const cuerpo = await r.json();
  if (r.status === 201) creados.push((cuerpo as Medio).id);
  return { estado: r.status, cuerpo };
}

async function listar(consulta: string) {
  const r = await rutaLista.GET(peticion(`${BASE}?${consulta}`), undefined);
  return (await r.json()) as PaginaMedios;
}

const png = async (ancho: number, alto: number) =>
  new File(
    [
      await sharp({ create: { width: ancho, height: alto, channels: 3, background: "#ff5a5f" } })
        .png()
        .toBuffer(),
    ],
    `${marca}-foto.png`,
    { type: "image/png" },
  );

describe.skipIf(!process.env.DATABASE_URL)("API de medios (PostgreSQL y SeaweedFS locales)", () => {
  beforeAll(async () => {
    await aplicarMigraciones();
    admin = await crearSesionDePrueba("admin");
    cookie = admin.cookie;
  });

  afterAll(async () => {
    cookie = admin.cookie;
    for (const id of creados) {
      await rutaMedio.DELETE(peticion(`${BASE}/${id}`, { method: "DELETE" }), ctx(id));
      await rutaMedio.DELETE(peticion(`${BASE}/${id}?definitivo=1`, { method: "DELETE" }), ctx(id));
    }
    await admin.borrar();
  });

  test("optimiza las imágenes a WebP de 1920 × 1080 como máximo", async () => {
    const { estado, cuerpo } = await subir(await png(3000, 2000));
    expect(estado).toBe(201);
    expect(cuerpo).toMatchObject({
      tipo: "imagen",
      mime: "image/webp",
      ancho: 1620,
      alto: 1080,
      enPapelera: false,
      origen: null,
    });
    const descarga = await fetch((cuerpo as Medio).url);
    expect(descarga.status).toBe(200);
    expect((await sharp(new Uint8Array(await descarga.arrayBuffer())).metadata()).format).toBe("webp");
  });

  test("guarda audio sin transcodificar con la duración leída por el navegador", async () => {
    const audio = new File([new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0, 0, 0, 34])], `${marca}-voz.flac`, {
      type: "audio/flac",
    });
    const { estado, cuerpo } = await subir(audio, { duracion: "12.5", ancho: "640" });
    expect(estado).toBe(201);
    expect(cuerpo).toMatchObject({ tipo: "audio", mime: "audio/flac", duracion: 12.5, ancho: null });
  });

  test("rechaza archivos cuyo contenido no coincide con un formato admitido", async () => {
    const falso = new File(["<script>alert(1)</script>"], `${marca}.png`, { type: "image/png" });
    const { estado, cuerpo } = await subir(falso);
    expect(estado).toBe(415);
    expect(cuerpo.error).toBeString();
  });

  test("filtra por búsqueda y tipo", async () => {
    const imagenes = await listar(`busqueda=${marca}&tipo=imagen`);
    expect(imagenes.elementos.every((m) => m.tipo === "imagen")).toBe(true);
    expect(imagenes.total).toBe(1);
    expect((await listar(`busqueda=${marca}`)).total).toBe(2);
    expect((await listar(`busqueda=${marca}&tipo=video,audio`)).total).toBe(1);
    expect((await listar(`busqueda=${marca}_%`)).total).toBe(0);
  });

  test("edita metadatos, sustituye la imagen y la sirve desde el mismo origen", async () => {
    const [imagen] = (await listar(`busqueda=${marca}&tipo=imagen`)).elementos;
    const id = (imagen as Medio).id;
    const patch = await rutaMedio.PATCH(
      peticion(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify({ titulo: "  Retrato  ", altEs: "Hola" }) }),
      ctx(id),
    );
    expect(await patch.json()).toMatchObject({ titulo: "Retrato", altEs: "Hola", altEn: "" });

    const put = await rutaMedio.PUT(
      peticion(`${BASE}/${id}`, { method: "PUT", body: formulario(await png(400, 400)) }),
      ctx(id),
    );
    expect(await put.json()).toMatchObject({ id, ancho: 400, alto: 400, titulo: "Retrato" });

    const archivo = await rutaArchivo.GET(peticion(`${BASE}/${id}/archivo`), ctx(id));
    expect(archivo.headers.get("content-type")).toBe("image/webp");
    expect((await sharp(new Uint8Array(await archivo.arrayBuffer())).metadata()).width).toBe(400);
  });

  test("papelera, restauración y borrado definitivo", async () => {
    const [audio] = (await listar(`busqueda=${marca}&tipo=audio`)).elementos;
    const id = (audio as Medio).id;
    const url = `${BASE}/${id}`;

    const prematuro = await rutaMedio.DELETE(peticion(`${url}?definitivo=1`, { method: "DELETE" }), ctx(id));
    expect(prematuro.status).toBe(409);

    expect(await (await rutaMedio.DELETE(peticion(url, { method: "DELETE" }), ctx(id))).json()).toMatchObject({
      enPapelera: true,
    });
    expect((await listar(`busqueda=${marca}`)).total).toBe(1);
    expect((await listar(`busqueda=${marca}&papelera=1`)).total).toBe(1);

    await rutaRestaurar.POST(peticion(`${url}/restaurar`, { method: "POST" }), ctx(id));
    expect((await listar(`busqueda=${marca}`)).total).toBe(2);

    await rutaMedio.DELETE(peticion(url, { method: "DELETE" }), ctx(id));
    const borrado = await rutaMedio.DELETE(peticion(`${url}?definitivo=1`, { method: "DELETE" }), ctx(id));
    expect(borrado.status).toBe(204);
    expect((await rutaMedio.GET(peticion(url), ctx(id))).status).toBe(404);
  });

  test("respeta los tipos que admite el campo de origen", async () => {
    const audio = new File([new Uint8Array([0x66, 0x4c, 0x61, 0x43])], `${marca}-x.flac`, { type: "audio/flac" });
    const { estado } = await subir(audio, { tipos: "imagen" });
    expect(estado).toBe(415);
  });

  test("acota el número de página en lugar de fallar", async () => {
    const pagina = await listar("pagina=99999999999999999999");
    expect(pagina.pagina).toBe(100_000);
    expect(pagina.elementos).toEqual([]);
  });

  test("no edita ni sirve el archivo de un medio en la papelera", async () => {
    const { cuerpo } = await subir(await png(50, 50));
    const id = (cuerpo as Medio).id;
    await rutaMedio.DELETE(peticion(`${BASE}/${id}`, { method: "DELETE" }), ctx(id));
    const put = await rutaMedio.PUT(
      peticion(`${BASE}/${id}`, { method: "PUT", body: formulario(await png(40, 40)) }),
      ctx(id),
    );
    expect(put.status).toBe(409);
    expect((await rutaArchivo.GET(peticion(`${BASE}/${id}/archivo`), ctx(id))).status).toBe(404);
  });

  test("añadir desde URL rechaza cuerpos sin URL y direcciones internas", async () => {
    const pedir = (cuerpo: unknown) =>
      rutaUrl.POST(peticion(`${BASE}/url`, { method: "POST", body: JSON.stringify(cuerpo) }), undefined);
    expect((await pedir({})).status).toBe(400);
    const interna = await pedir({ url: "http://127.0.0.1/api/health" });
    expect(interna.status).toBe(400);
    expect((await interna.json()).error).toContain("no permitida");
  });

  test("sin sesión responde 401 y sin rol de administrador, 404", async () => {
    const guardada = cookie;
    try {
      cookie = "";
      expect((await rutaLista.GET(peticion(BASE), undefined)).status).toBe(401);
      const usuario = await crearSesionDePrueba("user");
      cookie = usuario.cookie;
      expect((await rutaLista.GET(peticion(BASE), undefined)).status).toBe(404);
      await usuario.borrar();
    } finally {
      cookie = guardada;
    }
  });

  test("responde 404 a identificadores con formato no válido", async () => {
    expect((await rutaMedio.GET(peticion(`${BASE}/x`), ctx("no-es-un-uuid"))).status).toBe(404);
  });
});
