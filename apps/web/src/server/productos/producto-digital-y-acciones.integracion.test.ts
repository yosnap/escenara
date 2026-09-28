import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";

/**
 * **Producto digital en dos pasos, acciones de moda y piel, y las tres decisiones del propietario** (0.26.0),
 * contra el PostgreSQL local.
 *
 * Lo que comprueba, de punta a punta:
 *
 * - un **producto digital** se hace en dos pasos: primero el fotograma con la **pantalla apagada** (sin
 *   ninguna foto suya, para que no se copie la interfaz antes de tiempo) y después la **inserción de la
 *   captura** en esa pantalla, con su perspectiva y sin recortarla. Cada paso es un envío con su propia
 *   confirmación, y el clip anima el resultado;
 * - sin captura de pantalla el segundo paso **no se intenta**: se dice con su causa y no se cobra;
 * - las acciones de **moda** y de **piel** llegan al prompt; las de piel avisan de que son poco fiables antes
 *   de cobrar, y ninguna acción sin habla **prohíbe el audio** (prohibírselo es lo que hace fallar a estos
 *   modelos);
 * - la casilla **«tengo derecho a usar esta marca»** bloquea el envío mientras no se marca, y solo se pide
 *   cuando hay producto;
 * - el **plano del producto solo** se pide sin personaje y sin imagen de partida, y en su prompt no hay nadie.
 *
 * **Ningún test llama a KIE**: el proveedor se simula por los puntos de inyección que ya existen
 * (`Herramientas`), nunca sustituyendo `globalThis.fetch`.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_producto_digital");
}

const { eq } = await import("drizzle-orm");
const rutaProductos = await import("@/app/api/productos/route");
const rutaProducto = await import("@/app/api/productos/[id]/route");
const rutaTrabajos = await import("@/app/api/generacion/trabajos/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs } = await import("../db/esquema");
const { guardarCredencial } = await import("../boveda/credenciales");
const { crearMedio } = await import("../media/servicio");
const { avanzarEnviados, enviarEncolados } = await import("../cola/pasada");
const { estimar, olvidarSaldos } = await import("../generacion/estimacion");

type ProductoVista = import("@/lib/productos").ProductoVista;
type TrabajoVista = import("@/lib/generacion").TrabajoVista;
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;

const CLAVE = "sk-ana-clave-de-kie-inventada-digital";

// ── Proveedor simulado ───────────────────────────────────────────────────────────────────────────────────

let siguienteTarea = 0;

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const enviados: { modelo: string; entrada: Record<string, unknown> }[] = [];
let subidas = 0;

const buscar: Buscador = async (url, opciones) => {
  if (url.includes("/chat/credit")) return sobre(100000);
  if (url.includes("file-stream-upload")) {
    subidas++;
    return sobre({ downloadUrl: `https://tempfile.kie.ai/ref-${subidas}.png` });
  }
  if (url.includes("createTask")) {
    const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { model?: string; input?: Record<string, unknown> };
    enviados.push({ modelo: cuerpo.model ?? "", entrada: cuerpo.input ?? {} });
    return sobre({ taskId: `task_${++siguienteTarea}_${randomBytes(6).toString("hex")}` });
  }
  if (url.includes("recordInfo")) {
    return sobre({
      state: "success",
      resultJson: JSON.stringify({ resultUrls: ["https://tempfile.kie.ai/imagen.png"] }),
      creditsConsumed: 4,
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

const png = async () =>
  bytes(
    await sharp({ create: { width: 96, height: 96, channels: 3, background: "#101010" } })
      .png()
      .toBuffer(),
  );

const descargar: Herramientas["descargar"] = async (url) => ({
  archivo: new File([await png()], "imagen.png", { type: "image/png" }),
  origen: url,
});

const h: Herramientas = { buscar, descargar };

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;

const pedir = (s: Sesion, url: string, metodo: string, cuerpo?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: metodo,
    headers: { cookie: s.cookie, origin: "http://localhost", "Content-Type": "application/json" },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

const contexto = (id: string) => ({ params: Promise.resolve({ id }) });

/** Todos los avisos salvables del producto: en estos tests se confirman, que es lo que hace la pantalla. */
const AVISOS = [
  "producto-con-marca",
  "producto-sin-fotos",
  "producto-sin-hueco-de-referencia",
  "producto-referencias-no-caben",
  "producto-accion-poco-fiable",
];

