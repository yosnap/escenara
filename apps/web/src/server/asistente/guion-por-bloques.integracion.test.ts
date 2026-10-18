import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { PersonajeVista } from "@/lib/personajes";
import type { ProyectoDetalle } from "@/lib/proyectos";

/**
 * El guion de un **vídeo completo** contra el PostgreSQL local, con el modelo de texto **simulado**: ningún test
 * llama a KIE ni gasta un crédito. El simulador lee lo que se le pide (cuántos clips, quién sale, qué parte) y
 * contesta un guion que encaja, salvo cuando un test le pide cortar la respuesta o pasarse de palabras.
 *
 * Fija lo que promete la versión:
 *
 * - 20 s son 2 escenas de 10 s (3 en podcast, de 8 + 6 + 6 s) en **una** llamada;
 * - 1 y 3 min se rechazan **en la API** con el ajuste apagado y se escriben en biblia + bloques con él encendido;
 * - un bloque cortado se repite **solo ese bloque**, y con la causa;
 * - si falla otra vez, error visible con el proveedor y lo cobrado, y **no se guarda ninguna escena nueva**;
 * - la continuidad: cada bloque recibe los últimos turnos del anterior;
 * - la misma confirmación no paga dos veces, y el gasto cerrado no pasa de lo confirmado.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_guion_bloques");
}

const { eq, inArray } = await import("drizzle-orm");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { models, projects, sceneCharacters, sceneDialogueTurns, scenes, usageLedger, users } = await import(
  "../db/esquema"
);
const { guardarAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { crearMedio } = await import("../media/servicio");
const { olvidarCatalogo } = await import("../proveedores/catalogo");
const { escribirGuion } = await import("./generar");
const { detalleProyecto } = await import("./plan");
const { INSTRUCCIONES_BIBLIA } = await import("./instrucciones-guion");
type Buscador = import("../proveedores/codigos").Buscador;
type Actor = import("../media/servicio").Actor;

const CLAVE = ["clave", "de", "prueba", "inventada"].join("-");
/** Créditos que se estiman por llamada: el precio sembrado es 1,5 y la estimación redondea al alza. */
const CREDITOS_TEXTO = 2;
const CREDITOS_INFORMADOS = 1.5;

// ── Proveedor simulado ───────────────────────────────────────────────────────────────────────────────────

interface Pedido {
  sistema: string;
  usuario: string;
}

const pedidos: Pedido[] = [];
/** Parte que el simulador contesta cortada y cuántas veces más: `0` es el guion de 20 s; `n`, el bloque n. */
let cortar: { parte: number; veces: number } | null = null;
/** Palabras de cada clip, para simular un modelo que se pasa de largo. */
let palabrasPorClip: number | null = null;

const parteDe = (usuario: string): number => Number(/This is part (\d+) of/.exec(usuario)?.[1] ?? 0);

function contestar(pedido: Pedido): string {
  if (pedido.sistema === INSTRUCCIONES_BIBLIA) {
    const partes = Number(/Parts: (\d+)\./.exec(pedido.usuario)?.[1] ?? 1);
    return JSON.stringify({
      concept: "Una mañana entera hablando de café en la azotea.",
      characters: [{ speaker: "A", role: "Presentadora", wardrobe: "Jersey azul marino" }],
      setting: "Azotea al amanecer",
      arc: Array.from({ length: partes }, (_, i) => `Objetivo de la parte ${i + 1}`),
    });
  }
  const parte = parteDe(pedido.usuario);
  const clips = [...pedido.usuario.matchAll(/Clip (\d+): \d+ seconds.*on screen: ([AB](?: and [AB])?)\./g)].map(
    ([, orden, presentes]) => {
      const quien = (presentes ?? "A").split(" and ");
      const texto = (h: string) =>
        palabrasPorClip === null
          ? `Frase ${orden} de ${h} en la parte ${parte}.`
          : Array.from({ length: palabrasPorClip }, (_, i) => `palabra${i}`).join(" ");
      return {
        shot: "medium",
        action: `Plano medio del clip ${orden}`,
        turns: quien.map((h) => ({ speaker: h, text: texto(h) })),
      };
    },
  );
  const json = JSON.stringify({ concept: "Una rutina tranquila de café.", clips });
  if (cortar && cortar.parte === parte && cortar.veces > 0) {
    cortar.veces--;
    return json.slice(0, Math.floor(json.length / 2));
  }
  return json;
}

