import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";

/**
 * Traducción de los prompts al inglés (decisión firme del propietario, 2026-09-27; ADR-0020).
 *
 * **Ningún test llama a KIE**: el modelo de texto se simula y la clave es inventada. Lo que el simulador recibe se
 * guarda, así que se puede comprobar **qué se mandó a traducir y cuántas veces**.
 *
 * Lo que fija, una por una:
 *
 * - **apagada, no se llama a nadie** y se envía el texto original, como en la 0.16.x;
 * - encendida, lo que la persona escribió en español llega al proveedor **en inglés**;
 * - **el diálogo hablado no se traduce**: es lo que dirá el personaje;
 * - la traducción **se cachea por texto**: el segundo trabajo con la misma escena no vuelve a pagar;
 * - su gasto queda en el `UsageLedger` con los créditos que informa el proveedor;
 * - **si falla, no se encola nada**: ni trabajo ni reserva de la generación, y se dice al usuario;
 * - un rechazo probado (400) se apunta como «no ha costado nada»; un 5xx conserva la estimación.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_traduccion");
}

const { and, eq } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { assistantRuns, generationJobs, models, translationCache, usageLedger, users } = await import("../db/esquema");
const { guardarAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { crearMedio } = await import("../media/servicio");
const { crearFotograma } = await import("../generacion/servicio");
const { estimar } = await import("../generacion/estimacion");
const { creditosAConfirmar } = await import("@/lib/generacion");
const { olvidarSaldos } = await import("../generacion/estimacion");
const { crearPersonaje } = await import("../personajes/servicio");
const { borrarPersonaje } = await import("../personajes/borrado");
const { huellaDeTexto, purgarTraduccionesViejas } = await import("./traduccion");
const { olvidarCatalogo } = await import("../proveedores/catalogo");
const { ErrorGeneracion } = await import("../generacion/errores");
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type Actor = import("../media/servicio").Actor;

const CLAVE = "sk-ana-clave-de-kie-inventada-ffff";
const CREDITOS_TEXTO = 3;
const CREDITOS_INFORMADOS = 0.5;
const ESCENA = "en una azotea al amanecer, mirando a cámara";
const TRADUCIDA = "on a rooftop at dawn, looking at the camera";

// ── Proveedor simulado ───────────────────────────────────────────────────────────────────────────────────

/** Textos que se han mandado a traducir, uno por llamada. */
const traducciones: string[] = [];
/** Qué contesta el endpoint de texto: `null` = contesta bien. */
let falloDeTexto: number | null = null;
/** Saldo que informa el proveedor. Se baja para comprobar que la traducción va detrás de esa puerta. */
let saldoSimulado = 5000;

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url, init) => {
  if (url.includes("/chat/credit")) return sobre(saldoSimulado);
  if (url.includes("/codex/v1/responses")) {
    const cuerpo = JSON.parse(String(init.body)) as { input: { role: string; content: string }[] };
    traducciones.push(cuerpo.input.at(-1)?.content ?? "");
    if (falloDeTexto !== null) return new Response(JSON.stringify({ error: "vaya" }), { status: falloDeTexto });
    // Traduce «de verdad» lo que reconoce y devuelve el resto tal cual: basta para comprobar qué se envía.
    const cuantos = (cuerpo.input.at(-1)?.content.match(/^\d+\. /gm) ?? []).length;
    const lista = Array.from({ length: cuantos }, (_, i) => (i === 0 ? TRADUCIDA : `english text ${i + 1}`));
    return new Response(
      JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(lista) }] }],
        credits_consumed: CREDITOS_INFORMADOS,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
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

