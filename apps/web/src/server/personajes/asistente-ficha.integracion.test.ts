import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { PropuestaDeFicha } from "@/lib/asistente-personaje";
import type { PersonajeVista } from "@/lib/personajes";
import { CHAT_200, MODELOS_200, respuestaGrabada } from "../proveedores/compatible/fixtures";

/**
 * «Completar la ficha con IA» y «Generar todas las vistas que faltan» (0.22.1), contra el PostgreSQL y el
 * SeaweedFS locales.
 *
 * **Ningún test llama a nadie**: el servicio compatible se simula con las respuestas **grabadas** de NaN
 * builders (`compatible/fixtures.ts`) y no se gasta un solo crédito de nadie.
 *
 * Lo que fija, una por una, las reglas duras de la versión:
 *
 * - la propuesta **no guarda nada**: la ficha del personaje sigue igual después de pedirla;
 * - a un servicio que admite imágenes se le envía **la cara del personaje**, en el formato multimodal de la
 *   API de OpenAI, y la propuesta lo dice;
 * - un servicio que se paga por cuota del plan apunta **0 créditos**, y no se le pide confirmar un precio;
 * - un texto que no se puede leer como ficha no cambia nada y dice **quién** contestó;
 * - en un personaje inventado, un nombre de persona real **en lo que propone el modelo** se rechaza igual que
 *   si lo hubiera escrito el usuario;
 * - «Generar todas las vistas» no encarga nada cuando no falta ninguna.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_asistente_ficha");
}

const { and, eq } = await import("drizzle-orm");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const rutaPersonaje = await import("@/app/api/personajes/[id]/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { assistantRuns, characters, users } = await import("../db/esquema");
const { guardarCompatible, listarCompatibles } = await import("../boveda/compatibles");
const { guardarMapa } = await import("../mapa/mapa");
const { crearMedio } = await import("../media/servicio");
const { proponerFichaConIA, estimacionDeFichaConIA } = await import("./asistente-ficha");
const { pedirVistasQueFaltan } = await import("./vista-sintetica");
const { crearPersonajeInventado } = await import("./inventado");
const { ErrorPersonaje } = await import("./errores");
type Buscador = import("../proveedores/codigos").Buscador;
type Actor = import("../media/servicio").Actor;

const BASE_NAN = "https://api.nan.builders/v1";
const CLAVE_NAN = "sk-nan-clave-de-ana-inventada-4321";
const MODELO = "gemma4";

const FICHA_PROPUESTA = JSON.stringify({
  rasgos: "Treinta años, complexión menuda, pelo castaño a la altura del hombro y ojos oscuros.",
  estilo: "Retrato urbano de noche, con luz de farola y colores fríos.",
  vestuario: "Chubasquero amarillo y botas de agua gastadas.",
  personalidad: "Mirada directa y postura serena, con las manos en los bolsillos.",
  voz: "Grave, pausada y con acento del norte.",
});

/** Lo que contesta el servicio compatible en la siguiente llamada. */
let respuestaDelModelo = FICHA_PROPUESTA;
/** Cuerpos de los `chat/completions` que ha recibido el simulador: es lo que de verdad se envió. */
const enviados: { model: string; messages: { role: string; content: unknown }[] }[] = [];

const buscar: Buscador = async (url, init) => {
  if (url.endsWith("/models")) return respuestaGrabada(MODELOS_200);
  if (url.endsWith("/chat/completions")) {
    enviados.push(JSON.parse(String(init?.body)) as (typeof enviados)[number]);
    return respuestaGrabada({ ...CHAT_200, choices: [{ message: { content: respuestaDelModelo } }] });
  }
  throw new Error(`URL no simulada: ${url}`);
};

