import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { ClipsDelProyecto } from "@/lib/audio-del-clip";
import type { EstadoConversion, ProyectoConvertido } from "@/lib/conversion";
import type { MontajeVista } from "@/lib/montaje";

/**
 * **De «Crear» a un proyecto** (0.35.0) contra el PostgreSQL y el SeaweedFS locales y contra FFmpeg de verdad.
 *
 * **Ningún test llama a ningún proveedor ni gasta un crédito**: el clip «de Crear» es un trabajo terminado escrito
 * aquí mismo, con su apunte de consumo, y su archivo es un vídeo fabricado con `ffmpeg -f lavfi`.
 *
 * Lo que comprueba:
 *
 * - convertir crea un proyecto de **una** escena cuyo clip producido **es el mismo trabajo y el mismo archivo**, con
 *   la imagen de partida, la dirección, el trend, el diálogo y el personaje del clip;
 * - **no hay doble cobro**: no se crea ningún trabajo ni ningún apunte, y lo comprometido del proyecto es lo que ya
 *   costó el clip, que cuenta contra su techo;
 * - un clip se convierte **una vez**; uno ajeno responde 404; uno fallido o en curso no se convierte y lo dice;
 * - un **consentimiento revocado** no se salta al convertir;
 * - un trend que ya no está vigente no impide convertir, pero se avisa;
 * - **quitar el audio del clip** sube la versión del montaje y el MP4 sale sin él; con la **pista de voz aparte**
 *   el MP4 lleva la voz aunque el audio del clip esté quitado;
 * - borrar el proyecto deja el clip como estaba en «Crear», que se puede volver a convertir.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_conversion");
}

const { desc, eq, sql } = await import("drizzle-orm");
const rutaConvertir = await import("@/app/api/generacion/trabajos/[id]/proyecto/route");
const rutaAudio = await import("@/app/api/escenas/[id]/audio-del-clip/route");
const rutaProyecto = await import("@/app/api/proyectos/[id]/route");
const rutaMontaje = await import("@/app/api/proyectos/[id]/montaje/route");
const rutaExportar = await import("@/app/api/proyectos/[id]/montaje/exportacion/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const {
  claims,
  generationJobs,
  media,
  montageExports,
  montages,
  products,
  projects,
  promptTemplates,
  rateLimits,
  sceneCharacters,
  scenes,
  usageLedger,
  users,
} = await import("../db/esquema");
const { crearMedio } = await import("../media/servicio");
const { leerObjeto } = await import("../almacenamiento");
const { pasadaDeExportaciones } = await import("../montaje/cola");
const { comprometidoDelProyecto, exigirTopeDelProyecto } = await import("../asistente/plan");
const { estadoDeProduccion } = await import("../produccion/consulta");
const { listarModelos } = await import("../proveedores/catalogo");
const { adaptadorKie } = await import("../proveedores/kie/adaptador");
const { entradaGuardada } = await import("../generacion/servicio");
const { transcribirEscena } = await import("../voz/subtitulos");

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

const mensajeDe = (datos: unknown) => (datos as { error?: string }).error ?? "";

/** Lanza un FFmpeg de la prueba y devuelve su salida de error, que es donde escribe `volumedetect`. */
async function ffmpeg(argumentos: readonly string[]): Promise<{ ok: boolean; error: string }> {
  const proceso = Bun.spawn(["ffmpeg", "-nostdin", "-hide_banner", ...argumentos], { stdout: "pipe", stderr: "pipe" });
  const [error, codigo] = await Promise.all([new Response(proceso.stderr).text(), proceso.exited]);
  return { ok: codigo === 0, error };
}

const copia = (datos: Uint8Array): Uint8Array<ArrayBuffer> => {
  const nueva = new Uint8Array(new ArrayBuffer(datos.byteLength));
  nueva.set(datos);
  return nueva;
};

