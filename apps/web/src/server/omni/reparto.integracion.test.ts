import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { PersonajeVista } from "@/lib/personajes";
import type { ProyectoDetalle } from "@/lib/proyectos";
import type { RepartoVista } from "@/lib/reparto";

/**
 * **Dos personajes hablando, con dinero de verdad por medio** (RF06, RF08 y RF10, 0.28.0): transporte, prompts,
 * estimación y reservas, contra el PostgreSQL y el SeaweedFS locales (`bun run services:up`).
 *
 * **Ningún test llama a KIE**: el proveedor se simula con un `fetch` propio que devuelve las formas reales
 * comprobadas con la clave del propietario, y la clave es inventada. No se gasta ni un crédito de verdad.
 *
 * Lo que comprueba, uno por uno, los criterios de aceptación del bloque:
 *
 * - **dualcast** envía **exactamente dos** `character_ids` en una sola petición, y su prompt ata cada nombre a su
 *   lado del cuadro y lleva los turnos **literales, sin traducir**;
 * - **podcast** envía **dos** peticiones con **un** `character_id` cada una, con **mirada cruzada** y sin nadie
 *   más en el plano, y cada trabajo queda marcado con su turno para el montaje;
 * - el coste se confirma **una vez y por el total**: confirmar el de un solo clip se rechaza;
 * - un podcast aparta **dos reservas**, y **cancelar un clip no cobra el otro**;
 * - si un clip no se puede encolar, **el otro sigue**, y la escena dice la causa concreta;
 * - una escena de **un** personaje se comporta **exactamente** igual que antes de esta versión;
 * - sin el registro del segundo personaje no se genera, y el motivo dice **quién** falta;
 * - con el formato apagado desde el panel de ajustes no se puede elegir.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_reparto_omni");
}

const { and, eq } = await import("drizzle-orm");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaEscenas = await import("@/app/api/proyectos/[id]/escenas/route");
const rutaPlan = await import("@/app/api/proyectos/[id]/plan/route");
const rutaVoz = await import("@/app/api/proyectos/[id]/voz/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const rutaReparto = await import("@/app/api/escenas/[id]/reparto/route");
const rutaEstimacion = await import("@/app/api/escenas/[id]/reparto/estimacion/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characters, generationJobs, projects, rateLimits, scenes, usageLedger, users, voiceSamples } = await import(
  "../db/esquema"
);
const { crearMedio } = await import("../media/servicio");
const { olvidarSaldos } = await import("../generacion/estimacion");
const { cancelarTrabajo } = await import("../cola/cancelar");
const { enviarEncolados } = await import("../cola/pasada");
const { listarModelos, olvidarCatalogo } = await import("../proveedores/catalogo");
const { cambiarEstadoDeModelo, cambiarPrecioDeModelo } = await import("../proveedores/catalogo-admin");
const { registrarPersonajeOmni } = await import("../personajes/omni");
const { registrarVozOmni, validarEleccionVozOmni } = await import("../voz/omni");
const { producirEscenaHablada } = await import("./escena");
const { estimarReparto } = await import("./estimacion-reparto");
const { comprometidoDe } = await import("../presupuesto/deposito");
const { MODELOS_OMNI, VOCES_OMNI } = await import("@/lib/omni");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type EstimacionReparto = Awaited<ReturnType<typeof estimarReparto>>;

const CLAVE = "sk-reparto-clave-de-kie-inventada-ffffffff";
/** Precio medido con dinero real el 2026-09-28: 4 s en 9:16 a 720p costaron 63 créditos. */
const CREDITOS_OMNI = 63;
const VOZ = VOCES_OMNI[0]?.id ?? "";
const EJECUCION = crypto.randomUUID().slice(0, 8);

// ── Proveedor simulado, con las formas reales de la API ────────────────────────────────────────────────────

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const tareas = new Map<string, { state: string; urls?: string[]; creditos?: number }>();
/** Lo que se le mandó al proveedor en cada tarea: es donde se comprueba qué `character_ids` y qué prompt salieron. */
const enviados: Record<string, unknown>[] = [];
let registrosDePersonaje = 0;
let siguienteTarea = 0;

