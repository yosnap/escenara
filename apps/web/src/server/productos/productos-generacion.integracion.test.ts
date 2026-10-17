import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * **Vistas generadas de un producto**, contra el PostgreSQL local y con el proveedor simulado.
 *
 * Generar una imagen de referencia desde la ficha del producto pasa por el mismo camino de dinero que un fotograma
 * (estimación con sello, confirmación, idempotencia y reserva). Antes de cobrar se rechaza lo que haría inútil la
 * imagen, y al cerrarse el trabajo el resultado entra en el producto con la vista pedida, marcado como generado.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_productos_generacion");
}

const { eq } = await import("drizzle-orm");
const rutaGeneracion = await import("@/app/api/productos/[id]/generacion/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, rateLimits, usageLedger, users } = await import("../db/esquema");
const { estimar, olvidarSaldos } = await import("../generacion/estimacion");
const { subirFotoDePrueba } = await import("../lugares/lugar-de-prueba");
const { adjuntarAlProducto } = await import("./generacion");
const { anadirFotos, crearProducto } = await import("./servicio");
const { obtenerProducto } = await import("./consulta");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type Buscador = import("../proveedores/codigos").Buscador;

/** Clave de mentira con el formato que admite la bóveda; el proveedor está simulado y nunca la ve. */
const CLAVE_FALSA = ["prueba", "productos", "generacion", randomBytes(8).toString("hex")].join("-");

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url) => {
  if (url.includes("/chat/credit")) return sobre(1_000_000);
  throw new Error(`URL no simulada: ${url}`);
};

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!hayBaseDeDatos)("vistas generadas de un producto", () => {
  let ana: Sesion;
  let beto: Sesion;
  let actor: Actor;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_productos_generacion");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    beto = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE_FALSA, buscar);
    await guardarCredencial(beto.id, "kie", CLAVE_FALSA, buscar);
    await guardarAjustes({ presupuestoCreditos: 0, presupuestoTrabajo: 0, trabajosSimultaneos: 20 }, null);
  });

  afterAll(async () => {
    for (const sesion of [ana, beto]) {
      if (sesion?.email) await db().delete(users).where(eq(users.email, sesion.email));
    }
    await guardarAjustes(
      {
        presupuestoCreditos: ajustesPrevios.presupuestoCreditos,
        presupuestoTrabajo: ajustesPrevios.presupuestoTrabajo,
        trabajosSimultaneos: ajustesPrevios.trabajosSimultaneos,
      },
      null,
    );
  });

  beforeEach(async () => {
    olvidarSaldos();
    exigirBaseDeDatosDePrueba("escenara_pruebas_productos_generacion");
    await db().delete(rateLimits);
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(usageLedger).where(eq(usageLedger.userId, ana.id));
  });

  const nuevoProducto = (datos: { descripcion?: string; tipo?: string } = {}) =>
    crearProducto(actor, {
      nombre: `Botella ${crypto.randomUUID().slice(0, 6)}`,
      descripcion: datos.descripcion ?? "Botella de vidrio azul con tapón de corcho y etiqueta blanca.",
      tipo: datos.tipo ?? "fisico",
      marcaVisible: false,
    });

  const encargar = async (sesion: Sesion, productoId: string, cuerpo: Record<string, unknown>) => {
    const estimacion = await estimar(sesion.id, "fotograma", buscar, null, { sinReferencia: true });
    return rutaGeneracion.POST(
      new Request(`http://localhost/api/productos/${productoId}/generacion`, {
        method: "POST",
        headers: { cookie: sesion.cookie, origin: "http://localhost", "Content-Type": "application/json" },
        body: JSON.stringify({
          creditosConfirmados: estimacion.creditos,
          selloEstimacion: estimacion.sello,
          derechos: true,
          claveIdempotencia: crypto.randomUUID(),
          ...cuerpo,
        }),
      }),
      ctx(productoId),
    );
  };

  const trabajosDeAna = () => db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id));

  test("genera la vista pedida como un fotograma sin partida y entra en el producto con su papel, marcada como generada", async () => {
    const producto = await nuevoProducto();
    const respuesta = await encargar(ana, producto.id, { papel: "mecanismo" });
    expect(respuesta.status).toBe(201);
    // Lo que ve el usuario es lo que ha pedido, nunca el prompt que compone el servidor (ADR-0022).
    const vista = (await respuesta.json()) as { escena: string; prompt?: string };
    expect(vista.escena).toContain("Detalle de la tapa o el mecanismo");
    expect(vista.prompt).toBeUndefined();
    const [trabajo] = await trabajosDeAna();
    expect(trabajo?.kind).toBe("fotograma");
    expect(trabajo?.sourceMediaId).toBeNull();
    expect(trabajo?.productId ?? null).toBeNull();
    expect((trabajo?.input as { sinReferencia?: unknown } | undefined)?.sinReferencia).toBe(true);
    expect(trabajo?.prompt).toContain("Botella de vidrio azul");
    expect((trabajo?.input as { edicionDeProducto?: unknown } | undefined)?.edicionDeProducto).toEqual({
      productoId: producto.id,
      papel: "mecanismo",
    });
    // Se reservó lo que cuesta: el mismo apunte que cualquier fotograma.
    expect(await db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id))).not.toHaveLength(0);

    if (!trabajo) throw new Error("Falta el trabajo.");
    const generada = await subirFotoDePrueba(actor, "tapon-generado.png");
    await adjuntarAlProducto(trabajo, generada);
    // Cerrar dos veces no la añade dos veces.
    await adjuntarAlProducto(trabajo, generada);
    const despues = await obtenerProducto(actor, producto.id);
    expect(despues.fotos).toHaveLength(1);
    expect(despues.fotos[0]).toMatchObject({ papel: "mecanismo", generada: true });
  });

  test("la misma confirmación repetida no encarga dos imágenes", async () => {
    const producto = await nuevoProducto();
    const estimacion = await estimar(ana.id, "fotograma", buscar, null, { sinReferencia: true });
    const cuerpo = JSON.stringify({
      papel: "etiqueta",
      creditosConfirmados: estimacion.creditos,
      selloEstimacion: estimacion.sello,
      derechos: true,
      claveIdempotencia: crypto.randomUUID(),
    });
    const pedir = () =>
      rutaGeneracion.POST(
        new Request(`http://localhost/api/productos/${producto.id}/generacion`, {
          method: "POST",
          headers: { cookie: ana.cookie, origin: "http://localhost", "Content-Type": "application/json" },
          body: cuerpo,
        }),
        ctx(producto.id),
      );
    expect((await pedir()).status).toBeLessThan(300);
    expect((await pedir()).status).toBeLessThan(300);
    expect(await trabajosDeAna()).toHaveLength(1);
  });

  test("antes de cobrar: sin descripción, una vista que no se genera, sin derechos o ajeno, no se encarga nada", async () => {
    const sinDescripcion = await nuevoProducto({ descripcion: "Bote" });
    const corta = await encargar(ana, sinDescripcion.id, { papel: "envase" });
    expect(corta.status).toBe(409);
    expect(((await corta.json()) as { error: string }).error).toContain("No se ha cobrado nada");

    const digital = await nuevoProducto({ tipo: "digital", descripcion: "App de recetas con fondo verde y botones." });
    const captura = await encargar(ana, digital.id, { papel: "captura_pantalla" });
    expect(captura.status).toBe(400);
    const inventada = await encargar(ana, digital.id, { papel: "no-existe" });
    expect(inventada.status).toBe(400);

    const producto = await nuevoProducto();
    const sinDerechos = await encargar(ana, producto.id, { papel: "envase", derechos: false });
    expect(sinDerechos.status).toBe(400);
    const ajeno = await encargar(beto, producto.id, { papel: "envase" });
    expect(ajeno.status).toBe(404);

    expect(await trabajosDeAna()).toHaveLength(0);
  });

  test("un producto lleno no cobra otra vista", async () => {
    const producto = await nuevoProducto();
    const fotos = await Promise.all(Array.from({ length: 8 }, (_, i) => subirFotoDePrueba(actor, `foto-${i}.png`)));
    await anadirFotos(
      actor,
      producto.id,
      fotos.map((medioId) => ({ medioId, papel: "envase" as const })),
    );
    const lleno = await encargar(ana, producto.id, { papel: "suelto" });
    expect(lleno.status).toBe(409);
    expect(((await lleno.json()) as { error: string }).error).toContain("No se ha cobrado nada");
    expect(await trabajosDeAna()).toHaveLength(0);
  });
});