describe.skipIf(!hayBaseDeDatos)("producto digital en dos pasos y acciones especiales", () => {
  let ana: Sesion;
  let creditosFoto: number;
  let selloFoto: string;
  let creditosFotoSinImagen: number;
  let selloFotoSinImagen: string;
  let creditosClip: number;
  let selloClip: string;
  let segundosClip: number;

  beforeAll(async () => {
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    const foto = await estimar(ana.id, "fotograma", buscar);
    creditosFoto = foto.creditos;
    selloFoto = foto.sello;
    // Sin imagen de partida se estima con el gemelo de texto a imagen: es otro modelo y otra tarifa.
    const sinImagen = await estimar(ana.id, "fotograma", buscar, undefined, { sinReferencia: true });
    creditosFotoSinImagen = sinImagen.creditos;
    selloFotoSinImagen = sinImagen.sello;
    const clip = await estimar(ana.id, "animacion", buscar);
    creditosClip = clip.creditos;
    selloClip = clip.sello;
    segundosClip = clip.segundos ?? 8;
  });

  beforeEach(async () => {
    olvidarSaldos();
    enviados.length = 0;
    subidas = 0;
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
  });

  const subirFoto = async (nombre: string) =>
    (await crearMedio({ id: ana.id, esAdmin: false }, new File([await png()], nombre, { type: "image/png" }))).id;

  async function crearProducto(nombre: string, tipo: "fisico" | "digital"): Promise<ProductoVista> {
    const respuesta = await rutaProductos.POST(
      pedir(ana, "/api/productos", "POST", {
        nombre,
        descripcion: tipo === "digital" ? "App de notas con fondo oscuro." : "Bote blanco con etiqueta negra.",
        tipo,
        marcaVisible: true,
      }),
      undefined,
    );
    expect(respuesta.status).toBe(201);
    return (await respuesta.json()) as ProductoVista;
  }

  const anadirFoto = async (productoId: string, papel: string) => {
    const medioId = await subirFoto(`${papel}.png`);
    const respuesta = await rutaProducto.PATCH(
      pedir(ana, `/api/productos/${productoId}`, "PATCH", {
        accion: "anadir-fotos",
        fotos: [{ medioId, papel }],
      }),
      contexto(productoId),
    );
    expect(respuesta.status).toBe(200);
    return medioId;
  };

  /** Pide un fotograma y devuelve la respuesta cruda: hay tests que esperan que **no** se pueda. */
  const pedirFotograma = (cuerpo: Record<string, unknown>) =>
    rutaTrabajos.POST(
      pedir(ana, "/api/generacion/trabajos", "POST", {
        tipo: "fotograma",
        prompt: "En un escritorio de madera, sostiene el móvil hacia la cámara.",
        creditosConfirmados: creditosFoto,
        selloEstimacion: selloFoto,
        derechos: true,
        sinTerceros: true,
        claveIdempotencia: crypto.randomUUID(),
        avisosConfirmados: AVISOS,
        ...cuerpo,
      }),
      undefined,
    );

  /** El último prompt que se le ha pedido al proveedor. */
  const ultimoPrompt = () => String(enviados.at(-1)?.entrada.prompt ?? "");

  // ── 1. Los dos pasos del producto digital ──────────────────────────────────────────────────────────────

  describe("un producto digital se hace en dos pasos", () => {
    test("pantalla apagada, captura insertada y clip, cada paso con su confirmación", async () => {
      const producto = await crearProducto(`App Aurora ${randomBytes(3).toString("hex")}`, "digital");
      const capturaId = await anadirFoto(producto.id, "captura_pantalla");
      const partida = await subirFoto("persona-con-movil.png");

      // ── Paso 1: el fotograma con la pantalla apagada ────────────────────────────────────────────────
      const paso1 = await pedirFotograma({
        medioId: partida,
        derechoMarca: true,
        producto: { productoId: producto.id, accion: "sostenerlo" },
      });
      expect(paso1.status).toBe(201);
      const trabajo1 = (await paso1.json()) as TrabajoVista;
      await enviarEncolados(h);
      // Se completa la tarea en el proveedor simulado: el paso 2 parte de la imagen que deja el paso 1.
      await avanzarEnviados(h);
      const prompt1 = ultimoPrompt();
      // Se le pide una pantalla negra y **no** se le enseña la captura: si se la enseñara, la imitaría.
      expect(prompt1).toContain("screen is completely black and switched off");
      expect(subidas).toBe(1);
      const [fila1] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo1.id)).limit(1);
      expect(fila1?.digitalStep).toBe("pantalla_negra");
      // La declaración de marca queda registrada con su fecha, no solo comprobada.
      expect(fila1?.brandRightsAt).not.toBeNull();

      // El resultado del paso 1 es la imagen de partida del paso 2.
      const [conResultado] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo1.id));
      const pantallaNegra = conResultado?.resultMediaId ?? partida;

      // ── Paso 2: insertar la captura, con su propia confirmación y su propia clave ───────────────────
      subidas = 0;
      const paso2 = await pedirFotograma({
        medioId: pantallaNegra,
        pasoDigital: "insertar_captura",
        derechoMarca: true,
        producto: { productoId: producto.id, accion: "sostenerlo" },
      });
      expect(paso2.status).toBe(201);
      const trabajo2 = (await paso2.json()) as TrabajoVista;
      expect(trabajo2.id).not.toBe(trabajo1.id);
      await enviarEncolados(h);
      await avanzarEnviados(h);
      const prompt2 = ultimoPrompt();
      // Perspectiva, proporción y sin recortar: las tres cosas que pidió el propietario, dichas una por una.
      expect(prompt2).toContain("the same perspective and tilt as the device");
      expect(prompt2).toContain("aspect ratio kept unchanged");
      expect(prompt2).toContain("complete and uncropped");
      // Viajan dos imágenes: el fotograma de partida y la captura, en ese orden.
      expect(subidas).toBe(2);
      const [fila2] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo2.id)).limit(1);
      expect(fila2?.digitalStep).toBe("insertar_captura");
      expect((fila2?.input as { referenciasProducto?: string[] } | undefined)?.referenciasProducto).toEqual([
        capturaId,
      ]);

      // ── Paso 3: animar el resultado. El clip no es un paso del producto digital ─────────────────────
      subidas = 0;
      const clip = await rutaTrabajos.POST(
        pedir(ana, "/api/generacion/trabajos", "POST", {
          tipo: "animacion",
          trabajoPadreId: trabajo2.id,
          prompt: "La mano mueve el móvil despacio hacia la cámara.",
          segundos: segundosClip,
          creditosConfirmados: creditosClip,
          selloEstimacion: selloClip,
          derechos: true,
          derechoMarca: true,
          sinTerceros: true,
          claveIdempotencia: crypto.randomUUID(),
          producto: { productoId: producto.id, accion: "sostenerlo" },
          avisosConfirmados: AVISOS,
        }),
        undefined,
      );
      expect(clip.status).toBe(201);
      const trabajoClip = (await clip.json()) as TrabajoVista;
      const [filaClip] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajoClip.id)).limit(1);
      // El clip anima lo que ya está hecho: no vuelve a pedir ni la pantalla negra ni la inserción.
      expect(filaClip?.digitalStep).toBe("");
    });

    test("sin captura de pantalla el segundo paso se rechaza con su causa y no se cobra", async () => {
      const producto = await crearProducto(`Sin captura ${randomBytes(3).toString("hex")}`, "digital");
      await anadirFoto(producto.id, "envase");
      const partida = await subirFoto("pantalla-negra.png");

      const respuesta = await pedirFotograma({
        medioId: partida,
        pasoDigital: "insertar_captura",
        derechoMarca: true,
        producto: { productoId: producto.id, accion: "sostenerlo" },
      });
      expect(respuesta.status).toBe(409);
      expect(((await respuesta.json()) as { error: string }).error).toContain("Captura de pantalla");
      // Nada encolado y nada pedido al proveedor.
      expect(await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id))).toHaveLength(0);
      expect(enviados).toHaveLength(0);
    });

    test("un producto físico no tiene pantalla donde insertar nada y se dice", async () => {
      const producto = await crearProducto(`Bote ${randomBytes(3).toString("hex")}`, "fisico");
      const partida = await subirFoto("bote.png");
      const respuesta = await pedirFotograma({
        medioId: partida,
        pasoDigital: "insertar_captura",
        derechoMarca: true,
        producto: { productoId: producto.id, accion: "sostenerlo" },
      });
      expect(respuesta.status).toBe(400);
      expect(((await respuesta.json()) as { error: string }).error).toContain("producto físico");
    });
  });

  // ── 2. La casilla del derecho de marca ─────────────────────────────────────────────────────────────────

  describe("la casilla del derecho de uso de la marca", () => {
    test("bloquea el envío mientras no se marca, y solo se pide cuando hay producto", async () => {
      const producto = await crearProducto(`Marca ${randomBytes(3).toString("hex")}`, "fisico");
      await anadirFoto(producto.id, "etiqueta");
      const partida = await subirFoto("origen-marca.png");

      const sinMarcar = await pedirFotograma({
        medioId: partida,
        producto: { productoId: producto.id, accion: "sostenerlo" },
      });
      expect(sinMarcar.status).toBe(400);
      expect(((await sinMarcar.json()) as { error: string }).error).toContain("derecho a usar la marca");
      expect(await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id))).toHaveLength(0);

      // Sin producto no se pide: no hay ninguna marca en juego.
      const sinProducto = await pedirFotograma({ medioId: partida });
      expect(sinProducto.status).toBe(201);

      const marcada = await pedirFotograma({
        medioId: partida,
        derechoMarca: true,
        producto: { productoId: producto.id, accion: "sostenerlo" },
      });
      expect(marcada.status).toBe(201);
      const trabajo = (await marcada.json()) as TrabajoVista;
      const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo.id)).limit(1);
      expect(fila?.brandRightsAt).not.toBeNull();
    });
  });

  // ── 3. El plano del producto solo, sin personaje ───────────────────────────────────────────────────────

  describe("el plano del producto solo", () => {
    test("se pide sin personaje y sin imagen de partida, y en el prompt no hay nadie", async () => {
      const producto = await crearProducto(`B-roll ${randomBytes(3).toString("hex")}`, "fisico");
      await anadirFoto(producto.id, "etiqueta");

      const respuesta = await rutaTrabajos.POST(
        pedir(ana, "/api/generacion/trabajos", "POST", {
          tipo: "fotograma",
          prompt: "El bote sobre una encimera de mármol, con luz de ventana.",
          // Ni personaje ni imagen: el plano no lleva a nadie, así que no hay consentimiento que pedir.
          creditosConfirmados: creditosFotoSinImagen,
          selloEstimacion: selloFotoSinImagen,
          derechos: true,
          derechoMarca: true,
          claveIdempotencia: crypto.randomUUID(),
          producto: { productoId: producto.id, accion: "producto-solo" },
          avisosConfirmados: AVISOS,
        }),
        undefined,
      );
      expect(respuesta.status).toBe(201);
      await enviarEncolados(h);
      const prompt = ultimoPrompt();
      expect(prompt).toContain("no person and no hands in frame");
      /**
       * Sin imagen de partida se genera con un modelo de **texto a imagen**, que no recibe fotos: no viaja
       * ninguna, y al modelo se le pide un envase sin marca en lugar de prometerle una referencia que no va a
       * llegar. Eso se avisa antes de cobrar, y aquí se ha confirmado.
       */
      expect(subidas).toBe(0);
      expect(prompt).toContain("no invented logo");
    });
  });

  // ── 4. Acciones de moda y de piel ──────────────────────────────────────────────────────────────────────

  describe("las acciones especiales de moda y de piel", () => {
    /** Encola un clip con esa acción y devuelve el prompt que se le ha pedido al proveedor. */
    async function clipConAccion(productoId: string, accion: string, dialogo = "Mira qué caída tiene.") {
      const imagen = await subirFoto(`origen-${randomBytes(3).toString("hex")}.png`);
      const respuesta = await rutaTrabajos.POST(
        pedir(ana, "/api/generacion/trabajos", "POST", {
          tipo: "animacion",
          medioId: imagen,
          prompt: "En un estudio con fondo claro.",
          dialogo,
          segundos: segundosClip,
          creditosConfirmados: creditosClip,
          selloEstimacion: selloClip,
          derechos: true,
          derechoMarca: true,
          claveIdempotencia: crypto.randomUUID(),
          producto: { productoId, accion },
          direccion: { formatoClip: "ugc_a_camara", registroEstetico: "ugc_real", momentoMicroaccion: "durante" },
          avisosConfirmados: AVISOS,
        }),
        undefined,
      );
      expect(respuesta.status).toBe(201);
      await enviarEncolados(h);
      return { prompt: ultimoPrompt(), entrada: enviados.at(-1)?.entrada ?? {} };
    }

    test("una acción de moda llega al prompt y su clip no prohíbe el audio", async () => {
      const producto = await crearProducto(`Vestido ${randomBytes(3).toString("hex")}`, "fisico");
      await anadirFoto(producto.id, "etiqueta");
      const { prompt, entrada } = await clipConAccion(producto.id, "moda-pasarela");

      expect(prompt).toContain("steady runway walk");
      /**
       * Es un plano visual: nadie habla, así que el guion no viaja. Y **no se le prohíbe el audio**: se
       * describe lo que se ve y el ambiente, porque prohibírselo hace fallar a estos modelos.
       */
      expect(String(entrada.prompt ?? "")).not.toContain("Mira qué caída tiene");
      expect(prompt).toContain("natural room tone");
      for (const prohibicion of ["no audio", "no sound", "no music", "silence", "mute"]) {
        expect(prompt.toLowerCase()).not.toContain(prohibicion);
      }
    });

    test("una acción de piel avisa de que es poco fiable antes de cobrar, y luego llega al prompt", async () => {
      const producto = await crearProducto(`Crema ${randomBytes(3).toString("hex")}`, "fisico");
      await anadirFoto(producto.id, "etiqueta");
      await anadirFoto(producto.id, "mecanismo");
      const imagen = await subirFoto("origen-piel.png");

      const sinConfirmar = await rutaTrabajos.POST(
        pedir(ana, "/api/generacion/trabajos", "POST", {
          tipo: "animacion",
          medioId: imagen,
          prompt: "En un baño con luz de mañana.",
          segundos: segundosClip,
          creditosConfirmados: creditosClip,
          selloEstimacion: selloClip,
          derechos: true,
          derechoMarca: true,
          claveIdempotencia: crypto.randomUUID(),
          producto: { productoId: producto.id, accion: "skincare-extender" },
          // Se confirma todo menos el aviso de que la acción es poco fiable.
          avisosConfirmados: AVISOS.filter((a) => a !== "producto-accion-poco-fiable"),
        }),
        undefined,
      );
      expect(sinConfirmar.status).toBe(409);
      expect(((await sinConfirmar.json()) as { error: string }).error).toContain("peor salen");
      expect(enviados).toHaveLength(0);

      const { prompt } = await clipConAccion(producto.id, "skincare-extender", "");
      // El producto que se extiende y va desapareciendo hasta absorberse, que es lo que pidió el propietario.
      expect(prompt).toContain("until it is fully absorbed");
    });

    test("al abrir la tapa, el detalle del mecanismo viaja por delante del envase", async () => {
      const producto = await crearProducto(`Tapa ${randomBytes(3).toString("hex")}`, "fisico");
      const envase = await anadirFoto(producto.id, "envase");
      const mecanismo = await anadirFoto(producto.id, "mecanismo");

      const { prompt } = await clipConAccion(producto.id, "skincare-abrir-tapa", "");
      expect(prompt).toContain("matches the mechanism shown in the product reference image");

      /**
       * Y el orden de las fotos lo decide la acción: al abrir, el detalle del mecanismo pasa por delante del
       * envase. Con un solo hueco para el producto, el que viaja es el que se está mirando.
       */
      const { fotosDelProducto } = await import("./referencias");
      expect(await fotosDelProducto(producto.id, "skincare-abrir-tapa")).toEqual([mecanismo, envase]);
    });
  });
});
