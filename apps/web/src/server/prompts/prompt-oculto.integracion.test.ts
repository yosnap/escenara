import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";

/**
 * El prompt compuesto **no sale hacia el navegador de un usuario normal** (decisión firme del propietario,
 * 2026-09-27; ADR-0022).
 *
 * Este test no mira el código: coge un trabajo con su prompt ya compuesto y **busca ese texto en los cuerpos de
 * las respuestas** que recibe una cuenta sin privilegios, más en los objetos que las páginas le pasan al
 * navegador (que es lo que acaba en el payload RSC). El centinela es una frase que solo está en la plantilla,
 * nunca en lo que escribe la persona, así que encontrarla significa que se ha filtrado el prompt.
 *
 * Y comprueba lo otro que hace falta para que la decisión valga: **quien administra sí lo ve** en
 * `/admin/trabajos`, porque si no, un rechazo del proveedor no se podría explicar nunca.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_prompt_oculto");
}

const { eq } = await import("drizzle-orm");
const rutaTrabajos = await import("@/app/api/generacion/trabajos/route");
const rutaTrabajo = await import("@/app/api/generacion/trabajos/[id]/route");
const rutaCatalogo = await import("@/app/api/prompts/catalogo/route");
const rutaProyecto = await import("@/app/api/proyectos/[id]/route");
const rutaPreset = await import("@/app/api/prompts/presets/[id]/route");
const rutaDuplicar = await import("@/app/api/prompts/presets/[id]/duplicar/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, users } = await import("../db/esquema");
const { guardarCredencial } = await import("../boveda/credenciales");
const { crearMedio } = await import("../media/servicio");
const { crearFotograma } = await import("../generacion/servicio");
const { listarPlantillas, listarPresets } = await import("./consulta");
const { catalogoParaCrear } = await import("./catalogo-para-crear");
const { crearProyecto } = await import("../asistente/proyectos");
const { crearEscena } = await import("../asistente/escenas");
const { detalleProyecto } = await import("../asistente/plan");
const { trabajosEnRevision } = await import("../cola/revision");
const { listarTrabajos } = await import("../generacion/trabajos");
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type Actor = import("../media/servicio").Actor;

const CLAVE = "sk-ana-clave-de-kie-inventada-eeee";
/**
 * Frase que solo está en la plantilla sembrada del fotograma: el cierre del bloque de anclajes (C6), que desde
 * la 0.25.0 termina siempre el prompt del fotograma. No la escribe nadie, así que si aparece en una respuesta
 * es porque se ha filtrado el prompt compuesto.
 */
const CENTINELA = "no distorted or duplicated body parts anywhere in the image";
/** Lo que escribe la persona: esto **sí** puede salir hacia su navegador, es suyo. */
const ESCENA = "en una azotea al amanecer, mirando a cámara";

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url) => {
  if (url.includes("/chat/credit")) return sobre(5000);
  if (url.includes("file-stream-upload")) return sobre({ downloadUrl: "https://tempfile.kie.ai/referencia.png" });
  if (url.includes("createTask")) return sobre({ taskId: `task_${Date.now()}` });
  if (url.includes("recordInfo")) return sobre({ state: "waiting", failMsg: "" });
  throw new Error(`URL no simulada: ${url}`);
};

const h: Herramientas = {
  buscar,
  descargar: async () => {
    throw new Error("Ningún test de esta suite descarga resultados.");
  },
};

async function foto(): Promise<Uint8Array<ArrayBuffer>> {
  const lado = 640;
  const pixeles = new Uint8Array(lado * lado * 3).fill(120);
  const png = await sharp(pixeles, { raw: { width: lado, height: lado, channels: 3 } })
    .png()
    .toBuffer();
  const copia = new Uint8Array(new ArrayBuffer(png.byteLength));
  copia.set(png);
  return copia;
}

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const pedir = (s: Sesion, url: string) => new Request(`http://localhost${url}`, { headers: { cookie: s.cookie } });

