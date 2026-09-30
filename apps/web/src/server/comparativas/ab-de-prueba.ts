import { afterAll, beforeAll, beforeEach, expect } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { PeticionAB } from "@/lib/comparativas";
import type { ProyectoDetalle } from "@/lib/proyectos";

/**
 * Entorno compartido de los tests de la comparativa A/B (`ab.integracion.test.ts` y `lanzamiento.integracion.test.ts`)
 * contra el PostgreSQL y el almacenamiento locales. **Ningún test llama a KIE**: el proveedor se simula con un `fetch`
 * propio que cuenta cada tarea creada, la descarga también y la clave es inventada.
 *
 * Los `let` exportados son enlaces vivos: cada fichero llama a {@link registrarEntornoAB} dentro de su `describe`, y sus
 * tests leen la sesión, el proyecto y la escena del momento.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

export const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_comparativas");
}

export const { eq } = await import("drizzle-orm");
export const rutaProyectos = await import("@/app/api/proyectos/route");
export const rutaEscenas = await import("@/app/api/proyectos/[id]/escenas/route");
export const rutaPlan = await import("@/app/api/proyectos/[id]/plan/route");
export const rutaPersonajes = await import("@/app/api/personajes/route");
export const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
export const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
export const rutaComparativaEscena = await import("@/app/api/escenas/[id]/comparativa/route");
export const rutaComparativa = await import("@/app/api/comparativas/[id]/route");
export const rutaGanadora = await import("@/app/api/comparativas/[id]/ganadora/route");
export const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
export const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
export const { guardarAjustes, leerAjustes } = await import("../ajustes");
export const { guardarCredencial } = await import("../boveda/credenciales");
export const { aplicarMigraciones } = await import("../db/migrar");
export const { db } = await import("../db/cliente");
export const { comparisons, generationJobs, projects, rateLimits, scenes, usageLedger, users } = await import(
  "../db/esquema"
);
export const { crearMedio } = await import("../media/servicio");
export const { olvidarSaldos } = await import("../generacion/estimacion");
export const { consultarTrabajo } = await import("../generacion/seguimiento");
export const { depositoDe } = await import("../presupuesto/deposito");
export const { estadoDeProduccion, ultimoTrabajoDeEscena } = await import("../produccion/consulta");
export const { aprobarFotograma, producirEscena } = await import("../produccion/producir");
export const { estimarAB, elegirGanadora, verComparativa } = await import("./ab");
export const { barrerLanzamientosColgados, lanzarAB } = await import("./lanzamiento");
export const { comprometidoDelProyecto } = await import("../asistente/plan");
export const { autorizarReintentos } = await import("../produccion/producir");
export const { enviarEncolados } = await import("../cola/pasada");
export const { cancelarTrabajo } = await import("../cola/cancelar");
export const { encolarAnimacion } = await import("../produccion/producir");
export const { escenaPropia } = await import("../asistente/consulta");
export const { models } = await import("../db/esquema");
export const { olvidarCatalogo } = await import("../proveedores/catalogo");

export type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
export type Actor = import("../media/servicio").Actor;
export type Buscador = import("../proveedores/codigos").Buscador;
export type Herramientas = import("../generacion/herramientas").Herramientas;
export type PersonajeVista = import("@/lib/personajes").PersonajeVista;
export type ErrorConEstado = { estado: number; message: string };

export const CLAVE = "sk-comparativas-clave-de-kie-inventada-ffff";
export const MODELOS = ["veo3_fast", "veo3_lite"] as const;

// ── Proveedor simulado ─────────────────────────────────────────────────────────────────────────────────────

export const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

export const tareas = new Map<string, { state: string; urls?: string[]; creditos?: number }>();
export let siguienteTarea = 0;
/** Tareas creadas en el proveedor: cada una es algo que se habría cobrado de verdad. */
export let tareasCreadas = 0;

