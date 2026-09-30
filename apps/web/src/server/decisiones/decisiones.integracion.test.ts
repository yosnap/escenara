import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Registro de decisiones y sombra contra el PostgreSQL local.
 *
 * **Ningún test llama a TypeSafe**: Jev se simula por el mismo punto de inyección que la coherencia
 * (`HERRAMIENTAS_JEV`), con respuestas grabadas, y la clave es inventada. Lo que se comprueba:
 *
 * - cada punto de decisión del motor (la puerta completa y la de frenos duros) guarda evidencia, umbrales, versión de
 *   reglas, puerta y acción, sin nombres de personas;
 * - con la sombra apagada no se llama a nadie ni se apunta nada;
 * - la puerta contesta **sin esperar a Jev**, y un fallo, un error o un tiempo agotado no cambian la decisión;
 * - la clave nunca se guarda ni sale en el registro del servidor;
 * - las métricas salen de revisiones humanas de verdad.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_decisiones");
}

const { eq } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { claims, coherenceDecisions, controlEvaluations, projects, rateLimits, scenes, shadowEvaluations, users } =
  await import("../db/esquema");
const { guardarAjustes } = await import("../ajustes");
const { guardarSecreto, quitarSecreto } = await import("../boveda/secretos");
const { HERRAMIENTAS_JEV } = await import("../coherencia/decidir");
const { REGLAS_VERSION } = await import("../controles/contrato");
const { accionDelEnvio, exigirControles, exigirFrenosDuros } = await import("../controles/puerta");
const { evaluar } = await import("../controles/motor");
const { exigirTopeDelProyecto } = await import("../asistente/plan");
const { esperarSombras, evaluarEnSombra } = await import("./sombra");
const { decisionesRecientes, metricasDeLaSombra } = await import("./consulta");
const fixtures = await import("../coherencia/fixtures");
type Hechos = import("../controles/contrato").Hechos;

const CLAVE_JEV = "ts-clave-de-la-sombra-inventada-9876";

/** `noul` con un sí claro: el guion tiene algo que verificar. */
const JEV_AFIRMACION_SI = {
  model: "jev-1.13.0",
  answers: { coherencia: { type: "noul", noul: 0.93 } },
  usage: { input_tokens: 418, output_tokens: 8 },
};
/** `noul` con un no claro. */
const JEV_AFIRMACION_NO = {
  model: "jev-1.13.0",
  answers: { coherencia: { type: "noul", noul: 0.04 } },
  usage: { input_tokens: 405, output_tokens: 8 },
};

let llamadas = 0;
let responder: () => Promise<Response> = async () => fixtures.respuestaGrabada(JEV_AFIRMACION_NO);
const buscar = (async (entrada: string | URL | Request) => {
  const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url;
  if (!url.startsWith("https://api.typesafe.ai/")) throw new Error(`URL no simulada: ${url}`);
  llamadas++;
  return responder();
}) as unknown as typeof fetch;

const PARAMETROS = { exigirCoberturaVistas: false, exigirPrecioFresco: true, maximoAvisos: 3 };

/** Hechos completos y en orden, con nombres de personas para comprobar que no se guardan. */
const hechosEnOrden = (): Hechos => ({
  tipo: "fotograma",
  parametros: { ...PARAMETROS },
  credencial: { nombreProveedor: "KIE.ai", proveedorAdmitido: true, motivo: null, saldo: 500 },
  modelo: {
    nombre: "Nano Banana 2 Lite",
    maximoReferencias: 6,
    precioComprobado: "2026-09-27",
    precioCaducado: false,
    costeAcotado: true,
    motivoSinAcotar: "",
  },
  personaje: { nombre: "Lucía Pérez", impedimentos: [], vistasSinCubrir: [], referenciasSenaladas: 0 },
  presupuesto: {
    creditos: 10,
    topeTrabajo: 500,
    disponibleUsuario: 1000,
    retenidoUsuario: 0,
    trabajosEnRevision: 0,
    llamadasDeTextoColgadas: 0,
    revisionesColgadas: 0,
    autorizadoProyecto: 1000,
    comprometidoProyecto: 0,
  },
  cuota: { previstoBytes: 1_000, libresBytes: 10_000_000 },
  reparto: {
    formato: "solo",
    personajes: [{ nombre: "Lucía Pérez", inventado: false, impedimentos: [] }],
    mismaVoz: false,
    turnos: 0,
    clips: 1,
    palabrasDelClipMasLargo: 0,
    segundosPorClip: 4,
    sinRegistrar: [],
  },
  escena: {
    planAprobado: true,
    aprobada: true,
    motivoInvalidacion: "",
    guionEnClipMudo: false,
    precioCambiado: false,
    fichaCambiada: false,
    plantillaCambiada: false,
    afirmacionesPorVerificar: 0,
  },
});