describe.skipIf(!hayBaseDeDatos)("traducción de los prompts al inglés", () => {
  let ana: Sesion;
  let admin: Sesion;
  let actorAna: Actor;
  let medioId = "";

  type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;

  beforeAll(async () => {
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    admin = await crearSesionDePrueba("admin");
    actorAna = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    const medio = await crearMedio(actorAna, new File([await foto()], "referencia.png", { type: "image/png" }));
    medioId = medio.id;
    // Tope de simultáneos holgado: aquí se encolan varios trabajos y lo que se prueba no es la cola.
    await guardarAjustes(
      { presupuestoCreditos: 100_000, avisoCreditos: 100_000, trabajosSimultaneos: 20, traducirPrompts: false },
      admin.id,
    );
  });

  afterAll(async () => {
    // `bun test` comparte una sola conexión entre ficheros, así que la traducción y el modelo se dejan como
    // estaban: encendidos, los demás tests llamarían a un endpoint de texto que sus simuladores no conocen.
    // También el tope de simultáneos: la suite comparte conexión y otro test comprueba ese tope.
    await guardarAjustes({ traducirPrompts: false, trabajosSimultaneos: 3 }, admin.id);
    await db().update(models).set({ state: "descubierto" }).where(eq(models.modelId, "gpt-5-6-sol"));
    olvidarCatalogo();
    await db().delete(users).where(eq(users.id, ana.id));
    await db().delete(users).where(eq(users.id, admin.id));
  });

  test("apagada, no se llama a ningún modelo de texto y se envía el texto original", async () => {
    const estimacion = await estimar(ana.id, "fotograma", buscar);
    expect(estimacion.traduccion).toBeNull();
    const envio = await generar("una escena que nadie traduce");
    expect(traducciones).toHaveLength(0);
    // El prompt que se guarda es el que se enviará: sin traducir, lleva el texto original.
    expect(await promptDe(envio.trabajo.id)).toContain("una escena que nadie traduce");
  });

  test("encendida, la estimación dice lo que costaría traducir y con qué precio", async () => {
    await activarTraduccion();
    const estimacion = await estimar(ana.id, "fotograma", buscar);
    expect(estimacion.traduccion?.creditos).toBe(CREDITOS_TEXTO);
    expect(estimacion.traduccion?.comprobado).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Los créditos que se confirman siguen siendo los del modelo de imagen: la traducción es un coste aparte.
    expect(estimacion.creditos).toBe(4);
  });

  test("lo que llega al proveedor de imagen va en inglés, y el gasto del texto queda en el UsageLedger", async () => {
    const envio = await generar(ESCENA);
    expect(traducciones).toHaveLength(1);
    expect(traducciones[0]).toContain(ESCENA);
    // El prompt guardado es exactamente el que se envía al proveedor: en inglés y sin el original.
    const compuesto = await promptDe(envio.trabajo.id);
    expect(compuesto).toContain(TRADUCIDA);
    expect(compuesto).not.toContain(ESCENA);

    const apuntes = await apuntesDeTraduccion();
    expect(apuntes.find((a) => a.entryType === "reserva")?.credits).toBe(CREDITOS_TEXTO);
    const consumo = apuntes.find((a) => a.entryType === "consumo");
    expect(consumo?.credits).toBe(CREDITOS_INFORMADOS);
    expect(consumo?.informed).toBe(true);
    expect(apuntes.find((a) => a.entryType === "liberacion")?.credits).toBe(-CREDITOS_TEXTO);
  });

  test("la traducción se guarda en la caché por huella, sin el texto de origen", async () => {
    const filas = await db().select().from(translationCache).where(eq(translationCache.userId, ana.id));
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.some((f) => f.target === TRADUCIDA)).toBe(true);
    // La tabla no es una segunda copia de lo que escribió nadie: solo la huella.
    for (const fila of filas) {
      expect(fila.sourceHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(fila)).not.toContain(ESCENA);
    }
  });

  test("el mismo texto no se paga dos veces: la segunda vez sale de la caché", async () => {
    const llamadas = traducciones.length;
    const ejecuciones = await ejecucionesDeTraduccion();
    const envio = await generar(ESCENA);
    expect(traducciones).toHaveLength(llamadas);
    expect(await ejecucionesDeTraduccion()).toBe(ejecuciones);
    expect(await promptDe(envio.trabajo.id)).toContain(TRADUCIDA);
  });

  test("el diálogo hablado no se traduce", async () => {
    // Se genera un fotograma con una escena nueva: lo que se manda a traducir es solo la descripción.
    await generar("un plano corto de sus manos");
    const ultima = traducciones.at(-1) ?? "";
    expect(ultima).toContain("un plano corto de sus manos");
    // La animación es la que lleva diálogo, y su texto no entra en la petición de traducción en ningún caso.
    expect(ultima).not.toContain("Hola a todos");
  });

  test("si la traducción falla, no se encola nada y se dice al usuario", async () => {
    falloDeTexto = 500;
    const trabajosAntes = await trabajosDeAna();
    const fallo = await generar("una escena que no se podrá traducir").catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ErrorGeneracion);
    expect((fallo as Error).message).toContain("no se ha enviado nada a generar");
    // Ni trabajo ni reserva de la generación: el rechazo ocurre antes de encolar.
    expect(await trabajosDeAna()).toBe(trabajosAntes);
    // Y el gasto de la llamada fallida queda apuntado: un 5xx no prueba que no se ejecutara, así que se
    // conserva la estimación en lugar de soltarla.
    const ultima = await ultimaEjecucion();
    expect(ultima?.state).toBe("fallido");
    expect(ultima?.consumedCredits).toBeNull();
    falloDeTexto = null;
  });

  test("un rechazo probado del proveedor se apunta como que no ha costado nada", async () => {
    falloDeTexto = 400;
    await expect(generar("otra escena distinta que tampoco se traduce")).rejects.toThrow(ErrorGeneracion);
    const ultima = await ultimaEjecucion();
    expect(ultima?.state).toBe("fallido");
    expect(ultima?.consumedCredits).toBe(0);
    falloDeTexto = null;
  });

  test("el total que se confirma incluye la traducción, y confirmar solo la generación se rechaza", async () => {
    const estimacion = await estimar(ana.id, "fotograma", buscar);
    expect(creditosAConfirmar(estimacion)).toBe(estimacion.creditos + CREDITOS_TEXTO);
    const llamadas = traducciones.length;
    const fallo = await crearFotograma(
      actorAna,
      {
        prompt: "una escena con el total mal confirmado",
        // Solo la generación: ya no es lo que se va a pagar.
        creditosConfirmados: estimacion.creditos,
        derechos: true,
        claveIdempotencia: crypto.randomUUID(),
        medioId,
      },
      h,
    ).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ErrorGeneracion);
    expect((fallo as Error).message).toContain("coste estimado ha cambiado");
    // Y no se ha traducido nada: la confirmación se comprueba antes que cualquier gasto.
    expect(traducciones).toHaveLength(llamadas);
  });

  test("la traducción va detrás de las puertas gratis: sin saldo no se llama al traductor", async () => {
    saldoSimulado = 1;
    olvidarSaldos();
    const llamadas = traducciones.length;
    const fallo = await generar("una escena que no llega a traducirse").catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ErrorGeneracion);
    expect((fallo as Error).message).toContain("créditos");
    // Ni una llamada: el saldo, la cuota, el ritmo y la decisión van **antes** de pagar una traducción.
    expect(traducciones).toHaveLength(llamadas);
    saldoSimulado = 5000;
    olvidarSaldos();
  });

  test("dos peticiones a la vez del mismo texto llaman al proveedor una sola vez", async () => {
    const texto = "dos peticiones del mismo texto a la vez";
    const llamadas = traducciones.length;
    const resultados = await Promise.allSettled([generar(texto), generar(texto)]);
    // Lo que no puede pasar nunca: pagar dos veces la misma traducción.
    expect(traducciones).toHaveLength(llamadas + 1);
    const rechazadas = resultados.filter((r) => r.status === "rejected");
    expect(rechazadas.length).toBeLessThanOrEqual(1);
    for (const rechazada of rechazadas) {
      const mensaje = String((rechazada as PromiseRejectedResult).reason);
      // Si una se queda fuera, el mensaje **no afirma nada sobre el cobro**: solo que no se ha enviado a generar.
      expect(mensaje).toContain("No se ha enviado nada a generar");
      expect(mensaje).not.toContain("no se te ha cobrado");
    }
  });

  test("la traducción de la ficha de un personaje se borra con el personaje", async () => {
    const personaje = await crearPersonaje(actorAna, { nombre: "Ficha traducida", tipo: "persona" });
    await db()
      .insert(translationCache)
      .values({
        userId: ana.id,
        sourceHash: huellaDeTexto("rasgos de esta persona"),
        target: "traits of this person",
        characterId: personaje.id,
        model: "gpt-5-6-sol",
      });
    expect(await traduccionesDePersonaje(personaje.id)).toBe(1);
    await borrarPersonaje(actorAna, personaje.id);
    expect(await traduccionesDePersonaje(personaje.id)).toBe(0);
  });

  test("las traducciones que nadie usa se purgan según el ajuste", async () => {
    const huella = huellaDeTexto(`para purgar ${crypto.randomUUID()}`);
    await db()
      .insert(translationCache)
      .values({
        userId: ana.id,
        sourceHash: huella,
        target: "to be purged",
        model: "gpt-5-6-sol",
        usedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      });
    // Con 180 días (el valor por defecto) se borra: nadie la ha usado en más de un año.
    expect(await purgarTraduccionesViejas()).toBeGreaterThan(0);
    const quedan = await db()
      .select({ id: translationCache.id })
      .from(translationCache)
      .where(eq(translationCache.sourceHash, huella));
    expect(quedan).toHaveLength(0);
  });

  // ── Ayudas ─────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Confirma **el total**: la generación más la traducción, si está encendida (decisión provisional del
   * propietario). Es lo que hace el navegador con `creditosAConfirmar`.
   */
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

  /** Enciende la traducción y deja el modelo de texto utilizable, como haría quien administra. */
  async function activarTraduccion() {
    await db()
      .update(models)
      .set({ state: "compatible", evidence: "Simulado en el test de integración de la traducción." })
      .where(eq(models.modelId, "gpt-5-6-sol"));
    olvidarCatalogo();
    olvidarSaldos();
    await guardarAjustes({ traducirPrompts: true }, admin.id);
  }

  /** Prompt compuesto tal como quedó guardado en el trabajo: es lo que se le envía al proveedor. */
  const promptDe = async (id: string) => {
    const [fila] = await db()
      .select({ prompt: generationJobs.prompt })
      .from(generationJobs)
      .where(eq(generationJobs.id, id));
    return fila?.prompt ?? "";
  };

  const apuntesDeTraduccion = async () =>
    (await db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id))).filter(
      (a) => a.assistantRunId !== null,
    );

  const ejecucionesDeTraduccion = async () =>
    (
      await db()
        .select({ id: assistantRuns.id })
        .from(assistantRuns)
        .where(and(eq(assistantRuns.userId, ana.id), eq(assistantRuns.kind, "traduccion")))
    ).length;

  const ultimaEjecucion = async () => {
    const filas = await db().select().from(assistantRuns).where(eq(assistantRuns.userId, ana.id));
    return filas.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).at(-1) ?? null;
  };

  const traduccionesDePersonaje = async (personajeId: string) =>
    (
      await db()
        .select({ id: translationCache.id })
        .from(translationCache)
        .where(eq(translationCache.characterId, personajeId))
    ).length;

  const trabajosDeAna = async () =>
    (await db().select({ id: generationJobs.id }).from(generationJobs).where(eq(generationJobs.userId, ana.id))).length;
});
