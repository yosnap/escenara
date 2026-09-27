import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { EvaluacionVista } from "@/lib/controles";
import type { PersonajeVista } from "@/lib/personajes";

/**
 * Controles previos de generación (RF12, 0.18.0) contra el PostgreSQL y el SeaweedFS locales
 * (`bun run services:up`).
 *
 * **Ningún test llama a KIE**: el proveedor se simula y la clave es inventada.
 *
 * Lo que comprueba, uno por uno, los criterios de aceptación de la fase:
 *
 * - credencial inválida, formato incompatible y presupuesto insuficiente **bloquean**, cada uno con su motivo
 *   y su acción;
 * - un «Bloqueado» **no se puede confirmar**, ni con la acción del usuario ni mandando su clave por la API;
 * - un «Necesita ajustes» sí, y solo con la confirmación expresa de ese aviso;
 * - la evaluación queda guardada con su estado y su versión de reglas;
 * - **ningún** encolado ocurre sin pasar por el motor (se cuentan las dos cosas);
 * - la lectura del panel no mueve ni un céntimo.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_controles");
}

const { and, eq, sql } = await import("drizzle-orm");
const rutaTrabajos = await import("@/app/api/generacion/trabajos/route");
const rutaControles = await import("@/app/api/generacion/controles/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { controlEvaluations, generationJobs, models, providerCredentials, usageLedger, users } = await import(
  "../db/esquema"
);
const { guardarCredencial } = await import("../boveda/credenciales");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { crearMedio } = await import("../media/servicio");
const { olvidarSaldos } = await import("../generacion/estimacion");
const { RITMO_ENVIOS } = await import("../generacion/comprobaciones");
const { dentroDelLimite } = await import("../limite");
const { exigirPresupuestoDisponible } = await import("../presupuesto/reserva");
const { olvidarCatalogo } = await import("../proveedores/catalogo");
const { REGLAS_VERSION } = await import("./contrato");
const { evaluarControles } = await import("./consulta");
const { hechosDePersonajeCitado } = await import("./hechos");
const { crearFotograma } = await import("../generacion/servicio");
type ErrorConEstado = { estado: number; message: string };
type Actor = import("../media/servicio").Actor;
type Buscador = import("../proveedores/codigos").Buscador;

const CLAVE = "sk-ana-clave-de-kie-inventada-aaaa";
const CLAVE_BETO = "sk-beto-clave-de-kie-inventada-bbbb";
const ESCENA = "En una cafetería luminosa, saluda a cámara con una sonrisa.";
/** Modelo predeterminado de `image_edit` en el catálogo sembrado, y lo que cuesta un fotograma con él. */
const MODELO_FOTOGRAMA = "nano-banana-2-lite";
const CREDITOS_FOTOGRAMA = 4;

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

/** Proveedor simulado: solo hace falta el saldo, porque ningún test llega a crear una tarea. */
let saldo = 5000;
/** El resultado no se descarga en ningún test: ninguno llega a tener uno. */
const fallarDescarga = async () => {
  throw new Error("Ningún test de controles llega a descargar un resultado.");
};

const buscar: Buscador = async (url) => {
  if (url.includes("/chat/credit")) return sobre(saldo);
  if (url.includes("file-stream-upload")) return sobre({ downloadUrl: "https://tempfile.kie.ai/referencia.png" });
  throw new Error(`URL no simulada: ${url}`);
};

function bytes(datos: Uint8Array): Uint8Array<ArrayBuffer> {
  const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
  copia.set(datos);
  return copia;
}

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

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
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

