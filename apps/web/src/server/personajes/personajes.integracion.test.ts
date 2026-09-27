import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { Medio } from "@/lib/media/tipos";
import type { PersonajeVista } from "@/lib/personajes";

/**
 * Personajes y consentimiento contra el PostgreSQL y el SeaweedFS locales (`bun run services:up`).
 *
 * **Ningún test llama a KIE**: el proveedor se simula con un `fetch` propio y la descarga del resultado
 * también, así que nada sale a internet y la clave que se usa es inventada.
 *
 * Lo que comprueba, una por una, las reglas duras de 0.13.0:
 *
 * - sin consentimiento vigente no se puede encolar nada con el personaje;
 * - revocar bloquea las generaciones nuevas al momento;
 * - un consentimiento de tercero no habilita nada hasta que un administrador lo acepta;
 * - borrar el personaje borra sus filas **y sus objetos en el almacenamiento**, sin dejar derivados;
 * - un personaje ajeno responde 404 en todo, y el admin lo ve pero no lo edita;
 * - un medio usado como referencia avisa antes de borrarse para siempre.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_personajes");
}

const { eq } = await import("drizzle-orm");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaPersonaje = await import("@/app/api/personajes/[id]/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const rutaRevision = await import("@/app/api/personajes/[id]/revision/route");
const rutaMedio = await import("@/app/api/media/[id]/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characterReferences, characters, consentRecords, generationJobs, media, users } = await import("../db/esquema");
const { guardarCredencial } = await import("../boveda/credenciales");
const { crearMedio } = await import("../media/servicio");
const { leerObjeto } = await import("../almacenamiento");
const { crearFotograma } = await import("../generacion/servicio");
const { enviarEncolados, pasadaDeCola } = await import("../cola/pasada");
const { obtenerTrabajo } = await import("../generacion/trabajos");
const { pendientesDeRevision } = await import("./consulta");
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type Actor = import("../media/servicio").Actor;

const CLAVE = "sk-ana-clave-de-kie-inventada-aaaa";
const ESCENA = "En una cafetería luminosa, saluda a cámara con una sonrisa.";
/** Referencias que admite el modelo predeterminado de `image_edit` en el catálogo sembrado. */
const MAXIMO_DEL_MODELO = 10;

// ── Proveedor simulado ───────────────────────────────────────────────────────────────────────────────────

