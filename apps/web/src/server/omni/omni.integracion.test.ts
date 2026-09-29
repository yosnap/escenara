import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { PersonajeVista } from "@/lib/personajes";
import type { ProduccionVista } from "@/lib/produccion";
import type { ProyectoDetalle } from "@/lib/proyectos";
import type { VozProyectoVista } from "@/lib/voz";

/**
 * Escenas habladas con Gemini Omni y personajes inventados (RF02, RF06, RF08 y RF10, 0.22.0), contra el
 * PostgreSQL y el SeaweedFS locales (`bun run services:up`).
 *
 * **Ningún test llama a KIE**: el proveedor se simula con un `fetch` propio que devuelve **las formas reales**
 * comprobadas con la clave del propietario el 2026-09-28 (`{code:200,data:{audioId}}`,
 * `{code:200,data:{characterId,imageUrl}}` y la tarea asíncrona de siempre). La clave es inventada.
 *
 * Lo que comprueba, uno por uno, los criterios de aceptación de la fase:
 *
 * - en modo `omni`, **todas** las escenas se piden con el mismo `character_ids` y la misma voz registrada;
 * - cambiar la voz **invalida** lo generado y **no regenera nada** sin confirmar su coste;
 * - **sin consentimiento vigente no se registra** el personaje ni se genera;
 * - el coste de cada escena se estima, se confirma, se reserva y se cierra con lo que informa el proveedor, y
 *   **los dos registros no cuestan créditos** y quedan escritos con su cuenta y su fecha;
 * - un `characterId` que el proveedor ya no reconoce se **vuelve a registrar una sola vez**, sin coste;
 * - un personaje inventado **rechaza fotos reales y textos con nombres de personas reales**, y no pide
 *   documento de consentimiento ni declaración de mayoría de edad.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_omni");
}

const { and, eq } = await import("drizzle-orm");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaEscenas = await import("@/app/api/proyectos/[id]/escenas/route");
const rutaPlan = await import("@/app/api/proyectos/[id]/plan/route");
const rutaVoz = await import("@/app/api/proyectos/[id]/voz/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaInventados = await import("@/app/api/personajes/inventados/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const rutaPersonaje = await import("@/app/api/personajes/[id]/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const {
  characterOmniRegistrations,
  characterReferences,
  characters,
  media,
  consentRecords,
  generationJobs,
  projects,
  rateLimits,
  scenes,
  usageLedger,
  users,
  voiceSamples,
} = await import("../db/esquema");
const { crearMedio } = await import("../media/servicio");
const { olvidarSaldos } = await import("../generacion/estimacion");
const { consultarTrabajo } = await import("../generacion/seguimiento");
const { depositoDe } = await import("../presupuesto/deposito");
const { estadoDeProduccion } = await import("../produccion/consulta");
const { producirProyecto } = await import("../produccion/producir");
const { estadoDeVoz } = await import("../voz/consulta");
const { enviarEncolados } = await import("../cola/pasada");
const { listarModelos, olvidarCatalogo } = await import("../proveedores/catalogo");
const { cambiarEstadoDeModelo, cambiarPrecioDeModelo } = await import("../proveedores/catalogo-admin");
const { registrarPersonajeOmni, volverARegistrar } = await import("../personajes/omni");
const { contarReferencias } = await import("../personajes/consulta");
const { registrarVozOmni, validarEleccionVozOmni } = await import("../voz/omni");
const { crearPersonajeInventado, descartarRetratos, elegirRetrato, generarRetratosCandidatos, retratosCandidatos } =
  await import("../personajes/inventado");
const { VOCES_OMNI } = await import("@/lib/omni");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type ErrorConEstado = { estado: number; message: string };

const CLAVE = "sk-omni-clave-de-kie-inventada-ffffffff";
const { MODELOS_OMNI } = await import("@/lib/omni");
/** Precio medido con dinero real el 2026-09-28: 4 s en 9:16 a 720p costaron 63 créditos. */
const CREDITOS_OMNI = 63;
const [VOZ_A, VOZ_B] = VOCES_OMNI.map((v) => v.id) as [string, string];
/** Segundo motor de escenas habladas: 40 créditos por 5 s a 768P, medidos con dinero real el 2026-09-28. */
const MODELO_H3 = "minimax-h3/reference-to-video";
const CREDITOS_H3 = 40;

// ── Proveedor simulado, con las formas reales de la API ────────────────────────────────────────────────────

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const tareas = new Map<string, { state: string; urls?: string[]; creditos?: number }>();
/** Lo que se le mandó al proveedor en cada tarea: es donde se comprueba con qué personaje se pidió cada escena. */
const enviados = new Map<string, Record<string, unknown>>();
let siguienteTarea = 0;
/**
 * Prefijo propio de esta ejecución. La base de pruebas se comparte entre ejecuciones y entre worktrees, y
 * `generation_jobs` tiene una restricción única por proveedor y tarea: sin él, una fila de otra ejecución con
 * `omni_1` haría fallar aquí el primer envío.
 */
const EJECUCION = crypto.randomUUID().slice(0, 8);