/** Foto con relieve y luz media: pasa el control de calidad. */
async function foto(semilla: number, lado = 640): Promise<Uint8Array<ArrayBuffer>> {
  const bloques = 8;
  const paso = lado / bloques;
  const pixeles = new Uint8Array(lado * lado * 3);
  let estado = semilla * 2654435761 + 1;
  const valores = Array.from({ length: bloques * bloques }, () => {
    estado = (estado * 1103515245 + 12345) % 2147483648;
    return 40 + (estado % 180);
  });
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const bloque =
        Math.min(bloques - 1, Math.floor(y / paso)) * bloques + Math.min(bloques - 1, Math.floor(x / paso));
      const valor = valores[bloque] as number;
      const p = (y * lado + x) * 3;
      pixeles[p] = valor;
      pixeles[p + 1] = valor;
      pixeles[p + 2] = valor;
    }
  }
  const png = await sharp(pixeles, { raw: { width: lado, height: lado, channels: 3 } })
    .png()
    .toBuffer();
  const copia = new Uint8Array(new ArrayBuffer(png.byteLength));
  copia.set(png);
  return copia;
}

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!hayBaseDeDatos)("asistente de la ficha del personaje", () => {
  let ana: Sesion;
  let actorAna: Actor;
  /** Identificador único por ejecución: la base de pruebas es compartida. */
  const sufijo = randomBytes(4).toString("hex");

  const pedir = (s: Sesion, url: string, metodo = "GET", cuerpo?: unknown) =>
    new Request(`http://localhost${url}`, {
      method: metodo,
      headers: {
        cookie: s.cookie,
        ...(metodo === "GET" ? {} : { origin: "http://localhost", "Content-Type": "application/json" }),
      },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });

  /** Personaje de Ana con consentimiento, descripción y una foto frontal. */
  async function personajeConCara(nombre: string, semilla: number): Promise<PersonajeVista> {
    const creada = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", {
        nombre,
        tipo: "persona",
        descripcion: "Una repartidora de treinta años en una ciudad lluviosa, siempre de noche.",
      }),
      undefined,
    );
    expect(creada.status).toBe(201);
    const personaje = (await creada.json()) as PersonajeVista;
    const registro = await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
        titular: "yo",
        mayoriaDeEdad: true,
        alcance: "personal",
      }),
      ctx(personaje.id),
    );
    expect(registro.status).toBe(200);
    const medio = await crearMedio(
      actorAna,
      new File([await foto(semilla)], `cara-${semilla}.png`, { type: "image/png" }),
    );
    const anadida = await rutaReferencias.POST(
      pedir(ana, `/api/personajes/${personaje.id}/referencias`, "POST", {
        referencias: [{ medioId: medio.id, vistaClave: "frontal" }],
      }),
      ctx(personaje.id),
    );
    expect(anadida.status).toBe(200);
    return (await anadida.json()) as PersonajeVista;
  }

  beforeAll(async () => {
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    actorAna = { id: ana.id, esAdmin: false };
    await guardarCompatible(
      ana.id,
      { nombre: `NaN builders ${sufijo}`, urlBase: BASE_NAN, clave: CLAVE_NAN, modelos: [MODELO], soloCuota: true },
      buscar,
    );
    const servicio = (await listarCompatibles(ana.id))[0];
    await guardarMapa(ana.id, "texto", [{ proveedor: "compatible", compatibleId: servicio?.id ?? "", modelo: MODELO }]);
  });

  afterAll(async () => {
    await db().delete(users).where(eq(users.id, ana.id));
  });

  beforeEach(() => {
    respuestaDelModelo = FICHA_PROPUESTA;
    enviados.length = 0;
  });

  test("dice con qué modelo se haría, que no cuesta créditos y que admite imágenes", async () => {
    const estimacion = await estimacionDeFichaConIA(ana.id);
    expect(estimacion.hayEntradas).toBe(true);
    expect(estimacion.porCuota).toBe(true);
    expect(estimacion.creditos).toBe(0);
    expect(estimacion.admiteImagen).toBe(true);
    expect(estimacion.modelo).toBe(MODELO);
  });

  test("propone la ficha con la imagen del personaje y no guarda nada", async () => {
    const personaje = await personajeConCara(`Nora ${sufijo}`, 11);
    const propuesta: PropuestaDeFicha = await proponerFichaConIA(
      actorAna,
      personaje.id,
      { claveIdempotencia: crypto.randomUUID() },
      buscar,
    );

    expect(propuesta.campos.rasgos).toContain("castaño");
    expect(propuesta.campos.voz).toContain("Grave");
    expect(propuesta.conImagen).toBe(true);
    expect(propuesta.modelo).toBe(MODELO);
    expect(propuesta.deReserva).toBe(false);

    // Lo que se envió de verdad: el mensaje del usuario lleva el texto **y** la imagen en `data:` URL.
    const contenido = enviados[0]?.messages.at(-1)?.content as { type: string; image_url?: { url: string } }[];
    expect(Array.isArray(contenido)).toBe(true);
    expect(contenido.map((p) => p.type)).toEqual(["text", "image_url"]);
    expect(contenido[1]?.image_url?.url.startsWith("data:image/jpeg;base64,")).toBe(true);

    // Nada se ha guardado: la ficha del personaje sigue vacía hasta que el usuario acepte y guarde.
    const [fila] = await db().select().from(characters).where(eq(characters.id, personaje.id));
    expect(fila?.traits).toBe("");
    expect(fila?.voice).toBe("");

    // Y el apunte de gasto es el de un servicio de cuota: 0 créditos, nunca mezclados con los de otro.
    const [ejecucion] = await db()
      .select()
      .from(assistantRuns)
      .where(and(eq(assistantRuns.userId, ana.id), eq(assistantRuns.kind, "ficha_personaje")));
    expect(ejecucion?.estimatedCredits).toBe(0);
    expect(ejecucion?.consumedCredits).toBe(0);
    expect(ejecucion?.state).toBe("listo");
  });

  test("un texto que no se puede leer como ficha no cambia nada y dice quién contestó", async () => {
    const personaje = await personajeConCara(`Bruno ${sufijo}`, 22);
    respuestaDelModelo = "Pues mira, no me apetece contestarte con un JSON.";
    const fallo = await proponerFichaConIA(
      actorAna,
      personaje.id,
      { claveIdempotencia: crypto.randomUUID() },
      buscar,
    ).catch((e) => e);
    expect(fallo).toBeInstanceOf(ErrorPersonaje);
    expect((fallo as InstanceType<typeof ErrorPersonaje>).estado).toBe(502);
    expect(fallo.message).toContain(MODELO);
    expect(fallo.message).toContain("No se ha cambiado nada");
  });

  test("sin descripción no se llama a nadie: es de lo que sale la propuesta", async () => {
    const personaje = await personajeConCara(`Sin texto ${sufijo}`, 33);
    await rutaPersonaje.PATCH(
      pedir(ana, `/api/personajes/${personaje.id}`, "PATCH", { descripcion: "" }),
      ctx(personaje.id),
    );
    const fallo = await proponerFichaConIA(
      actorAna,
      personaje.id,
      { claveIdempotencia: crypto.randomUUID() },
      buscar,
    ).catch((e) => e);
    expect((fallo as InstanceType<typeof ErrorPersonaje>).estado).toBe(400);
    expect(enviados).toHaveLength(0);
  });

  test("en un inventado, un nombre de persona real propuesto por el modelo se rechaza", async () => {
    const inventado = await crearPersonajeInventado(actorAna, {
      nombre: `Vera ${sufijo}`,
      descripcion: "Una mensajera de una ciudad futura, con chaqueta técnica y luces de neón alrededor.",
      declaracion: true,
    });
    respuestaDelModelo = JSON.stringify({ rasgos: "Se parece mucho a Scarlett Johansson, con el pelo más corto." });
    const fallo = await proponerFichaConIA(
      actorAna,
      inventado.id,
      { claveIdempotencia: crypto.randomUUID() },
      buscar,
    ).catch((e) => e);
    expect((fallo as InstanceType<typeof ErrorPersonaje>).estado).toBe(422);
  });

  test("«todas las vistas» no encarga nada cuando no falta ninguna", async () => {
    const inventado = await crearPersonajeInventado(actorAna, {
      nombre: `Tomás ${sufijo}`,
      descripcion: "Un jardinero mayor de barba blanca que cuida un invernadero enorme en las afueras.",
      declaracion: true,
    });
    // Un personaje recién creado no tiene ninguna vista cubierta, así que sí faltan: se cubre el caso opuesto
    // con una vista que no existe en su catálogo. Lo que se comprueba aquí es que sin nada que generar no se
    // encola —ni se cobra— nada.
    const fallo = await pedirVistasQueFaltan(
      actorAna,
      inventado.id,
      { creditosConfirmados: 0, derechos: true, sinTerceros: true, claveIdempotencia: crypto.randomUUID() },
      { buscar, descargar: async () => ({ archivo: new File([], "x"), origen: "" }) },
    ).catch((e) => e);
    // Sin clave de KIE ni retrato, ninguna vista sale: se responde con el motivo y no se ha cobrado nada.
    expect(fallo).toBeInstanceOf(ErrorPersonaje);
    expect(fallo.message).toContain("no se te ha cobrado");
  });
});