const fotoDeReferencia = async (): Promise<Uint8Array<ArrayBuffer>> =>
  copia(
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

describe.skipIf(!hayBaseDeDatos)("convertir un clip de Crear en un proyecto", () => {
  let ana: Sesion;
  let berta: Sesion;
  let actor: Actor;
  let carpeta: string;
  let personajeId: string;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;

  beforeAll(async () => {
    // Esta suite cambia ajustes de la instalación (montaje y cuota): nunca en la base de desarrollo.
    exigirBaseDeDatosDePrueba("escenara_pruebas_conversion");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    berta = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    carpeta = await mkdtemp(path.join(tmpdir(), "escenara-prueba-conversion-"));
    await guardarAjustes({ montajeActivo: true, cuotaMb: 2048 }, null);
    personajeId = await personajeConConsentimiento();
  });

  afterAll(async () => {
    for (const sesion of [ana, berta]) {
      if (sesion?.email) await db().delete(users).where(eq(users.email, sesion.email));
    }
    await guardarAjustes({ montajeActivo: ajustesPrevios.montajeActivo, cuotaMb: ajustesPrevios.cuotaMb }, null);
    await rm(carpeta, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await db().delete(projects).where(eq(projects.userId, ana.id));
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    exigirBaseDeDatosDePrueba("escenara_pruebas_conversion");
    await db().delete(rateLimits);
  });

  // ── Preparación ──────────────────────────────────────────────────────────────────────────────────────────

  async function personajeConConsentimiento(): Promise<string> {
    const creado = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", { nombre: "Lucía", tipo: "persona" }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const { id } = (await creado.json()) as { id: string };
    const referencias = await Promise.all(
      Array.from({ length: 3 }, async (_, i) => ({
        medioId: (
          await crearMedio(actor, new File([await fotoDeReferencia()], `lucia-${i}.png`, { type: "image/png" }))
        ).id,
      })),
    );
    const subidas = await rutaReferencias.POST(
      pedir(ana, `/api/personajes/${id}/referencias`, "POST", { referencias }),
      ctx(id),
    );
    expect(subidas.status).toBe(200);
    const registro = await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${id}/consentimiento`, "POST", {
        titular: "yo",
        mayoriaDeEdad: true,
        alcance: "personal",
      }),
      ctx(id),
    );
    expect(registro.status).toBe(200);
    return id;
  }

  /** Vídeo vertical de `segundos` con un tono de 440 Hz (o sin audio). Se fabrica aquí y no sale de la máquina. */
  async function medioDeVideo(nombre: string, segundos: number, conAudio = true): Promise<string> {
    const ruta = path.join(carpeta, `${nombre}-${crypto.randomUUID()}.mp4`);
    const { ok } = await ffmpeg([
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=black:s=720x1280:d=${segundos}:r=25`,
      ...(conAudio ? ["-f", "lavfi", "-i", `sine=frequency=440:duration=${segundos}`] : []),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      ...(conAudio ? ["-c:a", "aac", "-shortest"] : []),
      "-t",
      String(segundos),
      ruta,
    ]);
    if (!ok) throw new Error("No se ha podido fabricar el clip de prueba con FFmpeg.");
    const archivo = new File([copia(new Uint8Array(await Bun.file(ruta).arrayBuffer()))], `${nombre}.mp4`, {
      type: "video/mp4",
    });
    return (await crearMedio(actor, archivo, { duracion: segundos }, ["video"])).id;
  }

  /** Audio de voz aparte: un tono de 880 Hz. Es lo que sería la pista de voz generada de la escena. */
  async function medioDeVoz(segundos: number): Promise<string> {
    const ruta = path.join(carpeta, `voz-${crypto.randomUUID()}.mp3`);
    const { ok } = await ffmpeg([
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=880:duration=${segundos}`,
      ruta,
    ]);
    if (!ok) throw new Error("No se ha podido fabricar la voz de prueba con FFmpeg.");
    const archivo = new File([copia(new Uint8Array(await Bun.file(ruta).arrayBuffer()))], "voz.mp3", {
      type: "audio/mpeg",
    });
    return (await crearMedio(actor, archivo, { duracion: segundos }, ["audio"])).id;
  }

  /**
   * Un clip de «Crear» ya terminado y pagado: su trabajo, su archivo, su imagen de partida y su apunte de consumo.
   * Es lo que deja el camino rápido de «Crear» al cerrar un clip (`scene_id` a nulo).
   *
   * La entrada se compone con **las mismas funciones** que usa `crearAnimacion`: `montarEntrada` del adaptador de
   * KIE con el modelo sembrado y `entradaGuardada`, que es la que mete la duración en `parametros.segundos`. Así el
   * test lee la forma que la aplicación escribe de verdad, no una inventada.
   */
  async function clipDeCrear(
    parcial: Partial<typeof generationJobs.$inferInsert> = {},
    entradaExtra: Record<string, unknown> = {},
    segundos: number | null = 4,
  ) {
    const imagen = await crearMedio(actor, new File([await fotoDeReferencia()], "partida.png", { type: "image/png" }));
    const resultMediaId = await medioDeVideo("clip", 2);
    const modelo = (await listarModelos()).find((m) => m.modelo === "veo3_fast");
    if (!modelo) throw new Error("El catálogo de prueba no tiene sembrado veo3_fast.");
    const dialogo = "Esto me ha cambiado las mañanas.";
    const parametros = adaptadorKie.montarEntrada(modelo, {
      escena: "composed prompt",
      dialogo,
      urls: [],
      ...(segundos === null ? {} : { segundos }),
    });
    const guardada = entradaGuardada(adaptadorKie, "composed prompt", [imagen.id], {
      ...parametros,
      ...(segundos === null ? {} : { segundos }),
    });
    if (segundos === null) delete (guardada.parametros as { segundos?: unknown }).segundos;
    const entrada = {
      ...guardada,
      unidadPrecio: "vídeo de 8 s",
      dialogo,
      escena: "Lucía abre el bote en la cocina",
      direccionElegida: {
        formatoClip: "ugc_a_camara",
        plano: "primer-plano",
        angulo: "",
        camara: "",
        microaccion: "sonreir",
        momentoMicroaccion: "despues",
        direccionVocal: "cercano",
        optica: "",
        luz: "",
        localizacion: "",
        registroEstetico: "influencer",
        instruccionesExtra: "",
        modoExperto: false,
        descripcionExperta: "",
        acento: "es_MX_cdmx",
      },
      ...entradaExtra,
    };
    const [trabajo] = await db()
      .insert(generationJobs)
      .values({
        userId: ana.id,
        kind: "animacion",
        provider: "kie",
        model: "veo3_fast",
        prompt: "composed prompt",
        idempotencyKey: crypto.randomUUID(),
        state: "listo",
        stage: "listo",
        input: entrada,
        sourceMediaId: imagen.id,
        resultMediaId,
        characterId: personajeId,
        rightsConfirmedAt: new Date(),
        referencesReviewedAt: new Date(),
        estimatedCredits: 60,
        consumedCredits: 60,
        finishedAt: new Date(),
        ...parcial,
      })
      .returning();
    if (!trabajo) throw new Error("No se ha podido escribir el clip de prueba.");
    await db().insert(usageLedger).values({
      userId: ana.id,
      jobId: trabajo.id,
      provider: "kie",
      model: "veo3_fast",
      entryType: "consumo",
      credits: 60,
      informed: true,
    });
    return trabajo;
  }

  const estado = async (trabajoId: string, sesion = ana) => {
    const respuesta = await rutaConvertir.GET(
      pedir(sesion, `/api/generacion/trabajos/${trabajoId}/proyecto`),
      ctx(trabajoId),
    );
    return { codigo: respuesta.status, datos: (await respuesta.json()) as EstadoConversion };
  };

  const convertir = async (trabajoId: string, sesion = ana) => {
    const respuesta = await rutaConvertir.POST(
      pedir(sesion, `/api/generacion/trabajos/${trabajoId}/proyecto`, "POST", {}),
      ctx(trabajoId),
    );
    return { codigo: respuesta.status, datos: (await respuesta.json()) as ProyectoConvertido };
  };

  const quitarAudio = async (escenaId: string, quitado: unknown, sesion = ana) => {
    const respuesta = await rutaAudio.PATCH(
      pedir(sesion, `/api/escenas/${escenaId}/audio-del-clip`, "PATCH", { quitado }),
      ctx(escenaId),
    );
    return { codigo: respuesta.status, datos: (await respuesta.json()) as ClipsDelProyecto };
  };

  const apuntesDeAna = async () => (await db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id))).length;

  const escenaDe = async (proyectoId: string) => {
    const [escena] = await db().select().from(scenes).where(eq(scenes.projectId, proyectoId));
    if (!escena) throw new Error("El proyecto convertido no tiene escena.");
    return escena;
  };

  /**
   * Monta el proyecto con el worker y devuelve el volumen medio del MP4, en dB (`-inf` = silencio). Con `banda`, mide
   * solo esa frecuencia (un paso banda estrecho): es lo que distingue el tono del clip (440 Hz) del de la voz (880 Hz).
   */
  async function volumenDelMp4(proyectoId: string, banda?: number): Promise<number> {
    const abierto = await rutaMontaje.GET(pedir(ana, `/api/proyectos/${proyectoId}/montaje`), ctx(proyectoId));
    expect(abierto.status).toBe(200);
    const pedida = await rutaExportar.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/montaje/exportacion`, "POST", {}),
      ctx(proyectoId),
    );
    // La misma versión devuelve la exportación que ya hay (200): entonces no hay nada nuevo que montar.
    expect([200, 202]).toContain(pedida.status);
    if (pedida.status === 202) expect(await pasadaDeExportaciones(`worker-prueba-${crypto.randomUUID()}`)).toBe(1);
    const vista = (await (
      await rutaMontaje.GET(pedir(ana, `/api/proyectos/${proyectoId}/montaje`), ctx(proyectoId))
    ).json()) as MontajeVista;
    const exportacion = vista.exportaciones[0];
    expect(exportacion?.estado).toBe("listo");
    const [fila] = await db()
      .select()
      .from(media)
      .where(eq(media.id, exportacion?.medio?.id ?? ""))
      .limit(1);
    if (!fila) throw new Error("La exportación no ha dejado su MP4.");
    const ruta = path.join(carpeta, `salida-${fila.id}.mp4`);
    await Bun.write(ruta, await leerObjeto(fila.storageKey).arrayBuffer());
    const filtro = banda ? `bandpass=f=${banda}:width_type=h:w=40,volumedetect` : "volumedetect";
    const { error } = await ffmpeg(["-i", ruta, "-af", filtro, "-vn", "-f", "null", "-"]);
    const medio = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(error)?.[1];
    if (!medio) throw new Error("FFmpeg no ha medido el volumen del MP4.");
    return medio === "-inf" ? Number.NEGATIVE_INFINITY : Number(medio);
  }

  // ── Los tests ────────────────────────────────────────────────────────────────────────────────────────────

  test("convierte el clip en un proyecto de una escena que reutiliza el mismo trabajo y el mismo archivo", async () => {
    const clip = await clipDeCrear();
    const antes = await estado(clip.id);
    expect(antes.codigo).toBe(200);
    expect(antes.datos.estado).toBe("convertible");

    const { codigo, datos } = await convertir(clip.id);
    expect(codigo).toBe(201);
    expect(datos.nuevo).toBe(true);
    expect(datos.url).toBe(`/proyectos/${datos.proyectoId}?paso=escenas`);

    const [proyecto] = await db().select().from(projects).where(eq(projects.id, datos.proyectoId));
    expect(proyecto?.mainCharacterId).toBe(personajeId);
    expect(proyecto?.voiceMode).toBe("clip");
    expect(proyecto?.clipSeconds).toBe(4);
    expect(proyecto?.speechAccent).toBe("es_MX_cdmx");
    expect(proyecto?.state).toBe("borrador");

    const escenas = await db().select().from(scenes).where(eq(scenes.projectId, datos.proyectoId));
    expect(escenas).toHaveLength(1);
    const escena = escenas[0];
    expect(escena?.state).toBe("producida");
    expect(escena?.clipMediaId).toBe(clip.resultMediaId);
    expect(escena?.clipJobId).toBe(clip.id);
    expect(escena?.approvedFrameMediaId).toBe(clip.sourceMediaId);
    expect(escena?.approvedFrameJobId).toBeNull();
    expect(escena?.scriptText).toBe("Esto me ha cambiado las mañanas.");
    expect(escena?.action).toBe("Lucía abre el bote en la cocina");
    expect(escena?.shotType).toBe("primer-plano");
    expect(escena?.microAction).toBe("sonreir");
    expect(escena?.microActionTiming).toBe("despues");
    expect(escena?.aestheticRegister).toBe("influencer");
    expect(escena?.clipAudioMuted).toBe(false);
    const reparto = await db()
      .select()
      .from(sceneCharacters)
      .where(eq(sceneCharacters.sceneId, escena?.id ?? ""));
    expect(reparto.map((r) => r.characterId)).toEqual([personajeId]);

    // El trabajo del clip pasa a ser de la escena: el historial de producción lo enseña como su clip.
    const [enganchado] = await db().select().from(generationJobs).where(eq(generationJobs.id, clip.id));
    expect(enganchado?.sceneId).toBe(escena?.id ?? "");
    const produccion = await estadoDeProduccion(actor, datos.proyectoId);
    expect(produccion.escenas[0]?.clip?.id).toBe(clip.resultMediaId ?? "");
    expect(produccion.escenas[0]?.animacion?.id).toBe(clip.id);
  });

  test("el proyecto toma la duración con la que se generó el clip, y 8 s si no es de las de un proyecto", async () => {
    const deCuatro = await clipDeCrear();
    expect((deCuatro.input as { parametros?: { segundos?: unknown } }).parametros?.segundos).toBe(4);
    expect((deCuatro.input as { segundos?: unknown }).segundos).toBeUndefined();
    const cuatro = await convertir(deCuatro.id);
    const [proyecto] = await db().select().from(projects).where(eq(projects.id, cuatro.datos.proyectoId));
    expect(proyecto?.clipSeconds).toBe(4);
    expect((await escenaDe(cuatro.datos.proyectoId)).plannedSeconds).toBe(4);

    for (const segundos of [10, null]) {
      const clip = await clipDeCrear({}, {}, segundos);
      const { datos } = await convertir(clip.id);
      const [fila] = await db().select().from(projects).where(eq(projects.id, datos.proyectoId));
      expect(fila?.clipSeconds).toBe(8);
    }
  });

  test("no hay doble cobro: ni trabajos ni apuntes nuevos, y el proyecto cuenta lo ya gastado una vez", async () => {
    const clip = await clipDeCrear();
    const apuntes = await apuntesDeAna();
    const trabajos = (await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id))).length;

    const { datos } = await convertir(clip.id);
    expect(await apuntesDeAna()).toBe(apuntes);
    expect((await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id))).length).toBe(trabajos);
    expect(await comprometidoDelProyecto(datos.proyectoId)).toBe(60);

    // Convertir otra vez no suma nada: el mismo proyecto, el mismo gasto.
    const otra = await convertir(clip.id);
    expect(otra.codigo).toBe(200);
    expect(otra.datos.nuevo).toBe(false);
    expect(otra.datos.proyectoId).toBe(datos.proyectoId);
    expect(await comprometidoDelProyecto(datos.proyectoId)).toBe(60);
    expect(await apuntesDeAna()).toBe(apuntes);
    expect((await db().select().from(projects).where(eq(projects.userId, ana.id))).length).toBe(1);
  });

  test("el techo de gasto del proyecto se compara con lo que ya costó el clip", async () => {
    const clip = await clipDeCrear();
    const { datos } = await convertir(clip.id);
    await db().update(projects).set({ authorizedCredits: 70 }).where(eq(projects.id, datos.proyectoId));
    // 60 ya gastados + 20 nuevos pasan de 70: regenerar no puede saltarse el techo por venir de «Crear».
    await expect(exigirTopeDelProyecto(datos.proyectoId, 20)).rejects.toThrow("presupuesto");
    await exigirTopeDelProyecto(datos.proyectoId, 5);
  });

  test("un clip ya convertido lleva a su proyecto y se convierte una sola vez aunque se pida a la vez", async () => {
    const clip = await clipDeCrear();
    const [a, b] = await Promise.all([convertir(clip.id), convertir(clip.id)]);
    expect(a.datos.proyectoId).toBe(b.datos.proyectoId);
    expect([a.datos.nuevo, b.datos.nuevo].filter(Boolean)).toHaveLength(1);
    const { datos } = await estado(clip.id);
    expect(datos).toEqual({
      estado: "convertido",
      proyectoId: a.datos.proyectoId,
      titulo: a.datos.titulo,
      url: `/proyectos/${a.datos.proyectoId}?paso=escenas`,
    });
  });

  test("el clip de otra persona responde 404 y no crea nada", async () => {
    const clip = await clipDeCrear();
    expect((await estado(clip.id, berta)).codigo).toBe(404);
    expect((await convertir(clip.id, berta)).codigo).toBe(404);
    expect(await db().select().from(projects).where(eq(projects.userId, berta.id))).toHaveLength(0);
    const [intacto] = await db().select().from(generationJobs).where(eq(generationJobs.id, clip.id));
    expect(intacto?.sceneId).toBeNull();
  });

  test("un clip fallido o en curso no se convierte y dice por qué", async () => {
    const fallido = await clipDeCrear({ state: "fallido", resultMediaId: null, consumedCredits: null });
    expect((await estado(fallido.id)).datos).toMatchObject({ estado: "no_convertible" });
    const rechazo = await convertir(fallido.id);
    expect(rechazo.codigo).toBe(409);
    expect(mensajeDe(rechazo.datos)).toContain("no salió");

    const enCurso = await clipDeCrear({ state: "en_curso", resultMediaId: null, finishedAt: null });
    const otro = await convertir(enCurso.id);
    expect(otro.codigo).toBe(409);
    expect(mensajeDe(otro.datos)).toContain("todavía se está generando");
    expect(await db().select().from(projects).where(eq(projects.userId, ana.id))).toHaveLength(0);
  });

  test("un consentimiento revocado no se salta al convertir", async () => {
    const clip = await clipDeCrear();
    const revocado = await rutaConsentimiento.DELETE(
      pedir(ana, `/api/personajes/${personajeId}/consentimiento`, "DELETE", { motivo: "Ya no quiere salir." }),
      ctx(personajeId),
    );
    expect(revocado.status).toBe(200);
    try {
      const { datos } = await estado(clip.id);
      expect(datos.estado).toBe("no_convertible");
      const rechazo = await convertir(clip.id);
      expect(rechazo.codigo).toBe(409);
      expect(mensajeDe(rechazo.datos)).toContain("«Lucía»");
      expect(await db().select().from(projects).where(eq(projects.userId, ana.id))).toHaveLength(0);
    } finally {
      // El resto de la suite necesita a Lucía con su consentimiento vigente.
      const registro = await rutaConsentimiento.POST(
        pedir(ana, `/api/personajes/${personajeId}/consentimiento`, "POST", {
          titular: "yo",
          mayoriaDeEdad: true,
          alcance: "personal",
        }),
        ctx(personajeId),
      );
      expect(registro.status).toBe(200);
    }
  });

  test("un clip sin personaje (imagen propia) se convierte sin protagonista ni reparto", async () => {
    const clip = await clipDeCrear({ characterId: null, referencesReviewedAt: null });
    const { codigo, datos } = await convertir(clip.id);
    expect(codigo).toBe(201);
    const [proyecto] = await db().select().from(projects).where(eq(projects.id, datos.proyectoId));
    expect(proyecto?.mainCharacterId).toBeNull();
    const escena = await escenaDe(datos.proyectoId);
    expect(escena.approvedFrameMediaId).toBe(clip.sourceMediaId);
    expect(await db().select().from(sceneCharacters).where(eq(sceneCharacters.sceneId, escena.id))).toHaveLength(0);
  });

  test("un trend que ya no está vigente no impide convertir: se avisa y la escena lo sigue citando", async () => {
    // Un trend de la instalación que ha caducado después de generar el clip.
    const [trend] = await db()
      .insert(promptTemplates)
      .values({
        slug: `trend-conversion-${crypto.randomUUID()}`,
        name: "Unboxing de prueba",
        kind: "trend",
        trendStatus: "caducada",
        capability: "image_to_video",
        template: "One continuous close shot. Scene detail: {{escena}}.",
        version: 3,
      })
      .returning();
    if (!trend) throw new Error("No se ha podido crear el trend de prueba.");
    try {
      const clip = await clipDeCrear(
        { promptTemplateId: trend.id },
        { plantilla: { id: trend.id, version: trend.version, kind: "trend", editado: false, presets: {} } },
      );
      const { datos } = await estado(clip.id);
      expect(datos.estado).toBe("convertible");
      expect(datos.estado === "convertible" ? datos.avisos.join(" ") : "").toContain("ha caducado");
      const convertido = await convertir(clip.id);
      expect(convertido.datos.titulo).toBe(`«${trend.name}» desde Crear`);
      const escena = await escenaDe(convertido.datos.proyectoId);
      expect(escena.templateId).toBe(trend.id);
      expect(escena.templateVersion).toBe(trend.version);
    } finally {
      await db().delete(projects).where(eq(projects.userId, ana.id));
      await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
      await db().delete(promptTemplates).where(eq(promptTemplates.id, trend.id));
    }
  });

  test("con producto: la escena hereda el producto y su acción, y sin declaración de marca no se convierte", async () => {
    const [producto] = await db().insert(products).values({ ownerId: ana.id, name: "Champú de verano" }).returning();
    if (!producto) throw new Error("No se ha podido crear el producto de prueba.");
    const conMarca = await clipDeCrear({
      productId: producto.id,
      productAction: "sostener",
      brandRightsAt: new Date(),
    });
    const { datos } = await convertir(conMarca.id);
    const escena = await escenaDe(datos.proyectoId);
    expect(escena.productId).toBe(producto.id);
    expect(escena.productAction).toBe("sostener");

    const sinMarca = await clipDeCrear({ productId: producto.id, productAction: "sostener", brandRightsAt: null });
    const rechazo = await convertir(sinMarca.id);
    expect(rechazo.codigo).toBe(409);
    expect(mensajeDe(rechazo.datos)).toContain("derecho a usar la marca");
    await db().delete(products).where(eq(products.id, producto.id));
  });

  test("quitar el audio del clip sube la versión del montaje y el MP4 sale sin él", async () => {
    const clip = await clipDeCrear();
    const { datos } = await convertir(clip.id);
    const escena = await escenaDe(datos.proyectoId);

    const conAudio = await volumenDelMp4(datos.proyectoId);
    expect(conAudio).toBeGreaterThan(-40);

    const [antes] = await db().select().from(montages).where(eq(montages.projectId, datos.proyectoId));
    const quitado = await quitarAudio(escena.id, true);
    expect(quitado.codigo).toBe(200);
    expect(quitado.datos.clips[0]?.audioQuitado).toBe(true);
    expect(quitado.datos.clips[0]?.hablaEnElClip).toBe(true);
    const [despues] = await db().select().from(montages).where(eq(montages.projectId, datos.proyectoId));
    expect(despues?.version).toBe((antes?.version ?? 0) + 1);
    // Repetir el mismo valor no sube otra versión.
    await quitarAudio(escena.id, true);
    const [igual] = await db().select().from(montages).where(eq(montages.projectId, datos.proyectoId));
    expect(igual?.version).toBe(despues?.version ?? -1);

    expect(await volumenDelMp4(datos.proyectoId)).toBeLessThan(-80);
  }, 180_000);

  test("con la pista de voz aparte, el MP4 lleva la voz aunque el audio del clip esté quitado", async () => {
    const clip = await clipDeCrear();
    const { datos } = await convertir(clip.id);
    const escena = await escenaDe(datos.proyectoId);
    await db().update(projects).set({ voiceMode: "pista" }).where(eq(projects.id, datos.proyectoId));
    await db()
      .update(scenes)
      .set({ voiceMediaId: await medioDeVoz(2) })
      .where(eq(scenes.id, escena.id));
    // Antes de quitarlo suenan los dos: el tono del clip (440 Hz) y la voz (880 Hz).
    const clipAntes = await volumenDelMp4(datos.proyectoId, 440);
    expect(clipAntes).toBeGreaterThan(-35);
    expect((await quitarAudio(escena.id, true)).codigo).toBe(200);
    // Después la voz sigue sonando, y en la banda del clip queda solo lo poco que la voz deja pasar por el filtro.
    expect(await volumenDelMp4(datos.proyectoId, 880)).toBeGreaterThan(-35);
    const clipDespues = await volumenDelMp4(datos.proyectoId, 440);
    expect(clipDespues).toBeLessThan(clipAntes - 15);
  }, 240_000);

  test("una escena que entra en silencio no se transcribe ni lleva subtítulos al exportar; con pista de voz, sí", async () => {
    const clip = await clipDeCrear();
    const { datos } = await convertir(clip.id);
    const escena = await escenaDe(datos.proyectoId);
    await db()
      .update(scenes)
      .set({ subtitles: [{ desde: 0, hasta: 1, texto: "Esto me ha cambiado" }], subtitlesEditedAt: new Date() })
      .where(eq(scenes.id, escena.id));
    const srtDeLaExportacion = async () => {
      await rutaMontaje.GET(pedir(ana, `/api/proyectos/${datos.proyectoId}/montaje`), ctx(datos.proyectoId));
      const pedida = await rutaExportar.POST(
        pedir(ana, `/api/proyectos/${datos.proyectoId}/montaje/exportacion`, "POST", {}),
        ctx(datos.proyectoId),
      );
      expect(pedida.status).toBe(202);
      const [ultima] = await db()
        .select()
        .from(montageExports)
        .where(eq(montageExports.projectId, datos.proyectoId))
        .orderBy(desc(montageExports.createdAt))
        .limit(1);
      return ultima?.subtitlesSrt ?? "";
    };

    expect(await srtDeLaExportacion()).toContain("Esto me ha cambiado");
    await quitarAudio(escena.id, true);
    expect(await srtDeLaExportacion()).toBe("");
    // Tampoco se saca del clip lo que no se oye.
    const [silenciada] = await db().select().from(scenes).where(eq(scenes.id, escena.id));
    await expect(transcribirEscena(actor, escena.id, true)).rejects.toThrow(
      "audio del clip de esta escena está quitado",
    );
    expect(silenciada?.clipAudioMuted).toBe(true);

    // Con pista de voz aparte la escena sí suena, así que sus subtítulos vuelven al fichero.
    await db().update(projects).set({ voiceMode: "pista" }).where(eq(projects.id, datos.proyectoId));
    await db()
      .update(scenes)
      .set({ voiceMediaId: await medioDeVoz(2) })
      .where(eq(scenes.id, escena.id));
    await db()
      .update(montages)
      .set({ version: sql`${montages.version} + 1` })
      .where(eq(montages.projectId, datos.proyectoId));
    expect(await srtDeLaExportacion()).toContain("Esto me ha cambiado");
  });

  test("una afirmación de salud sin verificar impide exportar el proyecto convertido y dice qué hacer", async () => {
    const clip = await clipDeCrear();
    const { datos } = await convertir(clip.id);
    const escena = await escenaDe(datos.proyectoId);
    const [afirmacion] = await db()
      .insert(claims)
      .values({ sceneId: escena.id, text: "Cura la caspa en una semana.", kind: "salud" })
      .returning();
    await rutaMontaje.GET(pedir(ana, `/api/proyectos/${datos.proyectoId}/montaje`), ctx(datos.proyectoId));
    const rechazo = await rutaExportar.POST(
      pedir(ana, `/api/proyectos/${datos.proyectoId}/montaje/exportacion`, "POST", {}),
      ctx(datos.proyectoId),
    );
    expect(rechazo.status).toBe(409);
    const mensaje = mensajeDe(await rechazo.json());
    expect(mensaje).toContain("afirmación sobre salud sin verificar");
    expect(mensaje).toContain("Verifícala");
    await db()
      .update(claims)
      .set({ state: "verificada", source: "Estudio propio" })
      .where(eq(claims.id, afirmacion?.id ?? ""));
    const aceptada = await rutaExportar.POST(
      pedir(ana, `/api/proyectos/${datos.proyectoId}/montaje/exportacion`, "POST", {}),
      ctx(datos.proyectoId),
    );
    expect(aceptada.status).toBe(202);
  });

  test("sin la imagen de partida no se convierte, y lo dice", async () => {
    const clip = await clipDeCrear();
    await db()
      .update(media)
      .set({ deletedAt: new Date() })
      .where(eq(media.id, clip.sourceMediaId ?? ""));
    const rechazo = await convertir(clip.id);
    expect(rechazo.codigo).toBe(409);
    expect(mensajeDe(rechazo.datos)).toContain("imagen de partida");
  });

  test("el techo del proyecto nace, como mínimo, en lo que ya costó el clip", async () => {
    const previo = (await leerAjustes()).presupuestoProyecto;
    await guardarAjustes({ presupuestoProyecto: 30 }, null);
    try {
      const clip = await clipDeCrear();
      const { datos } = await convertir(clip.id);
      const [proyecto] = await db().select().from(projects).where(eq(projects.id, datos.proyectoId));
      expect(proyecto?.authorizedCredits).toBe(60);
      expect(await comprometidoDelProyecto(datos.proyectoId)).toBe(60);
    } finally {
      await guardarAjustes({ presupuestoProyecto: previo }, null);
    }
  });

  test("quitar el audio valida la entrada, exige clip y solo lo hace el dueño", async () => {
    const clip = await clipDeCrear();
    const { datos } = await convertir(clip.id);
    const escena = await escenaDe(datos.proyectoId);
    expect((await quitarAudio(escena.id, "sí")).codigo).toBe(400);
    expect((await quitarAudio(escena.id, true, berta)).codigo).toBe(404);
    await db().update(scenes).set({ clipMediaId: null }).where(eq(scenes.id, escena.id));
    const sinClip = await quitarAudio(escena.id, true);
    expect(sinClip.codigo).toBe(409);
    expect(mensajeDe(sinClip.datos)).toContain("no tiene clip");
  });

  test("borrar el proyecto deja el clip en Crear, con su archivo, y se puede volver a convertir", async () => {
    const clip = await clipDeCrear();
    const { datos } = await convertir(clip.id);
    const borrado = await rutaProyecto.DELETE(
      pedir(ana, `/api/proyectos/${datos.proyectoId}`, "DELETE"),
      ctx(datos.proyectoId),
    );
    expect(borrado.status).toBe(200);
    const [trabajo] = await db().select().from(generationJobs).where(eq(generationJobs.id, clip.id));
    expect(trabajo?.sceneId).toBeNull();
    const [archivo] = await db()
      .select()
      .from(media)
      .where(eq(media.id, clip.resultMediaId ?? ""));
    expect(archivo?.deletedAt).toBeNull();
    expect((await estado(clip.id)).datos.estado).toBe("convertible");
  });
});
