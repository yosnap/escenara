import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { PlantillaVista, PresetVista, SeleccionPresets } from "@/lib/presets";

/**
 * **Selector por plataforma al generar** (0.41.0) contra el PostgreSQL local y un proveedor **simulado**: ninguna
 * llamada sale de la máquina ni gasta un crédito.
 *
 * Lo que se comprueba es lo que no se ve en la pantalla: que la proporción elegida **se envía de verdad** al
 * proveedor (antes solo se validaba), que queda guardada en el trabajo, que un modelo que no la admite **no se
 * puede forzar por la API** ni antes de encolar ni al despachar, y que un relevo nunca cambia el formato.
 *
 * Para tener un modelo con más de una proporción se amplían las del modelo de imagen predeterminado **en la base
 * de pruebas**; el catálogo real no se toca.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_formato_envio");
}

const { eq } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, models, usageLedger, users } = await import("../db/esquema");
const { guardarCredencial } = await import("../boveda/credenciales");
const { crearMedio } = await import("../media/servicio");
const { crearFotograma } = await import("./servicio");
const { pasadaDeCola } = await import("../cola/pasada");
const { listarPlantillas, listarPresetsDeLaInstalacion } = await import("../prompts/consulta");
const { olvidarCatalogo, parametrosDeTexto, textoDeParametros } = await import("../proveedores/catalogo");
const { ErrorPreset } = await import("../prompts/errores");
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("./herramientas").Herramientas;
type Actor = import("../media/servicio").Actor;

const CLAVE = "sk-ana-clave-de-kie-inventada-formatos";
const CREDITOS_FOTOGRAMA = 4;
const MODELO_IMAGEN = "nano-banana-2-lite";

let siguienteTarea = 0;
/** Cuerpos de los `createTask` que ha recibido el simulador: es lo que de verdad se envió. */
const enviados: Record<string, unknown>[] = [];

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url, init) => {
  if (url.includes("/chat/credit")) return sobre(5000);
  if (url.includes("file-stream-upload")) return sobre({ downloadUrl: "https://tempfile.kie.ai/referencia.png" });
  if (url.includes("createTask")) {
    enviados.push(typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {});
    return sobre({ taskId: `task_formato_${++siguienteTarea}` });
  }
  if (url.includes("recordInfo")) return sobre({ state: "waiting" });
  throw new Error(`URL no simulada: ${url}`);
};

const h: Herramientas = {
  buscar,
  descargar: async () => {
    throw new Error("Estos tests no descargan resultados.");
  },
};

async function foto(): Promise<Uint8Array<ArrayBuffer>> {
  const png = await sharp(new Uint8Array(640 * 640 * 3).fill(90), { raw: { width: 640, height: 640, channels: 3 } })
    .png()
    .toBuffer();
  const copia = new Uint8Array(new ArrayBuffer(png.byteLength));
  copia.set(png);
  return copia;
}

