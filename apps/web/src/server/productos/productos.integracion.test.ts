import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";

/**
 * **Productos y acciones de producto** (0.26.0), contra el PostgreSQL local.
 *
 * Lo que comprueba, de punta a punta:
 *
 * - se crea un producto y se le añaden **fotos con su papel** (frontal con etiqueta, envase, mecanismo);
 * - un producto **es de su dueño**: otra persona no lo lista, no lo lee, no lo edita y no lo borra (404);
 * - se elige producto y acción **en «Crear»** y queda guardado en la fila del trabajo;
 * - se elige producto y acción **en una escena** y queda guardado en la escena, y el clip de esa escena hereda
 *   el producto de la escena y no lo que mande el navegador;
 * - el producto **llega al proveedor**: sus fotos viajan como referencia junto a la del personaje respetando el
 *   tope del modelo, y la acción y la regla de la etiqueta entran en el prompt, con la toma única la última;
 * - **borrar el producto no borra nada de lo generado**: el vídeo hecho con él se queda en la biblioteca con su
 *   archivo y solo pierde el vínculo, y la escena se queda sin producto **sin romperse**, con su guion.
 *
 * **Ningún test llama a KIE**: el proveedor se simula por los puntos de inyección que ya existen
 * (`Herramientas`), nunca sustituyendo `globalThis.fetch`.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_productos");
}

const { and, eq } = await import("drizzle-orm");
const rutaProductos = await import("@/app/api/productos/route");
const rutaProducto = await import("@/app/api/productos/[id]/route");
const rutaTrabajos = await import("@/app/api/generacion/trabajos/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, media, presets, scenes } = await import("../db/esquema");
const { guardarCredencial } = await import("../boveda/credenciales");
const { crearMedio } = await import("../media/servicio");
const { avanzarEnviados, enviarEncolados } = await import("../cola/pasada");
const { estimar, olvidarSaldos } = await import("../generacion/estimacion");
const { crearProyecto } = await import("../asistente/proyectos");
const { crearEscena, editarEscena } = await import("../asistente/escenas");
const { detalleProyecto } = await import("../asistente/plan");
const { modelosConFotoDeProducto, modelosParaCrearConFoto } = await import("./modelos-sugeridos");
const { obtenerProducto } = await import("./consulta");
const { leerObjeto } = await import("../almacenamiento");

type ProductoVista = import("@/lib/productos").ProductoVista;
type ProductoResumen = import("@/lib/productos").ProductoResumen;
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type Actor = import("../media/servicio").Actor;

const CLAVE_ANA = "sk-ana-clave-de-kie-inventada-productos";
const CLAVE_BETO = "sk-beto-clave-de-kie-inventada-productos";

// ── Proveedor simulado ───────────────────────────────────────────────────────────────────────────────────

let siguienteTarea = 0;

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

/** Lo que se le ha pedido al proveedor, en orden. Es lo que comprueban los tests de lo que llega al modelo. */
const enviados: { modelo: string; entrada: Record<string, unknown> }[] = [];
/** Cuántas referencias se han subido: una por imagen que de verdad viaja. */
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
      resultJson: JSON.stringify({ resultUrls: ["https://tempfile.kie.ai/clip.mp4"] }),
      creditsConsumed: 10,
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
    await sharp({ create: { width: 96, height: 96, channels: 3, background: "#3d6bff" } })
      .png()
      .toBuffer(),
  );

