import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";

/**
 * Sincronización del catálogo con los precios que publica el proveedor (0.23.0), contra el PostgreSQL local.
 *
 * **Ningún test sale a la red ni gasta un crédito**: la tabla de precios y el proveedor se simulan con las
 * respuestas grabadas de la descarga real del 2026-09-28.
 *
 * Lo que se comprueba es lo que cuesta dinero si falla:
 *
 * - la sincronización crea y actualiza sin duplicar, y deja historial;
 * - un precio que cambia **no toca ningún trabajo ya creado**, pero sí caduca las estimaciones en pantalla;
 * - un modelo con «precio publicado» se puede elegir, estimar, confirmar, reservar y cerrar con lo informado;
 * - una diferencia entre lo publicado y lo cobrado queda registrada;
 * - un modelo sin constructor **no se puede elegir** y dice por qué.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

// Base de datos aparte: estos tests cambian el catálogo de la instalación.
const BD_DE_PRUEBA = "escenara_pruebas_precios";
const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba(BD_DE_PRUEBA);
}

const { and, eq, inArray } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, modelPrices, modelPriceSyncs, modelProviders, users } = await import("../db/esquema");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { guardarCredencial } = await import("../boveda/credenciales");
const { crearMedio } = await import("../media/servicio");
const { estimar, olvidarSaldos } = await import("../generacion/estimacion");
const { crearFotograma } = await import("../generacion/servicio");
const { consultarTrabajo } = await import("../generacion/seguimiento");
const { enviarEncolados } = await import("../cola/pasada");
const { historialCatalogo, listarModelos, modelosElegibles, elegirModelo } = await import("./catalogo");
const { sembrarCatalogo } = await import("./semilla");
const { cambiarVarianteDeModelo } = await import("./catalogo-admin");
const { sincronizarProveedor } = await import("./sincronizacion");
const { buscadorDePrecios, REGISTROS_DE_PRECIO } = await import("./kie/grabaciones-precios");
type Buscador = import("./codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type Actor = import("../media/servicio").Actor;

const CLAVE = "sk-clave-de-kie-inventada-para-los-precios";
const ESCENA = "En una terraza al atardecer, mira a cámara y sonríe.";
/** Modelo nuevo que solo existe porque el proveedor publica su precio: 6 créditos por imagen a 1K. */
const GPT2 = "gpt-image-2-image-to-image";
/** Modelo publicado que esta instalación **no** sabe pedir: se ve en el catálogo y no se puede elegir. */
const SIN_FAMILIA = "wan/2-7-image-to-video";

let llamadas = { credito: 0, subida: 0, crearTarea: 0, consulta: 0 };
let siguienteTarea = 0;
/** Lo que el proveedor dice haber cobrado en la siguiente tarea que se consulte. */
let creditosCobrados = 6;

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url, opciones) => {
  if (url.includes("model-pricing")) return buscadorDePrecios(registrosDelTest).buscar(url, opciones);
  if (url.includes("/chat/credit")) {
    llamadas.credito++;
    return sobre(500);
  }
  if (url.includes("file-stream-upload")) {
    llamadas.subida++;
    return sobre({ downloadUrl: "https://tempfile.kie.ai/referencia.png" });
  }
  if (url.includes("createTask")) {
    llamadas.crearTarea++;
    return sobre({ taskId: `precio_task_${++siguienteTarea}` });
  }
  if (url.includes("recordInfo")) {
    llamadas.consulta++;
    return sobre({
      state: "success",
      resultJson: '{"resultUrls":["https://tempfile.kie.ai/resultado.png"]}',
      creditsConsumed: creditosCobrados,
    });
  }
  throw new Error(`URL no simulada: ${url}`);
};

/** Registros que devuelve la tabla de precios simulada; un test los cambia para subir un precio. */
let registrosDelTest = REGISTROS_DE_PRECIO;

const descargar: Herramientas["descargar"] = async () => {
  const datos = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#7a4bff" } })
    .png()
    .toBuffer();
  const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
  copia.set(datos);
  return { archivo: new File([copia], "resultado.png", { type: "image/png" }), origen: "proveedor" as const };
};

