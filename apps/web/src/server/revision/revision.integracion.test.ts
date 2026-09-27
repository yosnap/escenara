import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { ProyectoDetalle } from "@/lib/proyectos";
import type { RevisionProyectoVista } from "@/lib/revision";

/**
 * Revisión de continuidad de las escenas producidas (RF07, 0.20.0) contra el PostgreSQL y el SeaweedFS locales
 * (`bun run services:up`).
 *
 * **Ningún test llama a KIE ni a ningún proveedor de pago**: el proveedor se simula con un `fetch` propio, la
 * revisión multimodal se simula con un adaptador inventado y la clave es de mentira. Los clips que se revisan son de
 * verdad, hechos con `ffmpeg`: medir un MP4 inventado a mano no probaría nada de lo que hace ffprobe.
 *
 * Los cinco criterios de aceptación de la fase, uno por uno:
 *
 * - un fallo crítico abierto **impide exportar** (se comprueba con el motor de controles, que es quien decidirá);
 * - las comprobaciones automáticas detectan un clip con **otra duración o otra proporción** y uno **sin audio**;
 * - la revisión multimodal **no se ejecuta sin confirmación de coste** y, cuando se ejecuta, queda en el
 *   `UsageLedger` con su reserva, su consumo y su liberación;
 * - **regenerar** una escena invalida su revisión anterior;
 * - **solo el dueño** revisa sus escenas.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_revision");
}

const { and, eq, sql } = await import("drizzle-orm");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaEscenas = await import("@/app/api/proyectos/[id]/escenas/route");
const rutaPlan = await import("@/app/api/proyectos/[id]/plan/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const rutaRevision = await import("@/app/api/proyectos/[id]/revision/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, media, projects, rateLimits, reviewResults, scenes, usageLedger, users } = await import(
  "../db/esquema"
);
const { crearMedio } = await import("../media/servicio");
const { evaluar, frenosQueGatean } = await import("../controles/motor");
const { hechosDeExportacion, parametrosDeControles } = await import("../controles/hechos");
const { regenerarEscena } = await import("../produccion/producir");
const { herramientasDeMedida } = await import("./medicion");
const { revisarConModelo } = await import("./multimodal");
const { barrerRevisionesReservadas, cerrarGastoDeRevision, MS_MAXIMO_RESERVADO } = await import("./gasto");
const { comprometidoDe } = await import("../presupuesto/deposito");
const { estadoDeRevision } = await import("./consulta");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type Buscador = import("../proveedores/codigos").Buscador;
type PersonajeVista = import("@/lib/personajes").PersonajeVista;

const CLAVE = "sk-revision-clave-de-kie-inventada-ffff";

const hayFfmpeg = hayBaseDeDatos && (await herramientasDeMedida()).disponibles;

const sePuede = hayBaseDeDatos && hayFfmpeg;
if (hayBaseDeDatos && !hayFfmpeg) {
  console.warn("[revisión] FFmpeg no está instalado: la suite de integración de la revisión se salta.");
}

// ── Proveedor simulado ─────────────────────────────────────────────────────────────────────────────────────

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url) => {
  if (url.includes("/chat/credit")) return sobre(1_000_000);
  if (url.includes("file-stream-upload")) return sobre({ downloadUrl: "https://tempfile.kie.ai/referencia.png" });
  if (url.includes("createTask")) return sobre({ taskId: `rev_${crypto.randomUUID()}` });
  if (url.includes("recordInfo")) return sobre({ state: "waiting", failMsg: "" });
  throw new Error(`URL no simulada: ${url}`);
};

const h = { buscar, descargar: async () => ({ archivo: new File([], "x"), origen: "" }) };

// ── Clips de verdad ────────────────────────────────────────────────────────────────────────────────────────

const carpeta = sePuede ? await mkdtemp(path.join(tmpdir(), "escenara-revision-int-")) : "";

async function ffmpeg(nombre: string, ...argumentos: string[]): Promise<string> {
  const ruta = path.join(carpeta, nombre);
  const proceso = Bun.spawn(["ffmpeg", "-y", "-nostdin", "-hide_banner", "-loglevel", "error", ...argumentos, ruta], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [codigo, error] = await Promise.all([proceso.exited, new Response(proceso.stderr).text()]);
  if (codigo !== 0) throw new Error(`ffmpeg no ha podido crear ${nombre}: ${error}`);
  return ruta;
}

/** Clip vertical 9:16 a 720p de los segundos que se pidan, con audio o sin él: es lo que pide la producción. */
const clipCorrecto = (nombre: string, segundos: number, conAudio = true) =>
  ffmpeg(
    nombre,
    "-f",
    "lavfi",
    "-i",
    `color=c=#3d6bff:s=720x1280:d=${segundos}:r=24`,
    ...(conAudio ? ["-f", "lavfi", "-i", `sine=frequency=440:duration=${segundos}`, "-shortest"] : []),
    "-pix_fmt",
    "yuv420p",
  );

/** Clip cuadrado a 480p: falla la proporción y la resolución, que son fallos críticos. */
const clipCuadrado = (nombre: string) =>
  ffmpeg(nombre, "-f", "lavfi", "-i", "color=c=#ff5c8a:s=480x480:d=4:r=24", "-pix_fmt", "yuv420p");

function bytes(datos: Uint8Array): Uint8Array<ArrayBuffer> {
  const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
  copia.set(datos);
  return copia;
}

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

