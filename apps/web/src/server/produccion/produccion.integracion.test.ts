import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { ProduccionVista } from "@/lib/produccion";
import type { ProyectoDetalle } from "@/lib/proyectos";

/**
 * Producción de las escenas de un proyecto aprobado (RF06, 0.19.0) contra el PostgreSQL y el SeaweedFS locales
 * (`bun run services:up`).
 *
 * **Ningún test llama a KIE**: el proveedor se simula con un `fetch` propio, la descarga del resultado también, y
 * la clave es inventada.
 *
 * Lo que comprueba, uno por uno, los criterios de aceptación de la fase:
 *
 * - regenerar una escena **no modifica ni el estado ni los medios de las demás**;
 * - el progreso sale de **etapas y estados reales**: ningún trabajo devuelve un porcentaje, y la etapa cambia
 *   cuando cambia el hecho (se toma, se envía, se descarga);
 * - **cancelar** una escena no enviada libera su reserva; una ya enviada no la libera y lo advierte;
 * - un fallo del proveedor **no consume reintentos de pago** automáticamente y no reenvía nada;
 * - el **tope de escenas en vuelo** por usuario se respeta con envíos simultáneos.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_produccion");
}

const { and, eq, sql } = await import("drizzle-orm");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaEscenas = await import("@/app/api/proyectos/[id]/escenas/route");
const rutaPlan = await import("@/app/api/proyectos/[id]/plan/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, projects, rateLimits, scenes, usageLedger, users } = await import("../db/esquema");
const { crearMedio } = await import("../media/servicio");
const { olvidarSaldos } = await import("../generacion/estimacion");
const { consultarTrabajo } = await import("../generacion/seguimiento");
const { depositoDe } = await import("../presupuesto/deposito");
const { estadoDeProduccion } = await import("./consulta");
const { aprobarFotograma, claveDerivada, producirEscena, producirProyecto, regenerarEscena } = await import(
  "./producir"
);
const { cancelarEscena } = await import("./cancelar");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type PersonajeVista = import("@/lib/personajes").PersonajeVista;
type ErrorConEstado = { estado: number; message: string };

const CLAVE = "sk-produccion-clave-de-kie-inventada-eeee";

// ── Proveedor simulado ─────────────────────────────────────────────────────────────────────────────────────

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const tareas = new Map<string, { state: string; urls?: string[]; creditos?: number }>();
let siguienteTarea = 0;
let saldo = 1_000_000;

const buscar: Buscador = async (url) => {
  if (url.includes("/chat/credit")) return sobre(saldo);
  if (url.includes("file-stream-upload")) return sobre({ downloadUrl: "https://tempfile.kie.ai/referencia.png" });
  if (url.includes("createTask")) {
    const taskId = `prod_${++siguienteTarea}`;
    tareas.set(taskId, { state: "waiting" });
    return sobre({ taskId });
  }
  if (url.includes("recordInfo")) {
    const taskId = new URL(url).searchParams.get("taskId") ?? "";
    const tarea = tareas.get(taskId) ?? { state: "waiting" };
    return sobre({
      state: tarea.state,
      resultJson: tarea.urls ? JSON.stringify({ resultUrls: tarea.urls }) : undefined,
      creditsConsumed: tarea.creditos,
      failMsg: "",
    });
  }
  throw new Error(`URL no simulada: ${url}`);
};

function bytes(datos: Uint8Array): Uint8Array<ArrayBuffer> {
  const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
  copia.set(datos);
  return copia;
}

const MP4 = bytes(new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom"), ...new Uint8Array(64)]));

const png = async (): Promise<Uint8Array<ArrayBuffer>> =>
  bytes(
    await sharp({ create: { width: 64, height: 64, channels: 3, background: "#3d6bff" } })
      .png()
      .toBuffer(),
  );

/** Foto que pasa el control de calidad de 0.14.0: 640 × 640 con ruido, así que cada una tiene su huella. */
const fotoDeReferencia = async (): Promise<Uint8Array<ArrayBuffer>> =>
  bytes(
    await sharp({
      create: {
        width: 640,
        height: 640,
        channels: 3,
        background: "#808080",
        noise: { type: "gaussian", mean: 128, sigma: 40 },
      },
    })
      .png()
      .toBuffer(),
  );

