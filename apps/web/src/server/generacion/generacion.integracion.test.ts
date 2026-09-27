import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { TrabajoVista } from "@/lib/generacion";

/**
 * Flujo de generación contra el PostgreSQL y el SeaweedFS locales (`bun run services:up`).
 *
 * **Ningún test llama a KIE**: cada llamada de verdad gasta créditos del propietario. El proveedor se
 * simula con un `fetch` propio y la descarga del resultado también, así que tampoco sale nada a internet.
 * La clave que se usa es inventada.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

// Base de datos aparte: estos tests crean trabajos y medios, y el registro de precios llega sembrado por
// la migración.
const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_generacion");
}

const { and, eq, inArray } = await import("drizzle-orm");
const rutaTrabajos = await import("@/app/api/generacion/trabajos/route");
const rutaTrabajo = await import("@/app/api/generacion/trabajos/[id]/route");
const rutaConsultar = await import("@/app/api/generacion/trabajos/[id]/consultar/route");
const rutaEstimacion = await import("@/app/api/generacion/estimacion/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, media, providerCredentials, users } = await import("../db/esquema");
const { guardarCredencial } = await import("../boveda/credenciales");
const { guardarAjustes } = await import("../ajustes");
const { dentroDelLimite } = await import("../limite");
const { crearMedio } = await import("../media/servicio");
const { estimar, olvidarSaldos } = await import("./estimacion");
const { crearAnimacion, crearFotograma } = await import("./servicio");
const { consultarTrabajo, reconciliar } = await import("./seguimiento");
const { enviarEncolados, pasadaDeCola } = await import("../cola/pasada");
const { pendientesDeConsulta } = await import("../cola/pendientes");
const { listarTrabajos, obtenerTrabajo } = await import("./trabajos");
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("./herramientas").Herramientas;
type Actor = import("../media/servicio").Actor;
type PeticionFotograma = import("./servicio").PeticionFotograma;

const CLAVE_ANA = "sk-ana-clave-de-kie-inventada-aaaa";
const CLAVE_BETO = "sk-beto-clave-de-kie-inventada-bbbb";
const CLAVE_CARLA = "sk-carla-clave-de-kie-inventada-cccc";
const CLAVES = [CLAVE_ANA, CLAVE_BETO, CLAVE_CARLA];
const ESCENA = "En una cafetería luminosa, saluda a cámara con una sonrisa.";

/** Proveedor simulado: responde por URL y cuenta cada tipo de llamada. */
interface Kie {
  saldo: number;
  /** Estado que devolverá la próxima consulta de cada tarea. */
  tareas: Map<string, { state: string; urls?: string[]; creditos?: number }>;
  llamadas: { credito: number; subida: number; crearTarea: number; consulta: number; descargas: number };
  /** Nombre del error con el que falla la próxima consulta (para simular un timeout). */
  falloConsulta: string | null;
}

let kie: Kie;
let siguienteTarea = 0;

