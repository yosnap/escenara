import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";

/**
 * Cola persistente, presupuesto y conciliación (0.12.0) contra el PostgreSQL y el SeaweedFS locales
 * (`bun run services:up`).
 *
 * **Ningún test llama a KIE**: cada llamada de verdad gasta créditos del propietario. El proveedor se simula
 * con un `fetch` propio y la descarga del resultado también, así que tampoco sale nada a internet.
 *
 * Se usa la misma base de datos de prueba que la suite de generación: `bun test` comparte la conexión entre
 * ficheros, así que pedir otra distinta solo daría una falsa sensación de aislamiento.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_generacion");
}

const { and, eq, sql } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { guardarSecreto } = await import("../boveda/secretos");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, media, models, settings, usageLedger, users } = await import("../db/esquema");
const { crearMedio } = await import("../media/servicio");
const { olvidarCatalogo } = await import("../proveedores/catalogo");
const { crearAnimacion, crearFotograma } = await import("../generacion/servicio");
const { obtenerTrabajo } = await import("../generacion/trabajos");
const { reconciliar } = await import("../generacion/seguimiento");
const { olvidarSaldos } = await import("../generacion/estimacion");
const { depositoDe } = await import("../presupuesto/deposito");
const { ajustarGasto, cerrarGasto } = await import("../presupuesto/reserva");
const { trabajosConExceso } = await import("./revision");
const { atenderCallback, huellaDeToken, PARAMETRO_TOKEN, PARAMETRO_TRABAJO } = await import("./callback");
const { autorizarLimite, cancelarTrabajo } = await import("./cancelar");
const { barrerReservasHuerfanas, enviarEncolados, pasadaDeCola } = await import("./pasada");
const { marcarEnviando, recuperarHuerfanos, soltarToma, tomarTrabajos } = await import("./toma");

type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type Actor = import("../media/servicio").Actor;

const CLAVE = "sk-cola-clave-de-kie-inventada-dddd";
const ESCENA = "En una cafetería luminosa, saluda a cámara con una sonrisa.";
const SECRETO_CALLBACK = "secreto-de-callback-inventado";

interface Kie {
  saldo: number;
  tareas: Map<string, { state: string; urls?: string[]; creditos?: number }>;
  llamadas: { credito: number; subida: number; crearTarea: number; consulta: number; descargas: number };
  /**
   * Cómo falla la próxima consulta. `null` = normal. Un número simula un error del proveedor con ese código en
   * el sobre de KIE; un nombre de error simula un fallo de red o de tiempo.
   */
  falloConsulta: number | string | null;
  /** `callBackUrl` del último `createTask`, tal como lo recibió el proveedor simulado. */
  ultimoCallbackUrl: string | null;
  /** `input` del último `createTask`: lo que de verdad se le pidió al modelo. */
  ultimaEntrada: Record<string, unknown> | null;
  /**
   * Cómo responde el próximo `createTask`. `null` = normal. Un número simula ese estado HTTP; `sin-taskid`
   * simula un 200 del sobre de KIE sin identificador de tarea; un nombre de error simula un fallo de red.
   */
  falloCrearTarea: number | "sin-taskid" | string | null;
}

let kie: Kie;
let siguienteTarea = 0;

