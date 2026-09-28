import { beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { PersonajeVista } from "@/lib/personajes";

/**
 * **La hoja 3×3 y la extracción 6C, de punta a punta**, contra el PostgreSQL y el SeaweedFS locales.
 *
 * Existe porque la primera versión de estas dos pantallas se veía bien y **no funcionaba**: la hoja respondía
 * 400 siempre (faltaba la declaración de terceros) y, aunque no lo hubiera hecho, el resultado no se guardaba
 * nunca en el personaje. Una pantalla que se ve bien no basta.
 *
 * **Ningún test llama a KIE ni a ningún servicio de percepción**: el proveedor se simula con un `fetch` propio
 * por los puntos de inyección que ya existen, y la percepción con su `buscar` de `HERRAMIENTAS_PERCEPCION`.
 * Nada sale a internet y la clave es inventada.
 *
 * Lo que comprueba:
 *
 * - pedir la hoja con su confirmación de coste → la cola la despacha → el resultado queda guardado como hoja
 *   del personaje, en estado `candidata` → se ve en la ficha → se puede ascender o descartar;
 * - la hoja **nunca se genera desde sí misma**, ni siquiera cuando ya es la referencia por defecto;
 * - la extracción respeta la puerta de consentimiento: con personaje real sin declaración no se envía nada,
 *   con declaración sí, y con una foto suelta hace falta la confirmación expresa del usuario.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_hoja_identidad");
}

const { eq } = await import("drizzle-orm");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaPersonaje = await import("@/app/api/personajes/[id]/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const rutaHoja = await import("@/app/api/personajes/[id]/hoja-identidad/route");
const rutaExtraer = await import("@/app/api/direccion/extraer/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characters, consentRecords, generationJobs, media } = await import("../db/esquema");
const { guardarCredencial } = await import("../boveda/credenciales");
const { crearMedio } = await import("../media/servicio");
const { enviarEncolados, pasadaDeCola } = await import("../cola/pasada");
const { HERRAMIENTAS_PERCEPCION } = await import("../coherencia/percepcion");
const { esTrabajoDeHoja } = await import("../personajes/hoja-identidad");
const { guardarCompatible } = await import("../boveda/compatibles");
const fixturesCompatibles = await import("../proveedores/compatible/fixtures");
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type Actor = import("../media/servicio").Actor;

const CLAVE = "sk-clave-de-kie-inventada-para-la-hoja";

// ── Proveedor simulado ───────────────────────────────────────────────────────────────────────────────────

let siguienteTarea = 0;
const prompts: string[] = [];
const referenciasSubidas: string[] = [];

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url, opciones) => {
  if (url.includes("/chat/credit")) return sobre(5000);
  if (url.includes("file-stream-upload")) {
    referenciasSubidas.push(url);
    return sobre({ downloadUrl: `https://tempfile.kie.ai/ref-${referenciasSubidas.length}.png` });
  }
  if (url.includes("createTask")) {
    // Se guarda el prompt que de verdad se envió: es lo que prueba que la hoja pide las nueve casillas.
    const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { input?: { prompt?: string } };
    prompts.push(cuerpo.input?.prompt ?? "");
    // Identificador único por ejecución: la base de prueba no se vacía entre pasadas y `task_id` es único.
    return sobre({ taskId: `task_${++siguienteTarea}_${randomBytes(6).toString("hex")}` });
  }
  if (url.includes("recordInfo")) {
    return sobre({
      state: "success",
      resultJson: JSON.stringify({ resultUrls: ["https://tempfile.kie.ai/hoja.png"] }),
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

async function fotoDeReferencia(): Promise<Uint8Array<ArrayBuffer>> {
  return bytes(
    await sharp({
      create: {
        width: 640,
        height: 640,
        channels: 3,
        background: "#808080",
        noise: { type: "gaussian", mean: 128, sigma: 40 },
      },
    })
      .png()
      .toBuffer(),
  );
}

const descargar: Herramientas["descargar"] = async (url) => ({
  archivo: new File(
    [
      bytes(
        await sharp({ create: { width: 96, height: 96, channels: 3, background: "#c33" } })
          .png()
          .toBuffer(),
      ),
    ],
    "hoja.png",
    {
      type: "image/png",
    },
  ),
  origen: url,
});

const h: Herramientas = { buscar, descargar };

/** Percepción simulada: contesta con las cuatro líneas que pide la instrucción, sin salir a ningún sitio. */
const percepcionSimulada: Buscador = async (url) => {
  if (url.endsWith("/models")) return fixturesCompatibles.respuestaGrabada(fixturesCompatibles.MODELOS_200);
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content:
              "CAMERA: Medium close-up at eye level.\nWARDROBE: A beige knit jumper.\nCONTEXT: A home kitchen.\nLIGHT: Soft window light.",
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

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

describe.skipIf(!hayBaseDeDatos)("hoja de identidad 3×3 y extracción 6C, de punta a punta", () => {
  let ana: Sesion;
  let actorAna: Actor;

  const ficha = async (id: string): Promise<PersonajeVista> =>
    (await (await rutaPersonaje.GET(pedir(ana, `/api/personajes/${id}`), ctx(id))).json()) as PersonajeVista;

  /** Personaje de Ana con tres fotos y su consentimiento, que es lo mínimo para poder generar. */
  async function nuevoPersonaje(nombre: string, conConsentimiento = true): Promise<PersonajeVista> {
    const creado = (await (
      await rutaPersonajes.POST(pedir(ana, "/api/personajes", "POST", { nombre, tipo: "persona" }), undefined)
    ).json()) as PersonajeVista;
    const ids = await Promise.all(
      Array.from({ length: 3 }, async (_, i) => {
        const medio = await crearMedio(
          actorAna,
          new File([await fotoDeReferencia()], `${nombre}-${i}.png`, { type: "image/png" }),
        );
        return medio.id;
      }),
    );
    await rutaReferencias.POST(
      pedir(ana, `/api/personajes/${creado.id}/referencias`, "POST", {
        referencias: ids.map((medioId) => ({ medioId })),
      }),
      ctx(creado.id),
    );
    if (conConsentimiento) {
      await rutaConsentimiento.POST(
        pedir(ana, `/api/personajes/${creado.id}/consentimiento`, "POST", {
          titular: "yo",
          mayoriaDeEdad: true,
          alcance: "personal",
        }),
        ctx(creado.id),
      );
    }
    return ficha(creado.id);
  }

  const confirmacionDeHoja = (extra: Record<string, unknown> = {}) => ({
    creditosConfirmados: 4,
    derechos: true,
    sinTerceros: true,
    claveIdempotencia: crypto.randomUUID(),
    ...extra,
  });

  /** Despacha lo encolado con el proveedor simulado, hasta que el trabajo queda cerrado. */
  async function despachar(): Promise<void> {
    await enviarEncolados(h);
    await pasadaDeCola(h);
  }

  beforeAll(async () => {
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    actorAna = { id: ana.id, esAdmin: false };
    const guardada = await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    expect(guardada.ok).toBe(true);
    // Servicio compatible simulado: es con lo que se percibe, y se paga por cuota del plan (0 créditos).
    await guardarCompatible(
      ana.id,
      {
        nombre: "Servicio de prueba",
        urlBase: "https://api.ejemplo.test/v1",
        clave: "sk-compatible-inventada-1234",
        modelos: ["gemma4"],
        soloCuota: true,
      },
      percepcionSimulada,
    );
  });

  test("pedir la hoja sin la declaración de terceros se rechaza diciendo qué falta", async () => {
    const personaje = await nuevoPersonaje("Sin terceros");
    const respuesta = await rutaHoja.POST(
      pedir(ana, `/api/personajes/${personaje.id}/hoja-identidad`, "POST", confirmacionDeHoja({ sinTerceros: false })),
      ctx(personaje.id),
    );
    // Esto es exactamente lo que estaba roto: respondía 400 siempre porque la casilla no existía.
    expect(respuesta.status).toBe(400);
    expect(((await respuesta.json()) as { error: string }).error).toContain("ninguna otra persona");
  });

  test("la hoja se pide, la cola la despacha y queda guardada como hoja candidata del personaje", async () => {
    const personaje = await nuevoPersonaje("Con hoja");
    expect(personaje.hojaIdentidad).toBeNull();

    const respuesta = await rutaHoja.POST(
      pedir(ana, `/api/personajes/${personaje.id}/hoja-identidad`, "POST", confirmacionDeHoja()),
      ctx(personaje.id),
    );
    expect(respuesta.status).toBe(201);

    // El trabajo va marcado como hoja: es lo que hace que su resultado se guarde donde toca.
    const [trabajo] = await db()
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.characterId, personaje.id))
      .limit(1);
    if (!trabajo) throw new Error("No se encoló ningún trabajo.");
    expect(esTrabajoDeHoja(trabajo)).toBe(true);

    await despachar();

    // Y lo que importa: la ficha ya tiene su hoja, candidata y sin la prueba activada.
    const conHoja = await ficha(personaje.id);
    expect(conHoja.hojaIdentidad).not.toBeNull();
    expect(conHoja.hojaIdentidad?.estado).toBe("candidata");
    expect(conHoja.probarHojaIdentidad).toBe(false);

    // El prompt que se envió pide las nueve casillas, no «nueve retratos» a secas.
    expect(prompts.at(-1)).toContain("3 by 3 grid of 9 portraits");
  });

  test("con la hoja ya guardada se puede activar la prueba, ascenderla y descartarla", async () => {
    const personaje = await nuevoPersonaje("Estados");
    await rutaHoja.POST(
      pedir(ana, `/api/personajes/${personaje.id}/hoja-identidad`, "POST", confirmacionDeHoja()),
      ctx(personaje.id),
    );
    await despachar();

    // Activar la prueba: antes de tener hoja esto respondía 409, que era el síntoma de que nada se guardaba.
    const conPrueba = await rutaPersonaje.PATCH(
      pedir(ana, `/api/personajes/${personaje.id}`, "PATCH", { probarHojaIdentidad: true }),
      ctx(personaje.id),
    );
    expect(conPrueba.status).toBe(200);
    expect(((await conPrueba.json()) as PersonajeVista).probarHojaIdentidad).toBe(true);

    // Ascenderla apaga la prueba: si ya es la referencia de todo, repartir la mitad no mediría nada.
    const ascendida = (await (
      await rutaHoja.PATCH(
        pedir(ana, `/api/personajes/${personaje.id}/hoja-identidad`, "PATCH", { estado: "por_defecto" }),
        ctx(personaje.id),
      )
    ).json()) as PersonajeVista;
    expect(ascendida.hojaIdentidad?.estado).toBe("por_defecto");
    expect(ascendida.probarHojaIdentidad).toBe(false);

    const descartada = (await (
      await rutaHoja.PATCH(
        pedir(ana, `/api/personajes/${personaje.id}/hoja-identidad`, "PATCH", { estado: "descartada" }),
        ctx(personaje.id),
      )
    ).json()) as PersonajeVista;
    expect(descartada.hojaIdentidad?.estado).toBe("descartada");
  });

  test("regenerar la hoja no la usa como referencia de sí misma, ni siendo la de por defecto", async () => {
    const personaje = await nuevoPersonaje("Regenerar");
    await rutaHoja.POST(
      pedir(ana, `/api/personajes/${personaje.id}/hoja-identidad`, "POST", confirmacionDeHoja()),
      ctx(personaje.id),
    );
    await despachar();
    await rutaHoja.PATCH(
      pedir(ana, `/api/personajes/${personaje.id}/hoja-identidad`, "PATCH", { estado: "por_defecto" }),
      ctx(personaje.id),
    );

    const antes = referenciasSubidas.length;
    await rutaHoja.POST(
      pedir(ana, `/api/personajes/${personaje.id}/hoja-identidad`, "POST", confirmacionDeHoja()),
      ctx(personaje.id),
    );
    await despachar();

    // Con la hoja por defecto, cualquier otra generación usaría **una** referencia (la hoja). La hoja usa las
    // tres fotos: se compone siempre desde ellas, o sería una copia de una copia.
    expect(referenciasSubidas.length - antes).toBe(3);
    const trabajos = await db().select().from(generationJobs).where(eq(generationJobs.characterId, personaje.id));
    for (const trabajo of trabajos) expect(trabajo.identityReferenceKind).toBe("vistas");
  });

  // ── Extracción 6C ──────────────────────────────────────────────────────────────────────────────────────

  test("una foto suelta no se envía sin la confirmación expresa del usuario", async () => {
    const suelta = await crearMedio(
      actorAna,
      new File([await fotoDeReferencia()], "suelta.png", { type: "image/png" }),
    );
    const respuesta = await rutaExtraer.POST(
      pedir(ana, "/api/direccion/extraer", "POST", { medioId: suelta.id }),
      undefined,
    );
    expect(respuesta.status).toBe(409);
    expect(((await respuesta.json()) as { error: string }).error).toContain("Confirma que quieres enviarla");
  });

  test("la foto de un personaje real sin declaración de coherencia no se envía, y se dice cómo arreglarlo", async () => {
    const personaje = await nuevoPersonaje("Sin declarar");
    const [referencia] = await db()
      .select({ id: media.id })
      .from(media)
      .where(eq(media.ownerId, ana.id))
      .orderBy(media.createdAt)
      .limit(1);
    if (!referencia) throw new Error("Sin foto de referencia.");
    // Se usa una foto que es referencia de ese personaje.
    const suya = await db().select({ id: media.id }).from(media).where(eq(media.ownerId, ana.id));
    expect(suya.length).toBeGreaterThan(0);

    const respuesta = await rutaExtraer.POST(
      pedir(ana, "/api/direccion/extraer", "POST", { medioId: (await fotosDe(personaje.id))[0], confirmoEnvio: true }),
      undefined,
    );
    expect(respuesta.status).toBe(409);
    const { error } = (await respuesta.json()) as { error: string };
    expect(error).toContain("consentimiento");
  });

  test("con la declaración de coherencia sí se leen los campos, y vienen revisables", async () => {
    const personaje = await nuevoPersonaje("Declarado");
    await db()
      .update(consentRecords)
      .set({ coherenceDeclared: true })
      .where(eq(consentRecords.characterId, personaje.id));

    HERRAMIENTAS_PERCEPCION.buscar = percepcionSimulada;
    try {
      const respuesta = await rutaExtraer.POST(
        pedir(ana, "/api/direccion/extraer", "POST", { medioId: (await fotosDe(personaje.id))[0] }),
        undefined,
      );
      expect(respuesta.status).toBe(200);
      const datos = (await respuesta.json()) as {
        campos: Record<string, string>;
        confirmada: boolean;
        aviso: string;
      };
      expect(datos.campos.camara).toContain("Medium close-up");
      expect(datos.campos.ropa).toContain("beige knit jumper");
      // No se genera nada: sale sin confirmar y el usuario decide.
      expect(datos.confirmada).toBe(false);
      // Y no vuelve nada de la identidad de nadie.
      expect(Object.keys(datos.campos).sort()).toEqual(["camara", "contexto", "luz", "ropa"]);
    } finally {
      HERRAMIENTAS_PERCEPCION.buscar = undefined;
    }
  });

  test("de un vídeo no se leen campos: se dice por qué en vez de reventar con un 500", async () => {
    // La fila se inserta directa: lo que se comprueba es la puerta por tipo, no la subida de un vídeo real.
    const [video] = await db()
      .insert(media)
      .values([
        {
          ownerId: ana.id,
          kind: "video",
          storageKey: `pruebas/clip-${randomBytes(6).toString("hex")}.mp4`,
          mimeType: "video/mp4",
          sizeBytes: 1024,
          originalName: "clip.mp4",
        },
      ])
      .returning({ id: media.id });
    if (!video) throw new Error("No se pudo crear el medio de prueba.");
    const respuesta = await rutaExtraer.POST(
      pedir(ana, "/api/direccion/extraer", "POST", { medioId: video.id, confirmoEnvio: true }),
      undefined,
    );
    expect(respuesta.status).toBe(400);
    expect(((await respuesta.json()) as { error: string }).error).toContain("no es una imagen");
  });

  /** Identificadores de las fotos de referencia de ese personaje, en orden. */
  async function fotosDe(personajeId: string): Promise<string[]> {
    const { characterReferences } = await import("../db/esquema");
    const filas = await db()
      .select({ id: characterReferences.mediaId })
      .from(characterReferences)
      .where(eq(characterReferences.characterId, personajeId));
    return filas.map((f) => f.id);
  }
});