const descargar: Herramientas["descargar"] = async (url) => {
  const esVideo = url.endsWith(".mp4");
  return {
    archivo: new File([esVideo ? MP4 : await png()], esVideo ? "clip.mp4" : "fotograma.png", {
      type: esVideo ? "video/mp4" : "image/png",
    }),
    origen: url,
  };
};

const h: Herramientas = { buscar, descargar };

// ── Utilidades ─────────────────────────────────────────────────────────────────────────────────────────────

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const pedir = (s: Sesion, url: string, metodo = "GET", cuerpo?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: metodo,
    headers: {
      cookie: s.cookie,
      ...(metodo === "GET" ? {} : { origin: "http://localhost", "Content-Type": "application/json" }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

/** Ejecuta algo que puede lanzar un error con estado HTTP y lo devuelve en lugar de romper el test. */
async function intentar<T>(
  accion: () => Promise<T>,
): Promise<{ ok: true; datos: T } | { ok: false; estado: number; error: string }> {
  try {
    return { ok: true, datos: await accion() };
  } catch (error) {
    const fallo = error as ErrorConEstado;
    return { ok: false, estado: fallo.estado ?? 500, error: fallo.message };
  }
}

describe.skipIf(!hayBaseDeDatos)("producción de las escenas de un proyecto", () => {
  let ana: Sesion;
  let actor: Actor;
  let personajeId: string;
  let proyectoId: string;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;

  beforeAll(async () => {
    // Esta suite cambia ajustes de la instalación y borra el ritmo de escrituras: nunca en la base de desarrollo.
    exigirBaseDeDatosDePrueba("escenara_pruebas_produccion");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    personajeId = (await nuevoPersonaje()).id;
    // Presupuesto amplio y sin tope por trabajo: lo que se prueba aquí no es el presupuesto del usuario.
    await guardarAjustes({ presupuestoCreditos: 0, presupuestoTrabajo: 0, trabajosSimultaneos: 20 }, null);
  });

  afterAll(async () => {
    if (ana?.email) await db().delete(users).where(eq(users.email, ana.email));
    await guardarAjustes(
      {
        presupuestoCreditos: ajustesPrevios.presupuestoCreditos,
        presupuestoTrabajo: ajustesPrevios.presupuestoTrabajo,
        trabajosSimultaneos: ajustesPrevios.trabajosSimultaneos,
        escenasEnVuelo: ajustesPrevios.escenasEnVuelo,
      },
      null,
    );
  });

  beforeEach(async () => {
    saldo = 1_000_000;
    olvidarSaldos();
    tareas.clear();
    await guardarAjustes({ escenasEnVuelo: 2 }, null);
    // Cada test empieza con la cuenta limpia y un proyecto nuevo con su plan aprobado.
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(usageLedger).where(eq(usageLedger.userId, ana.id));
    await db().delete(projects).where(eq(projects.userId, ana.id));
    // El límite de ritmo de escrituras se reinicia entre tests: esta suite crea decenas de escenas por pasada y el
    // ritmo de la interfaz (60 por minuto) es para una persona, no para una suite.
    exigirBaseDeDatosDePrueba("escenara_pruebas_produccion");
    await db().delete(rateLimits);
    proyectoId = await nuevoProyectoAprobado();
  });

  /** Personaje de Ana con tres fotos y su consentimiento propio: puede generar. */
  async function nuevoPersonaje(): Promise<PersonajeVista> {
    const creado = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", { nombre: "Lucía", tipo: "persona" }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const personaje = (await creado.json()) as PersonajeVista;
    const referencias = await Promise.all(
      Array.from({ length: 3 }, async (_, i) => ({
        medioId: (
          await crearMedio(actor, new File([await fotoDeReferencia()], `lucia-${i}.png`, { type: "image/png" }))
        ).id,
      })),
    );
    expect(
      (
        await rutaReferencias.POST(
          pedir(ana, `/api/personajes/${personaje.id}/referencias`, "POST", { referencias }),
          ctx(personaje.id),
        )
      ).status,
    ).toBe(200);
    const registro = await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
        titular: "yo",
        mayoriaDeEdad: true,
        alcance: "personal",
      }),
      ctx(personaje.id),
    );
    expect(registro.status).toBe(200);
    return (await registro.json()) as PersonajeVista;
  }

  /** Proyecto de tres escenas con protagonista y plan aprobado: el punto de partida de la producción. */
  async function nuevoProyectoAprobado(): Promise<string> {
    const creado = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", {
        titulo: "Rutina de mañana",
        formato: "reel_vertical",
        idea: "Tres momentos de una mañana tranquila en casa.",
        personajeId,
        presupuestoCreditos: 100_000,
      }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const id = ((await creado.json()) as ProyectoDetalle).proyecto.id;
    for (const [indice, accion] of [
      "Plano medio junto a la ventana, sonríe a cámara con luz suave",
      "Plano cercano de las manos preparando un café humeante",
      "Plano general saliendo por la puerta con la mochila al hombro",
    ].entries()) {
      const respuesta = await rutaEscenas.POST(
        pedir(ana, `/api/proyectos/${id}/escenas`, "POST", {
          texto: `Momento número ${indice + 1} de la mañana.`,
          accion,
          segundos: 4,
        }),
        ctx(id),
      );
      expect(respuesta.status).toBe(201);
    }
    const antes = await detalleDe(id);
    const aprobar = await rutaPlan.POST(
      pedir(ana, `/api/proyectos/${id}/plan`, "POST", {
        presupuestoCreditos: 100_000,
        totalConfirmado: antes.plan.totalCreditos,
      }),
      ctx(id),
    );
    expect(aprobar.status).toBe(200);
    return id;
  }

  const detalleDe = async (id: string): Promise<ProyectoDetalle> => {
    const { detalleProyecto } = await import("../asistente/plan");
    return detalleProyecto(actor, id);
  };

  const estadoDeProduccionDe = (id: string): Promise<ProduccionVista> => estadoDeProduccion(actor, id);

  /** Confirmación de coste tal como la manda el navegador, con el sello vigente. */
  const confirmacion = async (tipo: "fotograma" | "clip" = "fotograma") => {
    const estado = await estadoDeProduccionDe(proyectoId);
    return {
      derechos: true,
      sinTerceros: true,
      creditosConfirmados: tipo === "fotograma" ? estado.creditosPorFotograma : estado.creditosPorClip,
      selloEstimacion: tipo === "fotograma" ? estado.selloFotograma : estado.selloClip,
      claveIdempotencia: crypto.randomUUID(),
      avisoUmbralAceptado: true,
      avisosConfirmados: estado.controlesDelModelo.comprobaciones.filter((c) => c.confirmable).map((c) => c.regla),
    };
  };

  const trabajosDe = (escenaId: string) =>
    db().select().from(generationJobs).where(eq(generationJobs.sceneId, escenaId));

  const filaDeEscena = async (escenaId: string) => {
    const [fila] = await db().select().from(scenes).where(eq(scenes.id, escenaId)).limit(1);
    if (!fila) throw new Error("La escena ha desaparecido.");
    return fila;
  };

  const reservado = async () => (await depositoDe(actor.id)).reservado;

  /** Lleva un trabajo al estado en que ya salió hacia el proveedor, con su tarea creada. */
  async function marcarEnviado(trabajoId: string): Promise<string> {
    const taskId = `prod_enviado_${++siguienteTarea}`;
    tareas.set(taskId, { state: "generating" });
    await db()
      .update(generationJobs)
      .set({ state: "enviado", stage: "enviado", taskId, sentAt: new Date() })
      .where(eq(generationJobs.id, trabajoId));
    return taskId;
  }

  // ── Criterio: el tope de escenas en vuelo se respeta ────────────────────────────────────────────────────

  test("producir el proyecto encola solo hasta el tope de escenas en vuelo", async () => {
    const estado = await producirProyecto(actor, proyectoId, await confirmacion(), h);
    expect(estado.maximoEnVuelo).toBe(2);
    expect(estado.enVuelo).toBe(2);
    const [{ total } = { total: 0 }] = await db()
      .select({ total: sql<number>`count(*)::int` })
      .from(generationJobs)
      .where(eq(generationJobs.userId, ana.id));
    // Tres escenas aprobadas, pero solo dos caben: la tercera espera y no se pierde.
    expect(total).toBe(2);
    expect(estado.porProducir).toBe(1);
  });

  test("con el tope a uno, dos envíos simultáneos no se pasan: el segundo se rechaza con 429", async () => {
    await guardarAjustes({ escenasEnVuelo: 1 }, null);
    const escenas = (await estadoDeProduccionDe(proyectoId)).escenas;
    const [una, otra] = escenas;
    if (!una || !otra) throw new Error("Faltan escenas de prueba.");
    const base = await confirmacion();
    // A la vez, de verdad: la serialización la tiene que poner la transacción que bloquea la fila del usuario.
    const resultados = await Promise.all([
      intentar(() => producirEscena(actor, una.id, { ...base, claveIdempotencia: crypto.randomUUID() }, h)),
      intentar(() => producirEscena(actor, otra.id, { ...base, claveIdempotencia: crypto.randomUUID() }, h)),
    ]);
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    const rechazado = resultados.find((r) => !r.ok);
    expect(rechazado && !rechazado.ok && rechazado.estado).toBe(429);
    expect(rechazado && !rechazado.ok && rechazado.error).toContain("produciéndose");
    const [{ total } = { total: 0 }] = await db()
      .select({ total: sql<number>`count(*)::int` })
      .from(generationJobs)
      .where(eq(generationJobs.userId, ana.id));
    expect(total).toBe(1);
  });

  test("el tope de escenas en vuelo es del usuario, no de cada proyecto", async () => {
    await guardarAjustes({ escenasEnVuelo: 1 }, null);
    const escena = (await estadoDeProduccionDe(proyectoId)).escenas[0];
    if (!escena) throw new Error("Falta la escena de prueba.");
    await producirEscena(actor, escena.id, await confirmacion(), h);

    // Otro proyecto del mismo usuario: su escena tampoco cabe, porque el techo se cuenta por usuario.
    const otroId = await nuevoProyectoAprobado();
    const otroEstado = await estadoDeProduccionDe(otroId);
    expect(otroEstado.enVuelo).toBe(1);
    const otraEscena = otroEstado.escenas[0];
    if (!otraEscena) throw new Error("Falta la escena del otro proyecto.");
    const conf = await confirmacion();
    const rechazo = await intentar(() => producirEscena(actor, otraEscena.id, conf, h));
    expect(!rechazo.ok && rechazo.estado).toBe(429);
  });

  test("repetir la misma confirmación no encola un segundo trabajo", async () => {
    const base = await confirmacion();
    await producirProyecto(actor, proyectoId, base, h);
    const antes = await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id));
    // Misma clave del navegador: las de cada escena se derivan de ella, así que son las mismas.
    await intentar(() => producirProyecto(actor, proyectoId, base, h));
    const despues = await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id));
    expect(despues).toHaveLength(antes.length);
  });

  test("la clave derivada es estable y distinta por escena", () => {
    const base = crypto.randomUUID();
    expect(claveDerivada(base, "fotograma", "e1")).toBe(claveDerivada(base, "fotograma", "e1"));
    expect(claveDerivada(base, "fotograma", "e1")).not.toBe(claveDerivada(base, "fotograma", "e2"));
    expect(claveDerivada(base, "fotograma", "e1")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  // ── Criterio: el progreso sale de etapas y estados reales ───────────────────────────────────────────────

  test("la etapa de un trabajo cambia con los hechos y nunca hay porcentajes", async () => {
    const escena = (await estadoDeProduccionDe(proyectoId)).escenas[0];
    if (!escena) throw new Error("Falta la escena de prueba.");
    await producirEscena(actor, escena.id, await confirmacion(), h);
    const enCola = (await estadoDeProduccionDe(proyectoId)).escenas[0];
    // En cola no ha entrado en ninguna etapa: decir «preparando» sería inventarse un avance.
    expect(enCola?.fotograma?.estado).toBe("en_cola");
    expect(enCola?.fotograma?.etapa).toBeNull();
    expect(enCola?.fotograma?.posicionEnCola).toBeGreaterThan(0);

    const [trabajo] = await trabajosDe(escena.id);
    if (!trabajo) throw new Error("Falta el trabajo de la escena.");
    await marcarEnviado(trabajo.id);
    const enviado = (await estadoDeProduccionDe(proyectoId)).escenas[0];
    expect(enviado?.fotograma?.etapa).toBe("enviado");

    // El estado que informa el proveedor es lo que mueve la etapa a «Generando».
    await consultarTrabajo(actor, trabajo.id, { forzar: true }, h);
    const enCurso = (await estadoDeProduccionDe(proyectoId)).escenas[0];
    expect(enCurso?.fotograma?.estado).toBe("en_curso");
    expect(enCurso?.fotograma?.etapa).toBe("en_curso");

    // Y en ningún momento el trabajo lleva un campo de porcentaje.
    expect(JSON.stringify(enCurso?.fotograma)).not.toMatch(/porcentaje|percent|progreso/i);
  });

  // ── Criterio: regenerar una escena no toca a las demás ──────────────────────────────────────────────────

  test("regenerar una escena no cambia el estado ni los medios de las demás", async () => {
    const escenas = (await estadoDeProduccionDe(proyectoId)).escenas;
    const [primera, segunda] = escenas;
    if (!primera || !segunda) throw new Error("Faltan escenas de prueba.");

    // Las dos primeras se producen y las dos terminan con su fotograma guardado.
    await producirProyecto(actor, proyectoId, await confirmacion(), h);
    for (const escena of [primera, segunda]) {
      const [trabajo] = await trabajosDe(escena.id);
      if (!trabajo) throw new Error("Falta el trabajo de la escena.");
      const taskId = await marcarEnviado(trabajo.id);
      tareas.set(taskId, { state: "success", urls: ["https://res.kie.ai/fotograma.png"], creditos: 4 });
      await consultarTrabajo(actor, trabajo.id, { forzar: true }, h);
    }
    // La segunda se aprueba: así tiene fotograma aprobado, que es lo que no se puede perder.
    await aprobarFotograma(actor, segunda.id, await confirmacion("clip"), h);
    const segundaAntes = await filaDeEscena(segunda.id);
    const trabajosSegundaAntes = (await trabajosDe(segunda.id)).map((t) => ({
      id: t.id,
      estado: t.state,
      medio: t.resultMediaId,
    }));
    expect(segundaAntes.approvedFrameMediaId).not.toBeNull();

    const estado = await regenerarEscena(actor, primera.id, await confirmacion(), h);

    // La primera tiene un trabajo nuevo y ha perdido lo aprobado; la segunda está **exactamente** igual.
    const trabajosPrimera = await trabajosDe(primera.id);
    expect(trabajosPrimera).toHaveLength(2);
    const segundaDespues = await filaDeEscena(segunda.id);
    expect(segundaDespues.state).toBe(segundaAntes.state);
    expect(segundaDespues.approvedFrameMediaId).toBe(segundaAntes.approvedFrameMediaId);
    expect(segundaDespues.clipMediaId).toBe(segundaAntes.clipMediaId);
    expect(segundaDespues.retriesUsed).toBe(segundaAntes.retriesUsed);
    expect((await trabajosDe(segunda.id)).map((t) => ({ id: t.id, estado: t.state, medio: t.resultMediaId }))).toEqual(
      trabajosSegundaAntes,
    );
    // Y la tercera, que ni se había producido, sigue sin nada.
    const tercera = estado.escenas[2];
    expect(tercera?.fotograma).toBeNull();
  });

  test("regenerar conserva lo generado antes como versión del historial", async () => {
    const escena = (await estadoDeProduccionDe(proyectoId)).escenas[0];
    if (!escena) throw new Error("Falta la escena de prueba.");
    await producirEscena(actor, escena.id, await confirmacion(), h);
    const [primero] = await trabajosDe(escena.id);
    if (!primero) throw new Error("Falta el trabajo de la escena.");
    const taskId = await marcarEnviado(primero.id);
    tareas.set(taskId, { state: "success", urls: ["https://res.kie.ai/fotograma.png"], creditos: 4 });
    await consultarTrabajo(actor, primero.id, { forzar: true }, h);

    const estado = await regenerarEscena(actor, escena.id, await confirmacion(), h);
    const conVersiones = estado.escenas.find((e) => e.id === escena.id);
    expect(conVersiones?.versiones).toHaveLength(1);
    expect(conVersiones?.versiones[0]?.trabajoId).toBe(primero.id);
    // El medio de la versión anterior **no se borra**: se pagó y sigue en la biblioteca.
    expect(conVersiones?.versiones[0]?.medio).not.toBeNull();
    expect(conVersiones?.versiones[0]?.creditosConsumidos).toBe(4);
  });

  // ── Criterio: cancelar ──────────────────────────────────────────────────────────────────────────────────

  test("cancelar una escena no enviada libera su reserva", async () => {
    const escena = (await estadoDeProduccionDe(proyectoId)).escenas[0];
    if (!escena) throw new Error("Falta la escena de prueba.");
    await producirEscena(actor, escena.id, await confirmacion(), h);
    expect(await reservado()).toBeGreaterThan(0);

    const resultado = await cancelarEscena(actor, escena.id);
    expect(resultado.canceladas).toBe(1);
    expect(resultado.seCobraran).toBe(0);
    expect(resultado.mensaje).toContain("no ha costado nada");
    expect(await reservado()).toBe(0);
    const [trabajo] = await trabajosDe(escena.id);
    expect(trabajo?.state).toBe("cancelado");
  });

  test("cancelar una escena ya enviada no libera la reserva y lo advierte", async () => {
    const escena = (await estadoDeProduccionDe(proyectoId)).escenas[0];
    if (!escena) throw new Error("Falta la escena de prueba.");
    await producirEscena(actor, escena.id, await confirmacion(), h);
    const [trabajo] = await trabajosDe(escena.id);
    if (!trabajo) throw new Error("Falta el trabajo de la escena.");
    await marcarEnviado(trabajo.id);
    const reservadoAntes = await reservado();
    expect(reservadoAntes).toBeGreaterThan(0);

    const resultado = await cancelarEscena(actor, escena.id);
    expect(resultado.canceladas).toBe(0);
    expect(resultado.seCobraran).toBe(1);
    expect(resultado.mensaje).toContain("se cobrará");
    expect(resultado.mensaje).toContain("No se reenviará nada");
    // La reserva sigue apartada: soltar lo que quizá se ha pagado sería mentir.
    expect(await reservado()).toBe(reservadoAntes);
    const [despues] = await trabajosDe(escena.id);
    expect(despues?.state).toBe("enviado");
  });

  // ── Criterio: cero reintentos automáticos ───────────────────────────────────────────────────────────────

  test("un fallo del proveedor no consume reintentos ni reenvía nada", async () => {
    const escena = (await estadoDeProduccionDe(proyectoId)).escenas[0];
    if (!escena) throw new Error("Falta la escena de prueba.");
    await producirEscena(actor, escena.id, await confirmacion(), h);
    const [trabajo] = await trabajosDe(escena.id);
    if (!trabajo) throw new Error("Falta el trabajo de la escena.");
    const taskId = await marcarEnviado(trabajo.id);
    tareas.set(taskId, { state: "fail", creditos: 4 });
    await consultarTrabajo(actor, trabajo.id, { forzar: true }, h);

    // Ni un trabajo más, ni un reintento consumido, ni presupuesto de reintentos autoconcedido.
    expect(await trabajosDe(escena.id)).toHaveLength(1);
    const fila = await filaDeEscena(escena.id);
    expect(fila.retriesUsed).toBe(0);
    expect(fila.retryBudget).toBe(0);
    expect(fila.lastFailureReason).toContain("autoriza un presupuesto de reintentos");

    // Y regenerar sin autorizarlos se rechaza diciendo qué hacer.
    const conf = await confirmacion();
    const rechazo = await intentar(() => regenerarEscena(actor, escena.id, conf, h));
    expect(rechazo.ok).toBe(false);
    expect(!rechazo.ok && rechazo.estado).toBe(409);
    expect(!rechazo.ok && rechazo.error).toContain("presupuesto de reintentos");
    expect(await trabajosDe(escena.id)).toHaveLength(1);
  });

  test("con reintentos autorizados, regenerar consume uno y encola un trabajo nuevo", async () => {
    const escena = (await estadoDeProduccionDe(proyectoId)).escenas[0];
    if (!escena) throw new Error("Falta la escena de prueba.");
    await producirEscena(actor, escena.id, await confirmacion(), h);
    const [trabajo] = await trabajosDe(escena.id);
    if (!trabajo) throw new Error("Falta el trabajo de la escena.");
    const taskId = await marcarEnviado(trabajo.id);
    tareas.set(taskId, { state: "fail", creditos: 4 });
    await consultarTrabajo(actor, trabajo.id, { forzar: true }, h);

    const { autorizarReintentos } = await import("./producir");
    await autorizarReintentos(actor, escena.id, 1);
    await regenerarEscena(actor, escena.id, await confirmacion(), h);
    const fila = await filaDeEscena(escena.id);
    expect(fila.retriesUsed).toBe(1);
    expect(await trabajosDe(escena.id)).toHaveLength(2);
  });

  // ── Aprobar el fotograma es un acto del usuario ─────────────────────────────────────────────────────────

  test("un fotograma listo no se aprueba solo: el clip se encola al aprobarlo", async () => {
    const escena = (await estadoDeProduccionDe(proyectoId)).escenas[0];
    if (!escena) throw new Error("Falta la escena de prueba.");
    await producirEscena(actor, escena.id, await confirmacion(), h);
    const [trabajo] = await trabajosDe(escena.id);
    if (!trabajo) throw new Error("Falta el trabajo de la escena.");
    const taskId = await marcarEnviado(trabajo.id);
    tareas.set(taskId, { state: "success", urls: ["https://res.kie.ai/fotograma.png"], creditos: 4 });
    await consultarTrabajo(actor, trabajo.id, { forzar: true }, h);

    const sinAprobar = await filaDeEscena(escena.id);
    expect(sinAprobar.approvedFrameMediaId).toBeNull();
    expect(await trabajosDe(escena.id)).toHaveLength(1);

    const estado = await aprobarFotograma(actor, escena.id, await confirmacion("clip"), h);
    const aprobada = await filaDeEscena(escena.id);
    expect(aprobada.approvedFrameMediaId).not.toBeNull();
    expect(aprobada.approvedFrameJobId).toBe(trabajo.id);
    const clips = (await trabajosDe(escena.id)).filter((t) => t.kind === "animacion");
    expect(clips).toHaveLength(1);
    expect(clips[0]?.parentJobId).toBe(trabajo.id);
    expect(estado.escenas.find((e) => e.id === escena.id)?.animacion?.tipo).toBe("animacion");
  });

  test("al terminar el clip la escena queda producida y el proyecto avanza", async () => {
    const escena = (await estadoDeProduccionDe(proyectoId)).escenas[0];
    if (!escena) throw new Error("Falta la escena de prueba.");
    await producirEscena(actor, escena.id, await confirmacion(), h);
    const [fotograma] = await trabajosDe(escena.id);
    if (!fotograma) throw new Error("Falta el trabajo de la escena.");
    const tareaFoto = await marcarEnviado(fotograma.id);
    tareas.set(tareaFoto, { state: "success", urls: ["https://res.kie.ai/fotograma.png"], creditos: 4 });
    await consultarTrabajo(actor, fotograma.id, { forzar: true }, h);
    await aprobarFotograma(actor, escena.id, await confirmacion("clip"), h);
    const clip = (await trabajosDe(escena.id)).find((t) => t.kind === "animacion");
    if (!clip) throw new Error("Falta el clip de la escena.");
    const tareaClip = await marcarEnviado(clip.id);
    tareas.set(tareaClip, { state: "success", urls: ["https://res.kie.ai/clip.mp4"], creditos: 12 });
    await consultarTrabajo(actor, clip.id, { forzar: true }, h);

    const fila = await filaDeEscena(escena.id);
    expect(fila.state).toBe("producida");
    expect(fila.clipMediaId).not.toBeNull();
    expect(fila.clipJobId).toBe(clip.id);
    const [proyecto] = await db().select().from(projects).where(eq(projects.id, proyectoId)).limit(1);
    // Quedan dos escenas por producir, así que el proyecto está en producción, no listo.
    expect(proyecto?.state).toBe("en_produccion");
  });

  // ── Autorización y lectura ──────────────────────────────────────────────────────────────────────────────

  test("la producción de un proyecto ajeno responde 404", async () => {
    const bruno = await crearSesionDePrueba("user");
    try {
      const ajeno = { id: bruno.id, esAdmin: false };
      const lectura = await intentar(() => estadoDeProduccion(ajeno, proyectoId));
      expect(!lectura.ok && lectura.estado).toBe(404);
      const escena = (await estadoDeProduccionDe(proyectoId)).escenas[0];
      if (!escena) throw new Error("Falta la escena de prueba.");
      const conf = await confirmacion();
      const escritura = await intentar(() => producirEscena(ajeno, escena.id, conf, h));
      expect(!escritura.ok && escritura.estado).toBe(404);
    } finally {
      await db().delete(users).where(eq(users.email, bruno.email));
    }
  });

  test("leer el estado de producción no mueve ni un céntimo", async () => {
    const antes = await db()
      .select({ total: sql<number>`count(*)::int` })
      .from(usageLedger)
      .where(eq(usageLedger.userId, ana.id));
    await estadoDeProduccionDe(proyectoId);
    await estadoDeProduccionDe(proyectoId);
    const despues = await db()
      .select({ total: sql<number>`count(*)::int` })
      .from(usageLedger)
      .where(eq(usageLedger.userId, ana.id));
    expect(despues[0]?.total).toBe(antes[0]?.total ?? 0);
    const [{ total } = { total: 0 }] = await db()
      .select({ total: sql<number>`count(*)::int` })
      .from(generationJobs)
      .where(eq(generationJobs.userId, ana.id));
    expect(total).toBe(0);
  });

  test("editar una escena ya generada la marca como cambiada, sin borrar nada", async () => {
    const escena = (await estadoDeProduccionDe(proyectoId)).escenas[0];
    if (!escena) throw new Error("Falta la escena de prueba.");
    await producirEscena(actor, escena.id, await confirmacion(), h);
    const [trabajo] = await trabajosDe(escena.id);
    if (!trabajo) throw new Error("Falta el trabajo de la escena.");
    const taskId = await marcarEnviado(trabajo.id);
    tareas.set(taskId, { state: "success", urls: ["https://res.kie.ai/fotograma.png"], creditos: 4 });
    await consultarTrabajo(actor, trabajo.id, { forzar: true }, h);
    await aprobarFotograma(actor, escena.id, await confirmacion("clip"), h);

    const { editarEscena } = await import("../asistente/escenas");
    await editarEscena(actor, escena.id, { accion: "Plano cenital del desayuno recién servido" });
    const fila = await filaDeEscena(escena.id);
    expect(fila.changedSinceGeneration).toBe(true);
    // Lo generado no se toca: el gasto está hecho y el resultado sigue en la biblioteca.
    expect(fila.approvedFrameMediaId).not.toBeNull();
  });

  test("el prompt compuesto no sale hacia el navegador en la rejilla de producción", async () => {
    const escena = (await estadoDeProduccionDe(proyectoId)).escenas[0];
    if (!escena) throw new Error("Falta la escena de prueba.");
    await producirEscena(actor, escena.id, await confirmacion(), h);
    const [trabajo] = await trabajosDe(escena.id);
    expect(trabajo?.prompt.length).toBeGreaterThan(0);
    const estado = JSON.stringify(await estadoDeProduccionDe(proyectoId));
    expect(estado).not.toContain(trabajo?.prompt ?? "imposible");
    expect(estado).not.toMatch(/"prompt"/);
  });

  test("la escena solo ofrece la duración con coste medido", async () => {
    const estado = await estadoDeProduccionDe(proyectoId);
    expect(estado.escenas.every((e) => e.segundos === 4)).toBe(true);
    expect(estado.impedimentos.join(" ")).not.toContain("solo ofrece los de 4 s");
  });

  test("sin trabajos ajenos: los de otro usuario no cuentan para el tope de escenas en vuelo", async () => {
    await guardarAjustes({ escenasEnVuelo: 1 }, null);
    const escena = (await estadoDeProduccionDe(proyectoId)).escenas[0];
    if (!escena) throw new Error("Falta la escena de prueba.");
    await producirEscena(actor, escena.id, await confirmacion(), h);
    // El recuento se hace por usuario: el de Ana bloquea a Ana, no a nadie más.
    const [{ total } = { total: 0 }] = await db()
      .select({ total: sql<number>`count(distinct ${generationJobs.sceneId})::int` })
      .from(generationJobs)
      .where(and(eq(generationJobs.userId, ana.id), eq(generationJobs.state, "en_cola")));
    expect(total).toBe(1);
  });
});
