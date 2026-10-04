import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";

/**
 * Catálogo de modelos contra el PostgreSQL local: qué se puede elegir, qué no, y qué pasa cuando cambia un
 * precio. **Ningún test llama a KIE**: el proveedor se simula y la clave es inventada.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

// Base de datos aparte: estos tests cambian el catálogo de la instalación.
const BD_DE_PRUEBA = "escenara_pruebas_catalogo";
const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba(BD_DE_PRUEBA);
}

const { and, eq, inArray } = await import("drizzle-orm");
const rutaTrabajos = await import("@/app/api/generacion/trabajos/route");
const rutaEstimacion = await import("@/app/api/generacion/estimacion/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, modelPrices, modelProviders, users } = await import("../db/esquema");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { guardarCredencial } = await import("../boveda/credenciales");
const { crearMedio } = await import("../media/servicio");
const { estimar, olvidarSaldos } = await import("../generacion/estimacion");
const { crearAnimacion, crearFotograma } = await import("../generacion/servicio");
const { obtenerTrabajo } = await import("../generacion/trabajos");
const { enviarEncolados } = await import("../cola/pasada");
const { historialCatalogo, listarModelos, modelosElegibles } = await import("./catalogo");
const { cambiarEstadoDeModelo, cambiarPrecioDeModelo, marcarPredeterminado } = await import("./catalogo-admin");
const { adaptadorKie } = await import("./kie/adaptador");
const semillaJson = (await import("./catalogo.json")).default;
const { sembrarCatalogo } = await import("./semilla");
type Buscador = import("./codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type Actor = import("../media/servicio").Actor;

const CLAVE = "sk-clave-de-kie-inventada-para-el-catalogo";
const ESCENA = "En una cafetería luminosa, saluda a cámara con una sonrisa.";
const NANO = "nano-banana-2-lite";
const SEEDREAM = "seedream/4.5-edit";
const HAILUO = "hailuo/2-3-image-to-video-standard";
/** Modelo de texto del asistente de guion (0.17.0), sembrado como `descubierto`. */
const TEXTO = "gpt-5-6-sol";
const VOZ = "elevenlabs/text-to-speech-multilingual-v2";
/** Modelo de voz de ElevenLabs directo (0.21.0): es el proveedor de reserva y sí trae precio medido. */
const VOZ_RESERVA = "eleven_multilingual_v2";

let llamadas = { credito: 0, subida: 0, crearTarea: 0, consulta: 0 };
/** Identificador de tarea único por proceso: una tarea del proveedor es un solo trabajo (clave única). */
let siguienteTarea = 0;

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url) => {
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
    return sobre({ taskId: `task_${++siguienteTarea}` });
  }
  if (url.includes("recordInfo")) {
    llamadas.consulta++;
    return sobre({ state: "waiting" });
  }
  throw new Error(`URL no simulada: ${url}`);
};

