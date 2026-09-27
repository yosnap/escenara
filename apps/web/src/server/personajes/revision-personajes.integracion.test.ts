import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { Medio } from "@/lib/media/tipos";
import type { PersonajeVista } from "@/lib/personajes";

/**
 * Los arreglos de la revisión de código de la 0.13.0, cada uno con su test.
 *
 * Aquí está la mitad que más importa de la versión: que **revocar un consentimiento detenga de verdad** lo que
 * ya estaba en marcha, que la revisión humana no se pueda eludir, que borrar un personaje no se lleve el dinero
 * de nadie por delante y que quien administra no pueda mirar las fotos de la gente.
 *
 * **Ningún test llama a KIE**: el proveedor se simula y la clave es inventada.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_personajes_revision");
}

const { and, eq } = await import("drizzle-orm");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaPersonaje = await import("@/app/api/personajes/[id]/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const rutaMedios = await import("@/app/api/media/route");
const rutaMedioId = await import("@/app/api/media/[id]/route");
const rutaArchivo = await import("@/app/api/media/[id]/archivo/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characters, consentAccessLog, generationJobs, media, usageLedger, users } = await import("../db/esquema");
const { guardarCredencial } = await import("../boveda/credenciales");
const { crearMedio } = await import("../media/servicio");
const { crearFotograma } = await import("../generacion/servicio");
const { enviarEncolados } = await import("../cola/pasada");
const { obtenerTrabajo } = await import("../generacion/trabajos");
const { obtenerPersonaje, pendientesDeRevision } = await import("./consulta");
const { revisarConsentimiento } = await import("./consentimiento");
const { borrarPersonaje, resumenBorrado } = await import("./borrado");
const { comprometidoDe } = await import("../presupuesto/deposito");
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type Actor = import("../media/servicio").Actor;

const CLAVE = "sk-ana-clave-de-kie-inventada-aaaa";
const ESCENA = "En una cafetería luminosa, saluda a cámara con una sonrisa.";

// ── Proveedor simulado, contando cada llamada ────────────────────────────────────────────────────────────

interface Kie {
  subidas: number;
  tareasCreadas: number;
  /** Si es `true`, la tarea queda lista con resultado; si no, se queda esperando. */
  terminaSola: boolean;
}