const h: Herramientas = { buscar, descargar };

async function png(): Promise<Uint8Array<ArrayBuffer>> {
  const datos = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#3d6bff" } })
    .png()
    .toBuffer();
  const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
  copia.set(datos);
  return copia;
}

async function reiniciarCatalogo() {
  // Borrado ancho: solo puede pasar en la base de datos de prueba de este fichero.
  exigirBaseDeDatosDePrueba(BD_DE_PRUEBA);
  await db().delete(modelProviders);
  await db().delete(modelPrices);
  await db().delete(modelPriceSyncs);
  await sembrarCatalogo();
}

const delCatalogo = async (modelo: string) => (await listarModelos()).find((m) => m.modelo === modelo);

describe.skipIf(!hayBaseDeDatos)("catálogo dinámico con precios públicos", () => {
  let ana: Awaited<ReturnType<typeof crearSesionDePrueba>>;
  let actor: Actor;
  let referencia: string;

  beforeAll(async () => {
    await aplicarMigraciones();
    await reiniciarCatalogo();
    ana = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    referencia = (await crearMedio(actor, new File([await png()], "ana.png", { type: "image/png" }))).id;
  });

  afterAll(async () => {
    if (ana?.email) await db().delete(users).where(eq(users.email, ana.email));
    await reiniciarCatalogo();
  });

  beforeEach(() => {
    llamadas = { credito: 0, subida: 0, crearTarea: 0, consulta: 0 };
    registrosDelTest = REGISTROS_DE_PRECIO;
    creditosCobrados = 6;
    olvidarSaldos();
  });

  /** Cierra los trabajos que sigan en marcha: el tope de simultáneos no se hereda entre tests. */
  const cerrarEnCurso = () =>
    db()
      .update(generationJobs)
      .set({ state: "fallido", finishedAt: new Date(), errorMessage: "cerrado por el test" })
      .where(
        and(
          eq(generationJobs.userId, ana.id),
          inArray(generationJobs.state, ["en_cola", "preparando", "enviado", "en_curso"]),
        ),
      );

  const peticion = (creditos: number, extra: Record<string, unknown> = {}) => ({
    medioId: referencia,
    prompt: ESCENA,
    creditosConfirmados: creditos,
    derechos: true,
    claveIdempotencia: crypto.randomUUID(),
    ...extra,
  });

  describe("la sincronización es idempotente y deja rastro", () => {
    test("la primera pasada da de alta los modelos publicados con su precio", async () => {
      const resultado = await sincronizarProveedor("kie", { buscar });
      expect(resultado.ok).toBe(true);
      expect(resultado.modelosCreados).toBeGreaterThan(0);
      expect(resultado.preciosCreados).toBeGreaterThan(0);

      const gpt = await delCatalogo(GPT2);
      expect(gpt?.estado).toBe("precio_publicado");
      // La variante por defecto es la más barata: si alguien quiere gastar más, que lo decida.
      expect(gpt?.unidad).toBe("imagen a 1K");
      expect(gpt?.precio).toMatchObject({ creditos: 6, publicado: true });
      expect(gpt?.tarifas.map((t) => t.unidad)).toEqual(["imagen a 1K", "imagen a 2K", "imagen a 4K"]);

      const alta = (await historialCatalogo(200)).find((c) => c.modelo === GPT2 && c.campo === "alta");
      expect(alta?.evidencia).toContain("Tarifa publicada por kie");
    });

    test("repetirla no duplica nada", async () => {
      const antes = (await listarModelos()).length;
      const segunda = await sincronizarProveedor("kie", { buscar });
      expect(segunda.modelosCreados).toBe(0);
      expect(segunda.preciosCreados).toBe(0);
      expect(segunda.preciosActualizados).toBe(0);
      expect((await listarModelos()).length).toBe(antes);
    });

    test("no pisa un precio medido en esta instalación", async () => {
      // `nano-banana-2-lite` viene de la semilla con su precio medido: la tabla publicada no lo toca.
      const nano = await delCatalogo("nano-banana-2-lite");
      expect(nano?.precio?.publicado).toBe(false);
      expect(nano?.precio?.fuente).toContain("Medido");
      expect(nano?.estado).toBe("validado");
    });

    test("cada pasada queda apuntada, vaya bien o mal", async () => {
      const fallo = await sincronizarProveedor("kie", {
        buscar: async () => {
          throw new Error("el proveedor no contesta");
        },
      });
      expect(fallo.ok).toBe(false);
      const [ultima] = await db()
        .select()
        .from(modelPriceSyncs)
        .where(and(eq(modelPriceSyncs.provider, "kie"), eq(modelPriceSyncs.ok, false)))
        .limit(1);
      expect(ultima?.note).toContain("No se ha podido leer la tabla de precios");
    });

    test("un proveedor que no publica su tarifa lo dice en lugar de inventarse una", async () => {
      const resultado = await sincronizarProveedor("elevenlabs", { buscar });
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toContain("no publica su tabla de precios");
    });
  });

  describe("un modelo con precio publicado se puede usar de principio a fin", () => {
    test("se elige, se estima, se confirma, se reserva y se cierra con lo informado", async () => {
      await sincronizarProveedor("kie", { buscar });
      expect((await modelosElegibles("image_edit")).some((m) => m.modelo === GPT2)).toBe(true);

      const estimacion = await estimar(ana.id, "fotograma", buscar, GPT2);
      expect(estimacion.creditos).toBe(6);

      const { trabajo } = await crearFotograma(
        actor,
        peticion(estimacion.creditos, { modelo: GPT2, selloEstimacion: estimacion.sello }),
        h,
      );
      await enviarEncolados(h);
      // El proveedor cobra exactamente lo publicado: el consumo que se apunta es el suyo.
      const cerrado = await consultarTrabajo(actor, trabajo.id, {}, h);
      expect(cerrado.creditosConsumidos).toBe(6);
      await cerrarEnCurso();
    });

    test("la entrada que se envía lleva la resolución de la variante que se ha cobrado", async () => {
      const { entradaDeModelo } = await import("./kie/entradas");
      const gpt = await elegirModelo("image_edit", GPT2);
      const entrada = entradaDeModelo(gpt, { escena: ESCENA, dialogo: "", urls: ["https://tempfile.kie.ai/a.png"] });
      // GPT Image 2 recibe la referencia por «input_urls», no por «image_urls», y su resolución es la tarifada.
      expect(entrada).toMatchObject({ input_urls: ["https://tempfile.kie.ai/a.png"], resolution: "1K" });
    });

    test("si el proveedor cobra otra cosa, la diferencia queda registrada", async () => {
      creditosCobrados = 11;
      const estimacion = await estimar(ana.id, "fotograma", buscar, GPT2);
      const { trabajo } = await crearFotograma(
        actor,
        peticion(estimacion.creditos, { modelo: GPT2, selloEstimacion: estimacion.sello }),
        h,
      );
      await enviarEncolados(h);
      const cerrado = await consultarTrabajo(actor, trabajo.id, {}, h);
      // El consumo que se apunta es el real, siempre: lo publicado no corrige lo que ha pasado.
      expect(cerrado.creditosConsumidos).toBe(11);
      const desviacion = (await historialCatalogo(200)).find((c) => c.modelo === GPT2 && c.campo === "desviacion");
      expect(desviacion?.desde).toContain("6 créditos publicados");
      expect(desviacion?.hasta).toContain("11 créditos cobrados");
      await cerrarEnCurso();
    });
  });

  describe("variantes que se pueden elegir", () => {
    test("una tarifa por segundo de un modelo de vídeo medido no se puede elegir como variante", async () => {
      await sincronizarProveedor("kie", { buscar });
      const h3 = await delCatalogo("minimax-h3/reference-to-video");
      const otra = h3?.tarifas.find((t) => t.unidad !== h3.unidad);
      expect(otra).toBeDefined();
      const error = await cambiarVarianteDeModelo({ modeloId: h3?.id ?? "", unidad: otra?.unidad ?? "" }, ana.id).catch(
        (e) => e,
      );
      expect(error.estado).toBe(409);
      expect((await delCatalogo("minimax-h3/reference-to-video"))?.unidad).toBe(h3?.unidad);
    });
  });

  describe("un precio que cambia no toca lo ya confirmado", () => {
    test("sube el precio publicado, caduca la estimación anterior y deja historial", async () => {
      const estimacion = await estimar(ana.id, "fotograma", buscar, GPT2);
      const { trabajo } = await crearFotograma(
        actor,
        peticion(estimacion.creditos, { modelo: GPT2, selloEstimacion: estimacion.sello }),
        h,
      );

      // El proveedor sube GPT Image 2 a 1K de 6 a 9 créditos.
      registrosDelTest = REGISTROS_DE_PRECIO.map((r) =>
        r.modelDescription.trim() === "gpt image 2, image-to-image, 1k" ? { ...r, creditPrice: "9" } : r,
      );
      const resultado = await sincronizarProveedor("kie", { buscar });
      expect(resultado.preciosActualizados).toBe(1);
      expect((await delCatalogo(GPT2))?.precio?.creditos).toBe(9);

      // El trabajo ya creado conserva lo que se confirmó: es un hecho histórico.
      const [fila] = await db()
        .select({ estimados: generationJobs.estimatedCredits })
        .from(generationJobs)
        .where(eq(generationJobs.id, trabajo.id))
        .limit(1);
      expect(fila?.estimados).toBe(6);

      // Y la estimación que alguien tuviera en pantalla ya no vale: hay que volver a confirmarla.
      const error = await crearFotograma(
        actor,
        peticion(6, { modelo: GPT2, selloEstimacion: estimacion.sello }),
        h,
      ).catch((e) => e);
      expect(error.estado).toBe(409);

      const cambio = (await historialCatalogo(200)).find((c) => c.modelo === GPT2 && c.campo === "precio");
      expect(cambio?.hasta).toContain("9 créditos");
      await cerrarEnCurso();
      // Se devuelve a su precio publicado para el resto de la suite.
      registrosDelTest = REGISTROS_DE_PRECIO;
      await sincronizarProveedor("kie", { buscar });
    });

    test("un cambio de más del 50 % no se aplica solo: se anota para revisarlo", async () => {
      // El proveedor «baja» GPT Image 2 a 1K de 6 a 1 crédito: reservar 1 y cobrar 6 sería el peligro.
      registrosDelTest = REGISTROS_DE_PRECIO.map((r) =>
        r.modelDescription.trim() === "gpt image 2, image-to-image, 1k" ? { ...r, creditPrice: "1" } : r,
      );
      const resultado = await sincronizarProveedor("kie", { buscar });
      expect(resultado.preciosActualizados).toBe(0);
      expect((await delCatalogo(GPT2))?.precio?.creditos).toBe(6);
      const pendiente = (await historialCatalogo(200)).find(
        (c) => c.modelo === GPT2 && c.campo === "precio" && c.hasta.includes("no aplicado"),
      );
      expect(pendiente?.hasta).toContain("no aplicado");
      registrosDelTest = REGISTROS_DE_PRECIO;
    });
  });

  describe("un modelo que esta instalación no sabe pedir no se puede elegir", () => {
    test("está en el catálogo con su precio, pero no es elegible y dice por qué", async () => {
      await sincronizarProveedor("kie", { buscar });
      const publicados = await listarModelos();
      const sinFamilia = publicados.find((m) => m.modelo === SIN_FAMILIA);
      expect(sinFamilia).toBeDefined();
      expect(sinFamilia?.estado).toBe("descubierto");
      expect(sinFamilia?.precio).not.toBeNull();
      expect((await modelosElegibles("image_to_video")).some((m) => m.id === sinFamilia?.id)).toBe(false);

      const error = await elegirModelo("image_to_video", sinFamilia?.modelo).catch((e) => e);
      expect(error.estado).toBe(409);
      expect(error.message).toContain("no sabe con qué parámetros");
      expect(llamadas).toMatchObject({ crearTarea: 0, subida: 0 });
    });
  });
});
