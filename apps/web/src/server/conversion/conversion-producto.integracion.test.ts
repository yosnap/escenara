import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { fotoDeReferencia } from "./medios-de-prueba";

/**
 * **El producto al convertir un clip de «Crear» en un proyecto** (0.35.1), contra el PostgreSQL y el SeaweedFS
 * locales. Ningún test llama a ningún proveedor ni gasta un crédito: el clip es un trabajo terminado escrito aquí.
 *
 * - la escena hereda el producto y su acción, y sin la declaración de la marca no se convierte;
 * - la escena hereda la **elección** de fotos solo si el usuario eligió: si las fotos que viajaron son las que el
 *   servidor envía por defecto, la escena nace sin elección; y solo cuentan las que siguen fuera de la papelera.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_conversion_producto");
}

const { eq } = await import("drizzle-orm");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, media, products, projects, rateLimits, users } = await import("../db/esquema");
const { productReferences } = await import("../db/esquema-productos");
const { crearMedio } = await import("../media/servicio");
const { crearAyudas } = await import("./conversion.arnes");
const { lugarDeclaradoDePrueba } = await import("../lugares/lugar-de-prueba");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;

const mensajeDe = (datos: unknown) => (datos as { error?: string }).error ?? "";

describe.skipIf(!hayBaseDeDatos)("el producto al convertir un clip de Crear", () => {
  let ana: Sesion;
  let actor: Actor;
  let carpeta: string;
  let personajeId: string;
  const { personajeConConsentimiento, clipDeCrear, convertir, escenaDe } = crearAyudas(() => ({
    ana,
    actor,
    carpeta,
    personajeId,
  }));

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_conversion_producto");
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    carpeta = await mkdtemp(path.join(tmpdir(), "escenara-prueba-conversion-producto-"));
    personajeId = await personajeConConsentimiento();
  });

  afterAll(async () => {
    if (ana?.email) await db().delete(users).where(eq(users.email, ana.email));
    await rm(carpeta, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await db().delete(projects).where(eq(projects.userId, ana.id));
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(products).where(eq(products.ownerId, ana.id));
    exigirBaseDeDatosDePrueba("escenara_pruebas_conversion_producto");
    await db().delete(rateLimits);
  });

  /** Un producto con tres fotos (frontal, envase y suelta), en ese orden de prioridad. */
  async function productoConTresFotos(): Promise<{ id: string; fotos: [string, string, string] }> {
    const [producto] = await db().insert(products).values({ ownerId: ana.id, name: "Bote con fotos" }).returning();
    if (!producto) throw new Error("No se ha podido crear el producto de prueba.");
    const fotos = await Promise.all(
      (["etiqueta", "envase", "suelto"] as const).map(async (papel, i) => {
        const medio = await crearMedio(
          actor,
          new File([await fotoDeReferencia()], `${papel}.png`, { type: "image/png" }),
        );
        await db()
          .insert(productReferences)
          .values({ productId: producto.id, mediaId: medio.id, kind: papel, sortOrder: i });
        return medio.id;
      }),
    );
    return { id: producto.id, fotos: fotos as [string, string, string] };
  }

  const datosDelClip = (productId: string) => ({ productId, productAction: "sostener", brandRightsAt: new Date() });

  test("la escena hereda el producto y su acción, y sin declaración de marca no se convierte", async () => {
    const { id } = await productoConTresFotos();
    const conMarca = await clipDeCrear(datosDelClip(id));
    const { datos } = await convertir(conMarca.id);
    const escena = await escenaDe(datos.proyectoId);
    expect(escena.productId).toBe(id);
    expect(escena.productAction).toBe("sostener");

    const sinMarca = await clipDeCrear({ productId: id, productAction: "sostener", brandRightsAt: null });
    const rechazo = await convertir(sinMarca.id);
    expect(rechazo.codigo).toBe(409);
    expect(mensajeDe(rechazo.datos)).toContain("derecho a usar la marca");
  });

  test("la escena hereda el lugar del clip y su «dónde, dentro del lugar», como lugar propio", async () => {
    const { lugar } = await lugarDeclaradoDePrueba(actor, "Bar de barrio");
    const clip = await clipDeCrear(
      { placeId: lugar.id, placeVersion: lugar.version },
      { sitioLugar: "junto al ventanal" },
    );
    const { codigo, datos } = await convertir(clip.id);
    expect(codigo).toBe(201);
    const escena = await escenaDe(datos.proyectoId);
    expect(escena.placeId).toBe(lugar.id);
    expect(escena.placeInherited).toBe(false);
    expect(escena.placeSpot).toBe("junto al ventanal");

    // Un clip sin lugar da una escena que hereda el del proyecto, que no tiene ninguno: lo de siempre.
    const sinLugar = await convertir((await clipDeCrear()).id);
    const escenaSinLugar = await escenaDe(sinLugar.datos.proyectoId);
    expect(escenaSinLugar.placeId).toBeNull();
    expect(escenaSinLugar.placeInherited).toBe(true);
  });

  test("sin elección: si viajaron las de por defecto, la escena nace sin elección explícita", async () => {
    const { id, fotos } = await productoConTresFotos();
    // Un modelo de dos huecos manda solo la frontal, que es lo que se envía por defecto.
    const clip = await clipDeCrear(datosDelClip(id), { referenciasProducto: [fotos[0]] });
    const { datos } = await convertir(clip.id);
    expect((await escenaDe(datos.proyectoId)).productPhotoIds).toEqual([]);
    // Y con más huecos, las dos primeras por prioridad: tampoco es una elección.
    const otro = await clipDeCrear(datosDelClip(id), { referenciasProducto: [fotos[0], fotos[1]] });
    const { datos: otros } = await convertir(otro.id);
    expect((await escenaDe(otros.proyectoId)).productPhotoIds).toEqual([]);
  });

  test("con elección: la escena hereda las fotos que eligió, no las de por defecto", async () => {
    const { id, fotos } = await productoConTresFotos();
    const clip = await clipDeCrear(datosDelClip(id), { referenciasProducto: [fotos[0], fotos[2]] });
    const { datos } = await convertir(clip.id);
    expect((await escenaDe(datos.proyectoId)).productPhotoIds).toEqual([fotos[0], fotos[2]]);
  });

  test("solo cuentan las fotos vigentes, y sin ninguna vigente la escena nace sin elección", async () => {
    const { id, fotos } = await productoConTresFotos();
    const enviadas = { referenciasProducto: [fotos[1], fotos[2]] };
    await db().update(media).set({ deletedAt: new Date() }).where(eq(media.id, fotos[1]));
    const clip = await clipDeCrear(datosDelClip(id), enviadas);
    const { datos } = await convertir(clip.id);
    // Se eligieron envase y suelta, y el envase ya no está: queda la suelta, que no es la de por defecto.
    expect((await escenaDe(datos.proyectoId)).productPhotoIds).toEqual([fotos[2]]);

    await db().update(media).set({ deletedAt: new Date() }).where(eq(media.id, fotos[2]));
    const otro = await clipDeCrear(datosDelClip(id), enviadas);
    const { datos: otros } = await convertir(otro.id);
    expect((await escenaDe(otros.proyectoId)).productPhotoIds).toEqual([]);
  });
});