const buscar: Buscador = async (url, opciones) => {
  if (url.includes("/chat/credit")) return sobre(1_000_000);
  if (url.includes("file-stream-upload")) return sobre({ downloadUrl: "https://tempfile.kie.ai/retrato.png" });
  if (url.includes("/omni/audio/create")) {
    const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { audio_id?: string; name?: string };
    return sobre({ audioId: `audio_${EJECUCION}_${cuerpo.audio_id}`, name: cuerpo.name ?? "" });
  }
  if (url.includes("/omni/character/create")) {
    registrosDePersonaje++;
    const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { character_name?: string };
    return sobre({
      characterId: `char_${EJECUCION}_${registrosDePersonaje}`,
      characterName: cuerpo.character_name ?? "",
      imageUrl: "https://file.kie.ai/omni/retrato.png",
      bodyImageUrl: "",
    });
  }
  if (url.includes("createTask")) {
    const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { input?: Record<string, unknown> };
    const taskId = `omni_${EJECUCION}_${++siguienteTarea}`;
    enviados.push(cuerpo.input ?? {});
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

const descargar: Herramientas["descargar"] = async (url) => ({
  archivo: new File([MP4], "clip.mp4", { type: "video/mp4" }),
  origen: url,
});

const h: Herramientas = { buscar, descargar };

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

const error = async (accion: () => Promise<unknown>): Promise<{ estado: number; message: string }> => {
  try {
    await accion();
  } catch (e) {
    return e as { estado: number; message: string };
  }
  throw new Error("Se esperaba un error y no lo hubo.");
};

const describeSiHayBase = hayBaseDeDatos ? describe : describe.skip;

describeSiHayBase("escenas habladas con dos personajes", () => {
  let ana: Sesion;
  let admin: Sesion;
  let actor: Actor;
  let lucia: PersonajeVista;
  let elisa: PersonajeVista;
  let proyectoId: string;
  let escenaId: string;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_reparto_omni");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    admin = await crearSesionDePrueba("admin");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    await guardarAjustes(
      { presupuestoCreditos: 0, presupuestoTrabajo: 0, trabajosSimultaneos: 20, escenasEnVuelo: 10 },
      null,
    );
    await registrarPrecioDeOmni();
  });

  afterAll(async () => {
    for (const sesion of [ana, admin]) {
      if (sesion?.email) await db().delete(users).where(eq(users.email, sesion.email));
    }
    await guardarAjustes(
      {
        presupuestoCreditos: ajustesPrevios.presupuestoCreditos,
        presupuestoTrabajo: ajustesPrevios.presupuestoTrabajo,
        trabajosSimultaneos: ajustesPrevios.trabajosSimultaneos,
        escenasEnVuelo: ajustesPrevios.escenasEnVuelo,
        repartoPodcastActivo: ajustesPrevios.repartoPodcastActivo,
        repartoDualcastActivo: ajustesPrevios.repartoDualcastActivo,
      },
      null,
    );
  });

  beforeEach(async () => {
    olvidarSaldos();
    tareas.clear();
    enviados.length = 0;
    siguienteTarea = 0;
    registrosDePersonaje = 0;
    exigirBaseDeDatosDePrueba("escenara_pruebas_reparto_omni");
    await db().delete(rateLimits);
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(usageLedger).where(eq(usageLedger.userId, ana.id));
    await db().delete(voiceSamples).where(eq(voiceSamples.userId, ana.id));
    await db().delete(projects).where(eq(projects.userId, ana.id));
    await db().delete(characters).where(eq(characters.ownerId, ana.id));
    await guardarAjustes({ repartoPodcastActivo: true, repartoDualcastActivo: true, trabajosSimultaneos: 20 }, null);
    lucia = await nuevoPersonaje("Lucía");
    elisa = await nuevoPersonaje("Elisa");
    proyectoId = await nuevoProyectoOmni();
    escenaId = await primeraEscena();
  });

  // ── Preparativos ────────────────────────────────────────────────────────────────────────────────────────

  async function registrarPrecioDeOmni(): Promise<void> {
    olvidarCatalogo();
    const candidatos = await listarModelos({ capacidad: "image_to_video" });
    const [modelo] = MODELOS_OMNI.flatMap((nombre) => candidatos.filter((m) => m.modelo === nombre));
    if (!modelo) throw new Error("Falta el modelo de escenas habladas en el catálogo de pruebas.");
    await cambiarPrecioDeModelo(
      {
        modeloId: modelo.id,
        creditos: CREDITOS_OMNI,
        fuente: "Medido con dinero real el 2026-09-28: 4 s en 9:16 a 720p.",
        comprobado: "2026-09-28",
      },
      admin.id,
    );
    olvidarCatalogo();
    await cambiarEstadoDeModelo(
      { modeloId: modelo.id, estado: "validado", evidencia: "Medido con dinero real el 2026-09-28." },
      admin.id,
    );
    olvidarCatalogo();
  }

  async function nuevoPersonaje(nombre: string): Promise<PersonajeVista> {
    const creado = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", {
        nombre: `${nombre} ${crypto.randomUUID().slice(0, 6)}`,
        tipo: "persona",
      }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const personaje = (await creado.json()) as PersonajeVista;
    const referencias = await Promise.all(
      Array.from({ length: 3 }, async (_, i) => ({
        medioId: (
          await crearMedio(actor, new File([await fotoDeReferencia()], `${nombre}-${i}.png`, { type: "image/png" }))
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
    expect(
      (
        await rutaConsentimiento.POST(
          pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
            titular: "yo",
            mayoriaDeEdad: true,
            alcance: "personal",
          }),
          ctx(personaje.id),
        )
      ).status,
    ).toBe(200);
    return personaje;
  }

  /** Proyecto en modo `omni` con clips de 4 s, que es lo que este modelo admite y lo que se midió. */
  async function nuevoProyectoOmni(): Promise<string> {
    const creado = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", {
        titulo: "Una conversación",
        formato: "reel_vertical",
        idea: "Dos personas hablando en el mismo salón, a la luz del atardecer.",
        personajeId: lucia.id,
        presupuestoCreditos: 100_000,
        segundosClip: 4,
      }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const id = ((await creado.json()) as ProyectoDetalle).proyecto.id;
    expect(
      (
        await rutaEscenas.POST(
          pedir(ana, `/api/proyectos/${id}/escenas`, "POST", {
            texto: "Esto me ha cambiado la rutina.",
            accion: "Plano medio en un salón cálido al atardecer, los dos sentados frente a frente",
            segundos: 4,
          }),
          ctx(id),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await rutaVoz.POST(
          pedir(ana, `/api/proyectos/${id}/voz`, "POST", { accion: "fijar-modo", modo: "omni" }),
          ctx(id),
        )
      ).status,
    ).toBe(200);
    return id;
  }

  async function primeraEscena(): Promise<string> {
    const [escena] = await db().select().from(scenes).where(eq(scenes.projectId, proyectoId)).limit(1);
    if (!escena) throw new Error("La escena de prueba tiene que existir.");
    return escena.id;
  }

  /** Registra la voz del proyecto y los personajes que se le digan. Nada de esto cuesta créditos. */
  async function registrarTodo(personajes: readonly string[]): Promise<void> {
    await registrarVozOmni(
      actor,
      proyectoId,
      validarEleccionVozOmni({
        voz: VOZ,
        descripcion: "Voz natural en español de España, acento peninsular, tono cercano.",
        ejemplo: "Hola, así suena mi voz cuando cuento algo.",
      }),
      false,
      h,
    );
    const [proyecto] = await db().select().from(projects).where(eq(projects.id, proyectoId)).limit(1);
    if (!proyecto) throw new Error("El proyecto ha desaparecido.");
    for (const personajeId of personajes) await registrarPersonajeOmni(actor, personajeId, proyecto.omniAudioId, h);
  }

  const patch = async (cuerpo: Record<string, unknown>): Promise<RepartoVista> => {
    const respuesta = await rutaReparto.PATCH(
      pedir(ana, `/api/escenas/${escenaId}/reparto`, "PATCH", cuerpo),
      ctx(escenaId),
    );
    const leido = await respuesta.json();
    if (respuesta.status !== 200) {
      throw Object.assign(new Error(String((leido as { error?: string }).error)), { estado: respuesta.status });
    }
    return leido as RepartoVista;
  };

  /** Deja la escena en el formato pedido, con Elisa dentro y el diálogo repartido por turnos. */
  async function conversacionDeDos(formato: "podcast" | "dualcast"): Promise<void> {
    await patch({ formato });
    await patch({ accion: "anadir", personajeId: elisa.id });
    await patch({
      accion: "dialogo",
      turnos: [
        { personajeId: lucia.id, texto: "Esto lo cambia todo, ¿no te parece?", direccion: "en tono cercano" },
        { personajeId: elisa.id, texto: "A mí me costó creerlo la primera vez." },
      ],
    });
  }

  /** Aprueba el plan con el coste que se va a pagar. Va **después** de tocar el reparto, que lo invalida. */
  async function aprobarPlan(): Promise<void> {
    const { detalleProyecto } = await import("../asistente/plan");
    const antes = await detalleProyecto(actor, proyectoId);
    const aprobado = await rutaPlan.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/plan`, "POST", {
        presupuestoCreditos: 100_000,
        totalConfirmado: antes.plan.totalCreditos,
      }),
      ctx(proyectoId),
    );
    expect(aprobado.status).toBe(200);
  }

  const estimacion = async (): Promise<EstimacionReparto> => {
    const respuesta = await rutaEstimacion.GET(
      pedir(ana, `/api/escenas/${escenaId}/reparto/estimacion`),
      ctx(escenaId),
    );
    expect(respuesta.status).toBe(200);
    return (await respuesta.json()) as EstimacionReparto;
  };

  /** Escena, proyecto y confirmación de coste con el total de la estimación y los avisos salvables aceptados. */
  async function producir(creditosConfirmados?: number): Promise<Awaited<ReturnType<typeof producirEscenaHablada>>> {
    const [escena] = await db().select().from(scenes).where(eq(scenes.id, escenaId)).limit(1);
    const [proyecto] = await db().select().from(projects).where(eq(projects.id, proyectoId)).limit(1);
    if (!escena || !proyecto) throw new Error("La escena y su proyecto tienen que existir.");
    const previa = await estimacion();
    return producirEscenaHablada(
      actor,
      escena,
      proyecto,
      {
        derechos: true,
        sinTerceros: true,
        creditosConfirmados: creditosConfirmados ?? previa.creditos,
        selloEstimacion: previa.sello,
        claveIdempotencia: crypto.randomUUID(),
        avisoUmbralAceptado: true,
        avisosConfirmados: ["reparto-misma-voz", "reparto-sin-turnos", "reparto-dialogo-largo"],
      },
      h,
    );
  }

  const trabajosDeLaEscena = () =>
    db()
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.sceneId, escenaId), eq(generationJobs.kind, "animacion")))
      .orderBy(generationJobs.castClipOrder);

  // ── Dualcast: un clip, dos caras ────────────────────────────────────────────────────────────────────────

  test("dualcast envía exactamente dos character_ids y el prompt trae los lados y los turnos literales", async () => {
    await registrarTodo([lucia.id, elisa.id]);
    await conversacionDeDos("dualcast");
    await aprobarPlan();

    const { trabajos, nuevas } = await producir();
    expect(nuevas).toBe(1);
    expect(trabajos).toHaveLength(1);
    await enviarEncolados(h);

    expect(enviados).toHaveLength(1);
    const enviado = enviados[0] ?? {};
    expect(enviado.character_ids).toHaveLength(2);
    expect(enviado.image_urls).toBeUndefined();
    const prompt = String(enviado.prompt);
    expect(prompt).toContain(`The person on the LEFT of the frame is ${lucia.nombre}.`);
    expect(prompt).toContain(`The person on the RIGHT of the frame is ${elisa.nombre}.`);
    // El diálogo **no se traduce**: llega literal, en castellano, y cada frase atada a quien la dice.
    expect(prompt).toContain(`1. ${lucia.nombre} says in Spanish`);
    expect(prompt).toContain('"Esto lo cambia todo, ¿no te parece?"');
    expect(prompt).toContain(`2. ${elisa.nombre} says in Spanish: "A mí me costó creerlo la primera vez."`);
    expect(prompt).toContain("listens and reacts without speaking");
  });

  test("un dualcast cuesta un clip: dos caras no cuestan más que una", async () => {
    await registrarTodo([lucia.id, elisa.id]);
    await conversacionDeDos("dualcast");
    const estimada = await estimacion();
    expect(estimada.formato).toBe("dualcast");
    expect(estimada.clips).toHaveLength(1);
    expect(estimada.creditos).toBe(CREDITOS_OMNI);
  });

  // ── Podcast: dos clips, una confirmación ────────────────────────────────────────────────────────────────

  test("podcast envía dos peticiones con un character_id cada una y mirada cruzada", async () => {
    await registrarTodo([lucia.id, elisa.id]);
    await conversacionDeDos("podcast");
    await aprobarPlan();

    const { trabajos, nuevas, fallo } = await producir();
    expect(fallo).toBeNull();
    expect(nuevas).toBe(2);
    expect(trabajos).toHaveLength(2);
    await enviarEncolados(h);

    expect(enviados).toHaveLength(2);
    for (const enviado of enviados) expect(enviado.character_ids).toHaveLength(1);
    const identidades = enviados.map((e) => String((e.character_ids as string[])[0]));
    expect(new Set(identidades).size).toBe(2);
    const prompts = enviados.map((e) => String(e.prompt));
    const deLucia = prompts.find((p) => p.includes(`Only one person is in frame: ${lucia.nombre}`)) ?? "";
    const deElisa = prompts.find((p) => p.includes(`Only one person is in frame: ${elisa.nombre}`)) ?? "";
    expect(deLucia).not.toBe("");
    expect(deElisa).not.toBe("");
    // Mirada cruzada: quien está a la izquierda mira a la derecha, y al contrario. Es lo que los hace una conversación.
    expect(deLucia).toContain("on the LEFT of the frame");
    expect(deLucia).toContain("looks off-camera to the RIGHT of the frame");
    expect(deElisa).toContain("on the RIGHT of the frame");
    expect(deElisa).toContain("looks off-camera to the LEFT of the frame");
    // Nadie más en el plano, y solo sus propios turnos.
    expect(deLucia).toContain("Nobody else is in frame");
    expect(deLucia).toContain('"Esto lo cambia todo, ¿no te parece?"');
    expect(deLucia).not.toContain("A mí me costó creerlo");
    expect(deElisa).toContain('"A mí me costó creerlo la primera vez."');
  });

  test("los dos clips quedan marcados con su turno y su personaje, para que el montaje pueda alternarlos", async () => {
    await registrarTodo([lucia.id, elisa.id]);
    await conversacionDeDos("podcast");
    await aprobarPlan();
    await producir();

    const trabajos = await trabajosDeLaEscena();
    expect(trabajos.map((t) => t.castClipOrder)).toEqual([1, 2]);
    expect(trabajos.map((t) => t.characterId)).toEqual([lucia.id, elisa.id]);
    const [escena] = await db().select().from(scenes).where(eq(scenes.id, escenaId)).limit(1);
    expect(escena?.podcastGroupId).not.toBeNull();
  });

  test("el coste se confirma una vez y por el total: confirmar el de un solo clip se rechaza", async () => {
    await registrarTodo([lucia.id, elisa.id]);
    await conversacionDeDos("podcast");
    await aprobarPlan();

    const estimada = await estimacion();
    expect(estimada.clips).toHaveLength(2);
    expect(estimada.creditos).toBe(CREDITOS_OMNI * 2);

    const fallo = await error(() => producir(CREDITOS_OMNI));
    expect(fallo.estado).toBe(409);
    expect(fallo.message).toContain("cambiado");
    // Nada se ha encolado y nada se ha apartado: un coste mal confirmado no gasta.
    expect(await trabajosDeLaEscena()).toHaveLength(0);
  });

  test("un podcast aparta dos reservas y cancelar un clip no cobra el otro", async () => {
    await registrarTodo([lucia.id, elisa.id]);
    await conversacionDeDos("podcast");
    await aprobarPlan();
    const { trabajos } = await producir();

    const reservas = trabajos.map((t) => t.reservationId);
    expect(new Set(reservas).size).toBe(2);
    expect(reservas.every((r) => r !== null)).toBe(true);
    const conDosReservas = await comprometidoDe(ana.id);

    const primero = trabajos[0];
    if (!primero) throw new Error("El primer clip tiene que existir.");
    await cancelarTrabajo(ana.id, primero.id);

    // Cancelar suelta **su** reserva y deja la del otro en pie: lo que se aparta es de cada clip, no de la escena.
    const trasCancelar = await comprometidoDe(ana.id);
    expect(conDosReservas.reservado).toBe(trasCancelar.reservado * 2);
    expect(trasCancelar.reservado).toBeGreaterThan(0);
    const filas = await trabajosDeLaEscena();
    expect(filas.find((f) => f.id === primero.id)?.state).toBe("cancelado");
    expect(filas.filter((f) => f.state === "en_cola")).toHaveLength(1);
  });

  test("si un clip no se puede encolar, el otro sigue y la escena dice la causa concreta", async () => {
    await registrarTodo([lucia.id, elisa.id]);
    await conversacionDeDos("podcast");
    await aprobarPlan();
    // Un solo trabajo simultáneo por usuario: el primer clip cabe y el segundo choca contra el tope.
    await guardarAjustes({ trabajosSimultaneos: 1 }, null);

    const { trabajos, nuevas, fallo } = await producir();
    expect(nuevas).toBe(1);
    expect(trabajos).toHaveLength(1);
    expect(fallo).toContain("El clip 2");
    const [escena] = await db().select().from(scenes).where(eq(scenes.id, escenaId)).limit(1);
    expect(escena?.lastFailureReason).toContain("El clip 2");
    // Y el que sí salió sigue en pie con su reserva: un fallo del otro no lo tira.
    expect(trabajos[0]?.state).toBe("en_cola");
    expect(trabajos[0]?.reservationId).not.toBeNull();
  });

  test("repetir la misma confirmación no encarga ni un clip más", async () => {
    await registrarTodo([lucia.id, elisa.id]);
    await conversacionDeDos("podcast");
    await aprobarPlan();
    const [escena] = await db().select().from(scenes).where(eq(scenes.id, escenaId)).limit(1);
    const [proyecto] = await db().select().from(projects).where(eq(projects.id, proyectoId)).limit(1);
    if (!escena || !proyecto) throw new Error("La escena y su proyecto tienen que existir.");
    const previa = await estimacion();
    const confirmacion = {
      derechos: true,
      sinTerceros: true,
      creditosConfirmados: previa.creditos,
      selloEstimacion: previa.sello,
      claveIdempotencia: crypto.randomUUID(),
      avisoUmbralAceptado: true,
      avisosConfirmados: ["reparto-misma-voz", "reparto-sin-turnos", "reparto-dialogo-largo"],
    };
    const primera = await producirEscenaHablada(actor, escena, proyecto, confirmacion, h);
    expect(primera.nuevas).toBe(2);
    const segunda = await producirEscenaHablada(actor, escena, proyecto, confirmacion, h);
    expect(segunda.nuevas).toBe(0);
    expect(segunda.trabajos.map((t) => t.id).sort()).toEqual(primera.trabajos.map((t) => t.id).sort());
    expect(await trabajosDeLaEscena()).toHaveLength(2);
  });

  // ── Lo que no cambia, y lo que no se puede hacer ────────────────────────────────────────────────────────

  test("una escena de un personaje se pide exactamente como antes de esta versión", async () => {
    await registrarTodo([lucia.id]);
    await aprobarPlan();

    const { trabajos, nuevas } = await producir();
    expect(nuevas).toBe(1);
    expect(trabajos[0]?.castClipOrder).toBeNull();
    await enviarEncolados(h);

    expect(enviados).toHaveLength(1);
    const enviado = enviados[0] ?? {};
    expect(enviado.character_ids).toHaveLength(1);
    const prompt = String(enviado.prompt);
    expect(prompt).toContain("The character looks at the camera, saying in Spanish:");
    expect(prompt).not.toContain("frame is");
  });

  test("sin el registro del segundo personaje no se genera, y el motivo dice quién falta", async () => {
    // Solo se registra a Lucía: Elisa sale en la escena y no tiene cara ni voz en el proveedor.
    await registrarTodo([lucia.id]);
    await conversacionDeDos("dualcast");
    await aprobarPlan();

    const fallo = await error(() => producir());
    expect(fallo.estado).toBe(409);
    expect(fallo.message).toContain(elisa.nombre);
    expect(fallo.message).toContain("no cuesta créditos");
    expect(await trabajosDeLaEscena()).toHaveLength(0);
    // Y la estimación lo dice también, antes de que el usuario pulse nada.
    const estimada = await estimacion();
    expect(estimada.impedimentos.join(" ")).toContain(elisa.nombre);
  });

  test("nadie mete en su escena el personaje de otra persona, así que nadie genera con una cara ajena", async () => {
    const beto = await crearSesionDePrueba("user");
    const actorBeto: Actor = { id: beto.id, esAdmin: false };
    try {
      const creado = await rutaPersonajes.POST(
        pedir(beto, "/api/personajes", "POST", { nombre: `Bruno ${crypto.randomUUID().slice(0, 6)}`, tipo: "persona" }),
        undefined,
      );
      expect(creado.status).toBe(201);
      const bruno = (await creado.json()) as PersonajeVista;
      expect(actorBeto.id).not.toBe(actor.id);
      await patch({ formato: "dualcast" });
      const fallo = await error(() => patch({ accion: "anadir", personajeId: bruno.id }));
      // 404 y no 403: un personaje ajeno **no existe** para quien lo pide, igual que en la biblioteca.
      expect(fallo.estado).toBe(404);
      expect(fallo.message).toContain("no es tuyo");
    } finally {
      if (beto?.email) await db().delete(users).where(eq(users.email, beto.email));
    }
  });

  test("con los formatos apagados desde el panel de ajustes no se puede elegir ninguno de los dos", async () => {
    await guardarAjustes({ repartoPodcastActivo: false, repartoDualcastActivo: false }, null);
    for (const formato of ["podcast", "dualcast"] as const) {
      const fallo = await error(() => patch({ formato }));
      expect(fallo.estado).toBe(409);
      expect(fallo.message).toContain("desactivado");
    }
  });

  test("apagar un formato impide producir escenas que ya lo tenían elegido", async () => {
    await registrarTodo([lucia.id, elisa.id]);
    await conversacionDeDos("dualcast");
    await aprobarPlan();
    await guardarAjustes({ repartoDualcastActivo: false }, null);

    const fallo = await error(() => producir());
    expect(fallo.estado).toBe(409);
    expect(fallo.message).toContain("desactivado");
    expect(await trabajosDeLaEscena()).toEqual([]);
    expect(enviados).toEqual([]);
  });

  test("avisa cuando los turnos no caben en la duración del clip, y se puede confirmar", async () => {
    await registrarTodo([lucia.id, elisa.id]);
    await patch({ formato: "dualcast" });
    await patch({ accion: "anadir", personajeId: elisa.id });
    await patch({
      accion: "dialogo",
      turnos: [
        {
          personajeId: lucia.id,
          // Treinta y seis palabras en un clip de 4 s: a 2,5 palabras por segundo no caben ni de lejos.
          texto:
            "Mira, te lo cuento con calma porque merece la pena y quiero que lo entiendas bien desde el principio, sin prisas, con todos los detalles que a mí me habría gustado que alguien me contara cuando empecé con esto.",
        },
      ],
    });
    await aprobarPlan();

    const estimada = await estimacion();
    expect(estimada.avisos.join(" ")).toContain("se va a cortar a media frase");
    // Avisa, no bloquea: confirmado el aviso, se genera igual.
    const { nuevas } = await producir();
    expect(nuevas).toBe(1);
  });
});
