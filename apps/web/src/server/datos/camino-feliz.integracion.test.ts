import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { MontajeVista } from "@/lib/montaje";
import type { ProduccionVista } from "@/lib/produccion";
import type { ProyectoDetalle } from "@/lib/proyectos";

/**
 * Camino feliz del hito MVP, de extremo a extremo, contra el PostgreSQL y el SeaweedFS de pruebas y contra
 * **FFmpeg de verdad**: personaje con consentimiento → guion del asistente → escenas → plan aprobado → producción
 * de cada escena por la cola → revisión automática → montaje → exportación del proyecto a ZIP.
 *
 * **Nada sale de la máquina y no se gasta un crédito.** Antes de importar el servidor se sustituye `fetch`: lo que
 * va a `localhost` (base de datos y almacenamiento) pasa tal cual, lo que va al proveedor se contesta con las
 * respuestas grabadas de `respuestas-grabadas-camino-feliz.ts`, y cualquier otra URL revienta el test. Los clips
 * que «descarga» la cola son MP4 reales hechos con `ffmpeg -f lavfi`, porque el montaje los renderiza de verdad.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);

const {
  CREDITOS_CONSUMIDOS,
  CREDITOS_TEXTO_CONFIRMADOS,
  GUION_GRABADO,
  MODELO_TEXTO,
  respuestaDeTexto,
  SALDO_KIE,
  SEGUNDOS_POR_ESCENA,
  SELLO_TEXTO,
  sobreKie,
  SUBIDA_KIE,
  TAREA_EN_MARCHA,
  tareaTerminada,
  URL_CLIP,
  URL_FOTOGRAMA,
} = await import("./respuestas-grabadas-camino-feliz");

// ── Red simulada, instalada antes de importar nada del servidor ───────────────────────────────────────────

/** Qué resultado devuelve el proveedor cuando una tarea termina: primero los fotogramas, después los clips. */
let resultadoActual: "fotograma" | "clip" = "fotograma";
/** Tareas creadas por el proveedor simulado y si ya han terminado. */
const tareas = new Map<string, { terminada: boolean }>();
let siguienteTarea = 0;

const fetchOriginal = globalThis.fetch;

const esLocal = (url: string) => {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
};

const urlDe = (entrada: RequestInfo | URL): string =>
  typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;

globalThis.fetch = (async (entrada: RequestInfo | URL, opciones?: RequestInit): Promise<Response> => {
  const url = urlDe(entrada);
  // La base de datos y el almacenamiento son de esta máquina: pasan tal cual.
  if (esLocal(url)) return fetchOriginal(entrada as RequestInfo, opciones);
  if (url.includes("/chat/credit")) return sobreKie(SALDO_KIE);
  if (url.includes("file-stream-upload")) return sobreKie({ downloadUrl: SUBIDA_KIE });
  if (url.includes("/codex/v1/responses")) return respuestaDeTexto();
  if (url.includes("createTask")) {
    const taskId = `feliz_${++siguienteTarea}`;
    tareas.set(taskId, { terminada: false });
    return sobreKie({ taskId });
  }
  if (url.includes("recordInfo")) {
    const taskId = new URL(url).searchParams.get("taskId") ?? "";
    const tarea = tareas.get(taskId);
    if (!tarea?.terminada) return sobreKie(TAREA_EN_MARCHA);
    return sobreKie(tareaTerminada([resultadoActual === "clip" ? URL_CLIP : URL_FOTOGRAMA], CREDITOS_CONSUMIDOS));
  }
  throw new Error(`URL no simulada en el camino feliz: ${url}`);
}) as typeof fetch;

if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_camino_feliz");
}