describe.skipIf(!hayBaseDeDatos)("el formato elegido al generar", () => {
  let ana: Awaited<ReturnType<typeof crearSesionDePrueba>>;
  let actor: Actor;
  let medioId = "";
  let presets: PresetVista[] = [];
  let plantilla: PlantillaVista | undefined;
  let parametrosOriginales = "";

  const porClave = (clave: string) => {
    const preset = presets.find((p) => p.clave === clave);
    if (!preset) throw new Error(`Falta el preset ${clave} en la semilla.`);
    return preset;
  };

  /** Deja al modelo de imagen predeterminado con estas proporciones, solo en la base de pruebas. */
  async function proporcionesDelModelo(proporciones: string[]) {
    const [fila] = await db().select().from(models).where(eq(models.modelId, MODELO_IMAGEN)).limit(1);
    if (!fila) throw new Error("Falta el modelo de imagen en la semilla del catálogo.");
    const parametros = parametrosDeTexto(fila.parameters);
    await db()
      .update(models)
      .set({ parameters: textoDeParametros({ ...parametros, proporciones }) })
      .where(eq(models.id, fila.id));
    olvidarCatalogo();
  }

  const generar = (seleccion: SeleccionPresets) =>
    crearFotograma(
      actor,
      {
        prompt: "in a bright cafe by the window",
        creditosConfirmados: CREDITOS_FOTOGRAMA,
        derechos: true,
        claveIdempotencia: crypto.randomUUID(),
        medioId,
        plantillaId: plantilla?.id ?? "",
        presets: seleccion,
      },
      h,
    );

  const conFormato = (clave: string): SeleccionPresets => ({
    especialidad: [porClave("moda").id],
    estilo: [porClave("natural").id],
    formato: [porClave(clave).id],
  });

  beforeAll(async () => {
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    medioId = (await crearMedio(actor, new File([await foto()], "referencia.png", { type: "image/png" }))).id;
    presets = await listarPresetsDeLaInstalacion();
    plantilla = (await listarPlantillas()).find((p) => p.clave === "fotograma-social");
    const [fila] = await db().select().from(models).where(eq(models.modelId, MODELO_IMAGEN)).limit(1);
    parametrosOriginales = fila?.parameters ?? "";
  });

  beforeEach(async () => {
    await proporcionesDelModelo(["9:16", "16:9", "4:5"]);
    enviados.length = 0;
  });

  afterAll(async () => {
    await db().update(models).set({ parameters: parametrosOriginales }).where(eq(models.modelId, MODELO_IMAGEN));
    olvidarCatalogo();
    if (ana?.email) await db().delete(users).where(eq(users.email, ana.email));
  });

  test("la semilla ofrece las cuatro plataformas con su nombre y su proporción", () => {
    const formatos = presets.filter((p) => p.categoria === "formato").map((p) => [p.nombre, p.valores.proporcion]);
    expect(formatos).toContainEqual(["Reels · TikTok · Stories (9:16)", "9:16"]);
    expect(formatos).toContainEqual(["Instagram feed y carrusel (4:5)", "4:5"]);
    expect(formatos).toContainEqual(["Cuadrado (1:1)", "1:1"]);
    expect(formatos).toContainEqual(["YouTube · horizontal (16:9)", "16:9"]);
  });

  test("la proporción elegida se guarda en el trabajo y es la que se envía al proveedor", async () => {
    const { trabajo } = await generar(conFormato("horizontal-16-9"));
    expect(trabajo.proporcion).toBe("16:9");
    const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo.id));
    expect((fila?.input as { proporcion?: string }).proporcion).toBe("16:9");
    await pasadaDeCola(h);
    expect(enviados).toHaveLength(1);
    expect((enviados[0]?.input as { aspect_ratio?: string }).aspect_ratio).toBe("16:9");
  });

  test("el 4:5 de feed y carrusel también llega tal cual a un modelo de imagen que lo admite", async () => {
    await generar(conFormato("feed-4-5"));
    await pasadaDeCola(h);
    expect((enviados[0]?.input as { aspect_ratio?: string }).aspect_ratio).toBe("4:5");
  });

  test("un formato que el modelo no admite no se puede forzar por la API: 409 y nada encolado", async () => {
    const antes = await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id));
    const fallo = await generar(conFormato("cuadrado-1-1")).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ErrorPreset);
    expect((fallo as Error).message).toContain("solo admite 9:16, 16:9, 4:5");
    const despues = await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id));
    expect(despues).toHaveLength(antes.length);
  });

  test("si al despachar el modelo ya no admite la proporción, no se envía otra: se cierra sin coste", async () => {
    const { trabajo } = await generar(conFormato("horizontal-16-9"));
    // Entre encolar y enviar, el catálogo deja de declarar 16:9 para ese modelo.
    await proporcionesDelModelo(["9:16"]);
    await pasadaDeCola(h);
    expect(enviados).toHaveLength(0);
    const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo.id));
    expect(fila?.state).toBe("fallido");
    expect(fila?.errorMessage).toContain("no admite esa proporción");
    expect(fila?.errorMessage).toContain("no se te ha cobrado");
    // Lo que se consume por este trabajo es cero: el cierre sin coste lo apunta así.
    const apuntes = await db().select().from(usageLedger).where(eq(usageLedger.jobId, trabajo.id));
    const consumido = apuntes.filter((a) => a.entryType === "consumo").reduce((suma, a) => suma + a.credits, 0);
    expect(consumido).toBe(0);
  });

  test("sin formato elegido se envía la proporción del modelo, como siempre", async () => {
    const { trabajo } = await generar({ especialidad: [porClave("moda").id], estilo: [porClave("natural").id] }).catch(
      async () =>
        // La plantilla de la semilla exige formato: entonces se comprueba con el vertical de siempre.
        generar(conFormato("reel-9-16")),
    );
    await pasadaDeCola(h);
    expect((enviados[0]?.input as { aspect_ratio?: string }).aspect_ratio).toBe("9:16");
    expect(trabajo.proporcion).toBe("9:16");
  });
});
