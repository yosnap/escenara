import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { type FormatoMontaje, PROPORCION_DE_FORMATO, RESOLUCION_MONTAJE, ZONA_SEGURA_DE_FORMATO } from "@/lib/formatos";
import type { ExportacionVista, MontajeVista } from "@/lib/montaje";
import type { ProyectoDetalle } from "@/lib/proyectos";

/**
 * **Formatos y proyectos largos** (0.41.0) contra el PostgreSQL y el SeaweedFS locales y contra **FFmpeg de verdad**.
 *
 * **Ningún test llama a ningún proveedor y ninguno gasta un crédito**: los clips se fabrican aquí con
 * `ffmpeg -f lavfi`, se suben a la biblioteca y se enganchan a las escenas.
 *
 * Lo que comprueba:
 *
 * - el mismo montaje se exporta en **9:16, 4:5, 1:1 y 16:9** y cada MP4 mide lo que debe (ffprobe);
 * - reencuadrar **no regenera ningún clip ni genera coste**: ni un trabajo, ni un apunte de gasto, y el clip de la
 *   escena sigue siendo el mismo archivo;
 * - el encuadre guardado **cambia de verdad lo que sale** (arriba y abajo sobre un clip mitad blanco, mitad negro);
 * - los **subtítulos quemados y la etiqueta caen dentro de la zona segura** de cada formato (se miden en el
 *   fotograma);
 * - la idempotencia es por versión **y formato**, y un formato que el proyecto no tiene se rechaza con motivo;
 * - superar el máximo de escenas o de segundos de Admin › Ajustes se rechaza con motivo.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_formatos");
}

const { eq } = await import("drizzle-orm");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaEscenas = await import("@/app/api/proyectos/[id]/escenas/route");
const rutaMontaje = await import("@/app/api/proyectos/[id]/montaje/route");
const rutaEscena = await import("@/app/api/escenas/[id]/route");
const rutaFormatos = await import("@/app/api/proyectos/[id]/montaje/formatos/route");
const rutaExportar = await import("@/app/api/proyectos/[id]/montaje/exportacion/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characters, generationJobs, media, montageExports, projects, rateLimits, scenes, usageLedger, users } =
  await import("../db/esquema");
const { crearMedio } = await import("../media/servicio");
const { leerObjeto } = await import("../almacenamiento");
const { pasadaDeExportaciones } = await import("./cola");
const { medirConFfprobe } = await import("../revision/medicion");
const { revisarAutomaticamente } = await import("../revision/ejecutar");
const { fijarModoVoz } = await import("../voz/proyecto");
const { eleccionOmni } = await import("../omni/registro");

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

describe.skipIf(!hayBaseDeDatos)("formatos, reencuadre y límites de un proyecto", () => {
  let ana: Sesion;
  let actor: Actor;
  let carpeta: string;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;
  let proyectoId: string;
  let escenaIds: string[];

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_formatos");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    carpeta = await mkdtemp(path.join(tmpdir(), "escenara-prueba-formatos-"));
    await guardarAjustes({ montajeActivo: true, cuotaMb: 2048 }, null);
  });

  afterAll(async () => {
    if (ana?.email) await db().delete(users).where(eq(users.email, ana.email));
    await guardarAjustes(
      {
        montajeActivo: ajustesPrevios.montajeActivo,
        cuotaMb: ajustesPrevios.cuotaMb,
        proyectoEscenasMaximas: ajustesPrevios.proyectoEscenasMaximas,
        proyectoSegundosMaximos: ajustesPrevios.proyectoSegundosMaximos,
      },
      null,
    );
    await rm(carpeta, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await db().delete(projects).where(eq(projects.userId, ana.id));
    await db().delete(media).where(eq(media.ownerId, ana.id));
    await db().delete(characters).where(eq(characters.ownerId, ana.id));
    exigirBaseDeDatosDePrueba("escenara_pruebas_formatos");
    await db().delete(rateLimits);
    await guardarAjustes({ proyectoEscenasMaximas: 30, proyectoSegundosMaximos: 300 }, null);
    ({ proyectoId, escenaIds } = await nuevoProyectoConClips());
  });

  // ── Preparación del material ──────────────────────────────────────────────────────────────────────────────

  /**
   * Clip vertical de prueba (720 × 1280): negro, o con la mitad de arriba blanca para ver el encuadre. Lleva un
   * tono de audio. Se fabrica con FFmpeg y **no sale de la máquina**.
   */
  async function clipDePrueba(nombre: string, segundos: number, mitadBlanca = false): Promise<Uint8Array> {
    const ruta = path.join(carpeta, `${nombre}.mp4`);
    const { ok } = await ffmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=black:s=720x1280:d=${segundos}:r=25`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:duration=${segundos}`,
      ...(mitadBlanca ? ["-vf", "drawbox=x=0:y=0:w=720:h=640:color=white:t=fill"] : []),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-t",
      String(segundos),
      ruta,
    ]);
    if (!ok) throw new Error("No se ha podido fabricar el clip de prueba con FFmpeg.");
    return new Uint8Array(await Bun.file(ruta).arrayBuffer());
  }

  /** Clip de prueba de otras medidas (horizontal o cuadrado), negro y con un tono. */
  async function clipDeMedidas(nombre: string, medidas: string): Promise<Uint8Array> {
    const ruta = path.join(carpeta, `${nombre}.mp4`);
    const { ok } = await ffmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=black:s=${medidas}:d=4:r=25`,
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=4",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-t",
      "4",
      ruta,
    ]);
    if (!ok) throw new Error("No se ha podido fabricar el clip de prueba con FFmpeg.");
    return new Uint8Array(await Bun.file(ruta).arrayBuffer());
  }

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

  async function nuevaEscena(id: string, texto: string) {
    return rutaEscenas.POST(
      pedir(ana, `/api/proyectos/${id}/escenas`, "POST", { texto, accion: "Plano", segundos: 4 }),
      ctx(id),
    );
  }

  /** Proyecto con dos escenas de 2 s: la primera con la mitad de arriba blanca, las dos con un subtítulo. */
  async function nuevoProyectoConClips(): Promise<{ proyectoId: string; escenaIds: string[] }> {
    const creado = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", {
        titulo: "Formatos de prueba",
        formato: "reel_vertical",
        idea: "Dos planos para sacar en varios formatos.",
        presupuestoCreditos: 1000,
      }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const id = ((await creado.json()) as ProyectoDetalle).proyecto.id;
    for (const texto of ["Primera frase.", "Segunda frase."]) expect((await nuevaEscena(id, texto)).status).toBe(201);
    const filas = await db().select().from(scenes).where(eq(scenes.projectId, id)).orderBy(scenes.sortOrder);
    const ids: string[] = [];
    for (const [indice, escena] of filas.entries()) {
      const medioId = await subirClip(`clip-${indice}`, await clipDePrueba(`clip-${indice}`, 2, indice === 0), 2);
      await db()
        .update(scenes)
        .set({
          clipMediaId: medioId,
          subtitles: [{ desde: 0, hasta: 2, texto: `Subtítulo ${indice + 1}` }],
          subtitlesEditedAt: new Date(),
        })
        .where(eq(scenes.id, escena.id));
      ids.push(escena.id);
    }
    return { proyectoId: id, escenaIds: ids };
  }

  // ── Utilidades ───────────────────────────────────────────────────────────────────────────────────────────

  const leerMontaje = async () => {
    const respuesta = await rutaMontaje.GET(pedir(ana, `/api/proyectos/${proyectoId}/montaje`), ctx(proyectoId));
    return (await respuesta.json()) as MontajeVista;
  };

  async function guardar(cambios: Partial<Record<string, unknown>>) {
    const datos = await leerMontaje();
    const respuesta = await rutaMontaje.PUT(
      pedir(ana, `/api/proyectos/${proyectoId}/montaje`, "PUT", {
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
      ctx(proyectoId),
    );
    return { estado: respuesta.status, datos: (await respuesta.json()) as MontajeVista | { error?: string } };
  }

  async function ponerFormatos(formatos: FormatoMontaje[]) {
    const respuesta = await rutaFormatos.PUT(
      pedir(ana, `/api/proyectos/${proyectoId}/montaje/formatos`, "PUT", { formatos }),
      ctx(proyectoId),
    );
    return { estado: respuesta.status, datos: (await respuesta.json()) as MontajeVista | { error?: string } };
  }

  async function exportar(formato?: FormatoMontaje) {
    const respuesta = await rutaExportar.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/montaje/exportacion`, "POST", formato ? { formato } : {}),
      ctx(proyectoId),
    );
    return { estado: respuesta.status, datos: (await respuesta.json()) as MontajeVista | { error?: string } };
  }

  /** Pide la exportación en un formato, deja que el worker la monte y devuelve la ruta del MP4 y su vista. */
  async function exportarYMontar(formato: FormatoMontaje): Promise<{ ruta: string; vista: ExportacionVista }> {
    const pedida = await exportar(formato);
    expect(pedida.estado).toBe(202);
    expect(await pasadaDeExportaciones(`worker-prueba-${crypto.randomUUID()}`)).toBe(1);
    const vista = (await leerMontaje()).exportaciones.find((e) => e.formato === formato);
    if (!vista?.medio) throw new Error(`La exportación en ${formato} no ha dejado fichero: ${vista?.error ?? ""}`);
    const [fila] = await db().select().from(media).where(eq(media.id, vista.medio.id)).limit(1);
    if (!fila) throw new Error("El medio de la exportación no existe.");
    const ruta = path.join(carpeta, `salida-${formato}-${vista.id}.mp4`);
    await Bun.write(ruta, await leerObjeto(fila.storageKey).arrayBuffer());
    return { ruta, vista };
  }

  /** Filas del fotograma con algún píxel claro, en escala de grises. Es donde hay algo dibujado. */
  async function filasConLuz(ruta: string, segundo: number, ancho: number): Promise<number[]> {
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
    const filas: number[] = [];
    for (let fila = 0; fila * ancho < datos.length; fila++) {
      const linea = datos.subarray(fila * ancho, (fila + 1) * ancho);
      if (linea.some((byte) => byte > 180)) filas.push(fila);
    }
    return filas;
  }

  /** Brillo medio del fotograma (0–255). */
  async function brilloMedio(ruta: string, segundo: number): Promise<number> {
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
    let suma = 0;
    for (const byte of datos) suma += byte;
    return suma / Math.max(1, datos.length);
  }

  // ── Los tests ────────────────────────────────────────────────────────────────────────────────────────────

  test("el proyecto nace en vertical y el montaje lo dice, con los límites de la instalación", async () => {
    const montaje = await leerMontaje();
    expect(montaje.formatos).toEqual(["vertical_9_16"]);
    expect(montaje.encuadres).toEqual({});
    expect(montaje.segundosMaximos).toBe(300);
  });

  test("el mismo montaje sale en 9:16, 4:5, 1:1 y 16:9, y cada MP4 mide lo suyo (ffprobe)", async () => {
    expect((await ponerFormatos(["vertical_9_16", "vertical_4_5", "cuadrado_1_1", "horizontal_16_9"])).estado).toBe(
      200,
    );
    for (const formato of ["vertical_9_16", "vertical_4_5", "cuadrado_1_1", "horizontal_16_9"] as const) {
      const { ruta, vista } = await exportarYMontar(formato);
      const medidas = await medirConFfprobe(ruta);
      expect({ formato, ancho: medidas.ancho, alto: medidas.alto }).toEqual({
        formato,
        ancho: RESOLUCION_MONTAJE[formato].ancho,
        alto: RESOLUCION_MONTAJE[formato].alto,
      });
      expect(medidas.tieneVideo).toBe(true);
      expect(medidas.tieneAudio).toBe(true);
      expect(medidas.duracionSegundos ?? 0).toBeGreaterThan(3.5);
      expect(medidas.duracionSegundos ?? 0).toBeLessThan(4.5);
      expect(vista.ancho).toBe(RESOLUCION_MONTAJE[formato].ancho);
    }
  }, 240_000);

  test("reencuadrar no regenera ningún clip ni genera coste de proveedor", async () => {
    const [antes] = await db()
      .select()
      .from(scenes)
      .where(eq(scenes.id, escenaIds[0] ?? ""));
    const [clipAntes] = await db()
      .select()
      .from(media)
      .where(eq(media.id, antes?.clipMediaId ?? ""));
    await ponerFormatos(["vertical_9_16", "horizontal_16_9"]);
    await guardar({ encuadres: { horizontal_16_9: { [escenaIds[0] ?? ""]: { modo: "recorte", x: 50, y: 0 } } } });
    await exportarYMontar("horizontal_16_9");

    // Ni un trabajo de generación ni un apunte de gasto: el reencuadre es FFmpeg local.
    expect(await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id))).toHaveLength(0);
    expect(await db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id))).toHaveLength(0);
    // Y el clip de la escena sigue siendo el mismo archivo, sin tocar: es la fuente de todos los formatos.
    const [despues] = await db()
      .select()
      .from(scenes)
      .where(eq(scenes.id, escenaIds[0] ?? ""));
    expect(despues?.clipMediaId).toBe(antes?.clipMediaId ?? "");
    const [clipDespues] = await db()
      .select()
      .from(media)
      .where(eq(media.id, antes?.clipMediaId ?? ""));
    expect(clipDespues?.storageKey).toBe(clipAntes?.storageKey ?? "");
    expect(clipDespues?.sizeBytes).toBe(clipAntes?.sizeBytes ?? -1);
  }, 120_000);

  test("el encuadre guardado cambia de verdad lo que sale: arriba se ve el blanco, abajo el negro", async () => {
    await ponerFormatos(["vertical_9_16", "horizontal_16_9"]);
    const escena = escenaIds[0] ?? "";
    await guardar({
      fragmentos: [{ escenaId: escena, entrada: 0, salida: 2 }],
      encuadres: { horizontal_16_9: { [escena]: { modo: "recorte", x: 50, y: 0 } } },
    });
    const arriba = await exportarYMontar("horizontal_16_9");
    await guardar({ encuadres: { horizontal_16_9: { [escena]: { modo: "recorte", x: 50, y: 100 } } } });
    const abajo = await exportarYMontar("horizontal_16_9");
    expect(await brilloMedio(arriba.ruta, 1)).toBeGreaterThan(150);
    expect(await brilloMedio(abajo.ruta, 1)).toBeLessThan(60);
  }, 180_000);

  test("los subtítulos quemados y la etiqueta caen dentro de la zona segura en 9:16, 1:1 y 16:9", async () => {
    await ponerFormatos(["vertical_9_16", "cuadrado_1_1", "horizontal_16_9"]);
    // Solo la escena negra, para que lo único claro del fotograma sea lo dibujado.
    await guardar({
      fragmentos: [{ escenaId: escenaIds[1] ?? "", entrada: 0, salida: 2 }],
      subtitulosQuemados: true,
      etiquetaPosicion: "arriba",
    });
    for (const formato of ["vertical_9_16", "cuadrado_1_1", "horizontal_16_9"] as const) {
      const { ruta } = await exportarYMontar(formato);
      const { ancho, alto } = RESOLUCION_MONTAJE[formato];
      const zona = ZONA_SEGURA_DE_FORMATO[formato];
      const filas = await filasConLuz(ruta, 1, ancho);
      const subtitulo = filas.filter((f) => f > alto / 2);
      const etiqueta = filas.filter((f) => f < alto / 2);
      expect({ formato, subtitulo: subtitulo.length > 0, etiqueta: etiqueta.length > 0 }).toEqual({
        formato,
        subtitulo: true,
        etiqueta: true,
      });
      // Todo el subtítulo por encima de la franja de abajo, y toda la etiqueta por debajo de la de arriba.
      expect({ formato, bajo: Math.max(...subtitulo) }).toEqual({
        formato,
        bajo: Math.min(Math.max(...subtitulo), Math.floor(alto * (1 - zona.abajoPorCiento / 100))),
      });
      expect({ formato, alto: Math.min(...etiqueta) }).toEqual({
        formato,
        alto: Math.max(Math.min(...etiqueta), Math.ceil((alto * zona.arribaPorCiento) / 100)),
      });
    }
  }, 240_000);

  test("pedir dos veces la misma versión y formato devuelve la misma; otro formato es otra exportación", async () => {
    await ponerFormatos(["vertical_9_16", "cuadrado_1_1"]);
    expect((await exportar("cuadrado_1_1")).estado).toBe(202);
    expect((await exportar("cuadrado_1_1")).estado).toBe(200);
    expect((await exportar("vertical_9_16")).estado).toBe(202);
    // Sin formato es el vertical de siempre: quien pedía antes sin él recibe la misma de 9:16.
    expect((await exportar()).estado).toBe(200);
    const filas = await db().select().from(montageExports).where(eq(montageExports.projectId, proyectoId));
    expect(filas.map((f) => f.format).sort()).toEqual(["cuadrado_1_1", "vertical_9_16"]);
  });

  test("un formato que el proyecto no tiene no se exporta, y se dice cómo añadirlo", async () => {
    const { estado, datos } = await exportar("horizontal_16_9");
    expect(estado).toBe(409);
    expect(mensajeDe(datos)).toContain("YouTube · horizontal (16:9)");
    expect(await db().select().from(montageExports).where(eq(montageExports.projectId, proyectoId))).toHaveLength(0);
  });

  test("un encuadre de una escena ajena no se guarda, uno mal formado se rechaza y el automático no se guarda", async () => {
    const ajena = await guardar({ encuadres: { cuadrado_1_1: { [crypto.randomUUID()]: { modo: "bandas" } } } });
    expect(ajena.estado).toBe(200);
    expect((ajena.datos as MontajeVista).encuadres).toEqual({});
    const mala = await guardar({ encuadres: { cuadrado_1_1: { [escenaIds[0] ?? ""]: { modo: "recorte", x: 150 } } } });
    expect(mala.estado).toBe(400);
    const automatico = await guardar({
      encuadres: { cuadrado_1_1: { [escenaIds[0] ?? ""]: { modo: "recorte", x: 50, y: 50 } } },
    });
    expect(automatico.estado).toBe(200);
    expect((automatico.datos as MontajeVista).encuadres).toEqual({});
  });

  test("la revisión de continuidad espera el formato del proyecto: un clip 16:9 o 1:1 correcto no es crítico", async () => {
    for (const [formato, medidas] of [
      ["horizontal_16_9", "1280x720"],
      ["cuadrado_1_1", "720x720"],
    ] as const) {
      await db()
        .update(projects)
        .set({ formats: [formato] })
        .where(eq(projects.id, proyectoId));
      const escenaId = escenaIds[0] ?? "";
      const medioId = await subirClip(`clip-${formato}`, await clipDeMedidas(`clip-${formato}`, medidas), 4);
      await db().update(scenes).set({ clipMediaId: medioId, plannedSeconds: 4 }).where(eq(scenes.id, escenaId));
      const comprobaciones = await revisarAutomaticamente(actor, escenaId);
      const proporcion = comprobaciones.find((c) => c.clave === "proporcion");
      expect({ formato, resultado: proporcion?.resultado }).toEqual({ formato, resultado: "pasa" });
      expect(comprobaciones.some((c) => c.severidad === "critica")).toBe(false);
    }
  }, 120_000);

  test("pasar a escenas habladas (Omni) con un principal que su modelo no genera se rechaza antes de cambiar", async () => {
    const omni = await eleccionOmni(ana.id);
    const proporciones = omni.modelo.parametros.proporciones;
    // Un formato que el modelo de escenas habladas no declara (el catálogo sembrado solo declara 9:16).
    const ajeno = (["horizontal_16_9", "cuadrado_1_1"] as const).find(
      (f) => !proporciones.includes(PROPORCION_DE_FORMATO[f]),
    );
    if (!ajeno) throw new Error("El modelo Omni sembrado admite todos los formatos: este test ya no prueba nada.");
    await db()
      .update(projects)
      .set({ formats: [ajeno] })
      .where(eq(projects.id, proyectoId));
    const fallo = await fijarModoVoz(actor, proyectoId, "omni", true).catch((e: unknown) => e);
    expect((fallo as Error).message).toContain(`${omni.modelo.nombre} solo admite`);
    const [proyecto] = await db().select().from(projects).where(eq(projects.id, proyectoId));
    expect(proyecto?.voiceMode).toBe("clip");
    // En vertical, lo de siempre: se puede pasar.
    await db()
      .update(projects)
      .set({ formats: ["vertical_9_16"] })
      .where(eq(projects.id, proyectoId));
    expect((await fijarModoVoz(actor, proyectoId, "omni", true)).proyecto.voiceMode).toBe("omni");
  });

  test("ajustar el encuadre, regenerar, editar y borrar la escena no deja el montaje sin poder guardarse", async () => {
    await ponerFormatos(["vertical_9_16", "cuadrado_1_1"]);
    const [primera, segunda] = [escenaIds[0] ?? "", escenaIds[1] ?? ""];
    const ajustado = await guardar({ encuadres: { cuadrado_1_1: { [segunda]: { modo: "recorte", x: 0, y: 50 } } } });
    expect((ajustado.datos as MontajeVista).encuadres).toEqual({
      cuadrado_1_1: { [segunda]: { modo: "recorte", x: 0, y: 50 } },
    });
    // Regenerar la deja sin clip y aprobada; editarla, en borrador. Entonces se puede borrar.
    await db().update(scenes).set({ clipMediaId: null, state: "borrador" }).where(eq(scenes.id, segunda));
    const borrada = await rutaEscena.DELETE(pedir(ana, `/api/escenas/${segunda}`, "DELETE"), ctx(segunda));
    expect(borrada.status).toBe(200);
    // La pantalla devuelve los encuadres que recibió, con el de la escena borrada dentro.
    const vista = await leerMontaje();
    const { estado, datos } = await guardar({
      fragmentos: [{ escenaId: primera, entrada: 0, salida: 2 }],
      encuadres: vista.encuadres,
    });
    expect(estado).toBe(200);
    expect((datos as MontajeVista).encuadres).toEqual({});
  });

  test("con clips generados, el principal no cambia: se ofrece añadirlo como formato más", async () => {
    const { estado, datos } = await ponerFormatos(["horizontal_16_9", "vertical_9_16"]);
    expect(estado).toBe(409);
    expect(mensajeDe(datos)).toContain("Añade «YouTube · horizontal (16:9)» como formato más");
    const repetidos = await ponerFormatos(["vertical_9_16", "vertical_9_16"]);
    expect(repetidos.estado).toBe(400);
  });

  test("superar el máximo de segundos de la instalación se rechaza al guardar y al exportar, con motivo", async () => {
    // Dos clips de 6 s: 12 s de montaje.
    for (const [indice, escenaId] of escenaIds.entries()) {
      const medioId = await subirClip(`largo-${indice}`, await clipDePrueba(`largo-${indice}`, 6), 6);
      await db().update(scenes).set({ clipMediaId: medioId }).where(eq(scenes.id, escenaId));
    }
    const doce = escenaIds.map((escenaId) => ({ escenaId, entrada: 0, salida: 6 }));
    expect((await guardar({ fragmentos: doce })).estado).toBe(200);

    await guardarAjustes({ proyectoSegundosMaximos: 10 }, null);
    const alGuardar = await guardar({ fragmentos: doce });
    expect(alGuardar.estado).toBe(400);
    expect(mensajeDe(alGuardar.datos)).toContain("El montaje dura 12 s y el máximo de esta instalación son 10 s.");
    // Lo guardado antes de bajar el máximo tampoco se exporta: la puerta vuelve a mirar.
    const alExportar = await exportar();
    expect(alExportar.estado).toBe(409);
    expect(mensajeDe(alExportar.datos)).toContain("máximo de esta instalación son 10 s");
    expect((await leerMontaje()).segundosMaximos).toBe(10);
  }, 120_000);

  test("superar el máximo de escenas de la instalación se rechaza con motivo", async () => {
    await guardarAjustes({ proyectoEscenasMaximas: 2 }, null);
    const respuesta = await nuevaEscena(proyectoId, "Tercera frase.");
    expect(respuesta.status).toBe(409);
    expect(mensajeDe(await respuesta.json())).toContain("el máximo de esta instalación son 2");
    await guardarAjustes({ proyectoEscenasMaximas: 3 }, null);
    expect((await nuevaEscena(proyectoId, "Tercera frase.")).status).toBe(201);
  });

  test("el techo de la versión no se puede subir desde el panel", async () => {
    await expect(guardarAjustes({ proyectoEscenasMaximas: 31 }, null)).rejects.toThrow("de 1 a 30 escenas");
    await expect(guardarAjustes({ proyectoSegundosMaximos: 301 }, null)).rejects.toThrow("de 10 a 300 segundos");
  });
});