let kie: Kie;
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
    kie.subidas++;
    return sobre({ downloadUrl: `https://tempfile.kie.ai/referencia-${kie.subidas}.png` });
  }
  if (url.includes("createTask")) {
    kie.tareasCreadas++;
    const taskId = `task_${++siguienteTarea}`;
    tareas.set(
      taskId,
      kie.terminaSola
        ? { state: "success", urls: ["https://tempfile.kie.ai/resultado.png"], creditos: 4 }
        : { state: "waiting" },
    );
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

async function png(color = "#3d6bff", lado = 64): Promise<Uint8Array<ArrayBuffer>> {
  return bytes(
    await sharp({ create: { width: lado, height: lado, channels: 3, background: color } })
      .png()
      .toBuffer(),
  );
}

const descargar: Herramientas["descargar"] = async (url) => ({
  archivo: new File([await png("#ff5a5f")], "fotograma.png", { type: "image/png" }),
  origen: url,
});

const h: Herramientas = { buscar, descargar };

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

describe.skipIf(!hayBaseDeDatos)("arreglos de la revisión de personajes", () => {
  let ana: Sesion;
  let admin: Sesion;
  let actorAna: Actor;
  let actorAdmin: Actor;

  /** Personaje de Ana con `cuantas` fotos y, si se pide, consentimiento propio ya registrado. */
  async function nuevoPersonaje(nombre: string, cuantas = 3, conConsentimiento = true): Promise<PersonajeVista> {
    const creada = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", { nombre, tipo: "persona" }),
      undefined,
    );
    const personaje = (await creada.json()) as PersonajeVista;
    const ids = await Promise.all(
      Array.from({ length: cuantas }, async (_, i) => {
        const medio = await crearMedio(
          actorAna,
          new File([await png(`#${((i + 2) * 17).toString(16).padStart(2, "0").repeat(3)}`)], `${nombre}-${i}.png`, {
            type: "image/png",
          }),
        );
        return medio.id;
      }),
    );
    if (ids.length > 0) {
      await rutaReferencias.POST(
        pedir(ana, `/api/personajes/${personaje.id}/referencias`, "POST", {
          referencias: ids.map((medioId) => ({ medioId })),
        }),
        ctx(personaje.id),
      );
    }
    if (conConsentimiento) {
      await rutaConsentimiento.POST(
        pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
          titular: "yo",
          mayoriaDeEdad: true,
          alcance: "personal",
        }),
        ctx(personaje.id),
      );
    }
    return (await (
      await rutaPersonaje.GET(pedir(ana, `/api/personajes/${personaje.id}`), ctx(personaje.id))
    ).json()) as PersonajeVista;
  }

  /** Registra un consentimiento de tercero con su documento y devuelve la ficha resultante. */
  async function conTercero(personajeId: string): Promise<{ ficha: PersonajeVista; documento: Medio }> {
    const documento = await crearMedio(
      actorAna,
      new File([await png("#0a0a0a", 900)], "firma.png", { type: "image/png" }),
      {},
      ["imagen"],
      null,
      { documento: true },
    );
    const ficha = (await (
      await rutaConsentimiento.POST(
        pedir(ana, `/api/personajes/${personajeId}/consentimiento`, "POST", {
          titular: "tercero",
          mayoriaDeEdad: true,
          documentoId: documento.id,
        }),
        ctx(personajeId),
      )
    ).json()) as PersonajeVista;
    return { ficha, documento };
  }

  const confirmacion = (personajeId: string, extra: Record<string, unknown> = {}) => ({
    personajeId,
    sinTerceros: true,
    prompt: ESCENA,
    creditosConfirmados: 4,
    derechos: true,
    claveIdempotencia: crypto.randomUUID(),
    ...extra,
  });

  const revocar = (personajeId: string) =>
    rutaConsentimiento.DELETE(
      pedir(ana, `/api/personajes/${personajeId}/consentimiento`, "DELETE", { motivo: "Ha retirado su permiso." }),
      ctx(personajeId),
    );

  beforeAll(async () => {
    await aplicarMigraciones();
    [ana, admin] = await Promise.all([crearSesionDePrueba("user"), crearSesionDePrueba("admin")]);
    actorAna = { id: ana.id, esAdmin: false };
    actorAdmin = { id: admin.id, esAdmin: true };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
  });

  afterAll(async () => {
    for (const correo of [ana?.email, admin?.email]) {
      if (correo) await db().delete(users).where(eq(users.email, correo));
    }
  });

  // La cola es de toda la instalación, así que un trabajo que otro test dejó encolado se enviaría en medio de
  // este y falsearía los contadores. Se vacía antes de cada test y los contadores se ponen a cero después.
  beforeEach(async () => {
    kie = { subidas: 0, tareasCreadas: 0, terminaSola: true };
    await enviarEncolados(h);
    kie = { subidas: 0, tareasCreadas: 0, terminaSola: true };
  });

  // ── C1 ─────────────────────────────────────────────────────────────────────────────────────────────────

  test("C1 · revocar después de encolar impide el envío: ni una subida ni una tarea en el proveedor", async () => {
    const personaje = await nuevoPersonaje("Revocada tras encolar");
    const { trabajo } = await crearFotograma(actorAna, confirmacion(personaje.id), h);
    expect(trabajo.estado).toBe("en_cola");

    // El usuario revoca entre el encolado y el envío: es exactamente la ventana que la revisión señaló.
    expect((await revocar(personaje.id)).status).toBe(200);
    kie = { subidas: 0, tareasCreadas: 0, terminaSola: true };
    await enviarEncolados(h);

    expect(kie.subidas).toBe(0);
    expect(kie.tareasCreadas).toBe(0);
    const cerrado = await obtenerTrabajo(ana.id, trabajo.id);
    expect(cerrado.estado).toBe("fallido");
    expect(cerrado.motivoFallo).toBe("consentimiento");
    expect(cerrado.error).toContain("revocado");
    expect(cerrado.taskId).toBeNull();
  });

  test("C1 · quitar fotos por debajo del mínimo también detiene el envío, y no se reintenta", async () => {
    const personaje = await nuevoPersonaje("Sin fotos tras encolar", 3);
    const { trabajo } = await crearFotograma(actorAna, confirmacion(personaje.id), h);
    const ficha = await obtenerPersonaje(actorAna, personaje.id);
    const aQuitar = (ficha.referencias ?? []).slice(0, 2).map((r) => r.id);
    await rutaReferencias.DELETE(
      pedir(ana, `/api/personajes/${personaje.id}/referencias`, "DELETE", { ids: aQuitar }),
      ctx(personaje.id),
    );

    kie = { subidas: 0, tareasCreadas: 0, terminaSola: true };
    await enviarEncolados(h);
    expect(kie.tareasCreadas).toBe(0);
    const cerrado = await obtenerTrabajo(ana.id, trabajo.id);
    // Cerrado, no devuelto a la cola: reintentar esperaría a que alguien devolviera unas fotos que se han quitado.
    expect(cerrado.estado).toBe("fallido");
    expect(cerrado.motivoFallo).toBe("consentimiento");
    expect(cerrado.error).toContain("Faltan");
    // Y una segunda pasada no lo vuelve a intentar.
    await enviarEncolados(h);
    expect(kie.tareasCreadas).toBe(0);
  });

  test("C1 · el trabajo detenido no deja presupuesto reservado", async () => {
    const personaje = await nuevoPersonaje("Reserva liberada");
    const { trabajo } = await crearFotograma(actorAna, confirmacion(personaje.id), h);
    await revocar(personaje.id);
    await enviarEncolados(h);
    const apuntes = await db().select().from(usageLedger).where(eq(usageLedger.jobId, trabajo.id));
    expect(apuntes.filter((a) => a.entryType === "liberacion")).toHaveLength(1);
    expect(apuntes.find((a) => a.entryType === "consumo")?.credits).toBe(0);
  });

  // ── C2 ─────────────────────────────────────────────────────────────────────────────────────────────────

  test("C2 · un rechazo no se puede eludir registrando «soy yo»", async () => {
    const personaje = await nuevoPersonaje("Rechazada", 3, false);
    await conTercero(personaje.id);
    const rechazado = await revisarConsentimiento(actorAdmin, personaje.id, false, "El documento no está firmado.");
    expect(rechazado.estado).toBe("bloqueado");

    // Aquí estaba el agujero: bastaba con registrar «soy yo» para desbloquear la cara de otra persona.
    const elusion = await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", { titular: "yo", mayoriaDeEdad: true }),
      ctx(personaje.id),
    );
    expect(elusion.status).toBe(409);
    expect((await elusion.json()).error).toContain("imagen de otra persona");
    const ficha = await obtenerPersonaje(actorAna, personaje.id);
    expect(ficha.estado).toBe("bloqueado");
    expect(ficha.puedeGenerar).toBe(false);
  });

  test("C2 · tampoco con «un animal mío», ni tras revocar el de tercero", async () => {
    const personaje = await nuevoPersonaje("Fue de un tercero", 3, false);
    await conTercero(personaje.id);
    await revocar(personaje.id);
    const comoAnimal = await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
        titular: "animal_propio",
        mayoriaDeEdad: true,
      }),
      ctx(personaje.id),
    );
    expect(comoAnimal.status).toBe(409);
    // Lo que sí vale: otro consentimiento de tercero, que vuelve a pasar por revisión.
    const { ficha } = await conTercero(personaje.id);
    expect(ficha.estado).toBe("en_revision");
    expect(ficha.puedeGenerar).toBe(false);
  });

  // ── C3 ─────────────────────────────────────────────────────────────────────────────────────────────────

  test("C3 · borrar con un trabajo ya enviado responde 409 y no borra nada", async () => {
    const personaje = await nuevoPersonaje("Con trabajo enviado");
    kie.terminaSola = false; // El trabajo se queda en el proveedor, sin terminar.
    const { trabajo } = await crearFotograma(actorAna, confirmacion(personaje.id), h);
    await enviarEncolados(h);
    expect((await obtenerTrabajo(ana.id, trabajo.id)).estado).toBe("enviado");

    const resumen = await resumenBorrado(actorAna, personaje.id);
    expect(resumen.trabajosEnMarcha).toBe(1);

    const rechazo = await rutaPersonaje.DELETE(
      pedir(ana, `/api/personajes/${personaje.id}`, "DELETE"),
      ctx(personaje.id),
    );
    expect(rechazo.status).toBe(409);
    expect((await rechazo.json()).error).toContain("ya está en el proveedor");
    // Nada se ha borrado: el personaje sigue y su trabajo también.
    expect(await db().select().from(characters).where(eq(characters.id, personaje.id))).toHaveLength(1);
    expect(await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo.id))).toHaveLength(1);
  });

  test("C3 · borrar con un trabajo en cola lo cancela liberando su reserva", async () => {
    const personaje = await nuevoPersonaje("Con trabajo en cola");
    const { trabajo } = await crearFotograma(actorAna, confirmacion(personaje.id), h);
    expect(trabajo.estado).toBe("en_cola");
    const antes = await comprometidoDe(ana.id);
    expect(antes.reservado).toBeGreaterThan(0);

    const resumen = await resumenBorrado(actorAna, personaje.id);
    expect(resumen).toMatchObject({ trabajosEnMarcha: 0, trabajosPorCancelar: 1 });

    const borrado = await borrarPersonaje(actorAna, personaje.id);
    expect(borrado.trabajosCancelados).toBe(1);
    expect(borrado.trabajosBorrados).toBe(1);

    // La reserva se ha liberado: el presupuesto comprometido vuelve a lo que había.
    const despues = await comprometidoDe(ana.id);
    expect(despues.reservado).toBe(antes.reservado - trabajo.creditosEstimados);
    // Y no queda ningún apunte de reserva sin su liberación, ni con `job_id` nulo ni con él.
    const apuntes = await db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id));
    const reservas = apuntes.filter((a) => a.entryType === "reserva" && a.jobId === null);
    const liberaciones = apuntes.filter((a) => a.entryType === "liberacion" && a.jobId === null);
    expect(liberaciones.length).toBeGreaterThanOrEqual(reservas.length);
    // El apunte dice de qué trabajo venía, así que el gasto sigue siendo auditable sin su `job_id`.
    expect(reservas.every((a) => a.note.includes("borrado con el personaje"))).toBe(true);
  });

  test("C3 · el barrido de reservas huérfanas no encuentra nada que arreglar después de borrar", async () => {
    const personaje = await nuevoPersonaje("Sin huérfanas");
    await crearFotograma(actorAna, confirmacion(personaje.id), h);
    await borrarPersonaje(actorAna, personaje.id);
    const { barrerReservasHuerfanas } = await import("../cola/pasada");
    expect(await barrerReservasHuerfanas()).toBe(0);
  });

  // ── A1 ─────────────────────────────────────────────────────────────────────────────────────────────────

  test("A1 · el clip de un fotograma con personaje exige la revisión y el consentimiento vigente", async () => {
    const { crearAnimacion } = await import("../generacion/servicio");
    const personaje = await nuevoPersonaje("Para animar");
    const { trabajo } = await crearFotograma(actorAna, confirmacion(personaje.id), h);
    await enviarEncolados(h);
    const { pasadaDeCola } = await import("../cola/pasada");
    await pasadaDeCola(h);
    const listo = await obtenerTrabajo(ana.id, trabajo.id);
    expect(listo.estado).toBe("listo");

    const clip = {
      trabajoPadreId: trabajo.id,
      prompt: ESCENA,
      // Los créditos del modelo de clip predeterminado del catálogo sembrado.
      creditosConfirmados: 60,
      derechos: true,
      claveIdempotencia: crypto.randomUUID(),
    };
    // Sin la confirmación de revisión, el clip no sale (aunque el fotograma sí saliera).
    await expect(crearAnimacion(actorAna, clip, h)).rejects.toThrow(/ninguna otra persona ni ningún menor/);

    // Y con el consentimiento revocado, tampoco: el clip envía la misma cara.
    await revocar(personaje.id);
    await expect(
      crearAnimacion(actorAna, { ...clip, claveIdempotencia: crypto.randomUUID(), sinTerceros: true }, h),
    ).rejects.toThrow(/revocado/i);
  });

  // ── A4 ─────────────────────────────────────────────────────────────────────────────────────────────────

  test("A4 · quien administra ve el consentimiento, nunca las fotos, y el acceso queda registrado", async () => {
    const personaje = await nuevoPersonaje("Revisable", 3, false);
    const { documento } = await conTercero(personaje.id);

    const comoAdmin = await obtenerPersonaje(actorAdmin, personaje.id);
    // El consentimiento y su documento sí; las fotos y la portada, no.
    expect(comoAdmin.consentimiento?.documento?.id).toBe(documento.id);
    expect(comoAdmin.referencias).toBeUndefined();
    expect(comoAdmin.portada).toBeNull();
    expect(comoAdmin.puedeEditar).toBe(false);
    // El dueño sí las ve.
    expect((await obtenerPersonaje(actorAna, personaje.id)).referencias).toHaveLength(3);

    // La cola de revisión tampoco lleva fotos.
    const { elementos: pendientes } = await pendientesDeRevision(actorAdmin);
    const enLista = pendientes.find((p) => p.id === personaje.id);
    expect(enLista?.referencias).toBeUndefined();
    expect(enLista?.portada).toBeNull();

    // Cada acceso al documento deja su línea: abrir la ficha y revisarlo. Del listado queda un apunte por
    // carga, sin personaje, porque ahí todavía no se ve ningún documento.
    await revisarConsentimiento(actorAdmin, personaje.id, true, "Documento legible.");
    const accesos = await db()
      .select()
      .from(consentAccessLog)
      .where(and(eq(consentAccessLog.adminId, admin.id), eq(consentAccessLog.characterId, personaje.id)));
    expect(accesos.map((a) => a.action).sort()).toEqual(["ficha", "revision"]);
    const deListado = await db()
      .select()
      .from(consentAccessLog)
      .where(and(eq(consentAccessLog.adminId, admin.id), eq(consentAccessLog.action, "listado")));
    expect(deListado.length).toBeGreaterThan(0);
    expect(deListado.every((a) => a.characterId === null)).toBe(true);
  });

  test("A4 · la respuesta HTTP de la ficha ajena tampoco lleva las referencias", async () => {
    const personaje = await nuevoPersonaje("Sin fotos para el admin", 3, false);
    await conTercero(personaje.id);
    const respuesta = await rutaPersonaje.GET(pedir(admin, `/api/personajes/${personaje.id}`), ctx(personaje.id));
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.text();
    expect(cuerpo).not.toContain('"referencias"');
    // Ni una sola URL firmada de una foto del personaje: solo la del documento.
    expect([...cuerpo.matchAll(/X-Amz-Signature/g)]).toHaveLength(1);
  });

  // ── M6 ─────────────────────────────────────────────────────────────────────────────────────────────────

  test("M6 · el documento se guarda sin recortar y no se puede usar como referencia", async () => {
    const original = await png("#0a0a0a", 3000);
    const datos = new FormData();
    datos.set("archivo", new File([original], "hoja-firmada.png", { type: "image/png" }));
    datos.set("documento", "1");
    const respuesta = await rutaMedios.POST(
      new Request("http://localhost/api/media", {
        method: "POST",
        body: datos,
        headers: { cookie: ana.cookie, origin: "http://localhost" },
      }),
      undefined,
    );
    expect(respuesta.status).toBe(201);
    const documento = (await respuesta.json()) as Medio;
    // Sin recortar a 1920 ni reconvertir a WebP: sigue siendo el PNG de 3000 px que se subió.
    expect(documento.documento).toBe(true);
    expect(documento.ancho).toBe(3000);
    expect(documento.mime).toBe("image/png");
    const [fila] = await db().select().from(media).where(eq(media.id, documento.id));
    expect(fila?.sizeBytes).toBe(original.byteLength);

    // No se puede colar como foto del personaje.
    const personaje = await nuevoPersonaje("Sin documentos", 3);
    const intento = await rutaReferencias.POST(
      pedir(ana, `/api/personajes/${personaje.id}/referencias`, "POST", {
        referencias: [{ medioId: documento.id }],
      }),
      ctx(personaje.id),
    );
    expect(intento.status).toBe(400);
    expect((await intento.json()).error).toContain("documento de consentimiento");

    // Ni como imagen suelta en «Crear».
    await expect(
      crearFotograma(actorAna, { ...confirmacion(""), personajeId: undefined, medioId: documento.id }, h),
    ).rejects.toThrow(/documento de consentimiento/);

    // Y no aparece donde se eligen fotos.
    const listado = await rutaMedios.GET(
      new Request("http://localhost/api/media?sinDocumentos=1", { headers: { cookie: ana.cookie } }),
      undefined,
    );
    const pagina = (await listado.json()) as { elementos: Medio[] };
    expect(pagina.elementos.map((m) => m.id)).not.toContain(documento.id);
  });

  // ── M1 ─────────────────────────────────────────────────────────────────────────────────────────────────

  test("M1 · reeditar el resultado de un personaje hereda ese personaje, y el borrado lo alcanza", async () => {
    const personaje = await nuevoPersonaje("Cadena");
    const { trabajo } = await crearFotograma(actorAna, confirmacion(personaje.id), h);
    await enviarEncolados(h);
    const { pasadaDeCola } = await import("../cola/pasada");
    await pasadaDeCola(h);
    const primero = await obtenerTrabajo(ana.id, trabajo.id);
    const resultadoId = primero.medio?.id as string;

    // Segundo trabajo pedido con la «imagen suelta» que en realidad es el resultado del primero.
    const { trabajo: segundo } = await crearFotograma(
      actorAna,
      { ...confirmacion(""), personajeId: undefined, medioId: resultadoId, sinTerceros: true },
      h,
    );
    expect(segundo.personajeId).toBe(personaje.id);

    // Al borrar el personaje, los dos trabajos y sus resultados desaparecen.
    await enviarEncolados(h);
    await pasadaDeCola(h);
    const borrado = await borrarPersonaje(actorAna, personaje.id);
    expect(borrado.trabajosBorrados).toBe(2);
    expect(await db().select().from(generationJobs).where(eq(generationJobs.characterId, personaje.id))).toEqual([]);
    expect(await db().select().from(media).where(eq(media.id, resultadoId))).toEqual([]);
  });

  // ── M2 ─────────────────────────────────────────────────────────────────────────────────────────────────

  test("M2 · la revisión de referencias se guarda con su fecha", async () => {
    const personaje = await nuevoPersonaje("Con fecha de revisión");
    const { trabajo } = await crearFotograma(actorAna, confirmacion(personaje.id), h);
    const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.id, trabajo.id));
    expect(fila?.referencesReviewedAt).toBeInstanceOf(Date);
    expect(fila?.rightsConfirmedAt).toBeInstanceOf(Date);
  });

  // ── M4 ─────────────────────────────────────────────────────────────────────────────────────────────────

  test("M4 · borrar una foto para siempre deja el personaje en borrador al momento", async () => {
    const rutaMedio = await import("@/app/api/media/[id]/route");
    const personaje = await nuevoPersonaje("Se queda corto");
    expect(personaje.estado).toBe("listo");
    const foto = (personaje.referencias ?? [])[0]?.medio.id as string;

    await rutaMedio.DELETE(pedir(ana, `/api/media/${foto}`, "DELETE"), ctx(foto));
    const borrado = await rutaMedio.DELETE(
      pedir(ana, `/api/media/${foto}?definitivo=1&confirmado=1`, "DELETE"),
      ctx(foto),
    );
    expect(borrado.status).toBe(204);

    // La columna `state`, que es la que usan los listados, ya está al día: no dice «listo» mientras la
    // generación lo rechaza.
    const [fila] = await db().select().from(characters).where(eq(characters.id, personaje.id));
    expect(fila?.state).toBe("borrador");
  });

  // ── Segunda ronda · C1 ─────────────────────────────────────────────────────────────────────────────────

  test("C1b · el admin no ve los documentos ni las referencias ajenas: ni en el listado, ni por id, ni el archivo", async () => {
    const personaje = await nuevoPersonaje("Material reservado", 3, false);
    const { documento } = await conTercero(personaje.id);
    const ficha = await obtenerPersonaje(actorAna, personaje.id);
    const referencia = (ficha.referencias ?? [])[0]?.medio.id as string;
    // Una foto suya que **no** es referencia de ningún personaje: el admin sí la ve, como en 0.8.0.
    const suelta = await crearMedio(actorAna, new File([await png("#777777")], "suelta.png", { type: "image/png" }));

    // Listado de todos.
    const listado = await rutaMedios.GET(
      new Request("http://localhost/api/media?propietario=todos", { headers: { cookie: admin.cookie } }),
      undefined,
    );
    const ids = ((await listado.json()) as { elementos: Medio[] }).elementos.map((m) => m.id);
    expect(ids).toContain(suelta.id);
    expect(ids).not.toContain(documento.id);
    expect(ids).not.toContain(referencia);

    // Listado filtrado por el dueño: mismo resultado.
    const deAna = await rutaMedios.GET(
      new Request(`http://localhost/api/media?propietario=${ana.id}`, { headers: { cookie: admin.cookie } }),
      undefined,
    );
    const idsDeAna = ((await deAna.json()) as { elementos: Medio[] }).elementos.map((m) => m.id);
    expect(idsDeAna).toContain(suelta.id);
    expect(idsDeAna).not.toContain(documento.id);
    expect(idsDeAna).not.toContain(referencia);

    // Por identificador y por archivo: 404, como si no existieran.
    for (const id of [documento.id, referencia]) {
      expect((await rutaMedioId.GET(pedir(admin, `/api/media/${id}`), ctx(id))).status).toBe(404);
      expect((await rutaArchivo.GET(pedir(admin, `/api/media/${id}/archivo`), ctx(id))).status).toBe(404);
      expect(
        (await rutaMedioId.PATCH(pedir(admin, `/api/media/${id}`, "PATCH", { titulo: "mío" }), ctx(id))).status,
      ).toBe(404);
      expect((await rutaMedioId.DELETE(pedir(admin, `/api/media/${id}`, "DELETE"), ctx(id))).status).toBe(404);
    }
    // Lo que no es material reservado sigue funcionando para el admin (decisión de 0.8.0 intacta).
    expect((await rutaMedioId.GET(pedir(admin, `/api/media/${suelta.id}`), ctx(suelta.id))).status).toBe(200);
    expect((await rutaArchivo.GET(pedir(admin, `/api/media/${suelta.id}/archivo`), ctx(suelta.id))).status).toBe(200);
    // Y su dueña los ve sin problema.
    expect((await rutaMedioId.GET(pedir(ana, `/api/media/${documento.id}`), ctx(documento.id))).status).toBe(200);
    expect((await rutaMedioId.GET(pedir(ana, `/api/media/${referencia}`), ctx(referencia))).status).toBe(200);
  });

  // ── Segunda ronda · C2 ─────────────────────────────────────────────────────────────────────────────────

  test("C2b · solo vale como documento un medio subido como documento", async () => {
    const personaje = await nuevoPersonaje("Documento de verdad", 3, false);
    // Una imagen normal de la biblioteca (la que se elegiría con «Elegir de la biblioteca» o por URL).
    const normal = await crearMedio(
      actorAna,
      new File([await png("#888888")], "cualquiera.png", { type: "image/png" }),
    );
    const conNormal = await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
        titular: "tercero",
        mayoriaDeEdad: true,
        documentoId: normal.id,
      }),
      ctx(personaje.id),
    );
    expect(conNormal.status).toBe(400);
    expect((await conNormal.json()).error).toContain("no se subió como documento");

    // Y una foto que ya es referencia del personaje tampoco puede hacer de documento.
    const ficha = await obtenerPersonaje(actorAna, personaje.id);
    const referencia = (ficha.referencias ?? [])[0]?.medio.id as string;
    const conReferencia = await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
        titular: "tercero",
        mayoriaDeEdad: true,
        documentoId: referencia,
      }),
      ctx(personaje.id),
    );
    // También se rechaza: una foto de referencia nunca se subió como documento. La comprobación de «ya es
    // referencia» que hay detrás es defensa en profundidad para un caso que la API ya no permite montar.
    expect(conReferencia.status).toBe(400);

    // Sin consentimiento registrado por ninguno de los dos intentos.
    expect((await obtenerPersonaje(actorAna, personaje.id)).consentimiento).toBeNull();
  });

  test("C2b · un documento en un formato que no se puede limpiar sin recomprimir se rechaza", async () => {
    const webp = bytes(
      await sharp({ create: { width: 64, height: 64, channels: 3, background: "#123456" } })
        .webp()
        .toBuffer(),
    );
    const datos = new FormData();
    datos.set("archivo", new File([webp], "hoja.webp", { type: "image/webp" }));
    datos.set("documento", "1");
    const respuesta = await rutaMedios.POST(
      new Request("http://localhost/api/media", {
        method: "POST",
        body: datos,
        headers: { cookie: ana.cookie, origin: "http://localhost" },
      }),
      undefined,
    );
    expect(respuesta.status).toBe(415);
    expect((await respuesta.json()).error).toContain("JPEG o PNG");
  });

  // ── Segunda ronda · A3 ─────────────────────────────────────────────────────────────────────────────────

  test("A3 · una referencia en la papelera detiene el envío antes de subir nada", async () => {
    const personaje = await nuevoPersonaje("Con foto en la papelera", 3);
    const { trabajo } = await crearFotograma(actorAna, confirmacion(personaje.id), h);
    const ficha = await obtenerPersonaje(actorAna, personaje.id);
    const foto = (ficha.referencias ?? [])[0]?.medio.id as string;
    // La papelera, no el borrado: la relación sigue existiendo, pero la foto no se puede enviar.
    expect((await rutaMedioId.DELETE(pedir(ana, `/api/media/${foto}`, "DELETE"), ctx(foto))).status).toBe(200);

    kie = { subidas: 0, tareasCreadas: 0, terminaSola: true };
    await enviarEncolados(h);
    expect(kie.subidas).toBe(0);
    expect(kie.tareasCreadas).toBe(0);
    const cerrado = await obtenerTrabajo(ana.id, trabajo.id);
    expect(cerrado.estado).toBe("fallido");
    expect(cerrado.motivoFallo).toBe("consentimiento");
  });

  test("A3 · una foto en la papelera no cuenta para el mínimo del personaje", async () => {
    const personaje = await nuevoPersonaje("Cuenta sin papelera");
    expect(personaje.totalReferencias).toBe(3);
    const foto = (personaje.referencias ?? [])[0]?.medio.id as string;
    await rutaMedioId.DELETE(pedir(ana, `/api/media/${foto}`, "DELETE"), ctx(foto));
    const despues = await obtenerPersonaje(actorAna, personaje.id);
    expect(despues.totalReferencias).toBe(2);
    expect(despues.puedeGenerar).toBe(false);
    // Y la relación sigue ahí: restaurarla devuelve el personaje a «listo» sin tener que volver a añadirla.
    const rutaRestaurar = await import("@/app/api/media/[id]/restaurar/route");
    await rutaRestaurar.POST(pedir(ana, `/api/media/${foto}/restaurar`, "POST"), ctx(foto));
    const restaurado = await obtenerPersonaje(actorAna, personaje.id);
    expect(restaurado.totalReferencias).toBe(3);
    expect(restaurado.puedeGenerar).toBe(true);
  });

  // ── Segunda ronda · M6 ─────────────────────────────────────────────────────────────────────────────────

  test("M6b · la cola de revisión va paginada y deja un solo apunte por carga", async () => {
    const { POR_PAGINA_REVISION } = await import("./consulta");
    const antes = await db()
      .select()
      .from(consentAccessLog)
      .where(and(eq(consentAccessLog.adminId, admin.id), eq(consentAccessLog.action, "listado")));
    const pagina = await pendientesDeRevision(actorAdmin, 1);
    expect(pagina.porPagina).toBe(POR_PAGINA_REVISION);
    expect(pagina.pagina).toBe(1);
    expect(pagina.elementos.length).toBeLessThanOrEqual(POR_PAGINA_REVISION);
    expect(pagina.total).toBeGreaterThanOrEqual(pagina.elementos.length);
    const despues = await db()
      .select()
      .from(consentAccessLog)
      .where(and(eq(consentAccessLog.adminId, admin.id), eq(consentAccessLog.action, "listado")));
    expect(despues.length).toBe(antes.length + 1);
  });

  // ── M7 ─────────────────────────────────────────────────────────────────────────────────────────────────

  test("M7 · un orden parcial de referencias se rechaza", async () => {
    const personaje = await nuevoPersonaje("Orden completo");
    const ids = (personaje.referencias ?? []).map((r) => r.id);
    const parcial = await rutaReferencias.PATCH(
      pedir(ana, `/api/personajes/${personaje.id}/referencias`, "PATCH", { ids: ids.slice(0, 2) }),
      ctx(personaje.id),
    );
    expect(parcial.status).toBe(400);
    expect((await parcial.json()).error).toContain("todas las referencias");
    // El completo, al revés, sí vale y cambia la portada.
    const completo = await rutaReferencias.PATCH(
      pedir(ana, `/api/personajes/${personaje.id}/referencias`, "PATCH", { ids: [...ids].reverse() }),
      ctx(personaje.id),
    );
    expect(completo.status).toBe(200);
    const reordenado = (await completo.json()) as PersonajeVista;
    expect(reordenado.referencias?.[0]?.id).toBe(ids.at(-1));
  });
});