const nuevoKie = (): Kie => ({
  saldo: 100_000,
  tareas: new Map(),
  llamadas: { credito: 0, subida: 0, crearTarea: 0, consulta: 0, descargas: 0 },
  falloConsulta: null,
  ultimoCallbackUrl: null,
  ultimaEntrada: null,
  falloCrearTarea: null,
});

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
    // `callBackUrl` va al nivel de `model` e `input`, que es donde lo espera KIE.
    const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { callBackUrl?: unknown; input?: unknown };
    kie.ultimoCallbackUrl = typeof cuerpo.callBackUrl === "string" ? cuerpo.callBackUrl : null;
    kie.ultimaEntrada = (cuerpo.input as Record<string, unknown> | undefined) ?? null;
    const fallo = kie.falloCrearTarea;
    if (typeof fallo === "number") {
      // KIE devuelve HTTP 200 con el error en `code`: así se simula un 5xx o un 504 suyos.
      return new Response(JSON.stringify({ code: fallo, msg: "error simulado" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (fallo === "sin-taskid") return sobre({});
    if (typeof fallo === "string") {
      const error = new Error("simulado");
      error.name = fallo;
      throw error;
    }
    const taskId = `cola_${++siguienteTarea}`;
    kie.tareas.set(taskId, { state: "waiting" });
    return sobre({ taskId });
  }
  if (url.includes("recordInfo")) {
    kie.llamadas.consulta++;
    if (typeof kie.falloConsulta === "number") {
      return new Response(JSON.stringify({ code: kie.falloConsulta, msg: "error simulado" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (kie.falloConsulta) {
      const error = new Error("simulado");
      error.name = kie.falloConsulta;
      throw error;
    }
    const taskId = new URL(url).searchParams.get("taskId") ?? "";
    const tarea = kie.tareas.get(taskId) ?? { state: "waiting" };
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

async function png(): Promise<Uint8Array<ArrayBuffer>> {
  return bytes(
    await sharp({ create: { width: 64, height: 64, channels: 3, background: "#3d6bff" } })
      .png()
      .toBuffer(),
  );
}

const descargar: Herramientas["descargar"] = async (url) => {
  kie.llamadas.descargas++;
  const esVideo = url.endsWith(".mp4");
  return {
    archivo: new File([esVideo ? MP4 : await png()], esVideo ? "clip.mp4" : "fotograma.png", {
      type: esVideo ? "video/mp4" : "image/png",
    }),
    origen: url,
  };
};

const h: Herramientas = { buscar, descargar };

const terminar = (taskId: string, urls: string[], creditos: number) =>
  kie.tareas.set(taskId, { state: "success", urls, creditos });

describe.skipIf(!hayBaseDeDatos)("cola, presupuesto y conciliación", () => {
  let dana: Awaited<ReturnType<typeof crearSesionDePrueba>>;
  let actor: Actor;
  let referencia: string;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;

  beforeAll(async () => {
    await aplicarMigraciones();
    kie = nuevoKie();
    dana = await crearSesionDePrueba("user");
    actor = { id: dana.id, esAdmin: false };
    await guardarCredencial(dana.id, "kie", CLAVE, buscar);
    referencia = (await crearMedio(actor, new File([await png()], "dana.png", { type: "image/png" }))).id;
    ajustesPrevios = await leerAjustes();
    await guardarAjustes({ presupuestoCreditos: 100_000, presupuestoTrabajo: 100_000, trabajosSimultaneos: 10 }, null);
  });

  afterAll(async () => {
    await guardarAjustes(
      {
        presupuestoCreditos: ajustesPrevios.presupuestoCreditos,
        presupuestoTrabajo: ajustesPrevios.presupuestoTrabajo,
        trabajosSimultaneos: ajustesPrevios.trabajosSimultaneos,
        urlPublica: ajustesPrevios.urlPublica,
      },
      null,
    );
    if (dana?.email) await db().delete(users).where(eq(users.email, dana.email));
  });

  beforeEach(() => {
    kie = nuevoKie();
    olvidarSaldos();
  });

  const peticion = (creditos = 4, extra: Record<string, unknown> = {}) => ({
    medioId: referencia,
    prompt: ESCENA,
    creditosConfirmados: creditos,
    derechos: true,
    claveIdempotencia: crypto.randomUUID(),
    ...extra,
  });

  /**
   * Deja a Dana como recién llegada: sin trabajos, sin apuntes y sin contadores de ritmo gastados. La suite
   * encola decenas de trabajos suyos y el ritmo de envíos por usuario (40/hora) es real, así que hay que
   * limpiarlo o los últimos tests fallarían por un límite que no es lo que están probando.
   */
  const limpiarTrabajos = async () => {
    await db().delete(usageLedger).where(eq(usageLedger.userId, dana.id));
    await db().delete(generationJobs).where(eq(generationJobs.userId, dana.id));
    await db().execute(sql`delete from rate_limits where key like ${`generacion:%${dana.id}`}`);
  };

  /** Apuntes del trabajo por tipo, para comprobar que nada se cobra dos veces. */
  const apuntesDe = async (trabajoId: string) =>
    db()
      .select({
        tipo: usageLedger.entryType,
        creditos: usageLedger.credits,
        informado: usageLedger.informed,
        nota: usageLedger.note,
      })
      .from(usageLedger)
      .where(eq(usageLedger.jobId, trabajoId));

  describe("reserva de presupuesto", () => {
    beforeEach(limpiarTrabajos);

    test("dos trabajos a la vez no reservan el mismo saldo", async () => {
      // Presupuesto justo para un fotograma de 4 créditos.
      await guardarAjustes({ presupuestoCreditos: 4 }, null);
      try {
        const intentos = await Promise.all([
          crearFotograma(actor, peticion(), h)
            .then(() => "ok" as const)
            .catch((e) => e.estado as number),
          crearFotograma(actor, peticion(), h)
            .then(() => "ok" as const)
            .catch((e) => e.estado as number),
        ]);
        expect(intentos.filter((r) => r === "ok")).toHaveLength(1);
        expect(intentos.filter((r) => r === 402)).toHaveLength(1);
        const deposito = await depositoDe(dana.id);
        expect(deposito.reservado).toBe(4);
        expect(deposito.disponible).toBe(0);
        // Nada ha salido hacia el proveedor: encolar no llama a nadie.
        expect(kie.llamadas.crearTarea).toBe(0);
      } finally {
        await guardarAjustes({ presupuestoCreditos: 100_000 }, null);
      }
    });

    test("el tope por trabajo se comprueba antes de reservar", async () => {
      await guardarAjustes({ presupuestoTrabajo: 2 }, null);
      try {
        const error = await crearFotograma(actor, peticion(), h).catch((e) => e);
        expect(error.estado).toBe(402);
        expect(error.message).toContain("tope por trabajo");
        expect(await apuntesDe("00000000-0000-0000-0000-000000000000")).toHaveLength(0);
      } finally {
        await guardarAjustes({ presupuestoTrabajo: 100_000 }, null);
      }
    });

    test("cancelar antes de enviar suelta la reserva y no gasta nada", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      expect(trabajo.estado).toBe("en_cola");
      expect((await depositoDe(dana.id)).reservado).toBe(4);

      const cancelado = await cancelarTrabajo(dana.id, trabajo.id);

      expect(cancelado.estado).toBe("cancelado");
      const deposito = await depositoDe(dana.id);
      expect(deposito.reservado).toBe(0);
      expect(deposito.consumido).toBe(0);
      // Y la cola ya no lo toma.
      expect(await enviarEncolados(h)).toBe(0);
      expect(kie.llamadas.crearTarea).toBe(0);
    });
  });

  describe("la cola envía y nadie se pisa", () => {
    beforeEach(limpiarTrabajos);

    test("dos workers no toman el mismo trabajo", async () => {
      const encolados = await Promise.all([
        crearFotograma(actor, peticion(), h),
        crearFotograma(actor, peticion(), h),
        crearFotograma(actor, peticion(), h),
      ]);
      const ids = encolados.map((e) => e.trabajo.id).sort();

      const [unWorker, otroWorker] = await Promise.all([
        tomarTrabajos("worker-uno", 3),
        tomarTrabajos("worker-dos", 3),
      ]);

      const deUno = unWorker.map((f) => f.id);
      const deDos = otroWorker.map((f) => f.id);
      expect(deUno.filter((id) => deDos.includes(id))).toHaveLength(0);
      expect([...deUno, ...deDos].sort()).toEqual(ids);
      // Tomar incrementa los intentos y deja la toma marcada.
      expect(unWorker.every((f) => f.attempts === 1 && f.lockedBy === "worker-uno")).toBe(true);
    });

    test("un worker caído antes de llamar al proveedor cierra el trabajo sin coste, y nunca vuelve a la cola", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      const [tomado] = await tomarTrabajos("worker-que-se-cae", 1);
      expect(tomado?.id).toBe(trabajo.id);
      // El worker muere mientras preparaba: su toma caduca sin haber creado ninguna tarea.
      await db()
        .update(generationJobs)
        .set({ lockedUntil: new Date(Date.now() - 1000) })
        .where(eq(generationJobs.id, trabajo.id));

      const recuperados = await recuperarHuerfanos();

      // No vuelve a la cola: volver a la cola es lo que permitiría que dos workers enviaran lo mismo.
      expect(recuperados).toMatchObject({ cerrados: 1, enRevision: 0, aSeguimiento: 0 });
      const cerrado = await obtenerTrabajo(dana.id, trabajo.id);
      expect(cerrado.estado).toBe("fallido");
      expect(cerrado.motivoFallo).toBe("interno");
      // No ha costado nada, así que la reserva queda suelta.
      expect((await depositoDe(dana.id)).reservado).toBe(0);
      expect(await enviarEncolados(h, "worker-sano")).toBe(0);
      expect(kie.llamadas.crearTarea).toBe(0);
    });

    test("un worker que pierde la toma no llama al proveedor: dos workers no pueden enviar lo mismo", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      const [tomado] = await tomarTrabajos("worker-uno", 1);
      expect(tomado?.id).toBe(trabajo.id);
      // La toma del primero caduca y otro proceso la resuelve mientras el primero seguía preparando.
      await db()
        .update(generationJobs)
        .set({ lockedUntil: new Date(Date.now() - 1000) })
        .where(eq(generationJobs.id, trabajo.id));
      await recuperarHuerfanos();

      // El primero intenta marcar la fila para llamar al proveedor: ya no es suya, así que no llama.
      expect(await marcarEnviando(trabajo.id, "worker-uno")).toBe(false);
      expect(kie.llamadas.crearTarea).toBe(0);

      // Y tampoco puede si otro worker se la ha quedado mientras seguía en cola.
      const { trabajo: otro } = await crearFotograma(actor, peticion(), h);
      await tomarTrabajos("worker-dos", 1);
      expect(await marcarEnviando(otro.id, "worker-uno")).toBe(false);
      expect(await marcarEnviando(otro.id, "worker-dos")).toBe(true);
      // Marcada ya como `enviando`, ni el dueño puede volver a marcarla: la llamada se hace una sola vez.
      expect(await marcarEnviando(otro.id, "worker-dos")).toBe(false);
    });

    test("una toma que caduca con la llamada en curso deja el trabajo en revisión, jamás en la cola", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      const [tomado] = await tomarTrabajos("worker-uno", 1);
      expect(tomado?.id).toBe(trabajo.id);
      // Estado exacto que deja un worker que muere **después** de llamar al proveedor: `enviando`, sin tarea
      // guardada. Puede haber una tarea cobrada que no llegamos a apuntar.
      expect(await marcarEnviando(trabajo.id, "worker-uno")).toBe(true);
      await db()
        .update(generationJobs)
        .set({ lockedUntil: new Date(Date.now() - 1000) })
        .where(eq(generationJobs.id, trabajo.id));

      const recuperados = await recuperarHuerfanos();

      expect(recuperados).toMatchObject({ enRevision: 1, cerrados: 0, aSeguimiento: 0 });
      const enRevision = await obtenerTrabajo(dana.id, trabajo.id);
      expect(enRevision.estado).toBe("desconocido");
      expect(enRevision.enRevision).toBe(true);
      // La reserva se queda retenida: no se sabe si se pagó.
      expect((await depositoDe(dana.id)).reservado).toBe(4);
      // Y no hay segundo envío por ninguna vía.
      expect(await enviarEncolados(h, "worker-dos")).toBe(0);
      expect((await pasadaDeCola(h, "worker-tres")).enviados).toBe(0);
      expect(kie.llamadas.crearTarea).toBe(0);
    });

    test("un trabajo ya enviado que se queda tomado vuelve al seguimiento, nunca a la cola de envío", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);
      // Se simula un worker que se cae justo después de crear la tarea y de guardarla.
      await db()
        .update(generationJobs)
        .set({ state: "enviando", lockedBy: "worker-caido", lockedUntil: new Date(Date.now() - 1000) })
        .where(eq(generationJobs.id, trabajo.id));

      const recuperados = await recuperarHuerfanos();

      expect(recuperados).toMatchObject({ aSeguimiento: 1, cerrados: 0, enRevision: 0 });
      expect((await obtenerTrabajo(dana.id, trabajo.id)).estado).toBe("enviado");
      const antes = kie.llamadas.crearTarea;
      await enviarEncolados(h);
      expect(kie.llamadas.crearTarea).toBe(antes);
    });
  });

  describe("un timeout no cobra dos veces", () => {
    beforeEach(limpiarTrabajos);

    test("la conciliación por task_id cierra el trabajo con los créditos informados y un solo consumo", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);
      const enviado = await obtenerTrabajo(dana.id, trabajo.id);
      expect(enviado.taskId).toStartWith("cola_");

      // El proveedor no contesta a la consulta: el trabajo **no cambia de estado**, solo falla la pregunta.
      kie.falloConsulta = "TimeoutError";
      await db().update(generationJobs).set({ polledAt: null }).where(eq(generationJobs.id, trabajo.id));
      const fallo = await reconciliar(actor, trabajo.id, h).catch((e) => e);
      expect(fallo.estado).toBe(502);
      expect((await obtenerTrabajo(dana.id, trabajo.id)).estado).toBe("enviado");
      expect((await apuntesDe(trabajo.id)).filter((a) => a.tipo === "consumo")).toHaveLength(0);
      expect((await depositoDe(dana.id)).reservado).toBe(4);

      // Se consulta la misma tarea y ahora sí contesta: se cierra con los créditos que informa.
      kie.falloConsulta = null;
      terminar(enviado.taskId as string, ["https://tempfile.kie.ai/timeout.png"], 7);
      await db().update(generationJobs).set({ polledAt: null }).where(eq(generationJobs.id, trabajo.id));
      const listo = await reconciliar(actor, trabajo.id, h);

      expect(listo.estado).toBe("listo");
      expect(listo.creditosConsumidos).toBe(7);
      // Una sola tarea creada en todo el recorrido: nunca se reenvía.
      expect(kie.llamadas.crearTarea).toBe(1);
      const apuntes = await apuntesDe(trabajo.id);
      const consumos = apuntes.filter((a) => a.tipo === "consumo");
      expect(consumos).toHaveLength(1);
      expect(consumos[0]?.creditos).toBe(7);
      expect(consumos[0]?.informado).toBe(true);
      expect(apuntes.filter((a) => a.tipo === "liberacion")).toHaveLength(1);
      const deposito = await depositoDe(dana.id);
      expect(deposito.reservado).toBe(0);
      expect(deposito.consumido).toBe(7);
      // El proveedor ha cobrado 7 donde se habían apartado 4: se avisa aunque nadie fijara un límite.
      expect(listo.excesoCreditos).toBe(3);
      expect(apuntes.filter((a) => a.tipo === "ajuste")).toHaveLength(1);

      // Volver a conciliar no añade ningún apunte ni descarga otra vez.
      await db().update(generationJobs).set({ polledAt: null }).where(eq(generationJobs.id, trabajo.id));
      await reconciliar(actor, trabajo.id, h);
      expect(await apuntesDe(trabajo.id)).toHaveLength(4);
      expect(kie.llamadas.descargas).toBe(1);
    });
  });

  /**
   * Norma de errores visibles en el fallo de preparación (0.23.4). Antes, cualquier fallo antes de llamar al
   * proveedor decía «No se ha podido preparar el envío. Se volverá a intentar» y se reintentaba tres veces,
   * aunque fuera algo que no se arregla solo. Ahora se dice la causa concreta, que no se ha enviado ni cobrado,
   * y lo que no es pasajero no se reintenta.
   */
  describe("un fallo al preparar dice su causa y no se reintenta si no se va a arreglar solo", () => {
    beforeEach(limpiarTrabajos);

    test("un modelo que esta instalación no puede pedir cierra el trabajo con su motivo y sin coste", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      // Entre encolar y enviar, el catálogo deja de tener ese modelo: es un fallo de catálogo, no del proveedor.
      await db()
        .update(generationJobs)
        .set({ model: "modelo-que-ya-no-esta" })
        .where(eq(generationJobs.id, trabajo.id));
      await enviarEncolados(h);

      const fallido = await obtenerTrabajo(dana.id, trabajo.id);
      expect(fallido.estado).toBe("fallido");
      expect(fallido.error).toContain("no se te ha cobrado");
      expect(fallido.error).not.toContain("Se volverá a intentar");
      // Nada ha salido hacia el proveedor y la reserva se ha soltado entera.
      expect(kie.llamadas.crearTarea).toBe(0);
      expect((await depositoDe(dana.id)).reservado).toBe(0);
    });

    test("un fotograma que se quedó sin imagen de partida lo dice, y no lo intenta tres veces", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await db()
        .update(generationJobs)
        .set({
          sourceMediaId: null,
          input: sql`jsonb_set(${generationJobs.input}::jsonb, '{referencias}', '[]')`,
        })
        .where(eq(generationJobs.id, trabajo.id));
      await enviarEncolados(h);

      const fallido = await obtenerTrabajo(dana.id, trabajo.id);
      expect(fallido.estado).toBe("fallido");
      expect(fallido.error).toContain("Falta la imagen de partida");
      expect(fallido.error).toContain("no se te ha cobrado");
      expect(kie.llamadas.crearTarea).toBe(0);
      expect((await depositoDe(dana.id)).reservado).toBe(0);
    });
  });

  describe("el clip sale con la duración que se decidió al encolar", () => {
    beforeEach(limpiarTrabajos);

    test("el despacho pide al proveedor los segundos guardados, no los que declara hoy el modelo", async () => {
      const { trabajo: fotograma } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);
      const enviado = await obtenerTrabajo(dana.id, fotograma.id);
      terminar(enviado.taskId as string, ["https://tempfile.kie.ai/base.png"], 4);
      await db().update(generationJobs).set({ polledAt: null }).where(eq(generationJobs.id, fotograma.id));
      const padre = (await reconciliar(actor, fotograma.id, h)).id;

      const { trabajo } = await crearAnimacion(
        actor,
        {
          trabajoPadreId: padre,
          prompt: "se mueve un poco",
          creditosConfirmados: 60,
          derechos: true,
          claveIdempotencia: crypto.randomUUID(),
        },
        h,
      );
      // Un proyecto de 4 s encola su clip con 4 s en la entrada; el modelo declara 8 s como primera duración.
      await db()
        .update(generationJobs)
        .set({ input: sql`jsonb_set(${generationJobs.input}::jsonb, '{parametros,segundos}', '4')` })
        .where(eq(generationJobs.id, trabajo.id));
      await enviarEncolados(h);

      expect(kie.ultimaEntrada?.duration).toBe(4);
    });
  });

  describe("callback del proveedor", () => {
    beforeEach(async () => {
      await limpiarTrabajos();
      await guardarAjustes({ urlPublica: "https://escenara.example" }, null);
      await guardarSecreto("secretoCallback", SECRETO_CALLBACK, null);
    });

    /** Token con el que se firmó la URL de un trabajo ya enviado, sacado del cuerpo que se envió a KIE. */
    const tokenDelEnvio = () => {
      const url = kie.ultimoCallbackUrl;
      if (!url) throw new Error("El envío no llevaba callBackUrl.");
      return new URL(url).searchParams.get(PARAMETRO_TOKEN) as string;
    };

    test("con URL pública, el envío a KIE lleva callBackUrl con el trabajo y su token", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);

      const url = new URL(kie.ultimoCallbackUrl as string);
      expect(url.origin).toBe("https://escenara.example");
      expect(url.pathname).toBe("/api/generacion/callback/kie");
      expect(url.searchParams.get(PARAMETRO_TRABAJO)).toBe(trabajo.id);
      expect(url.searchParams.get(PARAMETRO_TOKEN)).toMatch(/^[0-9a-f]{64}$/);
      // En la base de datos solo queda la huella con el secreto: el token no se guarda nunca.
      const [fila] = await db()
        .select({ hash: generationJobs.callbackTokenHash })
        .from(generationJobs)
        .where(eq(generationJobs.id, trabajo.id));
      expect(fila?.hash).toBe(huellaDeToken(SECRETO_CALLBACK, tokenDelEnvio()));
    });

    test("sin URL pública no se le pide ningún callback al proveedor", async () => {
      await guardarAjustes({ urlPublica: "" }, null);
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);

      expect(kie.ultimoCallbackUrl).toBeNull();
      const [fila] = await db()
        .select({ hash: generationJobs.callbackTokenHash })
        .from(generationJobs)
        .where(eq(generationJobs.id, trabajo.id));
      expect(fila?.hash).toBeNull();
    });

    test("un callback repetido no crea dos medios ni dos apuntes de consumo", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);
      const enviado = await obtenerTrabajo(dana.id, trabajo.id);
      terminar(enviado.taskId as string, ["https://tempfile.kie.ai/callback.png"], 4);
      const token = tokenDelEnvio();

      expect(await atenderCallback("kie", trabajo.id, token, 0, h)).toEqual({ conciliado: true });
      await db().update(generationJobs).set({ polledAt: null }).where(eq(generationJobs.id, trabajo.id));
      expect(await atenderCallback("kie", trabajo.id, token, 0, h)).toEqual({ conciliado: true });

      const medios = await db()
        .select({ id: media.id })
        .from(media)
        .where(eq(media.sourceUrl, "https://tempfile.kie.ai/callback.png"));
      expect(medios).toHaveLength(1);
      expect((await apuntesDe(trabajo.id)).filter((a) => a.tipo === "consumo")).toHaveLength(1);
      expect(kie.llamadas.descargas).toBe(1);
    });

    test("un token que no cuadra no concilia nada, y da la misma respuesta que un trabajo inexistente", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);
      const ajeno = "f".repeat(64);

      const conTokenMalo = await atenderCallback("kie", trabajo.id, ajeno, 0, h).catch((e) => e);
      expect(conTokenMalo.estado).toBe(404);
      const inexistente = await atenderCallback("kie", crypto.randomUUID(), ajeno, 0, h).catch((e) => e);
      expect(inexistente.estado).toBe(404);
      expect(conTokenMalo.message).toBe(inexistente.message);
      expect(kie.llamadas.consulta).toBe(0);
    });

    test("sin token no se lee ningún ajuste ni se abre la bóveda", async () => {
      // Se quita la URL pública: si el corte por token no fuera lo primero, el error sería el de «sin URL».
      await guardarAjustes({ urlPublica: "" }, null);
      const sinToken = await atenderCallback("kie", crypto.randomUUID(), null, 0, h).catch((e) => e);
      expect(sinToken.estado).toBe(404);
      expect(sinToken.message).toBe("No hay ningún callback en esa dirección.");
      const tokenDeforme = await atenderCallback("kie", crypto.randomUUID(), "no-es-un-token", 0, h).catch((e) => e);
      expect(tokenDeforme.message).toBe("No hay ningún callback en esa dirección.");
      expect(kie.llamadas.consulta).toBe(0);
    });

    test("sin URL pública configurada no se atiende ningún callback", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);
      const token = tokenDelEnvio();
      await guardarAjustes({ urlPublica: "" }, null);

      const error = await atenderCallback("kie", trabajo.id, token, 0, h).catch((e) => e);
      expect(error.estado).toBe(404);
      expect(error.message).toContain("URL pública");
    });

    test("un cuerpo enorme se rechaza sin consultar nada", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);
      const error = await atenderCallback("kie", trabajo.id, tokenDelEnvio(), 9999, h).catch((e) => e);
      expect(error.estado).toBe(413);
      expect(kie.llamadas.consulta).toBe(0);
    });
  });

  describe("coste que no se puede acotar", () => {
    let fotogramaListo: string;
    // Se restaura tal cual estaba: otros ficheros de prueba comparten la base y necesitan el modelo completo.
    let parametrosOriginales = "{}";

    beforeAll(async () => {
      const [fila] = await db().select({ p: models.parameters }).from(models).where(eq(models.modelId, "veo3_fast"));
      parametrosOriginales = fila?.p ?? "{}";
      // Un clip cuyo modelo no declara duración: el precio registrado no acota lo que costará.
      await db().update(models).set({ parameters: "{}" }).where(eq(models.modelId, "veo3_fast"));
      olvidarCatalogo();
    });

    afterAll(async () => {
      await db().update(models).set({ parameters: parametrosOriginales }).where(eq(models.modelId, "veo3_fast"));
      olvidarCatalogo();
    });

    beforeEach(async () => {
      await limpiarTrabajos();
      // Hace falta un fotograma listo para poder animarlo.
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);
      const enviado = await obtenerTrabajo(dana.id, trabajo.id);
      terminar(enviado.taskId as string, ["https://tempfile.kie.ai/base.png"], 4);
      await db().update(generationJobs).set({ polledAt: null }).where(eq(generationJobs.id, trabajo.id));
      fotogramaListo = (await reconciliar(actor, trabajo.id, h)).id;
    });

    const clip = () => ({
      trabajoPadreId: fotogramaListo,
      prompt: "se mueve un poco",
      creditosConfirmados: 60,
      derechos: true,
      claveIdempotencia: crypto.randomUUID(),
    });

    test("el trabajo no se envía y espera un límite del usuario", async () => {
      const { trabajo } = await crearAnimacion(actor, clip(), h);

      expect(trabajo.estado).toBe("esperando_limite");
      expect(trabajo.motivoFallo).toBe("sin_acotar");
      expect(trabajo.error).toContain("no declara cuánto dura");
      // No se ha reservado nada y la cola no lo toca.
      expect((await depositoDe(dana.id)).reservado).toBe(0);
      const tareasAntes = kie.llamadas.crearTarea;
      expect(await enviarEncolados(h)).toBe(0);
      expect(kie.llamadas.crearTarea).toBe(tareasAntes);
    });

    test("con el límite autorizado se reserva ese techo y sale a la cola", async () => {
      const { trabajo } = await crearAnimacion(actor, clip(), h);

      const autorizado = await autorizarLimite(dana.id, trabajo.id, 90);

      expect(autorizado.estado).toBe("en_cola");
      expect(autorizado.limiteCreditos).toBe(90);
      expect((await depositoDe(dana.id)).reservado).toBe(90);
      expect(await enviarEncolados(h)).toBe(1);
      expect((await obtenerTrabajo(dana.id, trabajo.id)).estado).toBe("enviado");
    });
  });

  describe("la llamada al proveedor y la escritura van por separado", () => {
    beforeEach(limpiarTrabajos);

    /**
     * Rompe de verdad la escritura del identificador de tarea de un trabajo, con un disparador de PostgreSQL
     * que solo salta cuando el `UPDATE` intenta poner `task_id`. Así se prueba el camino real: el proveedor
     * acepta el trabajo y la base de datos no deja guardarlo.
     */
    const conEscrituraDeTareaRota = async <T>(trabajoId: string, accion: () => Promise<T>): Promise<T> => {
      await db().execute(sql`
        create or replace function escenara_prueba_fallo_tarea() returns trigger as $$
        begin raise exception 'fallo simulado al guardar la tarea'; end;
        $$ language plpgsql
      `);
      await db().execute(
        sql.raw(`
        create trigger escenara_prueba_fallo_tarea_tg before update on generation_jobs
        for each row when (new.id = '${trabajoId}' and new.task_id is not null)
        execute function escenara_prueba_fallo_tarea()
      `),
      );
      try {
        return await accion();
      } finally {
        await db().execute(sql`drop trigger if exists escenara_prueba_fallo_tarea_tg on generation_jobs`);
        await db().execute(sql`drop function if exists escenara_prueba_fallo_tarea()`);
      }
    };

    test("si falla la escritura tras crear la tarea, no se reenvía nada y el trabajo queda en revisión", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);

      await conEscrituraDeTareaRota(trabajo.id, async () => {
        expect(await enviarEncolados(h, "worker-uno")).toBe(0);
      });

      // El proveedor ha aceptado el trabajo **una vez** y no se ha reintentado la llamada.
      expect(kie.llamadas.crearTarea).toBe(1);
      const enRevision = await obtenerTrabajo(dana.id, trabajo.id);
      expect(enRevision.estado).toBe("desconocido");
      expect(enRevision.enRevision).toBe(true);
      expect(enRevision.error).toContain("no se ha podido guardar su identificador");
      // La reserva sigue retenida: se ha pagado algo y hay que resolverlo a mano.
      expect((await depositoDe(dana.id)).reservado).toBe(4);
      expect((await apuntesDe(trabajo.id)).filter((a) => a.tipo === "consumo")).toHaveLength(0);

      // Y ninguna pasada posterior lo vuelve a enviar, ni siquiera cuando su toma ha caducado.
      await db()
        .update(generationJobs)
        .set({ lockedUntil: new Date(Date.now() - 1000) })
        .where(eq(generationJobs.id, trabajo.id));
      const pasada = await pasadaDeCola(h, "worker-dos");
      expect(pasada.enviados).toBe(0);
      expect(kie.llamadas.crearTarea).toBe(1);
      expect((await obtenerTrabajo(dana.id, trabajo.id)).estado).toBe("desconocido");
    });
  });

  describe("solo se da por «no cobrado» lo que el proveedor ha rechazado de verdad", () => {
    beforeEach(limpiarTrabajos);

    /** Estado y reserva tras un envío que falla de la forma indicada. */
    const envioQueFalla = async (fallo: Kie["falloCrearTarea"]) => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      kie.falloCrearTarea = fallo;
      expect(await enviarEncolados(h, "worker-uno")).toBe(0);
      kie.falloCrearTarea = null;
      return {
        vista: await obtenerTrabajo(dana.id, trabajo.id),
        deposito: await depositoDe(dana.id),
        id: trabajo.id,
      };
    };

    test.each([
      ["un 5xx del proveedor", 502 as Kie["falloCrearTarea"]],
      ["un tiempo agotado del proveedor", 504 as Kie["falloCrearTarea"]],
      ["un 200 sin identificador de tarea", "sin-taskid" as Kie["falloCrearTarea"]],
      ["un tiempo agotado de red", "TimeoutError" as Kie["falloCrearTarea"]],
      ["la red caída", "TypeError" as Kie["falloCrearTarea"]],
    ])("%s deja el trabajo en revisión con la reserva retenida", async (_nombre, fallo) => {
      const { vista, deposito, id } = await envioQueFalla(fallo);

      // Ninguno de estos prueba que el proveedor no haya aceptado el trabajo.
      expect(vista.estado).toBe("desconocido");
      expect(vista.enRevision).toBe(true);
      // El mensaje dice las cuatro cosas de la norma de errores visibles: qué falló (proveedor y modelo), qué se
      // ha quedado sin hacer, qué pasa con el dinero y qué hacer.
      expect(vista.error).toContain("No se ha podido generar el fotograma");
      expect(vista.error).toContain("KIE.ai (nano-banana-2-lite)");
      expect(vista.error).toContain("No se sabe si te ha cobrado");
      expect(vista.error).toContain("revisa el historial de tu cuenta en KIE.ai");
      expect(deposito.reservado).toBe(4);
      expect(deposito.retenido).toBe(4);
      expect(deposito.trabajosEnRevision).toBe(1);
      // Y no hay ningún reenvío: se llamó una vez y nada más.
      expect(kie.llamadas.crearTarea).toBe(1);
      expect((await pasadaDeCola(h, "worker-dos")).enviados).toBe(0);
      expect(kie.llamadas.crearTarea).toBe(1);
      expect((await obtenerTrabajo(dana.id, id)).estado).toBe("desconocido");
    });

    test.each([
      ["la clave rechazada", 401 as Kie["falloCrearTarea"]],
      ["la cuenta sin saldo", 402 as Kie["falloCrearTarea"]],
      ["el exceso de ritmo", 429 as Kie["falloCrearTarea"]],
    ])("%s sí prueba el rechazo: el trabajo se cierra y suelta la reserva", async (_nombre, fallo) => {
      const { vista, deposito } = await envioQueFalla(fallo);

      expect(vista.estado).toBe("fallido");
      expect(vista.error).toContain("No se ha podido generar el fotograma");
      expect(vista.error).toContain("KIE.ai (nano-banana-2-lite)");
      expect(vista.error).toContain("No se te ha cobrado nada");
      expect(deposito.reservado).toBe(0);
      expect(deposito.retenido).toBe(0);
      expect(kie.llamadas.crearTarea).toBe(1);
    });
  });

  describe("un fallo de la consulta no mueve el estado ni el dinero", () => {
    beforeEach(limpiarTrabajos);

    /** Deja un trabajo enviado y con la marca de última consulta borrada, listo para consultarse. */
    const enviadoYConsultable = async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);
      await db().update(generationJobs).set({ polledAt: null }).where(eq(generationJobs.id, trabajo.id));
      return obtenerTrabajo(dana.id, trabajo.id);
    };

    test.each([
      ["un 5xx del proveedor", 502 as Kie["falloConsulta"]],
      ["un tiempo agotado", "TimeoutError" as Kie["falloConsulta"]],
      ["la red caída", "TypeError" as Kie["falloConsulta"]],
    ])("%s al consultar deja el trabajo como estaba, y la consulta siguiente lo cierra", async (_n, fallo) => {
      const enviado = await enviadoYConsultable();

      kie.falloConsulta = fallo;
      const error = await reconciliar(actor, enviado.id, h).catch((e) => e);

      // Lo que ha fallado es nuestra pregunta, no el trabajo: sigue donde estaba.
      expect(error.estado).toBe(502);
      const tras = await obtenerTrabajo(dana.id, enviado.id);
      expect(tras.estado).toBe("enviado");
      expect(tras.enRevision).toBe(false);
      // Del intento solo queda la marca que espacia las consultas.
      expect(tras.ultimaConsulta).not.toBeNull();
      // Y el dinero no se ha movido: la reserva sigue apartada, sin pasar a retenida.
      const deposito = await depositoDe(dana.id);
      expect(deposito.reservado).toBe(4);
      expect(deposito.retenido).toBe(0);

      // La consulta siguiente, con el proveedor respondiendo, lo cierra con normalidad.
      kie.falloConsulta = null;
      terminar(enviado.taskId as string, [`https://tempfile.kie.ai/${enviado.id}.png`], 4);
      await db().update(generationJobs).set({ polledAt: null }).where(eq(generationJobs.id, enviado.id));
      const listo = await reconciliar(actor, enviado.id, h);
      expect(listo.estado).toBe("listo");
      expect(listo.creditosConsumidos).toBe(4);
      expect((await depositoDe(dana.id)).reservado).toBe(0);
    });

    test("el único camino automático a revisión por falta de respuesta es el techo de edad", async () => {
      const enviado = await enviadoYConsultable();
      // Muchas pasadas con el proveedor sin contestar no lo mandan a revisión.
      kie.falloConsulta = "TimeoutError";
      for (let i = 0; i < 3; i++) {
        await db().update(generationJobs).set({ polledAt: null }).where(eq(generationJobs.id, enviado.id));
        await pasadaDeCola(h, "worker-uno");
      }
      expect((await obtenerTrabajo(dana.id, enviado.id)).estado).toBe("enviado");

      // Lo que sí lo manda es llevar demasiado tiempo en el proveedor desde que salió.
      await db()
        .update(generationJobs)
        .set({ sentAt: new Date(Date.now() - 40 * 60_000), polledAt: null })
        .where(eq(generationJobs.id, enviado.id));
      await pasadaDeCola(h, "worker-uno");

      expect((await obtenerTrabajo(dana.id, enviado.id)).estado).toBe("desconocido");
    });
  });

  describe("el navegador no toca los trabajos que está enviando un worker", () => {
    beforeEach(limpiarTrabajos);

    test("un trabajo con toma viva sigue preparándose aunque se consulte desde el historial", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      const [tomado] = await tomarTrabajos("worker-uno", 1);
      expect(tomado?.id).toBe(trabajo.id);
      // Pedido hace cinco minutos: antes, eso bastaba para que una consulta del navegador lo diera por perdido.
      await db()
        .update(generationJobs)
        .set({ createdAt: new Date(Date.now() - 5 * 60_000) })
        .where(eq(generationJobs.id, trabajo.id));

      // El historial y la consulta del navegador solo leen.
      const consultado = await reconciliar(actor, trabajo.id, h);
      expect(consultado.estado).toBe("preparando");
      expect((await obtenerTrabajo(dana.id, trabajo.id)).estado).toBe("preparando");
      // La reserva sigue apartada, no retenida en revisión.
      expect((await depositoDe(dana.id)).retenido).toBe(0);

      // Y el worker que la tenía tomada la envía sin problema.
      expect(await marcarEnviando(trabajo.id, "worker-uno")).toBe(true);
    });

    test("una preparación abandonada sin worker detrás se cierra sin coste, no queda en revisión", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      // Estado que dejaba la 0.10.x: `preparando`, viejo, sin tarea y sin toma de nadie.
      await db()
        .update(generationJobs)
        .set({
          state: "preparando",
          createdAt: new Date(Date.now() - 5 * 60_000),
          lockedBy: null,
          lockedUntil: null,
        })
        .where(eq(generationJobs.id, trabajo.id));

      await pasadaDeCola(h, "worker-uno");

      const cerrado = await obtenerTrabajo(dana.id, trabajo.id);
      expect(cerrado.estado).toBe("fallido");
      expect(cerrado.motivoFallo).toBe("interno");
      expect(cerrado.terminadoEn).not.toBeNull();
      // Nunca llamó al proveedor, así que no retiene nada.
      const deposito = await depositoDe(dana.id);
      expect(deposito.reservado).toBe(0);
      expect(deposito.retenido).toBe(0);
      expect(kie.llamadas.crearTarea).toBe(0);
    });
  });

  describe("ninguna reserva se queda apartada en un trabajo cerrado", () => {
    beforeEach(limpiarTrabajos);

    test("el barrido suelta la reserva de un trabajo terminal al que le faltó el apunte", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      // Se simula el hueco que dejaría un apunte fallido tras cambiar el estado: trabajo cerrado y reserva viva.
      await db()
        .update(generationJobs)
        .set({ state: "cancelado", failureReason: "cancelado", finishedAt: new Date() })
        .where(eq(generationJobs.id, trabajo.id));
      expect((await depositoDe(dana.id)).reservado).toBe(4);

      expect(await barrerReservasHuerfanas()).toBe(1);

      expect((await depositoDe(dana.id)).reservado).toBe(0);
      const apuntes = await apuntesDe(trabajo.id);
      expect(apuntes.filter((a) => a.tipo === "liberacion")).toHaveLength(1);
      expect(apuntes.filter((a) => a.tipo === "consumo")).toHaveLength(1);
      // Barrer otra vez no cambia nada: es idempotente.
      expect(await barrerReservasHuerfanas()).toBe(0);
      expect((await apuntesDe(trabajo.id)).length).toBe(apuntes.length);
    });

    test("un trabajo listo al que le faltó el apunte se cierra con los créditos que informó el proveedor", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await db()
        .update(generationJobs)
        .set({ state: "listo", consumedCredits: 6, finishedAt: new Date() })
        .where(eq(generationJobs.id, trabajo.id));

      expect(await barrerReservasHuerfanas()).toBe(1);

      const deposito = await depositoDe(dana.id);
      expect(deposito.reservado).toBe(0);
      expect(deposito.consumido).toBe(6);
    });

    test("un trabajo en revisión no se barre: su reserva está retenida a propósito", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await db()
        .update(generationJobs)
        .set({ state: "desconocido", failureReason: "temporal" })
        .where(eq(generationJobs.id, trabajo.id));

      expect(await barrerReservasHuerfanas()).toBe(0);

      const deposito = await depositoDe(dana.id);
      expect(deposito.reservado).toBe(4);
      expect(deposito.retenido).toBe(4);
      expect((await apuntesDe(trabajo.id)).filter((a) => a.tipo === "liberacion")).toHaveLength(0);
    });
  });

  describe("el presupuesto retenido se explica al usuario", () => {
    beforeEach(limpiarTrabajos);

    test("el 402 dice que hay créditos retenidos y que los resuelve quien administra", async () => {
      // Un trabajo en revisión se queda con toda la reserva del presupuesto disponible.
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await db()
        .update(generationJobs)
        .set({ state: "desconocido", failureReason: "temporal" })
        .where(eq(generationJobs.id, trabajo.id));
      await guardarAjustes({ presupuestoCreditos: 4 }, null);
      try {
        const error = await crearFotograma(actor, peticion(), h).catch((e) => e);

        expect(error.estado).toBe(402);
        expect(error.message).toContain("retenidos");
        expect(error.message).toContain("pendientes de revisión");
        expect(error.message).toContain("quien administra");
        // Y no se ofrece la salida falsa de «espera a que terminen», que aquí no serviría.
        expect(error.message).not.toContain("Espera a que terminen");
      } finally {
        await guardarAjustes({ presupuestoCreditos: 100_000 }, null);
      }
    });
  });

  describe("una fila que llamó al proveedor nunca queda atrapada", () => {
    beforeEach(limpiarTrabajos);

    test("si no se puede marcar la tarea perdida, soltar la toma no atrapa la fila en «enviando»", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      const [tomado] = await tomarTrabajos("worker-uno", 1);
      expect(tomado?.id).toBe(trabajo.id);
      // Estado exacto que deja un `marcarTareaPerdida` que no ha conseguido escribir: se llamó al proveedor y
      // la fila sigue en `enviando` sin tarea guardada.
      expect(await marcarEnviando(trabajo.id, "worker-uno")).toBe(true);

      // El `finally` de la pasada suelta la toma… y no debe tocar esta fila.
      await soltarToma(trabajo.id, "worker-uno");

      const [tras] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo.id));
      expect(tras?.state).toBe("enviando");
      expect(tras?.lockedUntil).not.toBeNull();

      // Y cuando la toma caduca, la recoge la recuperación: acaba en revisión, nunca reenviada.
      await db()
        .update(generationJobs)
        .set({ lockedUntil: new Date(Date.now() - 1000) })
        .where(eq(generationJobs.id, trabajo.id));
      expect((await recuperarHuerfanos()).enRevision).toBe(1);
      const enRevision = await obtenerTrabajo(dana.id, trabajo.id);
      expect(enRevision.estado).toBe("desconocido");
      expect(enRevision.enRevision).toBe(true);
      expect((await depositoDe(dana.id)).retenido).toBe(4);
      expect(kie.llamadas.crearTarea).toBe(0);
    });

    test("una fila «enviando» a la que ya le quitaron la toma también acaba en revisión", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      // Lo que dejaría una versión anterior (o cualquier otro camino): `enviando` con la toma a nulo.
      await db()
        .update(generationJobs)
        .set({ state: "enviando", lockedBy: null, lockedUntil: null })
        .where(eq(generationJobs.id, trabajo.id));

      expect((await recuperarHuerfanos()).enRevision).toBe(1);

      expect((await obtenerTrabajo(dana.id, trabajo.id)).estado).toBe("desconocido");
      expect((await depositoDe(dana.id)).retenido).toBe(4);
      expect(await enviarEncolados(h, "worker-dos")).toBe(0);
      expect(kie.llamadas.crearTarea).toBe(0);
    });
  });

  describe("el barrido de reservas aguanta el libro real", () => {
    beforeEach(limpiarTrabajos);

    test("una liberación sin trabajo asociado no deja ciego al barrido", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await db()
        .update(generationJobs)
        .set({ state: "cancelado", failureReason: "cancelado", finishedAt: new Date() })
        .where(eq(generationJobs.id, trabajo.id));
      // Un apunte de liberación sin trabajo: con un `NOT IN`, este solo valor nulo haría que el barrido dejara
      // de encontrar nada, en silencio.
      await db().insert(usageLedger).values({
        userId: dana.id,
        jobId: null,
        provider: "kie",
        model: "nano-banana-2-lite",
        entryType: "liberacion",
        credits: 0,
        informed: false,
        note: "Apunte sin trabajo, para comprobar que el barrido no se queda ciego.",
      });

      expect(await barrerReservasHuerfanas()).toBe(1);

      expect((await depositoDe(dana.id)).reservado).toBe(0);
      expect((await apuntesDe(trabajo.id)).filter((a) => a.tipo === "liberacion")).toHaveLength(1);
    });
  });

  describe("resolución manual: identificador y aviso de exceso", () => {
    beforeEach(limpiarTrabajos);

    test("un identificador que no es un UUID se rechaza sin consultar nada", async () => {
      const error = await ajustarGasto("'; drop table generation_jobs; --", 0, "Intento raro.", dana.id).catch(
        (e) => e,
      );
      expect(error.estado).toBe(404);
      const inexistente = await ajustarGasto(crypto.randomUUID(), 0, "Trabajo que no existe.", dana.id).catch((e) => e);
      expect(inexistente.estado).toBe(404);
    });

    test("el aviso de exceso se apunta una sola vez aunque se cierre el gasto dos veces", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);
      const enviado = await obtenerTrabajo(dana.id, trabajo.id);
      terminar(enviado.taskId as string, ["https://tempfile.kie.ai/una-vez.png"], 25);
      await db().update(generationJobs).set({ polledAt: null }).where(eq(generationJobs.id, trabajo.id));
      await reconciliar(actor, trabajo.id, h);

      const ajustesTrasPrimero = (await apuntesDe(trabajo.id)).filter((a) => a.tipo === "ajuste");
      expect(ajustesTrasPrimero).toHaveLength(1);

      // Cerrar el gasto otra vez no vuelve a apuntar el aviso ni cambia el exceso guardado.
      await cerrarGasto(trabajo.id, 25, "Segundo cierre, que no debe duplicar el aviso.");

      expect((await apuntesDe(trabajo.id)).filter((a) => a.tipo === "ajuste")).toHaveLength(1);
      expect((await obtenerTrabajo(dana.id, trabajo.id)).excesoCreditos).toBe(21);
    });
  });

  describe("la edad de un trabajo se mide desde que salió al proveedor", () => {
    beforeEach(limpiarTrabajos);

    test("un trabajo que esperó mucho en la cola pero acaba de salir no se cierra por edad", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);
      // Se pidió hace 40 minutos (el worker estaba parado) pero salió al proveedor hace un instante.
      await db()
        .update(generationJobs)
        .set({ createdAt: new Date(Date.now() - 40 * 60_000), sentAt: new Date(), polledAt: null })
        .where(eq(generationJobs.id, trabajo.id));

      await pasadaDeCola(h, "worker-uno");

      const vivo = await obtenerTrabajo(dana.id, trabajo.id);
      expect(vivo.estado).not.toBe("desconocido");
      expect(vivo.enRevision).toBe(false);
    });

    test("un trabajo que lleva 40 minutos en el proveedor sí se cierra sin respuesta", async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);
      await db()
        .update(generationJobs)
        .set({
          createdAt: new Date(Date.now() - 40 * 60_000),
          sentAt: new Date(Date.now() - 40 * 60_000),
          polledAt: null,
        })
        .where(eq(generationJobs.id, trabajo.id));

      await pasadaDeCola(h, "worker-uno");

      const cerrado = await obtenerTrabajo(dana.id, trabajo.id);
      expect(cerrado.estado).toBe("desconocido");
      // Sigue sin reenviarse: solo se ha dejado de consultar solo.
      expect(kie.llamadas.crearTarea).toBe(1);
    });
  });

  describe("gasto por encima de lo autorizado o apartado", () => {
    beforeEach(limpiarTrabajos);

    /** Envía un trabajo y lo cierra con los créditos que informe el proveedor. */
    const cobrar = async (creditos: number, ajustesFila: { creditLimit?: number; reserva?: number } = {}) => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);
      const enviado = await obtenerTrabajo(dana.id, trabajo.id);
      if (ajustesFila.creditLimit !== undefined) {
        await db()
          .update(generationJobs)
          .set({ creditLimit: ajustesFila.creditLimit })
          .where(eq(generationJobs.id, trabajo.id));
      }
      if (ajustesFila.reserva !== undefined) {
        await db()
          .update(usageLedger)
          .set({ credits: ajustesFila.reserva })
          .where(and(eq(usageLedger.jobId, trabajo.id), eq(usageLedger.entryType, "reserva")));
      }
      terminar(enviado.taskId as string, [`https://tempfile.kie.ai/${trabajo.id}.png`], creditos);
      await db().update(generationJobs).set({ polledAt: null }).where(eq(generationJobs.id, trabajo.id));
      return { id: trabajo.id, listo: await reconciliar(actor, trabajo.id, h) };
    };

    test("por encima del límite que fijó el usuario: consumo real y exceso registrado", async () => {
      // Autorizó 10 como techo (con 30 apartados, así que el techo que manda es el suyo) y el proveedor cobra 25.
      const { id, listo } = await cobrar(25, { creditLimit: 10, reserva: 30 });

      // El consumo apuntado es el real, no el límite: mentir sobre el gasto sería peor que el propio exceso.
      expect(listo.creditosConsumidos).toBe(25);
      expect(listo.excesoCreditos).toBe(15);
      const apuntes = await apuntesDe(id);
      expect(apuntes.filter((a) => a.tipo === "consumo")[0]?.creditos).toBe(25);
      expect((await depositoDe(dana.id)).consumido).toBe(25);
      // Queda escrito en el registro de gasto, diciendo contra qué techo se compara, y lo ve quien administra.
      const ajuste = apuntes.filter((a) => a.tipo === "ajuste")[0];
      expect(ajuste?.nota).toContain("el límite que se autorizó");
      expect((await trabajosConExceso()).some((t) => t.id === id)).toBe(true);
    });

    test("por encima de lo apartado también se avisa, aunque el usuario no fijara ningún límite", async () => {
      const { id, listo } = await cobrar(25);

      // Se reservaron 4 créditos y el proveedor ha cobrado 25: eso hay que decirlo igual.
      expect(listo.creditosConsumidos).toBe(25);
      expect(listo.excesoCreditos).toBe(21);
      expect((await apuntesDe(id)).filter((a) => a.tipo === "ajuste")[0]?.nota).toContain("lo apartado");
      expect((await trabajosConExceso()).some((t) => t.id === id)).toBe(true);
    });

    test("cobrar lo que se había apartado no genera ningún aviso", async () => {
      const { id, listo } = await cobrar(4);

      expect(listo.creditosConsumidos).toBe(4);
      expect(listo.excesoCreditos).toBeNull();
      expect((await apuntesDe(id)).filter((a) => a.tipo === "ajuste")).toHaveLength(0);
      expect(await trabajosConExceso()).toHaveLength(0);
    });
  });

  describe("resolución manual del gasto", () => {
    beforeEach(limpiarTrabajos);

    /**
     * Trabajo sin respuesta del proveedor, con su reserva retenida: lo que resuelve quien administra. Se llega
     * por el techo de edad, que es el único camino automático a revisión desde que un fallo de consulta ya no
     * cambia el estado.
     */
    const trabajoSinRespuesta = async () => {
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      await enviarEncolados(h);
      await db()
        .update(generationJobs)
        .set({ sentAt: new Date(Date.now() - 40 * 60_000), polledAt: null })
        .where(eq(generationJobs.id, trabajo.id));
      await pasadaDeCola(h, "worker-uno");
      expect((await obtenerTrabajo(dana.id, trabajo.id)).estado).toBe("desconocido");
      return trabajo.id;
    };

    test("un segundo ajuste corrige de verdad lo apuntado, en lugar de sumar sobre lo anterior", async () => {
      const id = await trabajoSinRespuesta();
      expect((await depositoDe(dana.id)).reservado).toBe(4);

      // Primera resolución: quien administra comprueba que el proveedor cobró 9 créditos.
      await ajustarGasto(id, 9, "La tarea aparece cobrada en el panel de KIE.", dana.id);
      expect((await depositoDe(dana.id)).consumido).toBe(9);
      expect((await depositoDe(dana.id)).reservado).toBe(0);

      // Segunda: resulta que el cobro real eran 4. El ajuste lleva la diferencia, no el importe entero.
      await ajustarGasto(id, 4, "Revisado: la factura de KIE dice 4 créditos, no 9.", dana.id);

      expect((await depositoDe(dana.id)).consumido).toBe(4);
      // Y una tercera resolución al mismo importe no mueve nada.
      await ajustarGasto(id, 4, "Confirmado otra vez con la factura de KIE.", dana.id);
      expect((await depositoDe(dana.id)).consumido).toBe(4);
    });
  });

  describe("ajustes guardados como JSON de verdad", () => {
    test("un número y un booleano no se guardan como cadena", async () => {
      await guardarAjustes({ cuotaMb: 3072, registroAbierto: true }, null);
      const filas = await db().execute<{ key: string; tipo: string }>(
        sql`select key, jsonb_typeof(value) as tipo from settings where key in ('cuotaMb', 'registroAbierto')`,
      );
      const porClave = new Map((filas as unknown as { key: string; tipo: string }[]).map((f) => [f.key, f.tipo]));
      expect(porClave.get("cuotaMb")).toBe("number");
      expect(porClave.get("registroAbierto")).toBe("boolean");
      // Y la aplicación sigue leyendo lo mismo que ha escrito.
      expect((await leerAjustes()).cuotaMb).toBe(3072);
      await guardarAjustes({ cuotaMb: 2048 }, null);
    });

    test("un objeto se guarda como objeto y se puede consultar dentro con jsonb", async () => {
      const clave = `prueba-jsonb-${crypto.randomUUID().slice(0, 8)}`;
      await db()
        .insert(settings)
        .values({ key: clave, value: { modo: "estricto", intentos: 3 } });
      try {
        const filas = await db().execute<{ tipo: string; modo: string }>(
          sql`select jsonb_typeof(value) as tipo, value->>'modo' as modo from settings where key = ${clave}`,
        );
        const fila = (filas as unknown as { tipo: string; modo: string }[])[0];
        expect(fila?.tipo).toBe("object");
        expect(fila?.modo).toBe("estricto");
        // Y al leerlo con Drizzle vuelve a ser un objeto, no una cadena con JSON dentro.
        const [leida] = await db().select().from(settings).where(eq(settings.key, clave));
        expect(leida?.value).toEqual({ modo: "estricto", intentos: 3 });
      } finally {
        await db().delete(settings).where(eq(settings.key, clave));
      }
    });

    test("la entrada de los trabajos también es jsonb consultable", async () => {
      await limpiarTrabajos();
      const { trabajo } = await crearFotograma(actor, peticion(), h);
      const filas = await db().execute<{ tipo: string; prompt: string }>(
        sql`select jsonb_typeof(input) as tipo, input->>'prompt' as prompt
            from generation_jobs where id = ${trabajo.id}`,
      );
      const fila = (filas as unknown as { tipo: string; prompt: string }[])[0];
      expect(fila?.tipo).toBe("object");
      expect(fila?.prompt).toBe(ESCENA);
    });
  });

  describe("el tope de trabajos simultáneos sale de los ajustes", () => {
    beforeEach(limpiarTrabajos);

    test("con el tope a uno, el segundo trabajo espera", async () => {
      await guardarAjustes({ trabajosSimultaneos: 1 }, null);
      try {
        await crearFotograma(actor, peticion(), h);
        const error = await crearFotograma(actor, peticion(), h).catch((e) => e);
        expect(error.estado).toBe(429);
        expect(error.message).toContain("máximo de esta instalación");
      } finally {
        await guardarAjustes({ trabajosSimultaneos: 10 }, null);
      }
    });
  });

  test("la pasada de la cola envía, avanza y no toca trabajos de otros estados", async () => {
    await limpiarTrabajos();
    const { trabajo } = await crearFotograma(actor, peticion(), h);
    const primera = await pasadaDeCola(h, "worker-de-prueba");
    expect(primera.enviados).toBe(1);

    const enviado = await obtenerTrabajo(dana.id, trabajo.id);
    terminar(enviado.taskId as string, ["https://tempfile.kie.ai/pasada.png"], 4);
    await db().update(generationJobs).set({ polledAt: null }).where(eq(generationJobs.id, trabajo.id));

    const segunda = await pasadaDeCola(h, "worker-de-prueba");

    expect(segunda.enviados).toBe(0);
    expect(segunda.avanzados).toBeGreaterThanOrEqual(1);
    const [fila] = await db()
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.id, trabajo.id), eq(generationJobs.state, "listo")));
    expect(fila?.resultMediaId).not.toBeNull();
    expect(fila?.consumedCredits).toBe(4);
  });
});
