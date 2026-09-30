import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { PersonajeVista } from "@/lib/personajes";
import type { ProductoVista } from "@/lib/productos";
import type { ProyectoDetalle } from "@/lib/proyectos";

/**
 * **Qué fotos del producto viajan con una escena hablada de Gemini Omni**, contra el PostgreSQL local.
 *
 * Con producto, Omni renuncia a la identidad registrada y la cara sale de las fotos del personaje, que compiten
 * con las del producto por las siete referencias del modelo. Lo que se comprueba, con la forma real del `input`
 * de un trabajo guardado:
 *
 * - con una caja de cinco fotos y un personaje con seis, el trabajo guarda **cuatro del personaje y tres del
 *   producto**, y el aviso de antes de pagar dice esas cifras y cuántas se quedan fuera;
 * - si la persona ha elegido qué fotos del producto viajan, el trabajo guarda **esas**, en orden de prioridad;
 * - una foto que no es de ese producto se rechaza al guardar la elección, y una que se borra después no rompe
 *   la escena: se descarta y viajan las demás.
 *
 * **Ningún test llama a KIE**: el proveedor se simula con un `fetch` propio y la clave es inventada.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_producto_omni");
}

const { and, eq } = await import("drizzle-orm");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaEscenas = await import("@/app/api/proyectos/[id]/escenas/route");
const rutaPlan = await import("@/app/api/proyectos/[id]/plan/route");
const rutaVoz = await import("@/app/api/proyectos/[id]/voz/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const rutaProductos = await import("@/app/api/productos/route");
const rutaProducto = await import("@/app/api/productos/[id]/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characters, generationJobs, projects, scenes, usageLedger, users, voiceSamples } = await import(
  "../db/esquema"
);
const { products } = await import("../db/esquema-productos");
const { crearMedio, enviarAPapelera } = await import("../media/servicio");
const { olvidarSaldos } = await import("../generacion/estimacion");
const { estadoDeProduccion } = await import("../produccion/consulta");
const { producirProyecto } = await import("../produccion/producir");
const { editarEscena } = await import("../asistente/escenas");
const { estadoDeVoz } = await import("../voz/consulta");
const rutaTrabajos = await import("@/app/api/generacion/trabajos/route");
const rutaControles = await import("@/app/api/generacion/controles/route");
const { estimar } = await import("../generacion/estimacion");
const { listarModelos, olvidarCatalogo } = await import("../proveedores/catalogo");
const { cambiarEstadoDeModelo, cambiarPrecioDeModelo } = await import("../proveedores/catalogo-admin");
const { registrarPersonajeOmni } = await import("../personajes/omni");
const { registrarVozOmni, validarEleccionVozOmni } = await import("../voz/omni");
const { VOCES_OMNI, MODELOS_OMNI } = await import("@/lib/omni");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;

const CLAVE = "sk-omni-producto-clave-de-kie-inventada";
const CREDITOS_OMNI = 63;
const EJECUCION = crypto.randomUUID().slice(0, 8);

/** Los avisos salvables del producto: en estos tests se confirman, que es lo que hace la pantalla. */
const AVISOS_DEL_PRODUCTO = [
  "producto-con-marca",
  "producto-sin-identidad-registrada",
  "producto-referencias-no-caben",
];

// ── Proveedor simulado ───────────────────────────────────────────────────────────────────────────────────

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

let siguienteTarea = 0;
let registros = 0;

const buscar: Buscador = async (url, opciones) => {
  if (url.includes("/chat/credit")) return sobre(1_000_000);
  if (url.includes("file-stream-upload")) return sobre({ downloadUrl: "https://tempfile.kie.ai/ref.png" });
  if (url.includes("/omni/audio/create")) {
    const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { audio_id?: string; name?: string };
    return sobre({ audioId: `audio_${EJECUCION}_${cuerpo.audio_id}`, name: cuerpo.name ?? "" });
  }
  if (url.includes("/omni/character/create")) {
    registros++;
    return sobre({
      characterId: `char_${EJECUCION}_${registros}`,
      characterName: "x",
      imageUrl: "https://file.kie.ai/omni/retrato.png",
      bodyImageUrl: "",
    });
  }
  if (url.includes("createTask")) return sobre({ taskId: `omni_${EJECUCION}_${++siguienteTarea}` });
  if (url.includes("recordInfo")) return sobre({ state: "waiting", failMsg: "" });
  throw new Error(`URL no simulada: ${url}`);
};