/** Lo que responde el proveedor simulado en cada test. Es lo que permite provocar un rechazo sin llamar a nadie. */
const respuestas = {
  /** Cuántas veces se ha registrado una voz y un personaje: los dos son gratis y se cuentan para comprobarlo. */
  registrosDeVoz: 0,
  registrosDePersonaje: 0,
  /** Cuando es `true`, `createTask` responde como si el `character_ids` ya no existiera para el proveedor. */
  personajeCaducado: false,
};

const buscar: Buscador = async (url, opciones) => {
  if (url.includes("/chat/credit")) return sobre(1_000_000);
  if (url.includes("file-stream-upload")) return sobre({ downloadUrl: "https://tempfile.kie.ai/retrato.png" });
  if (url.includes("/omni/audio/create")) {
    respuestas.registrosDeVoz++;
    const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { audio_id?: string; name?: string };
    return sobre({ audioId: `audio_${EJECUCION}_${cuerpo.audio_id}`, name: cuerpo.name ?? "" });
  }
  if (url.includes("/omni/character/create")) {
    respuestas.registrosDePersonaje++;
    const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { character_name?: string };
    return sobre({
      characterId: `char_${EJECUCION}_${respuestas.registrosDePersonaje}`,
      characterName: cuerpo.character_name ?? "",
      imageUrl: "https://file.kie.ai/omni/retrato.png",
      bodyImageUrl: "",
    });
  }
  if (url.includes("createTask")) {
    const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { input?: Record<string, unknown> };
    // Un personaje caducado lo rechaza el proveedor **antes** de crear la tarea: 400, así que no ha cobrado.
    if (respuestas.personajeCaducado && Array.isArray(cuerpo.input?.character_ids)) {
      return new Response(JSON.stringify({ code: 400, msg: "character not found" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const taskId = `omni_${EJECUCION}_${++siguienteTarea}`;
    enviados.set(taskId, cuerpo.input ?? {});
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

/** Foto que pasa el control de calidad: 640 × 640 con ruido, así que cada una tiene su huella distinta. */
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

/** El resultado se descarga según lo que pidió el trabajo: un clip de escena o un retrato candidato. */
const descargar: Herramientas["descargar"] = async (url) =>
  url.endsWith(".png")
    ? { archivo: new File([await fotoDeReferencia()], "retrato.png", { type: "image/png" }), origen: url }
    : { archivo: new File([MP4], "clip.mp4", { type: "video/mp4" }), origen: url };

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

const error = async (accion: () => Promise<unknown>): Promise<ErrorConEstado> => {
  try {
    await accion();
  } catch (e) {
    return e as ErrorConEstado;
  }
  throw new Error("Se esperaba un error y no lo hubo.");
};

describe.skipIf(!hayBaseDeDatos)("escenas habladas con Omni", () => {
  let ana: Sesion;
  let admin: Sesion;
  let actor: Actor;
  let personajeId: string;
  let proyectoId: string;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;

  beforeAll(async () => {
    // Esta suite cambia ajustes de la instalación y el catálogo: nunca en la base de desarrollo.
    exigirBaseDeDatosDePrueba("escenara_pruebas_omni");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    admin = await crearSesionDePrueba("admin");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    await guardarAjustes(
      {
        presupuestoCreditos: 0,
        presupuestoTrabajo: 0,
        trabajosSimultaneos: 20,
        escenasEnVuelo: 10,
      },
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
      },
      null,
    );
  });

  beforeEach(async () => {
    olvidarSaldos();
    tareas.clear();
    enviados.clear();
    respuestas.registrosDeVoz = 0;
    respuestas.registrosDePersonaje = 0;
    respuestas.personajeCaducado = false;
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(usageLedger).where(eq(usageLedger.userId, ana.id));
    // Las muestras de voz son del usuario y sobreviven al proyecto: sin limpiarlas, un test vería la del anterior.
    await db().delete(voiceSamples).where(eq(voiceSamples.userId, ana.id));
    await db().delete(projects).where(eq(projects.userId, ana.id));
    await db().delete(characters).where(eq(characters.ownerId, ana.id));
    exigirBaseDeDatosDePrueba("escenara_pruebas_omni");
    await db().delete(rateLimits);
    personajeId = (await nuevoPersonaje()).id;
    proyectoId = await nuevoProyectoOmni();
  });

  /** Registra y valida el precio medido de un modelo, que es lo que hace quien administra tras medirlo. */
  async function registrarPrecioDe(nombre: string, creditos: number): Promise<void> {
    olvidarCatalogo();
    const [modelo] = (await listarModelos({ capacidad: "image_to_video" })).filter((m) => m.modelo === nombre);
    if (!modelo) throw new Error(`Falta ${nombre} en el catálogo de pruebas.`);
    await cambiarPrecioDeModelo(
      { modeloId: modelo.id, creditos, fuente: "Medido con dinero real el 2026-09-28.", comprobado: "2026-09-28" },
      admin.id,
    );
    olvidarCatalogo();
    await cambiarEstadoDeModelo(
      { modeloId: modelo.id, estado: "validado", evidencia: "Medido con dinero real el 2026-09-28." },
      admin.id,
    );
    olvidarCatalogo();
  }

  /**
   * Fija la voz del proyecto como en el modo `pista` —que es la que usa un motor de referencias— y, si se pide,
   * deja su **muestra ya pagada** en la caché, que es lo que viaja como audio de referencia en cada clip.
   */
  async function fijarVozDePista(conMuestra = true): Promise<void> {
    const { VOCES_OFRECIDAS, firmaDeVoz, PARAMETROS_VOZ_POR_DEFECTO } = await import("@/lib/voz");
    const voz = VOCES_OFRECIDAS[0]?.id ?? "";
    const modeloDeVoz = "elevenlabs/text-to-speech-multilingual-v2";
    await db()
      .update(projects)
      .set({
        voiceProvider: "kie",
        voiceModel: modeloDeVoz,
        voiceId: voz,
        voiceParams: PARAMETROS_VOZ_POR_DEFECTO as unknown as Record<string, number>,
        voiceSetAt: new Date(),
      })
      .where(eq(projects.id, proyectoId));
    if (!conMuestra) return;
    const medio = await crearMedio(actor, new File([MP4], "muestra.mp3", { type: "audio/mpeg" }));
    const { TEXTO_DE_MUESTRA } = await import("../voz/muestra");
    await db()
      .insert(voiceSamples)
      .values({
        userId: ana.id,
        provider: "kie",
        model: modeloDeVoz,
        voice: voz,
        paramsSignature: firmaDeVoz(
          "pista",
          { proveedor: "kie", modelo: modeloDeVoz, voz, parametros: PARAMETROS_VOZ_POR_DEFECTO, fijadaEn: "" },
          TEXTO_DE_MUESTRA,
        ),
        mediaId: medio.id,
      });
  }

  /** Registra el precio medido del modelo Omni y lo valida, que es lo que hace quien administra tras medirlo. */
  async function registrarPrecioDeOmni(): Promise<void> {
    olvidarCatalogo();
    const candidatos = await listarModelos({ capacidad: "image_to_video" });
    // El modelo de las escenas habladas sale del catálogo: se registra el precio del primero disponible de la
    // lista de preferencia, que es exactamente el que va a elegir el servidor.
    const [modelo] = MODELOS_OMNI.flatMap((nombre) => candidatos.filter((m) => m.modelo === nombre));
    if (!modelo) throw new Error("Falta ningún modelo de escenas habladas en el catálogo de pruebas.");
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

  /** Personaje con consentimiento propio y tres fotos: el protagonista de siempre. */
  async function nuevoPersonaje(): Promise<PersonajeVista> {
    const creado = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", { nombre: `Lucía ${crypto.randomUUID().slice(0, 6)}`, tipo: "persona" }),
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

  /** Proyecto en modo `omni` con dos escenas aprobadas y clips de 4 s, que es lo que Omni admite. */
  async function nuevoProyectoOmni(): Promise<string> {
    const creado = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", {
        titulo: "Dos escenas habladas",
        formato: "reel_vertical",
        idea: "Un paseo marítimo y una librería, con el mismo personaje hablando.",
        personajeId,
        presupuestoCreditos: 100_000,
        segundosClip: 4,
      }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const id = ((await creado.json()) as ProyectoDetalle).proyecto.id;
    for (const [indice, accion] of [
      "Plano medio en el paseo marítimo al atardecer, mira a cámara",
      "Plano medio dentro de una librería con estanterías detrás",
    ].entries()) {
      const respuesta = await rutaEscenas.POST(
        pedir(ana, `/api/proyectos/${id}/escenas`, "POST", {
          texto: `Esto es lo que digo en la escena número ${indice + 1}.`,
          accion,
          segundos: 4,
        }),
        ctx(id),
      );
      expect(respuesta.status).toBe(201);
    }
    // Modo Omni **antes** de aprobar: el plan se aprueba con el coste que de verdad se va a pagar.
    expect((await accionDeVoz(id, { accion: "fijar-modo", modo: "omni" })).status).toBe(200);
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

  const accionDeVoz = (id: string, cuerpo: Record<string, unknown>) =>
    rutaVoz.POST(pedir(ana, `/api/proyectos/${id}/voz`, "POST", cuerpo), ctx(id));

  /**
   * Elección de voz tal como llega del navegador, validada con **la misma función que usa la ruta**: así el test
   * no puede pasarle al servicio algo que la ruta rechazaría.
   */
  const eleccionDeVoz = (voz: string) =>
    validarEleccionVozOmni({
      voz,
      descripcion: "Voz natural en español de España, acento peninsular, tono cercano.",
      ejemplo: "Hola, así suena mi voz cuando cuento algo.",
    });

  /**
   * Registra la voz Omni del proyecto. No cuesta créditos, así que no lleva confirmación de coste.
   *
   * Se llama al servicio con el proveedor simulado en lugar de a la ruta porque este registro es **síncrono**:
   * la ruta usaría el `fetch` de verdad y el test acabaría llamando a KIE, que es justo lo que no puede pasar.
   * Lo que sí se comprueba por la ruta es lo que ocurre **antes** de llamar a nadie (la validación y la
   * confirmación de lo que se invalida).
   */
  const registrarVoz = (voz = VOZ_A, confirmarInvalidacion = false) =>
    registrarVozOmni(actor, proyectoId, eleccionDeVoz(voz), confirmarInvalidacion, h);

  const vozDelProyecto = (): Promise<VozProyectoVista> => estadoDeVoz(actor, proyectoId);
  const produccion = (): Promise<ProduccionVista> => estadoDeProduccion(actor, proyectoId);

  /** Confirmación de coste de una escena hablada, con el sello vigente y los avisos salvables confirmados. */
  async function confirmacion() {
    const estado = await produccion();
    return {
      derechos: true,
      sinTerceros: true,
      creditosConfirmados: estado.creditosPorClip,
      selloEstimacion: estado.selloClip,
      claveIdempotencia: crypto.randomUUID(),
      avisoUmbralAceptado: true,
      avisosConfirmados: estado.controlesDelModelo.comprobaciones.filter((c) => c.confirmable).map((c) => c.regla),
    };
  }

  /** Deja el proyecto listo para producir: voz registrada y personaje registrado con ella. */
  async function todoRegistrado(): Promise<void> {
    await registrarVoz();
    const { omniAudioId } = await filaDeProyecto();
    await registrarPersonajeOmni(actor, personajeId, omniAudioId, h);
  }

  async function filaDeProyecto() {
    const [fila] = await db().select().from(projects).where(eq(projects.id, proyectoId)).limit(1);
    if (!fila) throw new Error("El proyecto ha desaparecido.");
    return fila;
  }

  const trabajosDelProyecto = async () => {
    const escenas = await db().select().from(scenes).where(eq(scenes.projectId, proyectoId));
    const ids = escenas.map((e) => e.id);
    const filas = await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id));
    return filas.filter((f) => f.sceneId !== null && ids.includes(f.sceneId));
  };

  // ── Registro: gratis, guardado y con consentimiento por delante ──────────────────────────────────────────

  test("registrar la voz y el personaje no cuesta créditos y queda escrito con su cuenta y su fecha", async () => {
    await registrarVoz();
    const proyecto = await filaDeProyecto();
    expect(proyecto.omniVoice).toBe(VOZ_A);
    expect(proyecto.omniAudioId).toStartWith("audio_");
    expect(proyecto.omniVoiceSetAt).not.toBeNull();

    const registro = await registrarPersonajeOmni(actor, personajeId, proyecto.omniAudioId, h);
    expect(registro.remoteCharacterId).toStartWith("char_");
    expect(registro.creditsSpent).toBe(0);
    expect(registro.registeredBy).toBe(ana.id);
    // Ni un apunte de presupuesto: los dos endpoints de registro son gratuitos.
    const apuntes = await db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id));
    expect(apuntes).toHaveLength(0);
    expect((await depositoDe(actor.id)).reservado).toBe(0);
  });

  test("sin consentimiento vigente no se registra el personaje ni se puede producir", async () => {
    await registrarVoz();
    const { omniAudioId } = await filaDeProyecto();
    await db()
      .update(consentRecords)
      .set({ revokedAt: new Date(), revocationReason: "Revocado en la prueba." })
      .where(eq(consentRecords.characterId, personajeId));

    const fallo = await error(() => registrarPersonajeOmni(actor, personajeId, omniAudioId, h));
    expect(fallo.estado).toBe(409);
    expect(fallo.message).toContain("consentimiento");
    // No se ha llamado al proveedor: la puerta está antes de enviar la cara.
    expect(respuestas.registrosDePersonaje).toBe(0);
    expect(await db().select().from(characterOmniRegistrations)).toHaveLength(0);

    const confirmada = await confirmacion();
    const alProducir = await error(() => producirProyecto(actor, proyectoId, confirmada, h));
    expect(alProducir.estado).toBe(409);
  });

  test("sin registro vigente la producción se bloquea con su motivo y sin gastar nada", async () => {
    await registrarVoz();
    const estado = await produccion();
    expect(estado.impedimentos.join(" ")).toContain("no está registrado");

    const confirmada = await confirmacion();
    const fallo = await error(() => producirProyecto(actor, proyectoId, confirmada, h));
    expect(fallo.estado).toBe(409);
    expect(await trabajosDelProyecto()).toHaveLength(0);
    expect((await depositoDe(actor.id)).reservado).toBe(0);
  });

  // ── Producción: misma cara y misma voz en todas las escenas ──────────────────────────────────────────────

  test("todas las escenas se piden con el mismo personaje registrado y con su diálogo en español", async () => {
    await todoRegistrado();
    await producirProyecto(actor, proyectoId, await confirmacion(), h);
    await enviarEncolados(h);

    const entradas = [...enviados.values()];
    expect(entradas).toHaveLength(2);
    const identidades = new Set(entradas.map((e) => String((e.character_ids as string[])[0])));
    expect(identidades.size).toBe(1);
    for (const entrada of entradas) {
      // Con personaje registrado no se manda ninguna foto: la identidad la pone el registro.
      expect(entrada.image_urls).toBeUndefined();
      expect(entrada.duration).toBe("4");
      expect(String(entrada.prompt)).toContain("saying in Spanish");
    }
    // Y cada escena dice lo suyo, en español y sin traducir (el orden de envío no importa: son dos escenas).
    const dichos = entradas.map((e) => String(e.prompt)).join("\n");
    expect(dichos).toContain("escena número 1");
    expect(dichos).toContain("escena número 2");
  });

  test("cada escena estima, confirma, reserva y cierra con lo que informa el proveedor", async () => {
    await todoRegistrado();
    const estado = await produccion();
    // Cuatro segundos es la duración medida: 63 créditos, sin estimar nada por proporción.
    expect(estado.creditosPorClip).toBe(CREDITOS_OMNI);
    expect(estado.precioClipEstimado).toBe(false);
    expect(estado.creditosPorFotograma).toBe(0);

    await producirProyecto(actor, proyectoId, await confirmacion(), h);
    const trabajos = await trabajosDelProyecto();
    expect(trabajos).toHaveLength(2);
    expect(trabajos.every((t) => t.kind === "animacion" && t.parentJobId === null)).toBe(true);
    expect(trabajos.every((t) => t.estimatedCredits === CREDITOS_OMNI)).toBe(true);
    expect((await depositoDe(actor.id)).reservado).toBe(CREDITOS_OMNI * 2);

    await enviarEncolados(h);
    for (const [taskId] of tareas)
      tareas.set(taskId, { state: "success", urls: ["https://kie/clip.mp4"], creditos: 63 });
    for (const trabajo of await trabajosDelProyecto()) {
      await consultarTrabajo(actor, trabajo.id, { forzar: true }, h);
    }
    const cerrados = await trabajosDelProyecto();
    expect(cerrados.every((t) => t.consumedCredits === 63)).toBe(true);
    // Cerrado el gasto, no queda nada reservado: se cobra lo informado, no la estimación.
    expect((await depositoDe(actor.id)).reservado).toBe(0);
    // Y la escena queda producida con su clip, sin ningún fotograma de por medio.
    const escenas = await db().select().from(scenes).where(eq(scenes.projectId, proyectoId));
    expect(escenas.every((e) => e.state === "producida" && e.clipMediaId !== null)).toBe(true);
    expect(escenas.every((e) => e.approvedFrameMediaId === null)).toBe(true);
  });

  // ── Cambiar la voz invalida y no regenera nada ───────────────────────────────────────────────────────────

  test("cambiar la voz invalida las escenas habladas y no regenera nada sin confirmar el coste", async () => {
    await todoRegistrado();
    await producirProyecto(actor, proyectoId, await confirmacion(), h);
    await enviarEncolados(h);
    for (const [taskId] of tareas)
      tareas.set(taskId, { state: "success", urls: ["https://kie/clip.mp4"], creditos: 63 });
    for (const trabajo of await trabajosDelProyecto()) {
      await consultarTrabajo(actor, trabajo.id, { forzar: true }, h);
    }
    // Los subtítulos son lo que queda firmado con la voz de entonces: es lo que se invalida al cambiarla.
    await db()
      .update(scenes)
      .set({ subtitles: [{ desde: 0, hasta: 1, texto: "Hola" }] })
      .where(eq(scenes.projectId, proyectoId));

    // Por la ruta: sin confirmar lo que invalida, se rechaza **antes** de llamar a nadie.
    const sinConfirmar = await accionDeVoz(proyectoId, {
      accion: "registrar-voz-omni",
      voz: VOZ_B,
      descripcion: "Voz natural en español de España, acento peninsular, tono cercano.",
      ejemplo: "Hola, así suena mi voz cuando cuento algo.",
    });
    expect(sinConfirmar.status).toBe(409);
    expect(((await sinConfirmar.json()) as { error: string }).error).toContain("confirma");
    // No ha cambiado nada y no se ha registrado ninguna voz nueva.
    expect((await filaDeProyecto()).omniVoice).toBe(VOZ_A);
    expect(respuestas.registrosDeVoz).toBe(1);

    const trabajosAntes = (await trabajosDelProyecto()).length;
    await registrarVoz(VOZ_B, true);
    const despues = await vozDelProyecto();
    expect(despues.omni?.voz?.voz).toBe(VOZ_B);
    expect(despues.porRegenerar).toBeGreaterThan(0);
    // Nada se ha regenerado por su cuenta: el mismo número de trabajos que antes del cambio.
    expect((await trabajosDelProyecto()).length).toBe(trabajosAntes);
    // Y el personaje deja de estar registrado con la voz vigente: hay que volver a registrarlo, sin coste.
    expect((await produccion()).impedimentos.join(" ")).toContain("no está registrado");
  });

  // ── Identificador caducado: se registra de nuevo una sola vez y sin coste ────────────────────────────────

  test("un personaje que el proveedor ya no reconoce se vuelve a registrar una vez y sin coste", async () => {
    await todoRegistrado();
    expect(respuestas.registrosDePersonaje).toBe(1);
    const { omniAudioId } = await filaDeProyecto();

    const nuevo = await volverARegistrar(actor, personajeId, omniAudioId, "El proveedor no reconoce el anterior.", h);
    expect(respuestas.registrosDePersonaje).toBe(2);
    expect(nuevo.creditsSpent).toBe(0);

    const registros = await db()
      .select()
      .from(characterOmniRegistrations)
      .where(eq(characterOmniRegistrations.characterId, personajeId));
    expect(registros).toHaveLength(2);
    // El anterior se conserva marcado: explica con qué identidad salió lo que ya se generó.
    expect(registros.filter((r) => r.supersededAt !== null)).toHaveLength(1);
    expect(registros.filter((r) => r.supersededAt === null)).toHaveLength(1);
    // Y lo que se produce a partir de ahora cita el identificador nuevo.
    await producirProyecto(actor, proyectoId, await confirmacion(), h);
    await enviarEncolados(h);
    for (const entrada of enviados.values()) {
      expect((entrada.character_ids as string[])[0]).toBe(nuevo.remoteCharacterId);
    }
    // Ni un apunte de presupuesto por registrar dos veces.
    expect(await db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id))).not.toHaveLength(0);
  });

  test("otra cuenta no puede invalidar el registro Omni de un personaje que no es suyo", async () => {
    await todoRegistrado();
    const { omniAudioId } = await filaDeProyecto();
    const intruso = await crearSesionDePrueba("user");
    try {
      await expect(
        volverARegistrar({ id: intruso.id, esAdmin: false }, personajeId, omniAudioId, "intento ajeno", h),
      ).rejects.toThrow();
      // El registro de la dueña sigue vigente: nada se ha marcado como reemplazado.
      const registros = await db()
        .select()
        .from(characterOmniRegistrations)
        .where(eq(characterOmniRegistrations.characterId, personajeId));
      expect(registros.filter((r) => r.supersededAt === null)).toHaveLength(1);
    } finally {
      await db().delete(users).where(eq(users.id, intruso.id));
    }
  });

  // ── Personaje inventado ──────────────────────────────────────────────────────────────────────────────────

  test("un personaje inventado se crea con su declaración, sin documento y sin mayoría de edad", async () => {
    const creado = await rutaInventados.POST(
      pedir(ana, "/api/personajes/inventados", "POST", {
        nombre: `Nora ${crypto.randomUUID().slice(0, 6)}`,
        descripcion: "Mujer de unos treinta años, pelo corto castaño, chaqueta vaquera y gesto tranquilo.",
        declaracion: true,
      }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const personaje = (await creado.json()) as PersonajeVista;
    expect(personaje.inventado).toBe(true);

    const [consentimiento] = await db()
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.characterId, personaje.id));
    expect(consentimiento?.holderType).toBe("inventado");
    expect(consentimiento?.syntheticDeclared).toBe(true);
    // No hay ninguna persona cuya edad declarar, y no hay documento que revisar.
    expect(consentimiento?.adultDeclared).toBe(false);
    expect(consentimiento?.documentMediaId).toBeNull();
    expect(consentimiento?.registeredBy).toBe(ana.id);
    expect(consentimiento?.registeredAt).toBeInstanceOf(Date);
  });

  test("un personaje inventado rechaza las fotos reales y los textos con nombres de personas reales", async () => {
    const personaje = await crearPersonajeInventado(actor, {
      nombre: `Nora ${crypto.randomUUID().slice(0, 6)}`,
      descripcion: "Mujer de unos treinta años, pelo corto castaño y chaqueta vaquera.",
      declaracion: true,
    });
    const medio = await crearMedio(actor, new File([await fotoDeReferencia()], "real.png", { type: "image/png" }));
    const conFoto = await rutaReferencias.POST(
      pedir(ana, `/api/personajes/${personaje.id}/referencias`, "POST", { referencias: [{ medioId: medio.id }] }),
      ctx(personaje.id),
    );
    expect(conFoto.status).toBe(409);
    expect(((await conFoto.json()) as { error: string }).error).toContain("inventado");

    const conNombre = await rutaPersonaje.PATCH(
      pedir(ana, `/api/personajes/${personaje.id}`, "PATCH", {
        descripcion: "Se parece mucho a Scarlett Johansson, con el mismo pelo.",
      }),
      ctx(personaje.id),
    );
    expect(conNombre.status).toBe(422);
    expect(((await conNombre.json()) as { error: string }).error).toContain("Scarlett Johansson");

    // Y el consentimiento normal no se le puede registrar: no representa a nadie.
    const conConsentimiento = await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", { titular: "yo", mayoriaDeEdad: true }),
      ctx(personaje.id),
    );
    expect(conConsentimiento.status).toBe(409);
  });

  test("un inventado admite imágenes generadas con IA declaradas: entran como generadas y cuentan para el mínimo", async () => {
    const personaje = await crearPersonajeInventado(actor, {
      nombre: `Vera ${crypto.randomUUID().slice(0, 6)}`,
      descripcion: "Mujer de unos cuarenta años, pecas y pelo rubio rizado.",
      declaracion: true,
    });
    const medios = [];
    for (let i = 0; i < 3; i++) {
      medios.push(await crearMedio(actor, new File([await fotoDeReferencia()], `ia-${i}.png`, { type: "image/png" })));
    }
    const respuesta = await rutaReferencias.POST(
      pedir(ana, `/api/personajes/${personaje.id}/referencias`, "POST", {
        referencias: medios.map((m) => ({ medioId: m.id, usarDeTodasFormas: true })),
        generadasConIA: true,
      }),
      ctx(personaje.id),
    );
    expect(respuesta.status).toBe(200);
    const filas = await db()
      .select()
      .from(characterReferences)
      .where(eq(characterReferences.characterId, personaje.id));
    // Nunca como foto: son imágenes generadas.
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.every((f) => f.origin === "vista_generada")).toBe(true);
    // Y sostienen el mínimo: ya no faltan fotos para generar con él.
    expect(await contarReferencias(personaje.id)).toBe(filas.length);
  });

  test("los retratos candidatos de un personaje inventado se generan sin foto y uno se elige como su cara", async () => {
    const personaje = await crearPersonajeInventado(actor, {
      nombre: `Nora ${crypto.randomUUID().slice(0, 6)}`,
      descripcion: "Mujer de unos treinta años, pelo corto castaño, chaqueta vaquera y gesto tranquilo.",
      declaracion: true,
    });
    // El precio del fotograma se lee del catálogo, no de la rejilla del proyecto: en modo Omni no hay fotograma
    // de escena, pero un retrato candidato sí es un fotograma y cuesta lo que cueste ese modelo.
    const { precioDe } = await import("../generacion/precios");
    const precioFotograma = await precioDe("fotograma");
    const { creditosDelEnvio } = await import("../prompts/traduccion");
    const creditosPorFotograma = await creditosDelEnvio(Math.ceil(precioFotograma.creditos));
    const selloFotograma = precioFotograma.sello;
    const { trabajos } = await generarRetratosCandidatos(
      actor,
      personaje.id,
      {
        creditosConfirmados: creditosPorFotograma,
        derechos: true,
        claveIdempotencia: crypto.randomUUID(),
        selloEstimacion: selloFotograma,
        avisoUmbralAceptado: true,
      },
      h,
    );
    expect(trabajos).toHaveLength(4);
    await enviarEncolados(h);
    // Ningún retrato lleva referencias: nacen de la descripción, no de una foto. Desde la 0.23.4 el campo ni
    // siquiera se envía (enviarlo vacío sería pedirle al modelo que editara una imagen que no existe).
    for (const entrada of enviados.values()) expect(entrada.image_urls).toBeUndefined();

    for (const [taskId] of tareas) {
      tareas.set(taskId, { state: "success", urls: ["https://kie/retrato.png"], creditos: 4 });
    }
    const suyos = await db()
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.userId, ana.id), eq(generationJobs.characterId, personaje.id)));
    for (const trabajo of suyos) await consultarTrabajo(actor, trabajo.id, { forzar: true }, h);

    const { retratosCandidatos } = await import("../personajes/inventado");
    const candidatos = await retratosCandidatos(personaje.id);
    expect(candidatos.length).toBeGreaterThan(0);
    const elegido = candidatos[0];
    if (!elegido) throw new Error("Falta el retrato candidato.");
    const conRetrato = await elegirRetrato(actor, personaje.id, elegido.medioId);
    // Se guarda **marcado como vista generada**, nunca como foto: no lo es.
    expect(conRetrato.referencias?.[0]?.origen).toBe("vista_generada");
    // Y sí cuenta para el mínimo: en un inventado lo sostienen sus imágenes generadas, no fotos que no tiene.
    expect(conRetrato.totalReferencias).toBe(1);
    expect(conRetrato.totalGeneradas).toBe(1);

    // Descartar los que quedan: dejan de ofrecerse, pero sus imágenes siguen en la biblioteca.
    const quedaban = await retratosCandidatos(personaje.id);
    const { descartados } = await descartarRetratos(actor, personaje.id);
    expect(descartados).toBeGreaterThan(0);
    expect(await retratosCandidatos(personaje.id)).toHaveLength(0);
    for (const c of quedaban) {
      const [medio] = await db().select().from(media).where(eq(media.id, c.medioId));
      expect(medio?.deletedAt ?? null).toBeNull();
    }
  });

  test("se puede encargar un solo retrato y la cantidad no puede superar cuatro", async () => {
    const personaje = await crearPersonajeInventado(actor, {
      nombre: `Mika ${crypto.randomUUID().slice(0, 6)}`,
      descripcion: "Mujer adulta ficticia de pelo azul y chaqueta coral.",
      declaracion: true,
    });
    const { precioDe } = await import("../generacion/precios");
    const { creditosDelEnvio } = await import("../prompts/traduccion");
    const precio = await precioDe("fotograma");
    const confirmacion = {
      cantidad: 1,
      creditosConfirmados: await creditosDelEnvio(Math.ceil(precio.creditos)),
      derechos: true,
      claveIdempotencia: crypto.randomUUID(),
      selloEstimacion: precio.sello,
      avisoUmbralAceptado: true,
    };
    expect((await generarRetratosCandidatos(actor, personaje.id, confirmacion, h)).trabajos).toHaveLength(1);
    await expect(generarRetratosCandidatos(actor, personaje.id, { ...confirmacion, cantidad: 5 }, h)).rejects.toThrow(
      /entre 1 y 4 retratos/,
    );
  });
  // ── Lo que señaló la revisión de código ──────────────────────────────────────────────────────────────────

  test("registrar no cuesta créditos, pero tiene ritmo: pasado el tope se rechaza sin llamar al proveedor", async () => {
    const { RITMO_REGISTROS_OMNI, exigirRitmoDeRegistro } = await import("./registro");
    // Se consume el ritmo entero sin tocar al proveedor: lo que se comprueba es la puerta, no el registro.
    for (let i = 0; i < RITMO_REGISTROS_OMNI.maximo; i++) await exigirRitmoDeRegistro(ana.id);
    const fallo = await error(() => registrarVoz());
    expect(fallo.estado).toBe(429);
    expect(fallo.message).toContain("no cuesta créditos");
    // Nada ha salido hacia el proveedor: el corte está antes de la credencial y de la llamada.
    expect(respuestas.registrosDeVoz).toBe(0);
  });

  test("en modo Omni no se exige el modelo de fotograma: ni su precio ni su duración impiden producir", async () => {
    await todoRegistrado();
    const estado = await produccion();
    // No hay fotograma en este modo, así que su precio no entra en el gasto ni en los impedimentos.
    expect(estado.creditosPorFotograma).toBe(0);
    expect(estado.impedimentos.join(" ")).not.toContain("modelo con precio registrado");
    expect(estado.impedimentos.join(" ")).not.toContain("genera clips de");

    /**
     * La regla que lo sostiene, sobre la función pura: en modo Omni quien decide si se puede producir es el
     * modelo de escenas habladas (`impedimentosDeOmni`), así que aquí no llegan ni el precio del fotograma ni la
     * duración del modelo de animación genérico. Con esa forma, no hay ningún impedimento que dar.
     */
    const { impedimentosDeProduccion } = await import("../produccion/consulta");
    expect(
      impedimentosDeProduccion({
        planAprobado: true,
        protagonista: personajeId,
        sinPrecio: false,
        segundosDelClip: null,
        segundosDelProyecto: 4,
        presupuesto: 100_000,
        comprometido: 0,
        creditosFotograma: CREDITOS_OMNI,
        porProducir: 2,
        tieneEscenasNormales: true,
      }),
    ).toEqual([]);

    // Y se produce de verdad, que es lo que el impedimento estaba bloqueando antes.
    await producirProyecto(actor, proyectoId, await confirmacion(), h);
    expect(await trabajosDelProyecto()).toHaveLength(2);
  });
  // ── Segundo motor: MiniMax H3, elegible desde el mapa de vídeo ───────────────────────────────────────────

  test("con MiniMax H3 la escena va con las fotos del personaje y la muestra de la voz del proyecto", async () => {
    const { guardarMapa } = await import("../mapa/mapa");
    await registrarPrecioDe(MODELO_H3, CREDITOS_H3);
    // El usuario pone H3 el primero en su mapa de vídeo: es él quien elige con qué se genera.
    await guardarMapa(ana.id, "video", [{ proveedor: "kie", compatibleId: null, modelo: MODELO_H3 }]);
    // H3 genera clips de 5 s, así que el proyecto tiene que pedir esa duración: la pantalla lo dice si no.
    await db().update(projects).set({ clipSeconds: 5 }).where(eq(projects.id, proyectoId));
    // H3 no registra nada en el proveedor: la voz es la del mapa de voz del proyecto y su muestra ya pagada.
    await fijarVozDePista();

    const estado = await produccion();
    expect(estado.impedimentos).toEqual([]);
    // 40 créditos por 5 s medidos: el precio es el de **ese** modelo, no el del recomendado.
    expect(estado.creditosPorClip).toBe(CREDITOS_H3);

    await producirProyecto(actor, proyectoId, await confirmacion(), h);
    await enviarEncolados(h);

    const entradas = [...enviados.values()];
    expect(entradas).toHaveLength(2);
    for (const entrada of entradas) {
      // La cara son las fotos del personaje y la voz, la muestra: nada de identidades registradas.
      expect((entrada.reference_image_urls as string[]).length).toBeGreaterThan(0);
      expect((entrada.reference_audio_urls as string[]).length).toBe(1);
      expect(entrada.character_ids).toBeUndefined();
      // La duración va como número entero, al revés que en Omni, que la quiere como texto.
      expect(entrada.duration).toBe(5);
      expect(entrada.resolution).toBe("768P");
    }
    // Y no se ha registrado nada en el proveedor: este motor no lo necesita.
    expect(respuestas.registrosDePersonaje).toBe(0);
    await guardarMapa(ana.id, "video", []);
  });

  test("con MiniMax H3 y sin muestra de la voz pagada, la escena se bloquea y dice qué falta", async () => {
    const { guardarMapa } = await import("../mapa/mapa");
    await registrarPrecioDe(MODELO_H3, CREDITOS_H3);
    await guardarMapa(ana.id, "video", [{ proveedor: "kie", compatibleId: null, modelo: MODELO_H3 }]);
    await db().update(projects).set({ clipSeconds: 5 }).where(eq(projects.id, proyectoId));
    // Voz elegida pero **sin muestra pagada**: es el audio de referencia, así que sin él no puede sonar.
    await fijarVozDePista(false);

    expect((await produccion()).impedimentos.join(" ")).toContain("muestra");
    const confirmada = await confirmacion();
    const fallo = await error(() => producirProyecto(actor, proyectoId, confirmada, h));
    expect(fallo.estado).toBe(409);
    expect(await trabajosDelProyecto()).toHaveLength(0);
    await guardarMapa(ana.id, "video", []);
  });
});
