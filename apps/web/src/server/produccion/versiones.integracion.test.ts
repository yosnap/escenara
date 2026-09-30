import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { MontajeVista } from "@/lib/montaje";
import type { ProduccionVista } from "@/lib/produccion";
import type { ProyectoDetalle } from "@/lib/proyectos";

/**
 * **Biblioteca de versiones de una escena** (0.41.0) contra el PostgreSQL y el SeaweedFS locales y FFmpeg.
 *
 * Ningún test llama a ningún proveedor: las dos «versiones» son trabajos de clip ya terminados, escritos aquí
 * con su archivo fabricado por FFmpeg (una blanca y otra negra, para verlas en el MP4).
 *
 * Lo que comprueba: elegir otra versión **cambia el montaje sin borrar la anterior**, estrena versión del montaje
 * (la exportación de antes deja de ser la vigente), invalida la revisión del clip anterior, y no deja elegir una
 * versión que no es de la escena ni pisar un clip que se está generando.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_versiones");
}

const { eq } = await import("drizzle-orm");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaEscenas = await import("@/app/api/proyectos/[id]/escenas/route");
const rutaMontaje = await import("@/app/api/proyectos/[id]/montaje/route");
const rutaExportar = await import("@/app/api/proyectos/[id]/montaje/exportacion/route");
const rutaAccion = await import("@/app/api/escenas/[id]/produccion/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { characters, generationJobs, media, projects, rateLimits, scenes, users } = await import("../db/esquema");
const { crearMedio } = await import("../media/servicio");
const { leerObjeto } = await import("../almacenamiento");
const { pasadaDeExportaciones } = await import("../montaje/cola");
const { revisarAMano } = await import("../revision/humana");
const { estadoDeProduccion } = await import("./consulta");

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
  const [datos, codigo] = await Promise.all([new Response(proceso.stdout).bytes(), proceso.exited]);
  return { ok: codigo === 0, datos };
}

describe.skipIf(!hayBaseDeDatos)("biblioteca de versiones de una escena", () => {
  let ana: Sesion;
  let berta: Sesion;
  let actor: Actor;
  let carpeta: string;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;
  let proyectoId: string;
  let escenaId: string;
  let blanca: { trabajo: string; medio: string };
  let negra: { trabajo: string; medio: string };

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_versiones");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    berta = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    carpeta = await mkdtemp(path.join(tmpdir(), "escenara-prueba-versiones-"));
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
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(media).where(eq(media.ownerId, ana.id));
    await db().delete(characters).where(eq(characters.ownerId, ana.id));
    exigirBaseDeDatosDePrueba("escenara_pruebas_versiones");
    await db().delete(rateLimits);
    await prepararEscenaConDosVersiones();
  });

  /** Clip de 2 s, blanco o negro, con un tono. Fabricado aquí y subido a la biblioteca de Ana. */
  async function clip(nombre: string, color: "white" | "black"): Promise<string> {
    const ruta = path.join(carpeta, `${nombre}.mp4`);
    const { ok } = await ffmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=720x1280:d=2:r=25`,
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-t",
      "2",
      ruta,
    ]);
    if (!ok) throw new Error("No se ha podido fabricar el clip de prueba.");
    const datos = new Uint8Array(await Bun.file(ruta).arrayBuffer());
    const medio = await crearMedio(actor, new File([datos], `${nombre}.mp4`, { type: "video/mp4" }), { duracion: 2 }, [
      "video",
    ]);
    return medio.id;
  }

  /** Un trabajo de clip terminado de la escena, con su archivo: es lo que es una versión. */
  async function version(medioId: string, creado: Date): Promise<string> {
    const [trabajo] = await db()
      .insert(generationJobs)
      .values({
        userId: ana.id,
        kind: "animacion",
        provider: "kie",
        model: "veo3_lite",
        prompt: "Plano de prueba",
        input: { proporcion: "9:16" },
        sceneId: escenaId,
        state: "listo",
        resultMediaId: medioId,
        estimatedCredits: 60,
        consumedCredits: 60,
        idempotencyKey: crypto.randomUUID(),
        createdAt: creado,
      })
      .returning();
    if (!trabajo) throw new Error("No se ha podido crear la versión de prueba.");
    return trabajo.id;
  }

  async function prepararEscenaConDosVersiones() {
    const creado = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", {
        titulo: "Versiones de prueba",
        formato: "reel_vertical",
        idea: "Una escena con dos tomas.",
        presupuestoCreditos: 1000,
      }),
      undefined,
    );
    proyectoId = ((await creado.json()) as ProyectoDetalle).proyecto.id;
    await rutaEscenas.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/escenas`, "POST", { texto: "Una toma.", accion: "Plano", segundos: 4 }),
      ctx(proyectoId),
    );
    const [fila] = await db().select().from(scenes).where(eq(scenes.projectId, proyectoId));
    escenaId = fila?.id ?? "";
    const medioBlanco = await clip("blanca", "white");
    const medioNegro = await clip("negra", "black");
    blanca = { medio: medioBlanco, trabajo: await version(medioBlanco, new Date(Date.now() - 60_000)) };
    negra = { medio: medioNegro, trabajo: await version(medioNegro, new Date()) };
    // La escena usa la más reciente, como la deja el cierre de un trabajo.
    await db()
      .update(scenes)
      .set({ clipMediaId: negra.medio, clipJobId: negra.trabajo, state: "producida" })
      .where(eq(scenes.id, escenaId));
  }

  const usar = async (trabajoId: string, sesion = ana, escena = escenaId) => {
    const respuesta = await rutaAccion.POST(
      pedir(sesion, `/api/escenas/${escena}/produccion`, "POST", { accion: "usar-version", trabajoId }),
      ctx(escena),
    );
    return { estado: respuesta.status, datos: (await respuesta.json()) as ProduccionVista | { error?: string } };
  };

  const leerMontaje = async () =>
    (await (
      await rutaMontaje.GET(pedir(ana, `/api/proyectos/${proyectoId}/montaje`), ctx(proyectoId))
    ).json()) as MontajeVista;

  async function exportarYBrillo(): Promise<number> {
    const respuesta = await rutaExportar.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/montaje/exportacion`, "POST", {}),
      ctx(proyectoId),
    );
    expect(respuesta.status).toBe(202);
    expect(await pasadaDeExportaciones(`worker-prueba-${crypto.randomUUID()}`)).toBe(1);
    const vigente = (await leerMontaje()).exportaciones.find((e) => e.vigente);
    const [fila] = await db()
      .select()
      .from(media)
      .where(eq(media.id, vigente?.medio?.id ?? ""))
      .limit(1);
    if (!fila) throw new Error("La exportación no ha dejado fichero.");
    const ruta = path.join(carpeta, `exportada-${fila.id}.mp4`);
    await Bun.write(ruta, await leerObjeto(fila.storageKey).arrayBuffer());
    const { datos } = await ffmpeg([
      "-ss",
      "1",
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
    // Se mide la franja central: fuera de las zonas seguras, donde no hay etiqueta ni subtítulos.
    const centro = datos.subarray(Math.floor(datos.length * 0.4), Math.floor(datos.length * 0.6));
    let suma = 0;
    for (const byte of centro) suma += byte;
    return suma / Math.max(1, centro.length);
  }

  test("la producción enseña las dos versiones, con la que está en uso marcada y la cuota", async () => {
    const vista = await estadoDeProduccion(actor, proyectoId);
    const escena = vista.escenas[0];
    expect(escena?.bibliotecaDeClips.map((v) => [v.trabajoId, v.elegida, v.proporcion])).toEqual([
      [negra.trabajo, true, "9:16"],
      [blanca.trabajo, false, "9:16"],
    ]);
    expect(vista.cuota.cuotaBytes).toBe(2048 * 1024 * 1024);
    expect(vista.cuota.versionesSinUsarBytes).toBeGreaterThan(0);
  });

  test("elegir otra versión cambia el montaje sin borrar la anterior, y estrena versión del montaje", async () => {
    const antes = await leerMontaje();
    expect(await exportarYBrillo()).toBeLessThan(60);

    const { estado, datos } = await usar(blanca.trabajo);
    expect(estado).toBe(200);
    expect((datos as ProduccionVista).escenas[0]?.bibliotecaDeClips.find((v) => v.elegida)?.trabajoId).toBe(
      blanca.trabajo,
    );
    const [escena] = await db().select().from(scenes).where(eq(scenes.id, escenaId));
    expect(escena?.clipMediaId).toBe(blanca.medio);
    expect(escena?.clipJobId).toBe(blanca.trabajo);
    // La versión que se deja de usar sigue en la biblioteca, sin tocar.
    const [anterior] = await db().select().from(media).where(eq(media.id, negra.medio));
    expect(anterior?.deletedAt).toBeNull();

    const despues = await leerMontaje();
    expect(despues.version).toBe(antes.version + 1);
    expect(despues.exportaciones.every((e) => !e.vigente)).toBe(true);
    // Y el MP4 nuevo es el de la versión elegida: blanco donde antes era negro.
    expect(await exportarYBrillo()).toBeGreaterThan(150);

    // Volver a la de antes es igual de gratis: ni un trabajo más.
    expect((await usar(negra.trabajo)).estado).toBe(200);
    expect(await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id))).toHaveLength(2);
  }, 120_000);

  test("elegir la que ya está en uso no cambia nada ni sube la versión del montaje", async () => {
    const antes = await leerMontaje();
    expect((await usar(negra.trabajo)).estado).toBe(200);
    expect((await leerMontaje()).version).toBe(antes.version);
  });

  test("la revisión del clip anterior deja de valer: un crítico suyo ya no frena exportar", async () => {
    await leerMontaje();
    await revisarAMano(actor, escenaId, "marcar-critico", "La cara no es la misma en esta toma.");
    const frenada = await rutaExportar.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/montaje/exportacion`, "POST", {}),
      ctx(proyectoId),
    );
    expect(frenada.status).toBe(409);
    expect((await usar(blanca.trabajo)).estado).toBe(200);
    expect(await exportarYBrillo()).toBeGreaterThan(150);
  }, 120_000);

  test("una versión que no es de la escena, o de otra persona, no se puede elegir", async () => {
    expect((await usar(crypto.randomUUID())).estado).toBe(404);
    const ajena = await usar(blanca.trabajo, berta);
    expect(ajena.estado).toBe(404);
    expect(mensajeDe((await usar("no-es-un-id")).datos)).toContain("trabajoId");
  });

  test("con un clip generándose no se elige: taparía la versión elegida al terminar", async () => {
    await db().insert(generationJobs).values({
      userId: ana.id,
      kind: "animacion",
      provider: "kie",
      model: "veo3_lite",
      prompt: "Otra toma",
      input: {},
      sceneId: escenaId,
      state: "en_curso",
      estimatedCredits: 60,
      idempotencyKey: crypto.randomUUID(),
    });
    const { estado, datos } = await usar(blanca.trabajo);
    expect(estado).toBe(409);
    expect(mensajeDe(datos)).toContain("generándose");
  });
});
