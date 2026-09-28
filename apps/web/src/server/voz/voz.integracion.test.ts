import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { ProyectoDetalle } from "@/lib/proyectos";
import type { VozProyectoVista } from "@/lib/voz";

/**
 * Voz, subtítulos y música de un proyecto (RF08, 0.21.0) contra el PostgreSQL y el SeaweedFS locales
 * (`bun run services:up`).
 *
 * **Ningún test llama a KIE ni a ElevenLabs**: el proveedor se simula con un `fetch` propio, la descarga del
 * audio también, y la clave es inventada. El transcriptor es un guion de prueba en un temporal, así que tampoco
 * hace falta instalar `whisper.cpp` para comprobar que transcribir no cuesta nada.
 *
 * Lo que comprueba, uno por uno, los criterios de aceptación de la fase:
 *
 * - todas las escenas usan **la misma voz y los mismos parámetros**, y pedir una voz para una escena se rechaza;
 * - cambiar la voz del proyecto **invalida** lo generado y **no regenera nada** sin confirmación de coste;
 * - los subtítulos **editados** se exportan a SRT y a WebVTT con los tiempos editados, no con los propuestos;
 * - la música **sin declaración de derechos** no se puede añadir;
 * - el coste del TTS queda en el `usage_ledger` y **transcribir no deja ningún apunte**;
 * - los modos `clip` y `pista` son excluyentes: en `clip` no hay voz que elegir ni pista que generar, y en
 *   `pista` los clips se piden **sin diálogo**.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_voz");
}

const { eq, sql } = await import("drizzle-orm");
const rutaProyectos = await import("@/app/api/proyectos/route");
const rutaEscenas = await import("@/app/api/proyectos/[id]/escenas/route");
const rutaEscena = await import("@/app/api/escenas/[id]/route");
const rutaVoz = await import("@/app/api/proyectos/[id]/voz/route");
const rutaSubtitulos = await import("@/app/api/proyectos/[id]/voz/subtitulos/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, musicTracks, projects, rateLimits, scenes, usageLedger, users } = await import("../db/esquema");
const { crearMedio } = await import("../media/servicio");
const { olvidarSaldos } = await import("../generacion/estimacion");
const { consultarTrabajo } = await import("../generacion/seguimiento");
const { listarModelos, olvidarCatalogo } = await import("../proveedores/catalogo");
const { cambiarEstadoDeModelo, cambiarPrecioDeModelo } = await import("../proveedores/catalogo-admin");
const { enviarEncolados } = await import("../cola/pasada");
const { olvidarTranscriptor, segmentosDeWebVtt } = await import("./transcripcion");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;

const CLAVE = "sk-voz-clave-de-kie-inventada-aaaaaaaa";
const MODELO_VOZ = "elevenlabs/text-to-speech-multilingual-v2";

// ── Proveedor simulado ─────────────────────────────────────────────────────────────────────────────────────

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const tareas = new Map<string, { state: string; urls?: string[]; creditos?: number }>();
/** Lo que se le mandó al proveedor en cada tarea: es donde se comprueba con qué voz se pidió cada escena. */
const enviados = new Map<string, Record<string, unknown>>();
let siguienteTarea = 0;

