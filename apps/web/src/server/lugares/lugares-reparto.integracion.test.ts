import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * **El aviso de antes de pagar y el envío cuentan igual**, con lugar, en todos los tipos de envío y con cupos de
 * referencias distintos. La consulta (`/api/generacion/controles`) devuelve las cifras del reparto, y el trabajo que
 * sale del envío guarda las fotos que de verdad viajan: las dos cosas tienen que coincidir siempre, también en la
 * inserción de la captura del producto digital, donde la maestra no viaja.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_lugares_reparto");
}

const { eq } = await import("drizzle-orm");
const rutaTrabajos = await import("@/app/api/generacion/trabajos/route");
const rutaControles = await import("@/app/api/generacion/controles/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, models, rateLimits, usageLedger, users } = await import("../db/esquema");
const { products, productReferences } = await import("../db/esquema-productos");
const { estimar, olvidarSaldos } = await import("../generacion/estimacion");
const { olvidarCatalogo } = await import("../proveedores/catalogo");
const { lugarDeclaradoDePrueba, subirFotoDePrueba } = await import("./lugar-de-prueba");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type Buscador = import("../proveedores/codigos").Buscador;
type Cifras = { personaje: number; producto: number; lugar: number };

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const buscar: Buscador = async (url) => {
  if (url.includes("/chat/credit")) return sobre(1_000_000);
  throw new Error(`URL no simulada: ${url}`);
};
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

describe.skipIf(!hayBaseDeDatos)("con lugar, el aviso y el envío cuentan igual en todos los envíos", () => {
  let ana: Sesion;
  let actor: Actor;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;
  let personajeId: string;
  let lugarId: string;
  let fisico: string;
  let digital: string;
  let imagen: string;
  const parametrosOriginales = new Map<string, string>();

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_lugares_reparto");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", "sk-ana-clave-de-kie-inventada-reparto", buscar);
    await guardarAjustes({ presupuestoCreditos: 0, presupuestoTrabajo: 0, trabajosSimultaneos: 50 }, null);
    personajeId = await personajeConSeisFotos();
    lugarId = (await lugarDeclaradoDePrueba(actor, "Bar")).lugar.id;
    fisico = await producto("fisico", ["etiqueta", "envase", "suelto"]);
    digital = await producto("digital", ["captura_pantalla", "captura_pantalla", "captura_pantalla"]);
    imagen = await subirFotoDePrueba(actor, "imagen-suelta.png");
  });

  afterAll(async () => {
    for (const [id, parametros] of parametrosOriginales) {
      await db().update(models).set({ parameters: parametros }).where(eq(models.id, id));
    }
    olvidarCatalogo();
    if (ana?.email) await db().delete(users).where(eq(users.email, ana.email));
    await guardarAjustes(
      {
        presupuestoCreditos: ajustesPrevios.presupuestoCreditos,
        presupuestoTrabajo: ajustesPrevios.presupuestoTrabajo,
        trabajosSimultaneos: ajustesPrevios.trabajosSimultaneos,
      },
      null,
    );
  });

  beforeEach(async () => {
    olvidarSaldos();
    exigirBaseDeDatosDePrueba("escenara_pruebas_lugares_reparto");
    await db().delete(rateLimits);
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(usageLedger).where(eq(usageLedger.userId, ana.id));
  });

  async function personajeConSeisFotos(): Promise<string> {
    const creado = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", { nombre: `Elisa ${crypto.randomUUID().slice(0, 6)}`, tipo: "persona" }),
      undefined,
    );
    const { id } = (await creado.json()) as { id: string };
    const referencias = await Promise.all(
      Array.from({ length: 6 }, async (_, i) => ({ medioId: await subirFotoDePrueba(actor, `elisa-${i}.png`) })),
    );
    await rutaReferencias.POST(pedir(ana, `/api/personajes/${id}/referencias`, "POST", { referencias }), ctx(id));
    await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${id}/consentimiento`, "POST", {
        titular: "yo",
        mayoriaDeEdad: true,
        alcance: "personal",
      }),
      ctx(id),
    );
    return id;
  }

  async function producto(tipo: "fisico" | "digital", papeles: string[]): Promise<string> {
    const [fila] = await db()
      .insert(products)
      .values({ ownerId: ana.id, name: `${tipo} ${crypto.randomUUID().slice(0, 6)}`, kind: tipo })
      .returning();
    let orden = 1;
    for (const papel of papeles) {
      await db()
        .insert(productReferences)
        .values({
          productId: fila?.id ?? "",
          mediaId: await subirFotoDePrueba(actor, `${tipo}-${orden}.png`),
          kind: papel as "etiqueta",
          sortOrder: orden++,
        });
    }
    return fila?.id ?? "";
  }

  /** Deja el modelo con `cupo` referencias. Se restaura al terminar. */
  async function conCupo(modelo: string, cupo: number): Promise<void> {
    const [fila] = await db().select().from(models).where(eq(models.modelId, modelo)).limit(1);
    if (!fila) throw new Error(`El modelo ${modelo} no está en el catálogo de pruebas.`);
    if (!parametrosOriginales.has(fila.id)) parametrosOriginales.set(fila.id, fila.parameters);
    const parametros = JSON.parse(parametrosOriginales.get(fila.id) ?? "{}") as Record<string, unknown>;
    await db()
      .update(models)
      .set({ parameters: JSON.stringify({ ...parametros, maximoReferencias: cupo }) })
      .where(eq(models.id, fila.id));
    olvidarCatalogo();
  }

  type Caso = {
    nombre: string;
    tipo: "fotograma" | "animacion";
    consulta: Record<string, string>;
    envio: Record<string, unknown>;
  };

  const CASOS = (): Caso[] => [
    {
      nombre: "fotograma con personaje, producto y lugar",
      tipo: "fotograma",
      consulta: { personajeId, productoId: fisico, accion: "sostenerlo", lugarId },
      envio: { personajeId, producto: { productoId: fisico, accion: "sostenerlo" }, lugar: { lugarId } },
    },
    {
      nombre: "fotograma con una imagen suelta, producto y lugar",
      tipo: "fotograma",
      consulta: { medioId: imagen, productoId: fisico, accion: "sostenerlo", lugarId },
      envio: { medioId: imagen, producto: { productoId: fisico, accion: "sostenerlo" }, lugar: { lugarId } },
    },
    {
      nombre: "fotograma con personaje y lugar, sin producto",
      tipo: "fotograma",
      consulta: { personajeId, lugarId },
      envio: { personajeId, lugar: { lugarId } },
    },
    {
      nombre: "inserción de la captura del producto digital con lugar",
      tipo: "fotograma",
      consulta: { medioId: imagen, productoId: digital, lugarId, paso: "insertar_captura" },
      envio: {
        medioId: imagen,
        pasoDigital: "insertar_captura",
        producto: { productoId: digital, accion: "" },
        lugar: { lugarId },
      },
    },
    {
      nombre: "clip de una imagen con producto",
      tipo: "animacion",
      consulta: { medioId: imagen, productoId: fisico, accion: "sostenerlo" },
      envio: { medioId: imagen, dialogo: "", producto: { productoId: fisico, accion: "sostenerlo" } },
    },
  ];

  async function consultar(caso: Caso, modelo: string) {
    const respuesta = await rutaControles.GET(
      pedir(ana, `/api/generacion/controles?${new URLSearchParams({ tipo: caso.tipo, modelo, ...caso.consulta })}`),
      undefined,
    );
    expect(respuesta.status).toBe(200);
    return (await respuesta.json()) as {
      comprobaciones: { regla: string; confirmable?: boolean }[];
      referencias?: Cifras & { cabenTodas: boolean };
    };
  }

  async function enviar(caso: Caso, modelo: string, avisos: string[]): Promise<Cifras | { error: string }> {
    const estimacion = await estimar(ana.id, caso.tipo, buscar, modelo);
    const respuesta = await rutaTrabajos.POST(
      pedir(ana, "/api/generacion/trabajos", "POST", {
        tipo: caso.tipo,
        modelo,
        prompt: "Elisa en el bar, con el producto, a la luz de la ventana.",
        creditosConfirmados: estimacion.creditos,
        selloEstimacion: estimacion.sello,
        ...(estimacion.segundos ? { segundos: estimacion.segundos } : {}),
        derechos: true,
        derechoMarca: true,
        sinTerceros: true,
        avisoUmbralAceptado: true,
        claveIdempotencia: crypto.randomUUID(),
        avisosConfirmados: avisos,
        ...caso.envio,
      }),
      undefined,
    );
    const cuerpo = (await respuesta.json()) as { id?: string; error?: string };
    if (cuerpo.error) return { error: cuerpo.error };
    const [trabajo] = await db()
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, cuerpo.id ?? ""));
    const entrada = trabajo?.input as {
      referencias?: string[];
      referenciasProducto?: string[];
      referenciasLugar?: string[];
    };
    return {
      personaje: entrada.referencias?.length ?? 0,
      producto: entrada.referenciasProducto?.length ?? 0,
      lugar: entrada.referenciasLugar?.length ?? 0,
    };
  }

  const modeloDe = async (tipo: "fotograma" | "animacion") => (await estimar(ana.id, tipo, buscar)).modelo;

  for (const cupo of [1, 2, 3, 4, 10]) {
    test(`cupo ${cupo}: en cada tipo de envío, las cifras del aviso son las fotos que viajan`, async () => {
      for (const caso of CASOS()) {
        const modelo = await modeloDe(caso.tipo);
        await conCupo(modelo, cupo);
        await db().delete(rateLimits);
        const consulta = await consultar(caso, modelo);
        const avisos = consulta.comprobaciones.filter((c) => c.confirmable).map((c) => c.regla);
        const resultado = await enviar(caso, modelo, avisos);
        const dicho = consulta.referencias;
        if ("error" in resultado) {
          // Con una sola imagen no cabe la captura: el envío no se hace, y el aviso ya decía que no viaja ninguna.
          expect(caso.consulta.paso).toBe("insertar_captura");
          expect(resultado.error).toContain("no admite una segunda imagen de referencia");
          expect(dicho?.producto).toBe(0);
          continue;
        }
        const enviado = resultado;
        if (!dicho) {
          // Sin reparto que decir, no viaja nada del producto ni del lugar.
          expect({ caso: caso.nombre, producto: enviado.producto, lugar: enviado.lugar }).toEqual({
            caso: caso.nombre,
            producto: 0,
            lugar: 0,
          });
          continue;
        }
        expect({ caso: caso.nombre, ...enviado }).toEqual({
          caso: caso.nombre,
          personaje: dicho.personaje,
          producto: dicho.producto,
          lugar: dicho.lugar,
        });
        // El aviso de la maestra que no cabe sale exactamente cuando la maestra se queda fuera de un fotograma.
        const maestraCompite = caso.tipo === "fotograma" && caso.consulta.paso !== "insertar_captura";
        expect(consulta.comprobaciones.some((c) => c.regla === "lugar-maestra-no-cabe")).toBe(
          maestraCompite && enviado.lugar === 0,
        );
      }
    }, 60_000);
  }

  test("la inserción de la captura con cupo 4: tres capturas y la imagen, sin maestra, en el aviso y en el envío", async () => {
    const caso = CASOS()[3] as Caso;
    const modelo = await modeloDe("fotograma");
    await conCupo(modelo, 4);
    const consulta = await consultar(caso, modelo);
    expect(consulta.referencias).toEqual({ personaje: 1, producto: 3, lugar: 0, cabenTodas: true });
    const enviado = await enviar(
      caso,
      modelo,
      consulta.comprobaciones.filter((c) => c.confirmable).map((c) => c.regla),
    );
    expect(enviado).toEqual({ personaje: 1, producto: 3, lugar: 0 });
  });
});