let subidas = 0;
let siguienteTarea = 0;
const tareas = new Map<string, { state: string; urls?: string[]; creditos?: number }>();

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url) => {
  if (url.includes("/chat/credit")) return sobre(5000);
  if (url.includes("file-stream-upload")) {
    subidas++;
    return sobre({ downloadUrl: `https://tempfile.kie.ai/referencia-${subidas}.png` });
  }
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

function bytes(datos: Uint8Array): Uint8Array<ArrayBuffer> {
  const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
  copia.set(datos);
  return copia;
}

/** PNG pequeño reutilizable para los documentos de prueba. */
let pngDocumento: Uint8Array<ArrayBuffer> | null = null;
const nada = () => pngDocumento as Uint8Array<ArrayBuffer>;

async function png(color = "#3d6bff"): Promise<Uint8Array<ArrayBuffer>> {
  return bytes(
    await sharp({ create: { width: 64, height: 64, channels: 3, background: color } })
      .png()
      .toBuffer(),
  );
}

const descargar: Herramientas["descargar"] = async (url) => ({
  archivo: new File([await png("#ff5a5f")], "fotograma.png", { type: "image/png" }),
  origen: url,
});

const h: Herramientas = { buscar, descargar };

// ── Utilidades de petición ───────────────────────────────────────────────────────────────────────────────

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Petición desde la propia aplicación: las rutas que cambian datos exigen `Origin` del mismo sitio. */
const pedir = (s: Sesion, url: string, metodo = "GET", cuerpo?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: metodo,
    headers: {
      cookie: s.cookie,
      ...(metodo === "GET" ? {} : { origin: "http://localhost", "Content-Type": "application/json" }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

/** Igual, pero sin la cabecera `Origin`: es lo que hace un formulario de otra web. */
const pedirSinOrigen = (s: Sesion, url: string, metodo: string, cuerpo?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: metodo,
    headers: { cookie: s.cookie, "Content-Type": "application/json" },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

describe.skipIf(!hayBaseDeDatos)("personajes y consentimiento", () => {
  let ana: Sesion;
  let beto: Sesion;
  let admin: Sesion;
  let actorAna: Actor;
  let fotos: Medio[];

  /** Crea un personaje de Ana con `cuantas` fotos nuevas y, si se pide, su consentimiento propio. */
  async function nuevoPersonaje(nombre: string, cuantas = 3, conConsentimiento = true): Promise<PersonajeVista> {
    const respuesta = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", { nombre, tipo: "persona" }),
      undefined,
    );
    expect(respuesta.status).toBe(201);
    const personaje = (await respuesta.json()) as PersonajeVista;
    if (cuantas > 0) {
      const ids = await Promise.all(
        Array.from({ length: cuantas }, async (_, i) => {
          const medio = await crearMedio(
            actorAna,
            new File([await png(`#${(i + 3).toString(16).repeat(6)}`.slice(0, 7))], `${nombre}-${i}.png`, {
              type: "image/png",
            }),
          );
          return medio.id;
        }),
      );
      const conFotos = await rutaReferencias.POST(
        pedir(ana, `/api/personajes/${personaje.id}/referencias`, "POST", {
          referencias: ids.map((medioId) => ({ medioId })),
        }),
        ctx(personaje.id),
      );
      expect(conFotos.status).toBe(200);
    }
    if (!conConsentimiento) return obtenerFicha(personaje.id);
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

  const obtenerFicha = async (id: string, sesion: Sesion = ana): Promise<PersonajeVista> =>
    (await (await rutaPersonaje.GET(pedir(sesion, `/api/personajes/${id}`), ctx(id))).json()) as PersonajeVista;

  /** Documento de consentimiento, subido **como documento**: es lo único que el servidor acepta como tal. */
  const documentoDePrueba = (nombre: string) =>
    crearMedio(actorAna, new File([nada()], nombre, { type: "image/png" }), {}, ["imagen"], null, {
      documento: true,
    });

  /** Confirmación de un fotograma con personaje, como la manda «Crear». */
  const confirmacion = (personajeId: string, extra: Record<string, unknown> = {}) => ({
    personajeId,
    sinTerceros: true,
    prompt: ESCENA,
    creditosConfirmados: 4,
    derechos: true,
    claveIdempotencia: crypto.randomUUID(),
    ...extra,
  });

  beforeAll(async () => {
    await aplicarMigraciones();
    [ana, beto, admin] = await Promise.all([
      crearSesionDePrueba("user"),
      crearSesionDePrueba("user"),
      crearSesionDePrueba("admin"),
    ]);
    actorAna = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    pngDocumento = await png("#101010");
    fotos = [await crearMedio(actorAna, new File([await png()], "suelta.png", { type: "image/png" }))];
  });

  afterAll(async () => {
    for (const correo of [ana?.email, beto?.email, admin?.email]) {
      if (correo) await db().delete(users).where(eq(users.email, correo));
    }
  });

  test("sin consentimiento registrado no se puede generar y la API rechaza el encolado", async () => {
    const personaje = await nuevoPersonaje("Sin consentimiento", 3, false);
    expect(personaje.estado).toBe("borrador");
    expect(personaje.puedeGenerar).toBe(false);
    expect(personaje.impedimentos.join(" ")).toContain("Falta registrar el consentimiento");

    // La API es la que decide: aunque el navegador lo intentara, no se encola nada.
    await expect(crearFotograma(actorAna, confirmacion(personaje.id), h)).rejects.toThrow(/no se puede usar/i);
    const trabajos = await db().select().from(generationJobs).where(eq(generationJobs.characterId, personaje.id));
    expect(trabajos).toEqual([]);
  });

  test("por debajo del mínimo de referencias tampoco genera, aunque tenga consentimiento", async () => {
    const personaje = await nuevoPersonaje("Con una sola foto", 1);
    expect(personaje.estado).toBe("borrador");
    expect(personaje.impedimentos.join(" ")).toContain("Faltan 2 fotos");
    await expect(crearFotograma(actorAna, confirmacion(personaje.id), h)).rejects.toThrow(/Faltan 2 fotos/);
  });

  test("con consentimiento y referencias suficientes se encola y se envían varias referencias", async () => {
    const personaje = await nuevoPersonaje("Lucía", 4);
    expect(personaje.estado).toBe("listo");
    expect(personaje.puedeGenerar).toBe(true);

    subidas = 0;
    const { trabajo } = await crearFotograma(actorAna, confirmacion(personaje.id), h);
    expect(trabajo.personajeId).toBe(personaje.id);
    const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo.id));
    const referencias = (fila?.input as { referencias?: string[] } | undefined)?.referencias ?? [];
    // Cuatro fotos y un modelo que admite diez: van las cuatro, no una sola.
    expect(referencias).toHaveLength(4);
    expect(referencias.length).toBeLessThanOrEqual(MAXIMO_DEL_MODELO);

    await enviarEncolados(h);
    // Una subida al proveedor por referencia: es lo que prueba que se envían varias de verdad.
    expect(subidas).toBe(4);
  });

  test("sin confirmar la revisión de las fotos no se encola nada (ADR-0009)", async () => {
    const personaje = await nuevoPersonaje("Sin revisar", 3);
    await expect(crearFotograma(actorAna, confirmacion(personaje.id, { sinTerceros: false }), h)).rejects.toThrow(
      /ninguna otra persona ni ningún menor/,
    );
  });

  test("revocar el consentimiento bloquea inmediatamente las generaciones nuevas", async () => {
    const personaje = await nuevoPersonaje("Revocable", 3);
    expect(personaje.puedeGenerar).toBe(true);

    const revocado = (await (
      await rutaConsentimiento.DELETE(
        pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "DELETE", { motivo: "Ha retirado su permiso." }),
        ctx(personaje.id),
      )
    ).json()) as PersonajeVista;
    expect(revocado.estado).toBe("bloqueado");
    expect(revocado.puedeGenerar).toBe(false);

    await expect(crearFotograma(actorAna, confirmacion(personaje.id), h)).rejects.toThrow(/revocado/i);
    // Revocar dos veces no encuentra nada que revocar y lo dice, en lugar de fingir que ha hecho algo.
    const otra = await rutaConsentimiento.DELETE(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "DELETE", {}),
      ctx(personaje.id),
    );
    expect(otra.status).toBe(409);
  });

  test("un consentimiento de tercero sin documento no se registra y no habilita nada", async () => {
    const personaje = await nuevoPersonaje("Tercero sin papel", 3, false);
    const intento = await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
        titular: "tercero",
        mayoriaDeEdad: true,
        alcance: "comercial",
      }),
      ctx(personaje.id),
    );
    expect(intento.status).toBe(400);
    expect((await intento.json()).error).toContain("documento de consentimiento firmado");
    // El personaje sigue sin consentimiento: ni en revisión ni listo, y no genera.
    const ficha = await obtenerFicha(personaje.id);
    expect(ficha.estado).toBe("borrador");
    expect(ficha.puedeGenerar).toBe(false);
    await expect(crearFotograma(actorAna, confirmacion(personaje.id), h)).rejects.toThrow(/no se puede usar/i);
  });

  test("sin declarar la mayoría de edad no se registra el consentimiento", async () => {
    const personaje = await nuevoPersonaje("Sin declaración", 3, false);
    const intento = await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", { titular: "yo", mayoriaDeEdad: false }),
      ctx(personaje.id),
    );
    expect(intento.status).toBe(400);
    expect((await intento.json()).error).toContain("mayor de edad");
    expect((await obtenerFicha(personaje.id)).estado).toBe("borrador");
  });

  test("un tercero con documento queda en revisión y solo genera cuando el admin lo acepta", async () => {
    const personaje = await nuevoPersonaje("Tercero con papel", 3, false);
    const documento = await documentoDePrueba("firma.png");
    const registrado = (await (
      await rutaConsentimiento.POST(
        pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
          titular: "tercero",
          mayoriaDeEdad: true,
          alcance: "comercial",
          documentoId: documento.id,
        }),
        ctx(personaje.id),
      )
    ).json()) as PersonajeVista;
    expect(registrado.estado).toBe("en_revision");
    expect(registrado.puedeGenerar).toBe(false);
    await expect(crearFotograma(actorAna, confirmacion(personaje.id), h)).rejects.toThrow(/espera la revisión/i);

    // El admin lo ve en su lista de pendientes, con el documento y el dueño delante.
    const { elementos: pendientes } = await pendientesDeRevision({ id: admin.id, esAdmin: true });
    const enLista = pendientes.find((p) => p.id === personaje.id);
    expect(enLista?.consentimiento?.documento?.id).toBe(documento.id);
    expect(enLista?.propietario?.id).toBe(ana.id);

    // Un usuario normal no revisa nada: responde como si el personaje no existiera.
    const intentoBeto = await rutaRevision.POST(
      pedir(beto, `/api/personajes/${personaje.id}/revision`, "POST", { aceptado: true }),
      ctx(personaje.id),
    );
    expect(intentoBeto.status).toBe(404);
    // Ni Ana, que es la dueña: revisarse a sí misma vaciaría el control.
    const intentoAna = await rutaRevision.POST(
      pedir(ana, `/api/personajes/${personaje.id}/revision`, "POST", { aceptado: true }),
      ctx(personaje.id),
    );
    expect(intentoAna.status).toBe(404);

    const aceptado = (await (
      await rutaRevision.POST(
        pedir(admin, `/api/personajes/${personaje.id}/revision`, "POST", {
          aceptado: true,
          nota: "Documento legible, firmado y con fecha.",
        }),
        ctx(personaje.id),
      )
    ).json()) as PersonajeVista;
    expect(aceptado.estado).toBe("listo");
    const { trabajo } = await crearFotograma(actorAna, confirmacion(personaje.id), h);
    expect(trabajo.personajeId).toBe(personaje.id);
  });

  test("un rechazo sin nota no se acepta, y con nota bloquea el personaje", async () => {
    const personaje = await nuevoPersonaje("Tercero rechazado", 3, false);
    const documento = await documentoDePrueba("firma2.png");
    await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
        titular: "tercero",
        mayoriaDeEdad: true,
        documentoId: documento.id,
      }),
      ctx(personaje.id),
    );
    const sinNota = await rutaRevision.POST(
      pedir(admin, `/api/personajes/${personaje.id}/revision`, "POST", { aceptado: false }),
      ctx(personaje.id),
    );
    expect(sinNota.status).toBe(400);

    const rechazado = (await (
      await rutaRevision.POST(
        pedir(admin, `/api/personajes/${personaje.id}/revision`, "POST", {
          aceptado: false,
          nota: "El documento no está firmado.",
        }),
        ctx(personaje.id),
      )
    ).json()) as PersonajeVista;
    expect(rechazado.estado).toBe("bloqueado");
    await expect(crearFotograma(actorAna, confirmacion(personaje.id), h)).rejects.toThrow(/rechazado/i);
  });

  test("un personaje ajeno responde 404 en todo y el admin lo ve pero no lo edita", async () => {
    const personaje = await nuevoPersonaje("De Ana", 3);
    const url = `/api/personajes/${personaje.id}`;
    expect((await rutaPersonaje.GET(pedir(beto, url), ctx(personaje.id))).status).toBe(404);
    expect((await rutaPersonaje.PATCH(pedir(beto, url, "PATCH", { nombre: "mío" }), ctx(personaje.id))).status).toBe(
      404,
    );
    expect((await rutaPersonaje.DELETE(pedir(beto, url, "DELETE"), ctx(personaje.id))).status).toBe(404);
    expect(
      (
        await rutaReferencias.POST(
          pedir(beto, `${url}/referencias`, "POST", { referencias: [{ medioId: fotos[0]?.id }] }),
          ctx(personaje.id),
        )
      ).status,
    ).toBe(404);
    expect(
      (await rutaConsentimiento.DELETE(pedir(beto, `${url}/consentimiento`, "DELETE", {}), ctx(personaje.id))).status,
    ).toBe(404);

    // Beto tampoco lo ve en su lista.
    const suyos = (await (
      await rutaPersonajes.GET(pedir(beto, "/api/personajes"), undefined)
    ).json()) as PersonajeVista[];
    expect(suyos.map((p) => p.id)).not.toContain(personaje.id);

    // El admin **tampoco** lo ve: su consentimiento es «soy yo», así que no hay nada que revisar y administrar
    // no es poder mirar. Solo los personajes con titular tercero le corresponden (ver el test de revisión).
    expect((await rutaPersonaje.GET(pedir(admin, url), ctx(personaje.id))).status).toBe(404);
    expect(
      (await rutaPersonaje.PATCH(pedir(admin, url, "PATCH", { nombre: "revisado" }), ctx(personaje.id))).status,
    ).toBe(404);
    expect((await rutaPersonaje.DELETE(pedir(admin, url, "DELETE"), ctx(personaje.id))).status).toBe(404);
  });

  test("una petición sin Origin no cambia nada", async () => {
    const respuesta = await rutaPersonajes.POST(
      pedirSinOrigen(ana, "/api/personajes", "POST", { nombre: "Desde otra web", tipo: "persona" }),
      undefined,
    );
    expect(respuesta.status).toBe(403);
    const filas = await db().select().from(characters).where(eq(characters.name, "Desde otra web"));
    expect(filas).toEqual([]);
  });

  test("no se puede referenciar una foto ajena aunque se conozca su identificador", async () => {
    const personaje = await nuevoPersonaje("Fotos propias", 3);
    const deBeto = await crearMedio(
      { id: beto.id, esAdmin: false },
      new File([await png("#303030")], "beto.png", {
        type: "image/png",
      }),
    );
    const intento = await rutaReferencias.POST(
      pedir(ana, `/api/personajes/${personaje.id}/referencias`, "POST", {
        referencias: [{ medioId: deBeto.id }],
      }),
      ctx(personaje.id),
    );
    expect(intento.status).toBe(404);
    expect((await obtenerFicha(personaje.id)).totalReferencias).toBe(3);
  });

  test("borrar un personaje borra sus filas y sus objetos del almacenamiento, sin derivados huérfanos", async () => {
    const personaje = await nuevoPersonaje("Para borrar", 3);

    // Un trabajo completo con su resultado guardado en la biblioteca: es el derivado que hay que borrar.
    const { trabajo } = await crearFotograma(actorAna, confirmacion(personaje.id), h);
    await enviarEncolados(h);
    await pasadaDeCola(h);
    const terminado = await obtenerTrabajo(ana.id, trabajo.id);
    expect(terminado.estado).toBe("listo");
    const derivadoId = terminado.medio?.id;
    expect(derivadoId).toBeString();
    const [filaDerivado] = await db()
      .select()
      .from(media)
      .where(eq(media.id, derivadoId as string));
    const claveDerivado = filaDerivado?.storageKey as string;
    expect(await leerObjeto(claveDerivado).exists()).toBe(true);

    const referenciasAntes = await db()
      .select()
      .from(characterReferences)
      .where(eq(characterReferences.characterId, personaje.id));
    expect(referenciasAntes).toHaveLength(3);
    const clavesReferencia = await Promise.all(
      referenciasAntes.map(async (r) => {
        const [fila] = await db().select().from(media).where(eq(media.id, r.mediaId));
        return fila?.storageKey as string;
      }),
    );

    const resumen = (await (
      await rutaPersonaje.GET(pedir(ana, `/api/personajes/${personaje.id}?borrado=1`), ctx(personaje.id))
    ).json()) as { referencias: number; derivados: number; trabajos: number };
    expect(resumen).toMatchObject({ referencias: 3, derivados: 1, trabajos: 1 });

    const borrado = await rutaPersonaje.DELETE(
      pedir(ana, `/api/personajes/${personaje.id}`, "DELETE"),
      ctx(personaje.id),
    );
    expect(borrado.status).toBe(200);
    expect((await borrado.json()).clavesBorradas).toEqual([claveDerivado]);

    // Filas: no queda personaje, ni referencias, ni consentimiento, ni trabajos, ni el medio derivado.
    expect(await db().select().from(characters).where(eq(characters.id, personaje.id))).toEqual([]);
    expect(
      await db().select().from(characterReferences).where(eq(characterReferences.characterId, personaje.id)),
    ).toEqual([]);
    expect(await db().select().from(consentRecords).where(eq(consentRecords.characterId, personaje.id))).toEqual([]);
    expect(await db().select().from(generationJobs).where(eq(generationJobs.characterId, personaje.id))).toEqual([]);
    expect(
      await db()
        .select()
        .from(media)
        .where(eq(media.id, derivadoId as string)),
    ).toEqual([]);

    // Almacenamiento: el derivado ya no está y las fotos de referencia sí (son del usuario, no del personaje).
    expect(await leerObjeto(claveDerivado).exists()).toBe(false);
    for (const clave of clavesReferencia) {
      expect(await leerObjeto(clave).exists()).toBe(true);
    }
  });

  test("borrar definitivamente una foto usada como referencia avisa y no borra sin confirmación", async () => {
    const personaje = await nuevoPersonaje("Con foto compartida", 3);
    const ficha = await obtenerFicha(personaje.id);
    const enUso = ficha.referencias?.[0]?.medio;
    expect(enUso).toBeDefined();
    const id = (enUso as Medio).id;

    // La papelera primero, como siempre; eso no avisa de nada porque se puede restaurar.
    expect((await rutaMedio.DELETE(pedir(ana, `/api/media/${id}`, "DELETE"), ctx(id))).status).toBe(200);

    const aviso = await rutaMedio.DELETE(pedir(ana, `/api/media/${id}?definitivo=1`, "DELETE"), ctx(id));
    expect(aviso.status).toBe(409);
    const cuerpo = (await aviso.json()) as { error: string; enUsoPor: { id: string; nombre: string }[] };
    expect(cuerpo.error).toContain("Con foto compartida");
    expect(cuerpo.enUsoPor.map((p) => p.id)).toEqual([personaje.id]);
    // No ha borrado nada: la foto y su relación con el personaje siguen ahí.
    expect(await db().select().from(media).where(eq(media.id, id))).toHaveLength(1);
    expect(
      await db().select().from(characterReferences).where(eq(characterReferences.characterId, personaje.id)),
    ).toHaveLength(3);
    // Eso sí: una foto en la papelera no se puede enviar a ningún proveedor, así que ya no cuenta para el
    // mínimo y el personaje deja de poder generar desde que se manda a la papelera, no desde que se borra.
    const enPapelera = await obtenerFicha(personaje.id);
    expect(enPapelera.totalReferencias).toBe(2);
    expect(enPapelera.puedeGenerar).toBe(false);

    // Con la confirmación sí borra, y la relación desaparece del todo.
    const confirmado = await rutaMedio.DELETE(
      pedir(ana, `/api/media/${id}?definitivo=1&confirmado=1`, "DELETE"),
      ctx(id),
    );
    expect(confirmado.status).toBe(204);
    expect(await db().select().from(media).where(eq(media.id, id))).toEqual([]);
    const despues = await obtenerFicha(personaje.id);
    expect(despues.totalReferencias).toBe(2);
    expect(despues.puedeGenerar).toBe(false);
  });

  test("el documento de un consentimiento vigente no se puede borrar; revocado, avisa antes", async () => {
    const personaje = await nuevoPersonaje("Documento protegido", 3, false);
    const documento = await documentoDePrueba("firma3.png");
    await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
        titular: "tercero",
        mayoriaDeEdad: true,
        documentoId: documento.id,
      }),
      ctx(personaje.id),
    );
    await rutaMedio.DELETE(pedir(ana, `/api/media/${documento.id}`, "DELETE"), ctx(documento.id));

    // Mientras el consentimiento esté vigente, no hay confirmación que valga: es la prueba que lo sostiene.
    const bloqueado = await rutaMedio.DELETE(
      pedir(ana, `/api/media/${documento.id}?definitivo=1&confirmado=1`, "DELETE"),
      ctx(documento.id),
    );
    expect(bloqueado.status).toBe(409);
    expect((await bloqueado.json()).error).toContain("Revoca primero su consentimiento");
    expect(await db().select().from(media).where(eq(media.id, documento.id))).toHaveLength(1);

    // Revocado, vuelve a ser un archivo cualquiera: avisa de a quién afecta y se borra si se confirma.
    await rutaConsentimiento.DELETE(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "DELETE", { motivo: "Retirado." }),
      ctx(personaje.id),
    );
    const aviso = await rutaMedio.DELETE(
      pedir(ana, `/api/media/${documento.id}?definitivo=1`, "DELETE"),
      ctx(documento.id),
    );
    expect(aviso.status).toBe(409);
    expect(((await aviso.json()) as { enUsoPor: { id: string }[] }).enUsoPor.map((p) => p.id)).toEqual([personaje.id]);
    const borrado = await rutaMedio.DELETE(
      pedir(ana, `/api/media/${documento.id}?definitivo=1&confirmado=1`, "DELETE"),
      ctx(documento.id),
    );
    expect(borrado.status).toBe(204);
  });

  test("dos personajes del mismo usuario no pueden llamarse igual", async () => {
    await nuevoPersonaje("Nombre repetido", 0, false);
    const segundo = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", { nombre: "Nombre repetido", tipo: "animal" }),
      undefined,
    );
    expect(segundo.status).toBe(409);
    expect((await segundo.json()).error).toContain("personaje con ese nombre");
  });
});