const { eq } = await import("drizzle-orm");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaProyecto = await import("@/app/api/proyectos/[id]/route");
const rutaAsistente = await import("@/app/api/proyectos/[id]/asistente/route");
const rutaPlan = await import("@/app/api/proyectos/[id]/plan/route");
const rutaProduccion = await import("@/app/api/proyectos/[id]/produccion/route");
const rutaProduccionEscena = await import("@/app/api/escenas/[id]/produccion/route");
const rutaRevision = await import("@/app/api/proyectos/[id]/revision/route");
const rutaMontaje = await import("@/app/api/proyectos/[id]/montaje/route");
const rutaExportarMontaje = await import("@/app/api/proyectos/[id]/montaje/exportacion/route");
const rutaExportacionesProyecto = await import("@/app/api/proyectos/[id]/exportaciones/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const { validarProyectoExportado } = await import("@/lib/proyecto-exportado");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes, olvidarAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, media, models, montageExports, projectExports, rateLimits, scenes } = await import(
  "../db/esquema"
);
const { crearMedio } = await import("../media/servicio");
const { leerObjeto } = await import("../almacenamiento");
const { olvidarCatalogo } = await import("../proveedores/catalogo");
const { olvidarSaldos } = await import("../generacion/estimacion");
const { avanzarEnviados, enviarEncolados, pasadaDeCola } = await import("../cola/pasada");
const { pasadaDeExportaciones } = await import("../montaje/cola");
const { herramientasDeMedida } = await import("../revision/medicion");
const { empaquetar, tomarExportacionProyecto } = await import("./exportacion-proyecto");
const { leerZip } = await import("./zip");
const sharp = (await import("sharp")).default;

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type Herramientas = import("../generacion/herramientas").Herramientas;
type RevisionProyectoVista = import("@/lib/revision").RevisionProyectoVista;

const CLAVE_KIE = `sk-camino-feliz-clave-inventada-${randomBytes(6).toString("hex")}`;
const WORKER = "worker-de-prueba-camino-feliz";

const hayFfmpeg = hayBaseDeDatos && (await herramientasDeMedida()).disponibles;
if (hayBaseDeDatos && !hayFfmpeg) {
  console.warn("[camino feliz] FFmpeg no está instalado: la suite se salta.");
}

// ── Utilidades ────────────────────────────────────────────────────────────────────────────────────────────

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

function bytes(datos: Uint8Array): Uint8Array<ArrayBuffer> {
  const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
  copia.set(datos);
  return copia;
}

/** Foto que pasa el control de calidad de las referencias: 640 × 640 con ruido, así cada una tiene su huella. */
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

