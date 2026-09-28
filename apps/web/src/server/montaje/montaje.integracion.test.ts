import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { MontajeVista } from "@/lib/montaje";
import type { ProyectoDetalle } from "@/lib/proyectos";

/**
 * Montaje y exportación de un proyecto (RF08, 0.32.0) contra el PostgreSQL y el SeaweedFS locales
 * (`bun run services:up`) y contra **FFmpeg de verdad**.
 *
 * **Ningún test llama a ningún proveedor y ninguno gasta un crédito**: los clips se fabrican aquí mismo con
 * `ffmpeg -f lavfi` (un par de segundos de color con un tono de audio), se suben a la biblioteca como cualquier
 * archivo del usuario y se enganchan a las escenas. El render es el de producción, con su worker y su cola.
 *
 * Lo que comprueba, uno por uno, los criterios de aceptación de la fase:
 *
 * - el MP4 resultante mide **1080 × 1920**, dura lo que suma la línea de tiempo y **tiene audio** (ffprobe);
 * - un **fallo crítico abierto** en la revisión impide exportar, y el mensaje dice qué escena;
 * - una escena **sin clip** en la línea de tiempo impide exportar, y el proyecto **sigue editable** después;
 * - pedir la exportación dos veces con el mismo montaje y la misma versión **no duplica ficheros**;
 * - los `.srt` adjuntos son los **editados**, con los tiempos corridos por los recortes, y **quemados aparecen en
 *   un fotograma** (se compara con la misma exportación sin quemar, sobre clips negros);
 * - la etiqueta **no se puede quitar** con un personaje con apariencia de persona;
 * - un montaje ajeno responde 404;
 * - la **cuota** de la biblioteca se respeta antes de montar nada;
 * - la **entrada hostil** (comillas, saltos de línea, `;`, `$()`) no rompe el render ni inyecta nada.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_montaje");
}

const { eq } = await import("drizzle-orm");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaEscenas = await import("@/app/api/proyectos/[id]/escenas/route");
const rutaMontaje = await import("@/app/api/proyectos/[id]/montaje/route");
const rutaExportar = await import("@/app/api/proyectos/[id]/montaje/exportacion/route");
const rutaExportacion = await import("@/app/api/exportaciones/[id]/route");
const rutaSubtitulos = await import("@/app/api/exportaciones/[id]/subtitulos/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characters, media, montageExports, montages, projects, rateLimits, scenes, users } = await import(
  "../db/esquema"
);
const { crearMedio } = await import("../media/servicio");
const { leerObjeto } = await import("../almacenamiento");
const { pasadaDeExportaciones } = await import("./cola");
const { medirConFfprobe } = await import("../revision/medicion");
const { revisarAMano } = await import("../revision/humana");

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

/** Lanza un FFmpeg de la prueba y devuelve su salida cruda. Nada de esto sale de la máquina. */
async function ffmpeg(argumentos: readonly string[]): Promise<{ ok: boolean; datos: Uint8Array }> {
  const proceso = Bun.spawn(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", ...argumentos], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [datos, error, codigo] = await Promise.all([
    new Response(proceso.stdout).bytes(),
    new Response(proceso.stderr).text(),
    proceso.exited,
  ]);
  if (codigo !== 0) console.error("[prueba] ffmpeg:", error.trim().split("\n").slice(-3).join(" | "));
  return { ok: codigo === 0, datos };
}