/** Petición que cambia datos: lleva `Origin` del mismo sitio, como exige el servidor. */
const escribir = (s: Sesion, url: string, metodo: string, cuerpo?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: metodo,
    headers: { cookie: s.cookie, origin: "http://localhost", "Content-Type": "application/json" },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

describe.skipIf(!hayBaseDeDatos)("el prompt compuesto no llega al navegador", () => {
  let ana: Sesion;
  let actorAna: Actor;
  let trabajoId = "";
  let proyectoId = "";
  let compuesto = "";
  let copiaId = "";

  beforeAll(async () => {
    await aplicarMigraciones();
    ana = await crearSesionDePrueba("user");
    actorAna = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE, buscar);
    const medio = await crearMedio(actorAna, new File([await foto()], "referencia.png", { type: "image/png" }));

    // Un trabajo con plantilla: así el prompt que se guarda lleva la frase centinela.
    const plantillas = await listarPlantillas({ usuarioId: ana.id });
    const plantilla = plantillas.find((p) => p.capacidad === "image_edit" && p.activa);
    if (!plantilla) throw new Error("Falta la plantilla de fotograma de la semilla.");
    const catalogo = await catalogoParaCrear(ana.id, "fotograma");
    const unoDe = (categoria: string) => catalogo.presets.find((p) => p.categoria === categoria)?.id;
    const envio = await crearFotograma(
      actorAna,
      {
        prompt: ESCENA,
        creditosConfirmados: 4,
        derechos: true,
        claveIdempotencia: crypto.randomUUID(),
        medioId: medio.id,
        plantillaId: plantilla.id,
        plantillaVersionId: plantilla.versionId,
        presets: {
          especialidad: [unoDe("especialidad") ?? ""],
          formato: [unoDe("formato") ?? ""],
          estilo: [unoDe("estilo") ?? ""],
        },
      },
      h,
    );
    trabajoId = envio.trabajo.id;
    const [fila] = await db()
      .select({ prompt: generationJobs.prompt })
      .from(generationJobs)
      .where(eq(generationJobs.id, trabajoId));
    compuesto = fila?.prompt ?? "";

    const proyecto = await crearProyecto(actorAna, {
      titulo: "Proyecto de prueba",
      formato: "reel_vertical",
      idea: "Una rutina de mañana.",
      presupuestoCreditos: 500,
    });
    proyectoId = proyecto.proyecto.id;
    await crearEscena(actorAna, proyectoId, { texto: ESCENA, accion: "Plano medio" });
  });

  afterAll(async () => {
    await db().delete(users).where(eq(users.id, ana.id));
  });

  test("el trabajo se ha compuesto de verdad con la plantilla: el centinela está en el prompt guardado", () => {
    expect(compuesto).toContain(CENTINELA);
    expect(compuesto).not.toBe("");
  });

  test("ninguna respuesta de la API de un usuario normal lleva el prompt", async () => {
    const respuestas = [
      await rutaTrabajos.GET(pedir(ana, "/api/generacion/trabajos"), undefined),
      await rutaTrabajo.GET(pedir(ana, `/api/generacion/trabajos/${trabajoId}`), ctx(trabajoId)),
      await rutaCatalogo.GET(pedir(ana, "/api/prompts/catalogo?tipo=fotograma"), undefined),
      await rutaProyecto.GET(pedir(ana, `/api/proyectos/${proyectoId}`), ctx(proyectoId)),
    ];
    for (const respuesta of respuestas) {
      expect(respuesta.status).toBe(200);
      const cuerpo = await respuesta.text();
      expect(cuerpo).not.toContain(CENTINELA);
      expect(cuerpo).not.toContain(compuesto);
    }
  });

  test("lo que escribió la persona sí se le muestra: es suyo", async () => {
    const respuesta = await rutaTrabajo.GET(pedir(ana, `/api/generacion/trabajos/${trabajoId}`), ctx(trabajoId));
    expect(await respuesta.text()).toContain(ESCENA);
  });

  test("los objetos que las páginas pasan al navegador tampoco lo llevan (payload RSC)", async () => {
    // `catalogoParaCrear` es lo que `/crear` le pasa a su vista, y `detalleProyecto` lo que `/proyectos/[id]`
    // pasa a la suya: si el prompt o sus piezas estuvieran ahí, viajarían en el payload RSC.
    const catalogo = JSON.stringify(await catalogoParaCrear(ana.id, "fotograma"));
    expect(catalogo).not.toContain(CENTINELA);
    // Y tampoco las piezas: ni el texto de la plantilla ni el fragmento en inglés de cada preset.
    expect(catalogo).not.toContain("{{escena}}");
    expect(catalogo).not.toContain("Fashion content");

    const proyecto = JSON.stringify(await detalleProyecto(actorAna, proyectoId));
    expect(proyecto).not.toContain(CENTINELA);
  });

  test("el historial del usuario muestra su descripción, no el prompt", async () => {
    const [trabajo] = await listarTrabajos(ana.id);
    expect(trabajo?.escena).toBe(ESCENA);
    expect(trabajo?.prompt).toBeUndefined();
  });

  test("duplicar un preset no devuelve su fragmento en inglés", async () => {
    const deLaInstalacion = (await listarPresets({ usuarioId: ana.id })).find((p) => p.deLaInstalacion && p.activo);
    if (!deLaInstalacion) throw new Error("Falta un preset de la instalación en la semilla.");
    const fragmento = deLaInstalacion.valores.prompt;
    expect(fragmento).not.toBe("");

    const respuesta = await rutaDuplicar.POST(
      escribir(ana, `/api/prompts/presets/${deLaInstalacion.id}/duplicar`, "POST"),
      ctx(deLaInstalacion.id),
    );
    expect(respuesta.status).toBe(201);
    const cuerpo = await respuesta.text();
    expect(cuerpo).not.toContain(fragmento);
    // Lo que sí vuelve: lo que el usuario necesita para pintar su botón.
    expect(cuerpo).toContain(deLaInstalacion.nombre);
    copiaId = (JSON.parse(cuerpo) as { id: string }).id;
  });

  test("editar tu copia devuelve lo visible, no el prompt, y conserva el fragmento que tenía", async () => {
    const antes = (await listarPresets({ usuarioId: ana.id })).find((p) => p.id === copiaId);
    if (!antes) throw new Error("Falta la copia que se acaba de duplicar.");
    const fragmento = antes.valores.prompt;

    // Lo que manda «Crear» desde la 0.17.0: solo el nombre y la descripción.
    const respuesta = await rutaPreset.PATCH(
      escribir(ana, `/api/prompts/presets/${copiaId}`, "PATCH", {
        nombre: "Mi versión",
        descripcion: "Con otro nombre y otra descripción.",
      }),
      ctx(copiaId),
    );
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.text();
    expect(cuerpo).not.toContain(fragmento);
    expect(cuerpo).toContain("Mi versión");

    // Y el fragmento sigue siendo el que era: no llegaba, así que no se ha vaciado.
    const despues = (await listarPresets({ usuarioId: ana.id })).find((p) => p.id === copiaId);
    expect(despues?.valores.prompt).toBe(fragmento);
    expect(despues?.nombre).toBe("Mi versión");
  });

  test("quien administra sí ve el prompt en su panel", async () => {
    // El trabajo se pone `desconocido` a mano: es el estado con el que aparece en `/admin/trabajos`.
    await db().update(generationJobs).set({ state: "desconocido" }).where(eq(generationJobs.id, trabajoId));
    const enRevision = await trabajosEnRevision();
    const trabajo = enRevision.find((t) => t.id === trabajoId);
    expect(trabajo?.prompt).toContain(CENTINELA);
  });
});
