import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
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
const { huellaDeTexto, pedirTraduccion, purgarTraduccionesViejas } = await import("./traduccion");
const { olvidarCatalogo } = await import("../proveedores/catalogo");
const { ErrorGeneracion } = await import("../generacion/errores");
const { MAXIMO_CONEXIONES_CERROJO } = await import("../db/cerrojos-consultivos");
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type Actor = import("../media/servicio").Actor;

const CLAVE = "sk-ana-clave-de-kie-inventada-ffff";
/** Créditos que se estiman por llamada de texto: el precio sembrado es 1,5 y la estimación redondea al alza. */
const CREDITOS_TEXTO = 2;
const CREDITOS_INFORMADOS = 0.5;
const ESCENA = "en una azotea al amanecer, mirando a cámara";
const TRADUCIDA = "on a rooftop at dawn, looking at the camera";

// ── Proveedor simulado ───────────────────────────────────────────────────────────────────────────────────

/** Textos que se han mandado a traducir, uno por llamada. */
const traducciones: string[] = [];
/**
 * Qué contesta el endpoint de texto: `null` = contesta bien; `"tiempo"` = no contesta a tiempo; `"inservible"` =
 * contesta con éxito, pero con un texto que no es una lista de traducciones.
 */
let falloDeTexto: number | "tiempo" | "inservible" | null = null;
/** Si se pone, el endpoint de texto espera a esta promesa antes de contestar: deja una traducción «en curso». */
let esperarAntesDeContestar: Promise<void> | null = null;
/** Se llama cada vez que el endpoint de texto recibe una llamada: así se sabe que la traducción ya está en curso. */
let avisarDeLlamada: (() => void) | null = null;
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
    avisarDeLlamada?.();
    if (esperarAntesDeContestar) await esperarAntesDeContestar;
    if (falloDeTexto === "inservible") {
      return new Response(
        JSON.stringify({
          output: [{ type: "message", content: [{ type: "output_text", text: "Lo siento, no sé traducir eso." }] }],
          credits_consumed: CREDITOS_INFORMADOS,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (falloDeTexto === "tiempo") throw new DOMException("Se ha agotado el tiempo.", "TimeoutError");
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

  afterEach(() => {
    // Un test que falle a medias no puede dejar el simulador retenido o fallando para los siguientes.
    esperarAntesDeContestar = null;
    avisarDeLlamada = null;
    falloDeTexto = null;
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
    // El endpoint de texto es síncrono y cobra con la respuesta completa: un 5xx vuelve sin resultado y sin cobro,
    // así que se apunta 0 y no la estimación (que inflaría lo consumido con algo que el proveedor no cobró).
    const ultima = await ultimaEjecucion();
    expect(ultima?.state).toBe("fallido");
    expect(ultima?.consumedCredits).toBe(0);
    const apuntes = (await apuntesDeTraduccion()).filter((a) => a.assistantRunId === ultima?.id);
    expect(apuntes.find((a) => a.entryType === "consumo")?.credits).toBe(0);
    // Y el error lo dice con su causa: qué proveedor falló (sin nombrar el modelo) y que no se ha cobrado.
    expect((fallo as Error).message).toContain("KIE");
    expect((fallo as Error).message).not.toContain("gpt-5-6-sol");
    expect((fallo as Error).message).toMatch(/no se te ha cobrado nada/i);
    expect((fallo as Error).message).not.toContain("No se sabe si te ha cobrado");
    falloDeTexto = null;
  });

  test("un 504 de la traducción no prueba que no se cobrara: se conserva la estimación", async () => {
    falloDeTexto = 504;
    const fallo = await generar("una escena cuya traducción se queda esperando en el proveedor").catch(
      (e: unknown) => e,
    );
    expect(fallo).toBeInstanceOf(ErrorGeneracion);
    const ultima = await ultimaEjecucion();
    expect(ultima?.state).toBe("fallido");
    expect(ultima?.consumedCredits).toBeNull();
    const apuntes = (await apuntesDeTraduccion()).filter((a) => a.assistantRunId === ultima?.id);
    expect(apuntes.find((a) => a.entryType === "consumo")?.credits).toBe(CREDITOS_TEXTO);
    expect((fallo as Error).message).toContain("No se sabe si te ha cobrado");
    falloDeTexto = null;
  });

  test("si la traducción no contesta a tiempo, se conserva la estimación: no se sabe si se cobró", async () => {
    falloDeTexto = "tiempo";
    const fallo = await generar("una escena cuya traducción no contesta").catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ErrorGeneracion);
    const ultima = await ultimaEjecucion();
    expect(ultima?.state).toBe("fallido");
    expect(ultima?.consumedCredits).toBeNull();
    const apuntes = (await apuntesDeTraduccion()).filter((a) => a.assistantRunId === ultima?.id);
    expect(apuntes.find((a) => a.entryType === "consumo")?.credits).toBe(CREDITOS_TEXTO);
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

  test("si la primera traducción sigue en curso, la segunda no llama al proveedor y recibe un 409", async () => {
    const texto = "dos peticiones del mismo texto a la vez";
    const llamadas = traducciones.length;
    const soltar = retenerAlProveedor();
    const enCurso = new Promise<void>((resolver) => {
      avisarDeLlamada = resolver;
    });
    const primera = generar(texto);
    // La segunda empieza cuando la primera ya está esperando al proveedor: la carrera ocurre siempre, no a veces.
    await enCurso;
    avisarDeLlamada = null;
    const segunda = await generar(texto).catch((e: unknown) => e);
    soltar();
    await primera;
    // Lo que no puede pasar nunca: pagar dos veces la misma traducción.
    expect(traducciones).toHaveLength(llamadas + 1);
    expect(segunda).toBeInstanceOf(ErrorGeneracion);
    expect((segunda as { estado: number }).estado).toBe(409);
    // El mensaje **no afirma nada sobre el cobro**: solo que no se ha enviado a generar.
    expect((segunda as Error).message).toContain("No se ha enviado nada a generar");
    expect((segunda as Error).message).not.toContain("no se te ha cobrado");
    // Y en cuanto la primera termina, el mismo texto sale de la caché sin volver a llamar.
    await generar(texto);
    expect(traducciones).toHaveLength(llamadas + 1);
  });

  test("si la primera traducción terminó después de que la segunda mirase la caché, la segunda no vuelve a pagar", async () => {
    const texto = "una petición que mira la caché antes de que la otra termine";
    const llamadas = traducciones.length;
    await generar(texto);
    expect(traducciones).toHaveLength(llamadas + 1);
    // La segunda petición leyó la caché vacía antes de que la primera guardase: llega aquí sin saber que ya está.
    const { traducidas } = await pedirTraduccion(ana.id, [{ texto }], "gpt-5-6-sol", buscar);
    expect(traducciones).toHaveLength(llamadas + 1);
    expect(traducidas.get(texto)).toBe(TRADUCIDA);
  });

  test("dos envíos a la vez con un texto en común no lo traducen dos veces", async () => {
    const ficha = `una ficha compartida ${crypto.randomUUID()}`;
    const escenaA = `la escena del primer envío ${crypto.randomUUID()}`;
    const escenaB = `la escena del segundo envío ${crypto.randomUUID()}`;
    const llamadas = traducciones.length;
    const soltar = retenerAlProveedor();
    const enCurso = new Promise<void>((resolver) => {
      avisarDeLlamada = resolver;
    });
    const primera = pedirTraduccion(ana.id, [{ texto: escenaA }, { texto: ficha }], "gpt-5-6-sol", buscar);
    await enCurso;
    // La ficha se está traduciendo en la primera: la segunda no llama, aunque su escena sea otra.
    const segunda = await pedirTraduccion(ana.id, [{ texto: escenaB }, { texto: ficha }], "gpt-5-6-sol", buscar).catch(
      (e: unknown) => e,
    );
    soltar();
    await primera;
    expect(traducciones).toHaveLength(llamadas + 1);
    expect((segunda as { estado?: number }).estado).toBe(409);
    // Al repetirla, la ficha ya está en la caché y solo se traduce su escena.
    const repetida = await pedirTraduccion(ana.id, [{ texto: escenaB }, { texto: ficha }], "gpt-5-6-sol", buscar);
    expect(traducciones).toHaveLength(llamadas + 2);
    expect(traducciones.at(-1)).toContain(escenaB);
    expect(traducciones.at(-1)).not.toContain(ficha);
    expect(repetida.traducidas.size).toBe(2);
  });

  test("con parte de los textos en la caché, solo se traduce lo que falta", async () => {
    const guardado = `un texto ya traducido ${crypto.randomUUID()}`;
    const nuevo = `un texto todavía sin traducir ${crypto.randomUUID()}`;
    await db()
      .insert(translationCache)
      .values({
        userId: ana.id,
        sourceHash: huellaDeTexto(guardado),
        target: "already translated",
        model: "gpt-5-6-sol",
      });
    const llamadas = traducciones.length;
    const { traducidas } = await pedirTraduccion(
      ana.id,
      [{ texto: guardado }, { texto: nuevo }],
      "gpt-5-6-sol",
      buscar,
    );
    expect(traducciones).toHaveLength(llamadas + 1);
    expect(traducciones.at(-1)).toContain(nuevo);
    expect(traducciones.at(-1)).not.toContain(guardado);
    expect(traducidas.get(guardado)).toBe("already translated");
    expect(traducidas.get(nuevo)).toBe(TRADUCIDA);
  });

  test("sin conexión libre para los cerrojos, se rechaza con un 503 sin llamar ni cobrar", async () => {
    const llamadas = traducciones.length;
    const soltar = retenerAlProveedor();
    let recibidas = 0;
    const todasEnCurso = new Promise<void>((resolver) => {
      avisarDeLlamada = () => {
        recibidas++;
        if (recibidas === MAXIMO_CONEXIONES_CERROJO) resolver();
      };
    });
    // Cada traducción retenida ocupa una conexión del pool de cerrojos hasta que termina.
    const ocupadas = Array.from({ length: MAXIMO_CONEXIONES_CERROJO }, () =>
      pedirTraduccion(ana.id, [{ texto: `ocupa una conexión ${crypto.randomUUID()}` }], "gpt-5-6-sol", buscar),
    );
    await todasEnCurso;
    const fallo = await pedirTraduccion(
      ana.id,
      [{ texto: `no encuentra conexión ${crypto.randomUUID()}` }],
      "gpt-5-6-sol",
      buscar,
    ).catch((e: unknown) => e);
    soltar();
    await Promise.all(ocupadas);
    expect(fallo).toBeInstanceOf(ErrorGeneracion);
    expect((fallo as { estado: number }).estado).toBe(503);
    expect((fallo as Error).message).toContain("No se ha enviado nada a generar ni se ha cobrado nada");
    expect(traducciones).toHaveLength(llamadas + MAXIMO_CONEXIONES_CERROJO);
  }, 15_000);

  test("tras un intento fallido, el mismo texto se puede volver a traducir", async () => {
    const texto = "una escena que falla la primera vez y se reintenta";
    const llamadas = traducciones.length;
    falloDeTexto = 500;
    await expect(generar(texto)).rejects.toThrow(ErrorGeneracion);
    falloDeTexto = null;
    const envio = await generar(texto);
    expect(traducciones).toHaveLength(llamadas + 2);
    expect(await promptDe(envio.trabajo.id)).toContain(TRADUCIDA);
  });

  test("una respuesta que no sirve como traducción no deja el texto bloqueado: el reintento vuelve a llamar", async () => {
    const texto = "una escena cuya primera respuesta no es una traducción";
    const llamadas = traducciones.length;
    falloDeTexto = "inservible";
    const fallo = await generar(texto).catch((e: unknown) => e);
    falloDeTexto = null;
    expect(fallo).toBeInstanceOf(ErrorGeneracion);
    expect((fallo as { estado: number }).estado).toBe(502);
    // La ejecución quedó `listo` (el proveedor contestó), pero no hay nada en la caché.
    expect((await ultimaEjecucion())?.state).toBe("listo");
    const envio = await generar(texto);
    expect(traducciones).toHaveLength(llamadas + 2);
    expect(await promptDe(envio.trabajo.id)).toContain(TRADUCIDA);
  });

  test("una ejecución que se quedó en `reservado` no bloquea el texto", async () => {
    const texto = "una escena cuya traducción anterior se interrumpió";
    const llamadas = traducciones.length;
    falloDeTexto = 500;
    await expect(generar(texto)).rejects.toThrow(ErrorGeneracion);
    falloDeTexto = null;
    // Como si el proceso hubiera muerto entre la reserva y el cierre: la ejecución se queda `reservado`.
    const colgada = await ultimaEjecucion();
    expect(colgada?.idempotencyKey).toMatch(/^traduccion:[0-9a-f]{64}:1:0$/);
    await db()
      .update(assistantRuns)
      .set({ state: "reservado", finishedAt: null })
      .where(eq(assistantRuns.id, colgada?.id ?? ""));
    const envio = await generar(texto);
    expect(traducciones).toHaveLength(llamadas + 2);
    expect(await promptDe(envio.trabajo.id)).toContain(TRADUCIDA);
    expect((await ultimaEjecucion())?.idempotencyKey).toMatch(/^traduccion:[0-9a-f]{64}:2:0$/);
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

  /** Retiene las respuestas del endpoint de texto hasta llamar a la función que devuelve. */
  function retenerAlProveedor(): () => void {
    let soltar = () => {};
    esperarAntesDeContestar = new Promise<void>((resolver) => {
      soltar = resolver;
    });
    return () => {
      soltar();
      esperarAntesDeContestar = null;
    };
  }

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