describe.skipIf(!sePuede)("revisión de continuidad de las escenas producidas", () => {
  let ana: Sesion;
  let bob: Sesion;
  let actor: Actor;
  let personajeId: string;
  let proyectoId: string;
  let escenaId: string;
  /** Segundos planificados de la escena: es contra lo que se compara lo medido. */
  let segundos: number;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;

  beforeAll(async () => {
    // Esta suite cambia ajustes de la instalación y borra el ritmo de escrituras: nunca en la base de desarrollo.
    exigirBaseDeDatosDePrueba("escenara_pruebas_revision");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    bob = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    personajeId = (await nuevoPersonaje()).id;
    await guardarAjustes({ presupuestoCreditos: 0, presupuestoTrabajo: 0, trabajosSimultaneos: 20 }, null);
  });

  afterAll(async () => {
    if (ana?.email) await db().delete(users).where(eq(users.email, ana.email));
    if (bob?.email) await db().delete(users).where(eq(users.email, bob.email));
    // Se restauran **los valores que había**, leídos al empezar: la base de prueba persiste entre ejecuciones.
    await guardarAjustes(
      {
        presupuestoCreditos: ajustesPrevios.presupuestoCreditos,
        presupuestoTrabajo: ajustesPrevios.presupuestoTrabajo,
        trabajosSimultaneos: ajustesPrevios.trabajosSimultaneos,
        escenasEnVuelo: ajustesPrevios.escenasEnVuelo,
        avisoCreditos: ajustesPrevios.avisoCreditos,
        revisionToleranciaDuracion: ajustesPrevios.revisionToleranciaDuracion,
        revisionSegundosPlanosMaximos: ajustesPrevios.revisionSegundosPlanosMaximos,
        revisionExigirAudio: ajustesPrevios.revisionExigirAudio,
        revisionMultimodalActiva: ajustesPrevios.revisionMultimodalActiva,
      },
      null,
    );
    if (carpeta !== "") await rm(carpeta, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await guardarAjustes(
      {
        escenasEnVuelo: 4,
        avisoCreditos: 1_000_000,
        revisionToleranciaDuracion: 0.5,
        revisionSegundosPlanosMaximos: 0.5,
        revisionExigirAudio: false,
        // Apagada de fábrica y apagada aquí: cada test que la necesite la enciende a propósito.
        revisionMultimodalActiva: false,
      },
      null,
    );
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(usageLedger).where(eq(usageLedger.userId, ana.id));
    await db().delete(projects).where(eq(projects.userId, ana.id));
    exigirBaseDeDatosDePrueba("escenara_pruebas_revision");
    await db().delete(rateLimits);
    proyectoId = await nuevoProyectoAprobado();
    const primera = await primeraEscena(proyectoId);
    escenaId = primera.id;
    // La duración la fija el proyecto y la escena la copia: el clip de prueba tiene que durar eso, no un número fijo.
    segundos = primera.plannedSeconds;
  });

  /** Personaje de Ana con tres fotos y su consentimiento propio. */
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

  /** Proyecto de dos escenas de 4 s con protagonista y plan aprobado. */
  async function nuevoProyectoAprobado(): Promise<string> {
    const creado = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", {
        titulo: "Rutina de mañana",
        formato: "reel_vertical",
        idea: "Dos momentos de una mañana tranquila en casa.",
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
    const { detalleProyecto } = await import("../asistente/plan");
    const antes = await detalleProyecto(actor, id);
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

  async function primeraEscena(proyecto: string) {
    const { escenasDe } = await import("../asistente/consulta");
    const escena = (await escenasDe(proyecto))[0];
    if (!escena) throw new Error("Falta la escena de prueba.");
    return escena;
  }

  /**
   * Deja una escena **producida**: con su fotograma aprobado y su clip en la biblioteca. Se hace directamente en la
   * base de datos a propósito: lo que se prueba aquí es la revisión, y hacer pasar dos generaciones reales por el
   * proveedor simulado no añadiría ninguna garantía sobre ella.
   */
  async function conClip(escena: string, ruta: string): Promise<string> {
    const archivo = new File([bytes(new Uint8Array(await Bun.file(ruta).arrayBuffer()))], path.basename(ruta), {
      type: "video/mp4",
    });
    const clip = await crearMedio(actor, archivo);
    const fotograma = await crearMedio(
      actor,
      new File([await fotoDeReferencia()], "fotograma.png", { type: "image/png" }),
    );
    await db()
      .update(scenes)
      .set({ clipMediaId: clip.id, approvedFrameMediaId: fotograma.id, state: "producida" })
      .where(eq(scenes.id, escena));
    return clip.id;
  }

  /** Sustituye el **archivo** del clip de la escena conservando su medio: lo que se arregla es el contenedor. */
  async function sustituirClip(escena: string, ruta: string): Promise<void> {
    const [fila] = await db().select().from(scenes).where(eq(scenes.id, escena));
    if (!fila?.clipMediaId) throw new Error("La escena no tiene clip que sustituir.");
    const [medio] = await db().select().from(media).where(eq(media.id, fila.clipMediaId));
    if (!medio) throw new Error("Falta el medio del clip.");
    const { guardarObjeto } = await import("../almacenamiento");
    await guardarObjeto(medio.storageKey, new Uint8Array(await Bun.file(ruta).arrayBuffer()), "video/mp4");
  }

  /** Pone en la escena **otro** medio como clip: es lo que deja una regeneración ya terminada. */
  async function sustituirEscenaConOtroClip(escena: string, ruta: string): Promise<string> {
    const archivo = new File([bytes(new Uint8Array(await Bun.file(ruta).arrayBuffer()))], "otro.mp4", {
      type: "video/mp4",
    });
    const clip = await crearMedio(actor, archivo);
    await db().update(scenes).set({ clipMediaId: clip.id }).where(eq(scenes.id, escena));
    return clip.id;
  }

  /** Regenera una escena con la confirmación de coste vigente. El proveedor está simulado: no se gasta nada. */
  async function regenerar(escena: string): Promise<void> {
    const { eleccionesDelPlan } = await import("../asistente/plan");
    const elecciones = await eleccionesDelPlan();
    await regenerarEscena(
      actor,
      escena,
      {
        derechos: true,
        sinTerceros: true,
        creditosConfirmados: Math.ceil(elecciones.fotograma?.precio.creditos ?? 0),
        selloEstimacion: elecciones.fotograma?.precio.sello ?? "",
        claveIdempotencia: crypto.randomUUID(),
        avisoUmbralAceptado: true,
        avisosConfirmados: [],
      },
      h,
    );
  }

  const revisionesDe = (escena: string) => db().select().from(reviewResults).where(eq(reviewResults.sceneId, escena));

  const apuntesDe = () => db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id));

  const SELLO_PRUEBA = "kie:modelo-de-prueba:clip@v1";

  /**
   * Modelo simulado que **no sale a la red**: ningún modelo del catálogo declara todavía `multimodal_review`, así
   * que el camino de pago se prueba con un adaptador inventado. Es la única forma de comprobar que el gasto se
   * apunta y que la idempotencia corta sin gastar un crédito de verdad.
   */
  function modeloSimulado(responder: () => Promise<{ resumen: string; creditos: number | null }>) {
    const cuenta = { llamadas: 0 };
    const herramientas = {
      buscar,
      elegirModelo: async () => ({
        proveedor: "kie",
        modelo: "modelo-de-prueba",
        nombreModelo: "Modelo de prueba",
        adaptador: {
          revisarMedio: async () => {
            cuenta.llamadas++;
            return responder();
          },
        },
        precio: {
          proveedor: "kie",
          modelo: "modelo-de-prueba",
          unidad: "clip",
          creditos: 5,
          fuente: "prueba",
          comprobado: "2026-09-27",
          sello: SELLO_PRUEBA,
        },
      }),
    };
    return { herramientas, cuenta };
  }

  /** Confirmación tal como la manda el navegador, con su clave. Cada llamada estrena clave salvo que se le dé una. */
  const confirmacionMultimodal = (extra: Record<string, unknown> = {}) => ({
    creditosConfirmados: 5,
    selloEstimacion: SELLO_PRUEBA,
    claveIdempotencia: crypto.randomUUID(),
    avisoUmbralAceptado: true,
    ...extra,
  });

  /** Llama a la ruta de revisión como lo haría el navegador. */
  const accion = (sesion: Sesion, proyecto: string, cuerpo: Record<string, unknown>) =>
    rutaRevision.POST(pedir(sesion, `/api/proyectos/${proyecto}/revision`, "POST", cuerpo), ctx(proyecto));

  const estado = (): Promise<RevisionProyectoVista> => estadoDeRevision(actor, proyectoId);

  /** Lo que diría el motor de controles si se fuera a exportar este proyecto ahora mismo. */
  async function evaluacionDeExportacion() {
    return evaluar({
      tipo: "animacion",
      parametros: await parametrosDeControles(),
      exportacion: await hechosDeExportacion(proyectoId),
    });
  }

  // ── Criterio: las comprobaciones automáticas detectan duración, proporción y falta de audio ─────────────

  test("un clip correcto pasa las comprobaciones y no bloquea, pero tampoco se da por revisado", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    const respuesta = await accion(ana, proyectoId, { accion: "comprobar", escenaId });
    expect(respuesta.status).toBe(200);
    const vista = (await respuesta.json()) as RevisionProyectoVista;
    const escena = vista.escenas.find((e) => e.id === escenaId);
    expect(escena?.automatica).not.toBeNull();
    expect(escena?.automatica?.severidad).not.toBe("critica");
    // La automática nunca acepta: mide el archivo, no la identidad.
    expect(escena?.automatica?.veredicto).toBe("pendiente");
    expect(escena?.bloquea).toBe(false);
    expect(vista.criticosAbiertos).toBe(0);
    // Y sigue faltando la revisión humana.
    expect(escena?.humana).toBeNull();
  });

  test("un clip con otra duración se detecta como fallo crítico y bloquea la exportación", async () => {
    await conClip(escenaId, await clipCorrecto("corto.mp4", 1));
    expect((await accion(ana, proyectoId, { accion: "comprobar", escenaId })).status).toBe(200);
    const escena = (await estado()).escenas.find((e) => e.id === escenaId);
    const duracion = escena?.automatica?.comprobaciones.find((c) => c.clave === "duracion");
    expect(duracion?.resultado).toBe("falla");
    expect(duracion?.medido).not.toBe("");
    expect(escena?.bloquea).toBe(true);

    const evaluacion = await evaluacionDeExportacion();
    expect(evaluacion.estado).toBe("bloqueado");
    expect(frenosQueGatean(evaluacion).map((f) => f.regla)).toContain("revision-critica-abierta");
  });

  test("un clip con otra proporción se detecta como fallo crítico", async () => {
    await conClip(escenaId, await clipCuadrado("cuadrado.mp4"));
    expect((await accion(ana, proyectoId, { accion: "comprobar", escenaId })).status).toBe(200);
    const escena = (await estado()).escenas.find((e) => e.id === escenaId);
    const proporcion = escena?.automatica?.comprobaciones.find((c) => c.clave === "proporcion");
    expect(proporcion?.resultado).toBe("falla");
    expect(proporcion?.severidad).toBe("critica");
    expect((await evaluacionDeExportacion()).estado).toBe("bloqueado");
  });

  test("un clip sin audio se detecta, y solo cuenta como fallo si la instalación lo exige", async () => {
    await conClip(escenaId, await clipCorrecto("mudo.mp4", segundos, false));
    expect((await accion(ana, proyectoId, { accion: "comprobar", escenaId })).status).toBe(200);
    const suave = (await estado()).escenas
      .find((e) => e.id === escenaId)
      ?.automatica?.comprobaciones.find((c) => c.clave === "audio");
    expect(suave?.resultado).toBe("pasa");

    await guardarAjustes({ revisionExigirAudio: true }, null);
    expect((await accion(ana, proyectoId, { accion: "comprobar", escenaId })).status).toBe(200);
    const escena = (await estado()).escenas.find((e) => e.id === escenaId);
    const duro = escena?.automatica?.comprobaciones.find((c) => c.clave === "audio");
    expect(duro?.resultado).toBe("falla");
    // Falta el audio, pero no es un formato incorrecto: avisa y no bloquea.
    expect(duro?.severidad).toBe("aviso");
    expect(escena?.bloquea).toBe(false);
  });

  // ── Criterio: un fallo crítico abierto impide exportar ─────────────────────────────────────────────────

  test("marcar una escena como crítica bloquea la exportación, y aceptarla después la desbloquea", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    const marcada = await accion(ana, proyectoId, {
      accion: "marcar-critico",
      escenaId,
      motivo: "El pelo cambia de color respecto a la hoja de personaje.",
    });
    expect(marcada.status).toBe(200);
    const bloqueado = (await marcada.json()) as RevisionProyectoVista;
    expect(bloqueado.criticosAbiertos).toBe(1);
    expect(bloqueado.escenas.find((e) => e.id === escenaId)?.motivoBloqueo).toContain("pelo");
    expect((await evaluacionDeExportacion()).estado).toBe("bloqueado");

    // Un crítico que marcó una persona se cierra con su propia decisión posterior: siempre hay salida.
    expect((await accion(ana, proyectoId, { accion: "aceptar", escenaId })).status).toBe(200);
    expect((await estado()).criticosAbiertos).toBe(0);
    expect((await evaluacionDeExportacion()).estado).toBe("listo");
  });

  test("aceptar no cierra un crítico técnico: un clip que dura otra cosa sigue bloqueando", async () => {
    await conClip(escenaId, await clipCorrecto("corto.mp4", 1));
    expect((await accion(ana, proyectoId, { accion: "comprobar", escenaId })).status).toBe(200);
    expect((await accion(ana, proyectoId, { accion: "aceptar", escenaId })).status).toBe(200);
    expect((await estado()).criticosAbiertos).toBe(1);
    expect((await evaluacionDeExportacion()).estado).toBe("bloqueado");
  });

  test("rechazar sin motivo se rechaza en el borde y no deja ninguna revisión", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    const respuesta = await accion(ana, proyectoId, { accion: "rechazar", escenaId, motivo: "no" });
    expect(respuesta.status).toBe(400);
    expect(await revisionesDe(escenaId)).toHaveLength(0);
  });

  // ── Criterio: regenerar invalida la revisión anterior ──────────────────────────────────────────────────

  test("regenerar una escena invalida su revisión, sin borrarla y diciendo por qué", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    expect((await accion(ana, proyectoId, { accion: "comprobar", escenaId })).status).toBe(200);
    expect((await accion(ana, proyectoId, { accion: "aceptar", escenaId })).status).toBe(200);
    const antes = await revisionesDe(escenaId);
    expect(antes).toHaveLength(2);
    expect(antes.every((r) => r.invalidatedAt === null)).toBe(true);

    await regenerar(escenaId);

    const despues = await revisionesDe(escenaId);
    // Ninguna se borra: son la trazabilidad de lo que se dio por bueno y de cuándo dejó de valer.
    expect(despues).toHaveLength(2);
    expect(despues.every((r) => r.invalidatedAt !== null)).toBe(true);
    expect(despues[0]?.invalidationReason).toContain("regeneró");

    const vista = await estado();
    const escena = vista.escenas.find((e) => e.id === escenaId);
    expect(escena?.automatica).toBeNull();
    expect(escena?.humana).toBeNull();
    expect(escena?.historial).toHaveLength(2);
    expect(vista.criticosAbiertos).toBe(0);
  });

  test("regenerar una escena con un crítico marcado desbloquea la exportación", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    expect(
      (
        await accion(ana, proyectoId, {
          accion: "marcar-critico",
          escenaId,
          motivo: "La luz no encaja con la escena anterior.",
        })
      ).status,
    ).toBe(200);
    expect((await evaluacionDeExportacion()).estado).toBe("bloqueado");

    await regenerar(escenaId);
    expect((await evaluacionDeExportacion()).estado).toBe("listo");
  });

  // ── Criterio: solo el dueño revisa sus escenas ─────────────────────────────────────────────────────────

  test("otra persona no puede revisar una escena ajena, ni leerla, ni con su identificador en la mano", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    for (const cuerpo of [
      { accion: "comprobar", escenaId },
      { accion: "aceptar", escenaId },
      { accion: "marcar-critico", escenaId, motivo: "quiero bloquear esto ajeno" },
    ]) {
      const respuesta = await accion(bob, proyectoId, cuerpo);
      expect(respuesta.status).toBe(404);
    }
    const lectura = await rutaRevision.GET(pedir(bob, `/api/proyectos/${proyectoId}/revision`), ctx(proyectoId));
    expect(lectura.status).toBe(404);
    expect(await revisionesDe(escenaId)).toHaveLength(0);
  });

  test("una escena propia pedida por la URL de otro proyecto no se revisa", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    const otro = await nuevoProyectoAprobado();
    const respuesta = await accion(ana, otro, { accion: "comprobar", escenaId });
    expect(respuesta.status).toBe(404);
    expect(await revisionesDe(escenaId)).toHaveLength(0);
  });

  // ── Criterio: la revisión multimodal no se ejecuta sin confirmación y queda en el registro de gasto ────

  test("sin confirmación del coste no se ejecuta ni se apunta nada en el registro de gasto", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    await guardarAjustes({ revisionMultimodalActiva: true }, null);
    for (const cuerpo of [
      { accion: "multimodal", escenaId },
      { accion: "multimodal", escenaId, creditosConfirmados: 5 },
      { accion: "multimodal", escenaId, selloEstimacion: "kie:modelo:clip@v1" },
    ]) {
      const respuesta = await accion(ana, proyectoId, cuerpo);
      expect(respuesta.status).toBe(400);
    }
    expect(await revisionesDe(escenaId)).toHaveLength(0);
    expect(await apuntesDe()).toHaveLength(0);
  });

  test("con el ajuste apagado no se ejecuta aunque la confirmación venga completa", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    const respuesta = await accion(ana, proyectoId, {
      accion: "multimodal",
      escenaId,
      creditosConfirmados: 5,
      selloEstimacion: "kie:modelo:clip@v1",
      claveIdempotencia: crypto.randomUUID(),
      avisoUmbralAceptado: true,
    });
    expect(respuesta.status).toBe(409);
    expect(await revisionesDe(escenaId)).toHaveLength(0);
    expect(await apuntesDe()).toHaveLength(0);
  });

  test("hoy no hay ningún modelo que sepa mirar un clip, así que la pantalla lo dice y no la ofrece", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    await guardarAjustes({ revisionMultimodalActiva: true }, null);
    const vista = await estado();
    expect(vista.multimodalDisponible).toBe(false);
    expect(vista.motivoSinMultimodal).not.toBe("");
    expect(vista.creditosPorMultimodal).toBe(0);
  });

  test("cuando se ejecuta con confirmación válida, queda en el ledger con reserva, consumo y liberación", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    await guardarAjustes({ revisionMultimodalActiva: true }, null);
    const { herramientas, cuenta } = modeloSimulado(async () => ({
      resumen: "Se ve una persona de pie junto a una ventana, con luz suave.",
      creditos: 7,
    }));

    // Sin confirmación válida tampoco se ejecuta por este camino: el sello tiene que ser el vigente.
    await expect(
      revisarConModelo(
        actor,
        escenaId,
        confirmacionMultimodal({ selloEstimacion: "kie:modelo-de-prueba:clip@v0" }),
        herramientas,
      ),
    ).rejects.toThrow();
    expect(cuenta.llamadas).toBe(0);
    expect(await apuntesDe()).toHaveLength(0);

    await revisarConModelo(actor, escenaId, confirmacionMultimodal(), herramientas);
    expect(cuenta.llamadas).toBe(1);

    const [revision] = await revisionesDe(escenaId);
    expect(revision?.kind).toBe("multimodal");
    // La opinión de un modelo no acepta ni rechaza nada: informa.
    expect(revision?.verdict).toBe("pendiente");
    expect(revision?.severity).toBe("informativa");
    expect(revision?.notes).toContain("ventana");
    // Lo que se le muestra al usuario es lo apuntado: los créditos que informó el proveedor.
    expect(revision?.credits).toBe(7);
    // Y su gasto queda cerrado, así que el barrido no tiene nada que hacer con ella.
    expect(revision?.state).toBe("cerrado");

    const apuntes = await apuntesDe();
    expect(apuntes.every((a) => a.reviewId === revision?.id)).toBe(true);
    const porTipo = new Map(apuntes.map((a) => [a.entryType, a]));
    expect(porTipo.get("reserva")?.credits).toBe(5);
    expect(porTipo.get("consumo")?.credits).toBe(7);
    expect(porTipo.get("consumo")?.informed).toBe(true);
    expect(porTipo.get("liberacion")?.credits).toBe(-5);
    // El proveedor ha cobrado 7 por encima de los 5 apartados: queda su aviso con la cifra, sin sumar gasto.
    const exceso = porTipo.get("ajuste");
    expect(exceso?.credits).toBe(0);
    expect(exceso?.note).toContain("por encima de los 5");
    // Reserva y liberación se cancelan: lo comprometido es solo el consumo.
    const comprometido = apuntes.reduce((suma, a) => suma + a.credits, 0);
    expect(comprometido).toBe(7);
  });

  test("la misma confirmación repetida no paga dos veces: una llamada, una reserva y una sola revisión", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    await guardarAjustes({ revisionMultimodalActiva: true }, null);
    const { herramientas, cuenta } = modeloSimulado(async () => ({ resumen: "Un plano de una ventana.", creditos: 7 }));
    // La clave es la que firma el navegador: mientras no cambie lo confirmado, es la misma en los dos envíos.
    const confirmacion = confirmacionMultimodal();

    await revisarConModelo(actor, escenaId, confirmacion, herramientas);
    await revisarConModelo(actor, escenaId, confirmacion, herramientas);

    // El segundo envío devuelve la revisión que ya existe: no vuelve a llamar al proveedor ni aparta nada.
    expect(cuenta.llamadas).toBe(1);
    expect(await revisionesDe(escenaId)).toHaveLength(1);
    const apuntes = await apuntesDe();
    expect(apuntes.filter((a) => a.entryType === "reserva")).toHaveLength(1);
    expect(apuntes.filter((a) => a.entryType === "consumo")).toHaveLength(1);
    expect(apuntes.filter((a) => a.entryType === "liberacion")).toHaveLength(1);
  });

  test("dos envíos simultáneos con la misma clave tampoco pagan dos veces", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    await guardarAjustes({ revisionMultimodalActiva: true }, null);
    const { herramientas, cuenta } = modeloSimulado(async () => ({ resumen: "Un plano de una ventana.", creditos: 7 }));
    const confirmacion = confirmacionMultimodal();

    // A la vez, de verdad: la serialización la pone la transacción que bloquea la fila del usuario.
    const resultados = await Promise.allSettled([
      revisarConModelo(actor, escenaId, confirmacion, herramientas),
      revisarConModelo(actor, escenaId, confirmacion, herramientas),
    ]);
    // Ninguno falla: el que llega segundo se encuentra la revisión hecha y no es un error, es la misma petición.
    expect(resultados.filter((r) => r.status === "rejected")).toHaveLength(0);
    expect(cuenta.llamadas).toBe(1);
    expect(await revisionesDe(escenaId)).toHaveLength(1);
    expect((await apuntesDe()).filter((a) => a.entryType === "reserva")).toHaveLength(1);
  });

  test("una clave distinta sí es otra revisión: el usuario ha vuelto a confirmar el gasto", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    await guardarAjustes({ revisionMultimodalActiva: true }, null);
    const { herramientas, cuenta } = modeloSimulado(async () => ({ resumen: "Un plano de una ventana.", creditos: 7 }));
    await revisarConModelo(actor, escenaId, confirmacionMultimodal(), herramientas);
    await revisarConModelo(actor, escenaId, confirmacionMultimodal(), herramientas);
    expect(cuenta.llamadas).toBe(2);
    expect(await revisionesDe(escenaId)).toHaveLength(2);
    expect((await apuntesDe()).filter((a) => a.entryType === "reserva")).toHaveLength(2);
  });

  test("sin la clave de la confirmación la ruta lo rechaza y no deja ni un apunte", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    await guardarAjustes({ revisionMultimodalActiva: true }, null);
    const respuesta = await accion(ana, proyectoId, {
      accion: "multimodal",
      escenaId,
      creditosConfirmados: 5,
      selloEstimacion: SELLO_PRUEBA,
      avisoUmbralAceptado: true,
    });
    expect(respuesta.status).toBe(400);
    expect(await revisionesDe(escenaId)).toHaveLength(0);
    expect(await apuntesDe()).toHaveLength(0);
  });

  test("un fallo del modelo conserva la estimación como gasto: no se suelta lo que quizá se ha pagado", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    await guardarAjustes({ revisionMultimodalActiva: true }, null);
    const { herramientas } = modeloSimulado(async () => {
      throw new Error("el proveedor ha cortado la conexión");
    });
    await revisarConModelo(actor, escenaId, confirmacionMultimodal(), herramientas);
    const [revision] = await revisionesDe(escenaId);
    expect(revision?.notes).toContain("no se sabe si llegó a ejecutarse");
    const apuntes = await apuntesDe();
    const consumo = apuntes.find((a) => a.entryType === "consumo");
    // Se conserva la estimación, marcada como estimación nuestra y no como cifra del proveedor.
    expect(consumo?.credits).toBe(5);
    expect(consumo?.informed).toBe(false);
    // Sin créditos informados no se afirma ningún exceso: sería comparar nuestra estimación consigo misma.
    expect(apuntes.some((a) => a.entryType === "ajuste")).toBe(false);
  });

  test("cerrar dos veces el gasto no cambia lo apuntado y devuelve los créditos que ya constan", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    await guardarAjustes({ revisionMultimodalActiva: true }, null);
    const { herramientas } = modeloSimulado(async () => ({ resumen: "Un plano.", creditos: 7 }));
    await revisarConModelo(actor, escenaId, confirmacionMultimodal(), herramientas);
    const [revision] = await revisionesDe(escenaId);
    if (!revision) throw new Error("Falta la revisión.");

    // Un segundo cierre con otra cifra no toca el apunte y devuelve **lo apuntado**, no lo que traía la llamada.
    const devueltos = await cerrarGastoDeRevision(revision.id, 99, "cierre repetido de prueba");
    expect(devueltos).toBe(7);
    const apuntes = await apuntesDe();
    expect(apuntes.filter((a) => a.entryType === "consumo")).toHaveLength(1);
    expect(apuntes.find((a) => a.entryType === "consumo")?.credits).toBe(7);
  });

  test("si el barrido cierra antes, el cierre de verdad respeta lo apuntado en lugar de reescribirlo", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    await guardarAjustes({ revisionMultimodalActiva: true }, null);

    /**
     * La carrera que se prueba: el barrido cierra la revisión con la **estimación** mientras la llamada de verdad
     * sigue en marcha, y al volver el proveedor con otra cifra el cierre legítimo llega segundo. Lo que no puede
     * pasar es que `review_results.credits` acabe diciendo una cosa y el registro de gasto otra.
     */
    const { herramientas } = modeloSimulado(async () => {
      const [pendiente] = await revisionesDe(escenaId);
      if (!pendiente) throw new Error("Falta la revisión reservada.");
      // El barrido se adelanta: cierra con la estimación (5) mientras esta llamada aún no ha contestado.
      await cerrarGastoDeRevision(pendiente.id, null, "cierre del barrido de prueba");
      return { resumen: "Un plano de una ventana.", creditos: 9 };
    });

    await revisarConModelo(actor, escenaId, confirmacionMultimodal(), herramientas);

    const apuntes = await apuntesDe();
    const consumos = apuntes.filter((a) => a.entryType === "consumo");
    // Un solo consumo, el del que llegó primero: la estimación, marcada como estimación nuestra.
    expect(consumos).toHaveLength(1);
    expect(consumos[0]?.credits).toBe(5);
    expect(consumos[0]?.informed).toBe(false);
    // Y la fila dice **lo mismo** que el registro de gasto, no los 9 que traía el cierre que llegó tarde.
    const [revision] = await revisionesDe(escenaId);
    expect(revision?.credits).toBe(5);
    expect(revision?.state).toBe("cerrado");
    // Tampoco se apunta un exceso: el importe que consta no es el que informó el proveedor.
    expect(apuntes.some((a) => a.entryType === "ajuste")).toBe(false);
  });

  test("si el modelo no contesta a tiempo se corta y se conserva la estimación como gasto", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    await guardarAjustes({ revisionMultimodalActiva: true }, null);

    let cortada = false;
    // El adaptador respeta la señal, que es lo que exige el contrato: espera hasta que se le diga que pare.
    const { herramientas, cuenta } = modeloSimulado(() => Promise.reject(new Error("no debería usarse")));
    const conSenal = {
      ...herramientas,
      // 50 ms en lugar de los 120 s de producción: lo que se prueba es el corte, no la espera.
      msMaximo: 50,
      elegirModelo: async () => {
        const eleccion = await herramientas.elegirModelo();
        return {
          ...eleccion,
          adaptador: {
            revisarMedio: (peticion: { senal: AbortSignal }) => {
              cuenta.llamadas++;
              return new Promise<never>((_, rechazar) => {
                peticion.senal.addEventListener("abort", () => {
                  cortada = true;
                  rechazar(peticion.senal.reason);
                });
              });
            },
          },
        };
      },
    };

    await revisarConModelo(actor, escenaId, confirmacionMultimodal(), conSenal);

    expect(cuenta.llamadas).toBe(1);
    expect(cortada).toBe(true);
    const [revision] = await revisionesDe(escenaId);
    expect(revision?.notes).toContain("no ha contestado en");
    expect(revision?.state).toBe("cerrado");
    // No se suelta lo que quizá se ha pagado: se conserva la estimación, marcada como nuestra (ADR-0016).
    const apuntes = await apuntesDe();
    const consumo = apuntes.find((a) => a.entryType === "consumo");
    expect(consumo?.credits).toBe(5);
    expect(consumo?.informed).toBe(false);
    expect(apuntes.find((a) => a.entryType === "liberacion")?.credits).toBe(-5);
  });

  test("un clip que pesa más de lo permitido no se comprueba y se dice por qué", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    // El archivo del medio se sustituye por 65 MiB: pasa del tope de 64 MiB y no se baja a comprobar.
    const gordo = path.join(carpeta, "gordo.bin");
    await Bun.write(gordo, new Uint8Array(65 * 1024 * 1024));
    await sustituirClip(escenaId, gordo);
    const respuesta = await accion(ana, proyectoId, { accion: "comprobar", escenaId });
    expect(respuesta.status).toBe(503);
    expect(((await respuesta.json()) as { error: string }).error).toContain("64 MB");
    expect(await revisionesDe(escenaId)).toHaveLength(0);
  });

  test("una revisión que se queda reservada cuenta como retenida y el barrido la cierra", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    await guardarAjustes({ revisionMultimodalActiva: true }, null);
    const { herramientas } = modeloSimulado(async () => ({ resumen: "Un plano.", creditos: 7 }));
    await revisarConModelo(actor, escenaId, confirmacionMultimodal(), herramientas);
    const [revision] = await revisionesDe(escenaId);
    if (!revision) throw new Error("Falta la revisión.");

    /**
     * Se simula el proceso que muere entre reservar y cerrar: la fila vuelve a `reservado`, se le quitan los
     * apuntes de cierre y se envejece por encima del tope del barrido. Es exactamente lo que queda en la base de
     * datos cuando el servidor se cae a mitad de la llamada.
     */
    await db()
      .delete(usageLedger)
      .where(and(eq(usageLedger.reviewId, revision.id), sql`${usageLedger.entryType} <> 'reserva'`));
    await db()
      .update(reviewResults)
      .set({
        state: "reservado",
        notes: "",
        credits: null,
        createdAt: new Date(Date.now() - MS_MAXIMO_RESERVADO - 1000),
      })
      .where(eq(reviewResults.id, revision.id));

    // Mientras siga reservada, su coste está **retenido**: esperar no lo va a soltar, y el depósito lo dice.
    const antes = await comprometidoDe(ana.id);
    expect(antes.revisionesColgadas).toBe(1);
    expect(antes.retenido).toBe(5);

    expect(await barrerRevisionesReservadas()).toBe(1);

    // Se conserva la estimación como consumo y se libera la reserva (ADR-0016): no se suelta lo que quizá se pagó.
    const apuntes = await apuntesDe();
    const consumo = apuntes.find((a) => a.entryType === "consumo");
    expect(consumo?.credits).toBe(5);
    expect(consumo?.informed).toBe(false);
    expect(apuntes.find((a) => a.entryType === "liberacion")?.credits).toBe(-5);
    const despues = await comprometidoDe(ana.id);
    expect(despues.revisionesColgadas).toBe(0);
    expect(despues.retenido).toBe(0);
    // Y la fila explica qué pasó, en lugar de quedarse con el resumen vacío.
    const [cerrada] = await revisionesDe(escenaId);
    expect(cerrada?.state).toBe("cerrado");
    expect(cerrada?.notes).toContain("se interrumpió");
  });

  // ── Volver a comprobar manda sobre la comprobación anterior ────────────────────────────────────────────

  test("volver a comprobar invalida la comprobación anterior: manda la más reciente", async () => {
    await conClip(escenaId, await clipCorrecto("corto.mp4", 1));
    expect((await accion(ana, proyectoId, { accion: "comprobar", escenaId })).status).toBe(200);
    expect((await estado()).criticosAbiertos).toBe(1);

    /**
     * El clip se arregla **sin regenerar** (se sustituye el archivo del mismo medio, que es lo que pasa cuando el
     * fallo era del contenedor) y se vuelve a comprobar. Sin invalidar la anterior quedarían dos automáticas
     * vigentes: la insignia saldría de la nueva y el bloqueo de la vieja, que es la peor combinación posible.
     */
    await sustituirClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    expect((await accion(ana, proyectoId, { accion: "comprobar", escenaId })).status).toBe(200);

    const vigentes = (await revisionesDe(escenaId)).filter((r) => r.kind === "automatica" && r.invalidatedAt === null);
    expect(vigentes).toHaveLength(1);
    const invalidada = (await revisionesDe(escenaId)).find((r) => r.invalidatedAt !== null);
    expect(invalidada?.invalidationReason).toContain("volvió a comprobar");
    // Y el bloqueo se va con ella: el dato del que sale es el mismo del que sale la insignia.
    const vista = await estado();
    expect(vista.criticosAbiertos).toBe(0);
    expect((await evaluacionDeExportacion()).estado).toBe("listo");
  });

  // ── Carrera entre revisar y regenerar ──────────────────────────────────────────────────────────────────

  test("si la escena se regenera mientras alguien la revisa, la revisión no se guarda y se dice por qué", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    // Alguien abre la pantalla y mira el clip... y en otra pestaña se regenera la escena.
    await db().update(scenes).set({ clipMediaId: null, clipJobId: null }).where(eq(scenes.id, escenaId));

    // Su decisión llega tarde: no se guarda, y el motivo lo dice sin hablar de errores internos.
    const respuesta = await accion(ana, proyectoId, { accion: "aceptar", escenaId });
    expect(respuesta.status).toBe(409);
    expect(((await respuesta.json()) as { error: string }).error).toContain("no tiene clip");
    expect(await revisionesDe(escenaId)).toHaveLength(0);
  });

  test("si el clip cambia por otro mientras alguien revisa, la revisión tampoco se guarda", async () => {
    const primero = await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    const { exigirClipVigente } = await import("./resultados");
    // El clip que se revisó ya no es el de la escena: eso es exactamente lo que comprueba el cerrojo.
    await sustituirEscenaConOtroClip(escenaId, await clipCorrecto("otro.mp4", segundos));
    await expect(db().transaction((tx) => exigirClipVigente(tx, escenaId, primero))).rejects.toThrow(/ha cambiado/);
    expect(await revisionesDe(escenaId)).toHaveLength(0);
  });

  test("regenerar deja la escena sin clip y su revisión invalidada en el mismo paso", async () => {
    await conClip(escenaId, await clipCorrecto("ok.mp4", segundos));
    expect((await accion(ana, proyectoId, { accion: "comprobar", escenaId })).status).toBe(200);
    await regenerar(escenaId);
    // Las dos cosas van en la misma transacción: no existe un instante con la escena sin clip y la revisión vigente.
    const [fila] = await db().select().from(scenes).where(eq(scenes.id, escenaId));
    expect(fila?.clipMediaId).toBeNull();
    expect((await revisionesDe(escenaId)).every((r) => r.invalidatedAt !== null)).toBe(true);
  });

  // ── Y lo que la revisión no puede hacer ───────────────────────────────────────────────────────────────

  test("una escena sin clip no se puede revisar ni aceptar", async () => {
    const segunda = (await import("../asistente/consulta")).escenasDe;
    const escenas = await segunda(proyectoId);
    const sinClip = escenas[1];
    if (!sinClip) throw new Error("Falta la segunda escena.");
    for (const cuerpo of [
      { accion: "comprobar", escenaId: sinClip.id },
      { accion: "aceptar", escenaId: sinClip.id },
    ]) {
      const respuesta = await accion(ana, proyectoId, cuerpo);
      expect(respuesta.status).toBe(409);
    }
    expect(await revisionesDe(sinClip.id)).toHaveLength(0);
  });
});
