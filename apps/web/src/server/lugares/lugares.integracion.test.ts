import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { LugarResumen, LugarVista } from "@/lib/lugares";

/**
 * **Lugares**, contra el PostgreSQL local y con el proveedor simulado (nunca se llama a KIE).
 *
 * Lo que comprueba de punta a punta: que un lugar es de su dueño (404 para cualquier otro, también al usarlo), la
 * declaración obligatoria y lo que no admite (menores, gente reconocible), la versión que guarda cada trabajo, el
 * reparto a tres bandas con las mismas cifras en el aviso y en el envío, la maestra la última al enviar, el acabado
 * que tiene que casar y que borrar el lugar no borra ninguna foto ni nada de lo generado.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_lugares");
}

const { and, eq } = await import("drizzle-orm");
const rutaLugares = await import("@/app/api/lugares/route");
const rutaLugar = await import("@/app/api/lugares/[id]/route");
const rutaTrabajos = await import("@/app/api/generacion/trabajos/route");
const rutaControles = await import("@/app/api/generacion/controles/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const rutaProductos = await import("@/app/api/productos/route");
const rutaProducto = await import("@/app/api/productos/[id]/route");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaEscenas = await import("@/app/api/proyectos/[id]/escenas/route");
const rutaEscena = await import("@/app/api/escenas/[id]/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, media, projects, rateLimits, scenes, usageLedger, users } = await import("../db/esquema");
const { placeDeclarations, placeVersions } = await import("../db/esquema-lugares");
const { estimar, olvidarSaldos } = await import("../generacion/estimacion");
const { enviarEncolados } = await import("../cola/pasada");
const { subirFotoDePrueba } = await import("./lugar-de-prueba");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type Vista = { comprobaciones: { regla: string; motivo: string }[] };

const CLAVE_ANA = "sk-ana-clave-de-kie-inventada-lugares";

// ── Proveedor simulado ───────────────────────────────────────────────────────────────────────────────────

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

let subidas: string[] = [];
const enviados: Record<string, unknown>[] = [];

const buscar: Buscador = async (url, opciones) => {
  if (url.includes("/chat/credit")) return sobre(1_000_000);
  if (url.includes("file-stream-upload")) {
    const subida = `https://tempfile.kie.ai/ref-${subidas.length + 1}.png`;
    subidas.push(subida);
    return sobre({ downloadUrl: subida });
  }
  if (url.includes("createTask")) {
    enviados.push((JSON.parse(String(opciones?.body ?? "{}")) as { input?: Record<string, unknown> }).input ?? {});
    return sobre({ taskId: `lugar_${randomBytes(6).toString("hex")}` });
  }
  if (url.includes("recordInfo")) return sobre({ state: "waiting", failMsg: "" });
  throw new Error(`URL no simulada: ${url}`);
};

const h: Herramientas = {
  buscar,
  descargar: async (url) => ({ archivo: new File([new Uint8Array(8)], "x.png", { type: "image/png" }), origen: url }),
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

const errorDe = async (respuesta: Response) => ((await respuesta.json()) as { error?: string }).error ?? "";

describe.skipIf(!hayBaseDeDatos)("lugares: propiedad, declaración, versión, reparto y borrado", () => {
  let ana: Sesion;
  let beto: Sesion;
  let actorAna: Actor;
  let actorBeto: Actor;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_lugares");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    beto = await crearSesionDePrueba("user");
    actorAna = { id: ana.id, esAdmin: false };
    actorBeto = { id: beto.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE_ANA, buscar);
    await guardarAjustes(
      { presupuestoCreditos: 0, presupuestoTrabajo: 0, trabajosSimultaneos: 20, escenasEnVuelo: 10 },
      null,
    );
  });

  afterAll(async () => {
    for (const sesion of [ana, beto]) {
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
    subidas = [];
    enviados.length = 0;
    exigirBaseDeDatosDePrueba("escenara_pruebas_lugares");
    await db().delete(rateLimits);
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(usageLedger).where(eq(usageLedger.userId, ana.id));
    await db().delete(projects).where(eq(projects.userId, ana.id));
  });

  // ── Ayudas ──────────────────────────────────────────────────────────────────────────────────────────────

  async function nuevoLugar(sesion: Sesion, cuerpo: Record<string, unknown> = {}): Promise<LugarVista> {
    const respuesta = await rutaLugares.POST(
      pedir(sesion, "/api/lugares", "POST", {
        nombre: `Bar de barrio ${crypto.randomUUID().slice(0, 6)}`,
        descripcion: "Bar con azulejos verdes, barra de zinc y un ventanal a la calle.",
        ...cuerpo,
      }),
      undefined,
    );
    expect(respuesta.status).toBe(201);
    return (await respuesta.json()) as LugarVista;
  }

  const patchLugar = (sesion: Sesion, id: string, cuerpo: Record<string, unknown>) =>
    rutaLugar.PATCH(pedir(sesion, `/api/lugares/${id}`, "PATCH", cuerpo), ctx(id));

  const DECLARACION = {
    accion: "declarar",
    origenFotos: "propias",
    alcance: "personal",
    espacio: "exterior",
    personasVisibles: "ninguna",
    sinMenores: true,
  };

  /** Un lugar de Ana con su maestra y, si se pide, su declaración vigente. */
  async function lugarConMaestra(declarado = true): Promise<{ lugar: LugarVista; maestra: string }> {
    const lugar = await nuevoLugar(ana);
    const maestra = await subirFotoDePrueba(actorAna, "maestra.png");
    const conFoto = await patchLugar(ana, lugar.id, {
      accion: "anadir-fotos",
      fotos: [{ medioId: maestra, papel: "maestra" }],
    });
    expect(conFoto.status).toBe(200);
    if (!declarado) return { lugar: (await conFoto.json()) as LugarVista, maestra };
    const declarada = await patchLugar(ana, lugar.id, DECLARACION);
    expect(declarada.status).toBe(200);
    return { lugar: (await declarada.json()) as LugarVista, maestra };
  }

  /** Personaje propio con consentimiento y `n` fotos. */
  async function personajeConFotos(n: number): Promise<string> {
    const creado = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", { nombre: `Elisa ${crypto.randomUUID().slice(0, 6)}`, tipo: "persona" }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const { id } = (await creado.json()) as { id: string };
    const referencias = await Promise.all(
      Array.from({ length: n }, async (_, i) => ({ medioId: await subirFotoDePrueba(actorAna, `elisa-${i}.png`) })),
    );
    expect(
      (await rutaReferencias.POST(pedir(ana, `/api/personajes/${id}/referencias`, "POST", { referencias }), ctx(id)))
        .status,
    ).toBe(200);
    expect(
      (
        await rutaConsentimiento.POST(
          pedir(ana, `/api/personajes/${id}/consentimiento`, "POST", {
            titular: "yo",
            mayoriaDeEdad: true,
            alcance: "personal",
          }),
          ctx(id),
        )
      ).status,
    ).toBe(200);
    return id;
  }

  /** Producto con ocho fotos: más de las que caben junto al personaje y la maestra. */
  async function productoConOchoFotos(): Promise<string> {
    const creado = await rutaProductos.POST(
      pedir(ana, "/api/productos", "POST", {
        nombre: `Crema ${crypto.randomUUID().slice(0, 6)}`,
        tipo: "fisico",
      }),
      undefined,
    );
    const { id } = (await creado.json()) as { id: string };
    const papeles = ["etiqueta", "envase", "mecanismo", "suelto", "suelto", "suelto", "suelto", "suelto"];
    const fotos = await Promise.all(
      papeles.map(async (papel, i) => ({ medioId: await subirFotoDePrueba(actorAna, `crema-${i}.png`), papel })),
    );
    expect(
      (
        await rutaProducto.PATCH(
          pedir(ana, `/api/productos/${id}`, "PATCH", { accion: "anadir-fotos", fotos }),
          ctx(id),
        )
      ).status,
    ).toBe(200);
    return id;
  }

  async function pedirFotograma(sesion: Sesion, cuerpo: Record<string, unknown>, avisos: string[] = []) {
    const estimacion = await estimar(sesion.id, "fotograma", buscar);
    return rutaTrabajos.POST(
      pedir(sesion, "/api/generacion/trabajos", "POST", {
        tipo: "fotograma",
        prompt: "Elisa sonríe a cámara con una taza en la mano.",
        creditosConfirmados: estimacion.creditos,
        selloEstimacion: estimacion.sello,
        derechos: true,
        derechoMarca: true,
        sinTerceros: true,
        claveIdempotencia: crypto.randomUUID(),
        avisosConfirmados: avisos,
        ...cuerpo,
      }),
      undefined,
    );
  }

  const trabajosDeAna = () => db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id));

  async function proyectoDeAna(): Promise<{ proyectoId: string; escenaId: string }> {
    const creado = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", { titulo: "En el bar", formato: "reel_vertical", idea: "Un café." }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const proyectoId = ((await creado.json()) as { proyecto: { id: string } }).proyecto.id;
    const escena = await rutaEscenas.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/escenas`, "POST", { texto: "Qué buen café.", accion: "Plano medio" }),
      ctx(proyectoId),
    );
    expect(escena.status).toBe(201);
    const [fila] = await db().select().from(scenes).where(eq(scenes.projectId, proyectoId)).limit(1);
    return { proyectoId, escenaId: fila?.id ?? "" };
  }

  // ── Propiedad ───────────────────────────────────────────────────────────────────────────────────────────

  test("un lugar es de su dueño: otra persona no lo lista, no lo lee, no lo cambia, no lo borra y no lo usa", async () => {
    const { lugar } = await lugarConMaestra();
    const lista = (await (await rutaLugares.GET(pedir(beto, "/api/lugares"), undefined)).json()) as LugarResumen[];
    expect(lista.map((l) => l.id)).not.toContain(lugar.id);
    expect((await rutaLugar.GET(pedir(beto, `/api/lugares/${lugar.id}`), ctx(lugar.id))).status).toBe(404);
    const cambio = await patchLugar(beto, lugar.id, { nombre: "Mío" });
    expect(cambio.status).toBe(404);
    expect(await errorDe(cambio)).toBe("Ese lugar no existe.");
    expect((await patchLugar(beto, lugar.id, DECLARACION)).status).toBe(404);
    expect((await rutaLugar.DELETE(pedir(beto, `/api/lugares/${lugar.id}`, "DELETE"), ctx(lugar.id))).status).toBe(404);

    // Tampoco se puede usar: ni en «Crear», ni como lugar de un proyecto, ni en una escena.
    await guardarCredencial(beto.id, "kie", "sk-beto-clave-de-kie-inventada-lugares", buscar);
    const medio = await subirFotoDePrueba(actorBeto, "beto.png");
    const fotograma = await pedirFotograma(beto, { medioId: medio, lugar: { lugarId: lugar.id } });
    expect(fotograma.status).toBe(404);
    expect(await errorDe(fotograma)).toBe("Ese lugar no existe.");
    const proyecto = await rutaProyectos.POST(
      pedir(beto, "/api/proyectos", "POST", { titulo: "Ajeno", formato: "reel_vertical", lugarId: lugar.id }),
      undefined,
    );
    expect(proyecto.status).toBe(404);
    // Y una foto ajena no entra como foto de un lugar propio.
    const propio = await nuevoLugar(beto);
    const ajena = await subirFotoDePrueba(actorAna, "de-ana.png");
    const conAjena = await patchLugar(beto, propio.id, {
      accion: "anadir-fotos",
      fotos: [{ medioId: ajena, papel: "maestra" }],
    });
    expect(conAjena.status).toBe(404);
  });

  // ── Declaración ─────────────────────────────────────────────────────────────────────────────────────────

  test("la declaración no admite menores ni gente reconocible, y un interior exige permiso", async () => {
    const { lugar } = await lugarConMaestra(false);
    const sinMenores = await patchLugar(ana, lugar.id, { ...DECLARACION, sinMenores: false });
    expect(sinMenores.status).toBe(400);
    expect(await errorDe(sinMenores)).toContain("menor");
    const reconocibles = await patchLugar(ana, lugar.id, { ...DECLARACION, personasVisibles: "reconocibles" });
    expect(reconocibles.status).toBe(409);
    expect(await errorDe(reconocibles)).toContain("Retirar personas");
    const interior = await patchLugar(ana, lugar.id, { ...DECLARACION, espacio: "interior" });
    expect(interior.status).toBe(400);
    // «Retiradas» con la foto original como maestra no vale: la gente sigue en ella.
    const retiradas = await patchLugar(ana, lugar.id, { ...DECLARACION, personasVisibles: "retiradas" });
    expect(retiradas.status).toBe(409);
    const valida = await patchLugar(ana, lugar.id, { ...DECLARACION, espacio: "interior", permisoDelLugar: true });
    expect(valida.status).toBe(200);
    expect(((await valida.json()) as LugarVista).declarado).toBe(true);
    // Cambiar las fotos retira la declaración: hablaba de otras.
    const otra = await subirFotoDePrueba(actorAna, "otra.png");
    const conOtra = await patchLugar(ana, lugar.id, {
      accion: "anadir-fotos",
      fotos: [{ medioId: otra, papel: "detalle" }],
    });
    expect(((await conOtra.json()) as LugarVista).declarado).toBe(false);
  });

  test("sin declaración vigente no se genera con el lugar, y no se reserva nada", async () => {
    const { lugar } = await lugarConMaestra(false);
    const medio = await subirFotoDePrueba(actorAna, "partida.png");
    const consulta = await rutaControles.GET(
      pedir(ana, `/api/generacion/controles?tipo=fotograma&medioId=${medio}&lugarId=${lugar.id}`),
      undefined,
    );
    expect(((await consulta.json()) as Vista).comprobaciones.map((c) => c.regla)).toContain("lugar-sin-declaracion");
    const envio = await pedirFotograma(ana, { medioId: medio, lugar: { lugarId: lugar.id } });
    expect(envio.status).toBe(409);
    expect(await errorDe(envio)).toContain("declaración de derechos");
    expect(await trabajosDeAna()).toHaveLength(0);
    expect(await db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id))).toHaveLength(0);
  });

  // ── Fotograma situado: versión, reparto a tres bandas y envío ───────────────────────────────────────────

  test("personaje, producto y lugar: el aviso y el envío dicen las mismas cifras y la maestra viaja la última", async () => {
    const { lugar, maestra } = await lugarConMaestra();
    const personajeId = await personajeConFotos(6);
    const productoId = await productoConOchoFotos();
    const consulta = await rutaControles.GET(
      pedir(
        ana,
        `/api/generacion/controles?${new URLSearchParams({ tipo: "fotograma", personajeId, productoId, accion: "sostenerlo", lugarId: lugar.id })}`,
      ),
      undefined,
    );
    const aviso = ((await consulta.json()) as Vista).comprobaciones.find(
      (c) => c.regla === "producto-referencias-no-caben",
    );
    // Diez huecos: la maestra se lleva uno y los nueve restantes se reparten 6 y 3 entre el personaje y el producto.
    expect(aviso?.motivo).toContain("se envían 6 del personaje, 3 de «");
    expect(aviso?.motivo).toContain("y la foto maestra del lugar");

    const envio = await pedirFotograma(
      ana,
      {
        personajeId,
        producto: { productoId, accion: "sostenerlo" },
        lugar: { lugarId: lugar.id, sitio: "detrás de la barra" },
      },
      ["producto-referencias-no-caben"],
    );
    expect(envio.status).toBe(201);
    // ADR-0022: lo que ve el usuario es lo que escribió y la descripción de su lugar, nunca el prompt compuesto.
    const vista = (await envio.json()) as Record<string, unknown>;
    expect(vista.prompt).toBeUndefined();
    expect(JSON.stringify(vista)).not.toContain("The setting is");
    const ficha = await rutaLugar.GET(pedir(ana, `/api/lugares/${lugar.id}`), ctx(lugar.id));
    const textoFicha = JSON.stringify(await ficha.json());
    expect(textoFicha).toContain("Bar con azulejos verdes");
    expect(textoFicha).not.toContain("reference image");
    const [trabajo] = await trabajosDeAna();
    const entrada = trabajo?.input as {
      referencias: string[];
      referenciasProducto: string[];
      referenciasLugar: string[];
    };
    expect(entrada.referencias).toHaveLength(6);
    expect(entrada.referenciasProducto).toHaveLength(3);
    expect(entrada.referenciasLugar).toEqual([maestra]);
    expect(trabajo?.placeId).toBe(lugar.id);
    expect(trabajo?.placeVersion).toBe(lugar.version);
    // El prompt ancla C4 en la maestra y el «dónde»; el usuario nunca lo ve, pero es lo que se envía.
    expect(trabajo?.prompt).toContain("the last reference image");
    expect(trabajo?.prompt).toContain("Position within the place: detrás de la barra");

    await enviarEncolados(h);
    const urls = enviados[0]?.image_urls as string[];
    expect(urls).toHaveLength(10);
    expect(urls[urls.length - 1]).toBe(subidas[subidas.length - 1]);
  });

  test("cambiar la maestra crea una versión nueva con esa maestra e invalida la escena aprobada que usa el lugar", async () => {
    const { lugar } = await lugarConMaestra();
    const { proyectoId, escenaId } = await proyectoDeAna();
    const conLugar = await rutaEscena.PATCH(
      pedir(ana, `/api/escenas/${escenaId}`, "PATCH", { lugar: { lugarId: lugar.id, sitio: "junto al ventanal" } }),
      ctx(escenaId),
    );
    expect(conLugar.status).toBe(200);
    await db().update(scenes).set({ state: "aprobada", approvedAt: new Date() }).where(eq(scenes.id, escenaId));
    const nueva = await subirFotoDePrueba(actorAna, "maestra-nueva.png");
    const cambiada = (await (
      await patchLugar(ana, lugar.id, { accion: "anadir-fotos", fotos: [{ medioId: nueva, papel: "maestra" }] })
    ).json()) as LugarVista;
    expect(cambiada.version).toBe(lugar.version + 1);
    const [version] = await db()
      .select()
      .from(placeVersions)
      .where(and(eq(placeVersions.placeId, lugar.id), eq(placeVersions.number, cambiada.version)));
    expect(version?.masterMediaId).toBe(nueva);
    const [escena] = await db().select().from(scenes).where(eq(scenes.id, escenaId));
    expect(escena?.state).toBe("borrador");
    expect(escena?.invalidationReason).toContain(`versión ${cambiada.version} del lugar`);
    expect(proyectoId).not.toBe("");
  });

  // ── Acabado ─────────────────────────────────────────────────────────────────────────────────────────────

  test("el acabado tiene que casar: un proyecto animado rechaza un lugar real, en el servidor", async () => {
    const { lugar } = await lugarConMaestra();
    const { proyectoId, escenaId } = await proyectoDeAna();
    await db().update(projects).set({ renderStyle: "animado" }).where(eq(projects.id, proyectoId));
    const enEscena = await rutaEscena.PATCH(
      pedir(ana, `/api/escenas/${escenaId}`, "PATCH", { lugar: { lugarId: lugar.id } }),
      ctx(escenaId),
    );
    expect(enEscena.status).toBe(409);
    expect(await errorDe(enEscena)).toContain("no se mezclan acabados");
    const enProyecto = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", { titulo: "Real", formato: "reel_vertical", lugarId: lugar.id }),
      undefined,
    );
    expect(enProyecto.status).toBe(201);
  });

  test("el plano del lugar solo necesita lugar y no admite producto", async () => {
    const { escenaId } = await proyectoDeAna();
    const sinLugar = await rutaEscena.PATCH(
      pedir(ana, `/api/escenas/${escenaId}`, "PATCH", { lugar: { heredar: true, plano: "solo_lugar" } }),
      ctx(escenaId),
    );
    expect(sinLugar.status).toBe(409);
    expect(await errorDe(sinLugar)).toContain("necesita un lugar");
    const { lugar } = await lugarConMaestra();
    const productoId = await productoConOchoFotos();
    const conProducto = await rutaEscena.PATCH(
      pedir(ana, `/api/escenas/${escenaId}`, "PATCH", {
        producto: { productoId, accion: "sostenerlo" },
        lugar: { lugarId: lugar.id, plano: "solo_lugar" },
      }),
      ctx(escenaId),
    );
    expect(conProducto.status).toBe(409);
    expect(await errorDe(conProducto)).toContain("sin producto");
    const solo = await rutaEscena.PATCH(
      pedir(ana, `/api/escenas/${escenaId}`, "PATCH", { lugar: { lugarId: lugar.id, plano: "solo_lugar" } }),
      ctx(escenaId),
    );
    expect(solo.status).toBe(200);
  });

  // ── Borrado ─────────────────────────────────────────────────────────────────────────────────────────────

  test("con trabajos en marcha no se borra; el worker no envía uno cuyo lugar ya no está", async () => {
    const { lugar } = await lugarConMaestra();
    const medio = await subirFotoDePrueba(actorAna, "partida.png");
    expect((await pedirFotograma(ana, { medioId: medio, lugar: { lugarId: lugar.id } })).status).toBe(201);
    const bloqueado = await rutaLugar.DELETE(pedir(ana, `/api/lugares/${lugar.id}`, "DELETE"), ctx(lugar.id));
    expect(bloqueado.status).toBe(409);
    expect(await errorDe(bloqueado)).toContain("trabajo en marcha");
    // Si el lugar desaparece igualmente (el trabajo lo pierde), el worker lo cierra sin enviar nada ni cobrar.
    await db().update(generationJobs).set({ placeId: null }).where(eq(generationJobs.userId, ana.id));
    await enviarEncolados(h);
    expect(enviados).toHaveLength(0);
    const [trabajo] = await trabajosDeAna();
    expect(trabajo?.state).toBe("fallido");
    expect(trabajo?.errorMessage).toContain("se ha borrado");
    expect(trabajo?.errorMessage).toContain("no se te ha cobrado");
  });

  test("borrar un lugar no borra fotos, generados ni declaraciones, y devuelve a borrador la escena aprobada", async () => {
    const { lugar, maestra } = await lugarConMaestra();
    const { escenaId } = await proyectoDeAna();
    await rutaEscena.PATCH(
      pedir(ana, `/api/escenas/${escenaId}`, "PATCH", { lugar: { lugarId: lugar.id } }),
      ctx(escenaId),
    );
    const medio = await subirFotoDePrueba(actorAna, "partida.png");
    expect((await pedirFotograma(ana, { medioId: medio, lugar: { lugarId: lugar.id } })).status).toBe(201);
    const resultado = await subirFotoDePrueba(actorAna, "resultado.png");
    // El trabajo ha terminado: ya no está en marcha y se puede borrar el lugar.
    await db()
      .update(generationJobs)
      .set({ resultMediaId: resultado, state: "listo" })
      .where(eq(generationJobs.userId, ana.id));
    await db().update(scenes).set({ state: "aprobada", approvedAt: new Date() }).where(eq(scenes.id, escenaId));
    const [pedido] = await trabajosDeAna();
    const declaracionUsada = (pedido?.input as { declaracionLugar?: string }).declaracionLugar;
    expect(declaracionUsada).toBeDefined();

    const resumen = await rutaLugar.GET(pedir(ana, `/api/lugares/${lugar.id}?borrado=1`), ctx(lugar.id));
    expect(await resumen.json()).toMatchObject({ referencias: 1, escenas: 1, trabajos: 1, generados: 1 });
    expect((await rutaLugar.DELETE(pedir(ana, `/api/lugares/${lugar.id}`, "DELETE"), ctx(lugar.id))).status).toBe(200);

    const fotos = await db().select().from(media).where(eq(media.ownerId, ana.id));
    expect(fotos.find((m) => m.id === maestra)?.deletedAt).toBeNull();
    expect(fotos.find((m) => m.id === resultado)?.deletedAt).toBeNull();
    const [trabajo] = await trabajosDeAna();
    expect(trabajo?.placeId).toBeNull();
    expect(trabajo?.placeVersion).toBe(lugar.version);
    // La declaración con la que se generó sigue ahí, revocada y con el nombre del lugar.
    const [declaracion] = await db()
      .select()
      .from(placeDeclarations)
      .where(eq(placeDeclarations.id, declaracionUsada ?? ""));
    expect(declaracion?.placeId).toBeNull();
    expect(declaracion?.placeName).toBe(lugar.nombre);
    expect(declaracion?.revokedAt).not.toBeNull();
    const [escena] = await db().select().from(scenes).where(eq(scenes.id, escenaId));
    expect(escena?.placeId).toBeNull();
    expect(escena?.state).toBe("borrador");
    expect(escena?.invalidationReason).toContain(`Se ha borrado el lugar «${lugar.nombre}»`);
    expect(escena?.scriptText).toBe("Qué buen café.");
  });
});