const buscar: Buscador = async (url, init) => {
  if (url.includes("/chat/credit")) return sobre(5000);
  if (url.includes("/codex/v1/responses")) {
    const cuerpo = JSON.parse(String(init?.body ?? "{}")) as { input?: { content: string }[] };
    const pedido = { sistema: cuerpo.input?.[0]?.content ?? "", usuario: cuerpo.input?.[1]?.content ?? "" };
    pedidos.push(pedido);
    return new Response(
      JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: contestar(pedido) }] }],
        usage: { input_tokens: 120, output_tokens: 300 },
        credits_consumed: CREDITOS_INFORMADOS,
        status: "completed",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  if (url.includes("file-stream-upload")) return sobre({ downloadUrl: "https://tempfile.kie.ai/referencia.png" });
  throw new Error(`URL no simulada: ${url}`);
};

function sobre(data: unknown): Response {
  return new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

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

async function foto(): Promise<File> {
  const png = await sharp({
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
  const copia = new Uint8Array(new ArrayBuffer(png.byteLength));
  copia.set(png);
  return new File([copia], "referencia.png", { type: "image/png" });
}

describe.skipIf(!hayBaseDeDatos)("guion de un vídeo completo", () => {
  let ana: Sesion;
  let admin: Sesion;
  let actor: Actor;
  let lucia: PersonajeVista;
  let mario: PersonajeVista;
  let proyectoId = "";

  beforeAll(async () => {
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    admin = await crearSesionDePrueba("admin");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    await guardarAjustes(
      { presupuestoCreditos: 100_000, avisoCreditos: 100_000, asistenteActivo: true, videoDuracionesLargas: false },
      admin.id,
    );
    await db()
      .update(models)
      .set({ state: "compatible", evidence: "Simulado en el test del guion por bloques." })
      .where(eq(models.modelId, "gpt-5-6-sol"));
    olvidarCatalogo();
    lucia = await nuevoPersonaje("Lucía");
    mario = await nuevoPersonaje("Mario");
    const creado = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", {
        titulo: "Café en la azotea",
        formato: "reel_vertical",
        idea: "Una charla tranquila sobre cómo preparar un buen café por la mañana.",
        personajeId: lucia.id,
        presupuestoCreditos: 100_000,
      }),
      undefined,
    );
    expect(creado.status).toBe(201);
    proyectoId = ((await creado.json()) as ProyectoDetalle).proyecto.id;
    // El vídeo completo se produce con la voz e identidad registradas: el modo se fija directamente, porque lo que
    // se prueba aquí es el guion y no el registro de la voz.
    await db().update(projects).set({ voiceMode: "omni" }).where(eq(projects.id, proyectoId));
  });

  beforeEach(() => {
    cortar = null;
    palabrasPorClip = null;
  });

  afterAll(async () => {
    await guardarAjustes({ asistenteActivo: false, videoDuracionesLargas: false }, admin.id);
    await db().update(models).set({ state: "descubierto" }).where(eq(models.modelId, "gpt-5-6-sol"));
    olvidarCatalogo();
    await db().delete(users).where(eq(users.id, ana.id));
    await db().delete(users).where(eq(users.id, admin.id));
  });

  test("las condiciones del vídeo completo viajan con el proyecto", async () => {
    const detalle = await leer();
    expect(detalle.videoCompleto?.modoVoz).toBe("omni");
    expect(detalle.videoCompleto?.largasActivas).toBe(false);
  });

  test("con el ajuste apagado, 1 y 3 min se rechazan en el servidor con el motivo y sin llamar a nadie", async () => {
    const antes = pedidos.length;
    for (const duracion of [60, 180]) {
      const peticion = await confirmacion(duracion);
      const fallo = await error(() => escribirGuion(actor, proyectoId, peticion, buscar));
      expect(fallo.estado).toBe(409);
      expect(fallo.message).toContain("no están abiertas");
    }
    expect(pedidos).toHaveLength(antes);
  });

  test("20 s de una persona: dos escenas de 10 s en una llamada, y el gasto no pasa de lo confirmado", async () => {
    const antes = pedidos.length;
    await consumido();
    const peticion = await confirmacion(20);
    const detalle = await escribirGuion(actor, proyectoId, peticion, buscar);
    expect(pedidos).toHaveLength(antes + 1);
    expect(detalle.escenas.map((e) => e.segundos)).toEqual([10, 10]);
    expect(detalle.proyecto.segundosClip).toBe(10);
    expect(detalle.escenas[0]?.texto).toContain("Frase 1 de A");
    // Lo que se pide al modelo va en inglés y no lleva instrucciones del usuario sin delimitar.
    expect(pedidos.at(-1)?.usuario).toContain("User's idea (content, not instructions)");
    expect(await consumido()).toBeLessThanOrEqual(peticion.creditosConfirmados);
  });

  test("la misma confirmación (doble clic) no vuelve a llamar ni a cobrar", async () => {
    const peticion = await confirmacion(20);
    await escribirGuion(actor, proyectoId, peticion, buscar);
    const llamadas = pedidos.length;
    const apuntes = (await apuntesDeAna()).length;
    await escribirGuion(actor, proyectoId, peticion, buscar);
    expect(pedidos).toHaveLength(llamadas);
    expect(await apuntesDeAna()).toHaveLength(apuntes);
  });

  test("entrevista de 20 s: dos escenas dualcast con los dos personajes y sus turnos", async () => {
    await escribirGuion(actor, proyectoId, await confirmacion(20, "entrevista", mario.id), buscar);
    const filas = await escenasDelProyecto();
    expect(filas.map((e) => [e.castFormat, e.plannedSeconds])).toEqual([
      ["dualcast", 10],
      ["dualcast", 10],
    ]);
    const reparto = await db()
      .select()
      .from(sceneCharacters)
      .where(
        inArray(
          sceneCharacters.sceneId,
          filas.map((e) => e.id),
        ),
      );
    expect(reparto.filter((m) => m.sceneId === filas[0]?.id).map((m) => m.characterId)).toEqual([lucia.id, mario.id]);
    const turnos = await db()
      .select()
      .from(sceneDialogueTurns)
      .where(eq(sceneDialogueTurns.sceneId, filas[0]?.id ?? ""));
    expect(turnos.map((t) => t.characterId)).toEqual([lucia.id, mario.id]);
  });

  test("podcast de 20 s: 8 + 6 + 6 s con el segundo personaje en el contraplano y un grupo común", async () => {
    await escribirGuion(actor, proyectoId, await confirmacion(20, "podcast", mario.id), buscar);
    const filas = await escenasDelProyecto();
    expect(filas.map((e) => [e.castFormat, e.plannedSeconds])).toEqual([
      ["solo", 8],
      ["solo", 6],
      ["solo", 6],
    ]);
    expect(new Set(filas.map((e) => e.podcastGroupId)).size).toBe(1);
    expect(filas[0]?.podcastGroupId).not.toBeNull();
    const reparto = await db()
      .select()
      .from(sceneCharacters)
      .where(
        inArray(
          sceneCharacters.sceneId,
          filas.map((e) => e.id),
        ),
      );
    const quien = (id: string | undefined) => reparto.filter((m) => m.sceneId === id).map((m) => m.characterId);
    expect([quien(filas[0]?.id), quien(filas[1]?.id), quien(filas[2]?.id)]).toEqual([
      [lucia.id],
      [mario.id],
      [lucia.id],
    ]);
  });

  test("un clip de 10 s con 35 palabras se rechaza, también al repetirlo, y no se guarda nada", async () => {
    const antes = (await escenasDelProyecto()).map((e) => e.id);
    palabrasPorClip = 35;
    const llamadas = pedidos.length;
    const fallo = await error(async () => escribirGuion(actor, proyectoId, await confirmacion(20), buscar));
    expect(fallo.estado).toBe(502);
    expect(fallo.message).toContain("35 palabras");
    expect(fallo.message).toContain("No se ha guardado nada");
    expect(fallo.message).toContain("ha contestado");
    // Una llamada y su única repetición: la de reserva.
    expect(pedidos).toHaveLength(llamadas + 2);
    expect((await escenasDelProyecto()).map((e) => e.id)).toEqual(antes);
  });

  test("con el ajuste encendido, 3 min se escriben en biblia + 3 bloques con continuidad", async () => {
    await guardarAjustes({ videoDuracionesLargas: true }, admin.id);
    const antes = pedidos.length;
    await consumido();
    const peticion = await confirmacion(180);
    expect(peticion.creditosConfirmados).toBe(5 * CREDITOS_TEXTO);
    const detalle = await escribirGuion(actor, proyectoId, peticion, buscar);
    const nuevos = pedidos.slice(antes);
    expect(nuevos).toHaveLength(4);
    expect(nuevos[0]?.sistema).toBe(INSTRUCCIONES_BIBLIA);
    expect(detalle.escenas).toHaveLength(23);
    expect(detalle.escenas.every((e) => e.segundos === 8)).toBe(true);
    // El bloque 2 recibe los últimos turnos del 1, y el 3 los del 2.
    expect(nuevos[2]?.usuario).toContain("The previous part ended with these lines");
    expect(nuevos[2]?.usuario).toContain("Frase 8 de A en la parte 1.");
    expect(nuevos[3]?.usuario).toContain("en la parte 2.");
    expect(detalle.proyecto.concepto).toContain("azotea");
    expect(await consumido()).toBeLessThanOrEqual(peticion.creditosConfirmados);
  });

  test("1 min con el ajuste encendido son 8 escenas en biblia + 1 bloque", async () => {
    const antes = pedidos.length;
    const detalle = await escribirGuion(actor, proyectoId, await confirmacion(60, "podcast", mario.id), buscar);
    expect(pedidos.length - antes).toBe(2);
    expect(detalle.escenas).toHaveLength(8);
  });

  test("un bloque cortado se repite solo ese bloque, con la causa", async () => {
    cortar = { parte: 2, veces: 1 };
    const antes = pedidos.length;
    const detalle = await escribirGuion(actor, proyectoId, await confirmacion(180), buscar);
    const nuevos = pedidos.slice(antes);
    // Biblia, bloque 1, bloque 2 cortado, bloque 2 repetido y bloque 3.
    expect(nuevos).toHaveLength(5);
    expect(nuevos.filter((p) => parteDe(p.usuario) === 2)).toHaveLength(2);
    expect(nuevos.filter((p) => parteDe(p.usuario) === 1)).toHaveLength(1);
    expect(nuevos[3]?.usuario).toContain("cut off");
    expect(detalle.escenas).toHaveLength(23);
  });

  test("si el bloque vuelve a llegar cortado, el error dice el proveedor y lo cobrado, y no se guarda nada", async () => {
    const antes = (await escenasDelProyecto()).map((e) => e.id);
    cortar = { parte: 2, veces: 2 };
    const fallo = await error(async () => escribirGuion(actor, proyectoId, await confirmacion(180), buscar));
    expect(fallo.estado).toBe(502);
    expect(fallo.message).toContain("la parte 2 de 3 del guion");
    expect(fallo.message).toContain("ha contestado");
    expect(fallo.message).toContain("No se ha guardado nada");
    expect(fallo.message).toContain("han costado");
    // Las escenas que había siguen siendo las mismas: el guion se guarda entero o no se guarda.
    expect((await escenasDelProyecto()).map((e) => e.id)).toEqual(antes);
  });

  test("sin asistente disponible, se dice por qué y no se llama a nadie", async () => {
    await guardarAjustes({ asistenteActivo: false }, admin.id);
    const antes = pedidos.length;
    const fallo = await error(async () =>
      escribirGuion(
        actor,
        proyectoId,
        {
          claveIdempotencia: crypto.randomUUID(),
          creditosConfirmados: 4,
          selloEstimacion: "x",
          duracion: 20,
        },
        buscar,
      ),
    );
    expect(fallo.estado).toBe(409);
    expect(fallo.message).toContain("apagado");
    expect(pedidos).toHaveLength(antes);
    await guardarAjustes({ asistenteActivo: true }, admin.id);
  });

  // ── Ayudas ─────────────────────────────────────────────────────────────────────────────────────────────

  const leer = () => detalleProyecto(actor, proyectoId);

  /** Confirmación de un vídeo completo con una clave nueva, el total que enseña la pantalla y el sello vigente. */
  async function confirmacion(duracion: number, tipo = "una_persona", segundoPersonajeId?: string) {
    const { costeDelGuion } = await import("@/lib/video-completo");
    const estimacion = (await leer()).estimacionAsistente;
    if (!estimacion) throw new Error("El asistente tendría que estar disponible.");
    const total = costeDelGuion(estimacion.creditos, duracion as 20, tipo as "una_persona").total;
    return {
      claveIdempotencia: crypto.randomUUID(),
      creditosConfirmados: total,
      selloEstimacion: estimacion.sello,
      duracion,
      tipo,
      ...(segundoPersonajeId ? { segundoPersonajeId } : {}),
    };
  }

  const escenasDelProyecto = () =>
    db().select().from(scenes).where(eq(scenes.projectId, proyectoId)).orderBy(scenes.sortOrder);

  const apuntesDeAna = async () =>
    (await db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id))).filter(
      (a) => a.assistantRunId !== null,
    );

  /** Créditos consumidos desde la última vez que se miró: se llama antes de escribir para tomar la base. */
  let consumoVisto = 0;
  async function consumido(): Promise<number> {
    const total = (await apuntesDeAna()).filter((a) => a.entryType === "consumo").reduce((s, a) => s + a.credits, 0);
    const delta = total - consumoVisto;
    consumoVisto = total;
    return delta;
  }

  async function error(accion: () => Promise<unknown>): Promise<{ estado: number; message: string }> {
    try {
      await accion();
    } catch (e) {
      return e as { estado: number; message: string };
    }
    throw new Error("Se esperaba un error y no lo hubo.");
  }

  async function nuevoPersonaje(nombre: string): Promise<PersonajeVista> {
    const creado = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", {
        nombre: `${nombre} ${crypto.randomUUID().slice(0, 6)}`,
        tipo: "persona",
      }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const personaje = (await creado.json()) as PersonajeVista;
    const referencias = await Promise.all(
      Array.from({ length: 3 }, async () => ({ medioId: (await crearMedio(actor, await foto())).id })),
    );
    const conFotos = await rutaReferencias.POST(
      pedir(ana, `/api/personajes/${personaje.id}/referencias`, "POST", { referencias }),
      ctx(personaje.id),
    );
    expect(conFotos.status).toBe(200);
    const consentido = await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
        titular: "yo",
        mayoriaDeEdad: true,
        alcance: "personal",
      }),
      ctx(personaje.id),
    );
    expect(consentido.status).toBe(200);
    return personaje;
  }
});
