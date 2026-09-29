import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { PersonajeVista } from "@/lib/personajes";
import type { ProyectoDetalle } from "@/lib/proyectos";
import type { RepartoVista } from "@/lib/reparto";

/**
 * **Dos personajes en una escena** (RF02, RF06 y RF10, 0.28.0): datos, reparto y puerta de consentimiento
 * **por cada persona real**, contra el PostgreSQL local (`bun run services:up`).
 *
 * Lo que comprueba, uno por uno, los criterios de aceptación de la fase que le tocan a este bloque:
 *
 * - dos personas reales con **un solo** consentimiento **no se pueden generar**, y el mensaje dice **cuál** falta;
 * - la migración deja las escenas de siempre como `solo` **con su fila de reparto**, y siguen funcionando igual;
 * - **máximo dos** personajes, y un personaje **ajeno** se rechaza con su motivo;
 * - los turnos son **solo de quien sale** en la escena, y su texto llega **literal**, sin traducir;
 * - dos personajes con **la misma voz** producen un aviso salvable antes de generar;
 * - nadie toca el reparto de una escena ajena (404, sin decir que existe).
 *
 * **Ningún test llama a ningún proveedor**: este bloque no habla con KIE, no estima y no reserva nada.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_reparto");
}

const { eq } = await import("drizzle-orm");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaEscenasDeProyecto = await import("@/app/api/proyectos/[id]/escenas/route");
const rutaReparto = await import("@/app/api/escenas/[id]/reparto/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characters, projects, rateLimits, sceneCharacters, sceneDialogueTurns, scenes, users } = await import(
  "../db/esquema"
);
const { crearMedio } = await import("../media/servicio");
const { hechosDelReparto } = await import("../controles/hechos");
const { evaluar } = await import("../controles/motor");
const { clipsDePodcast, miembrosDelReparto } = await import("./consulta");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;

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

const fotoDeReferencia = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const buffer = await sharp({
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
  return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
};

const describeSiHayBase = hayBaseDeDatos ? describe : describe.skip;

describeSiHayBase("reparto de dos personajes", () => {
  let ana: Sesion;
  let beto: Sesion;
  let actor: Actor;
  let actorBeto: Actor;
  let proyectoId: string;
  let escenaId: string;
  let lucia: PersonajeVista;
  let elisa: PersonajeVista;

  beforeAll(async () => {
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    beto = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    actorBeto = { id: beto.id, esAdmin: false };
  });

  afterAll(async () => {
    for (const sesion of [ana, beto]) {
      if (sesion?.email) await db().delete(users).where(eq(users.email, sesion.email));
    }
  });

  /** Personaje con fotos y, si se pide, con consentimiento vigente. Sin él no puede generar: es la puerta de 0.13.0. */
  async function nuevoPersonaje(
    sesion: Sesion,
    quien: Actor,
    nombre: string,
    conConsentimiento = true,
  ): Promise<PersonajeVista> {
    const creado = await rutaPersonajes.POST(
      pedir(sesion, "/api/personajes", "POST", {
        nombre: `${nombre} ${crypto.randomUUID().slice(0, 6)}`,
        tipo: "persona",
      }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const personaje = (await creado.json()) as PersonajeVista;
    const referencias = await Promise.all(
      Array.from({ length: 3 }, async (_, i) => ({
        medioId: (
          await crearMedio(quien, new File([await fotoDeReferencia()], `${nombre}-${i}.png`, { type: "image/png" }))
        ).id,
      })),
    );
    expect(
      (
        await rutaReferencias.POST(
          pedir(sesion, `/api/personajes/${personaje.id}/referencias`, "POST", { referencias }),
          ctx(personaje.id),
        )
      ).status,
    ).toBe(200);
    if (conConsentimiento) {
      expect(
        (
          await rutaConsentimiento.POST(
            pedir(sesion, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
              titular: "yo",
              mayoriaDeEdad: true,
              alcance: "personal",
            }),
            ctx(personaje.id),
          )
        ).status,
      ).toBe(200);
    }
    return personaje;
  }

  /** Reparto tal como lo devuelve la API, comprobando que la petición ha salido bien. */
  async function patch(sesion: Sesion, id: string, cuerpo: Record<string, unknown>): Promise<RepartoVista> {
    const respuesta = await rutaReparto.PATCH(pedir(sesion, `/api/escenas/${id}/reparto`, "PATCH", cuerpo), ctx(id));
    const cuerpoRespuesta = await respuesta.json();
    if (respuesta.status !== 200) {
      throw Object.assign(new Error(String((cuerpoRespuesta as { error?: string }).error)), {
        estado: respuesta.status,
      });
    }
    return cuerpoRespuesta as RepartoVista;
  }

  /** El motivo con el que la API rechaza algo, con su código. Es lo que lee el usuario. */
  async function rechazo(sesion: Sesion, id: string, cuerpo: Record<string, unknown>) {
    const respuesta = await rutaReparto.PATCH(pedir(sesion, `/api/escenas/${id}/reparto`, "PATCH", cuerpo), ctx(id));
    const { error } = (await respuesta.json()) as { error?: string };
    return { estado: respuesta.status, mensaje: error ?? "" };
  }

  beforeEach(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_reparto");
    await db().delete(rateLimits);
    await db().delete(projects).where(eq(projects.userId, ana.id));
    await db().delete(projects).where(eq(projects.userId, beto.id));
    await db().delete(characters).where(eq(characters.ownerId, ana.id));
    await db().delete(characters).where(eq(characters.ownerId, beto.id));
    lucia = await nuevoPersonaje(ana, actor, "Lucía");
    elisa = await nuevoPersonaje(ana, actor, "Elisa");
    const creado = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", {
        titulo: "Una conversación",
        formato: "reel_vertical",
        idea: "Dos personas hablando de un producto en el mismo set.",
        personajeId: lucia.id,
        presupuestoCreditos: 1000,
      }),
      undefined,
    );
    expect(creado.status).toBe(201);
    proyectoId = ((await creado.json()) as ProyectoDetalle).proyecto.id;
    const conEscena = await rutaEscenasDeProyecto.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/escenas`, "POST", {
        texto: "Esto me ha cambiado la rutina.",
        accion: "Mira a cámara sonriendo.",
      }),
      ctx(proyectoId),
    );
    expect(conEscena.status).toBe(201);
    const detalle = (await conEscena.json()) as ProyectoDetalle;
    escenaId = detalle.escenas[detalle.escenas.length - 1]?.id ?? "";
    expect(escenaId).not.toBe("");
  });

  test("una escena nace como «solo» y su reparto arranca con el protagonista del proyecto", async () => {
    // El relleno de la migración es para lo ya escrito; una escena nueva siembra su reparto por el mismo camino
    // (`reparto/siembra.ts`), y lo que se comprueba aquí es que el resultado es el mismo.
    const respuesta = await rutaReparto.GET(pedir(ana, `/api/escenas/${escenaId}/reparto`), ctx(escenaId));
    expect(respuesta.status).toBe(200);
    const reparto = (await respuesta.json()) as RepartoVista;
    expect(reparto.formato).toBe("solo");
    expect(reparto.grupoPodcast).toBeNull();
    expect(reparto.miembros).toHaveLength(1);
    expect(reparto.miembros[0]).toMatchObject({ papel: "hablante", lado: "izquierda", mirada: "camara", orden: 1 });
    expect(reparto.turnos).toEqual([]);
  });

  test("la migración deja las escenas de siempre como «solo» con su fila de reparto", async () => {
    // Se reproduce el estado anterior a la versión: la escena sin reparto y el personaje solo en el proyecto.
    await db().delete(sceneCharacters).where(eq(sceneCharacters.sceneId, escenaId));
    await db().execute(
      `insert into "scene_characters" ("scene_id", "character_id", "role", "side", "gaze_direction", "sort_order")
       select "scenes"."id", "projects"."main_character_id", 'hablante', 'izquierda', 'camara', 1
       from "scenes" join "projects" on "projects"."id" = "scenes"."project_id"
       where "projects"."main_character_id" is not null
       on conflict ("scene_id", "character_id") do nothing`,
    );
    const [escena] = await db().select().from(scenes).where(eq(scenes.id, escenaId)).limit(1);
    if (!escena) throw new Error("La escena de prueba tiene que existir.");
    expect(escena.castFormat).toBe("solo");
    expect(escena.podcastGroupId).toBeNull();
    const miembros = await miembrosDelReparto(escenaId);
    expect(miembros.map((m) => m.personajeId)).toEqual([lucia.id]);
    expect(miembros[0]?.papel).toBe("hablante");
    // Y sigue generando igual: con su consentimiento en orden, el reparto no pone ningún freno.
    const reparto = await hechosDelReparto(escena);
    expect(reparto?.formato).toBe("solo");
    expect(evaluar({ tipo: "animacion", parametros: PARAMETROS, ...(reparto ? { reparto } : {}) }).frenos).toEqual([]);
  });

  test("un segundo personaje exige elegir antes el formato, y entra enfrente con la mirada cruzada", async () => {
    const sinFormato = await rechazo(ana, escenaId, { accion: "anadir", personajeId: elisa.id });
    expect(sinFormato.estado).toBe(409);
    expect(sinFormato.mensaje).toContain("podcast o dualcast");

    const conFormato = await patch(ana, escenaId, { formato: "podcast" });
    expect(conFormato.formato).toBe("podcast");
    expect(conFormato.grupoPodcast).not.toBeNull();
    const reparto = await patch(ana, escenaId, { accion: "anadir", personajeId: elisa.id });
    expect(reparto.miembros).toHaveLength(2);
    expect(reparto.miembros.map((m) => m.lado)).toEqual(["izquierda", "derecha"]);
    // Mirada cruzada: cada uno mira al lado donde estaría el otro. Es lo único que hace que dos clips
    // independientes parezcan la misma conversación.
    expect(reparto.miembros.map((m) => m.mirada)).toEqual(["derecha", "izquierda"]);
  });

  test("como mucho dos personajes, y un personaje ajeno se rechaza diciendo por qué", async () => {
    await patch(ana, escenaId, { formato: "dualcast" });
    await patch(ana, escenaId, { accion: "anadir", personajeId: elisa.id });
    const tercero = await nuevoPersonaje(ana, actor, "Marta");
    const tope = await rechazo(ana, escenaId, { accion: "anadir", personajeId: tercero.id });
    expect(tope.estado).toBe(409);
    expect(tope.mensaje).toContain("2 personajes como máximo");

    const ajeno = await nuevoPersonaje(beto, actorBeto, "Carlos");
    await patch(ana, escenaId, { accion: "quitar", miembroId: (await miembrosDelReparto(escenaId))[1]?.id });
    const rechazado = await rechazo(ana, escenaId, { accion: "anadir", personajeId: ajeno.id });
    expect(rechazado.estado).toBe(404);
    expect(rechazado.mensaje).toContain("no es tuyo");
  });

  test("dos personas reales con un solo consentimiento no se pueden generar, y se dice cuál falta", async () => {
    const sinConsentimiento = await nuevoPersonaje(ana, actor, "Berta", false);
    await patch(ana, escenaId, { formato: "dualcast" });
    await patch(ana, escenaId, { accion: "anadir", personajeId: sinConsentimiento.id });

    const [escena] = await db().select().from(scenes).where(eq(scenes.id, escenaId)).limit(1);
    if (!escena) throw new Error("La escena de prueba tiene que existir.");
    const reparto = await hechosDelReparto(escena);
    expect(reparto?.personajes).toHaveLength(2);
    const evaluacion = evaluar({ tipo: "animacion", parametros: PARAMETROS, ...(reparto ? { reparto } : {}) });
    const freno = evaluacion.frenos.find((f) => f.regla === "reparto-consentimiento");
    expect(freno).toBeDefined();
    expect(freno?.estado).toBe("bloqueado");
    // **El mensaje nombra a quién le falta**, y no al que está en orden: sin el nombre no se sabe qué ficha abrir.
    expect(freno?.motivo).toContain(sinConsentimiento.nombre);
    expect(freno?.motivo).not.toContain(`«${lucia.nombre}»`);
    // Y no se puede salvar confirmándolo: un consentimiento no es un aviso.
    expect(freno?.confirmable).toBe(false);
    expect(freno?.gatea).toBe(true);
  });

  test("los turnos son solo de quien sale, llegan literales y en su orden", async () => {
    await patch(ana, escenaId, { formato: "dualcast" });
    await patch(ana, escenaId, { accion: "anadir", personajeId: elisa.id });
    const fuera = await nuevoPersonaje(ana, actor, "Nadie");
    const rechazado = await rechazo(ana, escenaId, {
      accion: "dialogo",
      turnos: [{ personajeId: fuera.id, texto: "Yo no salgo aquí." }],
    });
    expect(rechazado.estado).toBe(409);
    expect(rechazado.mensaje).toContain("no sale en esta escena");

    const reparto = await patch(ana, escenaId, {
      accion: "dialogo",
      turnos: [
        { personajeId: lucia.id, texto: "¿Y tú lo has probado ya?", direccion: "con curiosidad" },
        { personajeId: elisa.id, texto: "Lo uso cada mañana, en serio.", direccion: "en tono cercano" },
      ],
    });
    expect(reparto.turnos.map((t) => t.orden)).toEqual([1, 2]);
    // **Literal y sin traducir**: lo que se escribió es lo que se guarda y lo que se va a oír.
    expect(reparto.turnos.map((t) => t.texto)).toEqual(["¿Y tú lo has probado ya?", "Lo uso cada mañana, en serio."]);
    expect(reparto.turnos.map((t) => t.personajeId)).toEqual([lucia.id, elisa.id]);
    expect(reparto.turnos[1]?.direccion).toBe("en tono cercano");
  });

  test("en podcast cada clip lleva un personaje, su mirada cruzada y solo sus turnos", async () => {
    await patch(ana, escenaId, { formato: "podcast" });
    await patch(ana, escenaId, { accion: "anadir", personajeId: elisa.id });
    await patch(ana, escenaId, {
      accion: "dialogo",
      turnos: [
        { personajeId: lucia.id, texto: "Cuéntame cómo empezaste." },
        { personajeId: elisa.id, texto: "Empecé por probarlo un mes." },
        { personajeId: lucia.id, texto: "¿Y qué notaste?" },
      ],
    });
    const [escena] = await db().select().from(scenes).where(eq(scenes.id, escenaId)).limit(1);
    if (!escena) throw new Error("La escena de prueba tiene que existir.");
    const clips = await clipsDePodcast(escena);
    expect(clips).toHaveLength(2);
    expect(clips.map((c) => c.orden)).toEqual([1, 2]);
    expect(clips.map((c) => c.mirada)).toEqual(["derecha", "izquierda"]);
    expect(clips[0]?.turnos.map((t) => t.orden)).toEqual([1, 3]);
    expect(clips[1]?.turnos.map((t) => t.orden)).toEqual([2]);
    // El grupo es lo que permitirá al montaje (0.32.0) alternar los planos de este intercambio.
    expect(escena.podcastGroupId).not.toBeNull();
  });

  test("volver a «solo» deja un personaje, borra los turnos y suelta el grupo de podcast", async () => {
    await patch(ana, escenaId, { formato: "podcast" });
    await patch(ana, escenaId, { accion: "anadir", personajeId: elisa.id });
    await patch(ana, escenaId, {
      accion: "dialogo",
      turnos: [{ personajeId: elisa.id, texto: "Lo dejo aquí." }],
    });
    const reparto = await patch(ana, escenaId, { formato: "solo" });
    expect(reparto.formato).toBe("solo");
    expect(reparto.grupoPodcast).toBeNull();
    expect(reparto.miembros.map((m) => m.personajeId)).toEqual([lucia.id]);
    expect(reparto.turnos).toEqual([]);
    const turnos = await db().select().from(sceneDialogueTurns).where(eq(sceneDialogueTurns.sceneId, escenaId));
    expect(turnos).toEqual([]);

    await patch(ana, escenaId, { formato: "podcast" });
    await patch(ana, escenaId, {
      accion: "dialogo",
      turnos: [{ personajeId: lucia.id, texto: "También con un solo miembro." }],
    });
    const otraVezSolo = await patch(ana, escenaId, { formato: "solo" });
    expect(otraVezSolo.turnos).toEqual([]);
  });

  test("dos personajes con la misma voz avisan, y el aviso se puede confirmar", async () => {
    await db()
      .update(characters)
      .set({ voicePresetId: "voz-clara", voiceAxes: { genero: "femenino", edad: "adulta" } })
      .where(eq(characters.id, lucia.id));
    await db()
      .update(characters)
      .set({ voicePresetId: "voz-clara", voiceAxes: { genero: "femenino", edad: "adulta" } })
      .where(eq(characters.id, elisa.id));
    await patch(ana, escenaId, { formato: "dualcast" });
    const reparto = await patch(ana, escenaId, { accion: "anadir", personajeId: elisa.id });
    expect(reparto.mismaVoz).toBe(true);

    const [escena] = await db().select().from(scenes).where(eq(scenes.id, escenaId)).limit(1);
    if (!escena) throw new Error("La escena de prueba tiene que existir.");
    const hechos = await hechosDelReparto(escena);
    const freno = evaluar({
      tipo: "animacion",
      parametros: PARAMETROS,
      ...(hechos ? { reparto: hechos } : {}),
    }).frenos.find((f) => f.regla === "reparto-misma-voz");
    expect(freno?.estado).toBe("ajustes");
    expect(freno?.confirmable).toBe(true);
  });

  test("nadie toca el reparto de una escena ajena", async () => {
    const respuesta = await rutaReparto.GET(pedir(beto, `/api/escenas/${escenaId}/reparto`), ctx(escenaId));
    expect(respuesta.status).toBe(404);
    const intento = await rechazo(beto, escenaId, { accion: "anadir", personajeId: lucia.id });
    expect(intento.estado).toBe(404);
    // Y el reparto de Ana sigue como estaba: la petición de Beto no ha escrito nada.
    expect(await miembrosDelReparto(escenaId)).toHaveLength(1);
  });

  test("un formato desactivado en el panel no se puede elegir, y se dice por qué", async () => {
    const { guardarAjustes, leerAjustes } = await import("../ajustes");
    const previos = await leerAjustes();
    await guardarAjustes({ repartoDualcastActivo: false }, null);
    try {
      const rechazado = await rechazo(ana, escenaId, { formato: "dualcast" });
      expect(rechazado.estado).toBe(409);
      expect(rechazado.mensaje).toContain("desactivado");
    } finally {
      await guardarAjustes({ repartoDualcastActivo: previos.repartoDualcastActivo }, null);
    }
  });
});

/** Parámetros del motor con los que se evalúa aquí: solo importan para las reglas de avisos salvables. */
const PARAMETROS = { exigirCoberturaVistas: false, exigirPrecioFresco: false, maximoAvisos: 3 };
