import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { CHAT_200, MODELOS_200, respuestaGrabada } from "../proveedores/compatible/fixtures";

/**
 * **El asistente de guion estima, confirma y gasta por el mismo sitio: el mapa de texto del usuario.**
 *
 * - con la entrada principal de cuota y KIE de reserva, la pantalla recibe 0 créditos «por cuota» con el nombre del
 *   proveedor y la reserva de pago aparte; se confirma solo la reserva y, si NaN responde, no se reserva nada;
 * - si NaN se satura, escribe la reserva de KIE dentro de lo confirmado, y se avisa con proveedor y coste;
 * - si el precio de la reserva cambia entre la pantalla y el botón, el sello lo detecta: 409 sin llamar a nadie;
 * - sin ninguna entrada de pago, el total es 0, no hay reserva ni sello, y confirmar otra cifra se rechaza;
 * - con la principal de pago a un precio mayor, se confirma ese precio, y confirmar menos se rechaza sin llamar.
 *
 * Ningún test llama a un proveedor de verdad: KIE y el servicio compatible están simulados.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_asistente_mapa");
}

const { and, eq } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { modelPrices, models, usageLedger, users } = await import("../db/esquema");
const { guardarAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { guardarCompatible, listarCompatibles } = await import("../boveda/compatibles");
const { olvidarCatalogo } = await import("../proveedores/catalogo");
const { guardarMapa } = await import("../mapa/mapa");
const { crearProyecto } = await import("./proyectos");
const { escribirGuion } = await import("./generar");
const { detalleProyecto } = await import("./plan");
const { ErrorProyecto } = await import("./errores");
type Buscador = import("../proveedores/codigos").Buscador;
type Actor = import("../media/servicio").Actor;

const CLAVE_KIE = randomBytes(16).toString("hex");
const CLAVE_NAN = `sk-${randomBytes(16).toString("hex")}`;
const BASE_NAN = "https://api.nan.builders/v1";
/** Precio sembrado del modelo de texto de la instalación (1,5) redondeado al alza. */
const CREDITOS_INSTALACION = 2;

const GUION = JSON.stringify({
  concepto: "Tres pasos para empezar la mañana con calma.",
  escenas: [{ texto: "Sale el sol.", accion: "Plano medio en la azotea", segundos: 4 }],
});

/** Llamadas que han recibido los proveedores simulados, en orden: `kie` o `nan/<modelo>`. */
const llamadas: string[] = [];
/** Modelos del servicio compatible que no contestan a tiempo. */
let modelosQueTardan = new Set<string>();

const sobre = (data: unknown) => respuestaGrabada({ code: 200, msg: "success", data });

const buscar: Buscador = async (url, init) => {
  if (url.includes("/chat/credit")) return sobre(5000);
  if (url.includes("/codex/v1/responses")) {
    llamadas.push("kie");
    return respuestaGrabada({
      output: [{ type: "message", content: [{ type: "output_text", text: GUION }] }],
      credits_consumed: 0.5,
    });
  }
  if (url.endsWith("/models")) return respuestaGrabada(MODELOS_200);
  if (url.endsWith("/chat/completions")) {
    const cuerpo = JSON.parse(String(init?.body)) as { model: string };
    llamadas.push(`nan/${cuerpo.model}`);
    if (modelosQueTardan.has(cuerpo.model)) throw new DOMException("Se ha agotado el tiempo.", "TimeoutError");
    return respuestaGrabada({ ...CHAT_200, choices: [{ message: { content: GUION } }] });
  }
  throw new Error(`URL no simulada: ${url}`);
};