describe.skipIf(!hayBaseDeDatos)("controles previos de generación", () => {
  let ana: Sesion;
  let actorAna: Actor;
  let referencia: string;
  let personajeId: string;

  beforeAll(async () => {
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    actorAna = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    referencia = (await crearMedio(actorAna, new File([await fotoDeReferencia()], "suelta.png", { type: "image/png" })))
      .id;
    personajeId = (await nuevoPersonaje()).id;
  });

  afterAll(async () => {
    if (ana?.email) await db().delete(users).where(eq(users.email, ana.email));
  });

  beforeEach(async () => {
    saldo = 5000;
    olvidarSaldos();
    // Cada test empieza con la cuenta limpia: ni trabajos vivos que topen los simultáneos ni reservas.
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(usageLedger).where(eq(usageLedger.userId, ana.id));
    await db().delete(controlEvaluations).where(eq(controlEvaluations.userId, ana.id));
  });

  /** Personaje de Ana con tres fotos y su consentimiento propio: puede generar. */
  async function nuevoPersonaje(): Promise<PersonajeVista> {
    const creado = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", { nombre: "Lucía", tipo: "persona" }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const personaje = (await creado.json()) as PersonajeVista;
    const ids = await Promise.all(
      Array.from({ length: 3 }, async (_, i) => {
        const medio = await crearMedio(
          actorAna,
          new File([await fotoDeReferencia()], `lucia-${i}.png`, { type: "image/png" }),
        );
        return { medioId: medio.id };
      }),
    );
    expect(
      (
        await rutaReferencias.POST(
          pedir(ana, `/api/personajes/${personaje.id}/referencias`, "POST", { referencias: ids }),
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

  /** Confirmación de un fotograma con la imagen suelta, tal como la manda «Crear». */
  const confirmacion = (extra: Record<string, unknown> = {}) => ({
    tipo: "fotograma",
    medioId: referencia,
    prompt: ESCENA,
    creditosConfirmados: CREDITOS_FOTOGRAMA,
    derechos: true,
    claveIdempotencia: crypto.randomUUID(),
    ...extra,
  });

  /**
   * Envía la generación con el proveedor simulado. Se llama al servicio y no a la ruta a propósito: la ruta usa
   * el `fetch` de verdad para leer el saldo, y ningún test de esta casa sale a internet. La ruta se prueba
   * aparte, donde lo que importa es su validación de entrada.
   */
  const enviar = async (cuerpo: Record<string, unknown>) => {
    const peticion = cuerpo as unknown as Parameters<typeof crearFotograma>[1];
    try {
      const envio = await crearFotograma(actorAna, peticion, { buscar, descargar: fallarDescarga });
      return { estado: envio.nueva ? 201 : 200, cuerpo: { id: envio.trabajo.id } as { error?: string; id?: string } };
    } catch (error) {
      const fallo = error as ErrorConEstado;
      return { estado: fallo.estado ?? 500, cuerpo: { error: fallo.message } };
    }
  };

  /** Lee el panel con el proveedor simulado. Es una lectura pura. */
  const leerControles = (parametros: Record<string, string>): Promise<EvaluacionVista> =>
    evaluarControles(
      actorAna,
      {
        tipo: parametros.tipo === "animacion" ? "animacion" : "fotograma",
        personajeId: parametros.personajeId ?? null,
        medioId: parametros.medioId ?? null,
      },
      buscar,
    );

  const trabajosDeAna = async () => {
    const [fila] = await db()
      .select({ total: sql<number>`count(*)::int` })
      .from(generationJobs)
      .where(eq(generationJobs.userId, ana.id));
    return fila?.total ?? 0;
  };

  const evaluacionesDeAna = () => db().select().from(controlEvaluations).where(eq(controlEvaluations.userId, ana.id));

  const apuntesDeAna = async () => {
    const [fila] = await db()
      .select({ total: sql<number>`count(*)::int` })
      .from(usageLedger)
      .where(eq(usageLedger.userId, ana.id));
    return fila?.total ?? 0;
  };

  const marcarCredencial = (estado: "valida" | "invalida") =>
    db()
      .update(providerCredentials)
      .set({ status: estado })
      .where(and(eq(providerCredentials.userId, ana.id), eq(providerCredentials.provider, "kie")));

  /** Cambia las fotos de referencia que declara el modelo en el catálogo: es el «formato incompatible». */
  const referenciasDelModelo = async (maximo: number) => {
    const [fila] = await db().select().from(models).where(eq(models.modelId, MODELO_FOTOGRAMA)).limit(1);
    if (!fila) throw new Error("Falta el modelo de la semilla.");
    const params = { ...(JSON.parse(fila.parameters) as Record<string, unknown>), maximoReferencias: maximo };
    await db()
      .update(models)
      .set({ parameters: JSON.stringify(params) })
      .where(eq(models.id, fila.id));
    olvidarCatalogo();
  };

  // ── Los tres frenos duros que pide la fase ─────────────────────────────────────────────────────────────

  test("una credencial no válida bloquea el envío, con su motivo y su acción", async () => {
    await marcarCredencial("invalida");
    try {
      const evaluacion = await leerControles({ tipo: "fotograma" });
      expect(evaluacion.estado).toBe("bloqueado");
      const freno = evaluacion.comprobaciones.find((c) => c.regla === "credencial");
      expect(freno?.motivo).toContain("no válida");
      expect(freno?.accion).toContain("Tu cuenta");
      expect(freno?.confirmable).toBe(false);
      expect(freno?.enlace).toBe("/cuenta");

      const { estado, cuerpo } = await enviar(confirmacion());
      expect(estado).toBe(409);
      expect(cuerpo.error).toContain("no válida");
      expect(await trabajosDeAna()).toBe(0);
    } finally {
      await marcarCredencial("valida");
    }
  });

  test("un modelo que no acepta fotos de referencia bloquea generar con un personaje", async () => {
    await referenciasDelModelo(0);
    try {
      const evaluacion = await leerControles({ tipo: "fotograma", personajeId });
      expect(evaluacion.estado).toBe("bloqueado");
      const freno = evaluacion.comprobaciones.find((c) => c.regla === "modelo-sin-referencias");
      expect(freno?.motivo).toContain("no acepta fotos de referencia");
      expect(freno?.accion.trim()).not.toBe("");

      const { estado, cuerpo } = await enviar(confirmacion({ medioId: undefined, personajeId, sinTerceros: true }));
      expect(estado).toBe(400);
      expect(cuerpo.error).toContain("no acepta fotos de referencia");
      expect(await trabajosDeAna()).toBe(0);
    } finally {
      await referenciasDelModelo(10);
    }
  });

  test("un presupuesto por trabajo insuficiente bloquea el envío, con su motivo y su acción", async () => {
    await guardarAjustes({ presupuestoTrabajo: 1 }, null);
    try {
      const evaluacion = await leerControles({ tipo: "fotograma" });
      expect(evaluacion.estado).toBe("bloqueado");
      const freno = evaluacion.comprobaciones.find((c) => c.regla === "tope-trabajo");
      expect(freno?.motivo).toContain("tope por trabajo");
      expect(freno?.accion.trim()).not.toBe("");

      const { estado, cuerpo } = await enviar(confirmacion());
      expect(estado).toBe(402);
      expect(cuerpo.error).toContain("tope por trabajo");
      expect(await trabajosDeAna()).toBe(0);
    } finally {
      await guardarAjustes({ presupuestoTrabajo: 500 }, null);
    }
  });

  // ── Un «Bloqueado» no se salta nunca ───────────────────────────────────────────────────────────────────

  test("un bloqueo no se puede confirmar ni mandando su clave de regla por la API", async () => {
    await marcarCredencial("invalida");
    try {
      // Se manda **todo** el catálogo de claves como si fueran avisos confirmados: un cliente malicioso que
      // hubiera leído el código. Ninguna de ellas puede abrir la puerta.
      const { estado, cuerpo } = await enviar(
        confirmacion({
          avisosConfirmados: ["credencial", "tope-trabajo", "consentimiento", "saldo", "cuota", "plan-sin-aprobar"],
        }),
      );
      expect(estado).toBe(409);
      expect(cuerpo.error).toContain("no válida");
      expect(await trabajosDeAna()).toBe(0);
      // Y la evaluación queda registrada con lo que se intentó confirmar: es lo que hace auditable el intento.
      const filas = await evaluacionesDeAna();
      expect(filas).toHaveLength(1);
      expect(filas[0]?.state).toBe("bloqueado");
      expect(filas[0]?.confirmed).toContain("credencial");
    } finally {
      await marcarCredencial("valida");
    }
  });

  test("una clave de aviso inventada se rechaza en la ruta, antes de llegar al motor", async () => {
    const respuesta = await rutaTrabajos.POST(
      pedir(ana, "/api/generacion/trabajos", "POST", confirmacion({ avisosConfirmados: ["'; drop table media; --"] })),
      undefined,
    );
    expect(respuesta.status).toBe(400);
    expect(await trabajosDeAna()).toBe(0);
  });

  test("la ruta de lectura acota los identificadores que recibe", async () => {
    for (const consulta of ["tipo=fotograma&personajeId=no-es-un-uuid", "tipo=loquesea", "tipo=fotograma&medioId=1"]) {
      const respuesta = await rutaControles.GET(pedir(ana, `/api/generacion/controles?${consulta}`), undefined);
      expect(respuesta.status).toBe(400);
    }
  });

  // ── Un «Necesita ajustes» sí, con confirmación expresa ─────────────────────────────────────────────────

  test("un aviso salvable exige confirmación expresa, y con ella el envío pasa", async () => {
    // El aviso de cobertura viene apagado de fábrica: se enciende a propósito para este recorrido.
    await guardarAjustes({ controlesExigirCoberturaVistas: true }, null);
    try {
      const evaluacion = await leerControles({ tipo: "fotograma", personajeId });
      expect(evaluacion.estado).toBe("ajustes");
      const aviso = evaluacion.comprobaciones.find((c) => c.regla === "referencias-cobertura");
      expect(aviso?.confirmable).toBe(true);
      expect(aviso?.motivo).toContain("no cubren todas las vistas recomendadas");
      expect(aviso?.accion.trim()).not.toBe("");

      const sinConfirmar = await enviar(confirmacion({ medioId: undefined, personajeId, sinTerceros: true }));
      expect(sinConfirmar.estado).toBe(409);
      expect(sinConfirmar.cuerpo.error).toContain("confírmalo expresamente");
      expect(await trabajosDeAna()).toBe(0);

      const confirmado = await enviar(
        confirmacion({
          medioId: undefined,
          personajeId,
          sinTerceros: true,
          avisosConfirmados: ["referencias-cobertura"],
        }),
      );
      expect(confirmado.estado).toBe(201);
      expect(await trabajosDeAna()).toBe(1);
    } finally {
      await guardarAjustes({ controlesExigirCoberturaVistas: false }, null);
    }
  });

  test("un personaje que el trabajo cita y cuya ficha ya no está bloquea, no pasa por el hueco", async () => {
    // Pasa si se borra el personaje entre que se resuelve el envío y que se evalúa. Tratarlo como «sin
    // personaje» sería saltarse la puerta del consentimiento por un borrado a medias.
    const evaluacion = await evaluarControles(
      actorAna,
      { tipo: "fotograma", personajeId: null, medioId: null },
      buscar,
    );
    expect(evaluacion.estado).toBe("listo");
    const conFantasma = await hechosDePersonajeCitado(crypto.randomUUID());
    expect(conFantasma.impedimentos.length).toBeGreaterThan(0);
    expect(conFantasma.nombre).not.toBe("");
  });

  // ── El ritmo va antes del motor ────────────────────────────────────────────────────────────────────────

  test("un bucle de envíos rechazados por el motor acaba en 429 y deja de evaluar", async () => {
    /**
     * El ritmo se comprueba **después** del corte de idempotencia y **antes** del motor. Sin ese orden, un bucle
     * de envíos que el motor va a rechazar seguiría leyendo el saldo y escribiendo una fila de
     * `control_evaluations` por intento: un rechazo no puede ser más barato de pedir que de atender.
     *
     * Se usa un usuario propio para no gastarle el ritmo a los demás tests, y se agota el contador casi del todo
     * en lugar de dar 40 vueltas.
     */
    const beto = await crearSesionDePrueba("user");
    const actorBeto: Actor = { id: beto.id, esAdmin: false };
    try {
      await guardarCredencial(beto.id, "kie", CLAVE_BETO, buscar);
      const suya = (
        await crearMedio(actorBeto, new File([await fotoDeReferencia()], "beto.png", { type: "image/png" }))
      ).id;
      // Su clave no sirve: **todos** los envíos los va a rechazar el motor con 409.
      await db()
        .update(providerCredentials)
        .set({ status: "invalida" })
        .where(and(eq(providerCredentials.userId, beto.id), eq(providerCredentials.provider, "kie")));

      // Se dejan libres 2 de los 40 envíos de la ventana.
      for (let i = 0; i < RITMO_ENVIOS.maximo - 2; i++) {
        await dentroDelLimite(`generacion:envio:${beto.id}`, RITMO_ENVIOS);
      }

      const estados: number[] = [];
      for (let i = 0; i < 5; i++) {
        const peticion = { ...confirmacion({ medioId: suya }), claveIdempotencia: crypto.randomUUID() };
        try {
          await crearFotograma(actorBeto, peticion as unknown as Parameters<typeof crearFotograma>[1], {
            buscar,
            descargar: fallarDescarga,
          });
          estados.push(201);
        } catch (error) {
          estados.push((error as ErrorConEstado).estado ?? 500);
        }
      }

      // Los dos primeros pasan el ritmo y los rechaza el motor; los tres siguientes ni llegan.
      expect(estados).toEqual([409, 409, 429, 429, 429]);
      const evaluaciones = await db().select().from(controlEvaluations).where(eq(controlEvaluations.userId, beto.id));
      // **Una por intento que pasó el ritmo**, no una por intento: es lo que este orden compra.
      expect(evaluaciones).toHaveLength(2);
      expect(evaluaciones.every((e) => e.state === "bloqueado")).toBe(true);
      const [{ total } = { total: 0 }] = await db()
        .select({ total: sql<number>`count(*)::int` })
        .from(generationJobs)
        .where(eq(generationJobs.userId, beto.id));
      expect(total).toBe(0);
    } finally {
      await db().delete(users).where(eq(users.email, beto.email));
    }
  });

  test("repetir una confirmación ya encolada no gasta ritmo ni evalúa otra vez", async () => {
    // El corte de idempotencia va **antes** del ritmo: un reintento tras un error de red no puede acercar al
    // usuario a su tope de envíos ni escribir una segunda evaluación del mismo trabajo.
    const repetida = confirmacion();
    expect((await enviar(repetida)).estado).toBe(201);
    const antes = await evaluacionesDeAna();
    for (let i = 0; i < 3; i++) expect((await enviar(repetida)).estado).toBe(200);
    expect(await evaluacionesDeAna()).toHaveLength(antes.length);
  });

  // ── Los dos controles del tope por trabajo miden lo mismo ──────────────────────────────────────────────

  test("el tope por trabajo se mide con el total del envío también en la reserva", async () => {
    /**
     * Decisión provisional del propietario (2026-09-27): la generación y su traducción son **un solo envío** para
     * quien paga, así que el tope por trabajo se mide sobre la suma en los dos sitios. Antes el motor medía el
     * total y la reserva medía solo el modelo, y con la traducción encendida podían discrepar.
     *
     * Con presupuesto por usuario a 0 no hay disponibilidad que sumar, así que esto comprueba justo el tope.
     */
    const ajustes = { ...(await leerAjustes()), presupuestoCreditos: 0, presupuestoTrabajo: 5 };
    // El modelo cabe (4 ≤ 5) pero el envío completo no (4 + 3 de traducción = 7 > 5): tiene que rechazarse.
    const fallo = await exigirPresupuestoDisponible(db(), ana.id, 4, ajustes, 7).catch((e: unknown) => e);
    expect((fallo as ErrorConEstado).estado).toBe(402);
    expect((fallo as ErrorConEstado).message).toContain("tope por trabajo");
    // Y midiendo solo el modelo, como antes, pasaría: es exactamente la discrepancia que se ha cerrado.
    await expect(exigirPresupuestoDisponible(db(), ana.id, 4, ajustes)).resolves.toBeUndefined();
  });

  // ── Lo que queda guardado ──────────────────────────────────────────────────────────────────────────────

  test("la evaluación se guarda con su estado y su versión de reglas", async () => {
    const { estado } = await enviar(confirmacion());
    expect(estado).toBe(201);
    const filas = await evaluacionesDeAna();
    expect(filas).toHaveLength(1);
    expect(filas[0]?.state).toBe("listo");
    expect(filas[0]?.rulesVersion).toBe(REGLAS_VERSION);
    expect(filas[0]?.subject).toBe("trabajo");
    expect(filas[0]?.jobKind).toBe("fotograma");
    expect(filas[0]?.rules).toEqual([]);
    expect(filas[0]?.confirmed).toEqual([]);
  });

  test("ningún trabajo llega a la cola sin una evaluación del motor", async () => {
    // Se intercepta contando las dos cosas: cada encolado deja **exactamente** una evaluación, así que un
    // camino que encolara sin pasar por la puerta desequilibraría la cuenta.
    expect((await enviar(confirmacion())).estado).toBe(201);
    expect((await enviar(confirmacion())).estado).toBe(201);
    // Repetir la misma clave no encola nada nuevo **ni evalúa otra vez**: la idempotencia va antes.
    const repetida = confirmacion();
    expect((await enviar(repetida)).estado).toBe(201);
    expect((await enviar(repetida)).estado).toBe(200);

    expect(await trabajosDeAna()).toBe(3);
    expect(await evaluacionesDeAna()).toHaveLength(3);
  });

  // ── La lectura es lectura ──────────────────────────────────────────────────────────────────────────────

  test("mirar el panel no encola nada, no apunta gasto y no guarda ninguna evaluación", async () => {
    const casos: Record<string, string>[] = [
      { tipo: "fotograma" },
      { tipo: "fotograma", personajeId },
      { tipo: "fotograma", medioId: referencia },
      { tipo: "animacion" },
    ];
    for (const parametros of casos) {
      const evaluacion = await leerControles(parametros);
      expect(evaluacion.reglasVersion).toBe(REGLAS_VERSION);
    }
    expect(await trabajosDeAna()).toBe(0);
    expect(await apuntesDeAna()).toBe(0);
    expect(await evaluacionesDeAna()).toHaveLength(0);
  });

  test("con todo en orden el panel dice «listo» y no enumera ningún freno", async () => {
    const evaluacion = await leerControles({ tipo: "fotograma", medioId: referencia });
    expect(evaluacion.estado).toBe("listo");
    expect(evaluacion.comprobaciones).toEqual([]);
  });

  test("sin saldo suficiente en el proveedor el panel bloquea, y el envío también", async () => {
    saldo = 1;
    olvidarSaldos();
    const evaluacion = await leerControles({ tipo: "fotograma" });
    const freno = evaluacion.comprobaciones.find((c) => c.regla === "saldo");
    expect(evaluacion.estado).toBe("bloqueado");
    expect(freno?.motivo).toContain("necesita");
    expect(freno?.accion).toContain("Recarga");

    const { estado } = await enviar(confirmacion());
    expect(estado).toBe(402);
    expect(await trabajosDeAna()).toBe(0);
  });

  test("el panel no devuelve nunca el prompt compuesto ni ninguna clave", async () => {
    // ADR-0022: lo que sale hacia el navegador son motivos y acciones escritos para el usuario, nunca el texto
    // que se le envía al proveedor.
    await guardarAjustes({ controlesExigirCoberturaVistas: true }, null);
    try {
      const texto = JSON.stringify(await leerControles({ tipo: "fotograma", personajeId }));
      expect(texto).not.toContain("prompt");
      expect(texto).not.toContain(CLAVE);
    } finally {
      await guardarAjustes({ controlesExigirCoberturaVistas: false }, null);
    }
  });
});