function nuevoKie(): Kie {
  return {
    saldo: 500,
    tareas: new Map(),
    llamadas: { credito: 0, subida: 0, crearTarea: 0, consulta: 0, descargas: 0 },
    falloConsulta: null,
  };
}

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url, opciones) => {
  if (url.includes("/chat/credit")) {
    kie.llamadas.credito++;
    return sobre(kie.saldo);
  }
  if (url.includes("file-stream-upload")) {
    kie.llamadas.subida++;
    return sobre({ downloadUrl: "https://tempfile.kie.ai/referencia.png" });
  }
  if (url.includes("createTask")) {
    kie.llamadas.crearTarea++;
    const taskId = `task_${++siguienteTarea}`;
    kie.tareas.set(taskId, { state: "waiting" });
    // El cuerpo enviado nunca lleva la clave: viaja solo en la cabecera.
    expect(String(opciones.body)).not.toContain(CLAVE_ANA);
    return sobre({ taskId });
  }
  if (url.includes("recordInfo")) {
    kie.llamadas.consulta++;
    if (kie.falloConsulta) {
      const error = new Error("simulado");
      error.name = kie.falloConsulta;
      throw error;
    }
    const taskId = new URL(url).searchParams.get("taskId") ?? "";
    const tarea = kie.tareas.get(taskId) ?? { state: "waiting" };
    // Tarea marcada para que su consulta falle con un error del proveedor (clave rechazada).
    if (tarea.state === "rechaza") {
      return new Response(JSON.stringify({ code: 401, msg: "unauthorized" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return sobre({
      state: tarea.state,
      resultJson: tarea.urls ? JSON.stringify({ resultUrls: tarea.urls }) : undefined,
      creditsConsumed: tarea.creditos,
      failMsg: tarea.state === "fail" ? `fallo con la clave ${CLAVE_ANA}` : "",
    });
  }
  throw new Error(`URL no simulada: ${url}`);
};

/** Copia los bytes a un búfer propio: es lo que admite `File` sin discutir de tipos. */
function bytes(datos: Uint8Array): Uint8Array<ArrayBuffer> {
  const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
  copia.set(datos);
  return copia;
}

/** Cabecera mínima de un MP4 (`ftypisom`): basta para que la detección por firma lo acepte. */
const MP4 = bytes(new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom"), ...new Uint8Array(64)]));

async function png(color = "#3d6bff"): Promise<Uint8Array<ArrayBuffer>> {
  return bytes(
    await sharp({ create: { width: 64, height: 64, channels: 3, background: color } })
      .png()
      .toBuffer(),
  );
}

/** Descarga simulada del resultado: nunca sale a internet. */
const descargar: Herramientas["descargar"] = async (url) => {
  kie.llamadas.descargas++;
  const esVideo = url.endsWith(".mp4");
  return {
    archivo: new File([esVideo ? MP4 : await png("#ff5a5f")], esVideo ? "clip.mp4" : "fotograma.png", {
      type: esVideo ? "video/mp4" : "image/png",
    }),
    origen: url,
  };
};

const h: Herramientas = { buscar, descargar };

/** Deja la tarea lista con su resultado, como haría el proveedor al terminar. */
function terminar(taskId: string, urls: string[], creditos: number) {
  kie.tareas.set(taskId, { state: "success", urls, creditos });
}

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const pedir = (s: Sesion, url: string, init: RequestInit = {}) =>
  new Request(`http://localhost${url}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), cookie: s.cookie },
  });

/** Igual, pero desde la propia aplicación: las rutas que gastan exigen `Origin` del mismo sitio. */
const pedirDesdeLaApp = (s: Sesion, url: string, init: RequestInit = {}) =>
  pedir(s, url, { ...init, headers: { ...(init.headers as Record<string, string>), origin: "http://localhost" } });

/** Ejecuta algo capturando lo que se escriba en consola (para comprobar que no aparece la clave). */
async function conConsola<T>(accion: () => Promise<T>): Promise<{ valor: T; salida: string }> {
  const original = { log: console.log, warn: console.warn, error: console.error };
  const partes: string[] = [];
  const espia =
    (real: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      partes.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a))).join(" "));
      real(...args);
    };
  console.log = espia(original.log);
  console.warn = espia(original.warn);
  console.error = espia(original.error);
  try {
    return { valor: await accion(), salida: partes.join("\n") };
  } finally {
    Object.assign(console, original);
  }
}

describe.skipIf(!hayBaseDeDatos)("generación con la clave del usuario", () => {
  let ana: Sesion;
  let beto: Sesion;
  /** Solo para el test del ritmo de envíos: agota su propio contador sin afectar a los demás. */
  let carla: Sesion;
  let actorAna: Actor;
  let actorBeto: Actor;
  let actorCarla: Actor;
  let referencia: string;
  let referenciaBeto: string;
  let referenciaCarla: string;

  beforeAll(async () => {
    await aplicarMigraciones();
    [ana, beto, carla] = await Promise.all([
      crearSesionDePrueba("user"),
      crearSesionDePrueba("user"),
      crearSesionDePrueba("user"),
    ]);
    actorAna = { id: ana.id, esAdmin: false };
    actorBeto = { id: beto.id, esAdmin: false };
    actorCarla = { id: carla.id, esAdmin: false };
    kie = nuevoKie();
    await guardarCredencial(ana.id, "kie", CLAVE_ANA, buscar);
    await guardarCredencial(beto.id, "kie", CLAVE_BETO, buscar);
    await guardarCredencial(carla.id, "kie", CLAVE_CARLA, buscar);
    referencia = (await crearMedio(actorAna, new File([await png()], "ana.png", { type: "image/png" }))).id;
    referenciaBeto = (await crearMedio(actorBeto, new File([await png()], "beto.png", { type: "image/png" }))).id;
    referenciaCarla = (await crearMedio(actorCarla, new File([await png()], "carla.png", { type: "image/png" }))).id;
  });

  afterAll(async () => {
    for (const correo of [ana?.email, beto?.email, carla?.email]) {
      if (correo) await db().delete(users).where(eq(users.email, correo));
    }
  });

  // La suite no depende del orden: cada test empieza con el proveedor recién simulado y sin saldo cacheado.
  beforeEach(() => {
    kie = nuevoKie();
    olvidarSaldos();
  });

  /** Confirmación de un fotograma; cada llamada estrena clave, como un usuario que confirma de nuevo. */
  const peticion = (creditos: number, extra: Record<string, unknown> = {}) => ({
    medioId: referencia,
    prompt: ESCENA,
    creditosConfirmados: creditos,
    derechos: true,
    claveIdempotencia: crypto.randomUUID(),
    ...extra,
  });

  /**
   * Encola el fotograma y deja que la cola lo envíe, que es lo que hace el worker en producción. Los tests de
   * 0.10.0 esperaban que `crearFotograma` enviara en línea; desde 0.12.0 esa capa solo encola (ADR-0003), así
   * que el envío se provoca aquí y las expectativas de esos tests siguen siendo las mismas.
   */
  const crearFoto = async (actor: Actor, p: PeticionFotograma) => {
    const { trabajo } = await crearFotograma(actor, p, h);
    await enviarEncolados(h);
    return obtenerTrabajo(actor.id, trabajo.id);
  };

  /** Igual para el clip: encolar y dejar que la cola lo envíe. */
  const crearClip = async (actor: Actor, p: Parameters<typeof crearAnimacion>[1]) => {
    const { trabajo } = await crearAnimacion(actor, p, h);
    await enviarEncolados(h);
    return obtenerTrabajo(actor.id, trabajo.id);
  };

  /**
   * Borra la marca de la última consulta: es la forma de simular que ha pasado el tiempo, porque el
   * servidor guarda un mínimo (y un suelo para las consultas que pide el usuario) entre consultas.
   */
  const permitirConsulta = (id: string) =>
    db().update(generationJobs).set({ polledAt: null }).where(eq(generationJobs.id, id));

  /** Consulta forzada como la del botón «Volver a consultar», sin esperar el suelo. */
  const consultarYa = async (actor: Actor, id: string) => {
    await permitirConsulta(id);
    return reconciliar(actor, id, h);
  };

  /**
   * Inserta directamente un trabajo «atascado» (enviado hace rato y sin terminar). Se hace por debajo del
   * servicio a propósito: así se puede simular una cola sucia sin tropezar con el tope de simultáneos.
   */
  const insertarAtascado = async (
    usuarioId: string,
    { minutosDeEdad, consultadoHaceMs }: { minutosDeEdad: number; consultadoHaceMs: number | null },
  ): Promise<string> => {
    const [fila] = await db()
      .insert(generationJobs)
      .values({
        userId: usuarioId,
        kind: "fotograma",
        provider: "kie",
        model: "nano-banana-2-lite",
        prompt: ESCENA,
        input: {},
        estimatedCredits: 4,
        state: "enviado",
        taskId: `atascada_${crypto.randomUUID()}`,
        createdAt: new Date(Date.now() - minutosDeEdad * 60_000),
        sentAt: new Date(Date.now() - minutosDeEdad * 60_000),
        polledAt: consultadoHaceMs === null ? null : new Date(Date.now() - consultadoHaceMs),
      })
      .returning({ id: generationJobs.id });
    return fila?.id as string;
  };

  /** Cierra los trabajos que sigan en marcha: el tope de simultáneos no se hereda entre tests. */
  const cerrarEnCurso = (usuarioId: string) =>
    db()
      .update(generationJobs)
      .set({ state: "fallido", finishedAt: new Date(), errorMessage: "cerrado por el test" })
      .where(
        and(
          eq(generationJobs.userId, usuarioId),
          inArray(generationJobs.state, ["en_cola", "preparando", "enviado", "en_curso"]),
        ),
      );

  const enCursoDe = async (usuarioId: string) =>
    (
      await db()
        .select({ id: generationJobs.id })
        .from(generationJobs)
        .where(
          and(
            eq(generationJobs.userId, usuarioId),
            inArray(generationJobs.state, ["en_cola", "preparando", "enviado", "en_curso"]),
          ),
        )
    ).length;

  describe("nada se envía sin confirmación, credencial y saldo", () => {
    test("la estimación viene del registro de precios y del saldo del usuario", async () => {
      const estimacion = await estimar(ana.id, "fotograma", buscar);
      expect(estimacion.creditos).toBe(4);
      expect(estimacion.saldo).toBe(500);
      expect(estimacion.alcanza).toBe(true);
      expect(estimacion.superaUmbral).toBe(false);
      expect((await estimar(ana.id, "animacion", buscar)).creditos).toBe(60);
      // El saldo se cachea: la segunda estimación no vuelve a preguntárselo al proveedor.
      expect(kie.llamadas.credito).toBe(1);
    });

    test("sin la casilla de derechos no se llama al proveedor", async () => {
      const error = await crearFotograma(actorAna, { ...peticion(4), derechos: false }, h).catch((e) => e);
      expect(error.estado).toBe(400);
      expect(kie.llamadas).toMatchObject({ crearTarea: 0, subida: 0, credito: 0 });
    });

    test("con un coste confirmado distinto del real no se llama al proveedor", async () => {
      const error = await crearFotograma(actorAna, peticion(1), h).catch((e) => e);
      expect(error.estado).toBe(409);
      expect(error.message).toContain("4 créditos");
      expect(kie.llamadas).toMatchObject({ crearTarea: 0, subida: 0, credito: 0 });
    });

    test("sin confirmación ninguna no se llama al proveedor", async () => {
      const error = await crearFotograma(
        actorAna,
        { ...peticion(4), creditosConfirmados: undefined as unknown as number },
        h,
      ).catch((e) => e);
      expect(error.estado).toBe(400);
      expect(kie.llamadas.crearTarea).toBe(0);
    });

    test("sin clave de confirmación válida no se llama al proveedor", async () => {
      for (const clave of [undefined, "", "no-es-un-uuid"]) {
        const error = await crearFotograma(actorAna, { ...peticion(4), claveIdempotencia: clave as string }, h).catch(
          (e) => e,
        );
        expect(error.estado).toBe(400);
      }
      expect(kie.llamadas.crearTarea).toBe(0);
    });

    test("un identificador de imagen que no es un UUID se rechaza sin consultar nada", async () => {
      const error = await crearFotograma(actorAna, { ...peticion(4), medioId: "'; drop table media; --" }, h).catch(
        (e) => e,
      );
      expect(error.estado).toBe(400);
      expect(kie.llamadas.crearTarea).toBe(0);
    });

    test("sin credencial utilizable no se llama al proveedor", async () => {
      const sinClave = await crearSesionDePrueba("user");
      const error = await crearFotograma({ id: sinClave.id, esAdmin: false }, peticion(4), h).catch((e) => e);
      expect(error.estado).toBe(409);
      expect(error.message).toContain("«Tu cuenta»");
      expect(kie.llamadas).toMatchObject({ crearTarea: 0, subida: 0 });
      await db().delete(users).where(eq(users.email, sinClave.email));
    });

    test("una credencial marcada como no válida no sirve para gastar", async () => {
      await db()
        .update(providerCredentials)
        .set({ status: "invalida" })
        .where(and(eq(providerCredentials.userId, ana.id), eq(providerCredentials.provider, "kie")));
      const error = await crearFotograma(actorAna, peticion(4), h).catch((e) => e);
      expect(error.estado).toBe(409);
      expect(error.message).toContain("no válida");
      expect(kie.llamadas.crearTarea).toBe(0);
      await db()
        .update(providerCredentials)
        .set({ status: "valida" })
        .where(and(eq(providerCredentials.userId, ana.id), eq(providerCredentials.provider, "kie")));
    });

    test("sin saldo suficiente no se crea la tarea", async () => {
      kie.saldo = 1;
      const error = await crearFotograma(actorAna, peticion(4), h).catch((e) => e);
      expect(error.estado).toBe(402);
      expect(kie.llamadas.crearTarea).toBe(0);
    });

    test("una imagen ajena no se puede usar como referencia", async () => {
      const error = await crearFotograma(actorBeto, peticion(4), h).catch((e) => e);
      expect(error.estado).toBe(404);
      expect(kie.llamadas.crearTarea).toBe(0);
    });

    test("sin espacio en la biblioteca no se genera (la cuota se comprueba antes de gastar)", async () => {
      await guardarAjustes({ cuotaMb: 1 }, null);
      try {
        const error = await crearFotograma(actorAna, peticion(4), h).catch((e) => e);
        expect(error.estado).toBe(413);
        expect(error.message).toContain("libres en la biblioteca");
        expect(kie.llamadas.crearTarea).toBe(0);
      } finally {
        await guardarAjustes({ cuotaMb: 2048 }, null);
      }
    });

    test("por encima del umbral de aviso hace falta aceptarlo expresamente", async () => {
      await guardarAjustes({ avisoCreditos: 1 }, null);
      try {
        expect((await estimar(ana.id, "fotograma", buscar)).superaUmbral).toBe(true);
        const error = await crearFotograma(actorAna, peticion(4), h).catch((e) => e);
        expect(error.estado).toBe(400);
        expect(error.message).toContain("aviso de 1 créditos");
        expect(kie.llamadas.crearTarea).toBe(0);
        const trabajo = await crearFoto(actorAna, peticion(4, { avisoUmbralAceptado: true }));
        expect(trabajo.estado).toBe("enviado");
      } finally {
        await guardarAjustes({ avisoCreditos: 200 }, null);
        await cerrarEnCurso(ana.id);
      }
    });

    test("pasado el ritmo de envíos por usuario no se crea nada más", async () => {
      // Se agota el contador del usuario (la misma clave que usa el servicio) y luego se intenta generar.
      for (let i = 0; i < 40; i++) {
        await dentroDelLimite(`generacion:envio:${carla.id}`, { ventanaSegundos: 3600, maximo: 40 });
      }
      const error = await crearFotograma(
        actorCarla,
        { ...peticion(4), medioId: referenciaCarla, claveIdempotencia: crypto.randomUUID() },
        h,
      ).catch((e) => e);
      expect(error.estado).toBe(429);
      expect(kie.llamadas.crearTarea).toBe(0);
    });
  });

  describe("una confirmación no se cobra dos veces", () => {
    test("repetir la misma clave devuelve el trabajo que ya existe", async () => {
      await cerrarEnCurso(ana.id);
      const confirmacion = peticion(4);
      const primero = await crearFotograma(actorAna, confirmacion, h);
      const segundo = await crearFotograma(actorAna, confirmacion, h);
      expect(primero.nueva).toBe(true);
      expect(segundo.nueva).toBe(false);
      expect(segundo.trabajo.id).toBe(primero.trabajo.id);
      // La cola solo tiene un trabajo, así que solo crea una tarea en el proveedor.
      await enviarEncolados(h);
      expect(kie.llamadas.crearTarea).toBe(1);
      const filas = await db()
        .select({ id: generationJobs.id })
        .from(generationJobs)
        .where(eq(generationJobs.idempotencyKey, confirmacion.claveIdempotencia));
      expect(filas).toHaveLength(1);
      await cerrarEnCurso(ana.id);
    });

    test("dos envíos a la vez con la misma clave crean un solo trabajo y una sola tarea", async () => {
      await cerrarEnCurso(ana.id);
      const confirmacion = peticion(4);
      const [uno, otro] = await Promise.all([
        crearFotograma(actorAna, confirmacion, h),
        crearFotograma(actorAna, confirmacion, h),
      ]);
      expect(uno.trabajo.id).toBe(otro.trabajo.id);
      expect([uno.nueva, otro.nueva].filter(Boolean)).toHaveLength(1);
      await enviarEncolados(h);
      expect(kie.llamadas.crearTarea).toBe(1);
      const filas = await db()
        .select({ id: generationJobs.id })
        .from(generationJobs)
        .where(eq(generationJobs.idempotencyKey, confirmacion.claveIdempotencia));
      expect(filas).toHaveLength(1);
      await cerrarEnCurso(ana.id);
    });

    test("el tope de trabajos en curso aguanta varios envíos simultáneos", async () => {
      await cerrarEnCurso(ana.id);
      const intentos = await Promise.all(
        Array.from({ length: 5 }, () =>
          crearFotograma(actorAna, peticion(4), h)
            .then(() => "ok" as const)
            .catch((e) => e.estado as number),
        ),
      );
      expect(intentos.filter((r) => r === "ok")).toHaveLength(3);
      expect(intentos.filter((r) => r === 429)).toHaveLength(2);
      await enviarEncolados(h);
      expect(kie.llamadas.crearTarea).toBe(3);
      expect(await enCursoDe(ana.id)).toBe(3);
      await cerrarEnCurso(ana.id);
    });
  });

  describe("fotograma y clip de principio a fin", () => {
    let fotograma: TrabajoVista;

    beforeAll(async () => {
      await cerrarEnCurso(ana.id);
    });

    test("el fotograma se envía y queda en cola en el proveedor", async () => {
      fotograma = await crearFoto(actorAna, peticion(4));
      expect(fotograma.estado).toBe("enviado");
      expect(fotograma.taskId).toStartWith("task_");
      expect(fotograma.derechosConfirmados).toBe(true);
      expect(kie.llamadas).toMatchObject({ subida: 1, crearTarea: 1 });
    });

    test("el estado mostrado es el del proveedor", async () => {
      kie.tareas.set(fotograma.taskId as string, { state: "generating" });
      const enCurso = await consultarYa(actorAna, fotograma.id);
      expect(enCurso.estado).toBe("en_curso");
      expect(enCurso.estadoProveedor).toBe("generating");
    });

    test("un estado larguísimo del proveedor se guarda recortado", async () => {
      kie.tareas.set(fotograma.taskId as string, { state: "generating".padEnd(500, "!") });
      const enCurso = await consultarYa(actorAna, fotograma.id);
      expect(enCurso.estado).toBe("desconocido");
      expect(enCurso.estadoProveedor?.length).toBe(64);
      // Se vuelve a dejar en un estado normal para el resto del recorrido.
      kie.tareas.set(fotograma.taskId as string, { state: "generating" });
      expect((await consultarYa(actorAna, fotograma.id)).estado).toBe("en_curso");
    });

    test("el mínimo entre consultas evita preguntar al proveedor en cada sondeo", async () => {
      const antes = kie.llamadas.consulta;
      await consultarTrabajo(actorAna, fotograma.id, {}, h);
      expect(kie.llamadas.consulta).toBe(antes);
    });

    test("el suelo entre consultas también frena las que pide el usuario", async () => {
      const antes = kie.llamadas.consulta;
      await reconciliar(actorAna, fotograma.id, h);
      expect(kie.llamadas.consulta).toBe(antes);
    });

    test("al estar listo, el resultado se guarda en la biblioteca con los créditos del proveedor", async () => {
      terminar(fotograma.taskId as string, ["https://tempfile.kie.ai/r.png"], 4);
      fotograma = await consultarYa(actorAna, fotograma.id);
      expect(fotograma.estado).toBe("listo");
      expect(fotograma.creditosConsumidos).toBe(4);
      expect(fotograma.error).toBeNull();
      expect(fotograma.medio?.tipo).toBe("imagen");
      expect(kie.llamadas.descargas).toBe(1);
    });

    test("un trabajo terminado no vuelve a consultarse ni a descargarse", async () => {
      const igual = await consultarYa(actorAna, fotograma.id);
      expect(igual.medio?.id).toBe(fotograma.medio?.id);
      expect(kie.llamadas).toMatchObject({ consulta: 0, descargas: 0 });
    });

    test("el clip de 4 s sale del fotograma y también se guarda", async () => {
      const animacion = await crearClip(actorAna, {
        trabajoPadreId: fotograma.id,
        prompt: "se mueve un poco",
        creditosConfirmados: 60,
        derechos: true,
        claveIdempotencia: crypto.randomUUID(),
      });
      expect(animacion.estado).toBe("enviado");
      expect(animacion.trabajoPadreId).toBe(fotograma.id);
      terminar(animacion.taskId as string, ["https://tempfile.kie.ai/r.mp4"], 60);
      const listo = await consultarYa(actorAna, animacion.id);
      expect(listo.estado).toBe("listo");
      expect(listo.medio?.tipo).toBe("video");
      expect(listo.creditosConsumidos).toBe(60);
      expect(listo.modelo).toBe("veo3_lite");
    });

    test("el historial reúne los trabajos listos con su medio", async () => {
      const historial = await listarTrabajos(ana.id);
      const listos = historial.filter((t) => t.estado === "listo");
      expect(listos.length).toBeGreaterThanOrEqual(2);
      expect(listos.every((t) => t.medio !== null)).toBe(true);
    });
  });

  describe("un timeout no reenvía nada", () => {
    let trabajo: TrabajoVista;

    beforeAll(async () => {
      await cerrarEnCurso(ana.id);
    });

    /**
     * Desde 0.12.0 un fallo de la consulta **no cambia el estado del trabajo**: lo que ha fallado es nuestra
     * pregunta, no la tarea, que sigue donde estaba. Antes esto lo dejaba `desconocido`, así que un corte de red
     * de unos segundos mandaba a revisión (reteniendo su reserva) un trabajo que estaba generando bien.
     */
    test("la consulta que no contesta deja el trabajo como estaba y no reenvía nada", async () => {
      trabajo = await crearFoto(actorAna, peticion(4));
      kie.falloConsulta = "TimeoutError";
      const error = await consultarYa(actorAna, trabajo.id).catch((e) => e);
      expect(error.estado).toBe(502);
      const tras = await obtenerTrabajo(ana.id, trabajo.id);
      expect(tras.estado).toBe("enviado");
      expect(tras.taskId).toBe(trabajo.taskId);
      // Lo importante: solo se ha creado la tarea del envío, no una segunda.
      expect(kie.llamadas.crearTarea).toBe(1);
      kie.falloConsulta = null;
    });

    test("el mínimo entre consultas se respeta aunque la anterior fallara", async () => {
      // El intento fallido ha dejado su marca de última consulta, así que el sondeo normal no insiste.
      const igual = await consultarTrabajo(actorAna, trabajo.id, {}, h);
      expect(igual.estado).toBe("enviado");
      expect(kie.llamadas.consulta).toBe(0);
    });

    test("la reconciliación con el task_id guardado recupera el resultado y los créditos", async () => {
      terminar(trabajo.taskId as string, ["https://tempfile.kie.ai/r2.png"], 4);
      const recuperado = await consultarYa(actorAna, trabajo.id);
      expect(recuperado.estado).toBe("listo");
      expect(recuperado.creditosConsumidos).toBe(4);
      expect(recuperado.medio).not.toBeNull();
      // Recuperar el resultado no crea ninguna tarea: solo se consulta la que ya existía.
      expect(kie.llamadas.crearTarea).toBe(0);
    });
  });

  test("dos consultas simultáneas no duplican la descarga ni crean dos medios", async () => {
    await cerrarEnCurso(ana.id);
    const trabajo = await crearFoto(actorAna, peticion(4));
    terminar(trabajo.taskId as string, ["https://tempfile.kie.ai/simultanea.png"], 4);
    await permitirConsulta(trabajo.id);
    const [uno, otro] = await Promise.all([reconciliar(actorAna, trabajo.id, h), reconciliar(actorAna, trabajo.id, h)]);
    expect(uno.medio?.id).toBe(otro.medio?.id as string);
    expect(kie.llamadas.descargas).toBe(1);
    const guardados = await db()
      .select({ id: media.id })
      .from(media)
      .where(eq(media.sourceUrl, "https://tempfile.kie.ai/simultanea.png"));
    expect(guardados).toHaveLength(1);
  });

  describe("autorización entre usuarios", () => {
    let deAna: TrabajoVista;

    beforeAll(async () => {
      await cerrarEnCurso(ana.id);
      deAna = await crearFoto(actorAna, peticion(4));
    });

    test("otro usuario no ve el trabajo ni en el historial ni por su identificador", async () => {
      expect(await listarTrabajos(beto.id)).toHaveLength(0);
      const respuesta = await rutaTrabajo.GET(pedir(beto, `/api/generacion/trabajos/${deAna.id}`), ctx(deAna.id));
      expect(respuesta.status).toBe(404);
    });

    test("otro usuario no puede reconciliarlo", async () => {
      const respuesta = await rutaConsultar.POST(
        pedirDesdeLaApp(beto, `/api/generacion/trabajos/${deAna.id}/consultar`, { method: "POST" }),
        ctx(deAna.id),
      );
      expect(respuesta.status).toBe(404);
      expect(await reconciliar(actorBeto, deAna.id, h).catch((e) => e.estado)).toBe(404);
    });

    test("otro usuario no puede animar un fotograma ajeno", async () => {
      const error = await crearAnimacion(
        actorBeto,
        {
          trabajoPadreId: deAna.id,
          prompt: ESCENA,
          creditosConfirmados: 60,
          derechos: true,
          claveIdempotencia: crypto.randomUUID(),
        },
        h,
      ).catch((e) => e);
      expect(error.estado).toBe(404);
    });

    test("sin sesión no se accede a nada", async () => {
      const sinSesion = new Request(`http://localhost/api/generacion/trabajos/${deAna.id}`);
      expect((await rutaTrabajo.GET(sinSesion, ctx(deAna.id))).status).toBe(401);
      expect((await rutaTrabajos.GET(new Request("http://localhost/api/generacion/trabajos"), undefined)).status).toBe(
        401,
      );
    });

    test("una petición de otro sitio no puede gastar con tu sesión", async () => {
      const ajena = pedir(ana, `/api/generacion/trabajos/${deAna.id}/consultar`, {
        method: "POST",
        headers: { origin: "https://sitio-ajeno.example" },
      });
      expect((await rutaConsultar.POST(ajena, ctx(deAna.id))).status).toBe(403);
      const sinOrigen = pedir(ana, "/api/generacion/trabajos", { method: "POST", body: "{}" });
      expect((await rutaTrabajos.POST(sinOrigen, undefined)).status).toBe(403);
    });
  });

  describe("los trabajos terminan sin nadie en la página", () => {
    beforeAll(async () => {
      await cerrarEnCurso(ana.id);
      await cerrarEnCurso(beto.id);
    });

    test("una pasada del seguimiento deja listo un trabajo enviado y lo guarda en la biblioteca", async () => {
      const trabajo = await crearFoto(actorAna, peticion(4));
      terminar(trabajo.taskId as string, ["https://tempfile.kie.ai/de-fondo.png"], 4);
      // Nadie ha abierto la página: el trabajo solo tiene la marca del envío.
      await permitirConsulta(trabajo.id);
      expect((await pendientesDeConsulta()).some((p) => p.id === trabajo.id)).toBe(true);

      expect((await pasadaDeCola(h)).avanzados).toBeGreaterThanOrEqual(1);

      const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo.id));
      expect(fila?.state).toBe("listo");
      expect(fila?.resultMediaId).not.toBeNull();
      expect(fila?.consumedCredits).toBe(4);
      // Y ya no queda pendiente de consultar.
      expect((await pendientesDeConsulta()).some((p) => p.id === trabajo.id)).toBe(false);
    });

    test("un trabajo que falla al consultarse no impide avanzar los demás", async () => {
      await cerrarEnCurso(ana.id);
      const roto = await crearFoto(actorAna, peticion(4));
      const bueno = await crearFoto(actorAna, peticion(4));
      // El proveedor rechazará la consulta del primero y dará por terminado el segundo.
      kie.tareas.set(roto.taskId as string, { state: "rechaza" });
      terminar(bueno.taskId as string, ["https://tempfile.kie.ai/el-bueno.png"], 4);
      await permitirConsulta(roto.id);
      await permitirConsulta(bueno.id);

      const { avanzados } = await pasadaDeCola(h);

      expect(avanzados).toBe(1);
      const [filaRota] = await db().select().from(generationJobs).where(eq(generationJobs.id, roto.id));
      const [filaBuena] = await db().select().from(generationJobs).where(eq(generationJobs.id, bueno.id));
      // El que falla no cambia de estado (ni se da por listo ni se reenvía); el otro termina.
      expect(filaRota?.state).toBe("enviado");
      expect(filaBuena?.state).toBe("listo");
      expect(filaBuena?.resultMediaId).not.toBeNull();
      await cerrarEnCurso(ana.id);
    });

    test("el trabajo termina sin que su dueño abra nada: lo cierra la cola", async () => {
      await cerrarEnCurso(ana.id);
      await cerrarEnCurso(beto.id);
      const deAna = await crearFoto(actorAna, peticion(4));
      terminar(deAna.taskId as string, ["https://tempfile.kie.ai/historial.png"], 4);
      await permitirConsulta(deAna.id);

      // Nadie consulta desde el navegador: es la pasada de la cola la que lo remata.
      await pasadaDeCola(h);

      const [avanzado] = await db().select().from(generationJobs).where(eq(generationJobs.id, deAna.id));
      expect(avanzado?.state).toBe("listo");
      expect(avanzado?.resultMediaId).not.toBeNull();
    });

    test("los trabajos recién enviados no esperan detrás de los atascados, y los muy viejos se cierran", async () => {
      await cerrarEnCurso(ana.id);
      // Primero el nuevo (si no, los atascados llenarían el tope de trabajos en curso).
      const nuevo = await crearFoto(actorAna, peticion(4));
      terminar(nuevo.taskId as string, ["https://tempfile.kie.ai/el-nuevo.png"], 4);
      const atascados = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          insertarAtascado(ana.id, { minutosDeEdad: 45 + i, consultadoHaceMs: 60_000 }),
        ),
      );

      // El nuevo (sin consultar nunca) va primero: `nulls first`.
      const pendientes = await pendientesDeConsulta();
      expect(pendientes[0]?.id).toBe(nuevo.id);

      await pasadaDeCola(h);

      const [filaNueva] = await db().select().from(generationJobs).where(eq(generationJobs.id, nuevo.id));
      expect(filaNueva?.state).toBe("listo");
      expect(filaNueva?.resultMediaId).not.toBeNull();
      // Los viejos salen del automático como «sin respuesta», sin reenviar nada.
      const viejos = await db()
        .select({ estado: generationJobs.state, error: generationJobs.errorMessage })
        .from(generationJobs)
        .where(inArray(generationJobs.id, atascados));
      const desconocidos = viejos.filter((v) => v.estado === "desconocido");
      expect(desconocidos.length).toBeGreaterThanOrEqual(1);
      expect(desconocidos[0]?.error).toContain("No se reenviará");
      await cerrarEnCurso(ana.id);
    });

    test("un trabajo cuyo dueño no tiene credencial válida se salta sin llamar al proveedor", async () => {
      await cerrarEnCurso(ana.id);
      await cerrarEnCurso(beto.id);
      const deBeto = await crearFoto(actorBeto, {
        ...peticion(4),
        medioId: referenciaBeto,
        claveIdempotencia: crypto.randomUUID(),
      });
      terminar(deBeto.taskId as string, ["https://tempfile.kie.ai/de-beto.png"], 4);
      await permitirConsulta(deBeto.id);
      await db()
        .update(providerCredentials)
        .set({ status: "invalida" })
        .where(and(eq(providerCredentials.userId, beto.id), eq(providerCredentials.provider, "kie")));
      const consultasAntes = kie.llamadas.consulta;

      const { avanzados } = await pasadaDeCola(h);

      expect(avanzados).toBe(0);
      expect(kie.llamadas.consulta).toBe(consultasAntes);
      const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.id, deBeto.id));
      expect(fila?.state).toBe("enviado");
      await db()
        .update(providerCredentials)
        .set({ status: "valida" })
        .where(and(eq(providerCredentials.userId, beto.id), eq(providerCredentials.provider, "kie")));
      await cerrarEnCurso(beto.id);
    });

    test("el que nunca se ha consultado va primero en el lote, aunque sea de otra persona", async () => {
      await cerrarEnCurso(ana.id);
      await cerrarEnCurso(beto.id);
      // Cuatro trabajos más antiguos, ya consultados: no pueden comerse el lote.
      await Promise.all(
        Array.from({ length: 4 }, (_, i) =>
          insertarAtascado(ana.id, { minutosDeEdad: 5 + i, consultadoHaceMs: 90_000 }),
        ),
      );
      const deBeto = await crearFoto(actorBeto, {
        ...peticion(4),
        medioId: referenciaBeto,
        claveIdempotencia: crypto.randomUUID(),
      });
      terminar(deBeto.taskId as string, ["https://tempfile.kie.ai/solo-beto.png"], 4);
      await permitirConsulta(deBeto.id);

      expect((await pendientesDeConsulta(3))[0]).toEqual({ id: deBeto.id, usuarioId: beto.id });
      await pasadaDeCola(h);

      const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.id, deBeto.id));
      expect(fila?.state).toBe("listo");
      await cerrarEnCurso(ana.id);
      await cerrarEnCurso(beto.id);
    });

    /**
     * Desde 0.12.0 un envío que nunca llegó al proveedor se cierra como `fallido` soltando su reserva, no como
     * `desconocido`: retener presupuesto por algo que no se envió no tiene sentido. Y ya no sale en el sondeo
     * (`pendientesDeConsulta`), porque no hay nada que consultarle a nadie: lo cierra la cola por su camino.
     */
    test("un envío que nunca llegó a tener tarea se cierra sin coste y sin llamar al proveedor", async () => {
      await cerrarEnCurso(ana.id);
      const [sinTarea] = await db()
        .insert(generationJobs)
        .values({
          userId: ana.id,
          kind: "fotograma",
          provider: "kie",
          model: "nano-banana-2-lite",
          prompt: ESCENA,
          input: {},
          estimatedCredits: 4,
          state: "preparando",
          createdAt: new Date(Date.now() - 5 * 60_000),
        })
        .returning({ id: generationJobs.id });
      const idSinTarea = sinTarea?.id as string;
      // No se le pregunta al proveedor por un trabajo que nunca salió.
      expect((await pendientesDeConsulta()).some((p) => p.id === idSinTarea)).toBe(false);

      await pasadaDeCola(h);

      const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.id, idSinTarea));
      expect(fila?.state).toBe("fallido");
      expect(fila?.failureReason).toBe("interno");
      expect(fila?.finishedAt).not.toBeNull();
      expect(kie.llamadas.consulta).toBe(0);
      await cerrarEnCurso(ana.id);
    });
  });

  describe("límites de frecuencia de las consultas", () => {
    test("la estimación y la reconciliación se cortan si se piden demasiadas veces seguidas", async () => {
      await cerrarEnCurso(ana.id);
      const trabajo = await crearFoto(actorAna, peticion(4));
      // Se agota el contador de cada acción (las mismas claves que usan las rutas).
      for (let i = 0; i < 40; i++) {
        await dentroDelLimite(`generacion:estimacion:${ana.id}`, { ventanaSegundos: 60, maximo: 40 });
        await dentroDelLimite(`generacion:reconciliar:${ana.id}`, { ventanaSegundos: 60, maximo: 40 });
      }
      const estimacion = await rutaEstimacion.GET(pedir(ana, "/api/generacion/estimacion?tipo=fotograma"), undefined);
      expect(estimacion.status).toBe(429);
      const consulta = await rutaConsultar.POST(
        pedirDesdeLaApp(ana, `/api/generacion/trabajos/${trabajo.id}/consultar`, { method: "POST" }),
        ctx(trabajo.id),
      );
      expect(consulta.status).toBe(429);
      await cerrarEnCurso(ana.id);
    });
  });

  test("la clave de KIE no aparece en las respuestas, en la base de datos ni en la consola", async () => {
    await cerrarEnCurso(ana.id);
    const { valor, salida } = await conConsola(async () => {
      const trabajo = await crearFoto(actorAna, peticion(4));
      kie.tareas.set(trabajo.taskId as string, { state: "fail", creditos: 0 });
      const fallido = await consultarYa(actorAna, trabajo.id);
      const respuesta = await rutaTrabajos.GET(pedir(ana, "/api/generacion/trabajos"), undefined);
      const filas = await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id));
      return { fallido, cuerpo: await respuesta.text(), filas };
    });
    expect(valor.fallido.estado).toBe("fallido");
    // El proveedor devolvía la clave dentro de `failMsg`: no se propaga a ningún sitio.
    for (const clave of CLAVES) {
      expect(JSON.stringify(valor)).not.toContain(clave);
      expect(valor.cuerpo).not.toContain(clave);
      expect(salida).not.toContain(clave);
    }
  });
});
