import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import {
  CHAT_200,
  CHAT_401,
  CHAT_402,
  CHAT_429,
  MODELOS_200,
  respuestaGrabada,
  TRANSCRIPCION_200,
} from "../proveedores/compatible/fixtures";

/**
 * Mapa de modelos de texto (0.21.1): cuando el modelo de texto de pago falla, la traducción de prompts y
 * el asistente de guion vuelven a pedir el mismo texto a los servicios compatibles con la API de OpenAI del
 * usuario, recorriendo sus modelos en orden.
 *
 * **Ningún test llama a nadie**: KIE y el servicio compatible se simulan, y lo que contesta el segundo son las
 * respuestas **grabadas** de NaN builders del 2026-09-28 (`fixtures.ts`).
 *
 * Lo que fija, una por una:
 *
 * - **429** (tope de peticiones a la vez) y **402** (cuota agotada) pasan al **siguiente modelo**;
 * - **401** para **ese proveedor entero** y sigue con el siguiente;
 * - cuando todo falla, el mensaje cuenta **todos** los intentos con su proveedor, su modelo y su causa concreta,
 *   y no contiene el mensaje genérico que la norma prohíbe;
 * - **sin doble apunte de gasto**: el modelo de pago cierra el suyo y la reserva apunta el suyo, de 0 créditos;
 * - la clave nunca aparece en un mensaje, aunque el servicio la repita en su error.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_relevo");
}

const { and, eq, sql } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { assistantRuns, media, models, usageLedger, users } = await import("../db/esquema");
const { guardarAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { guardarCompatible, listarCompatibles, modelosDelServicio } = await import("../boveda/compatibles");
const { crearMedio } = await import("../media/servicio");
const { crearFotograma } = await import("../generacion/servicio");
const { estimar, olvidarSaldos } = await import("../generacion/estimacion");
const { creditosAConfirmar } = await import("@/lib/generacion");
const { crearProyecto } = await import("../asistente/proyectos");
const { escribirGuion } = await import("../asistente/generar");
const { olvidarCatalogo } = await import("../proveedores/catalogo");
const { ErrorGeneracion } = await import("../generacion/errores");
const { ErrorProyecto } = await import("../asistente/errores");
const { guardarMapa, mapaVista, recomendadasDe, volverALoRecomendado } = await import("./mapa");
const { transcribirPorMapa } = await import("./transcripcion");
const { eleccionDeVozDelMapa } = await import("./voz");
const { ErrorCatalogo } = await import("../proveedores/contrato");
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type Actor = import("../media/servicio").Actor;

const CLAVE_KIE = "sk-ana-clave-de-kie-inventada-ffff";
const CLAVE_NAN = "sk-nan-clave-de-ana-inventada-1234";
const CLAVE_OTRO = "sk-otro-clave-de-ana-inventada-99";
const BASE_NAN = "https://api.nan.builders/v1";
const BASE_OTRO = "https://api.ejemplo-compatible.dev/v1";
const ESCENA = "en una azotea al amanecer, mirando a cámara";
const TRADUCIDA = "on a rooftop at dawn, looking at the camera";
const CREDITOS_TEXTO = 2;

const GUION = JSON.stringify({
  concepto: "Tres pasos para empezar la mañana con calma.",
  escenas: [{ texto: "Sale el sol.", accion: "Plano medio en la azotea", segundos: 4 }],
});

// ── Proveedores simulados ────────────────────────────────────────────────────────────────────────────────

/** Qué contesta el modelo de texto de KIE: número = ese código HTTP; `null` = contesta bien. */
let falloDeKie: number | null = 500;
/** Qué contesta cada modelo del servicio compatible, por identificador de modelo. */
let respuestasPorModelo: Record<string, { cuerpo: unknown; estado: number }> = {};
/** Modelos a los que se ha llamado, en orden y con el host al que se pidió. */
const llamadas: string[] = [];
/** Texto que devuelve el modelo compatible cuando contesta bien. */
let textoCompatible = JSON.stringify([TRADUCIDA]);