describe.skipIf(!hayBaseDeDatos)("montaje y exportación de un proyecto", () => {
  let ana: Sesion;
  let berta: Sesion;
  let actor: Actor;
  let carpeta: string;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;
  let proyectoId: string;
  let escenaIds: string[];

  beforeAll(async () => {
    // Esta suite cambia ajustes de la instalación (la cuota): nunca en la base de desarrollo.
    exigirBaseDeDatosDePrueba("escenara_pruebas_montaje");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    berta = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    carpeta = await mkdtemp(path.join(tmpdir(), "escenara-prueba-montaje-"));
    await guardarAjustes({ montajeActivo: true, cuotaMb: 2048 }, null);
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
    await db().delete(media).where(eq(media.ownerId, ana.id));
    await db().delete(characters).where(eq(characters.ownerId, ana.id));
    // El ritmo de escrituras es para una persona, no para una suite que guarda decenas de montajes por pasada.
    exigirBaseDeDatosDePrueba("escenara_pruebas_montaje");
    await db().delete(rateLimits);
    await guardarAjustes({ cuotaMb: 2048 }, null);
    ({ proyectoId, escenaIds } = await nuevoProyectoConClips());
  });

  // ── Preparación del material ──────────────────────────────────────────────────────────────────────────────

  /**
   * Clip de prueba: `segundos` de un color plano con un tono de audio, en 720 × 1280 (así el render tiene que
   * escalar de verdad hasta 1080 × 1920). Se fabrica con FFmpeg y **no sale de la máquina**.
   */
  async function clipDePrueba(nombre: string, segundos: number, color: string, conAudio = true): Promise<Uint8Array> {
    const ruta = path.join(carpeta, `${nombre}.mp4`);
    const { ok } = await ffmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=720x1280:d=${segundos}:r=25`,
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
    return new Uint8Array(await Bun.file(ruta).arrayBuffer());
  }

  /** Sube un clip a la biblioteca de Ana, como cualquier archivo suyo, y devuelve su identificador. */
  async function subirClip(nombre: string, datos: Uint8Array, segundos: number): Promise<string> {
    const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
    copia.set(datos);
    const medio = await crearMedio(
      actor,
      new File([copia], `${nombre}.mp4`, { type: "video/mp4" }),
      { duracion: segundos },
      ["video"],
    );
    return medio.id;
  }

  /** Proyecto con dos escenas, cada una con su clip y sus subtítulos editados. */
  async function nuevoProyectoConClips(): Promise<{ proyectoId: string; escenaIds: string[] }> {
    const creado = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", {
        titulo: "Montaje de prueba",
        formato: "reel_vertical",
        idea: "Dos planos cortos para montar.",
        presupuestoCreditos: 1000,
      }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const id = ((await creado.json()) as ProyectoDetalle).proyecto.id;
    for (const [indice, texto] of ["Primera frase del montaje.", "Segunda frase del montaje."].entries()) {
      const respuesta = await rutaEscenas.POST(
        pedir(ana, `/api/proyectos/${id}/escenas`, "POST", {
          texto,
          accion: `Plano ${indice + 1}`,
          segundos: 4,
        }),
        ctx(id),
      );
      expect(respuesta.status).toBe(201);
    }
    const filas = await db().select().from(scenes).where(eq(scenes.projectId, id)).orderBy(scenes.sortOrder);
    const ids: string[] = [];
    for (const [indice, escena] of filas.entries()) {
      const datos = await clipDePrueba(`clip-${indice}`, 2, indice === 0 ? "black" : "black");
      const medioId = await subirClip(`clip-${indice}`, datos, 2);
      await db()
        .update(scenes)
        .set({
          clipMediaId: medioId,
          subtitles: [{ desde: 0, hasta: 1, texto: `Subtítulo ${indice + 1}` }],
          subtitlesEditedAt: new Date(),
        })
        .where(eq(scenes.id, escena.id));
      ids.push(escena.id);
    }
    return { proyectoId: id, escenaIds: ids };
  }

  // ── Utilidades de la pantalla ────────────────────────────────────────────────────────────────────────────

  const leerMontaje = async (sesion = ana, id = proyectoId) => {
    const respuesta = await rutaMontaje.GET(pedir(sesion, `/api/proyectos/${id}/montaje`), ctx(id));
    return { estado: respuesta.status, datos: (await respuesta.json()) as MontajeVista };
  };

  async function guardar(cambios: Partial<Record<string, unknown>>, sesion = ana, id = proyectoId) {
    const { datos } = await leerMontaje(sesion, id);
    const respuesta = await rutaMontaje.PUT(
      pedir(sesion, `/api/proyectos/${id}/montaje`, "PUT", {
        fragmentos: datos.fragmentos,
        volumenVoz: datos.volumenVoz,
        volumenMusica: datos.volumenMusica,
        subtitulosQuemados: datos.subtitulosQuemados,
        formatoSubtitulos: datos.formatoSubtitulos,
        etiquetaVisible: datos.etiquetaVisible,
        etiquetaPosicion: datos.etiquetaPosicion,
        version: datos.version,
        ...cambios,
      }),
      ctx(id),
    );
    return { estado: respuesta.status, datos: (await respuesta.json()) as MontajeVista | { error?: string } };
  }

  async function exportar(sesion = ana, id = proyectoId) {
    const respuesta = await rutaExportar.POST(
      pedir(sesion, `/api/proyectos/${id}/montaje/exportacion`, "POST", {}),
      ctx(id),
    );
    return { estado: respuesta.status, datos: (await respuesta.json()) as MontajeVista | { error?: string } };
  }

  /** Pide la exportación y deja que el worker la monte. Devuelve la vista de la exportación terminada. */
  async function exportarYMontar(sesion = ana, id = proyectoId) {
    const pedida = await exportar(sesion, id);
    expect(pedida.estado).toBe(202);
    const montadas = await pasadaDeExportaciones(`worker-prueba-${crypto.randomUUID()}`);
    expect(montadas).toBe(1);
    const { datos } = await leerMontaje(sesion, id);
    const exportacion = datos.exportaciones[0];
    if (!exportacion) throw new Error("No hay ninguna exportación después de montar.");
    return exportacion;
  }

  /** Trae el MP4 exportado a un temporal para medirlo con ffprobe, igual que hace la revisión. */
  async function ficheroExportado(medioId: string): Promise<string> {
    const [fila] = await db().select().from(media).where(eq(media.id, medioId)).limit(1);
    if (!fila) throw new Error("El medio de la exportación no existe.");
    const ruta = path.join(carpeta, `salida-${medioId}.mp4`);
    await Bun.write(ruta, await leerObjeto(fila.storageKey).arrayBuffer());
    return ruta;
  }

  /** Píxeles no negros de un fotograma, en escala de grises. Es con lo que se ve si hay algo dibujado. */
  async function pixelesConLuz(ruta: string, segundo: number): Promise<number> {
    const { ok, datos } = await ffmpeg([
      "-ss",
      String(segundo),
      "-i",
      ruta,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ]);
    expect(ok).toBe(true);
    let conLuz = 0;
    for (const byte of datos) if (byte > 40) conLuz++;
    return conLuz;
  }

  // ── Los tests ────────────────────────────────────────────────────────────────────────────────────────────

  test("el montaje se propone con todas las escenas con clip, en orden y sin recortar", async () => {
    const { estado, datos } = await leerMontaje();
    expect(estado).toBe(200);
    expect(datos.fragmentos).toHaveLength(2);
    expect(datos.fragmentos.map((f) => f.escenaId)).toEqual(escenaIds);
    expect(datos.duracionTotal).toBe(4);
    expect(datos.controles.estado).toBe("listo");
    expect(datos.escenas.every((e) => e.duracionClip === 2)).toBe(true);
  });

  test("el MP4 exportado es 1080 × 1920, dura lo que suma la línea de tiempo y tiene audio", async () => {
    // Se recorta el segundo fragmento: la duración esperada es la de los recortes, no la de los clips.
    const { datos } = await leerMontaje();
    const guardado = await guardar({
      fragmentos: [datos.fragmentos[0], { ...datos.fragmentos[1], entrada: 0.5, salida: 1.5 }],
    });
    expect(guardado.estado).toBe(200);

    const exportacion = await exportarYMontar();
    expect(exportacion.estado).toBe("listo");
    expect(exportacion.etapa).toBe("listo");
    expect(exportacion.progreso).toBe(100);
    expect(exportacion.error).toBe("");
    expect(exportacion.medio).not.toBeNull();

    const medidas = await medirConFfprobe(await ficheroExportado(exportacion.medio?.id ?? ""));
    expect(medidas.ancho).toBe(1080);
    expect(medidas.alto).toBe(1920);
    expect(medidas.tieneAudio).toBe(true);
    expect(medidas.duracionSegundos ?? 0).toBeGreaterThan(2.5);
    expect(medidas.duracionSegundos ?? 0).toBeLessThan(3.5);
  }, 120_000);

  test("un clip sin pista de audio no deja el montaje mudo a mitad", async () => {
    const sinAudio = await clipDePrueba("clip-mudo", 2, "black", false);
    const medioId = await subirClip("clip-mudo", sinAudio, 2);
    await db()
      .update(scenes)
      .set({ clipMediaId: medioId })
      .where(eq(scenes.id, escenaIds[1] ?? ""));

    const exportacion = await exportarYMontar();
    const medidas = await medirConFfprobe(await ficheroExportado(exportacion.medio?.id ?? ""));
    expect(medidas.tieneAudio).toBe(true);
    expect(medidas.duracionSegundos ?? 0).toBeGreaterThan(3.5);
  }, 120_000);

  test("un fallo crítico abierto impide exportar, y se dice qué escena", async () => {
    await revisarAMano(actor, escenaIds[0] ?? "", "marcar-critico", "El personaje no es el mismo en este plano.");
    const { estado, datos } = await exportar();
    expect(estado).toBe(409);
    expect(mensajeDe(datos)).toContain("fallo crítico abierto");
    expect(await db().select().from(montageExports)).toHaveLength(0);
  });

  test("una escena sin clip impide exportar, y el proyecto sigue editable después", async () => {
    // Primero se abre el montaje (con las dos escenas en la línea de tiempo) y después se queda una sin clip:
    // es lo que pasa de verdad cuando alguien borra el archivo o regenera la escena a mitad.
    expect((await leerMontaje()).datos.fragmentos).toHaveLength(2);
    await db()
      .update(scenes)
      .set({ clipMediaId: null })
      .where(eq(scenes.id, escenaIds[1] ?? ""));
    const { estado, datos } = await exportar();
    expect(estado).toBe(409);
    expect(mensajeDe(datos)).toContain("escena 2");

    // Sigue editable: se quita ese fragmento de la línea de tiempo y se guarda sin problemas.
    const montaje = await leerMontaje();
    const guardado = await guardar({ fragmentos: [montaje.datos.fragmentos[0]] });
    expect(guardado.estado).toBe(200);
    expect((guardado.datos as MontajeVista).fragmentos).toHaveLength(1);
  });

  test("pedir la exportación dos veces con el mismo montaje no duplica ficheros", async () => {
    const primera = await exportar();
    expect(primera.estado).toBe(202);
    const segunda = await exportar();
    // 200 y no 202: no se ha creado ninguna nueva, se devuelve la que ya estaba.
    expect(segunda.estado).toBe(200);
    expect(await db().select().from(montageExports)).toHaveLength(1);

    await pasadaDeExportaciones("worker-prueba-idempotente");
    // Y después de montarla, volver a pedirla sigue devolviendo la misma, con su mismo fichero.
    const tercera = await exportar();
    expect(tercera.estado).toBe(200);
    const filas = await db().select().from(montageExports);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.state).toBe("listo");
    const videos = (await db().select().from(media).where(eq(media.ownerId, ana.id))).filter(
      (m) => m.kind === "video" && m.originalName === "montaje.mp4",
    );
    expect(videos).toHaveLength(1);
  }, 120_000);

  test("guardar el montaje sube la versión, y entonces sí se exporta otra vez", async () => {
    const primera = await exportarYMontar();
    expect(primera.vigente).toBe(true);

    const { datos } = await leerMontaje();
    expect((await guardar({ fragmentos: [datos.fragmentos[0]] })).estado).toBe(200);
    const despues = await leerMontaje();
    expect(despues.datos.exportaciones[0]?.vigente).toBe(false);
    expect((await exportar()).estado).toBe(202);
    expect(await db().select().from(montageExports)).toHaveLength(2);
  }, 120_000);

  test("los subtítulos adjuntos son los editados, con los tiempos corridos por los recortes", async () => {
    await db()
      .update(scenes)
      .set({ subtitles: [{ desde: 0, hasta: 1, texto: "Lo que escribí a mano" }], subtitlesEditedAt: new Date() })
      .where(eq(scenes.id, escenaIds[1] ?? ""));
    const exportacion = await exportarYMontar();
    expect(exportacion.tieneSubtitulos).toBe(true);

    const respuesta = await rutaSubtitulos.GET(
      pedir(ana, `/api/exportaciones/${exportacion.id}/subtitulos?formato=srt`),
      ctx(exportacion.id),
    );
    expect(respuesta.status).toBe(200);
    const srt = await respuesta.text();
    expect(srt).toContain("Subtítulo 1");
    expect(srt).toContain("Lo que escribí a mano");
    // El segundo fragmento empieza en el segundo 2 del montaje, no en el 0 de su clip.
    expect(srt).toContain("00:00:02,000 --> 00:00:03,000");
  }, 120_000);

  test("los subtítulos quemados aparecen en el vídeo, y sin quemar no", async () => {
    // Sin quemar y sin etiqueta: los clips son negros, así que el fotograma tiene que salir negro entero.
    expect((await guardar({ subtitulosQuemados: false, etiquetaVisible: false })).estado).toBe(200);
    const limpia = await exportarYMontar();
    const sinQuemar = await pixelesConLuz(await ficheroExportado(limpia.medio?.id ?? ""), 0.5);
    expect(sinQuemar).toBe(0);

    expect((await guardar({ subtitulosQuemados: true, etiquetaVisible: false })).estado).toBe(200);
    const quemada = await exportarYMontar();
    expect(quemada.subtitulosQuemados).toBe(true);
    const conQuemar = await pixelesConLuz(await ficheroExportado(quemada.medio?.id ?? ""), 0.5);
    expect(conQuemar).toBeGreaterThan(100);
  }, 240_000);

  test("la etiqueta de contenido sintético se dibuja de verdad cuando está encendida", async () => {
    expect(
      (await guardar({ subtitulosQuemados: false, etiquetaVisible: true, etiquetaPosicion: "abajo" })).estado,
    ).toBe(200);
    const exportacion = await exportarYMontar();
    expect(exportacion.etiquetaAplicada).toBe(true);
    // El fotograma del segundo 1,5 no tiene subtítulo (acaban en el segundo 1): lo único con luz es la etiqueta.
    const conLuz = await pixelesConLuz(await ficheroExportado(exportacion.medio?.id ?? ""), 1.5);
    expect(conLuz).toBeGreaterThan(100);
  }, 120_000);

  test("con un personaje con apariencia de persona, la etiqueta no se puede quitar", async () => {
    const [personaje] = await db()
      .insert(characters)
      .values({ ownerId: ana.id, name: "Marta", kind: "persona" })
      .returning();
    await db()
      .update(projects)
      .set({ mainCharacterId: personaje?.id ?? null })
      .where(eq(projects.id, proyectoId));

    const montaje = await leerMontaje();
    expect(montaje.datos.etiquetaObligatoria).toBe(true);
    expect(montaje.datos.motivoEtiqueta).toContain("no quitarla");

    const intento = await guardar({ etiquetaVisible: false });
    expect(intento.estado).toBe(409);
    expect(mensajeDe(intento.datos)).toContain("no quitarla");
    // Y la posición sí se puede cambiar, con la etiqueta encendida.
    expect((await guardar({ etiquetaVisible: true, etiquetaPosicion: "arriba" })).estado).toBe(200);
    expect((await leerMontaje()).datos.etiquetaPosicion).toBe("arriba");
  });

  test("un montaje ya guardado sin etiqueta se vuelve a encender al asignar un personaje real", async () => {
    expect((await guardar({ etiquetaVisible: false })).estado).toBe(200);
    const [personaje] = await db()
      .insert(characters)
      .values({ ownerId: ana.id, name: "Luis", kind: "persona" })
      .returning();
    await db()
      .update(projects)
      .set({ mainCharacterId: personaje?.id ?? null })
      .where(eq(projects.id, proyectoId));
    expect((await leerMontaje()).datos.etiquetaVisible).toBe(true);
  });

  test("el montaje de otra persona no existe", async () => {
    expect((await rutaMontaje.GET(pedir(berta, `/api/proyectos/${proyectoId}/montaje`), ctx(proyectoId))).status).toBe(
      404,
    );
    expect((await exportar(berta)).estado).toBe(404);

    const exportacion = await exportarYMontar();
    const ajena = await rutaExportacion.GET(pedir(berta, `/api/exportaciones/${exportacion.id}`), ctx(exportacion.id));
    expect(ajena.status).toBe(404);
    const subtitulosAjenos = await rutaSubtitulos.GET(
      pedir(berta, `/api/exportaciones/${exportacion.id}/subtitulos`),
      ctx(exportacion.id),
    );
    expect(subtitulosAjenos.status).toBe(404);
  }, 120_000);

  test("sin espacio en la biblioteca no se monta nada", async () => {
    await guardarAjustes({ cuotaMb: 1 }, null);
    const { estado, datos } = await exportar();
    expect(estado).toBe(413);
    expect(mensajeDe(datos)).toContain("libres en la biblioteca");
    expect(await db().select().from(montageExports)).toHaveLength(0);
  });

  test("con el montaje apagado en los ajustes no se exporta y se dice quién lo enciende", async () => {
    await guardarAjustes({ montajeActivo: false }, null);
    try {
      const { estado, datos } = await exportar();
      expect(estado).toBe(503);
      expect(mensajeDe(datos)).toContain("Admin › Ajustes");
      expect((await leerMontaje()).datos.activo).toBe(false);
    } finally {
      await guardarAjustes({ montajeActivo: true }, null);
    }
  });

  test("un recorte más largo que el clip no se guarda, y se dice cuánto dura el clip", async () => {
    const { datos } = await leerMontaje();
    const intento = await guardar({ fragmentos: [{ ...datos.fragmentos[0], salida: 30 }] });
    expect(intento.estado).toBe(400);
    expect(mensajeDe(intento.datos)).toContain("dura 2 s");
  });

  test("guardar con una versión vieja no pisa lo que hay", async () => {
    const { datos } = await leerMontaje();
    const respuesta = await rutaMontaje.PUT(
      pedir(ana, `/api/proyectos/${proyectoId}/montaje`, "PUT", {
        fragmentos: [datos.fragmentos[0]],
        volumenVoz: 1,
        volumenMusica: 1,
        subtitulosQuemados: false,
        formatoSubtitulos: "srt",
        etiquetaVisible: true,
        etiquetaPosicion: "abajo",
        version: datos.version + 5,
      }),
      ctx(proyectoId),
    );
    expect(respuesta.status).toBe(409);
    expect((await leerMontaje()).datos.fragmentos).toHaveLength(2);
  });

  test("texto hostil en los subtítulos no rompe el render ni inyecta nada", async () => {
    const hostil = `Dice "hola"; $(touch /tmp/escenara-inyectado) && rm -rf / 'ya'\nsegunda línea, con coma`;
    await db()
      .update(scenes)
      .set({ subtitles: [{ desde: 0, hasta: 1, texto: hostil }], subtitlesEditedAt: new Date() })
      .where(eq(scenes.id, escenaIds[0] ?? ""));
    expect((await guardar({ subtitulosQuemados: true })).estado).toBe(200);

    const exportacion = await exportarYMontar();
    expect(exportacion.estado).toBe("listo");
    const medidas = await medirConFfprobe(await ficheroExportado(exportacion.medio?.id ?? ""));
    expect(medidas.ancho).toBe(1080);
    // El texto llega entero al fichero adjunto: no se ha interpretado, se ha guardado.
    const respuesta = await rutaSubtitulos.GET(
      pedir(ana, `/api/exportaciones/${exportacion.id}/subtitulos?formato=srt`),
      ctx(exportacion.id),
    );
    expect(await respuesta.text()).toContain(`$(touch /tmp/escenara-inyectado)`);
    // Y la orden no ha ejecutado nada: el fichero que pedía el texto no existe.
    expect(await Bun.file("/tmp/escenara-inyectado").exists()).toBe(false);
  }, 240_000);

  test("un montaje con la línea de tiempo vacía no se exporta", async () => {
    await leerMontaje();
    await db().update(montages).set({ fragments: [] }).where(eq(montages.projectId, proyectoId));
    const { estado, datos } = await exportar();
    expect(estado).toBe(409);
    expect(mensajeDe(datos)).toContain("no tiene ningún fragmento");
    // Y el panel de la pantalla lo dice con la regla del motor, que es lo que se le muestra antes de pulsar.
    const panel = await leerMontaje();
    expect(panel.datos.controles.estado).toBe("bloqueado");
    expect(panel.datos.controles.comprobaciones.map((c) => c.regla)).toContain("montaje-vacio");
  });
});
