import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { crc32 } from "node:zlib";
import { loadEnvConfig } from "@next/env";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { DistintivoOrigen } from "@/components/ui/personajes/distintivo-origen";
import type { Medio } from "@/lib/media/tipos";
import type { PersonajeVista } from "@/lib/personajes";

/**
 * Captura guiada de referencias (0.14.0) contra el PostgreSQL y el SeaweedFS locales.
 *
 * **Ningún test llama a KIE**: el proveedor se simula y la clave es inventada.
 *
 * Lo que fija, una por una, las reglas duras de la versión:
 *
 * - una foto borrosa, oscura o pequeña **no se guarda** como referencia, y se dice por qué;
 * - la misma foto (o una casi idéntica) avisa de duplicado y no crea una segunda referencia;
 * - la cobertura dice **exactamente** qué vista falta, distinta en personas y en animales;
 * - una vista generada **nunca** cuenta para el mínimo de fotos originales, y su etiqueta llega hasta el
 *   render de la interfaz;
 * - pedir una vista sintética pasa por las mismas puertas de consentimiento y de dinero que «Crear».
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_captura_guiada");
}

const { desc, eq } = await import("drizzle-orm");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaPersonaje = await import("@/app/api/personajes/[id]/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const rutaVistaSintetica = await import("@/app/api/personajes/[id]/vista-sintetica/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characterReferences, characterVersions, generationJobs, users } = await import("../db/esquema");
const { guardarCredencial } = await import("../boveda/credenciales");
const { crearMedio, enviarAPapelera } = await import("../media/servicio");
const { pasadaDeCola } = await import("../cola/pasada");
const { pedirVistaSintetica } = await import("./vista-sintetica");
const { quitarReferencias } = await import("./servicio");
const { coberturaDe } = await import("./consulta");
const { analizarImagen } = await import("./calidad");
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type Actor = import("../media/servicio").Actor;

const CLAVE = "sk-ana-clave-de-kie-inventada-aaaa";

// ── Proveedor simulado ───────────────────────────────────────────────────────────────────────────────────

let siguienteTarea = 0;
const tareas = new Map<string, { state: string; urls?: string[]; creditos?: number }>();

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url) => {
  if (url.includes("/chat/credit")) return sobre(5000);
  if (url.includes("file-stream-upload")) return sobre({ downloadUrl: "https://tempfile.kie.ai/referencia.png" });
  if (url.includes("createTask")) {
    const taskId = `task_${++siguienteTarea}`;
    tareas.set(taskId, { state: "success", urls: ["https://tempfile.kie.ai/resultado.png"], creditos: 4 });
    return sobre({ taskId });
  }
  if (url.includes("recordInfo")) {
    const taskId = new URL(url).searchParams.get("taskId") ?? "";
    const tarea = tareas.get(taskId) ?? { state: "waiting" };
    return sobre({
      state: tarea.state,
      resultJson: tarea.urls ? JSON.stringify({ resultUrls: tarea.urls }) : undefined,
      creditsConsumed: tarea.creditos,
      failMsg: "",
    });
  }
  throw new Error(`URL no simulada: ${url}`);
};

// ── Imágenes de prueba ───────────────────────────────────────────────────────────────────────────────────

function bytes(datos: Uint8Array): Uint8Array<ArrayBuffer> {
  const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
  copia.set(datos);
  return copia;
}

/**
 * Foto **con relieve**: un mosaico de ocho por ocho bloques con brillos deterministas. Tiene bordes (así que
 * está «enfocada»), luz media y una huella perceptual estable al reescalarla y recomprimirla, que es
 * justamente lo que le pasa a una foto al guardarse en la biblioteca.
 */
async function foto(semilla: number, lado = 640, brillo = 1): Promise<Uint8Array<ArrayBuffer>> {
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
      const valor = Math.max(0, Math.min(255, Math.round((valores[bloque] as number) * brillo)));
      const p = (y * lado + x) * 3;
      pixeles[p] = valor;
      pixeles[p + 1] = valor;
      pixeles[p + 2] = valor;
    }
  }
  return bytes(
    await sharp(pixeles, { raw: { width: lado, height: lado, channels: 3 } })
      .png()
      .toBuffer(),
  );
}

/**
 * PNG de 66 bytes que **declara** un lienzo inmenso en su cabecera. Es la bomba de descompresión clásica:
 * decodificarlo pediría terabytes de memoria, así que el control de calidad tiene que descartarlo leyendo la
 * cabecera y sin tocar los píxeles.
 */
function pngDeLienzo(ancho: number, alto: number): Uint8Array<ArrayBuffer> {
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(ancho, 0);
  cabecera.writeUInt32BE(alto, 4);
  cabecera[8] = 8; // 8 bits por canal
  cabecera[9] = 2; // color RGB
  const trozo = (tipo: string, datos: Buffer) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length, 0);
    const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
    const suma = Buffer.alloc(4);
    suma.writeUInt32BE(crc32(cuerpo) >>> 0, 0);
    return Buffer.concat([largo, cuerpo, suma]);
  };
  return bytes(
    new Uint8Array(
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        trozo("IHDR", cabecera),
        trozo("IDAT", Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01])),
        trozo("IEND", Buffer.alloc(0)),
      ]),
    ),
  );
}

