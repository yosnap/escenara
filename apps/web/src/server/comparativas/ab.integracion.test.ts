import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { ComparativaVista, PeticionAB, PreparacionAB } from "@/lib/comparativas";
import type { ProyectoDetalle } from "@/lib/proyectos";

/**
 * Comparativa A/B con contenido nuevo, contra el PostgreSQL y el almacenamiento locales. **Ningún test llama a KIE**:
 * el proveedor se simula con un `fetch` propio que cuenta cada tarea creada, la descarga también y la clave es inventada.
 *
 * - la confirmación exige el número de ejecuciones y el coste exactos: sin ellos no se encola nada;
 * - como mucho dos alternativas, en la escena elegida, cada una un trabajo normal con su reserva: las dos o ninguna;
 * - una sola comparativa (y ningún otro clip) en marcha por escena; repetir el envío no encola nada más;
 * - los errores dicen la causa y si se cobró; lo que se cancela a medias lo termina el barrido;
 * - los resultados no tocan la escena hasta elegir ganadora, y la ganadora queda en la escena;
 * - nadie ve la comparativa de otro (404).
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_comparativas");
}

const { eq } = await import("drizzle-orm");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaEscenas = await import("@/app/api/proyectos/[id]/escenas/route");
const rutaPlan = await import("@/app/api/proyectos/[id]/plan/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const rutaComparativaEscena = await import("@/app/api/escenas/[id]/comparativa/route");
const rutaComparativa = await import("@/app/api/comparativas/[id]/route");
const rutaGanadora = await import("@/app/api/comparativas/[id]/ganadora/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { comparisons, generationJobs, projects, rateLimits, scenes, usageLedger, users } = await import("../db/esquema");
const { crearMedio } = await import("../media/servicio");
const { olvidarSaldos } = await import("../generacion/estimacion");
const { consultarTrabajo } = await import("../generacion/seguimiento");
const { depositoDe } = await import("../presupuesto/deposito");
const { estadoDeProduccion, ultimoTrabajoDeEscena } = await import("../produccion/consulta");
const { aprobarFotograma, producirEscena } = await import("../produccion/producir");
const { estimarAB, elegirGanadora, verComparativa } = await import("./ab");
const { barrerLanzamientosColgados, lanzarAB } = await import("./lanzamiento");
const { comprometidoDelProyecto } = await import("../asistente/plan");
const { autorizarReintentos } = await import("../produccion/producir");
const { enviarEncolados } = await import("../cola/pasada");
const { cancelarTrabajo } = await import("../cola/cancelar");
const { encolarAnimacion } = await import("../produccion/producir");
const { escenaPropia } = await import("../asistente/consulta");
const { models } = await import("../db/esquema");
const { olvidarCatalogo } = await import("../proveedores/catalogo");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type PersonajeVista = import("@/lib/personajes").PersonajeVista;
type ErrorConEstado = { estado: number; message: string };

const CLAVE = "sk-comparativas-clave-de-kie-inventada-ffff";
const MODELOS = ["veo3_fast", "veo3_lite"] as const;

// ── Proveedor simulado ─────────────────────────────────────────────────────────────────────────────────────

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const tareas = new Map<string, { state: string; urls?: string[]; creditos?: number }>();
let siguienteTarea = 0;
/** Tareas creadas en el proveedor: cada una es algo que se habría cobrado de verdad. */
let tareasCreadas = 0;