describe.skipIf(!hayBaseDeDatos || !hayFfmpeg)("camino feliz del MVP, de personaje a proyecto exportado", () => {
  let ana: Sesion;
  let actor: Actor;
  let carpeta: string;
  /** MP4 vertical de la duración que planifican las escenas: es lo que «descarga» la cola como clip. */
  let clipGrabado: Uint8Array<ArrayBuffer>;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>> | undefined;
  let modeloPrevio: { state: (typeof models.$inferSelect)["state"]; evidence: string } | undefined;

  beforeAll(async () => {
    // Esta suite cambia ajustes de la instalación y borra el ritmo de escrituras: nunca en la base de desarrollo.
    exigirBaseDeDatosDePrueba("escenara_pruebas_camino_feliz");
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE_KIE, globalThis.fetch);
    carpeta = await mkdtemp(path.join(tmpdir(), "escenara-camino-feliz-"));
    clipGrabado = await clipDePrueba(SEGUNDOS_POR_ESCENA);
    // Lo que se cambia aquí se deja como estaba al terminar: la suite comparte conexión y caché de ajustes.
    ajustesPrevios = await leerAjustes();
    [modeloPrevio] = await db()
      .select({ state: models.state, evidence: models.evidence })
      .from(models)
      .where(eq(models.modelId, MODELO_TEXTO));
    // El asistente se enciende y el modelo de texto se marca compatible, como hace quien administra.
    await db()
      .update(models)
      .set({ state: "compatible", evidence: "Simulado en el test de integración del camino feliz." })
      .where(eq(models.modelId, MODELO_TEXTO));
    olvidarCatalogo();
    olvidarSaldos();
    await guardarAjustes(
      {
        asistenteActivo: true,
        montajeActivo: true,
        cuotaMb: 2048,
        presupuestoCreditos: 0,
        presupuestoTrabajo: 0,
        avisoCreditos: 1_000_000,
        trabajosSimultaneos: 20,
        escenasEnVuelo: 4,
        revisionToleranciaDuracion: 0.5,
        revisionSegundosPlanosMaximos: SEGUNDOS_POR_ESCENA,
        revisionExigirAudio: true,
        revisionMultimodalActiva: false,
        exportacionMaximoDiario: 100,
        exportacionTamanoMaximoMb: 2048,
      },
      null,
    );
    await db().delete(rateLimits);
  });

  // ── Material grabado ────────────────────────────────────────────────────────────────────────────────────

  /** Clip vertical 9:16 con audio hecho con FFmpeg: ni sale de la máquina ni cuesta nada. */
  async function clipDePrueba(segundos: number): Promise<Uint8Array<ArrayBuffer>> {
    const ruta = path.join(carpeta, `clip-${segundos}s.mp4`);
    const proceso = Bun.spawn(
      [
        "ffmpeg",
        "-y",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        `color=c=#3d6bff:s=720x1280:d=${segundos}:r=25`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=440:duration=${segundos}`,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        "-t",
        String(segundos),
        ruta,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [codigo, error] = await Promise.all([proceso.exited, new Response(proceso.stderr).text()]);
    if (codigo !== 0) throw new Error(`FFmpeg no ha podido fabricar el clip de prueba: ${error}`);
    return bytes(new Uint8Array(await Bun.file(ruta).arrayBuffer()));
  }

  /** Lo que la cola necesita de fuera: el proveedor simulado y la descarga del resultado, sin red. */
  const herramientas = (): Herramientas => ({
    buscar: globalThis.fetch,
    descargar: async (url: string) => {
      const esClip = url.endsWith(".mp4");
      return {
        archivo: new File([esClip ? clipGrabado : await fotoDeReferencia()], esClip ? "clip.mp4" : "fotograma.png", {
          type: esClip ? "video/mp4" : "image/png",
        }),
        origen: url,
      };
    },
  });

  // ── Pasos del camino ────────────────────────────────────────────────────────────────────────────────────

  /** Personaje de Ana con tres fotos y su consentimiento: es lo que le permite generar con su cara. */
  async function personajeConConsentimiento(): Promise<string> {
    const creado = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", { nombre: "Lucía", tipo: "persona" }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const { id } = (await creado.json()) as { id: string };
    const referencias = await Promise.all(
      Array.from({ length: 3 }, async (_, i) => ({
        medioId: (
          await crearMedio(actor, new File([await fotoDeReferencia()], `lucia-${i}.png`, { type: "image/png" }))
        ).id,
      })),
    );
    expect(
      (await rutaReferencias.POST(pedir(ana, `/api/personajes/${id}/referencias`, "POST", { referencias }), ctx(id)))
        .status,
    ).toBe(200);
    expect(
      (
        await rutaConsentimiento.POST(
          pedir(ana, `/api/personajes/${id}/consentimiento`, "POST", {
            titular: "yo",
            mayoriaDeEdad: true,
            alcance: "personal",
          }),
          ctx(id),
        )
      ).status,
    ).toBe(200);
    return id;
  }

  const detalleDe = async (proyectoId: string): Promise<ProyectoDetalle> => {
    const respuesta = await rutaProyecto.GET(pedir(ana, `/api/proyectos/${proyectoId}`), ctx(proyectoId));
    expect(respuesta.status).toBe(200);
    return (await respuesta.json()) as ProyectoDetalle;
  };

  const produccionDe = async (proyectoId: string): Promise<ProduccionVista> => {
    const respuesta = await rutaProduccion.GET(pedir(ana, `/api/proyectos/${proyectoId}/produccion`), ctx(proyectoId));
    expect(respuesta.status).toBe(200);
    return (await respuesta.json()) as ProduccionVista;
  };

  /** Confirmación de coste tal como la manda el navegador, con el sello vigente de la producción. */
  async function confirmacion(proyectoId: string, tipo: "fotograma" | "clip") {
    const estado = await produccionDe(proyectoId);
    return {
      derechos: true,
      sinTerceros: true,
      creditosConfirmados: tipo === "fotograma" ? estado.creditosPorFotograma : estado.creditosPorClip,
      selloEstimacion: tipo === "fotograma" ? estado.selloFotograma : estado.selloClip,
      claveIdempotencia: crypto.randomUUID(),
      avisoUmbralAceptado: true,
      avisosConfirmados: estado.controlesDelModelo.comprobaciones.filter((c) => c.confirmable).map((c) => c.regla),
    };
  }

  const trabajosDelProyecto = async (proyectoId: string) => {
    const escenas = await db().select({ id: scenes.id }).from(scenes).where(eq(scenes.projectId, proyectoId));
    const ids = new Set(escenas.map((e) => e.id));
    return (await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id))).filter(
      (t) => t.sceneId !== null && ids.has(t.sceneId),
    );
  };

  /**
   * Una vuelta completa de la cola: envía lo encolado, da por terminadas las tareas del proveedor y avanza los
   * trabajos hasta que el resultado está descargado y guardado en la biblioteca.
   */
  async function vueltaDeCola(proyectoId: string, tipo: "fotograma" | "clip"): Promise<void> {
    resultadoActual = tipo;
    const h = herramientas();
    expect(await enviarEncolados(h, WORKER)).toBeGreaterThan(0);
    for (const tarea of tareas.values()) tarea.terminada = true;
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      await avanzarEnviados(h);
      const enMarcha = (await trabajosDelProyecto(proyectoId)).filter(
        (t) => t.state === "enviado" || t.state === "en_curso",
      );
      if (enMarcha.length === 0) break;
      // El worker respeta un mínimo entre consultas; aquí se adelanta el reloj de la fila en lugar de esperarlo.
      await db().update(generationJobs).set({ polledAt: null }).where(eq(generationJobs.userId, ana.id));
    }
    const fallidos = (await trabajosDelProyecto(proyectoId)).filter((t) => t.state === "fallido");
    expect(fallidos.map((t) => t.errorMessage)).toEqual([]);
  }

  // ── El camino, de una punta a la otra ───────────────────────────────────────────────────────────────────

  test("de un personaje con consentimiento a un proyecto montado y exportado en ZIP, sin llamar a ningún proveedor", async () => {
    // 1. Personaje con consentimiento y fotos.
    const personajeId = await personajeConConsentimiento();

    // 2. Proyecto con ese protagonista.
    const creado = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", {
        titulo: "Mañana tranquila",
        formato: "reel_vertical",
        idea: "Dos momentos de una mañana en casa, con luz suave.",
        personajeId,
        presupuestoCreditos: 100_000,
      }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const proyectoId = ((await creado.json()) as ProyectoDetalle).proyecto.id;

    // 3. Guion del asistente con la respuesta grabada del modelo de texto.
    const guion = await rutaAsistente.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/asistente`, "POST", {
        claveIdempotencia: crypto.randomUUID(),
        creditosConfirmados: CREDITOS_TEXTO_CONFIRMADOS,
        selloEstimacion: SELLO_TEXTO,
      }),
      ctx(proyectoId),
    );
    expect(guion.status).toBe(200);
    const conGuion = (await guion.json()) as ProyectoDetalle;
    expect(conGuion.proyecto.concepto).toContain("mañana");
    expect(conGuion.escenas).toHaveLength(GUION_GRABADO.escenas.length);
    expect(conGuion.escenas[0]?.texto).toBe(GUION_GRABADO.escenas[0]?.texto);

    // 4. Aprobación del plan: es la puerta que autoriza gastar.
    const antes = await detalleDe(proyectoId);
    expect(antes.plan.impedimentos).toEqual([]);
    const aprobado = await rutaPlan.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/plan`, "POST", {
        presupuestoCreditos: 100_000,
        totalConfirmado: antes.plan.totalCreditos,
      }),
      ctx(proyectoId),
    );
    expect(aprobado.status).toBe(200);
    const planificado = (await aprobado.json()) as ProyectoDetalle;
    expect(planificado.proyecto.estado).toBe("planificado");
    expect(planificado.escenas.every((e) => e.estado === "aprobada")).toBe(true);

    // 5. Producción: los fotogramas de todas las escenas salen por la cola.
    const produccion = await rutaProduccion.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/produccion`, "POST", await confirmacion(proyectoId, "fotograma")),
      ctx(proyectoId),
    );
    expect(produccion.status).toBe(200);
    expect(((await produccion.json()) as ProduccionVista).enVuelo).toBe(GUION_GRABADO.escenas.length);
    await vueltaDeCola(proyectoId, "fotograma");
    const conFotogramas = await produccionDe(proyectoId);
    expect(conFotogramas.escenas.every((e) => e.fotograma?.estado === "listo")).toBe(true);

    /**
     * El clip grabado tiene que durar lo que planifica la escena: la duración la fija el proyecto y la escena la
     * copia, así que se lee de la base en lugar de suponerla, o la revisión lo marcaría como crítico.
     */
    const [planificada] = await db().select().from(scenes).where(eq(scenes.projectId, proyectoId)).limit(1);
    clipGrabado = await clipDePrueba(planificada?.plannedSeconds ?? SEGUNDOS_POR_ESCENA);

    // 6. Aprobar cada fotograma encarga su clip, y la cola lo trae como MP4 de verdad.
    for (const escena of conFotogramas.escenas) {
      const respuesta = await rutaProduccionEscena.POST(
        pedir(ana, `/api/escenas/${escena.id}/produccion`, "POST", {
          accion: "aprobar-fotograma",
          ...(await confirmacion(proyectoId, "clip")),
        }),
        ctx(escena.id),
      );
      expect(respuesta.status).toBe(200);
    }
    await vueltaDeCola(proyectoId, "clip");
    const producidas = await db()
      .select()
      .from(scenes)
      .where(eq(scenes.projectId, proyectoId))
      .orderBy(scenes.sortOrder);
    expect(producidas).toHaveLength(GUION_GRABADO.escenas.length);
    expect(producidas.every((e) => e.clipMediaId !== null && e.approvedFrameMediaId !== null)).toBe(true);

    // 7. Revisión automática: mide el archivo con ffprobe y no cuesta nada.
    for (const escena of producidas) {
      const respuesta = await rutaRevision.POST(
        pedir(ana, `/api/proyectos/${proyectoId}/revision`, "POST", { accion: "comprobar", escenaId: escena.id }),
        ctx(proyectoId),
      );
      expect(respuesta.status).toBe(200);
      const vista = (await respuesta.json()) as RevisionProyectoVista;
      const revisada = vista.escenas.find((e) => e.id === escena.id);
      expect(revisada?.automatica).not.toBeNull();
      expect(revisada?.automatica?.severidad).not.toBe("critica");
      expect(revisada?.bloquea).toBe(false);
      expect(vista.criticosAbiertos).toBe(0);
    }

    // 8. Montaje: el render es el de producción, con FFmpeg de verdad.
    const montaje = await rutaMontaje.GET(pedir(ana, `/api/proyectos/${proyectoId}/montaje`), ctx(proyectoId));
    expect(montaje.status).toBe(200);
    const vistaMontaje = (await montaje.json()) as MontajeVista;
    expect(vistaMontaje.fragmentos).toHaveLength(GUION_GRABADO.escenas.length);
    const exportacionMontaje = await rutaExportarMontaje.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/montaje/exportacion`, "POST", {}),
      ctx(proyectoId),
    );
    expect(exportacionMontaje.status).toBe(202);
    expect(await pasadaDeExportaciones(WORKER)).toBe(1);
    const [montada] = await db().select().from(montageExports).where(eq(montageExports.projectId, proyectoId));
    expect(montada?.state).toBe("listo");
    const videoMontado = montada?.resultMediaId ?? "";
    expect(videoMontado).not.toBe("");

    // 9. Exportación del proyecto a ZIP, con el vídeo montado dentro. La pide la API y la prepara el worker.
    const pedida = await rutaExportacionesProyecto.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/exportaciones`, "POST"),
      ctx(proyectoId),
    );
    expect(pedida.status).toBe(201);
    const { exportacion } = (await pedida.json()) as { exportacion: { id: string; estado: string } };
    expect(exportacion.estado).toBe("en_cola");
    const tomada = await tomarExportacionProyecto(WORKER);
    expect(tomada?.id).toBe(exportacion.id);
    if (!tomada) throw new Error("La exportación del proyecto no se ha podido tomar.");
    expect(await empaquetar(tomada, WORKER)).toBe(true);
    const [paquete] = await db().select().from(projectExports).where(eq(projectExports.id, exportacion.id));
    expect(paquete?.state).toBe("lista");
    if (!paquete?.storageKey) throw new Error("El paquete no tiene clave de almacenamiento.");
    const archivos = leerZip(new Uint8Array(await leerObjeto(paquete.storageKey).arrayBuffer()));
    const json = JSON.parse(new TextDecoder().decode(archivos.get("proyecto.json"))) as {
      medios: { ruta: string; sha256: string; bytes: number }[];
      escenas: unknown[];
    };
    expect(validarProyectoExportado(json, archivos.keys())).toEqual([]);
    expect(json.escenas).toHaveLength(GUION_GRABADO.escenas.length);

    // El vídeo montado va en el paquete, con su tamaño y su huella.
    const [filaVideo] = await db().select().from(media).where(eq(media.id, videoMontado));
    const enPaquete = json.medios.find((m) => m.bytes === filaVideo?.sizeBytes && m.ruta.endsWith(".mp4"));
    expect(enPaquete).toBeDefined();
    const datos = archivos.get(enPaquete?.ruta ?? "");
    expect(new Bun.CryptoHasher("sha256").update(datos ?? new Uint8Array()).digest("hex")).toBe(
      enPaquete?.sha256 ?? "",
    );

    // Y una pasada entera de la cola no deja nada pendiente ni vuelve a llamar a nadie.
    const resultado = await pasadaDeCola(herramientas(), WORKER);
    expect(resultado.enviados).toBe(0);
  }, 600_000);

  afterAll(async () => {
    if (ajustesPrevios) {
      const claves = [
        "asistenteActivo",
        "montajeActivo",
        "cuotaMb",
        "presupuestoCreditos",
        "presupuestoTrabajo",
        "avisoCreditos",
        "trabajosSimultaneos",
        "escenasEnVuelo",
        "revisionToleranciaDuracion",
        "revisionSegundosPlanosMaximos",
        "revisionExigirAudio",
        "revisionMultimodalActiva",
        "exportacionMaximoDiario",
        "exportacionTamanoMaximoMb",
      ] as const;
      const previos = ajustesPrevios;
      await guardarAjustes(Object.fromEntries(claves.map((c) => [c, previos[c]])), null);
    }
    if (modeloPrevio) {
      await db().update(models).set(modeloPrevio).where(eq(models.modelId, MODELO_TEXTO));
      olvidarCatalogo();
    }
    olvidarAjustes();
    if (ana) await ana.borrar();
    if (carpeta !== "") await rm(carpeta, { recursive: true, force: true });
    globalThis.fetch = fetchOriginal;
  });
});