export const buscar: Buscador = async (url) => {
  if (url.includes("/chat/credit")) return sobre(1_000_000);
  if (url.includes("file-stream-upload")) return sobre({ downloadUrl: "https://tempfile.kie.ai/referencia.png" });
  if (url.includes("createTask")) {
    tareasCreadas++;
    const taskId = `ab_${++siguienteTarea}`;
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

export function bytes(datos: Uint8Array): Uint8Array<ArrayBuffer> {
  const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
  copia.set(datos);
  return copia;
}

export const MP4 = bytes(
  new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom"), ...new Uint8Array(64)]),
);
export const png = async () =>
  bytes(
    await sharp({ create: { width: 64, height: 64, channels: 3, background: "#3d6bff" } })
      .png()
      .toBuffer(),
  );
export const fotoDeReferencia = async () =>
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

export const descargar: Herramientas["descargar"] = async (url) => {
  const esVideo = url.endsWith(".mp4");
  return {
    archivo: new File([esVideo ? MP4 : await png()], esVideo ? "clip.mp4" : "fotograma.png", {
      type: esVideo ? "video/mp4" : "image/png",
    }),
    origen: url,
  };
};
export const h: Herramientas = { buscar, descargar };

// ── Utilidades ─────────────────────────────────────────────────────────────────────────────────────────────

export const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
export const pedir = (s: Sesion, url: string, metodo = "GET", cuerpo?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: metodo,
    headers: {
      cookie: s.cookie,
      ...(metodo === "GET" ? {} : { origin: "http://localhost", "Content-Type": "application/json" }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

export async function intentar<T>(accion: () => Promise<T>) {
  try {
    return { ok: true as const, datos: await accion() };
  } catch (error) {
    const fallo = error as ErrorConEstado;
    return { ok: false as const, estado: fallo.estado ?? 500, error: fallo.message };
  }
}

export let ana: Sesion;
export let beto: Sesion;
export let actor: Actor;
export let personajeId: string;
export let proyectoId: string;
export let escenaId: string;
export let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;

export async function nuevoPersonaje(): Promise<PersonajeVista> {
  const creado = await rutaPersonajes.POST(
    pedir(ana, "/api/personajes", "POST", { nombre: "Lucía", tipo: "persona" }),
    undefined,
  );
  const personaje = (await creado.json()) as PersonajeVista;
  const referencias = await Promise.all(
    Array.from({ length: 3 }, async (_, i) => ({
      medioId: (await crearMedio(actor, new File([await fotoDeReferencia()], `lucia-${i}.png`, { type: "image/png" })))
        .id,
    })),
  );
  await rutaReferencias.POST(
    pedir(ana, `/api/personajes/${personaje.id}/referencias`, "POST", { referencias }),
    ctx(personaje.id),
  );
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

export async function nuevoProyectoAprobado(): Promise<string> {
  const creado = await rutaProyectos.POST(
    pedir(ana, "/api/proyectos", "POST", {
      titulo: "Mañana tranquila",
      formato: "reel_vertical",
      idea: "Un momento de una mañana tranquila en casa.",
      personajeId,
      presupuestoCreditos: 100_000,
    }),
    undefined,
  );
  const id = ((await creado.json()) as ProyectoDetalle).proyecto.id;
  await rutaEscenas.POST(
    pedir(ana, `/api/proyectos/${id}/escenas`, "POST", {
      texto: "Buenos días, empieza el día.",
      accion: "Plano medio junto a la ventana, sonríe a cámara con luz suave",
      segundos: 4,
    }),
    ctx(id),
  );
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

export const confirmacionDeProduccion = async (tipo: "fotograma" | "clip") => {
  const estado = await estadoDeProduccion(actor, proyectoId);
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

export const trabajosDe = (id: string) => db().select().from(generationJobs).where(eq(generationJobs.sceneId, id));
export const filaDeEscena = async (id: string) => {
  const [fila] = await db().select().from(scenes).where(eq(scenes.id, id)).limit(1);
  if (!fila) throw new Error("La escena ha desaparecido.");
  return fila;
};

export async function terminar(trabajoId: string, estado: "success" | "fail", url = "https://res.kie.ai/clip.mp4") {
  const taskId = `ab_enviado_${++siguienteTarea}`;
  await db()
    .update(generationJobs)
    .set({ state: "enviado", stage: "enviado", taskId, sentAt: new Date() })
    .where(eq(generationJobs.id, trabajoId));
  tareas.set(taskId, { state: estado, ...(estado === "success" ? { urls: [url] } : {}), creditos: 12 });
  await consultarTrabajo(actor, trabajoId, { forzar: true }, h);
}

/** Lleva la escena a producida: fotograma aprobado y un clip terminado. */
export async function escenaProducida() {
  await producirEscena(actor, escenaId, await confirmacionDeProduccion("fotograma"), h);
  const [fotograma] = await trabajosDe(escenaId);
  if (!fotograma) throw new Error("Falta el fotograma.");
  await terminar(fotograma.id, "success", "https://res.kie.ai/fotograma.png");
  await aprobarFotograma(actor, escenaId, await confirmacionDeProduccion("clip"), h);
  const clip = (await trabajosDe(escenaId)).find((t) => t.kind === "animacion");
  if (!clip) throw new Error("Falta el clip.");
  await terminar(clip.id, "success");
  const fila = await filaDeEscena(escenaId);
  expect(fila.clipJobId).toBe(clip.id);
  return fila;
}

/** Escena con su fotograma aprobado y sin clip: el clip que encargó la aprobación se cancela antes de salir. */
export async function escenaSinClip() {
  await producirEscena(actor, escenaId, await confirmacionDeProduccion("fotograma"), h);
  const [fotograma] = await trabajosDe(escenaId);
  if (!fotograma) throw new Error("Falta el fotograma.");
  await terminar(fotograma.id, "success", "https://res.kie.ai/fotograma.png");
  await aprobarFotograma(actor, escenaId, await confirmacionDeProduccion("clip"), h);
  const clip = (await trabajosDe(escenaId)).find((t) => t.kind === "animacion");
  if (!clip) throw new Error("Falta el clip.");
  await cancelarTrabajo(ana.id, clip.id);
}

/** Encola a mano una alternativa por el camino normal, como lo haría el lanzamiento. */
export async function encolarAlternativa(
  p: PeticionAB,
  a: { creditos: number; sello: string; modelo: string; clave: string },
) {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  return encolarAnimacion(
    actor,
    escena,
    proyecto,
    { trabajoPadreId: escena.approvedFrameJobId as string },
    {
      derechos: true,
      sinTerceros: true,
      creditosConfirmados: a.creditos,
      selloEstimacion: a.sello,
      claveIdempotencia: p.claveIdempotencia,
      avisoUmbralAceptado: true,
      avisosConfirmados: p.avisosConfirmados,
      modelo: a.modelo,
    },
    a.clave,
    h,
  );
}

/** La confirmación que manda el navegador con la estimación vigente. */
export async function peticion(cambios: Partial<PeticionAB> = {}): Promise<PeticionAB> {
  const estimacion = await estimarAB(actor, escenaId, [...MODELOS]);
  const estado = await estadoDeProduccion(actor, proyectoId);
  return {
    alternativas: estimacion.alternativas.map((a) => ({ modelo: a.modelo, creditos: a.creditos, sello: a.sello })),
    ejecucionesConfirmadas: estimacion.ejecuciones,
    creditosTotalesConfirmados: estimacion.creditosTotales,
    derechos: true,
    derechoMarca: false,
    sinTerceros: true,
    avisoUmbralAceptado: true,
    avisosConfirmados: [
      ...estado.controlesDelModelo.comprobaciones,
      ...(estado.escenas[0]?.controles.comprobaciones ?? []),
    ]
      .filter((c) => c.confirmable)
      .map((c) => c.regla),
    claveIdempotencia: crypto.randomUUID(),
    ...cambios,
  };
}

/** Prepara el entorno dentro del `describe` de quien llama: usuarios, credencial, personaje y un proyecto por test. */
export function registrarEntornoAB(): void {
  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_comparativas");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    beto = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    personajeId = (await nuevoPersonaje()).id;
    await guardarAjustes({ presupuestoCreditos: 0, presupuestoTrabajo: 0, trabajosSimultaneos: 20 }, null);
  });

  afterAll(async () => {
    for (const s of [ana, beto]) if (s?.email) await db().delete(users).where(eq(users.email, s.email));
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
    tareasCreadas = 0;
    exigirBaseDeDatosDePrueba("escenara_pruebas_comparativas");
    await guardarAjustes({ escenasEnVuelo: 3 }, null);
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(usageLedger).where(eq(usageLedger.userId, ana.id));
    await db().delete(projects).where(eq(projects.userId, ana.id));
    await db().delete(rateLimits);
    proyectoId = await nuevoProyectoAprobado();
    escenaId = (await estadoDeProduccion(actor, proyectoId)).escenas[0]?.id ?? "";
  });
}