const buscar: Buscador = async (url) => {
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

function bytes(datos: Uint8Array): Uint8Array<ArrayBuffer> {
  const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
  copia.set(datos);
  return copia;
}

const MP4 = bytes(new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom"), ...new Uint8Array(64)]));
const png = async () =>
  bytes(
    await sharp({ create: { width: 64, height: 64, channels: 3, background: "#3d6bff" } })
      .png()
      .toBuffer(),
  );
const fotoDeReferencia = async () =>
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

async function intentar<T>(accion: () => Promise<T>) {
  try {
    return { ok: true as const, datos: await accion() };
  } catch (error) {
    const fallo = error as ErrorConEstado;
    return { ok: false as const, estado: fallo.estado ?? 500, error: fallo.message };
  }
}

describe.skipIf(!hayBaseDeDatos)("comparativa A/B de una escena", () => {
  let ana: Sesion;
  let beto: Sesion;
  let actor: Actor;
  let personajeId: string;
  let proyectoId: string;
  let escenaId: string;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;

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

  async function nuevoPersonaje(): Promise<PersonajeVista> {
    const creado = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", { nombre: "Lucía", tipo: "persona" }),
      undefined,
    );
    const personaje = (await creado.json()) as PersonajeVista;
    const referencias = await Promise.all(
      Array.from({ length: 3 }, async (_, i) => ({
        medioId: (
          await crearMedio(actor, new File([await fotoDeReferencia()], `lucia-${i}.png`, { type: "image/png" }))
        ).id,
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

  async function nuevoProyectoAprobado(): Promise<string> {
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

  const confirmacionDeProduccion = async (tipo: "fotograma" | "clip") => {
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

  const trabajosDe = (id: string) => db().select().from(generationJobs).where(eq(generationJobs.sceneId, id));
  const filaDeEscena = async (id: string) => {
    const [fila] = await db().select().from(scenes).where(eq(scenes.id, id)).limit(1);
    if (!fila) throw new Error("La escena ha desaparecido.");
    return fila;
  };

  async function terminar(trabajoId: string, estado: "success" | "fail", url = "https://res.kie.ai/clip.mp4") {
    const taskId = `ab_enviado_${++siguienteTarea}`;
    await db()
      .update(generationJobs)
      .set({ state: "enviado", stage: "enviado", taskId, sentAt: new Date() })
      .where(eq(generationJobs.id, trabajoId));
    tareas.set(taskId, { state: estado, ...(estado === "success" ? { urls: [url] } : {}), creditos: 12 });
    await consultarTrabajo(actor, trabajoId, { forzar: true }, h);
  }

  /** Lleva la escena a producida: fotograma aprobado y un clip terminado. */
  async function escenaProducida() {
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
  async function escenaSinClip() {
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
  async function encolarAlternativa(
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
  async function peticion(cambios: Partial<PeticionAB> = {}): Promise<PeticionAB> {
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

  test("sin fotograma aprobado no se puede comparar, y se dice qué hacer", async () => {
    const r = await rutaComparativaEscena.GET(pedir(ana, `/api/escenas/${escenaId}/comparativa`), ctx(escenaId));
    const { preparacion } = (await r.json()) as { preparacion: PreparacionAB };
    expect(preparacion.impedimentos.join(" ")).toContain("fotograma aprobado");
    expect(preparacion.disponibles.map((d) => d.modelo)).toEqual(expect.arrayContaining([...MODELOS]));
    const intento = await intentar(async () => lanzarAB(actor, escenaId, await peticion(), h));
    expect(!intento.ok && intento.estado).toBe(409);
    expect(!intento.ok && intento.error).toContain("No se ha encolado nada");
    expect(await trabajosDe(escenaId)).toHaveLength(0);
    expect(tareasCreadas).toBe(0);
  });

  test("la estimación dice cuántas ejecuciones y cuánto, y no gasta nada", async () => {
    await escenaProducida();
    const antes = { trabajos: (await trabajosDe(escenaId)).length, tareas: tareasCreadas };
    const e = await estimarAB(actor, escenaId, [...MODELOS]);
    expect(e.ejecuciones).toBe(2);
    expect(e.creditosTotales).toBe(e.alternativas.reduce((s, a) => s + a.creditos, 0));
    for (const a of e.alternativas) {
      expect(a.creditos).toBeGreaterThan(0);
      expect(a.sello).not.toBe("");
      expect(a.impedimento).toBeNull();
    }
    expect((await trabajosDe(escenaId)).length).toBe(antes.trabajos);
    expect(tareasCreadas).toBe(antes.tareas);
  });

  test("sin confirmar el número exacto de ejecuciones o el coste total no se encola nada", async () => {
    await escenaProducida();
    const antes = { trabajos: (await trabajosDe(escenaId)).length, reservado: (await depositoDe(ana.id)).reservado };
    for (const cambios of [
      { ejecucionesConfirmadas: 1 },
      { ejecucionesConfirmadas: 3 },
      { creditosTotalesConfirmados: 1 },
    ]) {
      const r = await intentar(async () => lanzarAB(actor, escenaId, await peticion(cambios), h));
      expect(!r.ok && r.estado).toBe(409);
      expect(!r.ok && r.error).toContain("No se ha encolado nada");
    }
    // Un precio que ya no es el que se vio tampoco sale.
    const base = await peticion();
    const caducado = {
      ...base,
      alternativas: base.alternativas.map((a, i) => (i === 1 ? { ...a, sello: "kie:veo3_lite:viejo@v0" } : a)),
    };
    const r = await intentar(() => lanzarAB(actor, escenaId, caducado, h));
    expect(!r.ok && r.error).toContain("ha cambiado");
    // Sin la casilla de derechos, la puerta de siempre lo frena y no queda ninguna comparativa a medias.
    const sinDerechos = await intentar(async () => lanzarAB(actor, escenaId, await peticion({ derechos: false }), h));
    expect(sinDerechos.ok).toBe(false);
    expect(!sinDerechos.ok && sinDerechos.error).toContain("no se ha encolado ninguna");
    expect((await trabajosDe(escenaId)).length).toBe(antes.trabajos);
    expect((await depositoDe(ana.id)).reservado).toBe(antes.reservado);
    // Ninguna comparativa lanzada: como mucho, una marcada como no lanzada.
    const lanzadas = await db().select().from(comparisons).where(eq(comparisons.userId, ana.id));
    expect(lanzadas.filter((c) => c.launchedAt !== null)).toHaveLength(0);
    expect(tareasCreadas).toBe(0);
  });

  test("como mucho dos alternativas, y no el mismo modelo dos veces", async () => {
    await escenaProducida();
    const base = await peticion();
    const tres = await rutaComparativaEscena.POST(
      pedir(ana, `/api/escenas/${escenaId}/comparativa`, "POST", {
        ...base,
        alternativas: [...base.alternativas, { modelo: "kling/v3-turbo-image-to-video", creditos: 10, sello: "x" }],
        ejecucionesConfirmadas: 3,
      }),
      ctx(escenaId),
    );
    expect(tres.status).toBe(400);
    expect(((await tres.json()) as { error: string }).error).toContain("como mucho 2");
    const repetido = await rutaComparativaEscena.POST(
      pedir(ana, `/api/escenas/${escenaId}/comparativa`, "POST", {
        ...base,
        alternativas: [base.alternativas[0], base.alternativas[0]],
      }),
      ctx(escenaId),
    );
    expect(repetido.status).toBe(400);
  });

  test("confirmada, encola dos trabajos normales con su reserva y no toca la escena", async () => {
    const antes = await escenaProducida();
    const reservadoAntes = (await depositoDe(ana.id)).reservado;
    const p = await peticion();
    const vista = await lanzarAB(actor, escenaId, p, h);
    expect(vista.ejecucionesPrevistas).toBe(2);
    expect(vista.ejecucionesReales).toBe(2);
    expect(vista.creditosEstimados).toBe(p.creditosTotalesConfirmados);
    const alternativas = (await trabajosDe(escenaId)).filter((t) =>
      vista.alternativas.some((a) => a.trabajoId === t.id),
    );
    expect(alternativas.map((t) => t.model).sort()).toEqual([...MODELOS].sort());
    expect(alternativas.every((t) => t.kind === "animacion" && t.reservationId !== null)).toBe(true);
    // La reserva es la de siempre: lo confirmado, apartado en el presupuesto.
    expect((await depositoDe(ana.id)).reservado - reservadoAntes).toBe(p.creditosTotalesConfirmados);
    // La escena sigue con su clip, y la producción sigue viendo el suyo como el último.
    const despues = await filaDeEscena(escenaId);
    expect(despues.clipJobId).toBe(antes.clipJobId);
    expect((await ultimoTrabajoDeEscena(escenaId, "animacion"))?.id).toBe(antes.clipJobId as string);
    expect((await estadoDeProduccion(actor, proyectoId)).escenas[0]?.comparativaEnMarcha).toBe(true);

    // El worker las envía como cualquier clip: su revalidación antes de subir nada tampoco las confunde con el clip
    // de la escena.
    expect(await enviarEncolados(h)).toBe(2);
    expect(tareasCreadas).toBe(2);

    // El doble envío devuelve la misma comparativa y no encola nada más.
    const otra = await lanzarAB(actor, escenaId, p, h);
    expect(otra.id).toBe(vista.id);
    expect((await trabajosDe(escenaId)).length).toBe(alternativas.length + 2);
    expect(await db().select().from(comparisons).where(eq(comparisons.userId, ana.id))).toHaveLength(1);
  });

  test("los resultados se ven lado a lado sin tocar la escena, y la ganadora queda en ella", async () => {
    const antes = await escenaProducida();
    const vista = await lanzarAB(actor, escenaId, await peticion(), h);
    const [a, b] = vista.alternativas;
    if (!a?.trabajoId || !b?.trabajoId) throw new Error("Faltan las alternativas.");
    await terminar(a.trabajoId, "success");
    await terminar(b.trabajoId, "fail");

    const escena = await filaDeEscena(escenaId);
    expect(escena.clipJobId).toBe(antes.clipJobId);
    // El fallo de una alternativa no es un fallo del clip de la escena.
    expect(escena.lastFailureReason).toBe("");

    const leida = await verComparativa(actor, vista.id);
    expect(leida.terminada).toBe(true);
    const [lista, fallida] = leida.alternativas;
    expect(lista?.estado).toBe("listo");
    expect(lista?.medio?.url).toBeTruthy();
    expect(fallida?.estado).toBe("fallido");
    expect(fallida?.error).not.toBe("");
    // Falló después de hablar con el proveedor: puede haberse cobrado, y se dice.
    expect(fallida?.pudoCobrarse).toBe(true);

    const noLista = await intentar(() => elegirGanadora(actor, vista.id, b.trabajoId));
    expect(!noLista.ok && noLista.estado).toBe(409);

    const elegida = await elegirGanadora(actor, vista.id, a.trabajoId);
    expect(elegida.ganadorId).toBe(a.trabajoId);
    expect(elegida.alternativas[0]?.elegida).toBe(true);
    const final = await filaDeEscena(escenaId);
    expect(final.clipJobId).toBe(a.trabajoId);
    expect(final.state).toBe("producida");
  });

  test("todo o nada: si la segunda no cabe en el techo del proyecto, no se encola ninguna ni se cobra nada", async () => {
    await escenaProducida();
    const p = await peticion();
    const primera = p.alternativas[0]?.creditos ?? 0;
    // Solo cabe una: el techo del proyecto deja sitio para la primera y no para la segunda.
    await db()
      .update(projects)
      .set({ authorizedCredits: Math.ceil((await comprometidoDelProyecto(proyectoId)) + primera) })
      .where(eq(projects.id, proyectoId));
    const reservadoAntes = (await depositoDe(ana.id)).reservado;
    const antes = new Set((await trabajosDe(escenaId)).map((t) => t.id));
    const trabajosAntes = antes.size;
    const r = await intentar(() => lanzarAB(actor, escenaId, p, h));
    expect(!r.ok && r.estado).toBe(409);
    expect(!r.ok && r.error).toContain("no caben");
    expect(!r.ok && r.error).toMatch(/no se ha cobrado nada/i);
    // La que sí cabía se encoló y se canceló sin salir: su reserva vuelve y el worker no envía nada.
    const nuevos = (await trabajosDe(escenaId)).filter((t) => !antes.has(t.id));
    expect(nuevos).toHaveLength(1);
    expect(nuevos.every((t) => t.state === "cancelado")).toBe(true);
    expect((await depositoDe(ana.id)).reservado).toBe(reservadoAntes);
    expect(await enviarEncolados(h)).toBe(0);
    expect(tareasCreadas).toBe(0);
    // Repetir la misma confirmación no encola la que faltaba: hay que confirmar otra vez.
    const repetida = await intentar(() => lanzarAB(actor, escenaId, p, h));
    expect(!repetida.ok && repetida.error).toContain("ya se intentó");
    expect((await trabajosDe(escenaId)).filter((t) => t.state !== "cancelado")).toHaveLength(trabajosAntes);
  });

  test("mientras no están encoladas todas, el worker no toma ninguna; una colgada se cancela sin cobro", async () => {
    await escenaProducida();
    const reservadoAntes = (await depositoDe(ana.id)).reservado;
    const vista = await lanzarAB(actor, escenaId, await peticion(), h);
    // Como si el lanzamiento se hubiera quedado a medias hace rato.
    await db()
      .update(comparisons)
      .set({ launchedAt: null, createdAt: new Date(Date.now() - 3600_000) })
      .where(eq(comparisons.id, vista.id));
    expect(await enviarEncolados(h)).toBe(0);
    expect(await barrerLanzamientosColgados()).toBe(1);
    const alternativas = await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id));
    expect(
      alternativas.filter((t) => vista.alternativas.some((a) => a.trabajoId === t.id)).map((t) => t.state),
    ).toEqual(["cancelado", "cancelado"]);
    expect((await depositoDe(ana.id)).reservado).toBe(reservadoAntes);
    expect(tareasCreadas).toBe(0);
  });

  test("dos comparativas a la vez en la misma escena: sale una y la otra se rechaza con su causa", async () => {
    await escenaProducida();
    const [a, b] = await Promise.all([peticion(), peticion()]);
    const resultados = await Promise.all([
      intentar(() => lanzarAB(actor, escenaId, a, h)),
      intentar(() => lanzarAB(actor, escenaId, b, h)),
    ]);
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    const rechazo = resultados.find((r) => !r.ok);
    expect(rechazo && !rechazo.ok && rechazo.estado).toBe(409);
    expect(rechazo && !rechazo.ok && rechazo.error).toMatch(/Ya hay una comparación|no se ha encolado ninguna/);
    const activas = (await trabajosDe(escenaId)).filter((t) => ["en_cola", "esperando_limite"].includes(t.state));
    expect(activas).toHaveLength(2);
    expect(await enviarEncolados(h)).toBe(2);
  });

  test("tras un fallo con posible cobro, la comparativa consume un reintento autorizado por alternativa", async () => {
    await escenaProducida();
    // Último clip de la escena fallido después de hablar con el proveedor.
    await db().insert(generationJobs).values({
      userId: ana.id,
      kind: "animacion",
      provider: "kie",
      model: "veo3_fast",
      prompt: "x",
      input: {},
      sceneId: escenaId,
      state: "fallido",
      failureReason: "contenido",
      errorMessage: "El proveedor lo rechazó.",
      estimatedCredits: 60,
      finishedAt: new Date(),
    });
    // La pantalla lo dice antes de confirmar.
    const r = await rutaComparativaEscena.GET(pedir(ana, `/api/escenas/${escenaId}/comparativa`), ctx(escenaId));
    const { preparacion } = (await r.json()) as { preparacion: PreparacionAB };
    expect(preparacion.impedimentos.join(" ")).toContain("reintento autorizado");
    const sin = await intentar(async () => lanzarAB(actor, escenaId, await peticion(), h));
    expect(!sin.ok && sin.error).toContain("reintento");
    await autorizarReintentos(actor, escenaId, 1);
    const uno = await intentar(async () => lanzarAB(actor, escenaId, await peticion(), h));
    expect(!uno.ok && uno.error).toContain("autoriza al menos 1 más");
    await autorizarReintentos(actor, escenaId, 2);
    const vista = await lanzarAB(actor, escenaId, await peticion(), h);
    expect(vista.ejecucionesReales).toBe(2);
    expect((await filaDeEscena(escenaId)).retriesUsed).toBe(2);
  });

  test("se puede elegir una alternativa terminada aunque la otra siga en marcha", async () => {
    await escenaProducida();
    const vista = await lanzarAB(actor, escenaId, await peticion(), h);
    const [a] = vista.alternativas;
    if (!a?.trabajoId) throw new Error("Falta la alternativa.");
    await terminar(a.trabajoId, "success");
    const elegida = await elegirGanadora(actor, vista.id, a.trabajoId);
    expect(elegida.ganadorId).toBe(a.trabajoId);
    expect((await filaDeEscena(escenaId)).clipJobId).toBe(a.trabajoId);
  });

  test("una cancelación a medias la termina el barrido: reserva devuelta y la escena, libre", async () => {
    await escenaProducida();
    const reservadoAntes = (await depositoDe(ana.id)).reservado;
    const vista = await lanzarAB(actor, escenaId, await peticion(), h);
    // Como si la cancelación hubiera puesto su marca y se hubiera interrumpido antes de cancelar los trabajos.
    await db()
      .update(comparisons)
      .set({ launchedAt: null, cancelledAt: new Date() })
      .where(eq(comparisons.id, vista.id));
    expect(await enviarEncolados(h)).toBe(0);
    expect(await barrerLanzamientosColgados()).toBe(1);
    const estados = (await trabajosDe(escenaId))
      .filter((t) => vista.alternativas.some((a) => a.trabajoId === t.id))
      .map((t) => t.state);
    expect(estados).toEqual(["cancelado", "cancelado"]);
    expect((await depositoDe(ana.id)).reservado).toBe(reservadoAntes);
    // Nada más que barrer, y la escena admite otra comparativa.
    expect(await barrerLanzamientosColgados()).toBe(0);
    expect((await lanzarAB(actor, escenaId, await peticion(), h)).ejecucionesReales).toBe(2);
    expect(tareasCreadas).toBe(0);
  });

  test("una alternativa de una comparativa ya cancelada no se encola nunca (barrido entre la primera y la segunda)", async () => {
    await escenaProducida();
    const p = await peticion();
    const vista = await lanzarAB(actor, escenaId, p, h);
    const [fila] = await db().select().from(comparisons).where(eq(comparisons.id, vista.id));
    const segunda = fila?.alternatives[1];
    const trabajoSegunda = vista.alternativas[1]?.trabajoId;
    if (!fila || !segunda || !trabajoSegunda) throw new Error("Falta la segunda alternativa.");
    // Estado del reloj: la primera encolada, el barrido la canceló y la segunda todavía no existe.
    await cancelarTrabajo(ana.id, trabajoSegunda);
    await db().delete(generationJobs).where(eq(generationJobs.id, trabajoSegunda));
    await db()
      .update(comparisons)
      .set({ launchedAt: null, cancelledAt: new Date() })
      .where(eq(comparisons.id, vista.id));
    const intento = await intentar(() => encolarAlternativa(p, segunda));
    expect(!intento.ok && intento.estado).toBe(409);
    expect(!intento.ok && intento.error).toContain("ya se canceló");
    expect((await trabajosDe(escenaId)).some((t) => t.idempotencyKey === segunda.clave)).toBe(false);
  });

  test("un clip normal y una comparativa a la vez en una escena sin clip: nunca salen tres", async () => {
    await escenaSinClip();
    const [ab, normal] = await Promise.all([
      intentar(async () => lanzarAB(actor, escenaId, await peticion(), h)),
      intentar(async () => aprobarFotograma(actor, escenaId, await confirmacionDeProduccion("clip"), h)),
    ]);
    const activos = (await trabajosDe(escenaId)).filter(
      (t) => t.kind === "animacion" && ["en_cola", "esperando_limite"].includes(t.state),
    );
    // O la comparativa (2) o el clip normal (1), nunca las dos cosas.
    expect(ab.ok && normal.ok).toBe(false);
    expect(activos.length).toBe(ab.ok ? 2 : 1);
    const rechazo = ab.ok ? normal : ab;
    expect(!rechazo.ok && rechazo.error).toMatch(/comparativa|comparación|en marcha/);
  });

  test("la cola decide aunque el orden sea el peor: comparativa guardada y clip normal, o clip normal y alternativa", async () => {
    await escenaSinClip();
    const p = await peticion();
    const estimacion = await estimarAB(actor, escenaId, [...MODELOS]);
    const alternativas = estimacion.alternativas.map((a) => ({
      modelo: a.modelo,
      nombre: a.nombre,
      proveedor: a.nombreProveedor,
      segundos: a.segundos,
      creditos: a.creditos,
      sello: a.sello,
      clave: crypto.randomUUID(),
    }));
    // 1) Una comparativa guardada sin lanzar: el clip normal no entra.
    const [guardada] = await db()
      .insert(comparisons)
      .values({
        userId: ana.id,
        projectId: proyectoId,
        sceneId: escenaId,
        idempotencyKey: p.claveIdempotencia,
        alternatives: alternativas,
        plannedRuns: 2,
        estimatedCredits: p.creditosTotalesConfirmados,
      })
      .returning();
    const normal = await intentar(async () =>
      aprobarFotograma(actor, escenaId, await confirmacionDeProduccion("clip"), h),
    );
    expect(!normal.ok && normal.error).toContain("comparativa lanzándose");
    // 2) Con un clip normal en marcha, una alternativa no entra.
    await db()
      .delete(comparisons)
      .where(eq(comparisons.id, guardada?.id as string));
    await aprobarFotograma(actor, escenaId, await confirmacionDeProduccion("clip"), h);
    await db().insert(comparisons).values({
      userId: ana.id,
      projectId: proyectoId,
      sceneId: escenaId,
      idempotencyKey: crypto.randomUUID(),
      alternatives: alternativas,
      plannedRuns: 2,
      estimatedCredits: p.creditosTotalesConfirmados,
    });
    const primera = alternativas[0];
    if (!primera) throw new Error("Falta la alternativa.");
    const alternativa = await intentar(() => encolarAlternativa(p, primera));
    expect(!alternativa.ok && alternativa.error).toContain("Ya hay una comparación o un clip en marcha");
  });

  test("un modelo sin duraciones declaradas no se puede comparar generando", async () => {
    await escenaProducida();
    const [fila] = await db().select().from(models).where(eq(models.modelId, MODELOS[1]));
    if (!fila) throw new Error("Falta el modelo.");
    const parametros = JSON.parse(fila.parameters) as Record<string, unknown>;
    await db()
      .update(models)
      .set({ parameters: JSON.stringify({ ...parametros, duraciones: [] }) })
      .where(eq(models.id, fila.id));
    olvidarCatalogo();
    try {
      const e = await estimarAB(actor, escenaId, [...MODELOS]);
      expect(e.alternativas[1]?.impedimento).toContain("no declara duraciones");
    } finally {
      await db().update(models).set({ parameters: fila.parameters }).where(eq(models.id, fila.id));
      olvidarCatalogo();
    }
  });

  test("nadie ve ni elige en la comparativa de otro: 404 sin revelar nada", async () => {
    await escenaProducida();
    const vista = await lanzarAB(actor, escenaId, await peticion(), h);
    const deOtro = await rutaComparativa.GET(pedir(beto, `/api/comparativas/${vista.id}`), ctx(vista.id));
    expect(deOtro.status).toBe(404);
    const escenaAjena = await rutaComparativaEscena.GET(
      pedir(beto, `/api/escenas/${escenaId}/comparativa`),
      ctx(escenaId),
    );
    expect(escenaAjena.status).toBe(404);
    const estimacionAjena = await rutaComparativaEscena.GET(
      pedir(beto, `/api/escenas/${escenaId}/comparativa?modelos=${MODELOS.join(",")}`),
      ctx(escenaId),
    );
    expect(estimacionAjena.status).toBe(404);
    const ganadora = await rutaGanadora.POST(
      pedir(beto, `/api/comparativas/${vista.id}/ganadora`, "POST", { trabajoId: vista.alternativas[0]?.trabajoId }),
      ctx(vista.id),
    );
    expect(ganadora.status).toBe(404);
    const lanzarAjena = await rutaComparativaEscena.POST(
      pedir(beto, `/api/escenas/${escenaId}/comparativa`, "POST", await peticion()),
      ctx(escenaId),
    );
    expect(lanzarAjena.status).toBe(404);
    const propia = (await (
      await rutaComparativa.GET(pedir(ana, `/api/comparativas/${vista.id}`), ctx(vista.id))
    ).json()) as ComparativaVista;
    expect(propia.id).toBe(vista.id);
  });
});