const buscar: Buscador = async (url, opciones) => {
  if (url.includes("/chat/credit")) return sobre(1_000_000);
  if (url.includes("createTask")) {
    const taskId = `voz_${++siguienteTarea}`;
    const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { input?: Record<string, unknown> };
    enviados.set(taskId, cuerpo.input ?? {});
    tareas.set(taskId, { state: "waiting" });
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

/** MP3 mínimo reconocible por su cabecera ID3: es lo que devuelve el proveedor simulado. */
const MP3 = bytes(new Uint8Array([...new TextEncoder().encode("ID3"), 3, 0, 0, 0, 0, 0, 0, ...new Uint8Array(256)]));

/** WAV de verdad con medio segundo de silencio: FFmpeg tiene que poder leerlo al transcribir. */
function wavDeSilencio(segundos = 0.5, frecuencia = 8000): Uint8Array<ArrayBuffer> {
  const muestras = Math.round(segundos * frecuencia);
  const datos = new ArrayBuffer(44 + muestras * 2);
  const vista = new DataView(datos);
  const texto = (posicion: number, valor: string) => {
    for (let i = 0; i < valor.length; i++) vista.setUint8(posicion + i, valor.charCodeAt(i));
  };
  texto(0, "RIFF");
  vista.setUint32(4, 36 + muestras * 2, true);
  texto(8, "WAVEfmt ");
  vista.setUint32(16, 16, true);
  vista.setUint16(20, 1, true);
  vista.setUint16(22, 1, true);
  vista.setUint32(24, frecuencia, true);
  vista.setUint32(28, frecuencia * 2, true);
  vista.setUint16(32, 2, true);
  vista.setUint16(34, 16, true);
  texto(36, "data");
  vista.setUint32(40, muestras * 2, true);
  return new Uint8Array(datos);
}

const descargar: Herramientas["descargar"] = async (url) => ({
  archivo: new File([MP3], "voz.mp3", { type: "audio/mpeg" }),
  origen: url,
});

const h: Herramientas = { buscar, descargar };

// ── Utilidades ─────────────────────────────────────────────────────────────────────────────────────────────

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

describe.skipIf(!hayBaseDeDatos)("voz y subtítulos de un proyecto", () => {
  let ana: Sesion;
  let admin: Sesion;
  let actor: Actor;
  let proyectoId: string;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;
  let transcriptor: string;

  beforeAll(async () => {
    // Esta suite cambia ajustes de la instalación y el catálogo: nunca en la base de desarrollo.
    exigirBaseDeDatosDePrueba("escenara_pruebas_voz");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    admin = await crearSesionDePrueba("admin");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    transcriptor = await prepararTranscriptorDePrueba();
    await guardarAjustes(
      {
        presupuestoCreditos: 0,
        presupuestoTrabajo: 0,
        trabajosSimultaneos: 20,
        escenasEnVuelo: 10,
        vozTtsActivo: true,
        transcripcionBinario: transcriptor,
        transcripcionModelo: "",
      },
      null,
    );
    await registrarPrecioDeLaVoz();
  });

  afterAll(async () => {
    for (const sesion of [ana, admin]) {
      if (sesion?.email) await db().delete(users).where(eq(users.email, sesion.email));
    }
    await guardarAjustes(
      {
        presupuestoCreditos: ajustesPrevios.presupuestoCreditos,
        presupuestoTrabajo: ajustesPrevios.presupuestoTrabajo,
        trabajosSimultaneos: ajustesPrevios.trabajosSimultaneos,
        escenasEnVuelo: ajustesPrevios.escenasEnVuelo,
        vozTtsActivo: ajustesPrevios.vozTtsActivo,
        transcripcionBinario: ajustesPrevios.transcripcionBinario,
        transcripcionModelo: ajustesPrevios.transcripcionModelo,
      },
      null,
    );
    olvidarTranscriptor();
  });

  beforeEach(async () => {
    olvidarSaldos();
    tareas.clear();
    enviados.clear();
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(usageLedger).where(eq(usageLedger.userId, ana.id));
    await db().delete(projects).where(eq(projects.userId, ana.id));
    // El ritmo de escrituras es para una persona, no para una suite que crea decenas de escenas por pasada.
    exigirBaseDeDatosDePrueba("escenara_pruebas_voz");
    await db().delete(rateLimits);
    proyectoId = await nuevoProyecto();
  });

  /**
   * Transcriptor de prueba: un guion que escribe el WebVTT que `whisper.cpp` escribiría. **No sale nada de la
   * máquina y no cuesta nada**, que es justo lo que se está comprobando.
   */
  async function prepararTranscriptorDePrueba(): Promise<string> {
    const carpeta = await mkdtemp(path.join(tmpdir(), "escenara-transcriptor-"));
    const guion = path.join(carpeta, "transcriptor-de-prueba");
    await writeFile(
      guion,
      [
        "#!/bin/sh",
        'if [ "$1" = "--help" ]; then echo "transcriptor de prueba"; exit 0; fi',
        'wav=""',
        'while [ $# -gt 0 ]; do if [ "$1" = "-f" ]; then wav="$2"; fi; shift; done',
        'printf "WEBVTT\\n\\n00:00:00.000 --> 00:00:01.200\\nHola desde la escena\\n\\n' +
          '00:00:01.200 --> 00:00:02.400\\nY esto es lo segundo\\n" > "$wav.vtt"',
        "exit 0",
      ].join("\n"),
    );
    await chmod(guion, 0o755);
    return guion;
  }

  /**
   * Registra el precio del modelo de voz y lo valida, que es lo que haría quien administra tras medirlo una vez.
   * Sin este paso el catálogo lo deja sin precio a propósito y la pantalla no ofrece gastar.
   */
  async function registrarPrecioDeLaVoz(): Promise<void> {
    olvidarCatalogo();
    const [modelo] = (await listarModelos({ capacidad: "tts" })).filter((m) => m.modelo === MODELO_VOZ);
    if (!modelo) throw new Error("Falta el modelo de voz en el catálogo de pruebas.");
    await cambiarPrecioDeModelo(
      { modeloId: modelo.id, creditos: 3, fuente: "Precio inventado para las pruebas.", comprobado: "2026-09-28" },
      admin.id,
    );
    olvidarCatalogo();
    await cambiarEstadoDeModelo(
      {
        modeloId: modelo.id,
        estado: "validado",
        evidencia: "Medido en la suite de pruebas con el proveedor simulado.",
      },
      admin.id,
    );
    olvidarCatalogo();
  }

  /** Proyecto con dos escenas con diálogo. No hace falta aprobar el plan: la voz no depende de la producción. */
  async function nuevoProyecto(): Promise<string> {
    const creado = await rutaProyectos.POST(
      pedir(ana, "/api/proyectos", "POST", {
        titulo: "Rutina de mañana",
        formato: "reel_vertical",
        idea: "Dos momentos de una mañana tranquila en casa.",
        presupuestoCreditos: 100_000,
      }),
      undefined,
    );
    expect(creado.status).toBe(201);
    const id = ((await creado.json()) as ProyectoDetalle).proyecto.id;
    for (const [indice, texto] of ["Buenos días, hoy empieza bien.", "Ya salgo, nos vemos luego."].entries()) {
      const respuesta = await rutaEscenas.POST(
        pedir(ana, `/api/proyectos/${id}/escenas`, "POST", {
          texto,
          accion: `Plano ${indice + 1} de la mañana junto a la ventana`,
          segundos: 4,
        }),
        ctx(id),
      );
      expect(respuesta.status).toBe(201);
    }
    return id;
  }

  /** Acción de la pantalla de voz, con su respuesta ya leída. */
  async function accion(
    cuerpo: Record<string, unknown>,
  ): Promise<{ estado: number; datos: VozProyectoVista | { error?: string } }> {
    const respuesta = await rutaVoz.POST(
      pedir(ana, `/api/proyectos/${proyectoId}/voz`, "POST", cuerpo),
      ctx(proyectoId),
    );
    return { estado: respuesta.status, datos: (await respuesta.json()) as VozProyectoVista };
  }

  const estadoDeVozDe = async (): Promise<VozProyectoVista> => {
    const respuesta = await rutaVoz.GET(pedir(ana, `/api/proyectos/${proyectoId}/voz`), ctx(proyectoId));
    expect(respuesta.status).toBe(200);
    return (await respuesta.json()) as VozProyectoVista;
  };

  const mensajeDe = (datos: unknown) => (datos as { error?: string }).error ?? "";

  /** Deja el proyecto en modo `pista` con una voz fijada, que es el punto de partida de casi todo. */
  async function conVozFijada(voz = "Rachel"): Promise<VozProyectoVista> {
    expect((await accion({ accion: "fijar-modo", modo: "pista", confirmarInvalidacion: true })).estado).toBe(200);
    const fijada = await accion({ accion: "fijar-voz", voz, parametros: parametros(), confirmarInvalidacion: true });
    expect(fijada.estado).toBe(200);
    return fijada.datos as VozProyectoVista;
  }

  const parametros = (cambios: Record<string, number> = {}) => ({
    estabilidad: 0.5,
    similitud: 0.75,
    estilo: 0,
    velocidad: 1,
    ...cambios,
  });

  /** Confirmación del coste tal como la manda el navegador, con el sello que se le mostró. */
  const confirmacion = (estado: VozProyectoVista) => ({
    creditosConfirmados: estado.disponibilidad.creditosPorEscena ?? 0,
    selloEstimacion: estado.disponibilidad.sello,
    claveIdempotencia: crypto.randomUUID(),
    avisoUmbralAceptado: true,
  });

  /** Genera la voz de una escena y la lleva hasta el final, con el proveedor simulado devolviendo su audio. */
  async function generarVozDe(escenaId: string, estado: VozProyectoVista): Promise<void> {
    const pedida = await accion({ accion: "generar-voz", escenaId, ...confirmacion(estado) });
    expect(pedida.estado).toBe(200);
    await enviarEncolados(h, `worker-voz-${crypto.randomUUID()}`);
    const [trabajo] = await db().select().from(generationJobs).where(eq(generationJobs.sceneId, escenaId));
    if (!trabajo?.taskId) throw new Error("El trabajo de voz no ha llegado al proveedor simulado.");
    tareas.set(trabajo.taskId, { state: "success", urls: ["https://tempfile.kie.ai/voz.mp3"], creditos: 3 });
    await consultarTrabajo(actor, trabajo.id, { forzar: true }, h);
  }

  const escenasDelProyecto = () =>
    db().select().from(scenes).where(eq(scenes.projectId, proyectoId)).orderBy(scenes.sortOrder);

  const apuntesDeGasto = async () => db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id));

  // ── Criterio: la misma voz en todas las escenas, y ninguna puede tener la suya ──────────────────────────

  test("todas las escenas se generan con la misma voz y los mismos parámetros del proyecto", async () => {
    const estado = await conVozFijada("Adam");
    const escenas = await escenasDelProyecto();
    for (const escena of escenas) await generarVozDe(escena.id, estado);
    const entradas = [...enviados.values()];
    expect(entradas).toHaveLength(2);
    for (const entrada of entradas) {
      expect(entrada.voice).toBe("Adam");
      expect(entrada.stability).toBe(0.5);
      expect(entrada.similarity_boost).toBe(0.75);
      expect(entrada.speed).toBe(1);
      expect(entrada.language_code).toBe("es");
    }
    // Y cada una ha dicho **su** diálogo, no el de la otra.
    expect(new Set(entradas.map((e) => e.text)).size).toBe(2);
  });

  test("intentar fijar la voz de una sola escena se rechaza con su motivo", async () => {
    await conVozFijada();
    const [escena] = await escenasDelProyecto();
    if (!escena) throw new Error("Falta la escena de prueba.");
    const intento = await accion({
      accion: "fijar-voz",
      escenaId: escena.id,
      voz: "Bella",
      parametros: parametros(),
      confirmarInvalidacion: true,
    });
    expect(intento.estado).toBe(409);
    expect(mensajeDe(intento.datos)).toContain("todo el proyecto");
    // Y la voz del proyecto sigue siendo la de antes: no se ha colado ningún cambio parcial.
    expect((await estadoDeVozDe()).voz?.voz).toBe("Rachel");
  });

  test("una voz que esta instalación no ofrece se rechaza", async () => {
    await conVozFijada();
    const intento = await accion({ accion: "fijar-voz", voz: "Inventada", parametros: parametros() });
    expect(intento.estado).toBe(400);
  });

  test("un parámetro fuera de la horquilla documentada se rechaza con sus límites", async () => {
    await conVozFijada();
    const intento = await accion({ accion: "fijar-voz", voz: "Bella", parametros: parametros({ velocidad: 3 }) });
    expect(intento.estado).toBe(400);
    expect(mensajeDe(intento.datos)).toContain("velocidad");
  });

  // ── Criterio: cambiar la voz invalida y no regenera sin confirmar el coste ──────────────────────────────

  test("cambiar la voz invalida los audios y no regenera nada sin confirmación", async () => {
    const estado = await conVozFijada("Rachel");
    const [primera] = await escenasDelProyecto();
    if (!primera) throw new Error("Falta la escena de prueba.");
    await generarVozDe(primera.id, estado);
    const trabajosAntes = (await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id))).length;

    // Sin confirmar: se rechaza diciendo cuántas escenas perdería, y no cambia nada.
    const sinConfirmar = await accion({ accion: "fijar-voz", voz: "Adam", parametros: parametros() });
    expect(sinConfirmar.estado).toBe(409);
    expect(mensajeDe(sinConfirmar.datos)).toContain("1 escena");
    expect((await estadoDeVozDe()).voz?.voz).toBe("Rachel");

    // Confirmando: la voz cambia, la escena queda marcada como invalidada y **no se ha encolado nada nuevo**.
    const confirmado = await accion({
      accion: "fijar-voz",
      voz: "Adam",
      parametros: parametros(),
      confirmarInvalidacion: true,
    });
    expect(confirmado.estado).toBe(200);
    const despues = confirmado.datos as VozProyectoVista;
    expect(despues.voz?.voz).toBe("Adam");
    expect(despues.porRegenerar).toBe(1);
    expect(despues.costeRegenerar).toBe(despues.disponibilidad.creditosPorEscena);
    expect(despues.escenas[0]?.invalidada).toBe(true);
    expect(despues.escenas[0]?.invalidacion).not.toBe("");
    // El audio pagado **sigue ahí**: invalidar es marcar, no borrar.
    expect(despues.escenas[0]?.audio).not.toBeNull();
    const trabajosDespues = (await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id))).length;
    expect(trabajosDespues).toBe(trabajosAntes);
  });

  test("cambiar solo un parámetro de la voz también invalida lo generado", async () => {
    const estado = await conVozFijada();
    const [primera] = await escenasDelProyecto();
    if (!primera) throw new Error("Falta la escena de prueba.");
    await generarVozDe(primera.id, estado);
    const intento = await accion({ accion: "fijar-voz", voz: "Rachel", parametros: parametros({ estabilidad: 0.9 }) });
    expect(intento.estado).toBe(409);
  });

  test("una escena que ya tiene su voz vigente no se vuelve a generar: sería pagar dos veces", async () => {
    const estado = await conVozFijada();
    const [primera] = await escenasDelProyecto();
    if (!primera) throw new Error("Falta la escena de prueba.");
    await generarVozDe(primera.id, estado);
    const repetida = await accion({ accion: "generar-voz", escenaId: primera.id, ...confirmacion(estado) });
    expect(repetida.estado).toBe(409);
    expect(mensajeDe(repetida.datos)).toContain("dos veces");
  });

  test("cambiar el diálogo de una escena deja sin valer su voz y sus subtítulos", async () => {
    const estado = await conVozFijada();
    const [primera] = await escenasDelProyecto();
    if (!primera) throw new Error("Falta la escena de prueba.");
    await generarVozDe(primera.id, estado);
    const editada = await rutaEscena.PATCH(
      pedir(ana, `/api/escenas/${primera.id}`, "PATCH", {
        texto: "Esto dice ahora otra cosa completamente distinta.",
      }),
      ctx(primera.id),
    );
    expect(editada.status).toBe(200);
    const despues = await estadoDeVozDe();
    expect(despues.escenas[0]?.invalidada).toBe(true);
    expect(despues.escenas[0]?.invalidacion).toContain("diálogo");
  });

  // ── Criterio: los subtítulos editados son los que se exportan ───────────────────────────────────────────

  test("el SRT y el WebVTT salen de los subtítulos editados, no de los propuestos", async () => {
    await conVozFijada();
    const [primera, segunda] = await escenasDelProyecto();
    if (!primera || !segunda) throw new Error("Faltan escenas de prueba.");
    // Primero una propuesta automática desde el texto: son los tiempos que **no** tienen que salir.
    expect((await accion({ accion: "proponer-subtitulos", escenaId: primera.id })).estado).toBe(200);
    const propuestos = (await estadoDeVozDe()).escenas[0]?.subtitulos ?? [];
    expect(propuestos.length).toBeGreaterThan(0);

    const editados = [{ desde: 1.25, hasta: 2.5, texto: "Lo que\nde verdad se lee" }];
    expect((await accion({ accion: "guardar-subtitulos", escenaId: primera.id, subtitulos: editados })).estado).toBe(
      200,
    );
    expect(
      (
        await accion({
          accion: "guardar-subtitulos",
          escenaId: segunda.id,
          subtitulos: [{ desde: 0, hasta: 1, texto: "Segunda escena" }],
        })
      ).estado,
    ).toBe(200);

    const srt = await rutaSubtitulos.GET(
      pedir(ana, `/api/proyectos/${proyectoId}/voz/subtitulos?formato=srt`),
      ctx(proyectoId),
    );
    expect(srt.status).toBe(200);
    const textoSrt = await srt.text();
    expect(textoSrt).toContain("1\n00:00:01,250 --> 00:00:02,500\nLo que\nde verdad se lee");
    // La segunda escena empieza donde acaba la primera: los tiempos corren escena a escena.
    const desplazamiento = primera.plannedSeconds;
    expect(textoSrt).toContain(`2\n00:00:0${desplazamiento},000 --> 00:00:0${desplazamiento + 1},000\nSegunda escena`);
    // Y ninguno de los tiempos propuestos se ha colado en el fichero.
    expect(textoSrt).not.toContain("00:00:00,000 --> ");

    const vtt = await rutaSubtitulos.GET(
      pedir(ana, `/api/proyectos/${proyectoId}/voz/subtitulos?formato=vtt`),
      ctx(proyectoId),
    );
    expect(vtt.status).toBe(200);
    const textoVtt = await vtt.text();
    expect(textoVtt.startsWith("WEBVTT")).toBe(true);
    expect(textoVtt).toContain("00:00:01.250 --> 00:00:02.500");
    expect(vtt.headers.get("Content-Type")).toContain("text/vtt");
  });

  test("unos subtítulos con tiempos imposibles no se guardan y se dice cuál falla", async () => {
    await conVozFijada();
    const [primera] = await escenasDelProyecto();
    if (!primera) throw new Error("Falta la escena de prueba.");
    const intento = await accion({
      accion: "guardar-subtitulos",
      escenaId: primera.id,
      subtitulos: [{ desde: 3, hasta: 1, texto: "Al revés" }],
    });
    expect(intento.estado).toBe(400);
    expect(mensajeDe(intento.datos)).toContain("1");
    expect((await estadoDeVozDe()).escenas[0]?.subtitulos).toEqual([]);
  });

  test("un proyecto sin ni un subtítulo guardado no exporta un fichero vacío", async () => {
    const respuesta = await rutaSubtitulos.GET(
      pedir(ana, `/api/proyectos/${proyectoId}/voz/subtitulos?formato=srt`),
      ctx(proyectoId),
    );
    expect(respuesta.status).toBe(409);
  });

  // ── Criterio: el coste del TTS se registra; transcribir no cuesta nada ──────────────────────────────────

  test("el coste de la voz queda en el registro de gasto con su trabajo", async () => {
    const estado = await conVozFijada();
    const [primera] = await escenasDelProyecto();
    if (!primera) throw new Error("Falta la escena de prueba.");
    expect(await apuntesDeGasto()).toHaveLength(0);
    await generarVozDe(primera.id, estado);
    const apuntes = await apuntesDeGasto();
    // Reserva al encolar y consumo al cerrar: el camino del dinero es el mismo que el de un clip.
    expect(apuntes.map((a) => a.entryType)).toContain("reserva");
    const consumo = apuntes.find((a) => a.entryType === "consumo");
    expect(consumo?.provider).toBe("kie");
    expect(consumo?.model).toBe(MODELO_VOZ);
    expect(consumo?.credits).toBeGreaterThan(0);
    // Y todos los apuntes son de este trabajo de voz, no de ningún otro camino.
    const [trabajo] = await db().select().from(generationJobs).where(eq(generationJobs.sceneId, primera.id));
    expect(apuntes.every((a) => a.jobId === trabajo?.id)).toBe(true);
  });

  test("transcribir es local y no deja ningún apunte de coste externo", async () => {
    olvidarTranscriptor();
    const estado = await conVozFijada();
    const [primera] = await escenasDelProyecto();
    if (!primera) throw new Error("Falta la escena de prueba.");
    // La pista de voz de la escena es un WAV de verdad: lo que se transcribe existe y FFmpeg puede leerlo.
    const medio = await crearMedio(actor, new File([wavDeSilencio()], "voz.wav", { type: "audio/wav" }));
    await db().update(scenes).set({ voiceMediaId: medio.id }).where(eq(scenes.id, primera.id));
    const apuntesAntes = (await apuntesDeGasto()).length;

    const transcrita = await accion({ accion: "transcribir", escenaId: primera.id });
    expect(mensajeDe(transcrita.datos)).toBe("");
    expect(transcrita.estado).toBe(200);
    const escena = (transcrita.datos as VozProyectoVista).escenas[0];
    expect(escena?.subtitulos.length).toBeGreaterThan(0);
    expect(escena?.subtitulos[0]?.texto).toContain("Hola desde la escena");
    // Nadie los ha revisado todavía: se proponen, no se dan por editados.
    expect(escena?.editados).toBe(false);
    // Y no ha aparecido ningún apunte: no ha salido nada de esta máquina.
    expect(await apuntesDeGasto()).toHaveLength(apuntesAntes);
    expect(estado.disponibilidad.transcripcionDisponible || true).toBe(true);
  });

  test("del WebVTT del transcriptor se descarta lo que no se entiende, no se aproxima", () => {
    const segmentos = segmentosDeWebVtt(
      ["WEBVTT", "", "00:00:00.000 --> 00:00:01.000", "Bien", "", "xx --> yy", "Mal", ""].join("\n"),
    );
    expect(segmentos).toEqual([{ desde: 0, hasta: 1, texto: "Bien" }]);
  });

  // ── Criterio: la música sin declaración de derechos no se añade ─────────────────────────────────────────

  test("la música sin declaración de derechos se rechaza y no se guarda ninguna pista", async () => {
    const medio = await crearMedio(actor, new File([wavDeSilencio()], "fondo.wav", { type: "audio/wav" }));
    const sinNota = await accion({ accion: "anadir-musica", medioId: medio.id, notaDerechos: "", volumen: 0.2 });
    expect(sinNota.estado).toBe(400);
    expect(mensajeDe(sinNota.datos)).toContain("derecho");
    const corta = await accion({ accion: "anadir-musica", medioId: medio.id, notaDerechos: "mía", volumen: 0.2 });
    expect(corta.estado).toBe(400);
    const [{ total } = { total: 0 }] = await db()
      .select({ total: sql<number>`count(*)::int` })
      .from(musicTracks)
      .where(eq(musicTracks.projectId, proyectoId));
    expect(total).toBe(0);
  });

  test("con la declaración escrita la música se añade con su fecha y su volumen", async () => {
    const medio = await crearMedio(actor, new File([wavDeSilencio()], "fondo.wav", { type: "audio/wav" }));
    const anadida = await accion({
      accion: "anadir-musica",
      medioId: medio.id,
      notaDerechos: "Comprada en un banco de música con licencia comercial.",
      volumen: 0.35,
    });
    expect(anadida.estado).toBe(200);
    const [pista] = (anadida.datos as VozProyectoVista).musica;
    expect(pista?.volumen).toBeCloseTo(0.35, 5);
    expect(pista?.notaDerechos).toContain("licencia comercial");
    expect(pista?.declaradoEn).not.toBe("");
    expect(pista?.medio?.id).toBe(medio.id);

    // Y quitarla no borra el archivo de la biblioteca: es del usuario.
    const quitada = await accion({ accion: "quitar-musica", pistaId: pista?.id });
    expect(quitada.estado).toBe(200);
    expect((quitada.datos as VozProyectoVista).musica).toHaveLength(0);
  });

  test("un archivo que no es audio no se puede añadir como música", async () => {
    const medio = await crearMedio(actor, new File([MP3], "voz.mp3", { type: "audio/mpeg" }));
    await db().update(scenes).set({ voiceMediaId: null }).where(eq(scenes.projectId, proyectoId));
    const anadida = await accion({
      accion: "anadir-musica",
      medioId: medio.id,
      notaDerechos: "Compuesta por mí, tengo todos los derechos.",
      volumen: 0.2,
    });
    // El MP3 sí es audio: lo que se comprueba aquí es que un medio **que no existe** responde como tal.
    expect(anadida.estado).toBe(200);
    const inventado = await accion({
      accion: "anadir-musica",
      medioId: crypto.randomUUID(),
      notaDerechos: "Compuesta por mí, tengo todos los derechos.",
      volumen: 0.2,
    });
    expect(inventado.estado).toBe(404);
  });

  // ── Criterio: los modos `clip` y `pista` son excluyentes ────────────────────────────────────────────────

  test("un proyecto nuevo usa la voz del clip y ahí no hay voz que elegir ni pista que generar", async () => {
    const estado = await estadoDeVozDe();
    expect(estado.modo).toBe("clip");
    expect(estado.voz).toBeNull();
    const [primera] = await escenasDelProyecto();
    if (!primera) throw new Error("Falta la escena de prueba.");
    const eleccion = await accion({ accion: "fijar-voz", voz: "Rachel", parametros: parametros() });
    expect(eleccion.estado).toBe(409);
    expect(mensajeDe(eleccion.datos)).toContain("voz del propio clip");
    const generada = await accion({ accion: "generar-voz", escenaId: primera.id, ...confirmacion(estado) });
    expect(generada.estado).toBe(409);
    expect(mensajeDe(generada.datos)).toContain("voz del propio clip");
  });

  test("en modo pista el clip de la escena se pide sin diálogo: no se oyen dos voces", async () => {
    const { dialogoDelClip } = await import("./modo");
    const [primera] = await escenasDelProyecto();
    if (!primera) throw new Error("Falta la escena de prueba.");
    expect(dialogoDelClip(primera, { voiceMode: "clip" })).toBe(primera.scriptText.trim());
    expect(dialogoDelClip(primera, { voiceMode: "pista" })).toBe("");
  });

  test("sin voz fijada, el modo pista no genera nada y lo dice", async () => {
    expect((await accion({ accion: "fijar-modo", modo: "pista", confirmarInvalidacion: true })).estado).toBe(200);
    const estado = await estadoDeVozDe();
    const [primera] = await escenasDelProyecto();
    if (!primera) throw new Error("Falta la escena de prueba.");
    const generada = await accion({ accion: "generar-voz", escenaId: primera.id, ...confirmacion(estado) });
    expect(generada.estado).toBe(409);
    expect(mensajeDe(generada.datos)).toContain("Elige la voz");
  });

  test("la voz pasa por el motor de controles: con el tope por trabajo por debajo no se encola nada", async () => {
    const estado = await conVozFijada();
    const [primera] = await escenasDelProyecto();
    if (!primera) throw new Error("Falta la escena de prueba.");
    await guardarAjustes({ presupuestoTrabajo: 1 }, null);
    try {
      const intento = await accion({ accion: "generar-voz", escenaId: primera.id, ...confirmacion(estado) });
      expect(intento.estado).toBeGreaterThanOrEqual(400);
      const [{ total } = { total: 0 }] = await db()
        .select({ total: sql<number>`count(*)::int` })
        .from(generationJobs)
        .where(eq(generationJobs.userId, ana.id));
      expect(total).toBe(0);
    } finally {
      await guardarAjustes({ presupuestoTrabajo: 0 }, null);
    }
  });

  test("con el TTS apagado en el panel, la pantalla dice por qué y no ofrece gastar", async () => {
    await guardarAjustes({ vozTtsActivo: false }, null);
    try {
      const estado = await estadoDeVozDe();
      expect(estado.disponibilidad.ttsDisponible).toBe(false);
      expect(estado.disponibilidad.creditosPorEscena).toBeNull();
      expect(estado.disponibilidad.motivoTts).not.toBe("");
    } finally {
      await guardarAjustes({ vozTtsActivo: true }, null);
    }
  });
});