const descargar: Herramientas["descargar"] = async () => {
  throw new Error("ningún test de catálogo descarga resultados");
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

/**
 * Deja el catálogo recién sembrado. Borrar el proveedor arrastra sus modelos, sus capacidades y su
 * historial; los precios van en su propia tabla.
 */
async function reiniciarCatalogo() {
  // Borrado ancho: solo puede pasar en la base de datos de prueba de este fichero.
  exigirBaseDeDatosDePrueba(BD_DE_PRUEBA);
  await db().delete(modelProviders);
  await db().delete(modelPrices);
  await sembrarCatalogo();
}

const idDe = async (modelo: string) => {
  const fila = (await listarModelos()).find((m) => m.modelo === modelo);
  if (!fila) throw new Error(`el catálogo no tiene ${modelo}`);
  return fila.id;
};

describe.skipIf(!hayBaseDeDatos)("catálogo de modelos", () => {
  let admin: Awaited<ReturnType<typeof crearSesionDePrueba>>;
  let ana: Awaited<ReturnType<typeof crearSesionDePrueba>>;
  let actor: Actor;
  let referencia: string;

  beforeAll(async () => {
    await aplicarMigraciones();
    // El catálogo es configuración de la instalación, y estos tests lo cambian: se deja recién sembrado
    // para que la suite dé el mismo resultado se ejecute una vez o veinte (borrar el proveedor arrastra
    // sus modelos, capacidades e historial).
    await reiniciarCatalogo();
    [admin, ana] = await Promise.all([crearSesionDePrueba("admin"), crearSesionDePrueba("user")]);
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    referencia = (await crearMedio(actor, new File([await png()], "ana.png", { type: "image/png" }))).id;
  });

  afterAll(async () => {
    for (const correo of [admin?.email, ana?.email]) {
      if (correo) await db().delete(users).where(eq(users.email, correo));
    }
    // El catálogo se deja como lo siembra el fichero versionado: es configuración de la instalación, y
    // `bun test` comparte proceso (y por tanto conexión) entre ficheros de prueba.
    await reiniciarCatalogo();
  });

  beforeEach(() => {
    llamadas = { credito: 0, subida: 0, crearTarea: 0, consulta: 0 };
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

  /** Petición desde la propia aplicación: las rutas que gastan exigen `Origin` del mismo sitio. */
  const desdeLaApp = (url: string, init: RequestInit = {}) =>
    new Request(`http://localhost${url}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), cookie: ana.cookie, origin: "http://localhost" },
    });

  const peticion = (creditos: number, extra: Record<string, unknown> = {}) => ({
    medioId: referencia,
    prompt: ESCENA,
    creditosConfirmados: creditos,
    derechos: true,
    claveIdempotencia: crypto.randomUUID(),
    ...extra,
  });

  describe("semilla versionada", () => {
    test("siembra los modelos medidos y no los duplica al repetirse", async () => {
      const antes = await listarModelos();
      expect(antes.map((m) => m.modelo).sort()).toEqual(
        [
          "gemini-omni-video",
          "google/gemini-omni-flash-1-1",
          "gpt-image-2-5-flare-image-to-image",
          // Cuatro modelos APIMart medidos con dinero real (0.52.0, ADR-0044): ninguno es predeterminado.
          "gemini-omni-1.1-flash-ext",
          "MiniMax-Hailuo-2.3-Fast",
          "gpt-image-2.5-flare",
          "veo3.1-lite-ext",
          "grok-imagine/image-to-video",
          "grok-imagine/text-to-video",
          HAILUO,
          "kling/v3-turbo-image-to-video",
          "kokoro",
          // Segundo motor de escenas habladas (0.22.0), medido: 40 créditos por 5 s a 768P.
          "minimax-h3/reference-to-video",
          NANO,
          SEEDREAM,
          "veo3_fast",
          "veo3_lite",
          // Modelo de texto del asistente de guion (0.17.0), validado con su coste medido llamada a llamada.
          TEXTO,
          // Modelo de voz del «market» de KIE (0.21.0). Se siembra sin precio a propósito: sin precio medido no
          // se puede elegir, así que está en el catálogo pero no entre los elegibles.
          VOZ,
          VOZ_RESERVA,
        ].sort(),
      );
      const resultado = await sembrarCatalogo();
      expect(resultado).toEqual({ proveedoresCreados: 0, modelosCreados: 0, preciosCreados: 0 });
      expect((await listarModelos()).length).toBe(antes.length);
    });

    test("los modelos por defecto son los de ADR-0009, con su precio medido", async () => {
      const [imagen] = await modelosElegibles("image_edit");
      const [video] = await modelosElegibles("image_to_video");
      expect(imagen?.modelo).toBe(NANO);
      expect(imagen?.precio?.creditos).toBe(4);
      expect(imagen?.estado).toBe("validado");
      // Veo 3.1 Fast es el predeterminado de animación desde que se midió: mismo precio que Lite por 8 s de clip.
      expect(video?.modelo).toBe("veo3_fast");
      expect(video?.precio?.creditos).toBe(60);
      expect(video?.conVoz).toBe(true);
    });

    test("el catálogo se puede filtrar por capacidad", async () => {
      const deVideo = await listarModelos({ capacidad: "image_to_video" });
      expect(deVideo.map((m) => m.modelo).sort()).toEqual(
        [
          "gemini-omni-video",
          "google/gemini-omni-flash-1-1",
          // APIMart (0.52.0): sus tres motores de vídeo, validados pero no predeterminados.
          "gemini-omni-1.1-flash-ext",
          "MiniMax-Hailuo-2.3-Fast",
          "veo3.1-lite-ext",
          "grok-imagine/image-to-video",
          HAILUO,
          "kling/v3-turbo-image-to-video",
          "minimax-h3/reference-to-video",
          "veo3_fast",
          "veo3_lite",
        ].sort(),
      );
      // Los tres modelos de voz están sembrados y **dos son elegibles**: el de ElevenLabs y kokoro (validado con una
      // llamada real y con su precio de 0 por cuota). El de KIE sigue «descubierto» y sin precio.
      expect((await listarModelos({ capacidad: "tts" })).map((m) => m.modelo).sort()).toEqual(
        [VOZ, VOZ_RESERVA, "kokoro"].sort(),
      );
      expect((await modelosElegibles("tts")).map((m) => m.modelo).sort()).toEqual([VOZ_RESERVA, "kokoro"].sort());
    });

    test("de cada modelo sembrado se sabe montar su entrada con sus rarezas reales", async () => {
      const urls = ["https://tempfile.kie.ai/referencia.png"];
      const contexto = { escena: ESCENA, dialogo: "Hola a todos", urls };
      const porModelo = new Map((await listarModelos()).map((m) => [m.modelo, m]));

      for (const sembrado of semillaJson.modelos) {
        const modelo = porModelo.get(sembrado.modelo);
        expect(modelo).toBeDefined();
        if (!modelo) continue;
        // Los modelos de texto no pasan por `jobs/createTask` ni reciben referencias: tienen su propio endpoint
        // (`codex/v1/responses`) y su propia entrada, así que aquí no hay ninguna que montar.
        if (modelo.capacidades.includes("text_generation")) continue;
        // El de voz tampoco: no recibe referencias y su entrada necesita la voz fijada del proyecto, que se
        // comprueba en la suite de voz con su propio contexto.
        if (modelo.capacidades.includes("tts")) continue;
        // APIMart (0.52.0) tiene su propio montador de entradas, con sus campos y rarezas distintas, probado en su
        // propia suite (`apimart/entradas.test.ts`): aquí solo se comprueba el montador de KIE.
        if (sembrado.proveedor !== "kie") continue;
        const entrada = adaptadorKie.montarEntrada(modelo, contexto);
        // Toda entrada lleva prompt y recibe la referencia por el campo que espera ese modelo. Un modelo que no
        // acepta ninguna (texto a vídeo puro) no la recibe: pedírsela sería enviarle un campo que rechaza.
        expect(typeof entrada.prompt).toBe("string");
        if (modelo.parametros.maximoReferencias > 0) {
          expect(JSON.stringify(entrada)).toContain(urls[0] as string);
        }
        // La proporción solo va si el modelo la admite.
        expect(entrada.aspect_ratio === undefined).toBe(modelo.parametros.proporciones.length === 0);
        // El diálogo solo llega a los modelos con voz.
        expect(JSON.stringify(entrada).includes("Hola a todos")).toBe(modelo.conVoz);
      }

      expect(
        adaptadorKie.montarEntrada(porModelo.get("gpt-image-2-5-flare-image-to-image") as never, contexto),
      ).toMatchObject({ input_urls: urls });
      expect(adaptadorKie.montarEntrada(porModelo.get(HAILUO) as never, contexto)).toMatchObject({
        image_url: urls[0],
        duration: "6",
        resolution: "768P",
      });
      /**
       * Los dos modelos de vídeo de la 0.21.1, con lo que de verdad se midió el 2026-09-28. Gemini Omni recibe el
       * diálogo (lo dice en español con exactitud) y hasta siete referencias; Grok Imagine **no recibe diálogo**
       * y su modo va fijo en «normal», porque el «spicy» del proveedor no se ofrece aquí.
       */
      expect(adaptadorKie.montarEntrada(porModelo.get("gemini-omni-video") as never, contexto)).toMatchObject({
        image_urls: urls,
        duration: "4",
        resolution: "720p",
        aspect_ratio: "9:16",
      });
      expect(
        JSON.stringify(adaptadorKie.montarEntrada(porModelo.get("gemini-omni-video") as never, contexto)),
      ).toContain("Hola a todos");
      const grok = adaptadorKie.montarEntrada(porModelo.get("grok-imagine/text-to-video") as never, contexto);
      expect(grok).toMatchObject({ mode: "normal", duration: "6", resolution: "480p", aspect_ratio: "9:16" });
      expect(JSON.stringify(grok)).not.toContain("Hola a todos");
      expect(JSON.stringify(grok)).not.toContain("spicy");
      // Kling solo acepta JPEG o PNG: es lo que obliga a convertir el fotograma WebP antes de subirlo.
      expect(porModelo.get("kling/v3-turbo-image-to-video")?.parametros.formatosReferencia).toEqual([
        "image/jpeg",
        "image/png",
      ]);
    });

    test("el alta de cada modelo queda en el historial", async () => {
      const historial = await historialCatalogo(100);
      expect(historial.filter((c) => c.campo === "alta").length).toBeGreaterThanOrEqual(6);
      expect(historial.every((c) => c.autor === null || c.autor === admin.email)).toBe(true);
    });
  });

  describe("un modelo que no se puede usar no se elige ni se envía", () => {
    test("un modelo retirado desaparece de lo elegible y se rechaza al enviar", async () => {
      await cambiarEstadoDeModelo({ modeloId: await idDe(SEEDREAM), estado: "retirado", evidencia: "" }, admin.id);
      const elegibles = await modelosElegibles("image_edit");
      expect(elegibles.some((m) => m.modelo === SEEDREAM)).toBe(false);

      const error = await crearFotograma(actor, peticion(7, { modelo: SEEDREAM }), h).catch((e) => e);
      expect(error.estado).toBe(409);
      expect(error.message).toContain("retirado");
      expect(llamadas).toMatchObject({ crearTarea: 0, subida: 0 });

      // Se devuelve a `compatible` para el resto de la suite.
      await cambiarEstadoDeModelo({ modeloId: await idDe(SEEDREAM), estado: "compatible", evidencia: "" }, admin.id);
      expect((await modelosElegibles("image_edit")).some((m) => m.modelo === SEEDREAM)).toBe(true);
    });

    test("un modelo sin la capacidad necesaria se rechaza sin llamar al proveedor", async () => {
      // Un modelo de imagen no sabe animar, y uno de vídeo no sabe generar un fotograma: en los dos casos se
      // rechaza antes de tocar al proveedor, que es lo que importa del dinero.
      const error = await crearFotograma(actor, peticion(60, { modelo: "veo3_lite" }), h).catch((e) => e);
      expect(error.estado).toBe(400);
      expect(error.message).toContain("no sirve para esto");
      expect(llamadas).toMatchObject({ crearTarea: 0, subida: 0 });
    });

    test("un clip de un fotograma que no existe se rechaza antes que nada", async () => {
      // Desde la 0.23.4 el fotograma se lee **antes** de estimar: su proyecto es el que decide la duración, y la
      // duración decide qué tarifa se cobra. Un fotograma que no existe no llega a estimarse ni a enviarse.
      const error = await crearAnimacion(
        actor,
        {
          trabajoPadreId: crypto.randomUUID(),
          prompt: ESCENA,
          creditosConfirmados: 4,
          derechos: true,
          claveIdempotencia: crypto.randomUUID(),
          modelo: NANO,
        },
        h,
      ).catch((e) => e);
      expect(error.estado).toBe(404);
      expect(llamadas).toMatchObject({ crearTarea: 0, subida: 0 });
    });

    test("un modelo que no está en el catálogo se rechaza", async () => {
      const error = await crearFotograma(actor, peticion(4, { modelo: "modelo-inventado" }), h).catch((e) => e);
      expect(error.estado).toBe(400);
      expect(llamadas.crearTarea).toBe(0);
    });

    test("un modelo compatible sí se puede elegir y se envía con su propio precio", async () => {
      const estimacion = await estimar(ana.id, "fotograma", buscar, SEEDREAM);
      expect(estimacion.creditos).toBe(7); // 6,5 créditos medidos, redondeados al alza
      const trabajo = (
        await crearFotograma(actor, peticion(7, { modelo: SEEDREAM, selloEstimacion: estimacion.sello }), h)
      ).trabajo;
      expect(trabajo.modelo).toBe(SEEDREAM);
      // Desde 0.12.0 la petición encola y el envío lo hace la cola (ADR-0003).
      await enviarEncolados(h);
      expect((await obtenerTrabajo(ana.id, trabajo.id)).estado).toBe("enviado");
      expect(llamadas.crearTarea).toBe(1);
    });
  });

  describe("seguridad de la base de datos", () => {
    test("el guardián aborta un borrado ancho si la base conectada no es de prueba", () => {
      const registro = globalThis as { __escenaraBdsDePrueba?: Set<string> };
      const previo = registro.__escenaraBdsDePrueba;
      // Como si nadie hubiera cambiado de base: la conexión sería la de desarrollo.
      registro.__escenaraBdsDePrueba = new Set();
      try {
        expect(() => exigirBaseDeDatosDePrueba(BD_DE_PRUEBA)).toThrow(/base de datos de prueba/);
      } finally {
        registro.__escenaraBdsDePrueba = previo;
      }
    });
  });

  describe("por la ruta HTTP", () => {
    test("la estimación de un modelo retirado responde 409 con su mensaje", async () => {
      await cambiarEstadoDeModelo(
        { modeloId: await idDe(SEEDREAM), estado: "retirado", evidencia: "Retirado para la prueba de la ruta." },
        admin.id,
      );
      const respuesta = await rutaEstimacion.GET(
        desdeLaApp(`/api/generacion/estimacion?tipo=fotograma&modelo=${encodeURIComponent(SEEDREAM)}`),
        undefined,
      );
      expect(respuesta.status).toBe(409);
      expect((await respuesta.json()).error).toContain("retirado");
      expect(llamadas).toMatchObject({ crearTarea: 0, subida: 0 });
    });

    test("enviar un trabajo con un modelo retirado responde 409 y no llama al proveedor", async () => {
      const respuesta = await rutaTrabajos.POST(
        desdeLaApp("/api/generacion/trabajos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "fotograma",
            ...peticion(7, { modelo: SEEDREAM, selloEstimacion: "kie:seedream/4.5-edit:imagen@v1" }),
          }),
        }),
        undefined,
      );
      expect(respuesta.status).toBe(409);
      expect((await respuesta.json()).error).toContain("retirado");
      expect(llamadas).toMatchObject({ crearTarea: 0, subida: 0 });

      await cambiarEstadoDeModelo(
        { modeloId: await idDe(SEEDREAM), estado: "compatible", evidencia: "Vuelve a estar disponible." },
        admin.id,
      );
    });

    test("un modelo que no es un identificador válido se rechaza con 400", async () => {
      const respuesta = await rutaEstimacion.GET(
        desdeLaApp("/api/generacion/estimacion?tipo=fotograma&modelo=%27%3B%20drop%20table%20models%3B%20--"),
        undefined,
      );
      expect(respuesta.status).toBe(400);
    });

    test("elegir modelo sin devolver el sello de la estimación se rechaza con 400", async () => {
      const respuesta = await rutaTrabajos.POST(
        desdeLaApp("/api/generacion/trabajos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo: "fotograma", ...peticion(4, { modelo: NANO }) }),
        }),
        undefined,
      );
      expect(respuesta.status).toBe(400);
      expect((await respuesta.json()).error).toContain("estimación confirmada");
      expect(llamadas).toMatchObject({ crearTarea: 0, subida: 0 });
    });

    test("sin elegir modelo se sigue enviando como en la 0.10.x, con el predeterminado", async () => {
      await cerrarEnCurso();
      const estimacion = await estimar(ana.id, "fotograma", buscar);
      const trabajo = (await crearFotograma(actor, peticion(estimacion.creditos), h)).trabajo;
      expect(trabajo.modelo).toBe(NANO);
      await enviarEncolados(h);
      expect((await obtenerTrabajo(ana.id, trabajo.id)).estado).toBe("enviado");
      await cerrarEnCurso();
    });
  });

  describe("la opción por defecto", () => {
    test("no se puede retirar el predeterminado sin designar otro antes", async () => {
      const error = await cambiarEstadoDeModelo(
        { modeloId: await idDe(NANO), estado: "retirado", evidencia: "Se retira sin sustituto." },
        admin.id,
      ).catch((e) => e);
      expect(error.estado).toBe(409);
      expect(error.message).toContain("predeterminado");
      expect((await listarModelos()).find((m) => m.modelo === NANO)?.estado).not.toBe("retirado");
    });

    test("al designar otro, el anterior deja de serlo y el cambio queda en el historial", async () => {
      await marcarPredeterminado({ modeloId: await idDe(SEEDREAM), capacidad: "image_edit" }, admin.id);
      const modelos = await listarModelos({ capacidad: "image_edit" });
      expect(modelos.filter((m) => m.predeterminado).map((m) => m.modelo)).toEqual([SEEDREAM]);
      expect((await modelosElegibles("image_edit"))[0]?.modelo).toBe(SEEDREAM);
      const historial = await historialCatalogo(2);
      expect(historial.every((c) => c.campo === "predeterminado")).toBe(true);

      // Y ahora sí se puede retirar el que ya no es el predeterminado, guardando el motivo.
      const motivo = "El proveedor lo ha dejado de ofrecer (prueba).";
      await cambiarEstadoDeModelo({ modeloId: await idDe(NANO), estado: "retirado", evidencia: motivo }, admin.id);
      const [cambio] = await historialCatalogo(1);
      expect(cambio).toMatchObject({ campo: "estado", hasta: "retirado", evidencia: motivo });

      // Se deja el catálogo como estaba para el resto de la suite.
      await reiniciarCatalogo();
      expect((await modelosElegibles("image_edit"))[0]?.modelo).toBe(NANO);
    });

    test("un modelo que no se puede usar no puede ser el predeterminado", async () => {
      const error = await marcarPredeterminado(
        { modeloId: await idDe(NANO), capacidad: "image_to_video" },
        admin.id,
      ).catch((e) => e);
      expect(error.estado).toBe(400);
    });
  });

  describe("estado y evidencia", () => {
    test("validar exige evidencia", async () => {
      const error = await cambiarEstadoDeModelo(
        { modeloId: await idDe(HAILUO), estado: "validado", evidencia: "vale" },
        admin.id,
      ).catch((e) => e);
      expect(error.estado).toBe(400);
      expect((await listarModelos()).find((m) => m.modelo === HAILUO)?.estado).toBe("compatible");
    });

    test("con evidencia se valida y el cambio queda registrado con su autor", async () => {
      const evidencia = "30 créditos por clip de 6 s medidos el 2026-09-27 en la comparativa real, sin audio.";
      const { modelo } = await cambiarEstadoDeModelo(
        { modeloId: await idDe(HAILUO), estado: "validado", evidencia },
        admin.id,
      );
      expect(modelo.estado).toBe("validado");
      expect(modelo.evidencia).toBe(evidencia);
      const [ultimo] = await historialCatalogo(1);
      expect(ultimo).toMatchObject({ campo: "estado", desde: "compatible", hasta: "validado", autor: admin.email });
    });
  });

  describe("cambiar el precio caduca las estimaciones anteriores", () => {
    test("el sello cambia, la estimación vieja se rechaza y lo ya consumido no se toca", async () => {
      const antes = await estimar(ana.id, "fotograma", buscar, NANO);
      expect(antes.creditos).toBe(4);

      // Trabajo ya terminado con lo que costó de verdad: un cambio de precio no puede reescribirlo.
      const [terminado] = await db()
        .insert(generationJobs)
        .values({
          userId: ana.id,
          kind: "fotograma",
          provider: "kie",
          model: NANO,
          prompt: ESCENA,
          input: {},
          estimatedCredits: 4,
          consumedCredits: 4,
          state: "listo",
          taskId: `historico_${crypto.randomUUID()}`,
          finishedAt: new Date(),
        })
        .returning({ id: generationJobs.id });

      const { modelo, estimacionesAfectadas } = await cambiarPrecioDeModelo(
        {
          modeloId: await idDe(NANO),
          creditos: 9,
          fuente: "Subida de tarifa del proveedor comprobada en su panel",
          comprobado: "2026-09-27",
        },
        admin.id,
      );
      expect(modelo.precio?.creditos).toBe(9);
      expect(modelo.precio?.sello).not.toBe(antes.sello);
      expect(estimacionesAfectadas).toBeGreaterThanOrEqual(0);

      // La estimación que alguien tuviera en pantalla ya no vale.
      const error = await crearFotograma(actor, peticion(4, { modelo: NANO, selloEstimacion: antes.sello }), h).catch(
        (e) => e,
      );
      expect(error.estado).toBe(409);
      expect(llamadas.crearTarea).toBe(0);

      // Y con el precio nuevo, confirmando lo que ahora se muestra, sí se envía.
      const ahora = await estimar(ana.id, "fotograma", buscar, NANO);
      expect(ahora.creditos).toBe(9);
      const trabajo = (await crearFotograma(actor, peticion(9, { modelo: NANO, selloEstimacion: ahora.sello }), h))
        .trabajo;
      expect(trabajo.creditosEstimados).toBe(9);

      const [historico] = await db()
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, terminado?.id as string));
      expect(historico?.consumedCredits).toBe(4);
      expect(historico?.estimatedCredits).toBe(4);

      const [cambio] = await historialCatalogo(1);
      expect(cambio).toMatchObject({ campo: "precio", autor: admin.email });
      expect(cambio?.desde).toContain("4 créditos");
      expect(cambio?.hasta).toContain("9 créditos");
    });

    test("el aviso cuenta los trabajos de ese modelo que siguen en marcha", async () => {
      await cerrarEnCurso();
      const enMarcha = await estimar(ana.id, "fotograma", buscar, SEEDREAM);
      const trabajo = (
        await crearFotograma(
          actor,
          peticion(enMarcha.creditos, { modelo: SEEDREAM, selloEstimacion: enMarcha.sello }),
          h,
        )
      ).trabajo;
      await enviarEncolados(h);
      expect((await obtenerTrabajo(ana.id, trabajo.id)).estado).toBe("enviado");

      const { estimacionesAfectadas } = await cambiarPrecioDeModelo(
        {
          modeloId: await idDe(SEEDREAM),
          creditos: 8,
          fuente: "Cambio de tarifa comprobado en el panel del proveedor",
          comprobado: "2026-09-27",
        },
        admin.id,
      );
      expect(estimacionesAfectadas).toBe(1);

      // El trabajo en marcha conserva lo que se le estimó al enviarlo.
      const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo.id));
      expect(fila?.estimatedCredits).toBe(enMarcha.creditos);
      await cerrarEnCurso();
    });

    test("un precio sin fuente o con fecha futura no se guarda", async () => {
      const id = await idDe(NANO);
      const sinFuente = await cambiarPrecioDeModelo(
        { modeloId: id, creditos: 5, fuente: "", comprobado: "2026-09-27" },
        admin.id,
      ).catch((e) => e);
      expect(sinFuente.estado).toBe(400);
      const futuro = await cambiarPrecioDeModelo(
        { modeloId: id, creditos: 5, fuente: "Panel del proveedor", comprobado: "2099-01-01" },
        admin.id,
      ).catch((e) => e);
      expect(futuro.estado).toBe(400);
    });
  });
});
