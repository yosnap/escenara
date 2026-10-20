import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { ProyectoDetalle } from "@/lib/proyectos";

/**
 * **Planos base y voces de cada personaje** contra el PostgreSQL y el SeaweedFS locales (`bun run services:up`).
 *
 * Ningún test llama a KIE: el proveedor se simula con un `fetch` propio con las formas reales de su API y la clave
 * es inventada. No se gasta ni un crédito de verdad.
 *
 * Lo que comprueba:
 *
 * - una persona con lugar pide **un** plano base, una sola vez por confirmación, y al darlo por bueno **todas** sus
 *   escenas apuntan al mismo fotograma;
 * - sin lugar no se pide ningún fotograma, y en una entrevista (los dos en plano) tampoco;
 * - el registro que falta se hace **antes** de encolar, sin coste; si no se puede (a la segunda le falta su voz),
 *   no se registra ni se encola nada y el motivo la nombra;
 * - el vestuario fijo de la biblia viaja en el prompt del plano base;
 * - con el ajuste de los vídeos completos encendido, el clip arranca de su plano base junto a la identidad
 *   registrada; apagado, el lugar va descrito.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_planos_base");
}

const { and, eq } = await import("drizzle-orm");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaPlan = await import("@/app/api/proyectos/[id]/plan/route");
const rutaVoz = await import("@/app/api/proyectos/[id]/voz/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characterOmniRegistrations, characters, generationJobs, projects, rateLimits, scenes, usageLedger, users } =
  await import("../db/esquema");
const { olvidarSaldos } = await import("../generacion/estimacion");
const { listarModelos, olvidarCatalogo } = await import("../proveedores/catalogo");
const { cambiarEstadoDeModelo, cambiarPrecioDeModelo } = await import("../proveedores/catalogo-admin");
const { registrarVozOmni, validarEleccionVozOmni } = await import("../voz/omni");
const { registrarVozPropia } = await import("../personajes/voz-propia");
const { sustituirEscenasDelGuion } = await import("../asistente/escenas");
const { lugarDeclaradoDePrueba, subirFotoDePrueba } = await import("../lugares/lugar-de-prueba");
const { estadoDeProduccion } = await import("../produccion/consulta");
const { producirEscena } = await import("../produccion/producir");
const { enviarEncolados } = await import("../cola/pasada");
const { aprobarPlanoBase, encolarPlanosBase, planosBaseDe } = await import("./planos-base");
const { MODELOS_OMNI, VOCES_OMNI } = await import("@/lib/omni");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type Buscador = import("../proveedores/codigos").Buscador;
type EscenaDelGuion = import("@/lib/video-completo").EscenaDelGuion;

const EJECUCION = randomBytes(4).toString("hex");
let registrosDePersonaje = 0;
let siguienteTarea = 0;
const enviados: Record<string, unknown>[] = [];

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url, opciones) => {
  if (url.includes("/chat/credit")) return sobre(1_000_000);
  if (url.includes("file-stream-upload")) return sobre({ downloadUrl: "https://tempfile.kie.ai/retrato.png" });
  if (url.includes("/omni/audio/create")) {
    const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { audio_id?: string };
    return sobre({ audioId: `audio_${EJECUCION}_${cuerpo.audio_id}`, name: "voz" });
  }
  if (url.includes("/omni/character/create")) {
    registrosDePersonaje++;
    return sobre({
      characterId: `char_${EJECUCION}_${registrosDePersonaje}`,
      characterName: "x",
      imageUrl: "",
      bodyImageUrl: "",
    });
  }
  if (url.includes("createTask")) {
    const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { input?: Record<string, unknown> };
    enviados.push(cuerpo.input ?? {});
    return sobre({ taskId: `tarea_${EJECUCION}_${++siguienteTarea}` });
  }
  if (url.includes("recordInfo")) return sobre({ state: "waiting", failMsg: "" });
  throw new Error(`URL no simulada: ${url}`);
};
const h = { buscar, descargar: async () => ({ archivo: new File([], "x"), origen: "" }) };
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

describe.skipIf(!hayBaseDeDatos)("planos base de un vídeo completo y voz de cada personaje", () => {
  let ana: Sesion;
  let admin: Sesion;
  let actor: Actor;
  let lucia: string;
  let elisa: string;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_planos_base");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    admin = await crearSesionDePrueba("admin");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", `kie-prueba-${EJECUCION}`, buscar);
    await guardarAjustes(
      {
        presupuestoCreditos: 0,
        presupuestoTrabajo: 0,
        trabajosSimultaneos: 50,
        escenasEnVuelo: 20,
        repartoPodcastActivo: true,
        repartoDualcastActivo: true,
      },
      null,
    );
    await precioDeOmni();
    lucia = await personaje("Lucía");
    elisa = await personaje("Elisa");
  });

  afterAll(async () => {
    for (const sesion of [ana, admin]) if (sesion?.email) await db().delete(users).where(eq(users.email, sesion.email));
    await guardarAjustes(
      {
        presupuestoCreditos: ajustesPrevios.presupuestoCreditos,
        presupuestoTrabajo: ajustesPrevios.presupuestoTrabajo,
        trabajosSimultaneos: ajustesPrevios.trabajosSimultaneos,
        escenasEnVuelo: ajustesPrevios.escenasEnVuelo,
        repartoPodcastActivo: ajustesPrevios.repartoPodcastActivo,
        repartoDualcastActivo: ajustesPrevios.repartoDualcastActivo,
        omniLugarCombinadoVideoCompleto: ajustesPrevios.omniLugarCombinadoVideoCompleto,
      },
      null,
    );
  });

  beforeEach(async () => {
    olvidarSaldos();
    registrosDePersonaje = 0;
    enviados.length = 0;
    exigirBaseDeDatosDePrueba("escenara_pruebas_planos_base");
    await db().delete(rateLimits);
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(usageLedger).where(eq(usageLedger.userId, ana.id));
    await db().delete(projects).where(eq(projects.userId, ana.id));
    // Cada caso empieza sin registros ni voces propias: así se ve qué registra cada uno.
    await db().delete(characterOmniRegistrations).where(eq(characterOmniRegistrations.registeredBy, ana.id));
    await db()
      .update(characters)
      .set({ omniVoice: "", omniVoiceDescription: "", omniVoiceExample: "", omniAudioId: "", omniVoiceSetAt: null })
      .where(eq(characters.ownerId, ana.id));
    await guardarAjustes({ omniLugarCombinadoVideoCompleto: false }, null);
  });

  // ── Preparativos ────────────────────────────────────────────────────────────────────────────────────────

  async function precioDeOmni(): Promise<void> {
    olvidarCatalogo();
    const candidatos = await listarModelos({ capacidad: "image_to_video" });
    const [modelo] = MODELOS_OMNI.flatMap((nombre) => candidatos.filter((m) => m.modelo === nombre));
    if (!modelo) throw new Error("Falta el modelo de escenas habladas en el catálogo de pruebas.");
    await cambiarPrecioDeModelo(
      { modeloId: modelo.id, creditos: 63, fuente: "Medido con dinero real el 2026-09-28.", comprobado: "2026-09-28" },
      admin.id,
    );
    olvidarCatalogo();
    await cambiarEstadoDeModelo(
      { modeloId: modelo.id, estado: "validado", evidencia: "Medido con dinero real el 2026-09-28." },
      admin.id,
    );
    olvidarCatalogo();
  }

  async function personaje(nombre: string): Promise<string> {
    const creado = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", {
        nombre: `${nombre} ${crypto.randomUUID().slice(0, 6)}`,
        tipo: "persona",
      }),
      undefined,
    );
    const { id } = (await creado.json()) as { id: string };
    const referencias = await Promise.all(
      Array.from({ length: 3 }, async (_, i) => ({ medioId: await subirFotoDePrueba(actor, `${nombre}-${i}.png`) })),
    );
    await rutaReferencias.POST(pedir(ana, `/api/personajes/${id}/referencias`, "POST", { referencias }), ctx(id));
    await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${id}/consentimiento`, "POST", {
        titular: "yo",
        mayoriaDeEdad: true,
        alcance: "personal",
      }),
      ctx(id),
    );
    return id;
  }

  const escena = (texto: string, reparto: string[], extra: Partial<EscenaDelGuion> = {}): EscenaDelGuion => ({
    texto,
    accion: "Plano medio en el estudio, mira a cámara",
    segundos: 4,
    plano: "medio",
    formato: "solo",
    grupoPodcast: null,
    reparto,
    turnos: [],
    ...extra,
  });

  /** Un vídeo completo ya escrito: escenas del guion, biblia, voz del proyecto, lugar si se pide y plan aprobado. */
  async function videoCompleto(tipo: "una_persona" | "podcast" | "entrevista", conLugar = true): Promise<string> {
    const creado = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", {
        titulo: "Vídeo completo",
        formato: "reel_vertical",
        idea: "Una charla en un estudio de radio.",
        personajeId: lucia,
        presupuestoCreditos: 100_000,
        segundosClip: 4,
      }),
      undefined,
    );
    const proyectoId = ((await creado.json()) as ProyectoDetalle).proyecto.id;
    await rutaVoz.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/voz`, "POST", { accion: "fijar-modo", modo: "omni" }),
      ctx(proyectoId),
    );
    await registrarVozOmni(
      actor,
      proyectoId,
      validarEleccionVozOmni({
        voz: VOCES_OMNI[0]?.id ?? "",
        descripcion: "Voz natural en español de España, acento peninsular, tono cercano.",
        ejemplo: "Hola, así suena mi voz cuando cuento algo.",
      }),
      false,
      h,
    );
    const grupo = crypto.randomUUID();
    const escenas =
      tipo === "una_persona"
        ? [escena("Hola, hoy os cuento algo.", [lucia]), escena("Y así termina.", [lucia])]
        : tipo === "podcast"
          ? [
              escena("¿Qué tal la semana?", [lucia], { grupoPodcast: grupo }),
              escena("Muy movida, la verdad.", [elisa], { grupoPodcast: grupo }),
              escena("Pues cuéntamelo todo.", [lucia], { grupoPodcast: grupo }),
            ]
          : [
              escena("Hola. Hola.", [lucia, elisa], {
                formato: "dualcast",
                turnos: [
                  { personajeId: lucia, texto: "Hola." },
                  { personajeId: elisa, texto: "Hola." },
                ],
              }),
            ];
    await db().transaction((tx) => sustituirEscenasDelGuion(tx, proyectoId, escenas));
    const lugar = conLugar ? (await lugarDeclaradoDePrueba(actor, "Estudio")).lugar.id : null;
    await db()
      .update(projects)
      .set({
        defaultPlaceId: lugar,
        continuityBible: {
          lugar: "A small radio studio, warm tungsten light",
          vestuario: { [lucia]: "Mustard knitted jumper", [elisa]: "White shirt, grey blazer" },
          planos: [],
        },
      })
      .where(eq(projects.id, proyectoId));
    const { detalleProyecto } = await import("../asistente/plan");
    const antes = await detalleProyecto(actor, proyectoId);
    const aprobado = await rutaPlan.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/plan`, "POST", {
        presupuestoCreditos: 100_000,
        totalConfirmado: antes.plan.totalCreditos,
      }),
      ctx(proyectoId),
    );
    if (aprobado.status !== 200) throw new Error(await aprobado.text());
    return proyectoId;
  }

  async function confirmarPlanos(proyectoId: string, clave = crypto.randomUUID()) {
    const vista = await planosBaseDe(actor, proyectoId);
    return encolarPlanosBase(
      actor,
      proyectoId,
      {
        derechos: true,
        sinTerceros: true,
        creditosConfirmados: vista.coste?.total ?? 0,
        selloEstimacion: vista.coste?.sello ?? "",
        claveIdempotencia: clave,
        avisoUmbralAceptado: true,
      },
      h,
    );
  }

  const fotogramas = async (proyectoId: string) => {
    const ids = (await db().select({ id: scenes.id }).from(scenes).where(eq(scenes.projectId, proyectoId))).map(
      (e) => e.id,
    );
    const todos = await db()
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.userId, ana.id), eq(generationJobs.kind, "fotograma")))
      .orderBy(generationJobs.createdAt);
    return todos.filter((t) => t.sceneId !== null && ids.includes(t.sceneId));
  };

  /** Simula que el fotograma del plano ya ha salido y está en la biblioteca. */
  async function fotogramaListo(trabajoId: string): Promise<string> {
    const medio = await subirFotoDePrueba(actor, "plano-base.png");
    await db()
      .update(generationJobs)
      .set({ state: "listo", resultMediaId: medio })
      .where(eq(generationJobs.id, trabajoId));
    return medio;
  }

  // ── Casos ───────────────────────────────────────────────────────────────────────────────────────────────

  test("una persona con lugar: un plano, registrado antes, pedido una vez y compartido por sus dos escenas", async () => {
    const proyectoId = await videoCompleto("una_persona");
    const vista = await planosBaseDe(actor, proyectoId);
    expect(vista.videoCompleto).toBe(true);
    expect(vista.planos).toHaveLength(1);
    expect(vista.planos[0]?.escenas).toEqual([1, 2]);
    expect(vista.coste?.porPedir).toBe(1);

    const clave = crypto.randomUUID();
    const { nuevos } = await confirmarPlanos(proyectoId, clave);
    expect(nuevos).toBe(1);
    // El registro que faltaba se hizo antes de encolar, y no cuesta créditos.
    expect(registrosDePersonaje).toBe(1);
    const [trabajo] = await fotogramas(proyectoId);
    expect(trabajo?.characterId).toBe(lucia);
    expect(trabajo?.prompt).toContain("Mustard knitted jumper");

    // Repetir la confirmación no encarga otro: el plano ya está pedido.
    expect((await confirmarPlanos(proyectoId, clave)).nuevos).toBe(0);
    expect(await fotogramas(proyectoId)).toHaveLength(1);

    const medio = await fotogramaListo(trabajo?.id ?? "");
    const aprobada = await aprobarPlanoBase(actor, proyectoId, lucia);
    expect(aprobada.planos[0]?.estado).toBe("aprobado");
    const filas = await db().select().from(scenes).where(eq(scenes.projectId, proyectoId));
    expect(filas.map((e) => e.approvedFrameMediaId)).toEqual([medio, medio]);
  });

  test("sin lugar no se pide ningún fotograma", async () => {
    const proyectoId = await videoCompleto("una_persona", false);
    const vista = await planosBaseDe(actor, proyectoId);
    expect(vista.planos).toEqual([]);
    expect(vista.sinPlano).toHaveLength(2);
    expect((await confirmarPlanos(proyectoId)).nuevos).toBe(0);
    expect(await fotogramas(proyectoId)).toHaveLength(0);
  });

  test("entrevista: los dos comparten plano, así que no hay plano base y se dice por qué", async () => {
    const proyectoId = await videoCompleto("entrevista");
    const vista = await planosBaseDe(actor, proyectoId);
    expect(vista.planos).toEqual([]);
    expect(vista.sinPlano[0]?.motivo).toContain("las dos personas");
  });

  test("podcast: si la segunda no tiene su voz, no se registra ni se encola nada, y el motivo la nombra", async () => {
    const proyectoId = await videoCompleto("podcast");
    expect((await planosBaseDe(actor, proyectoId)).planos).toHaveLength(2);
    const fallo = await error(() => confirmarPlanos(proyectoId));
    expect(fallo.estado).toBe(409);
    expect(fallo.message).toContain("Elisa");
    expect(fallo.message).toContain("su voz");
    expect(registrosDePersonaje).toBe(0);
    expect(await fotogramas(proyectoId)).toHaveLength(0);
  });

  test("podcast con la voz de cada una: dos planos, cada uno con su personaje y su ropa", async () => {
    const proyectoId = await videoCompleto("podcast");
    await registrarVozPropia(
      actor,
      elisa,
      validarEleccionVozOmni({
        voz: VOCES_OMNI[1]?.id ?? "",
        descripcion: "Voz natural en español de España, más grave y pausada.",
        ejemplo: "Y yo te lo cuento a mi manera.",
      }),
      h,
    );
    const { nuevos } = await confirmarPlanos(proyectoId);
    expect(nuevos).toBe(2);
    const trabajos = await fotogramas(proyectoId);
    expect(trabajos.map((t) => t.characterId).sort()).toEqual([lucia, elisa].sort());
    expect(trabajos.find((t) => t.characterId === elisa)?.prompt).toContain("White shirt, grey blazer");
    // Cada una quedó registrada con su voz: Elisa con la suya y Lucía con la del proyecto.
    const registros = await db().select().from(characterOmniRegistrations);
    const audioDe = (id: string) => registros.find((r) => r.characterId === id)?.audioId;
    expect(audioDe(elisa)).not.toBe(audioDe(lucia));
  });

  test("con el ajuste de vídeo completo, el clip arranca de su plano base; apagado, el lugar va descrito", async () => {
    const proyectoId = await videoCompleto("una_persona");
    await confirmarPlanos(proyectoId);
    const [trabajo] = await fotogramas(proyectoId);
    await fotogramaListo(trabajo?.id ?? "");
    await aprobarPlanoBase(actor, proyectoId, lucia);
    const producir = async (escenaId: string) => {
      const estado = await estadoDeProduccion(actor, proyectoId);
      const tarjeta = estado.escenas.find((e) => e.id === escenaId);
      await db().delete(rateLimits);
      await producirEscena(
        actor,
        escenaId,
        {
          derechos: true,
          sinTerceros: true,
          creditosConfirmados: tarjeta?.costeHablado?.creditos ?? estado.creditosPorClip,
          selloEstimacion: tarjeta?.costeHablado?.sello ?? estado.selloClip,
          claveIdempotencia: crypto.randomUUID(),
          avisoUmbralAceptado: true,
        },
        h,
      );
      await enviarEncolados(h);
      return enviados.at(-1) ?? {};
    };
    const [primera, segunda] = await db()
      .select()
      .from(scenes)
      .where(eq(scenes.projectId, proyectoId))
      .orderBy(scenes.sortOrder);

    const apagado = await producir(primera?.id ?? "");
    expect(apagado.character_ids).toHaveLength(1);
    expect(apagado.image_urls ?? []).toHaveLength(0);
    expect(String(apagado.prompt)).toContain("Mustard knitted jumper");

    await guardarAjustes({ omniLugarCombinadoVideoCompleto: true }, null);
    const encendido = await producir(segunda?.id ?? "");
    expect(encendido.character_ids).toHaveLength(1);
    expect(encendido.image_urls).toHaveLength(1);
  });

  test("si cambia la ropa de la biblia, el plano caduca, sus escenas dejan de arrancar de él y se puede volver a pedir", async () => {
    const proyectoId = await videoCompleto("una_persona");
    await confirmarPlanos(proyectoId);
    const [trabajo] = await fotogramas(proyectoId);
    await fotogramaListo(trabajo?.id ?? "");
    await aprobarPlanoBase(actor, proyectoId, lucia);

    const [proyecto] = await db().select().from(projects).where(eq(projects.id, proyectoId)).limit(1);
    const biblia = proyecto?.continuityBible;
    if (!biblia) throw new Error("Falta la biblia.");
    await db()
      .update(projects)
      .set({ continuityBible: { ...biblia, vestuario: { ...biblia.vestuario, [lucia]: "Red raincoat" } } })
      .where(eq(projects.id, proyectoId));

    const vista = await planosBaseDe(actor, proyectoId);
    expect(vista.planos[0]?.estado).toBe("sin_pedir");
    expect(vista.planos[0]?.motivo).toContain("han cambiado");
    expect(vista.coste?.porPedir).toBe(1);
    const filas = await db().select().from(scenes).where(eq(scenes.projectId, proyectoId));
    expect(filas.map((e) => e.approvedFrameMediaId)).toEqual([null, null]);

    // Volver a pedirlo encarga otro fotograma, ya con la ropa nueva.
    expect((await confirmarPlanos(proyectoId)).nuevos).toBe(1);
    const trabajos = await fotogramas(proyectoId);
    expect(trabajos).toHaveLength(2);
    expect(trabajos.some((t) => t.prompt.includes("Red raincoat"))).toBe(true);
  });

  test("un plano fallido se vuelve a pedir cada vez, aunque la pantalla repita la misma clave", async () => {
    const proyectoId = await videoCompleto("una_persona");
    // Falla el trabajo **vigente del plano** (el que apunta la biblia): la lista de trabajos no tiene orden fijo, y
    // tomar «el último» de ella podía volver a fallar uno ya fallido y dejar el vigente en marcha.
    const fallar = async () => {
      const [proyecto] = await db().select().from(projects).where(eq(projects.id, proyectoId)).limit(1);
      const vigente = proyecto?.continuityBible.planos.find((p) => p.personajeId === lucia)?.trabajoId;
      if (!vigente) throw new Error("El plano tiene que tener su trabajo encargado.");
      await db()
        .update(generationJobs)
        .set({ state: "fallido", errorMessage: "El proveedor no lo generó." })
        .where(eq(generationJobs.id, vigente));
    };
    await confirmarPlanos(proyectoId);
    await fallar();
    const clave = crypto.randomUUID();
    expect((await confirmarPlanos(proyectoId, clave)).nuevos).toBe(1);
    await fallar();
    // Misma clave (la pantalla no ha cambiado su firma: sigue «fallido»), y aun así encarga otro.
    expect((await confirmarPlanos(proyectoId, clave)).nuevos).toBe(1);
    expect(await fotogramas(proyectoId)).toHaveLength(3);
    // Con el tercero en marcha, repetir no encarga nada más.
    expect((await confirmarPlanos(proyectoId, clave)).nuevos).toBe(0);
  });
});