describe.skipIf(!hayBaseDeDatos)("asistente de guion por el mapa de texto", () => {
  type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
  let ana: Sesion;
  let admin: Sesion;
  let actorAna: Actor;
  let proyectoId = "";

  beforeAll(async () => {
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    admin = await crearSesionDePrueba("admin");
    actorAna = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE_KIE, buscar);
    await db()
      .update(models)
      .set({ state: "compatible", evidence: "Simulado en el test del asistente por el mapa." })
      .where(eq(models.modelId, "gpt-5-6-sol"));
    olvidarCatalogo();
    await guardarAjustes(
      { presupuestoCreditos: 100_000, avisoCreditos: 100_000, asistenteActivo: true, traducirPrompts: false },
      admin.id,
    );
    await guardarCompatible(
      ana.id,
      { nombre: "NaN builders", urlBase: BASE_NAN, clave: CLAVE_NAN, modelos: ["gemma4"], soloCuota: true },
      buscar,
    );
    const detalle = await crearProyecto(actorAna, {
      titulo: "Mañana en la azotea",
      formato: "reel_vertical",
      idea: "Una rutina de tres pasos para empezar el día con calma, grabada al amanecer.",
      presupuestoCreditos: 100,
    });
    proyectoId = detalle.proyecto.id;
  });

  afterAll(async () => {
    await guardarAjustes({ asistenteActivo: false }, admin.id);
    await db().update(models).set({ state: "descubierto" }).where(eq(models.modelId, "gpt-5-6-sol"));
    olvidarCatalogo();
    await db().delete(users).where(eq(users.id, ana.id));
    await db().delete(users).where(eq(users.id, admin.id));
  });

  beforeEach(() => {
    llamadas.length = 0;
    modelosQueTardan = new Set();
  });

  /** Mapa de texto de Ana: NaN builders por cuota primero y el modelo de pago de KIE de reserva. */
  const mapaDeCuota = async () => {
    const nan = (await listarCompatibles(ana.id)).find((p) => p.nombre === "NaN builders");
    await guardarMapa(ana.id, "texto", [
      { proveedor: "compatible", compatibleId: nan?.id ?? "", modelo: "gemma4" },
      { proveedor: "kie", compatibleId: null, modelo: "gpt-5-6-sol" },
    ]);
  };

  const reservasDeAna = async () =>
    (await db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id))).filter(
      (a) => a.entryType === "reserva",
    ).length;

  const peticion = (creditosConfirmados: number, selloEstimacion: string) => ({
    claveIdempotencia: crypto.randomUUID(),
    creditosConfirmados,
    selloEstimacion,
  });

  /** Mapa de texto de Ana solo con NaN builders: ninguna entrada de pago. */
  const mapaSoloCuota = async () => {
    const nan = (await listarCompatibles(ana.id)).find((p) => p.nombre === "NaN builders");
    await guardarMapa(ana.id, "texto", [{ proveedor: "compatible", compatibleId: nan?.id ?? "", modelo: "gemma4" }]);
  };

  const dondePrecio = and(eq(modelPrices.provider, "kie"), eq(modelPrices.model, "gpt-5-6-sol"));

  test("con la principal de cuota y KIE de reserva se confirma solo la reserva, y si NaN responde no se gasta", async () => {
    await mapaDeCuota();
    const detalle = await detalleProyecto(actorAna, proyectoId);
    expect(detalle.asistenteDisponible).toBe(true);
    expect(detalle.estimacionAsistente).toMatchObject({
      creditos: 0,
      porCuota: true,
      nombreProveedor: "NaN builders",
      reserva: { creditos: CREDITOS_INSTALACION },
    });
    const sello = detalle.estimacionAsistente?.sello ?? "";
    expect(sello).toContain("gpt-5-6-sol");
    const reservasAntes = await reservasDeAna();
    const escrito = await escribirGuion(actorAna, proyectoId, peticion(CREDITOS_INSTALACION, sello), buscar);
    expect(escrito.escenas.length).toBeGreaterThan(0);
    expect(escrito.avisoReserva).toBeUndefined();
    expect(llamadas).toEqual(["nan/gemma4"]);
    expect(await reservasDeAna()).toBe(reservasAntes);
  });

  test("si NaN se satura, escribe la reserva de KIE dentro de lo confirmado y se avisa", async () => {
    await mapaDeCuota();
    modelosQueTardan = new Set(["gemma4"]);
    const sello = (await detalleProyecto(actorAna, proyectoId)).estimacionAsistente?.sello ?? "";
    const reservasAntes = await reservasDeAna();
    const escrito = await escribirGuion(actorAna, proyectoId, peticion(CREDITOS_INSTALACION, sello), buscar);
    expect(llamadas).toEqual(["nan/gemma4", "kie"]);
    expect(escrito.avisoReserva).toContain("NaN builders ha tardado demasiado");
    expect(escrito.avisoReserva).toContain("reserva de pago de KIE.ai");
    expect(escrito.avisoReserva).not.toContain("gpt-5-6-sol");
    expect(await reservasDeAna()).toBe(reservasAntes + 1);
  });

  test("si el precio de la reserva cambia tras enseñarlo, el sello lo detecta y no se llama a nadie", async () => {
    await mapaDeCuota();
    const sello = (await detalleProyecto(actorAna, proyectoId)).estimacionAsistente?.sello ?? "";
    const [antes] = await db().select().from(modelPrices).where(dondePrecio);
    if (!antes) throw new Error("Falta el precio sembrado del modelo de texto.");
    // Mismo redondeo (2 créditos), otra versión del precio: solo el sello puede notarlo.
    await db()
      .update(modelPrices)
      .set({ credits: 1.8, version: antes.version + 1 })
      .where(dondePrecio);
    olvidarCatalogo();
    try {
      const fallo = await escribirGuion(actorAna, proyectoId, peticion(CREDITOS_INSTALACION, sello), buscar).catch(
        (e: unknown) => e,
      );
      expect((fallo as { estado?: number }).estado).toBe(409);
      expect((fallo as Error).message).toContain("ha cambiado");
      expect(llamadas).toEqual([]);
    } finally {
      await db().update(modelPrices).set({ credits: antes.credits, version: antes.version }).where(dondePrecio);
      olvidarCatalogo();
    }
  });

  test("sin ninguna entrada de pago el total es 0, sin reserva ni sello, y otra cifra se rechaza sin llamar", async () => {
    await mapaSoloCuota();
    const { estimacionAsistente } = await detalleProyecto(actorAna, proyectoId);
    expect(estimacionAsistente).toMatchObject({ creditos: 0, porCuota: true, sello: "", reserva: null });
    const fallo = await escribirGuion(
      actorAna,
      proyectoId,
      peticion(CREDITOS_INSTALACION, "kie:gpt-5-6-sol:respuesta de texto@v1"),
      buscar,
    ).catch((e: unknown) => e);
    expect((fallo as { estado?: number }).estado).toBe(409);
    expect((fallo as Error).message).toContain("ahora son 0 créditos");
    expect(llamadas).toEqual([]);

    const reservasAntes = await reservasDeAna();
    const escrito = await escribirGuion(actorAna, proyectoId, peticion(0, ""), buscar);
    expect(escrito.escenas.length).toBeGreaterThan(0);
    expect(llamadas).toEqual(["nan/gemma4"]);
    expect(await reservasDeAna()).toBe(reservasAntes);
  });

  test("sin entradas de pago, si NaN falla no se llama a nadie más y se dice por qué", async () => {
    await mapaSoloCuota();
    modelosQueTardan = new Set(["gemma4"]);
    const fallo = (await escribirGuion(actorAna, proyectoId, peticion(0, ""), buscar).catch(
      (e: unknown) => e,
    )) as Error;
    expect(fallo).toBeInstanceOf(ErrorProyecto);
    expect(fallo.message).toContain("NaN builders ha tardado demasiado");
    expect(fallo.message).toContain("No se te ha cobrado nada");
    expect(fallo.message).not.toContain("gemma4");
    expect(llamadas).toEqual(["nan/gemma4"]);
  });

  test("con la principal de pago más cara, se confirma su precio y confirmar menos se rechaza sin llamar", async () => {
    await guardarMapa(ana.id, "texto", [{ proveedor: "kie", compatibleId: null, modelo: "gpt-5-6-sol" }]);
    const [antes] = await db().select().from(modelPrices).where(dondePrecio);
    if (!antes) throw new Error("Falta el precio sembrado del modelo de texto.");
    await db()
      .update(modelPrices)
      .set({ credits: 4.5, version: antes.version + 1 })
      .where(dondePrecio);
    olvidarCatalogo();
    try {
      const { estimacionAsistente } = await detalleProyecto(actorAna, proyectoId);
      expect(estimacionAsistente?.creditos).toBe(5);
      expect(estimacionAsistente?.porCuota).toBe(false);
      const sello = estimacionAsistente?.sello ?? "";

      const corto = await escribirGuion(actorAna, proyectoId, peticion(CREDITOS_INSTALACION, sello), buscar).catch(
        (e: unknown) => e,
      );
      expect((corto as { estado?: number }).estado).toBe(409);
      expect(llamadas).toEqual([]);

      const reservasAntes = await reservasDeAna();
      await escribirGuion(actorAna, proyectoId, peticion(5, sello), buscar);
      expect(llamadas).toEqual(["kie"]);
      expect(await reservasDeAna()).toBe(reservasAntes + 1);
      const [reserva] = (await db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id)))
        .filter((a) => a.entryType === "reserva")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      expect(reserva?.credits).toBe(5);
    } finally {
      await db().update(modelPrices).set({ credits: antes.credits, version: antes.version }).where(dondePrecio);
      olvidarCatalogo();
    }
  });
});