const h: Herramientas = {
  buscar,
  descargar: async (url) => ({
    archivo: new File([new Uint8Array(8)], "clip.mp4", { type: "video/mp4" }),
    origen: url,
  }),
};

/** Un contenedor MP4 mínimo: la muestra de voz solo tiene que pasar la validación del tipo de archivo. */
const MP4 = new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom"), ...new Uint8Array(64)]);

const foto = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const datos = await sharp({
    create: {
      width: 640,
      height: 640,
      channels: 3,
      background: "#808080",
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  })
    .png()
    .toBuffer();
  const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
  copia.set(datos);
  return copia;
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

describe.skipIf(!hayBaseDeDatos)("fotos del producto en una escena hablada de Omni", () => {
  let ana: Sesion;
  let admin: Sesion;
  let actor: Actor;
  let personajeId: string;
  /** La foto del personaje que se marca como frontal: es la que tiene que viajar la primera. */
  let frontalDelPersonaje: string;
  let proyectoId: string;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;
  let modeloOmni: string;

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_producto_omni");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    admin = await crearSesionDePrueba("admin");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    await guardarAjustes(
      { presupuestoCreditos: 0, presupuestoTrabajo: 0, trabajosSimultaneos: 20, escenasEnVuelo: 10 },
      null,
    );
    modeloOmni = await registrarPrecioDeOmni();
  });

  afterAll(async () => {
    for (const sesion of [ana, admin]) {
      if (sesion?.email) await db().delete(users).where(eq(users.email, sesion.email));
    }
    await guardarAjustes(
      {
        presupuestoCreditos: ajustesPrevios.presupuestoCreditos,
        presupuestoTrabajo: ajustesPrevios.presupuestoTrabajo,
        trabajosSimultaneos: ajustesPrevios.trabajosSimultaneos,
        escenasEnVuelo: ajustesPrevios.escenasEnVuelo,
      },
      null,
    );
  });

  beforeEach(async () => {
    olvidarSaldos();
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(usageLedger).where(eq(usageLedger.userId, ana.id));
    await db().delete(voiceSamples).where(eq(voiceSamples.userId, ana.id));
    await db().delete(projects).where(eq(projects.userId, ana.id));
    await db().delete(characters).where(eq(characters.ownerId, ana.id));
    await db().delete(products).where(eq(products.ownerId, ana.id));
    exigirBaseDeDatosDePrueba("escenara_pruebas_producto_omni");
    personajeId = (await nuevoPersonajeConSeisFotos()).id;
  });

  async function registrarPrecioDeOmni(): Promise<string> {
    olvidarCatalogo();
    const candidatos = await listarModelos({ capacidad: "image_to_video" });
    const [modelo] = MODELOS_OMNI.flatMap((nombre) => candidatos.filter((m) => m.modelo === nombre));
    if (!modelo) throw new Error("Falta ningún modelo de escenas habladas en el catálogo de pruebas.");
    await cambiarPrecioDeModelo(
      {
        modeloId: modelo.id,
        creditos: CREDITOS_OMNI,
        fuente: "Medido con dinero real el 2026-09-28.",
        comprobado: "2026-09-28",
      },
      admin.id,
    );
    olvidarCatalogo();
    await cambiarEstadoDeModelo(
      { modeloId: modelo.id, estado: "validado", evidencia: "Medido con dinero real el 2026-09-28." },
      admin.id,
    );
    olvidarCatalogo();
    return modelo.modelo;
  }

  const subir = async (nombre: string) =>
    (await crearMedio(actor, new File([await foto()], nombre, { type: "image/png" }))).id;

  /** Personaje con consentimiento propio y seis fotos: más de las que le tocan con siete huecos. */
  async function nuevoPersonajeConSeisFotos(): Promise<PersonajeVista> {
    const creado = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", { nombre: `Lucía ${crypto.randomUUID().slice(0, 6)}`, tipo: "persona" }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const personaje = (await creado.json()) as PersonajeVista;
    const ids = await Promise.all(Array.from({ length: 6 }, (_, i) => subir(`lucia-${i}.png`)));
    // La última se sube marcada como frontal, para comprobar que el recorte no la deja fuera ni la pone detrás.
    frontalDelPersonaje = ids[5] as string;
    const referencias = ids.map((medioId, i) => ({ medioId, ...(i === 5 ? { vistaClave: "frontal" } : {}) }));
    expect(
      (
        await rutaReferencias.POST(
          pedir(ana, `/api/personajes/${personaje.id}/referencias`, "POST", { referencias }),
          ctx(personaje.id),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await rutaConsentimiento.POST(
          pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
            titular: "yo",
            mayoriaDeEdad: true,
            alcance: "personal",
          }),
          ctx(personaje.id),
        )
      ).status,
    ).toBe(200);
    return personaje;
  }

  /** «Caja Huerta Valenciana»: un producto físico con cinco fotos, cada una con su papel. */
  async function nuevaCaja(): Promise<{ producto: ProductoVista; fotos: [string, string, string, string, string] }> {
    const creado = await rutaProductos.POST(
      pedir(ana, "/api/productos", "POST", {
        nombre: "Caja Huerta Valenciana",
        descripcion: "Caja de cartón con verduras y etiqueta verde.",
        tipo: "fisico",
        marcaVisible: true,
      }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const producto = (await creado.json()) as ProductoVista;
    const papeles = ["etiqueta", "envase", "mecanismo", "suelto", "suelto"];
    const fotos = await Promise.all(
      papeles.map(async (papel, i) => ({ medioId: await subir(`caja-${i}.png`), papel })),
    );
    const anadidas = await rutaProducto.PATCH(
      pedir(ana, `/api/productos/${producto.id}`, "PATCH", { accion: "anadir-fotos", fotos }),
      ctx(producto.id),
    );
    expect(anadidas.status).toBe(200);
    const ficha = (await anadidas.json()) as ProductoVista;
    // Orden de prioridad con el que viajan: la frontal, el envase, el detalle y las sueltas.
    return { producto: ficha, fotos: fotos.map((f) => f.medioId) as [string, string, string, string, string] };
  }

  /** Proyecto en modo Omni con una escena de 4 s que lleva el producto, con su elección de fotos si la hay. */
  async function nuevoProyectoConProducto(productoId: string, fotosElegidas?: string[]): Promise<string> {
    const creado = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", {
        titulo: "Una escena con la caja",
        formato: "reel_vertical",
        idea: "Lucía enseña la caja de verduras.",
        personajeId,
        presupuestoCreditos: 100_000,
        segundosClip: 4,
      }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const id = ((await creado.json()) as ProyectoDetalle).proyecto.id;
    const escena = await rutaEscenas.POST(
      pedir(ana, `/api/proyectos/${id}/escenas`, "POST", {
        texto: "Mirad qué caja tan buena.",
        accion: "Plano medio en una cocina, sostiene la caja",
        segundos: 4,
        producto: { productoId, accion: "sostenerlo", ...(fotosElegidas ? { fotos: fotosElegidas } : {}) },
      }),
      ctx(id),
    );
    expect(escena.status).toBe(201);
    expect(
      (
        await rutaVoz.POST(
          pedir(ana, `/api/proyectos/${id}/voz`, "POST", { accion: "fijar-modo", modo: "omni" }),
          ctx(id),
        )
      ).status,
    ).toBe(200);
    const { detalleProyecto } = await import("../asistente/plan");
    const antes = await detalleProyecto(actor, id);
    const aprobar = await rutaPlan.POST(
      pedir(ana, `/api/proyectos/${id}/plan`, "POST", {
        presupuestoCreditos: 100_000,
        totalConfirmado: antes.plan.totalCreditos,
      }),
      ctx(id),
    );
    expect(aprobar.status).toBe(200);
    proyectoId = id;
    return id;
  }

  /**
   * Registra la voz y el personaje con Omni y fija además la voz de pista con su muestra: con producto la cara sale
   * de las fotos y la voz de la muestra, que es lo que necesita el envío.
   */
  async function prepararVoz(): Promise<void> {
    const eleccion = validarEleccionVozOmni({
      voz: VOCES_OMNI[0]?.id ?? "",
      descripcion: "Voz natural en español de España, acento peninsular, tono cercano.",
      ejemplo: "Hola, así suena mi voz cuando cuento algo.",
    });
    await registrarVozOmni(actor, proyectoId, eleccion, false, h);
    const [proyecto] = await db().select().from(projects).where(eq(projects.id, proyectoId)).limit(1);
    await registrarPersonajeOmni(actor, personajeId, proyecto?.omniAudioId ?? "", h);
    const { VOCES_OFRECIDAS, firmaDeVoz, PARAMETROS_VOZ_POR_DEFECTO } = await import("@/lib/voz");
    const voz = VOCES_OFRECIDAS[0]?.id ?? "";
    const modeloDeVoz = "elevenlabs/text-to-speech-multilingual-v2";
    await db()
      .update(projects)
      .set({
        voiceProvider: "kie",
        voiceModel: modeloDeVoz,
        voiceId: voz,
        voiceParams: PARAMETROS_VOZ_POR_DEFECTO as unknown as Record<string, number>,
        voiceSetAt: new Date(),
      })
      .where(eq(projects.id, proyectoId));
    const medio = await crearMedio(actor, new File([MP4], "muestra.mp3", { type: "audio/mpeg" }));
    const { TEXTO_DE_MUESTRA } = await import("../voz/muestra");
    await db()
      .insert(voiceSamples)
      .values({
        userId: ana.id,
        provider: "kie",
        model: modeloDeVoz,
        voice: voz,
        paramsSignature: firmaDeVoz(
          "pista",
          { proveedor: "kie", modelo: modeloDeVoz, voz, parametros: PARAMETROS_VOZ_POR_DEFECTO, fijadaEn: "" },
          TEXTO_DE_MUESTRA,
        ),
        mediaId: medio.id,
      });
    expect((await estadoDeVoz(actor, proyectoId)).modo).toBe("omni");
  }

  async function confirmacion(avisos: string[]) {
    const estado = await estadoDeProduccion(actor, proyectoId);
    return {
      derechos: true,
      derechoMarca: true,
      sinTerceros: true,
      creditosConfirmados: estado.creditosPorClip,
      selloEstimacion: estado.selloClip,
      claveIdempotencia: crypto.randomUUID(),
      avisoUmbralAceptado: true,
      avisosConfirmados: avisos,
    };
  }

  const trabajoDeLaEscena = async () => {
    const escenas = await db().select().from(scenes).where(eq(scenes.projectId, proyectoId));
    const [fila] = await db()
      .select()
      .from(generationJobs)
      .where(and(eq(generationJobs.userId, ana.id), eq(generationJobs.sceneId, escenas[0]?.id ?? "")))
      .limit(1);
    if (!fila) throw new Error("La escena no ha encolado ningún trabajo.");
    return fila.input as { referencias?: string[]; referenciasProducto?: string[] };
  };

  test("una caja de cinco fotos con siete huecos guarda tres del producto y cuatro del personaje, y el aviso dice las cifras", async () => {
    const { producto, fotos } = await nuevaCaja();
    await nuevoProyectoConProducto(producto.id);
    await prepararVoz();

    // Sin confirmar el aviso, no se cobra nada y se dice cuántas fotos viajan y cuántas se quedan fuera.
    const sinConfirmar = await producirProyecto(
      actor,
      proyectoId,
      await confirmacion(AVISOS_DEL_PRODUCTO.filter((a) => a !== "producto-referencias-no-caben")),
      h,
    ).catch((e: unknown) => e as { estado: number; message: string });
    expect(sinConfirmar).toMatchObject({ estado: 409 });
    expect((sinConfirmar as { message: string }).message).toContain(
      "admite 7 referencias: se envían 4 del personaje y 3 de «Caja Huerta Valenciana»; 2 fotos del producto y 2 del personaje se quedan fuera.",
    );

    await producirProyecto(actor, proyectoId, await confirmacion(AVISOS_DEL_PRODUCTO), h);
    const input = await trabajoDeLaEscena();
    expect(input.referencias).toHaveLength(4);
    // La identidad viaja empezando por la frontal, que no se pierde con el recorte.
    expect(input.referencias?.[0]).toBe(frontalDelPersonaje);
    expect(input.referenciasProducto).toHaveLength(3);
    // La frontal viaja siempre; después el envase y el detalle de la tapa.
    expect(input.referenciasProducto).toEqual([fotos[0], fotos[1], fotos[2]]);
  });

  test("la elección guardada en la escena es la que viaja, en orden de prioridad", async () => {
    const { producto, fotos } = await nuevaCaja();
    // Se eligen las dos sueltas y la frontal, sin el envase ni el detalle.
    await nuevoProyectoConProducto(producto.id, [fotos[4], fotos[3], fotos[0]]);
    await prepararVoz();

    await producirProyecto(actor, proyectoId, await confirmacion(AVISOS_DEL_PRODUCTO), h);
    const input = await trabajoDeLaEscena();
    expect(input.referenciasProducto).toEqual([fotos[0], fotos[3], fotos[4]]);
    expect(input.referencias).toHaveLength(4);
  });

  test("una foto que no es del producto se rechaza al guardar la elección, con su causa", async () => {
    const { producto } = await nuevaCaja();
    await nuevoProyectoConProducto(producto.id);
    const ajena = await subir("ajena.png");
    const [escena] = await db().select().from(scenes).where(eq(scenes.projectId, proyectoId));
    const fallo = await editarEscena(actor, escena?.id ?? "", {
      producto: { productoId: producto.id, accion: "sostenerlo", fotos: [ajena] },
    }).catch((e: unknown) => e as { estado: number; message: string });
    expect(fallo).toMatchObject({ estado: 400 });
    expect((fallo as { message: string }).message).toContain("no es de este producto o está en la papelera");
    const [sigue] = await db()
      .select()
      .from(scenes)
      .where(eq(scenes.id, escena?.id ?? ""));
    expect(sigue?.productPhotoIds).toEqual([]);
  });

  test("una foto elegida que se borra después no rompe la escena: se descarta y viajan las demás", async () => {
    const { producto, fotos } = await nuevaCaja();
    await nuevoProyectoConProducto(producto.id, [fotos[0], fotos[1], fotos[2]]);
    await prepararVoz();
    await enviarAPapelera(actor, fotos[1]);

    await producirProyecto(actor, proyectoId, await confirmacion(AVISOS_DEL_PRODUCTO), h);
    const input = await trabajoDeLaEscena();
    expect(input.referenciasProducto).toEqual([fotos[0], fotos[2]]);
  });

  test("cambiar de producto en la escena borra la elección de fotos del anterior", async () => {
    const { producto, fotos } = await nuevaCaja();
    await nuevoProyectoConProducto(producto.id, [fotos[0]]);
    const [escena] = await db().select().from(scenes).where(eq(scenes.projectId, proyectoId));
    expect(escena?.productPhotoIds).toEqual([fotos[0]]);
    await editarEscena(actor, escena?.id ?? "", { producto: { productoId: "", accion: "" } });
    const [sinProducto] = await db()
      .select()
      .from(scenes)
      .where(eq(scenes.id, escena?.id ?? ""));
    expect(sinProducto?.productId).toBeNull();
    expect(sinProducto?.productPhotoIds).toEqual([]);
  });

  // ── «Crear»: la elección viaja con la petición y se valida estrictamente ──────────────────────────────

  describe("en «Crear» la elección viaja con el clip", () => {
    async function pedirClip(productoId: string, fotos?: string[], imagenDePartida?: string) {
      const estimacion = await estimar(ana.id, "animacion", buscar, modeloOmni);
      const imagen = imagenDePartida ?? (await subir("fotograma.png"));
      return rutaTrabajos.POST(
        pedir(ana, "/api/generacion/trabajos", "POST", {
          tipo: "animacion",
          modelo: modeloOmni,
          medioId: imagen,
          prompt: "En una cocina luminosa, enseña la caja a cámara.",
          dialogo: "Mirad qué caja tan buena.",
          segundos: estimacion.segundos,
          creditosConfirmados: estimacion.creditos,
          selloEstimacion: estimacion.sello,
          derechos: true,
          derechoMarca: true,
          sinTerceros: true,
          claveIdempotencia: crypto.randomUUID(),
          producto: { productoId, accion: "ensenarlo-a-camara", ...(fotos ? { fotos } : {}) },
          avisosConfirmados: AVISOS_DEL_PRODUCTO,
        }),
        undefined,
      );
    }

    const referenciasDelUltimoTrabajo = async () => {
      const [fila] = await db()
        .select()
        .from(generationJobs)
        .where(and(eq(generationJobs.userId, ana.id), eq(generationJobs.kind, "animacion")))
        .orderBy(generationJobs.createdAt)
        .limit(1);
      return (fila?.input as { referenciasProducto?: string[] } | undefined)?.referenciasProducto;
    };

    test("sin elección viajan las de por defecto, la frontal la primera", async () => {
      const { producto, fotos } = await nuevaCaja();
      const respuesta = await pedirClip(producto.id);
      expect(respuesta.status).toBe(201);
      expect(await referenciasDelUltimoTrabajo()).toEqual(fotos);
    });

    test("con elección viajan solo las elegidas, en orden de prioridad", async () => {
      const { producto, fotos } = await nuevaCaja();
      const respuesta = await pedirClip(producto.id, [fotos[4], fotos[1]]);
      expect(respuesta.status).toBe(201);
      expect(await referenciasDelUltimoTrabajo()).toEqual([fotos[1], fotos[4]]);
    });

    test("una foto que no es del producto se rechaza y no se cobra nada", async () => {
      const { producto } = await nuevaCaja();
      const respuesta = await pedirClip(producto.id, [await subir("ajena.png")]);
      expect(respuesta.status).toBe(400);
      expect(((await respuesta.json()) as { error: string }).error).toContain("no es de este producto");
      expect(await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id))).toHaveLength(0);
    });

    test("una foto en la papelera se rechaza con su causa", async () => {
      const { producto, fotos } = await nuevaCaja();
      await enviarAPapelera(actor, fotos[2]);
      const respuesta = await pedirClip(producto.id, [fotos[0], fotos[2]]);
      expect(respuesta.status).toBe(400);
      expect(((await respuesta.json()) as { error: string }).error).toContain("está en la papelera");
    });

    test("una elección que pasa de lo que cabe se rechaza y dice cuántas caben", async () => {
      const { producto, fotos } = await nuevaCaja();
      const extra = await completarHastaOchoDeLaCaja(producto.id);
      // Con siete huecos y una imagen de partida caben seis: elegir siete no cabe.
      const respuesta = await pedirClip(producto.id, [...fotos, ...extra.slice(0, 2)]);
      expect(respuesta.status).toBe(400);
      expect(((await respuesta.json()) as { error: string }).error).toContain("solo caben 6");
      expect(await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id))).toHaveLength(0);
    });

    /** Un fotograma ya hecho con el personaje de seis fotos: la imagen de partida del clip hereda ese personaje. */
    async function fotogramaConElPersonaje(): Promise<string> {
      const estimacion = await estimar(ana.id, "fotograma", buscar);
      const respuesta = await rutaTrabajos.POST(
        pedir(ana, "/api/generacion/trabajos", "POST", {
          tipo: "fotograma",
          personajeId,
          prompt: "Lucía en una cocina luminosa.",
          creditosConfirmados: estimacion.creditos,
          selloEstimacion: estimacion.sello,
          derechos: true,
          sinTerceros: true,
          claveIdempotencia: crypto.randomUUID(),
        }),
        undefined,
      );
      expect(respuesta.status).toBe(201);
      const { id } = (await respuesta.json()) as { id: string };
      const resultado = await subir("fotograma-de-lucia.png");
      await db().update(generationJobs).set({ resultMediaId: resultado }).where(eq(generationJobs.id, id));
      return resultado;
    }

    const consultarClip = (medioId: string, productoId: string, fotos?: string[]) =>
      rutaControles.GET(
        pedir(
          ana,
          `/api/generacion/controles?${new URLSearchParams({
            tipo: "animacion",
            modelo: modeloOmni,
            medioId,
            productoId,
            accion: "ensenarlo-a-camara",
            ...(fotos ? { fotos: fotos.join(",") } : {}),
          })}`,
        ),
        undefined,
      );

    type Vista = { comprobaciones: { regla: string; motivo: string }[] };

    test("el aviso de la consulta y el envío cuentan igual con un fotograma hecho con un personaje de seis fotos", async () => {
      const { producto, fotos } = await nuevaCaja();
      const extra = await completarHastaOchoDeLaCaja(producto.id);
      const todas = [...fotos, ...extra];
      const imagen = await fotogramaConElPersonaje();

      // Sin elección: el clip parte de una sola imagen, así que caben seis fotos del producto y quedan dos fuera.
      const consulta = await consultarClip(imagen, producto.id);
      expect(consulta.status).toBe(200);
      const aviso = ((await consulta.json()) as Vista).comprobaciones.find(
        (c) => c.regla === "producto-referencias-no-caben",
      );
      expect(aviso?.motivo).toContain(
        "admite 7 referencias: se envía 1 foto del personaje y 6 de «Caja Huerta Valenciana»; 2 fotos del producto se quedan fuera.",
      );
      const estimacion = await estimar(ana.id, "animacion", buscar, modeloOmni);
      const sinConfirmar = await rutaTrabajos.POST(
        pedir(ana, "/api/generacion/trabajos", "POST", {
          tipo: "animacion",
          modelo: modeloOmni,
          medioId: imagen,
          prompt: "En una cocina luminosa, enseña la caja a cámara.",
          dialogo: "Mirad qué caja tan buena.",
          segundos: estimacion.segundos,
          creditosConfirmados: estimacion.creditos,
          selloEstimacion: estimacion.sello,
          derechos: true,
          derechoMarca: true,
          sinTerceros: true,
          claveIdempotencia: crypto.randomUUID(),
          producto: { productoId: producto.id, accion: "ensenarlo-a-camara" },
          avisosConfirmados: AVISOS_DEL_PRODUCTO.filter((a) => a !== "producto-referencias-no-caben"),
        }),
        undefined,
      );
      expect(sinConfirmar.status).toBe(409);
      expect(((await sinConfirmar.json()) as { error: string }).error).toContain(aviso?.motivo ?? "sin aviso");

      // Con cinco elegidas caben todas: la consulta y el envío las aceptan, y no hay aviso.
      const cinco = [todas[0], todas[2], todas[4], todas[5], todas[7]] as string[];
      const consultaCinco = await consultarClip(imagen, producto.id, cinco);
      expect(consultaCinco.status).toBe(200);
      expect(((await consultaCinco.json()) as Vista).comprobaciones.map((c) => c.regla)).not.toContain(
        "producto-referencias-no-caben",
      );
      const envioCinco = await pedirClip(producto.id, cinco, imagen);
      expect(envioCinco.status).toBe(201);
      expect(await referenciasDelUltimoTrabajo()).toHaveLength(5);
    });

    test("una elección que no cabe se rechaza igual en la consulta y en el envío", async () => {
      const { producto, fotos } = await nuevaCaja();
      const extra = await completarHastaOchoDeLaCaja(producto.id);
      const siete = [...fotos, ...extra.slice(0, 2)];
      const imagen = await fotogramaConElPersonaje();
      const consulta = await consultarClip(imagen, producto.id, siete);
      const envio = await pedirClip(producto.id, siete, imagen);
      expect(consulta.status).toBe(400);
      expect(envio.status).toBe(400);
      const [c, e] = await Promise.all([consulta.json(), envio.json()]);
      expect((c as { error: string }).error).toContain("solo caben 6");
      expect((e as { error: string }).error).toBe((c as { error: string }).error);
    });
  });

  /** Añade más fotos al producto hasta tener ocho, que es lo máximo: con Omni y un solo fotograma caben seis. */
  async function completarHastaOchoDeLaCaja(productoId: string): Promise<string[]> {
    const nuevas = await Promise.all(
      ["suelto", "suelto", "suelto"].map(async (papel, i) => ({ medioId: await subir(`extra-${i}.png`), papel })),
    );
    const respuesta = await rutaProducto.PATCH(
      pedir(ana, `/api/productos/${productoId}`, "PATCH", { accion: "anadir-fotos", fotos: nuevas }),
      ctx(productoId),
    );
    expect(respuesta.status).toBe(200);
    return nuevas.map((f) => f.medioId);
  }

  /** Deja al personaje con la hoja 3×3 por defecto durante `prueba` y se la quita al terminar, pase lo que pase. */
  async function conHojaPorDefecto(prueba: (hoja: string) => Promise<void>): Promise<void> {
    const hoja = await subir("hoja-3x3.png");
    await db()
      .update(characters)
      .set({ identitySheetMediaId: hoja, identitySheetStatus: "por_defecto" })
      .where(eq(characters.id, personajeId));
    try {
      await prueba(hoja);
    } finally {
      await db()
        .update(characters)
        .set({ identitySheetMediaId: null, identitySheetStatus: "descartada" })
        .where(eq(characters.id, personajeId));
    }
  }

  test("con la hoja 3×3 solo viaja la hoja y el producto aprovecha los huecos", async () => {
    const { producto, fotos } = await nuevaCaja();
    await conHojaPorDefecto(async (hoja) => {
      await nuevoProyectoConProducto(producto.id);
      await prepararVoz();
      // Viaja la hoja sola y las cinco fotos de la caja: no hay nada que se quede fuera, así que no hay aviso.
      await producirProyecto(
        actor,
        proyectoId,
        await confirmacion(AVISOS_DEL_PRODUCTO.filter((a) => a !== "producto-referencias-no-caben")),
        h,
      );
      const input = await trabajoDeLaEscena();
      expect(input.referencias).toEqual([hoja]);
      expect(input.referenciasProducto).toEqual(fotos);
    });
  });

  // ── La consulta de antes de pagar y el envío cuentan igual ────────────────────────────────────────────

  /** Pide un fotograma con el personaje y la caja; devuelve la respuesta cruda y el sello con el que se pidió. */
  async function pedirFotogramaConCaja(productoId: string, avisos: string[]) {
    const estimacion = await estimar(ana.id, "fotograma", buscar);
    return rutaTrabajos.POST(
      pedir(ana, "/api/generacion/trabajos", "POST", {
        tipo: "fotograma",
        personajeId,
        prompt: "Lucía en una cocina luminosa, enseña la caja.",
        creditosConfirmados: estimacion.creditos,
        selloEstimacion: estimacion.sello,
        derechos: true,
        derechoMarca: true,
        sinTerceros: true,
        claveIdempotencia: crypto.randomUUID(),
        producto: { productoId, accion: "ensenarlo-a-camara" },
        avisosConfirmados: avisos,
      }),
      undefined,
    );
  }

  const consultarFotograma = (productoId: string) =>
    rutaControles.GET(
      pedir(
        ana,
        `/api/generacion/controles?${new URLSearchParams({ tipo: "fotograma", personajeId, productoId, accion: "ensenarlo-a-camara" })}`,
      ),
      undefined,
    );

  test("el fotograma con personaje: la consulta y el envío dicen las mismas cifras", async () => {
    const { producto } = await nuevaCaja();
    await completarHastaOchoDeLaCaja(producto.id);
    const consulta = await consultarFotograma(producto.id);
    expect(consulta.status).toBe(200);
    const aviso = (
      (await consulta.json()) as { comprobaciones: { regla: string; motivo: string }[] }
    ).comprobaciones.find((c) => c.regla === "producto-referencias-no-caben");
    // Seis fotos del personaje y ocho del producto no caben en las diez del modelo de imagen.
    expect(aviso?.motivo).toContain("se envían 6 del personaje y 4 de «Caja Huerta Valenciana»");
    const sinConfirmar = await pedirFotogramaConCaja(
      producto.id,
      AVISOS_DEL_PRODUCTO.filter((a) => a !== "producto-referencias-no-caben"),
    );
    expect(sinConfirmar.status).toBe(409);
    expect(((await sinConfirmar.json()) as { error: string }).error).toContain(aviso?.motivo ?? "sin aviso");
    const confirmado = await pedirFotogramaConCaja(producto.id, AVISOS_DEL_PRODUCTO);
    expect(confirmado.status).toBe(201);
    const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id));
    const input = fila?.input as { referencias?: string[]; referenciasProducto?: string[] };
    expect(input.referencias).toHaveLength(6);
    expect(input.referenciasProducto).toHaveLength(4);
  });

  test("el fotograma con la hoja 3×3: la consulta y el envío cuentan una sola foto del personaje", async () => {
    const { producto, fotos } = await nuevaCaja();
    await conHojaPorDefecto(async (hoja) => {
      const consulta = await consultarFotograma(producto.id);
      expect(consulta.status).toBe(200);
      // Con la hoja sola caben las cinco fotos de la caja: no hay nada que avisar.
      expect(
        ((await consulta.json()) as { comprobaciones: { regla: string }[] }).comprobaciones.map((c) => c.regla),
      ).not.toContain("producto-referencias-no-caben");
      const envio = await pedirFotogramaConCaja(
        producto.id,
        AVISOS_DEL_PRODUCTO.filter((a) => a !== "producto-referencias-no-caben"),
      );
      expect(envio.status).toBe(201);
      const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id));
      const input = fila?.input as { referencias?: string[]; referenciasProducto?: string[] };
      expect(input.referencias).toEqual([hoja]);
      expect(input.referenciasProducto).toEqual(fotos);
    });
  });

  test("la ficha de la escena de Omni dice lo mismo que el envío: caben las fotos que luego viajan", async () => {
    const { producto } = await nuevaCaja();
    await nuevoProyectoConProducto(producto.id);
    await prepararVoz();
    const { detalleProyecto } = await import("../asistente/plan");
    const { fotosQueCaben, cupoDeFotosDe } = await import("@/lib/fotos-del-producto");
    const detalle = await detalleProyecto(actor, proyectoId);
    const cupo = cupoDeFotosDe(detalle.escenas[0]?.estimacion?.fotoDeProducto);
    expect(cupo).toEqual({ cupoDeGaleria: 7, fotosDelPersonaje: 6 });
    const caben = fotosQueCaben(cupo as NonNullable<typeof cupo>, 5);

    await producirProyecto(actor, proyectoId, await confirmacion(AVISOS_DEL_PRODUCTO), h);
    expect((await trabajoDeLaEscena()).referenciasProducto).toHaveLength(caben);
  });
});
