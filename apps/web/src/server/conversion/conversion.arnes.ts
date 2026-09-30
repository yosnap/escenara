import { expect } from "bun:test";
import path from "node:path";
import type { ProyectoConvertido } from "@/lib/conversion";
import { copia, ffmpeg, fotoDeReferencia } from "./medios-de-prueba";

/**
 * Ayudas de las pruebas de la conversión, aparte para que cada fichero de pruebas quede por debajo del límite. Se
 * importan **después** de elegir la base de datos de prueba (`await import`), porque el cliente de la base lee
 * `DATABASE_URL` al crearse.
 */
const rutaConvertir = await import("@/app/api/generacion/trabajos/[id]/proyecto/route");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const { db } = await import("../db/cliente");
const { generationJobs, scenes, usageLedger } = await import("../db/esquema");
const { crearMedio } = await import("../media/servicio");
const { listarModelos } = await import("../proveedores/catalogo");
const { adaptadorKie } = await import("../proveedores/kie/adaptador");
const { entradaGuardada } = await import("../generacion/servicio");
const { eq } = await import("drizzle-orm");

type Sesion = Awaited<ReturnType<typeof import("../auth/sesion-de-prueba").crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;

export const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

export const pedir = (s: Sesion, url: string, metodo = "GET", cuerpo?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: metodo,
    headers: {
      cookie: s.cookie,
      ...(metodo === "GET" ? {} : { origin: "http://localhost", "Content-Type": "application/json" }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

/** Lo que las ayudas leen en cada llamada: el usuario, su carpeta temporal y su personaje, que se crean al empezar. */
export interface EstadoDelArnes {
  ana: Sesion;
  actor: Actor;
  carpeta: string;
  personajeId: string;
}

export function crearAyudas(e: () => EstadoDelArnes) {
  async function personajeConConsentimiento(): Promise<string> {
    const creado = await rutaPersonajes.POST(
      pedir(e().ana, "/api/personajes", "POST", { nombre: "Lucía", tipo: "persona" }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const { id } = (await creado.json()) as { id: string };
    const referencias = await Promise.all(
      Array.from({ length: 3 }, async (_, i) => ({
        medioId: (
          await crearMedio(e().actor, new File([await fotoDeReferencia()], `lucia-${i}.png`, { type: "image/png" }))
        ).id,
      })),
    );
    const subidas = await rutaReferencias.POST(
      pedir(e().ana, `/api/personajes/${id}/referencias`, "POST", { referencias }),
      ctx(id),
    );
    expect(subidas.status).toBe(200);
    const registro = await rutaConsentimiento.POST(
      pedir(e().ana, `/api/personajes/${id}/consentimiento`, "POST", {
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
    const ruta = path.join(e().carpeta, `${nombre}-${crypto.randomUUID()}.mp4`);
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
    return (await crearMedio(e().actor, archivo, { duracion: segundos }, ["video"])).id;
  }

  /** Audio de voz aparte: un tono de 880 Hz. Es lo que sería la pista de voz generada de la escena. */
  async function medioDeVoz(segundos: number): Promise<string> {
    const ruta = path.join(e().carpeta, `voz-${crypto.randomUUID()}.mp3`);
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
    return (await crearMedio(e().actor, archivo, { duracion: segundos }, ["audio"])).id;
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
    const imagen = await crearMedio(
      e().actor,
      new File([await fotoDeReferencia()], "partida.png", { type: "image/png" }),
    );
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
        userId: e().ana.id,
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
        characterId: e().personajeId,
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
      userId: e().ana.id,
      jobId: trabajo.id,
      provider: "kie",
      model: "veo3_fast",
      entryType: "consumo",
      credits: 60,
      informed: true,
    });
    return trabajo;
  }

  const convertir = async (trabajoId: string, sesion = e().ana) => {
    const respuesta = await rutaConvertir.POST(
      pedir(sesion, `/api/generacion/trabajos/${trabajoId}/proyecto`, "POST", {}),
      ctx(trabajoId),
    );
    return { codigo: respuesta.status, datos: (await respuesta.json()) as ProyectoConvertido };
  };

  const escenaDe = async (proyectoId: string) => {
    const [escena] = await db().select().from(scenes).where(eq(scenes.projectId, proyectoId));
    if (!escena) throw new Error("El proyecto convertido no tiene escena.");
    return escena;
  };

  return { personajeConConsentimiento, medioDeVideo, medioDeVoz, clipDeCrear, convertir, escenaDe };
}