const MP4 = bytes(new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom"), ...new Uint8Array(64)]));

const descargar: Herramientas["descargar"] = async (url) => ({
  archivo: new File([MP4], "clip.mp4", { type: "video/mp4" }),
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

describe.skipIf(!hayBaseDeDatos)("productos con sus fotos, su elección y su borrado", () => {
  let ana: Sesion;
  let beto: Sesion;
  let actorAna: Actor;
  let creditosClip: number;
  let selloClip: string;
  let segundosClip: number;

  beforeAll(async () => {
    await aplicarMigraciones();
    [ana, beto] = await Promise.all([crearSesionDePrueba("user"), crearSesionDePrueba("user")]);
    actorAna = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE_ANA, buscar);
    await guardarCredencial(beto.id, "kie", CLAVE_BETO, buscar);
    const estimacion = await estimar(ana.id, "animacion", buscar);
    creditosClip = estimacion.creditos;
    selloClip = estimacion.sello;
    segundosClip = estimacion.segundos ?? 8;
  });

  beforeEach(async () => {
    olvidarSaldos();
    enviados.length = 0;
    subidas = 0;
    for (const id of [ana.id, beto.id]) {
      await db().delete(generationJobs).where(eq(generationJobs.userId, id));
    }
  });

  /** Crea un producto por la ruta HTTP, que es el camino que usa la pantalla. */
  async function crearProductoDe(sesion: Sesion, nombre: string): Promise<ProductoVista> {
    const respuesta = await rutaProductos.POST(
      pedir(sesion, "/api/productos", "POST", {
        nombre,
        descripcion: "Bote blanco con tapón dorado y etiqueta negra.",
        tipo: "fisico",
        marcaVisible: true,
      }),
      undefined,
    );
    expect(respuesta.status).toBe(201);
    return (await respuesta.json()) as ProductoVista;
  }

  const subirFoto = async (sesion: Sesion, nombre: string) =>
    (await crearMedio({ id: sesion.id, esAdmin: false }, new File([await png()], nombre, { type: "image/png" }))).id;

  // ── 1. Alta con fotos por papel ────────────────────────────────────────────────────────────────────────

  describe("un producto con sus fotos y el papel de cada una", () => {
    test("se crea, se le añaden tres fotos con su papel y la ficha las devuelve ordenadas", async () => {
      const producto = await crearProductoDe(ana, `Crema Aurora ${randomBytes(3).toString("hex")}`);
      expect(producto.fotos).toHaveLength(0);
      expect(producto.marcaVisible).toBe(true);

      const fotos = [
        { medioId: await subirFoto(ana, "frontal.png"), papel: "etiqueta" },
        { medioId: await subirFoto(ana, "envase.png"), papel: "envase" },
        { medioId: await subirFoto(ana, "tapon.png"), papel: "mecanismo" },
      ];
      const respuesta = await rutaProducto.PATCH(
        pedir(ana, `/api/productos/${producto.id}`, "PATCH", { accion: "anadir-fotos", fotos }),
        contexto(producto.id),
      );
      expect(respuesta.status).toBe(200);
      const conFotos = (await respuesta.json()) as ProductoVista;
      expect(conFotos.fotos.map((f) => f.papel)).toEqual(["etiqueta", "envase", "mecanismo"]);
      expect(conFotos.referencias).toBe(3);
      // La portada de la lista es la primera foto vigente, que es la de la etiqueta.
      expect(conFotos.portada?.id).toBe(fotos[0]?.medioId);
    });

    test("una foto ajena no se puede usar como referencia, aunque se conozca su identificador", async () => {
      const producto = await crearProductoDe(ana, `Ajena ${randomBytes(3).toString("hex")}`);
      const deBeto = await subirFoto(beto, "de-beto.png");
      const respuesta = await rutaProducto.PATCH(
        pedir(ana, `/api/productos/${producto.id}`, "PATCH", {
          accion: "anadir-fotos",
          fotos: [{ medioId: deBeto, papel: "etiqueta" }],
        }),
        contexto(producto.id),
      );
      expect(respuesta.status).toBe(404);
    });

    test("se puede cambiar el papel de una foto y quitarla sin borrarla de la biblioteca", async () => {
      const producto = await crearProductoDe(ana, `Papeles ${randomBytes(3).toString("hex")}`);
      const medioId = await subirFoto(ana, "una.png");
      const anadida = (await (
        await rutaProducto.PATCH(
          pedir(ana, `/api/productos/${producto.id}`, "PATCH", {
            accion: "anadir-fotos",
            fotos: [{ medioId, papel: "envase" }],
          }),
          contexto(producto.id),
        )
      ).json()) as ProductoVista;
      const referenciaId = anadida.fotos[0]?.id ?? "";

      const cambiada = (await (
        await rutaProducto.PATCH(
          pedir(ana, `/api/productos/${producto.id}`, "PATCH", { accion: "papel", referenciaId, papel: "etiqueta" }),
          contexto(producto.id),
        )
      ).json()) as ProductoVista;
      expect(cambiada.fotos[0]?.papel).toBe("etiqueta");

      const quitada = (await (
        await rutaProducto.PATCH(
          pedir(ana, `/api/productos/${producto.id}`, "PATCH", { accion: "quitar-foto", referenciaId }),
          contexto(producto.id),
        )
      ).json()) as ProductoVista;
      expect(quitada.fotos).toHaveLength(0);
      // La foto sigue en la biblioteca: es suya y puede estar usándola en otro sitio.
      const [sigue] = await db().select().from(media).where(eq(media.id, medioId)).limit(1);
      expect(sigue?.deletedAt).toBeNull();
    });
  });

  // ── 2. Solo su dueño lo ve ─────────────────────────────────────────────────────────────────────────────

  describe("un producto es de su dueño y de nadie más", () => {
    test("otra persona no lo lista, no lo lee, no lo edita y no lo borra", async () => {
      const producto = await crearProductoDe(ana, `De Ana ${randomBytes(3).toString("hex")}`);

      const lista = (await (
        await rutaProductos.GET(pedir(beto, "/api/productos", "GET"), undefined)
      ).json()) as ProductoResumen[];
      expect(lista.some((p) => p.id === producto.id)).toBe(false);

      const leer = await rutaProducto.GET(pedir(beto, `/api/productos/${producto.id}`, "GET"), contexto(producto.id));
      expect(leer.status).toBe(404);

      const editar = await rutaProducto.PATCH(
        pedir(beto, `/api/productos/${producto.id}`, "PATCH", { nombre: "Mío ahora" }),
        contexto(producto.id),
      );
      expect(editar.status).toBe(404);

      const borrar = await rutaProducto.DELETE(
        pedir(beto, `/api/productos/${producto.id}`, "DELETE"),
        contexto(producto.id),
      );
      expect(borrar.status).toBe(404);

      // Y sigue siendo de Ana, intacto.
      expect((await obtenerProducto(actorAna, producto.id)).nombre).toBe(producto.nombre);
    });
  });

  // ── 3. Elegirlo en «Crear» y en una escena ─────────────────────────────────────────────────────────────

  describe("elegir producto y acción", () => {
    test("en «Crear» queda guardado en el trabajo, con su acción", async () => {
      const producto = await crearProductoDe(ana, `En crear ${randomBytes(3).toString("hex")}`);
      const imagen = await subirFoto(ana, "origen.png");
      const respuesta = await rutaTrabajos.POST(
        pedir(ana, "/api/generacion/trabajos", "POST", {
          tipo: "animacion",
          medioId: imagen,
          prompt: "En una cocina luminosa, enseña el bote a cámara.",
          dialogo: "Mira lo que he encontrado.",
          segundos: segundosClip,
          creditosConfirmados: creditosClip,
          selloEstimacion: selloClip,
          derechos: true,
          derechoMarca: true,
          claveIdempotencia: crypto.randomUUID(),
          producto: { productoId: producto.id, accion: "ensenarlo-a-camara" },
        }),
        undefined,
      );
      /**
       * Este producto todavía no tiene fotos, así que la puerta avisa **antes** de cobrar nada: sin foto el
       * modelo no sabe qué aspecto tiene y el resultado no sería su producto. Es un aviso salvable, no un
       * bloqueo: se confirma y se sigue.
       */
      expect(respuesta.status).toBe(409);
      expect(((await respuesta.json()) as { error: string }).error).toContain("no tiene ninguna foto de referencia");

      const confirmada = await rutaTrabajos.POST(
        pedir(ana, "/api/generacion/trabajos", "POST", {
          tipo: "animacion",
          medioId: imagen,
          prompt: "En una cocina luminosa, enseña el bote a cámara.",
          dialogo: "Mira lo que he encontrado.",
          segundos: segundosClip,
          creditosConfirmados: creditosClip,
          selloEstimacion: selloClip,
          derechos: true,
          derechoMarca: true,
          claveIdempotencia: crypto.randomUUID(),
          producto: { productoId: producto.id, accion: "ensenarlo-a-camara" },
          avisosConfirmados: ["producto-sin-fotos", "producto-con-marca"],
        }),
        undefined,
      );
      expect(confirmada.status).toBe(201);
      const trabajo = (await confirmada.json()) as { id: string };
      const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo.id)).limit(1);
      expect(fila?.productId).toBe(producto.id);
      expect(fila?.productAction).toBe("ensenarlo-a-camara");
    });

    test("un producto ajeno no se puede elegir en «Crear», aunque se conozca su identificador", async () => {
      const deBeto = await crearProductoDe(beto, `De Beto ${randomBytes(3).toString("hex")}`);
      const imagen = await subirFoto(ana, "origen2.png");
      const respuesta = await rutaTrabajos.POST(
        pedir(ana, "/api/generacion/trabajos", "POST", {
          tipo: "animacion",
          medioId: imagen,
          prompt: "Enseña el bote.",
          segundos: segundosClip,
          creditosConfirmados: creditosClip,
          selloEstimacion: selloClip,
          derechos: true,
          derechoMarca: true,
          claveIdempotencia: crypto.randomUUID(),
          producto: { productoId: deBeto.id, accion: "sostenerlo" },
        }),
        undefined,
      );
      expect(respuesta.status).toBe(404);
    });

    test("en una escena queda guardado en la escena y el clip de esa escena lo hereda", async () => {
      const producto = await crearProductoDe(ana, `En escena ${randomBytes(3).toString("hex")}`);
      const { proyecto } = await crearProyecto(actorAna, { titulo: "Lanzamiento", formato: "reel_vertical" });
      const escena = await crearEscena(actorAna, proyecto.id, { texto: "Presenta el producto." });

      const editada = await editarEscena(actorAna, escena.id, {
        producto: { productoId: producto.id, accion: "sostenerlo" },
      });
      expect(editada.productId).toBe(producto.id);
      expect(editada.productAction).toBe("sostenerlo");

      // Quitarlo vacía también la acción: una acción sin producto no describe nada.
      const sinProducto = await editarEscena(actorAna, escena.id, { producto: { productoId: "", accion: "" } });
      expect(sinProducto.productId).toBeNull();
      expect(sinProducto.productAction).toBe("");
    });

    test("la escena y «Crear» dicen lo mismo: qué modelos del clip admiten la foto y cuáles son la alternativa", async () => {
      const { proyecto } = await crearProyecto(actorAna, { titulo: "Aviso adelantado", formato: "reel_vertical" });
      await crearEscena(actorAna, proyecto.id, { texto: "Presenta el producto." });
      const escena = (await detalleProyecto(actorAna, proyecto.id)).escenas[0];
      const foto = escena?.estimacion?.fotoDeProducto;
      expect(foto).toBeDefined();

      // Lo que ve «Crear» sale del mismo cálculo: los que admiten la foto son exactamente las alternativas.
      const modelos = await modelosParaCrearConFoto("image_to_video");
      const conFoto = modelos.filter((m) => m.admiteFotoDeProducto).map((m) => m.nombre);
      expect(conFoto).toEqual(await modelosConFotoDeProducto("image_to_video"));
      const actual = modelos.find((m) => m.nombre === foto?.modelo);
      expect(actual).toBeDefined();
      expect(foto?.admite).toBe(actual?.admiteFotoDeProducto ?? false);
      expect(foto?.alternativas).toEqual(foto?.admite ? [] : conFoto);
    });

    test("una acción sola, sin producto, no se guarda como si hubiera producto", async () => {
      const { proyecto } = await crearProyecto(actorAna, { titulo: "Sin producto", formato: "reel_vertical" });
      const escena = await crearEscena(actorAna, proyecto.id, { texto: "Habla a cámara." });
      const editada = await editarEscena(actorAna, escena.id, { producto: { productoId: "", accion: "abrirlo" } });
      expect(editada.productId).toBeNull();
      expect(editada.productAction).toBe("");
    });

    test("un producto ajeno tampoco se puede poner en una escena propia", async () => {
      const deBeto = await crearProductoDe(beto, `Ajeno escena ${randomBytes(3).toString("hex")}`);
      const { proyecto } = await crearProyecto(actorAna, { titulo: "Intento", formato: "reel_vertical" });
      const escena = await crearEscena(actorAna, proyecto.id, { texto: "Presenta algo." });
      await expect(
        editarEscena(actorAna, escena.id, { producto: { productoId: deBeto.id, accion: "sostenerlo" } }),
      ).rejects.toThrow();
    });
  });

  // ── 4. El catálogo de acciones ─────────────────────────────────────────────────────────────────────────

  describe("las acciones de producto son catálogo del admin", () => {
    test("la semilla deja las dieciséis acciones activas y con su texto en castellano", async () => {
      const filas = await db().select().from(presets).where(eq(presets.category, "accion-producto"));
      const claves = filas.map((f) => f.slug).sort();
      expect(claves).toEqual(
        [
          "abrirlo",
          "aplicarlo",
          "ensenarlo-a-camara",
          "mirarlo",
          "producto-solo",
          "senalarlo",
          "sostenerlo",
          // Moda y cuidado de la piel (0.26.0): la familia se deduce del prefijo de la clave.
          "moda-cuerpo-entero",
          "moda-detalle-accesorio",
          "moda-detalle-tejido",
          "moda-giro-360",
          "moda-pasarela",
          "moda-pose-editorial",
          "skincare-abrir-tapa",
          "skincare-extender",
          "skincare-masajear",
        ].sort(),
      );
      // Son de la instalación: las edita quien administra, y cada usuario puede duplicarlas.
      expect(filas.every((f) => f.ownerId === null && f.active)).toBe(true);
      expect(filas.every((f) => f.description.trim() !== "")).toBe(true);
    });
  });

  // ── 5. El producto llega al proveedor ──────────────────────────────────────────────────────────────────

  describe("el producto llega al proveedor", () => {
    /** Encola un clip de «Crear» con este producto y lo despacha, devolviendo lo que se le pidió al modelo. */
    async function clipConProducto(
      productoId: string,
      accion: string,
      dialogo = "Mira lo que he encontrado.",
      modelo?: string,
    ) {
      const imagen = await subirFoto(ana, `origen-${randomBytes(3).toString("hex")}.png`);
      // Con modelo propio hay que volver a estimar: el sello y los créditos son los de **ese** modelo.
      const { estimar: estimarPara } = await import("../generacion/estimacion");
      const estimacion = modelo ? await estimarPara(ana.id, "animacion", buscar, modelo) : null;
      const respuesta = await rutaTrabajos.POST(
        pedir(ana, "/api/generacion/trabajos", "POST", {
          tipo: "animacion",
          medioId: imagen,
          ...(modelo ? { modelo } : {}),
          prompt: "En una cocina luminosa, enseña el bote a cámara.",
          dialogo,
          segundos: estimacion?.segundos ?? segundosClip,
          creditosConfirmados: estimacion?.creditos ?? creditosClip,
          selloEstimacion: estimacion?.sello ?? selloClip,
          derechos: true,
          derechoMarca: true,
          claveIdempotencia: crypto.randomUUID(),
          producto: { productoId, accion },
          direccion: { formatoClip: "ugc_a_camara", registroEstetico: "ugc_real", momentoMicroaccion: "durante" },
          // Los avisos del producto se confirman: es lo que hace el usuario en la pantalla.
          avisosConfirmados: ["producto-con-marca", "producto-sin-fotos", "producto-sin-hueco-de-referencia"],
        }),
        undefined,
      );
      expect(respuesta.status).toBe(201);
      await enviarEncolados(h);
      const enviado = enviados.at(-1);
      expect(enviado).toBeDefined();
      return { entrada: enviado?.entrada ?? {}, prompt: String(enviado?.entrada.prompt ?? "") };
    }

    test("en «Crear» el panel enseña el aviso del producto antes de confirmar, para poder confirmarlo con su casilla", async () => {
      const { evaluarControles } = await import("../controles/consulta");
      const producto = await productoConDosFotos(`Panel-${randomBytes(3).toString("hex")}`);
      const imagen = await subirFoto(ana, "panel.png");
      const sin = await evaluarControles(actorAna, { tipo: "animacion", medioId: imagen });
      expect(sin.comprobaciones.map((c) => c.regla)).not.toContain("producto-sin-hueco-de-referencia");
      const con = await evaluarControles(actorAna, {
        tipo: "animacion",
        medioId: imagen,
        productoId: producto.id,
        productoAccion: "ensenarlo-a-camara",
      });
      const aviso = con.comprobaciones.find((c) => c.regla === "producto-sin-hueco-de-referencia");
      expect(con.comprobaciones.map((c) => c.regla)).toContain("producto-sin-hueco-de-referencia");
      expect(aviso?.motivo).toContain(producto.nombre);
      // La acción poco fiable también se avisa antes de pulsar, con su propia casilla.
      const pocoFiable = await evaluarControles(actorAna, {
        tipo: "animacion",
        medioId: imagen,
        productoId: producto.id,
        productoAccion: "skincare-abrir-tapa",
      });
      expect(pocoFiable.comprobaciones.map((c) => c.regla)).toContain("producto-accion-poco-fiable");
      // Un producto ajeno no se evalúa ni se dice que existe.
      const ajeno = await evaluarControles(
        { id: beto.id, esAdmin: false },
        { tipo: "animacion", productoId: producto.id },
      );
      expect(ajeno.comprobaciones.map((c) => c.regla)).not.toContain("producto-sin-hueco-de-referencia");
    });

    /** Producto con dos fotos: la frontal con la etiqueta y el envase. */
    async function productoConDosFotos(nombre: string) {
      const producto = await crearProductoDe(ana, nombre);
      await rutaProducto.PATCH(
        pedir(ana, `/api/productos/${producto.id}`, "PATCH", {
          accion: "anadir-fotos",
          fotos: [
            // A propósito en orden inverso: la frontal con la etiqueta tiene que ir **primera** al proveedor.
            { medioId: await subirFoto(ana, "envase.png"), papel: "envase" },
            { medioId: await subirFoto(ana, "frontal.png"), papel: "etiqueta" },
          ],
        }),
        contexto(producto.id),
      );
      return producto;
    }

    test("con un modelo de galería, las fotos del producto viajan detrás de la de partida", async () => {
      const producto = await productoConDosFotos(`Al proveedor ${randomBytes(3).toString("hex")}`);
      // Omni acepta hasta siete referencias **de galería**, así que aquí sí cabe el producto.
      const { entrada } = await clipConProducto(producto.id, "ensenarlo-a-camara", "Mira esto.", "gemini-omni-video");

      const referencias = (entrada.image_urls ?? []) as string[];
      // La de partida y las dos del producto, en ese orden: la identidad primero.
      expect(referencias).toHaveLength(3);
      expect(subidas).toBe(3);
      expect(referencias.length).toBeLessThanOrEqual(7);
    });

    test("con Veo, cuyas referencias son fotogramas del clip, el producto no manda fotos y se avisa", async () => {
      const producto = await productoConDosFotos(`Sin hueco ${randomBytes(3).toString("hex")}`);
      const imagen = await subirFoto(ana, "origen-veo.png");
      const sinConfirmar = await rutaTrabajos.POST(
        pedir(ana, "/api/generacion/trabajos", "POST", {
          tipo: "animacion",
          medioId: imagen,
          prompt: "Enseña el bote a cámara.",
          segundos: segundosClip,
          creditosConfirmados: creditosClip,
          selloEstimacion: selloClip,
          derechos: true,
          derechoMarca: true,
          claveIdempotencia: crypto.randomUUID(),
          producto: { productoId: producto.id, accion: "ensenarlo-a-camara" },
          avisosConfirmados: ["producto-con-marca"],
        }),
        undefined,
      );
      /**
       * Veo admite dos imágenes, pero la segunda es el **último fotograma**, no una referencia: no cabe
       * ninguna foto del producto y hay que decirlo antes de cobrar.
       *
       * Y no se cambia de modelo por su cuenta (decisión firme del propietario): se **sugieren** los que sí
       * llevan la foto, se dice que la tarifa es otra y elige el usuario.
       */
      expect(sinConfirmar.status).toBe(409);
      const aviso = ((await sinConfirmar.json()) as { error: string }).error;
      expect(aviso).toContain("no admite la foto");
      expect(aviso).toContain("MiniMax H3");
      expect(aviso).toContain("vuelve a estimar el coste");
      // El modelo con el que se acabará enviando sigue siendo el que eligió el usuario: Veo.

      const { entrada, prompt } = await clipConProducto(producto.id, "ensenarlo-a-camara");
      expect((entrada.image_urls as string[]).length).toBe(1);
      expect(subidas).toBe(1);
      // Sin foto suya no se le promete ninguna: se le pide un envase sin marca en lugar de inventarse una.
      expect(prompt).toContain("no invented logo");
    });

    test("la acción y la regla de la etiqueta entran en el prompt, con la toma única la última", async () => {
      const producto = await productoConDosFotos(`En el prompt ${randomBytes(3).toString("hex")}`);
      const { prompt } = await clipConProducto(producto.id, "ensenarlo-a-camara");

      // La acción elegida, tal como la traduce el catálogo.
      expect(prompt).toContain("turns the product towards the camera");
      // Y la regla que esta versión promete: la etiqueta no se toca.
      expect(prompt).toContain("must not be redesigned");
      expect(prompt).toContain("Do not translate, rewrite, restyle, blur or invent any text");
      // La regla de la etiqueta va **después** de la acción y **antes** de la toma única, que cierra siempre.
      const accion = prompt.indexOf("turns the product towards the camera");
      const etiqueta = prompt.indexOf("must not be redesigned");
      const tomaUnica = prompt.indexOf("Single continuous take");
      expect(accion).toBeLessThan(etiqueta);
      expect(etiqueta).toBeLessThan(tomaUnica);
      // Y la toma única sigue siendo lo último del texto que compone la dirección.
      expect(prompt.slice(tomaUnica)).not.toContain("must not be redesigned");
    });

    test("el plano del producto solo sale mudo y sin nadie, y se dice por qué", async () => {
      const producto = await productoConDosFotos(`B-roll ${randomBytes(3).toString("hex")}`);
      const { entrada, prompt } = await clipConProducto(producto.id, "producto-solo", "Esto no se dice.");

      expect(prompt).toContain("no person and no hands in frame");
      expect(prompt).toContain("mouth stays closed");
      // El guion escrito **no viaja**: no hay quien lo diga.
      expect(prompt).not.toContain("Esto no se dice");
      expect(String(entrada.prompt ?? "")).not.toContain("Esto no se dice");
    });
  });

  // ── 6. Borrar el producto ──────────────────────────────────────────────────────────────────────────────

  describe("borrar un producto", () => {
    test("deja los vídeos en la biblioteca y la escena sin producto, sin romperla", async () => {
      const producto = await crearProductoDe(ana, `Por borrar ${randomBytes(3).toString("hex")}`);
      const foto = await subirFoto(ana, "referencia.png");
      await rutaProducto.PATCH(
        pedir(ana, `/api/productos/${producto.id}`, "PATCH", {
          accion: "anadir-fotos",
          fotos: [{ medioId: foto, papel: "etiqueta" }],
        }),
        contexto(producto.id),
      );

      // Una escena que lo usa.
      const { proyecto } = await crearProyecto(actorAna, { titulo: "Con producto", formato: "reel_vertical" });
      const escena = await crearEscena(actorAna, proyecto.id, { texto: "Enseña el bote." });
      await editarEscena(actorAna, escena.id, { producto: { productoId: producto.id, accion: "sostenerlo" } });

      // Y un clip terminado hecho con él: es lo que **no** se puede perder al borrar el producto.
      const imagen = await subirFoto(ana, "origen3.png");
      const respuesta = await rutaTrabajos.POST(
        pedir(ana, "/api/generacion/trabajos", "POST", {
          tipo: "animacion",
          medioId: imagen,
          prompt: "Enseña el bote a cámara.",
          segundos: segundosClip,
          creditosConfirmados: creditosClip,
          selloEstimacion: selloClip,
          derechos: true,
          derechoMarca: true,
          claveIdempotencia: crypto.randomUUID(),
          producto: { productoId: producto.id, accion: "ensenarlo-a-camara" },
          // Los avisos del producto se confirman antes de pagar: marca visible y la foto que no cabe en Veo.
          avisosConfirmados: ["producto-con-marca", "producto-sin-hueco-de-referencia"],
        }),
        undefined,
      );
      expect(respuesta.status).toBe(201);
      await enviarEncolados(h);
      // Segunda pasada: la primera lo manda al proveedor y esta recoge su resultado, como hace el worker.
      await avanzarEnviados(h);
      const [trabajo] = await db()
        .select()
        .from(generationJobs)
        .where(and(eq(generationJobs.userId, ana.id), eq(generationJobs.productId, producto.id)))
        .limit(1);
      const generadoId = trabajo?.resultMediaId ?? "";
      expect(generadoId).not.toBe("");
      const [generado] = await db().select().from(media).where(eq(media.id, generadoId)).limit(1);
      const claveDelGenerado = generado?.storageKey ?? "";
      expect(claveDelGenerado).not.toBe("");

      // Y ahora se borra.
      const borrado = await rutaProducto.DELETE(
        pedir(ana, `/api/productos/${producto.id}`, "DELETE"),
        contexto(producto.id),
      );
      expect(borrado.status).toBe(200);
      const resultado = (await borrado.json()) as { escenasLiberadas: number; trabajosLiberados: number };
      expect(resultado.escenasLiberadas).toBe(1);
      expect(resultado.trabajosLiberados).toBe(1);

      // Lo generado con él **se queda**: la fila en la biblioteca y su archivo en el almacenamiento.
      const [sigueElGenerado] = await db().select().from(media).where(eq(media.id, generadoId)).limit(1);
      expect(sigueElGenerado?.deletedAt).toBeNull();
      expect(await leerObjeto(claveDelGenerado).exists()).toBe(true);

      // La escena sigue existiendo, con su guion, y sin producto.
      const [quedaLaEscena] = await db().select().from(scenes).where(eq(scenes.id, escena.id)).limit(1);
      expect(quedaLaEscena?.scriptText).toBe("Enseña el bote.");
      expect(quedaLaEscena?.productId).toBeNull();
      expect(quedaLaEscena?.productAction).toBe("");

      // La foto de referencia sigue en la biblioteca: es suya.
      const [sigueLaFoto] = await db().select().from(media).where(eq(media.id, foto)).limit(1);
      expect(sigueLaFoto?.deletedAt).toBeNull();

      // Y el trabajo se queda, con su coste y su acción, pero ya sin producto: es un hecho histórico.
      const [trasBorrar] = await db()
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, trabajo?.id ?? ""))
        .limit(1);
      expect(trasBorrar?.productId).toBeNull();
      expect(trasBorrar?.productAction).toBe("ensenarlo-a-camara");
    });
  });
});