const sobre = (data: unknown) => respuestaGrabada({ code: 200, msg: "success", data });

/** Cada petición de la lista de modelos: a qué servicio fue y con qué clave. */
const peticionesDeModelos: { host: string; autorizacion: string | null }[] = [];

const buscar: Buscador = async (url, init) => {
  if (url.includes("/chat/credit")) return sobre(5000);
  if (url.includes("/codex/v1/responses")) {
    if (falloDeKie !== null) return respuestaGrabada({ error: "vaya" }, falloDeKie);
    return respuestaGrabada({
      output: [{ type: "message", content: [{ type: "output_text", text: textoCompatible }] }],
      credits_consumed: 0.5,
    });
  }
  if (url.endsWith("/models")) {
    peticionesDeModelos.push({ host: new URL(url).host, autorizacion: new Headers(init.headers).get("authorization") });
    return respuestaGrabada(MODELOS_200);
  }
  if (url.endsWith("/chat/completions")) {
    const cuerpo = JSON.parse(String(init.body)) as { model: string };
    llamadas.push(`${new URL(url).host}/${cuerpo.model}`);
    const programada = respuestasPorModelo[cuerpo.model];
    if (programada) return respuestaGrabada(programada.cuerpo, programada.estado);
    return respuestaGrabada({ ...CHAT_200, choices: [{ message: { content: textoCompatible } }] });
  }
  if (url.endsWith("/audio/transcriptions")) return respuestaGrabada(TRANSCRIPCION_200);
  if (url.includes("file-stream-upload")) return sobre({ downloadUrl: "https://tempfile.kie.ai/referencia.png" });
  if (url.includes("createTask")) return sobre({ taskId: `task_${Date.now()}` });
  if (url.includes("recordInfo")) return sobre({ state: "waiting", failMsg: "" });
  throw new Error(`URL no simulada: ${url}`);
};

const h: Herramientas = {
  buscar,
  descargar: async () => {
    throw new Error("Ningún test de esta suite descarga resultados.");
  },
};

async function foto(): Promise<Uint8Array<ArrayBuffer>> {
  const lado = 640;
  const pixeles = new Uint8Array(lado * lado * 3).fill(140);
  const png = await sharp(pixeles, { raw: { width: lado, height: lado, channels: 3 } })
    .png()
    .toBuffer();
  const copia = new Uint8Array(new ArrayBuffer(png.byteLength));
  copia.set(png);
  return copia;
}