const borrosa = async (semilla: number) =>
  bytes(
    await sharp(await foto(semilla))
      .blur(12)
      .png()
      .toBuffer(),
  );

const oscura = async (semilla: number) =>
  bytes(
    await sharp(await foto(semilla))
      // Menos luz pero **sin** perder el relieve: así el motivo que se comprueba es la oscuridad y no el
      // enfoque, que es otra cosa distinta.
      .linear(0.5, -40)
      .png()
      .toBuffer(),
  );

const descargar: Herramientas["descargar"] = async (url) => ({
  archivo: new File([await foto(99)], "vista.png", { type: "image/png" }),
  origen: url,
});

const h: Herramientas = { buscar, descargar };

// ── Utilidades de petición ───────────────────────────────────────────────────────────────────────────────

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
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

describe.skipIf(!hayBaseDeDatos)("captura guiada de referencias", () => {
  let ana: Sesion;
  let actorAna: Actor;

  const subir = (datos: Uint8Array<ArrayBuffer>, nombre: string): Promise<Medio> =>
    crearMedio(actorAna, new File([datos], nombre, { type: "image/png" }));

  /** Personaje de Ana, con consentimiento propio si se pide. */
  async function nuevoPersonaje(
    nombre: string,
    tipo: "persona" | "animal" = "persona",
    conConsentimiento = true,
  ): Promise<PersonajeVista> {
    const creada = await rutaPersonajes.POST(pedir(ana, "/api/personajes", "POST", { nombre, tipo }), undefined);
    expect(creada.status).toBe(201);
    const personaje = (await creada.json()) as PersonajeVista;
    if (!conConsentimiento) return personaje;
    const registro = await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
        titular: "yo",
        mayoriaDeEdad: true,
        alcance: "personal",
      }),
      ctx(personaje.id),
    );
    expect(registro.status).toBe(200);
    return (await registro.json()) as PersonajeVista;
  }

  /** Añade una foto como referencia de una vista y devuelve la respuesta cruda. */
  const anadir = (personajeId: string, referencias: unknown[]) =>
    rutaReferencias.POST(
      pedir(ana, `/api/personajes/${personajeId}/referencias`, "POST", { referencias }),
      ctx(personajeId),
    );

  /** Dice qué vista es cada foto que ya está en el personaje; `vistaClave: null` la deja sin clasificar. */
  const vistas = (personajeId: string, cambios: { id: string; vistaClave: string | null }[]) =>
    rutaReferencias.PATCH(
      pedir(ana, `/api/personajes/${personajeId}/referencias`, "PATCH", { vistas: cambios }),
      ctx(personajeId),
    );

  const ficha = async (id: string): Promise<PersonajeVista> =>
    (await (await rutaPersonaje.GET(pedir(ana, `/api/personajes/${id}`), ctx(id))).json()) as PersonajeVista;

  beforeAll(async () => {
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    actorAna = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
  });

  afterAll(async () => {
    if (ana?.email) await db().delete(users).where(eq(users.email, ana.email));
  });

  test("una foto borrosa se rechaza con su motivo y no se guarda", async () => {
    const personaje = await nuevoPersonaje("Borrosa");
    const medio = await subir(await borrosa(1), "movida.png");
    const respuesta = await anadir(personaje.id, [{ medioId: medio.id, vistaClave: "frontal" }]);
    expect(respuesta.status).toBe(422);
    const cuerpo = (await respuesta.json()) as { error: string; rechazos: { motivos: string[] }[] };
    expect(cuerpo.rechazos[0]?.motivos).toEqual(["nitidez"]);
    expect(cuerpo.error).toContain("borrosa");
    // Nada guardado: la relación no existe.
    expect(await db().select().from(characterReferences).where(eq(characterReferences.mediaId, medio.id))).toEqual([]);
    expect((await ficha(personaje.id)).totalReferencias).toBe(0);
  });

  test("una foto oscura se rechaza, y con «usar de todas formas» se guarda con el motivo anotado", async () => {
    const personaje = await nuevoPersonaje("Oscura");
    const medio = await subir(await oscura(2), "sin-luz.png");
    const primera = await anadir(personaje.id, [{ medioId: medio.id, vistaClave: "frontal" }]);
    expect(primera.status).toBe(422);
    expect(((await primera.json()) as { rechazos: { motivos: string[] }[] }).rechazos[0]?.motivos).toContain(
      "oscuridad",
    );

    const segunda = await anadir(personaje.id, [{ medioId: medio.id, vistaClave: "frontal", usarDeTodasFormas: true }]);
    expect(segunda.status).toBe(200);
    const [fila] = await db().select().from(characterReferences).where(eq(characterReferences.mediaId, medio.id));
    expect(fila?.rejectionReason).toBe("oscuridad");
    expect(fila?.viewKey).toBe("frontal");
    // Las medidas se guardan con la referencia: sin ellas, «oscura» sería una opinión.
    expect(fila?.width).toBe(640);
    expect(fila?.brightness).toBeLessThan(45);
    // Y la ficha lo sigue diciendo.
    const referencia = (await ficha(personaje.id)).referencias?.[0];
    expect(referencia?.motivosMarcada).toContain("oscuridad");
  });

  test("una foto pequeña (p. ej. recortada) se rechaza sola, pero se guarda con «usar de todas formas»", async () => {
    const personaje = await nuevoPersonaje("Pequeña");
    const medio = await subir(await foto(3, 256), "mini.png");
    const sola = await anadir(personaje.id, [{ medioId: medio.id, vistaClave: "frontal" }]);
    expect(sola.status).toBe(422);
    const cuerpo = (await sola.json()) as { rechazos: { motivos: string[]; bloqueante: boolean }[] };
    expect(cuerpo.rechazos[0]?.motivos).toContain("resolucion");
    expect(cuerpo.rechazos[0]?.bloqueante).toBe(false);

    const forzada = await anadir(personaje.id, [{ medioId: medio.id, vistaClave: "frontal", usarDeTodasFormas: true }]);
    expect(forzada.status).toBe(200);
    const [fila] = await db().select().from(characterReferences).where(eq(characterReferences.mediaId, medio.id));
    // Queda guardada y señalada: su tarjeta y el control previo de generar lo siguen diciendo.
    expect(fila?.rejectionReason).toContain("resolucion");
  });

  test("la misma foto dos veces avisa de duplicado y no crea una segunda referencia", async () => {
    const personaje = await nuevoPersonaje("Duplicados");
    const primera = await subir(await foto(4), "una.png");
    expect((await anadir(personaje.id, [{ medioId: primera.id, vistaClave: "frontal" }])).status).toBe(200);

    // Otro medio distinto con la **misma** imagen: la restricción de unicidad no lo detectaría, la huella sí.
    const otraVez = await subir(await foto(4), "una-otra-vez.png");
    const repetida = await anadir(personaje.id, [{ medioId: otraVez.id, vistaClave: "perfil_izquierdo" }]);
    expect(repetida.status).toBe(422);
    const cuerpo = (await repetida.json()) as { error: string; rechazos: { motivos: string[] }[] };
    expect(cuerpo.rechazos[0]?.motivos).toContain("duplicada");
    expect(cuerpo.error).toContain("duplicada");

    // Y una casi idéntica (la misma foto un poco más clara) tampoco cuela, ni forzándola.
    const casiIgual = await subir(await foto(4, 640, 1.12), "casi-igual.png");
    const forzada = await anadir(personaje.id, [
      { medioId: casiIgual.id, vistaClave: "perfil_derecho", usarDeTodasFormas: true },
    ]);
    expect(forzada.status).toBe(422);
    expect((await ficha(personaje.id)).totalReferencias).toBe(1);
  });

  test("dos veces la misma foto en la misma petición tampoco crea dos referencias", async () => {
    const personaje = await nuevoPersonaje("Duplicados en tanda");
    const [a, b] = await Promise.all([subir(await foto(5), "a.png"), subir(await foto(5), "b.png")]);
    const respuesta = await anadir(personaje.id, [
      { medioId: a.id, vistaClave: "frontal" },
      { medioId: b.id, vistaClave: "perfil_izquierdo" },
    ]);
    // La primera entra y la segunda se descarta: la petición no falla, pero solo queda una.
    expect(respuesta.status).toBe(200);
    expect(((await respuesta.json()) as PersonajeVista).totalReferencias).toBe(1);
  });

  test("si entran unas fotos y otras no, la respuesta dice cuáles se han quedado fuera", async () => {
    const personaje = await nuevoPersonaje("Tanda mixta");
    const [buena, mala] = await Promise.all([subir(await foto(6), "buena.png"), subir(await borrosa(7), "mala.png")]);
    const respuesta = await anadir(personaje.id, [
      { medioId: buena.id, vistaClave: "frontal" },
      { medioId: mala.id, vistaClave: "perfil_izquierdo" },
    ]);
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as PersonajeVista & { rechazos?: { motivos: string[] }[] };
    expect(cuerpo.totalReferencias).toBe(1);
    // Y no en silencio: la respuesta lleva el motivo de la que no ha entrado.
    expect(cuerpo.rechazos?.[0]?.motivos).toEqual(["nitidez"]);
  });

  test("la cobertura dice exactamente qué vista falta, y es distinta en animales", async () => {
    const persona = await nuevoPersonaje("Cobertura persona");
    const fotos = await Promise.all([subir(await foto(10), "f1.png"), subir(await foto(11), "f2.png")]);
    await anadir(persona.id, [
      { medioId: fotos[0]?.id, vistaClave: "frontal" },
      { medioId: fotos[1]?.id, vistaClave: "cuerpo_completo" },
    ]);
    const conFotos = await ficha(persona.id);
    expect(conFotos.cobertura?.faltan).toEqual(["perfil_izquierdo", "perfil_derecho", "tres_cuartos"]);
    expect(conFotos.cobertura?.vistas.map((v) => v.vista)).toEqual([
      "frontal",
      "perfil_izquierdo",
      "perfil_derecho",
      "tres_cuartos",
      "cuerpo_completo",
    ]);

    const animal = await nuevoPersonaje("Cobertura animal", "animal");
    const delAnimal = await subir(await foto(12), "gato.png");
    await anadir(animal.id, [{ medioId: delAnimal.id, vistaClave: "perfil" }]);
    const fichaAnimal = await ficha(animal.id);
    expect(fichaAnimal.cobertura?.faltan).toEqual(["frontal", "cuerpo_completo"]);

    // Una foto sin vista cuenta para el mínimo, pero no cubre ninguna vista.
    const sinVista = await subir(await foto(13), "suelta.png");
    await anadir(animal.id, [{ medioId: sinVista.id }]);
    const despues = await ficha(animal.id);
    expect(despues.cobertura?.sinClasificar).toBe(1);
    expect(despues.cobertura?.faltan).toEqual(["frontal", "cuerpo_completo"]);
    expect(despues.totalReferencias).toBe(2);
  });

  test("una vista sintética nace etiquetada, no cuenta como foto original y su etiqueta llega al render", async () => {
    const personaje = await nuevoPersonaje("Con vista generada");
    const fotos = await Promise.all([
      subir(await foto(20), "p1.png"),
      subir(await foto(21), "p2.png"),
      subir(await foto(22), "p3.png"),
    ]);
    await anadir(
      personaje.id,
      fotos.map((f, i) => ({
        medioId: f.id,
        vistaClave: ["frontal", "perfil_izquierdo", "cuerpo_completo"][i],
      })),
    );
    const antes = await ficha(personaje.id);
    expect(antes.totalReferencias).toBe(3);
    expect(antes.puedeGenerar).toBe(true);

    // Por el servicio y no por la ruta: así el saldo del proveedor lo contesta el KIE simulado y **ningún
    // test llama a KIE de verdad**. La ruta se prueba justo debajo, en los casos que no llegan a hablar con
    // el proveedor.
    const pedida = await pedirVistaSintetica(
      actorAna,
      personaje.id,
      {
        vista: "perfil_derecho",
        creditosConfirmados: 4,
        derechos: true,
        sinTerceros: true,
        claveIdempotencia: crypto.randomUUID(),
      },
      h,
    );
    expect(pedida.nueva).toBe(true);
    expect(pedida.trabajo.personajeId).toBe(personaje.id);

    // El worker lo envía y lo cierra: el resultado entra en la ficha como vista generada.
    await pasadaDeCola(h);
    const despues = await ficha(personaje.id);
    const generada = despues.referencias?.find((r) => r.origen === "vista_generada");
    expect(generada).toBeDefined();
    expect(generada?.vistaClave).toBe("perfil_derecho");
    // **No** cuenta para el mínimo de fotos originales, y se cuenta aparte.
    expect(despues.totalReferencias).toBe(3);
    expect(despues.totalGeneradas).toBe(1);
    // Y no cubre la vista: la cobertura sigue diciendo que falta la foto de verdad.
    expect(despues.cobertura?.faltan).toContain("perfil_derecho");

    // La etiqueta viaja a la base de datos, a la API y al render de la interfaz.
    const [fila] = await db()
      .select()
      .from(characterReferences)
      .where(eq(characterReferences.mediaId, generada?.medio.id as string));
    expect(fila?.origin).toBe("vista_generada");
    const marca = renderToStaticMarkup(
      createElement(DistintivoOrigen, { origen: generada?.origen ?? "foto_original" }),
    );
    expect(marca).toContain("Vista generada");
    expect(renderToStaticMarkup(createElement(DistintivoOrigen, { origen: "foto_original" }))).toContain(
      "Foto original",
    );

    // Las medidas y la huella se guardan también en la vista generada: sin huella, generarla dos veces no se
    // detectaría como repetida, y sin medidas la ficha no podría decir con qué se guardó.
    expect(fila?.phash).not.toBeNull();
    expect(fila?.width).toBeGreaterThan(0);

    // **Pedir otra vez la misma vista que ya tiene su generada no vuelve a gastar** (con otra clave, así que no
    // es la idempotencia lo que lo para): la cobertura la ofrece una sola vez.
    const otraVez = await rutaVistaSintetica.POST(
      pedir(ana, `/api/personajes/${personaje.id}/vista-sintetica`, "POST", {
        vista: "perfil_derecho",
        creditosConfirmados: 4,
        derechos: true,
        sinTerceros: true,
        claveIdempotencia: crypto.randomUUID(),
      }),
      ctx(personaje.id),
    );
    expect(otraVez.status).toBe(409);
    expect((await otraVez.json()).error).toContain("vista generada");

    // Y una vista que **sí** tiene foto original se rechaza con su propio motivo, no con el de la generada.
    const conFoto = await rutaVistaSintetica.POST(
      pedir(ana, `/api/personajes/${personaje.id}/vista-sintetica`, "POST", {
        vista: "frontal",
        creditosConfirmados: 4,
        derechos: true,
        sinTerceros: true,
        claveIdempotencia: crypto.randomUUID(),
      }),
      ctx(personaje.id),
    );
    expect(conFoto.status).toBe(409);
    expect((await conFoto.json()).error).toContain("Ya tienes una foto");

    // Reañadir la vista generada desde la biblioteca **no la convierte en foto original**: se quita del
    // personaje y se vuelve a añadir como una foto más, y entra otra vez marcada como generada.
    const medioGenerado = generada?.medio.id as string;
    await quitarReferencias(actorAna, personaje.id, [generada?.id as string]);
    expect((await ficha(personaje.id)).totalGeneradas).toBe(0);
    const reanadida = await anadir(personaje.id, [{ medioId: medioGenerado, vistaClave: "frontal" }]);
    expect(reanadida.status).toBe(200);
    const despuesDeReanadir = await ficha(personaje.id);
    // Sigue habiendo tres originales, no cuatro.
    expect(despuesDeReanadir.totalReferencias).toBe(3);
    expect(despuesDeReanadir.totalGeneradas).toBe(1);
    const [reinsertada] = await db()
      .select()
      .from(characterReferences)
      .where(eq(characterReferences.mediaId, medioGenerado));
    expect(reinsertada?.origin).toBe("vista_generada");
    // Y conserva la vista que pidió el trabajo, no la que declaró el navegador.
    expect(reinsertada?.viewKey).toBe("perfil_derecho");
  });

  test("repetir la misma confirmación no encola un segundo trabajo ni cobra dos veces", async () => {
    const personaje = await nuevoPersonaje("Sin doble cobro");
    const fotos = await Promise.all([
      subir(await foto(40), "d1.png"),
      subir(await foto(41), "d2.png"),
      subir(await foto(42), "d3.png"),
    ]);
    await anadir(
      personaje.id,
      fotos.map((f, i) => ({ medioId: f.id, vistaClave: ["frontal", "perfil_izquierdo", "cuerpo_completo"][i] })),
    );

    const confirmacion = {
      vista: "tres_cuartos" as const,
      creditosConfirmados: 4,
      derechos: true,
      sinTerceros: true,
      // La misma confirmación, tal como la manda el navegador cuando se reintenta tras un fallo de red.
      claveIdempotencia: crypto.randomUUID(),
    };
    const primera = await pedirVistaSintetica(actorAna, personaje.id, confirmacion, h);
    const segunda = await pedirVistaSintetica(actorAna, personaje.id, confirmacion, h);
    expect(primera.nueva).toBe(true);
    expect(segunda.nueva).toBe(false);
    expect(segunda.trabajo.id).toBe(primera.trabajo.id);
    expect(segunda.vista).toBe("tres_cuartos");

    // Un solo trabajo en la base de datos: nada que el proveedor pueda cobrar dos veces.
    const trabajos = await db().select().from(generationJobs).where(eq(generationJobs.characterId, personaje.id));
    expect(trabajos).toHaveLength(1);

    // Y cuando el trabajo ya ha terminado, repetir la misma confirmación **sigue** devolviendo ese trabajo en
    // lugar de contestar «esa vista ya la tienes»: la idempotencia se comprueba antes que la cobertura.
    await pasadaDeCola(h);
    const tardia = await pedirVistaSintetica(actorAna, personaje.id, confirmacion, h);
    expect(tardia.nueva).toBe(false);
    expect(tardia.trabajo.id).toBe(primera.trabajo.id);
    expect(await db().select().from(generationJobs).where(eq(generationJobs.characterId, personaje.id))).toHaveLength(
      1,
    );
  });

  test("una foto con un lienzo inmenso no entra en la biblioteca ni se decodifica al medirla", async () => {
    // 50.000 × 50.000 px declarados en la cabecera y 66 bytes de archivo: decodificarlo pediría terabytes.
    const bomba = pngDeLienzo(50_000, 50_000);
    expect(bomba.byteLength).toBeLessThan(200);

    // Primera línea de defensa: la biblioteca no lo guarda, así que nunca llega a ser una referencia.
    await expect(subir(bomba, "lienzo.png")).rejects.toThrow(/no se ha podido leer la imagen/i);

    // Segunda línea, la de esta fase: medirlo **no lo decodifica** y tarda lo que tarda leer una cabecera.
    const empezado = Date.now();
    const analisis = await analizarImagen(bomba);
    expect(Date.now() - empezado).toBeLessThan(1000);
    expect(analisis.huella).toBeNull();

    // Y una imagen legible que pasa del tope de píxeles declara **su** motivo, no «foto pequeña».
    const grande = await analizarImagen(pngDeLienzo(9000, 9000));
    expect(grande.demasiadoGrande).toBe(true);
    expect(grande.metricas.ancho).toBe(9000);
    expect(grande.huella).toBeNull();
  });

  test("volver a añadir una foto que ya es referencia no falla: no hace nada", async () => {
    const personaje = await nuevoPersonaje("Reañadir");
    const medio = await subir(await foto(50), "una.png");
    expect((await anadir(personaje.id, [{ medioId: medio.id, vistaClave: "frontal" }])).status).toBe(200);
    // La misma petición otra vez: 200 y el mismo recuento, no un 422 por duplicado.
    const repetida = await anadir(personaje.id, [{ medioId: medio.id, vistaClave: "frontal" }]);
    expect(repetida.status).toBe(200);
    const cuerpo = (await repetida.json()) as PersonajeVista & { rechazos?: unknown[] };
    expect(cuerpo.totalReferencias).toBe(1);
    expect(cuerpo.rechazos).toBeUndefined();
  });

  test("una foto en la papelera no cubre su vista: la cobertura la sigue pidiendo", async () => {
    const personaje = await nuevoPersonaje("Con papelera");
    const medio = await subir(await foto(60), "a-la-papelera.png");
    await anadir(personaje.id, [{ medioId: medio.id, vistaClave: "tres_cuartos" }]);
    expect((await ficha(personaje.id)).cobertura?.faltan).not.toContain("tres_cuartos");

    await enviarAPapelera(actorAna, medio.id);
    // La ficha y la cobertura que decide la vista sintética dicen lo mismo: falta.
    expect((await ficha(personaje.id)).cobertura?.faltan).toContain("tres_cuartos");
    expect((await coberturaDe(personaje.id, "persona")).faltan).toContain("tres_cuartos");
  });

  test("se guardan todos los motivos por los que se marcó una foto, no solo el primero", async () => {
    const personaje = await nuevoPersonaje("Varios motivos");
    // Borrosa **y** oscura a la vez: los dos motivos tienen que quedar escritos.
    const datos = bytes(
      await sharp(await foto(70))
        .blur(12)
        .linear(0.5, -40)
        .png()
        .toBuffer(),
    );
    const medio = await subir(datos, "borrosa-y-oscura.png");
    const rechazada = await anadir(personaje.id, [{ medioId: medio.id, vistaClave: "frontal" }]);
    expect(rechazada.status).toBe(422);
    expect(((await rechazada.json()) as { rechazos: { motivos: string[] }[] }).rechazos[0]?.motivos).toEqual([
      "nitidez",
      "oscuridad",
    ]);

    const forzada = await anadir(personaje.id, [{ medioId: medio.id, vistaClave: "frontal", usarDeTodasFormas: true }]);
    expect(forzada.status).toBe(200);
    const [fila] = await db().select().from(characterReferences).where(eq(characterReferences.mediaId, medio.id));
    expect(fila?.rejectionReason).toBe("nitidez,oscuridad");
    const referencia = (await ficha(personaje.id)).referencias?.[0];
    expect(referencia?.motivosMarcada).toEqual(["nitidez", "oscuridad"]);
  });

  test("una vista sintética pasa por las mismas puertas que «Crear»", async () => {
    const personaje = await nuevoPersonaje("Sin consentimiento", "persona", false);
    const cuerpo = {
      vista: "frontal",
      creditosConfirmados: 4,
      derechos: true,
      sinTerceros: true,
      claveIdempotencia: crypto.randomUUID(),
    };
    // Sin consentimiento vigente no sale nada.
    const sinConsentimiento = await rutaVistaSintetica.POST(
      pedir(ana, `/api/personajes/${personaje.id}/vista-sintetica`, "POST", cuerpo),
      ctx(personaje.id),
    );
    expect(sinConsentimiento.status).toBe(409);

    const conConsentimiento = await nuevoPersonaje("Con puertas");
    // Sin la revisión de referencias (ADR-0009) tampoco.
    const sinRevisar = await rutaVistaSintetica.POST(
      pedir(ana, `/api/personajes/${conConsentimiento.id}/vista-sintetica`, "POST", {
        ...cuerpo,
        sinTerceros: false,
        claveIdempotencia: crypto.randomUUID(),
      }),
      ctx(conConsentimiento.id),
    );
    expect(sinRevisar.status).toBe(400);
    expect((await sinRevisar.json()).error).toContain("ninguna otra persona ni ningún menor");

    // Y con un coste distinto del que se mostró, se rechaza.
    const otroCoste = await rutaVistaSintetica.POST(
      pedir(ana, `/api/personajes/${conConsentimiento.id}/vista-sintetica`, "POST", {
        ...cuerpo,
        creditosConfirmados: 1,
        claveIdempotencia: crypto.randomUUID(),
      }),
      ctx(conConsentimiento.id),
    );
    expect(otroCoste.status).toBe(409);

    // Una vista que no existe no se acepta, y una petición sin `Origin` no cambia nada.
    const vistaInventada = await rutaVistaSintetica.POST(
      pedir(ana, `/api/personajes/${conConsentimiento.id}/vista-sintetica`, "POST", {
        ...cuerpo,
        vista: "desde-arriba",
        claveIdempotencia: crypto.randomUUID(),
      }),
      ctx(conConsentimiento.id),
    );
    expect(vistaInventada.status).toBe(400);
    const sinOrigen = await rutaVistaSintetica.POST(
      new Request(`http://localhost/api/personajes/${conConsentimiento.id}/vista-sintetica`, {
        method: "POST",
        headers: { cookie: ana.cookie, "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      }),
      ctx(conConsentimiento.id),
    );
    expect(sinOrigen.status).toBe(403);
  });

  test("la vista que llega del navegador se valida: ni vistas inventadas ni medidas absurdas", async () => {
    const personaje = await nuevoPersonaje("Datos del navegador");
    const medio = await subir(await foto(30), "buena.png");
    const vistaMala = await anadir(personaje.id, [{ medioId: medio.id, vistaClave: "de-espaldas" }]);
    expect(vistaMala.status).toBe(400);
    const caraMala = await anadir(personaje.id, [{ medioId: medio.id, vistaClave: "frontal", caraRelativa: 42 }]);
    expect(caraMala.status).toBe(400);
    expect((await ficha(personaje.id)).totalReferencias).toBe(0);
  });

  test("decir qué vista es una foto que ya está en el personaje la hace contar en la cobertura", async () => {
    const personaje = await nuevoPersonaje("Fotos sin clasificar");
    const fotos = await Promise.all([subir(await foto(50), "s1.png"), subir(await foto(51), "s2.png")]);
    // Como se suben desde la biblioteca: sin vista, que es justo el caso que dejaba la cobertura pidiendo
    // fotos que el usuario ya tenía.
    expect(
      (
        await anadir(
          personaje.id,
          fotos.map((f) => ({ medioId: f.id })),
        )
      ).status,
    ).toBe(200);
    const sinClasificar = await ficha(personaje.id);
    expect(sinClasificar.cobertura?.sinClasificar).toBe(2);
    expect(sinClasificar.cobertura?.faltan).toContain("frontal");
    const referencias = sinClasificar.referencias ?? [];
    const primera = referencias[0]?.id as string;
    const segunda = referencias[1]?.id as string;

    const versiones = async (): Promise<number> =>
      (await db().select().from(characterVersions).where(eq(characterVersions.characterId, personaje.id))).length;
    const antesDeClasificar = await versiones();

    // Asignar: la vista cuenta en la cobertura y crea versión, porque cambia qué fotos se envían al proveedor.
    const asignada = await vistas(personaje.id, [{ id: primera, vistaClave: "frontal" }]);
    expect(asignada.status).toBe(200);
    const conFrontal = (await asignada.json()) as PersonajeVista;
    expect(conFrontal.cobertura?.faltan).not.toContain("frontal");
    expect(conFrontal.cobertura?.sinClasificar).toBe(1);
    expect(conFrontal.referencias?.find((r) => r.id === primera)?.vistaClave).toBe("frontal");
    expect(await versiones()).toBe(antesDeClasificar + 1);
    const [vigente] = await db()
      .select()
      .from(characterVersions)
      .where(eq(characterVersions.characterId, personaje.id))
      .orderBy(desc(characterVersions.number))
      .limit(1);
    expect(vigente?.changedFields).toEqual(["vistas"]);

    // La misma vista otra vez no cambia nada: no se gasta un número de versión.
    expect((await vistas(personaje.id, [{ id: primera, vistaClave: "frontal" }])).status).toBe(200);
    expect(await versiones()).toBe(antesDeClasificar + 1);

    // Cambiarla: la vista anterior vuelve a faltar y la nueva queda cubierta.
    const cambiada = await vistas(personaje.id, [{ id: primera, vistaClave: "tres_cuartos" }]);
    expect(cambiada.status).toBe(200);
    const conTresCuartos = (await cambiada.json()) as PersonajeVista;
    expect(conTresCuartos.cobertura?.faltan).toContain("frontal");
    expect(conTresCuartos.cobertura?.faltan).not.toContain("tres_cuartos");
    expect(await versiones()).toBe(antesDeClasificar + 2);

    // Quitarla: vuelve a estar sin clasificar, y también versiona.
    const quitada = await vistas(personaje.id, [{ id: primera, vistaClave: null }]);
    expect(quitada.status).toBe(200);
    expect(((await quitada.json()) as PersonajeVista).cobertura?.sinClasificar).toBe(2);
    expect(await versiones()).toBe(antesDeClasificar + 3);

    // Dos de una vez, y con una vista inventada no se guarda ninguna.
    expect((await vistas(personaje.id, [{ id: primera, vistaClave: "de-espaldas" }])).status).toBe(400);
    const dos = await vistas(personaje.id, [
      { id: primera, vistaClave: "frontal" },
      { id: segunda, vistaClave: "perfil_izquierdo" },
    ]);
    expect(dos.status).toBe(200);
    expect(((await dos.json()) as PersonajeVista).cobertura?.sinClasificar).toBe(0);
  });

  test("la vista de un personaje ajeno responde 404, y la de una vista generada no se cambia", async () => {
    const personaje = await nuevoPersonaje("Vista generada intocable");
    const fotos = await Promise.all([
      subir(await foto(60), "g1.png"),
      subir(await foto(61), "g2.png"),
      subir(await foto(62), "g3.png"),
    ]);
    await anadir(
      personaje.id,
      fotos.map((f, i) => ({ medioId: f.id, vistaClave: ["frontal", "perfil_izquierdo", "cuerpo_completo"][i] })),
    );
    const propia = (await ficha(personaje.id)).referencias?.[0]?.id as string;

    // Ajeno: 404, y no dice ni que el personaje existe.
    const bea = await crearSesionDePrueba("user");
    try {
      const ajena = await rutaReferencias.PATCH(
        pedir(bea, `/api/personajes/${personaje.id}/referencias`, "PATCH", {
          vistas: [{ id: propia, vistaClave: "perfil_derecho" }],
        }),
        ctx(personaje.id),
      );
      expect(ajena.status).toBe(404);
    } finally {
      await db().delete(users).where(eq(users.email, bea.email));
    }

    // La vista generada lleva la que pidió su trabajo: no se cambia.
    await pedirVistaSintetica(
      actorAna,
      personaje.id,
      {
        vista: "perfil_derecho",
        creditosConfirmados: 4,
        derechos: true,
        sinTerceros: true,
        claveIdempotencia: crypto.randomUUID(),
      },
      h,
    );
    await pasadaDeCola(h);
    const generada = (await ficha(personaje.id)).referencias?.find((r) => r.origen === "vista_generada");
    expect(generada?.vistaClave).toBe("perfil_derecho");
    const negada = await vistas(personaje.id, [{ id: generada?.id as string, vistaClave: "frontal" }]);
    expect(negada.status).toBe(400);
    expect((await negada.json()).error).toContain("vista generada");
    const [sigueIgual] = await db()
      .select()
      .from(characterReferences)
      .where(eq(characterReferences.id, generada?.id as string));
    expect(sigueIgual?.viewKey).toBe("perfil_derecho");
  });

  test("una imagen generada sin vista sí se puede clasificar, y sigue sin contar como foto", async () => {
    const personaje = await nuevoPersonaje("Generada sin vista");
    const medio = await subir(await foto(70), "de-crear.png");
    expect((await anadir(personaje.id, [{ medioId: medio.id }])).status).toBe(200);
    const referencia = (await ficha(personaje.id)).referencias?.[0];

    // Así queda una imagen que salió de un trabajo que **no era** «generar una vista» (uno de «Crear», por
    // ejemplo) y que se añade después desde la biblioteca: marcada como generada y sin vista ninguna. Hasta la
    // 0.20.2 no había salida: la cobertura la contaba como sin clasificar, decir qué vista era se rechazaba y la
    // única forma de quitarla de en medio era borrarla.
    await db()
      .update(characterReferences)
      .set({ origin: "vista_generada", viewKey: "" })
      .where(eq(characterReferences.id, referencia?.id as string));

    const sinVista = await ficha(personaje.id);
    expect(sinVista.totalGeneradas).toBe(1);
    expect(sinVista.cobertura?.sinClasificar).toBe(1);

    const clasificada = await vistas(personaje.id, [{ id: referencia?.id as string, vistaClave: "frontal" }]);
    expect(clasificada.status).toBe(200);
    const [fila] = await db()
      .select()
      .from(characterReferences)
      .where(eq(characterReferences.id, referencia?.id as string));
    expect(fila?.viewKey).toBe("frontal");
    // Clasificarla no la convierte en una foto del personaje: sigue siendo generada, no cuenta para el mínimo y
    // no cubre la vista.
    expect(fila?.origin).toBe("vista_generada");
    const despues = await ficha(personaje.id);
    expect(despues.totalReferencias).toBe(0);
    expect(despues.totalGeneradas).toBe(1);
    expect(despues.cobertura?.faltan).toContain("frontal");
    expect(despues.cobertura?.sinClasificar).toBe(0);

    // Y en cuanto tiene vista, vuelve a ser intocable: la que se pidió (o la que se le puso) no se cambia sola.
    const negada = await vistas(personaje.id, [{ id: referencia?.id as string, vistaClave: "tres_cuartos" }]);
    expect(negada.status).toBe(400);
    expect((await negada.json()).error).toContain("vista generada");
  });
});