describe.skipIf(!hayBaseDeDatos)("decisiones registradas y sombra", () => {
  let usuarioId = "";
  let proyectoId = "";
  let escenaId = "";

  const sujetoEscena = () => ({ usuarioId, sujeto: "escena" as const, sujetoId: escenaId, tipo: "fotograma" as const });
  const filasDe = async () => db().select().from(controlEvaluations).where(eq(controlEvaluations.userId, usuarioId));
  const sombrasDe = async () => db().select().from(shadowEvaluations).where(eq(shadowEvaluations.userId, usuarioId));

  beforeAll(async () => {
    await aplicarMigraciones();
    await db().delete(users);
    const sesion = await crearSesionDePrueba("user");
    usuarioId = sesion.id;
    HERRAMIENTAS_JEV.buscar = buscar;
  });

  beforeEach(async () => {
    await db().delete(controlEvaluations);
    await db().delete(coherenceDecisions);
    await db().delete(projects);
    const [proyecto] = await db()
      .insert(projects)
      .values({ userId: usuarioId, title: "Anuncio de crema", authorizedCredits: 50 })
      .returning();
    proyectoId = proyecto?.id ?? "";
    const [escena] = await db()
      .insert(scenes)
      .values({
        projectId: proyectoId,
        sortOrder: 1,
        scriptText: "Esta crema elimina el 90 % de las arrugas en una semana.",
        action: "Plano medio en un baño luminoso, sostiene el bote.",
      })
      .returning();
    escenaId = escena?.id ?? "";
    llamadas = 0;
    responder = async () => fixtures.respuestaGrabada(JEV_AFIRMACION_NO);
    await db().delete(rateLimits);
    await guardarAjustes(
      {
        sombraActiva: false,
        sombraEncargadoAceptado: false,
        sombraAfirmaciones: true,
        coherenciaEurosPorMillonTokens: 0,
      },
      null,
    );
    await quitarSecreto("typesafeApiKey");
  });

  afterEach(async () => {
    await esperarSombras();
  });

  afterAll(async () => {
    HERRAMIENTAS_JEV.buscar = undefined;
    await esperarSombras();
  });

  test("la puerta completa guarda evidencia, umbrales, versión de reglas, puerta y acción, sin nombres", async () => {
    await exigirControles(sujetoEscena(), hechosEnOrden());
    const [fila] = await filasDe();
    expect(fila?.rulesVersion).toBe(REGLAS_VERSION);
    expect(fila?.gate).toBe("envio");
    expect(fila?.action).toBe("permite");
    expect(fila?.thresholds).toEqual(PARAMETROS);
    expect(fila?.evidence).toHaveProperty("modelo.nombre", "Nano Banana 2 Lite");
    expect(fila?.evidence).toHaveProperty("presupuesto.creditos", 10);
    expect(fila?.evidence).not.toHaveProperty("parametros");
    expect(JSON.stringify(fila?.evidence)).not.toContain("Lucía");
  });

  test("un aviso sin confirmar se guarda como «pide confirmación» y confirmado como «permite»", async () => {
    const hechos = hechosEnOrden();
    if (hechos.modelo) hechos.modelo.precioCaducado = true;
    await expect(exigirControles(sujetoEscena(), hechos)).rejects.toThrow();
    const regla = evaluar(hechos).frenos[0]?.regla ?? "";
    await exigirControles(sujetoEscena(), hechos, [regla]);
    const acciones = (await filasDe()).map((f) => f.action).sort();
    expect(acciones).toEqual(["permite", "pide-confirmacion"]);
    expect(accionDelEnvio(evaluar(hechos), [], 0)).toBe("rechaza");
  });

  test("la puerta de frenos duros y el tope del proyecto también quedan registrados", async () => {
    const hechos = hechosEnOrden();
    if (hechos.escena) hechos.escena.afirmacionesPorVerificar = 2;
    await expect(
      exigirFrenosDuros(sujetoEscena(), { tipo: "fotograma", parametros: PARAMETROS, escena: hechos.escena }),
    ).rejects.toThrow("afirmaciones sin verificar");
    // 50 autorizados y 80 pedidos: el tope del proyecto frena la llamada al asistente de guion.
    await expect(exigirTopeDelProyecto(usuarioId, proyectoId, 80)).rejects.toThrow();
    const filas = await filasDe();
    expect(filas).toHaveLength(2);
    for (const fila of filas) {
      expect(fila.gate).toBe("frenos");
      expect(fila.action).toBe("rechaza");
      expect(fila.rulesVersion).toBe(REGLAS_VERSION);
      expect(fila.thresholds).toEqual(PARAMETROS);
    }
    const tope = filas.find((f) => f.subject === "proyecto");
    expect(tope?.subjectId).toBe(proyectoId);
    expect(tope?.jobKind).toBe("asistente");
    expect(tope?.evidence).toHaveProperty("presupuesto.autorizadoProyecto", 50);
  });

  test("con la sombra apagada no se llama a nadie ni se guarda ninguna opinión", async () => {
    await guardarSecreto("typesafeApiKey", CLAVE_JEV, null);
    await exigirControles(sujetoEscena(), hechosEnOrden());
    await esperarSombras();
    expect(llamadas).toBe(0);
    expect(await sombrasDe()).toHaveLength(0);
  });

  test("encendida y sin clave, tampoco llama", async () => {
    await guardarAjustes({ sombraEncargadoAceptado: true, sombraActiva: true }, null);
    await exigirControles(sujetoEscena(), hechosEnOrden());
    await esperarSombras();
    expect(llamadas).toBe(0);
    expect(await sombrasDe()).toHaveLength(0);
  });

  test("encendida, la puerta contesta sin esperar a Jev y la opinión se guarda después", async () => {
    await guardarSecreto("typesafeApiKey", CLAVE_JEV, null);
    await guardarAjustes(
      { sombraEncargadoAceptado: true, sombraActiva: true, coherenciaEurosPorMillonTokens: 38.5 },
      null,
    );
    let soltar: () => void = () => {};
    const suelta = new Promise<void>((resolve) => {
      soltar = resolve;
    });
    responder = async () => {
      await suelta;
      return fixtures.respuestaGrabada(JEV_AFIRMACION_SI);
    };
    const evaluacion = await exigirControles(sujetoEscena(), hechosEnOrden());
    // La puerta ya ha dejado pasar y Jev todavía no ha contestado.
    expect(evaluacion.estado).toBe("listo");
    expect(await sombrasDe()).toHaveLength(0);
    soltar();
    await esperarSombras();
    const [sombra] = await sombrasDe();
    expect(llamadas).toBe(1);
    expect(sombra?.verdict).toBe("no_pasa");
    // Las reglas dejaron pasar y la sombra habría frenado: no coinciden.
    expect(sombra?.matchesEffective).toBe(false);
    expect(sombra?.inputTokens).toBe(418);
    expect(sombra?.costEur).toBeCloseTo((418 / 1_000_000) * 38.5, 8);
    expect(sombra?.evidence).toContain("Habría frenado");
  });

  test("el mismo guion no se paga dos veces: la opinión se reutiliza", async () => {
    await guardarSecreto("typesafeApiKey", CLAVE_JEV, null);
    await guardarAjustes({ sombraEncargadoAceptado: true, sombraActiva: true }, null);
    await exigirControles(sujetoEscena(), hechosEnOrden());
    await esperarSombras();
    await exigirControles({ ...sujetoEscena(), tipo: "animacion" }, hechosEnOrden());
    await esperarSombras();
    const sombras = await sombrasDe();
    expect(llamadas).toBe(1);
    expect(sombras).toHaveLength(2);
    expect(sombras.filter((s) => s.reusedFrom !== null)).toHaveLength(1);
  });

  test.each([
    ["un error del proveedor", async () => fixtures.respuestaGrabada({ error: "boom" }, 500), "error-proveedor"],
    [
      "un tiempo agotado",
      async () => Promise.reject(Object.assign(new Error("t"), { name: "TimeoutError" })),
      "tiempo-agotado",
    ],
    [
      "una respuesta que no se entiende",
      async () => fixtures.respuestaGrabada({ answers: {} }),
      "respuesta-inesperada",
    ],
  ] as const)("%s no cambia la decisión ni bloquea el flujo", async (_caso, fallo, codigo) => {
    await guardarSecreto("typesafeApiKey", CLAVE_JEV, null);
    await guardarAjustes({ sombraEncargadoAceptado: true, sombraActiva: true }, null);
    responder = fallo;
    const evaluacion = await exigirControles(sujetoEscena(), hechosEnOrden());
    expect(evaluacion.estado).toBe("listo");
    await esperarSombras();
    const [sombra] = await sombrasDe();
    expect(sombra?.error).toBe(codigo);
    expect(sombra?.verdict).toBeNull();
    expect(sombra?.matchesEffective).toBeNull();
    const [fila] = await filasDe();
    expect(fila?.action).toBe("permite");
  });

  test("un fallo inesperado dentro de la sombra tampoco llega a la puerta", async () => {
    await guardarSecreto("typesafeApiKey", CLAVE_JEV, null);
    await guardarAjustes({ sombraEncargadoAceptado: true, sombraActiva: true }, null);
    responder = async () => {
      throw new TypeError("fallo que no es de Jev");
    };
    const evaluacion = await exigirControles(sujetoEscena(), hechosEnOrden());
    expect(evaluacion.estado).toBe("listo");
    await esperarSombras();
  });

  test("la clave no se guarda, no sale en el registro del servidor ni en el panel", async () => {
    await guardarSecreto("typesafeApiKey", CLAVE_JEV, null);
    await guardarAjustes({ sombraEncargadoAceptado: true, sombraActiva: true }, null);
    // El proveedor devuelve la clave en su texto de error: no puede llegar a ningún sitio.
    responder = async () =>
      fixtures.respuestaGrabada({ error: { message: `invalid api key: ${CLAVE_JEV}`, type: "auth_error" } }, 401);
    const escritos: string[] = [];
    const originales = { error: console.error, warn: console.warn, log: console.log, info: console.info };
    for (const nivel of ["error", "warn", "log", "info"] as const) {
      console[nivel] = (...args: unknown[]) => escritos.push(args.map(String).join(" "));
    }
    try {
      await exigirControles(sujetoEscena(), hechosEnOrden());
      await esperarSombras();
    } finally {
      Object.assign(console, originales);
    }
    expect(escritos.join("\n")).not.toContain(CLAVE_JEV);
    const [sombra] = await sombrasDe();
    expect(sombra?.error).toBe("rechazada");
    expect(JSON.stringify(sombra)).not.toContain(CLAVE_JEV);
    expect(JSON.stringify(await decisionesRecientes())).not.toContain(CLAVE_JEV);
    expect(JSON.stringify(await metricasDeLaSombra())).not.toContain(CLAVE_JEV);
  });

  test("una escena sin texto, o un envío de «Crear», no se evalúan", async () => {
    await guardarSecreto("typesafeApiKey", CLAVE_JEV, null);
    await guardarAjustes({ sombraEncargadoAceptado: true, sombraActiva: true }, null);
    const base = { evaluacionId: "", usuarioId, reglaAfirmaciones: false };
    expect(await evaluarEnSombra({ ...base, sujeto: "trabajo", sujetoId: null })).toBe("sin-escena");
    await db().update(scenes).set({ scriptText: "", action: "" }).where(eq(scenes.id, escenaId));
    expect(await evaluarEnSombra({ ...base, sujeto: "escena", sujetoId: escenaId })).toBe("sin-texto");
    expect(llamadas).toBe(0);
  });

  test("pasado el tope diario no se paga ninguna evaluación más", async () => {
    await guardarSecreto("typesafeApiKey", CLAVE_JEV, null);
    await guardarAjustes({ sombraEncargadoAceptado: true, sombraActiva: true, sombraEvaluacionesPorDia: 1 }, null);
    await exigirControles(sujetoEscena(), hechosEnOrden());
    await esperarSombras();
    await db().update(scenes).set({ scriptText: "Otro guion distinto." }).where(eq(scenes.id, escenaId));
    await exigirControles(sujetoEscena(), hechosEnOrden());
    await esperarSombras();
    expect(llamadas).toBe(1);
    await guardarAjustes({ sombraEvaluacionesPorDia: 100 }, null);
  });

  test("las métricas salen de las afirmaciones resueltas, con cada escena una sola vez", async () => {
    await guardarSecreto("typesafeApiKey", CLAVE_JEV, null);
    await guardarAjustes({ sombraEncargadoAceptado: true, sombraActiva: true }, null);

    // Escena 1: la sombra dejaría pasar y la persona **verificó** una afirmación del guion → falso permiso.
    await exigirControles(sujetoEscena(), hechosEnOrden());
    await esperarSombras();
    // Y el clip y la voz de la misma escena reutilizan la opinión: la escena cuenta una sola vez.
    await exigirControles({ ...sujetoEscena(), tipo: "animacion" }, hechosEnOrden());
    await exigirControles({ ...sujetoEscena(), tipo: "voz" }, hechosEnOrden());
    await esperarSombras();
    await db()
      .insert(claims)
      .values({ sceneId: escenaId, text: "elimina el 90 %", kind: "cifra", state: "verificada" });

    // Escena 2: la sombra frenaría y la persona **descartó** la afirmación («no aplica») → bloqueo innecesario.
    const [otra] = await db()
      .insert(scenes)
      .values({ projectId: proyectoId, sortOrder: 2, scriptText: "Llévatela hoy con un 50 % de descuento." })
      .returning();
    responder = async () => fixtures.respuestaGrabada(JEV_AFIRMACION_SI);
    await exigirControles({ ...sujetoEscena(), sujetoId: otra?.id ?? "" }, hechosEnOrden());
    await esperarSombras();
    await db()
      .insert(claims)
      .values({ sceneId: otra?.id ?? "", text: "50 % de descuento", kind: "cifra", state: "descartada" });

    // Escena 3: con una afirmación sin resolver no hay etiqueta independiente.
    const [tercera] = await db()
      .insert(scenes)
      .values({ projectId: proyectoId, sortOrder: 3, scriptText: "Recomendada por el 9 de cada 10 dermatólogos." })
      .returning();
    await exigirControles({ ...sujetoEscena(), sujetoId: tercera?.id ?? "" }, hechosEnOrden());
    await esperarSombras();
    await db()
      .insert(claims)
      .values({ sceneId: tercera?.id ?? "", text: "9 de cada 10", kind: "cifra" });

    // El resultado (coherencia de la 0.24.0): «encaja» y la persona dice que se equivoca → falso permiso.
    await db().insert(coherenceDecisions).values({
      userId: usuarioId,
      check: "resultado",
      mode: "sombra",
      subject: "escena",
      subjectId: escenaId,
      verdict: "pasa",
      confidence: 0.9,
      threshold: 0.75,
      fit: 0.9,
      probabilities: {},
      evidence: "Encaja.",
      decisionModel: "jev-1.13.0",
      rulesVersion: "coherencia-4",
      correction: "se_equivoca",
    });

    const [guion, resultado] = await metricasDeLaSombra();
    expect(guion?.pregunta).toBe("afirmacion_verificable");
    expect(guion?.encendida).toBe(true);
    expect(guion?.etiquetaIndependiente).toBe(true);
    expect(guion?.total).toBe(5);
    expect(guion?.escenas).toBe(3);
    expect(guion?.etiquetadas).toBe(2);
    expect(guion?.falsosPermisos).toBe(1);
    expect(guion?.bloqueosInnecesarios).toBe(1);
    expect(guion?.aciertos).toBe(0);
    // Se compara con la regla de afirmaciones (que no saltó), no con la decisión global. El clip no la evalúa.
    expect(guion?.comparables).toBe(3);
    expect(guion?.coincidencias).toBe(1);
    expect(resultado?.pregunta).toBe("resultado");
    expect(resultado?.falsosPermisos).toBe(1);
    expect(resultado?.etiquetaIndependiente).toBe(false);

    const decisiones = await decisionesRecientes();
    expect(new Set(decisiones.map((d) => d.etiqueta))).toEqual(new Set(["acepta", "rechaza", null]));
    expect(decisiones.every((d) => d.sombra.length === 1)).toBe(true);
  });
});