describe.skipIf(!hayBaseDeDatos)("mapa de modelos de texto", () => {
  type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
  let ana: Sesion;
  let admin: Sesion;
  let actorAna: Actor;
  let medioId = "";
  let claveDelMedio = "";
  let proyectoId = "";

  beforeAll(async () => {
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    admin = await crearSesionDePrueba("admin");
    actorAna = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE_KIE, buscar);
    const medio = await crearMedio(actorAna, new File([await foto()], "referencia.png", { type: "image/png" }));
    medioId = medio.id;
    const [filaMedio] = await db().select().from(media).where(eq(media.id, medio.id));
    claveDelMedio = filaMedio?.storageKey ?? "";
    await db()
      .update(models)
      .set({ state: "compatible", evidence: "Simulado en el test de integración de la reserva." })
      .where(eq(models.modelId, "gpt-5-6-sol"));
    olvidarCatalogo();
    olvidarSaldos();
    await guardarAjustes(
      {
        presupuestoCreditos: 100_000,
        avisoCreditos: 100_000,
        trabajosSimultaneos: 20,
        traducirPrompts: true,
        asistenteActivo: true,
      },
      admin.id,
    );
    const detalle = await crearProyecto(actorAna, {
      titulo: "Mañana en la azotea",
      formato: "reel_vertical",
      idea: "Una rutina de tres pasos para empezar el día con calma, grabada al amanecer.",
      presupuestoCreditos: 100,
    });
    proyectoId = detalle.proyecto.id;

    // Dos servicios compatibles, en orden: el primero con cuatro modelos, el segundo de último recurso.
    await guardarCompatible(
      ana.id,
      {
        nombre: "NaN builders",
        urlBase: BASE_NAN,
        clave: CLAVE_NAN,
        modelos: ["gemma4", "deepseek-v4-flash", "glm5.3-flash"],
        soloCuota: true,
      },
      buscar,
    );
    await guardarCompatible(
      ana.id,
      {
        nombre: "Otro servicio",
        urlBase: BASE_OTRO,
        clave: CLAVE_OTRO,
        modelos: ["modelo-de-ultimo-recurso"],
        soloCuota: true,
      },
      buscar,
    );
  });

  afterAll(async () => {
    await guardarAjustes({ traducirPrompts: false, asistenteActivo: false, trabajosSimultaneos: 3 }, admin.id);
    await db().update(models).set({ state: "descubierto" }).where(eq(models.modelId, "gpt-5-6-sol"));
    olvidarCatalogo();
    await db().delete(users).where(eq(users.id, ana.id));
    await db().delete(users).where(eq(users.id, admin.id));
  });

  /** El mapa de texto de Ana: la entrada de pago primero y sus servicios compatibles de reserva detrás. */
  const ponerMapaCompleto = async () => {
    const guardados = await listarCompatibles(ana.id);
    const nan = guardados.find((p) => p.nombre === "NaN builders");
    const otro = guardados.find((p) => p.nombre === "Otro servicio");
    await guardarMapa(ana.id, "texto", [
      { proveedor: "kie", compatibleId: null, modelo: "gpt-5-6-sol" },
      { proveedor: "compatible", compatibleId: nan?.id ?? "", modelo: "gemma4" },
      { proveedor: "compatible", compatibleId: nan?.id ?? "", modelo: "deepseek-v4-flash" },
      { proveedor: "compatible", compatibleId: nan?.id ?? "", modelo: "glm5.3-flash" },
      { proveedor: "compatible", compatibleId: otro?.id ?? "", modelo: "modelo-de-ultimo-recurso" },
    ]);
  };

  beforeEach(async () => {
    llamadas.length = 0;
    // Cada test vuelve a dar de alta los servicios: sin esto, el límite de pruebas de clave por hora del usuario
    // (20) lo agotarían los propios tests, no nadie probando claves de verdad.
    await db().execute(sql`delete from rate_limits where key = ${`boveda:prueba:${ana.id}`}`);
    falloDeKie = 500;
    respuestasPorModelo = {};
    textoCompatible = JSON.stringify([TRADUCIDA]);
    // Todos los servicios vuelven a estar válidos: un test que marque uno inválido no puede contaminar al siguiente.
    await guardarCompatible(
      ana.id,
      {
        nombre: "NaN builders",
        urlBase: BASE_NAN,
        clave: CLAVE_NAN,
        modelos: ["gemma4", "deepseek-v4-flash", "glm5.3-flash"],
        soloCuota: true,
      },
      buscar,
    );
    await guardarCompatible(
      ana.id,
      {
        nombre: "Otro servicio",
        urlBase: BASE_OTRO,
        clave: CLAVE_OTRO,
        modelos: ["modelo-de-ultimo-recurso"],
        soloCuota: true,
      },
      buscar,
    );
    await ponerMapaCompleto();
  });

  // ── El recorrido ───────────────────────────────────────────────────────────────────────────────────────

  test("un servicio sin declarar que cobra por cuota no se admite: podría cobrar por petición sin estimarlo", async () => {
    const resultado = await guardarCompatible(
      ana.id,
      { nombre: "Pago por uso", urlBase: BASE_OTRO, clave: CLAVE_OTRO, modelos: ["un-modelo"] },
      buscar,
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toContain("cuota");
    expect((await listarCompatibles(ana.id)).some((p) => p.nombre === "Pago por uso")).toBe(false);
  });

  test("la lista de modelos se pide con la clave escrita o con la guardada, y la guardada nunca va a otra dirección", async () => {
    peticionesDeModelos.length = 0;
    // Con la clave recién escrita, sin guardar nada.
    const nueva = await modelosDelServicio(ana.id, { urlBase: BASE_OTRO, clave: CLAVE_OTRO }, buscar);
    expect(nueva.ok).toBe(true);
    if (nueva.ok) expect(nueva.modelos.length).toBeGreaterThan(0);

    // Editando un servicio guardado sin volver a pegar la clave: se usa la suya.
    const nan = (await listarCompatibles(ana.id)).find((p) => p.nombre === "NaN builders");
    const guardada = await modelosDelServicio(ana.id, { urlBase: BASE_NAN, clave: "", id: nan?.id }, buscar);
    expect(guardada.ok).toBe(true);
    expect(peticionesDeModelos.at(-1)).toEqual({ host: "api.nan.builders", autorizacion: `Bearer ${CLAVE_NAN}` });

    // Si la dirección cambia, la clave guardada no sale hacia la nueva: hay que pegarla.
    const antes = peticionesDeModelos.length;
    const otra = await modelosDelServicio(ana.id, { urlBase: BASE_OTRO, clave: "", id: nan?.id }, buscar);
    expect(otra.ok).toBe(false);
    expect(peticionesDeModelos.length).toBe(antes);
  });

  test("429 en un modelo pasa al siguiente modelo del mismo servicio", async () => {
    respuestasPorModelo = { gemma4: { cuerpo: CHAT_429, estado: 429 } };
    await generar("una escena que traduce el segundo modelo");
    expect(llamadas).toEqual([`api.nan.builders/gemma4`, `api.nan.builders/deepseek-v4-flash`]);
  });

  test("402 (cuota agotada) también pasa al siguiente modelo", async () => {
    respuestasPorModelo = {
      gemma4: { cuerpo: CHAT_429, estado: 429 },
      "deepseek-v4-flash": { cuerpo: CHAT_402, estado: 402 },
    };
    await generar("una escena que traduce el tercer modelo");
    expect(llamadas).toEqual([
      "api.nan.builders/gemma4",
      "api.nan.builders/deepseek-v4-flash",
      "api.nan.builders/glm5.3-flash",
    ]);
  });

  test("401 para ese servicio entero, lo marca inválido y sigue con el siguiente", async () => {
    respuestasPorModelo = { gemma4: { cuerpo: CHAT_401, estado: 401 } };
    await generar("una escena que traduce el segundo servicio");
    // No se han probado los demás modelos de NaN builders: la clave no sirve para ninguno.
    expect(llamadas).toEqual(["api.nan.builders/gemma4", "api.ejemplo-compatible.dev/modelo-de-ultimo-recurso"]);
    const guardados = await listarCompatibles(ana.id);
    expect(guardados.find((p) => p.nombre === "NaN builders")?.estado).toBe("invalida");
    expect(guardados.find((p) => p.nombre === "Otro servicio")?.estado).toBe("valida");
  });

  test("un 5xx del servicio de reserva también pasa al siguiente modelo", async () => {
    respuestasPorModelo = {
      gemma4: { cuerpo: { error: "boom" }, estado: 503 },
      "deepseek-v4-flash": { cuerpo: { error: "boom" }, estado: 502 },
    };
    await generar("una escena que sobrevive a dos averías");
    expect(llamadas).toHaveLength(3);
  });

  // ── El mensaje cuando todo falla ───────────────────────────────────────────────────────────────────────

  test("si fallan todos, el mensaje cuenta cada proveedor, cada modelo y su causa concreta", async () => {
    respuestasPorModelo = {
      gemma4: { cuerpo: CHAT_429, estado: 429 },
      "deepseek-v4-flash": { cuerpo: CHAT_402, estado: 402 },
      "glm5.3-flash": { cuerpo: { error: "boom" }, estado: 500 },
      "modelo-de-ultimo-recurso": { cuerpo: CHAT_401, estado: 401 },
    };
    const fallo = (await generar("una escena que no traduce nadie").catch((e: unknown) => e)) as Error;
    expect(fallo).toBeInstanceOf(ErrorGeneracion);
    const mensaje = fallo.message;

    // 1. qué se ha quedado sin hacer y qué significa para el dinero.
    expect(mensaje).toContain("no se ha enviado nada a generar");
    // 2. el modelo de pago, con su causa.
    expect(mensaje).toContain("KIE.ai (gpt-5-6-sol)");
    expect(mensaje).toContain("error interno suyo");
    // 3. qué se intentó después, uno por uno y con la causa concreta de cada uno.
    expect(mensaje).toContain("NaN builders (gemma4)");
    expect(mensaje).toContain("máximo 5 peticiones simultáneas");
    expect(mensaje).toContain("NaN builders (deepseek-v4-flash)");
    expect(mensaje).toContain("la cuota se repone el 2026-10-01");
    expect(mensaje).toContain("NaN builders (glm5.3-flash)");
    expect(mensaje).toContain("Otro servicio (modelo-de-ultimo-recurso)");
    // 4. y nunca el mensaje genérico que la norma prohíbe.
    expect(mensaje).not.toContain("Vuelve a intentarlo en un momento");
  });

  test("ningún mensaje ni ningún apunte contiene una clave", async () => {
    respuestasPorModelo = {
      gemma4: { cuerpo: CHAT_401, estado: 401 },
      "modelo-de-ultimo-recurso": { cuerpo: CHAT_401, estado: 401 },
    };
    const fallo = (await generar("otra escena que no traduce nadie").catch((e: unknown) => e)) as Error;
    for (const clave of [CLAVE_KIE, CLAVE_NAN, CLAVE_OTRO, "sk-nan-XXXXXXXXXXXXXXXX"]) {
      expect(fallo.message).not.toContain(clave);
    }
    const apuntes = JSON.stringify(await db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id)));
    for (const clave of [CLAVE_KIE, CLAVE_NAN, CLAVE_OTRO]) expect(apuntes).not.toContain(clave);
  });

  // ── El dinero ──────────────────────────────────────────────────────────────────────────────────────────

  test("la reserva no cobra: apunta 0 créditos y guarda los tokens, sin duplicar el gasto del modelo de pago", async () => {
    const antes = await ejecuciones("traduccion");
    await generar("una escena con contabilidad limpia");
    const despues = await ejecuciones("traduccion");
    const nuevas = despues.filter((d) => !antes.some((a) => a.id === d.id));

    // Dos ejecuciones y **solo** dos: la del modelo de pago, cerrada como fallida, y la de la reserva.
    expect(nuevas).toHaveLength(2);
    const dePago = nuevas.find((e) => e.provider === "kie");
    const deReserva = nuevas.find((e) => e.provider === "compatible");
    expect(dePago?.state).toBe("fallido");
    expect(deReserva?.state).toBe("listo");
    expect(deReserva?.providerName).toBe("NaN builders");
    expect(deReserva?.estimatedCredits).toBe(0);
    expect(deReserva?.consumedCredits).toBe(0);
    expect(deReserva?.promptTokens).toBe(57);
    expect(deReserva?.completionTokens).toBe(433);

    // Y en el registro de gasto, un único apunte de la reserva, de 0 créditos.
    const apuntes = await db()
      .select()
      .from(usageLedger)
      .where(eq(usageLedger.assistantRunId, deReserva?.id ?? ""));
    expect(apuntes).toHaveLength(1);
    expect(apuntes[0]?.credits).toBe(0);
    expect(apuntes[0]?.entryType).toBe("consumo");
    expect(apuntes[0]?.providerName).toBe("NaN builders");
  });

  test("con la entrada principal funcionando, las reservas ni se tocan", async () => {
    falloDeKie = null;
    await generar("una escena que traduce quien siempre");
    expect(llamadas).toHaveLength(0);
  });

  test("sin entradas de reserva en el mapa, un fallo de la principal deja el trabajo sin hacer", async () => {
    await guardarMapa(ana.id, "texto", [{ proveedor: "kie", compatibleId: null, modelo: "gpt-5-6-sol" }]);
    const fallo = (await generar("una escena sin reserva").catch((e: unknown) => e)) as Error;
    expect(fallo).toBeInstanceOf(ErrorGeneracion);
    expect(llamadas).toHaveLength(0);
    expect(fallo.message).toContain("KIE.ai (gpt-5-6-sol)");
    await ponerMapaCompleto();
  });

  test("sin mapa propio, los servicios compatibles del usuario van delante y el de pago queda de reserva", async () => {
    await volverALoRecomendado(ana.id, "texto");
    const vista = await mapaVista(ana.id, "texto");
    expect(vista.propio).toBe(false);
    // La recomendación de la plataforma sigue siendo el modelo de texto elegible del catálogo…
    expect((await recomendadasDe("texto"))[0]?.proveedor).toBe("kie");
    // …pero los servicios que el usuario añadió con su clave, que cobran por cuota y no por llamada, van primero
    // en su orden, y el modelo de pago de la plataforma queda al final como reserva.
    expect(vista.entradas.map((e) => e.modelo)).toEqual([
      "gemma4",
      "deepseek-v4-flash",
      "glm5.3-flash",
      "modelo-de-ultimo-recurso",
      "gpt-5-6-sol",
    ]);
    // Y se usa el primero sin llegar a pagar el de la plataforma.
    await generar("una escena con el mapa por defecto");
    expect(llamadas).toEqual(["api.nan.builders/gemma4"]);
    await ponerMapaCompleto();
  });

  test("una entrada cuyo proveedor no tiene credencial no se intenta, y la pantalla dice por qué", async () => {
    await guardarMapa(ana.id, "texto", [
      { proveedor: "elevenlabs", compatibleId: null, modelo: "un-modelo-de-texto" },
      { proveedor: "kie", compatibleId: null, modelo: "gpt-5-6-sol" },
    ]);
    const vista = await mapaVista(ana.id, "texto");
    expect(vista.propio).toBe(true);
    expect(vista.entradas[0]?.utilizable).toBe(false);
    expect(vista.entradas[0]?.motivo).toContain("ElevenLabs");
    await ponerMapaCompleto();
  });

  // ── El asistente de guion ──────────────────────────────────────────────────────────────────────────────

  test("el asistente también tiene reserva, y si tampoco puede lo dice con todos los intentos", async () => {
    textoCompatible = GUION;
    const detalle = await escribirGuion(actorAna, proyectoId, peticionDeGuion(), buscar);
    expect(detalle.escenas.length).toBeGreaterThan(0);
    expect(llamadas.at(-1)).toBe("api.nan.builders/gemma4");

    llamadas.length = 0;
    respuestasPorModelo = {
      gemma4: { cuerpo: CHAT_429, estado: 429 },
      "deepseek-v4-flash": { cuerpo: CHAT_402, estado: 402 },
      "glm5.3-flash": { cuerpo: { error: "boom" }, estado: 500 },
      "modelo-de-ultimo-recurso": { cuerpo: { error: "boom" }, estado: 500 },
    };
    const fallo = (await escribirGuion(actorAna, proyectoId, peticionDeGuion(), buscar).catch(
      (e: unknown) => e,
    )) as Error;
    expect(fallo).toBeInstanceOf(ErrorProyecto);
    expect(fallo.message).toContain("el proyecto se ha quedado como estaba");
    expect(fallo.message).toContain("KIE.ai (gpt-5-6-sol)");
    expect(fallo.message).toContain("NaN builders (gemma4)");
    expect(fallo.message).toContain("máximo 5 peticiones simultáneas");
    expect(fallo.message).toContain("Otro servicio (modelo-de-ultimo-recurso)");
    expect(fallo.message).not.toContain("Vuelve a intentarlo en un momento");
  });

  // ── Subtítulos ─────────────────────────────────────────────────────────────────────────────────────────

  test("los subtítulos caen del transcriptor local al servicio compatible, y no cuestan nada", async () => {
    const guardados = await listarCompatibles(ana.id);
    const nan = guardados.find((p) => p.nombre === "NaN builders");
    await guardarMapa(ana.id, "transcripcion", [
      { proveedor: "local", compatibleId: null, modelo: "" },
      { proveedor: "compatible", compatibleId: nan?.id ?? "", modelo: "whisper" },
    ]);
    const apuntesAntes = (await db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id))).length;
    // El binario local no está instalado en el entorno de los tests: es justo el caso que la reserva resuelve.
    const subtitulos = await transcribirPorMapa({
      usuarioId: ana.id,
      claveAlmacenamiento: claveDelMedio,
      extension: "mp3",
      buscar,
    });
    expect(subtitulos).toHaveLength(2);
    expect(subtitulos[0]?.texto).toBe("Buenos días,");
    expect(subtitulos[1]?.hasta).toBe(4.02);
    // Ninguna de las dos cobra por petición, así que esto no deja ni un apunte de gasto nuevo.
    const apuntesDespues = (await db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id))).length;
    expect(apuntesDespues).toBe(apuntesAntes);
  });

  test("sin ninguna entrada utilizable, los subtítulos lo dicen y ofrecen escribirlos a mano", async () => {
    await guardarMapa(ana.id, "transcripcion", [{ proveedor: "elevenlabs", compatibleId: null, modelo: "no-existe" }]);
    const fallo = (await transcribirPorMapa({
      usuarioId: ana.id,
      claveAlmacenamiento: claveDelMedio,
      extension: "mp3",
      buscar,
    }).catch((e: unknown) => e)) as Error;
    expect(fallo.message).toContain("mapa de subtítulos");
    expect(fallo.message).toContain("escribirlos a mano");
    await guardarMapa(ana.id, "transcripcion", [{ proveedor: "local", compatibleId: null, modelo: "" }]);
  });

  // ── Voz ────────────────────────────────────────────────────────────────────────────────────────────────

  test("una opción de otra familia de voces no vale para una voz ya fijada", async () => {
    const guardados = await listarCompatibles(ana.id);
    const nan = guardados.find((p) => p.nombre === "NaN builders");
    await guardarMapa(ana.id, "voz", [{ proveedor: "compatible", compatibleId: nan?.id ?? "", modelo: "kokoro" }]);
    // kokoro está en el catálogo como «descubierto», así que todavía no es elegible: eso ya se dice con su motivo.
    const fallo = (await eleccionDeVozDelMapa(ana.id, "hola", "elevenlabs").catch((e: unknown) => e)) as Error;
    expect(fallo).toBeInstanceOf(ErrorCatalogo);
    expect(fallo.message).toContain("mapa de voz");
  });

  // ── Ayudas ─────────────────────────────────────────────────────────────────────────────────────────────

  const generar = async (escena: string) => {
    const estimacion = await estimar(ana.id, "fotograma", buscar);
    return crearFotograma(
      actorAna,
      {
        prompt: escena,
        creditosConfirmados: creditosAConfirmar(estimacion),
        derechos: true,
        claveIdempotencia: crypto.randomUUID(),
        medioId,
      },
      h,
    );
  };

  const peticionDeGuion = () => ({
    claveIdempotencia: crypto.randomUUID(),
    creditosConfirmados: CREDITOS_TEXTO,
    selloEstimacion: "kie:gpt-5-6-sol:respuesta de texto@v1",
  });

  const ejecuciones = async (kind: "traduccion" | "guion") =>
    db()
      .select()
      .from(assistantRuns)
      .where(and(eq(assistantRuns.userId, ana.id), eq(assistantRuns.kind, kind)));
});
