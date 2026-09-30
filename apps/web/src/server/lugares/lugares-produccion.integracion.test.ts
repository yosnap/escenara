import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { ProyectoDetalle } from "@/lib/proyectos";

/**
 * **La pantalla de producción y el envío dicen lo mismo del lugar.** Cada tarjeta de escena se evalúa con la misma
 * función que el siguiente envío de esa escena (`repartoCompletoDelEnvio`): los avisos que se confirman (sin maestra,
 * la maestra no cabe) salen con su casilla y, confirmados, el envío pasa; los que bloquean (sin declaración) se ven
 * antes de pulsar y el envío los rechaza igual. Casos: fotograma normal con cupo 2, lugar sin maestra, sin
 * declaración, pantalla apagada del producto digital, plano del lugar solo, hoja 3×3, escena hablada de Omni,
 * dualcast y canto. Proveedor simulado: no se llama a nadie ni se gasta nada.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_lugares_produccion");
}

const { eq } = await import("drizzle-orm");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaEscenas = await import("@/app/api/proyectos/[id]/escenas/route");
const rutaPlan = await import("@/app/api/proyectos/[id]/plan/route");
const rutaVoz = await import("@/app/api/proyectos/[id]/voz/route");
const rutaReparto = await import("@/app/api/escenas/[id]/reparto/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characters, generationJobs, models, projects, rateLimits, scenes, usageLedger, users } = await import(
  "../db/esquema"
);
const { products, productReferences } = await import("../db/esquema-productos");
const { olvidarSaldos } = await import("../generacion/estimacion");
const { olvidarCatalogo, listarModelos } = await import("../proveedores/catalogo");
const { cambiarEstadoDeModelo, cambiarPrecioDeModelo } = await import("../proveedores/catalogo-admin");
const { estadoDeProduccion } = await import("../produccion/consulta");
const { producirEscena } = await import("../produccion/producir");
const { editarEscena } = await import("../asistente/escenas");
const { registrarPersonajeOmni } = await import("../personajes/omni");
const { registrarVozOmni, validarEleccionVozOmni } = await import("../voz/omni");
const { MODELOS_OMNI, VOCES_OMNI } = await import("@/lib/omni");
const { lugarDeclaradoDePrueba, subirFotoDePrueba } = await import("./lugar-de-prueba");
const { revocarDeclaracionDeLugar } = await import("./declaracion");
const { anadirFotosAlLugar, crearLugar } = await import("./servicio");
const { declararLugar } = await import("./declaracion");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type Buscador = import("../proveedores/codigos").Buscador;
type Vista = { comprobaciones: { regla: string; estado: string; confirmable: boolean }[] };

const EJECUCION = randomBytes(4).toString("hex");
let registros = 0;
const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const buscar: Buscador = async (url, opciones) => {
  if (url.includes("/chat/credit")) return sobre(1_000_000);
  if (url.includes("file-stream-upload")) return sobre({ downloadUrl: "https://tempfile.kie.ai/retrato.png" });
  if (url.includes("/omni/audio/create")) {
    const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { audio_id?: string };
    return sobre({ audioId: `audio_${EJECUCION}_${cuerpo.audio_id}`, name: "voz" });
  }
  if (url.includes("/omni/character/create")) {
    registros++;
    return sobre({ characterId: `char_${EJECUCION}_${registros}`, characterName: "x", imageUrl: "", bodyImageUrl: "" });
  }
  throw new Error(`URL no simulada: ${url}`);
};
const h = { buscar, descargar: async () => ({ archivo: new File([], "x"), origen: "" }) };
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

describe.skipIf(!hayBaseDeDatos)("lugar: la pantalla de producción dice lo mismo que el envío", () => {
  let ana: Sesion;
  let admin: Sesion;
  let actor: Actor;
  let lucia: string;
  let elisa: string;
  let fisico: string;
  let digital: string;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;
  const parametrosOriginales = new Map<string, string>();

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_lugares_produccion");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    admin = await crearSesionDePrueba("admin");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", "sk-ana-clave-de-kie-inventada-produccion-lugar", buscar);
    await guardarAjustes(
      { presupuestoCreditos: 0, presupuestoTrabajo: 0, trabajosSimultaneos: 50, escenasEnVuelo: 20 },
      null,
    );
    await guardarAjustes({ repartoPodcastActivo: true, repartoDualcastActivo: true }, null);
    await precioDeOmni();
    lucia = await personaje("Lucía", 6);
    elisa = await personaje("Elisa", 3);
    fisico = await producto("fisico", ["etiqueta", "envase", "suelto"]);
    digital = await producto("digital", ["captura_pantalla", "captura_pantalla", "captura_pantalla"]);
  });

  afterAll(async () => {
    for (const [id, parametros] of parametrosOriginales) {
      await db().update(models).set({ parameters: parametros }).where(eq(models.id, id));
    }
    olvidarCatalogo();
    for (const sesion of [ana, admin]) if (sesion?.email) await db().delete(users).where(eq(users.email, sesion.email));
    await guardarAjustes(
      {
        presupuestoCreditos: ajustesPrevios.presupuestoCreditos,
        presupuestoTrabajo: ajustesPrevios.presupuestoTrabajo,
        trabajosSimultaneos: ajustesPrevios.trabajosSimultaneos,
        escenasEnVuelo: ajustesPrevios.escenasEnVuelo,
        repartoPodcastActivo: ajustesPrevios.repartoPodcastActivo,
        repartoDualcastActivo: ajustesPrevios.repartoDualcastActivo,
      },
      null,
    );
  });

  beforeEach(async () => {
    olvidarSaldos();
    exigirBaseDeDatosDePrueba("escenara_pruebas_lugares_produccion");
    await db().delete(rateLimits);
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(usageLedger).where(eq(usageLedger.userId, ana.id));
    await db().delete(projects).where(eq(projects.userId, ana.id));
  });

  // ── Preparativos ────────────────────────────────────────────────────────────────────────────────────────

  async function precioDeOmni(): Promise<void> {
    olvidarCatalogo();
    const candidatos = await listarModelos({ capacidad: "image_to_video" });
    const [modelo] = MODELOS_OMNI.flatMap((nombre) => candidatos.filter((m) => m.modelo === nombre));
    if (!modelo) throw new Error("Falta el modelo de escenas habladas en el catálogo de pruebas.");
    await cambiarPrecioDeModelo(
      { modeloId: modelo.id, creditos: 63, fuente: "Medido con dinero real el 2026-09-28.", comprobado: "2026-09-28" },
      admin.id,
    );
    olvidarCatalogo();
    await cambiarEstadoDeModelo(
      { modeloId: modelo.id, estado: "validado", evidencia: "Medido con dinero real el 2026-09-28." },
      admin.id,
    );
    olvidarCatalogo();
  }

  async function personaje(nombre: string, fotos: number): Promise<string> {
    const creado = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", {
        nombre: `${nombre} ${crypto.randomUUID().slice(0, 6)}`,
        tipo: "persona",
      }),
      undefined,
    );
    const { id } = (await creado.json()) as { id: string };
    const referencias = await Promise.all(
      Array.from({ length: fotos }, async (_, i) => ({
        medioId: await subirFotoDePrueba(actor, `${nombre}-${i}.png`),
      })),
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

  /** Deja el modelo de fotograma de la instalación con `cupo` referencias; se restaura al terminar. */
  async function conCupo(cupo: number): Promise<void> {
    const modelo = (await estadoDeCualquierModelo()).modelo;
    const [fila] = await db().select().from(models).where(eq(models.modelId, modelo)).limit(1);
    if (!fila) throw new Error("Falta el modelo de fotograma.");
    if (!parametrosOriginales.has(fila.id)) parametrosOriginales.set(fila.id, fila.parameters);
    const parametros = JSON.parse(parametrosOriginales.get(fila.id) ?? "{}") as Record<string, unknown>;
    await db()
      .update(models)
      .set({ parameters: JSON.stringify({ ...parametros, maximoReferencias: cupo }) })
      .where(eq(models.id, fila.id));
    olvidarCatalogo();
  }
  const estadoDeCualquierModelo = async () => {
    const { estimar } = await import("../generacion/estimacion");
    return estimar(ana.id, "fotograma", buscar);
  };

  /** Un proyecto con una escena, lo que se pida en ella y el plan aprobado. */
  async function proyectoCon(escena: Record<string, unknown>, opciones: { omni?: boolean; segunda?: string } = {}) {
    const creado = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", {
        titulo: "En el bar",
        formato: "reel_vertical",
        idea: "Una mañana en el bar de la esquina.",
        personajeId: lucia,
        presupuestoCreditos: 100_000,
        segundosClip: 4,
      }),
      undefined,
    );
    const proyectoId = ((await creado.json()) as ProyectoDetalle).proyecto.id;
    await rutaEscenas.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/escenas`, "POST", {
        texto: "Qué buen café hacen aquí.",
        accion: "Plano medio en la barra, sonríe a cámara",
        segundos: 4,
      }),
      ctx(proyectoId),
    );
    const [fila] = await db().select().from(scenes).where(eq(scenes.projectId, proyectoId));
    const escenaId = fila?.id ?? "";
    if (opciones.omni) {
      await rutaVoz.POST(
        pedir(ana, `/api/proyectos/${proyectoId}/voz`, "POST", { accion: "fijar-modo", modo: "omni" }),
        ctx(proyectoId),
      );
      await registrarVozOmni(
        actor,
        proyectoId,
        validarEleccionVozOmni({
          voz: VOCES_OMNI[0]?.id ?? "",
          descripcion: "Voz natural en español de España, acento peninsular, tono cercano.",
          ejemplo: "Hola, así suena mi voz cuando cuento algo.",
        }),
        false,
        h,
      );
      const [proyecto] = await db().select().from(projects).where(eq(projects.id, proyectoId));
      for (const id of [lucia, ...(opciones.segunda ? [opciones.segunda] : [])]) {
        await registrarPersonajeOmni(actor, id, proyecto?.omniAudioId ?? "", h);
      }
      if (opciones.segunda) {
        const reparto = (cuerpo: Record<string, unknown>) =>
          rutaReparto.PATCH(pedir(ana, `/api/escenas/${escenaId}/reparto`, "PATCH", cuerpo), ctx(escenaId));
        await reparto({ formato: "dualcast" });
        await reparto({ accion: "anadir", personajeId: opciones.segunda });
      }
    }
    await editarEscena(actor, escenaId, escena);
    const { detalleProyecto } = await import("../asistente/plan");
    const antes = await detalleProyecto(actor, proyectoId);
    const aprobado = await rutaPlan.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/plan`, "POST", {
        presupuestoCreditos: 100_000,
        totalConfirmado: antes.plan.totalCreditos,
      }),
      ctx(proyectoId),
    );
    if (aprobado.status !== 200) throw new Error(await aprobado.text());
    return { proyectoId, escenaId };
  }

  /** Las reglas del lugar que enseña la tarjeta de la escena, y el resultado de producirla confirmando lo que ofrece. */
  async function pantallaYEnvio(proyectoId: string, escenaId: string, omni = false) {
    const estado = await estadoDeProduccion(actor, proyectoId);
    const tarjeta = estado.escenas.find((e) => e.id === escenaId);
    const controles = (tarjeta?.controles ?? { comprobaciones: [] }) as Vista;
    const delLugar = controles.comprobaciones.filter((c) => c.regla.startsWith("lugar-"));
    const confirmables = [...controles.comprobaciones, ...(estado.controlesDelModelo as Vista).comprobaciones].filter(
      (c) => c.confirmable,
    );
    const producir = async (avisos: string[]) => {
      await db().delete(rateLimits);
      try {
        await producirEscena(
          actor,
          escenaId,
          {
            derechos: true,
            derechoMarca: true,
            sinTerceros: true,
            creditosConfirmados: omni ? estado.creditosPorClip : estado.creditosPorFotograma,
            selloEstimacion: omni ? estado.selloClip : estado.selloFotograma,
            claveIdempotencia: crypto.randomUUID(),
            avisoUmbralAceptado: true,
            avisosConfirmados: [...avisos, "reparto-misma-voz", "reparto-sin-turnos", "reparto-dialogo-largo"],
          },
          h,
        );
        return "";
      } catch (error) {
        return (error as Error).message;
      }
    };
    const todos = confirmables.map((c) => c.regla);
    return {
      delLugar,
      sinConfirmarElLugar: () => producir(todos.filter((r) => !r.startsWith("lugar-"))),
      confirmandoLoQueOfrece: () => producir(todos),
    };
  }

  const trabajoDe = async (escenaId: string) =>
    (await db().select().from(generationJobs).where(eq(generationJobs.sceneId, escenaId)))[0];

  // ── Casos ───────────────────────────────────────────────────────────────────────────────────────────────

  test("cupo 2, personaje de 6 fotos, producto de 3 y lugar: la tarjeta ofrece «solo descrito» y el envío lo acepta", async () => {
    await conCupo(2);
    const { lugar } = await lugarDeclaradoDePrueba(actor, "Bar");
    const { proyectoId, escenaId } = await proyectoCon({
      producto: { productoId: fisico, accion: "sostenerlo" },
      lugar: { lugarId: lugar.id },
    });
    const { delLugar, sinConfirmarElLugar, confirmandoLoQueOfrece } = await pantallaYEnvio(proyectoId, escenaId);
    expect(delLugar.map((c) => [c.regla, c.confirmable])).toEqual([["lugar-maestra-no-cabe", true]]);
    expect(await sinConfirmarElLugar()).toContain("no cabe la foto maestra");
    expect(await confirmandoLoQueOfrece()).toBe("");
    const entrada = (await trabajoDe(escenaId))?.input as { referenciasLugar?: string[] };
    expect(entrada.referenciasLugar).toBeUndefined();
  });

  test("lugar sin foto maestra: la tarjeta lo avisa con su casilla y el envío pasa al confirmarlo", async () => {
    await conCupo(10);
    const lugar = await crearLugar(actor, { nombre: `Sin maestra ${crypto.randomUUID().slice(0, 6)}` });
    await anadirFotosAlLugar(actor, lugar.id, [
      { medioId: await subirFotoDePrueba(actor, "detalle.png"), papel: "detalle" },
    ]);
    await declararLugar(actor, lugar.id, {
      origenFotos: "propias",
      alcance: "personal",
      espacio: "exterior",
      personasVisibles: "ninguna",
      sinMenores: true,
    });
    const { proyectoId, escenaId } = await proyectoCon({ lugar: { lugarId: lugar.id } });
    const { delLugar, sinConfirmarElLugar, confirmandoLoQueOfrece } = await pantallaYEnvio(proyectoId, escenaId);
    expect(delLugar.map((c) => [c.regla, c.confirmable])).toEqual([["lugar-sin-maestra", true]]);
    expect(await sinConfirmarElLugar()).toContain("no tiene foto maestra");
    expect(await confirmandoLoQueOfrece()).toBe("");
  });

  test("sin declaración: la tarjeta lo bloquea antes de pulsar y el envío lo rechaza igual", async () => {
    await conCupo(10);
    const { lugar } = await lugarDeclaradoDePrueba(actor, "Patio", { declarado: false });
    const { proyectoId, escenaId } = await proyectoCon({ lugar: { lugarId: lugar.id } });
    const { delLugar, confirmandoLoQueOfrece } = await pantallaYEnvio(proyectoId, escenaId);
    expect(delLugar.map((c) => [c.regla, c.estado])).toEqual([["lugar-sin-declaracion", "bloqueado"]]);
    expect(await confirmandoLoQueOfrece()).toContain("declaración de derechos");
  });

  test("pantalla apagada del producto digital con cupo 1: la maestra no cabe en la tarjeta ni en el envío", async () => {
    await conCupo(1);
    const { lugar } = await lugarDeclaradoDePrueba(actor, "Oficina");
    const { proyectoId, escenaId } = await proyectoCon({
      producto: { productoId: digital, accion: "sostenerlo" },
      lugar: { lugarId: lugar.id },
    });
    const { delLugar, sinConfirmarElLugar, confirmandoLoQueOfrece } = await pantallaYEnvio(proyectoId, escenaId);
    expect(delLugar.map((c) => c.regla)).toEqual(["lugar-maestra-no-cabe"]);
    expect(await sinConfirmarElLugar()).toContain("no cabe la foto maestra");
    expect(await confirmandoLoQueOfrece()).toBe("");
    const trabajo = await trabajoDe(escenaId);
    expect(trabajo?.digitalStep).toBe("pantalla_negra");
  });

  test("plano del lugar solo: parte de la maestra, la tarjeta no pide nada del cupo y el envío pasa", async () => {
    await conCupo(1);
    const { lugar, maestra } = await lugarDeclaradoDePrueba(actor, "Calle");
    const { proyectoId, escenaId } = await proyectoCon({ lugar: { lugarId: lugar.id, plano: "solo_lugar" } });
    const { delLugar, confirmandoLoQueOfrece } = await pantallaYEnvio(proyectoId, escenaId);
    expect(delLugar).toEqual([]);
    expect(await confirmandoLoQueOfrece()).toBe("");
    const trabajo = await trabajoDe(escenaId);
    expect(trabajo?.sourceMediaId).toBe(maestra);
    expect(trabajo?.characterId).toBeNull();
  });

  test("hoja 3×3 por defecto con cupo 3: cabe la maestra en la tarjeta y en el envío", async () => {
    await conCupo(3);
    const hoja = await subirFotoDePrueba(actor, "hoja.png");
    await db()
      .update(characters)
      .set({ identitySheetMediaId: hoja, identitySheetStatus: "por_defecto" })
      .where(eq(characters.id, lucia));
    try {
      const { lugar } = await lugarDeclaradoDePrueba(actor, "Bar");
      const { proyectoId, escenaId } = await proyectoCon({
        producto: { productoId: fisico, accion: "sostenerlo" },
        lugar: { lugarId: lugar.id },
      });
      const { delLugar, confirmandoLoQueOfrece } = await pantallaYEnvio(proyectoId, escenaId);
      expect(delLugar).toEqual([]);
      expect(await confirmandoLoQueOfrece()).toBe("");
      const entrada = (await trabajoDe(escenaId))?.input as { referencias?: string[]; referenciasLugar?: string[] };
      expect(entrada.referencias).toEqual([hoja]);
      expect(entrada.referenciasLugar).toHaveLength(1);
    } finally {
      await db()
        .update(characters)
        .set({ identitySheetMediaId: null, identitySheetStatus: "descartada" })
        .where(eq(characters.id, lucia));
    }
  });

  test("escena hablada de Omni: el lugar va descrito, sin avisos del cupo; revocada la declaración, los dos lo bloquean", async () => {
    await conCupo(1);
    const { lugar } = await lugarDeclaradoDePrueba(actor, "Plaza");
    const { proyectoId, escenaId } = await proyectoCon({ lugar: { lugarId: lugar.id } }, { omni: true });
    const antes = await pantallaYEnvio(proyectoId, escenaId, true);
    expect(antes.delLugar).toEqual([]);
    await revocarDeclaracionDeLugar(actor, lugar.id, "Prueba");
    const despues = await pantallaYEnvio(proyectoId, escenaId, true);
    expect(despues.delLugar.map((c) => [c.regla, c.estado])).toEqual([["lugar-sin-declaracion", "bloqueado"]]);
    expect(await despues.confirmandoLoQueOfrece()).toContain("declaración de derechos");
  });

  test("dualcast: el lugar va descrito en la tarjeta y en el envío, y el clip lleva el lugar", async () => {
    await conCupo(1);
    const { lugar } = await lugarDeclaradoDePrueba(actor, "Salón");
    const { proyectoId, escenaId } = await proyectoCon(
      { lugar: { lugarId: lugar.id } },
      { omni: true, segunda: elisa },
    );
    const { delLugar, confirmandoLoQueOfrece } = await pantallaYEnvio(proyectoId, escenaId, true);
    expect(delLugar).toEqual([]);
    expect(await confirmandoLoQueOfrece()).toBe("");
    const trabajo = await trabajoDe(escenaId);
    expect(trabajo?.placeId).toBe(lugar.id);
    expect((trabajo?.input as { referenciasLugar?: string[] } | undefined)?.referenciasLugar).toBeUndefined();
  });

  test("canto: no usa el lugar, así que la tarjeta no dice nada de él aunque no esté declarado", async () => {
    await conCupo(10);
    const { lugar } = await lugarDeclaradoDePrueba(actor, "Escenario", { declarado: false });
    const { proyectoId, escenaId } = await proyectoCon({ lugar: { lugarId: lugar.id } });
    expect((await pantallaYEnvio(proyectoId, escenaId)).delLugar.map((c) => c.regla)).toEqual([
      "lugar-sin-declaracion",
    ]);
    // El canto se genera con su propio envío (la canción y el retrato), sin fotograma ni lugar.
    await db().update(scenes).set({ clipFormat: "cantar" }).where(eq(scenes.id, escenaId));
    expect((await pantallaYEnvio(proyectoId, escenaId)).delLugar).toEqual([]);
  });
});
