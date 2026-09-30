import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * Exportación de un proyecto a ZIP, contra el PostgreSQL y el almacenamiento de pruebas (nunca un proveedor).
 *
 * Comprueba el paquete **de verdad**: se prepara con el worker, se lee del almacenamiento y se busca en sus bytes
 * cualquier secreto (de la instalación, de la bóveda y de la sesión), el prompt interno y cualquier rastro de otra
 * cuenta. Y que `proyecto.json` valida contra su esquema y cita todos los medios que lleva.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);
process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_exportacion");
}

const { and, eq } = await import("drizzle-orm");
const rutaExportaciones = await import("@/app/api/proyectos/[id]/exportaciones/route");
const rutaDescarga = await import("@/app/api/proyectos/[id]/exportaciones/[exportacion]/descarga/route");
const { validarProyectoExportado } = await import("@/lib/proyecto-exportado");
const { readServerConfig } = await import("@/lib/config");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes, olvidarAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { leerObjeto } = await import("../almacenamiento");
const { accounts, generationJobs, media, projectExports, providerCredentials, rateLimits, scenes, sessions } =
  await import("../db/esquema");
const { barrerExportacionesCaducadas, empaquetar, tomarExportacionProyecto } = await import("./exportacion-proyecto");
const { leerZip } = await import("./zip");
const { gastoPorMes, historialDe } = await import("./historial");
const { medioDePrueba, proyectoProducido } = await import("./datos-de-prueba");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Buscador = import("../proveedores/codigos").Buscador;

const CLAVE_ANA = `sk-ana-clave-de-kie-${randomBytes(12).toString("hex")}`;
const buscar: Buscador = async (url) => {
  if (url.includes("/chat/credit")) {
    return new Response(JSON.stringify({ code: 200, msg: "success", data: 1000 }), { status: 200 });
  }
  throw new Error(`URL no simulada: ${url}`);
};

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const pedir = (s: Sesion, url: string, metodo = "GET") =>
  new Request(`http://localhost${url}`, {
    method: metodo,
    headers: { cookie: s.cookie, ...(metodo === "GET" ? {} : { origin: "http://localhost" }) },
  });
const errorDe = async (r: Response) => ((await r.json()) as { error?: string }).error ?? "";
const WORKER = "worker-de-prueba-exportacion";

describe.skipIf(!hayBaseDeDatos)("exportación del proyecto a ZIP", () => {
  let ana: Sesion;
  let beto: Sesion;
  let previos: Awaited<ReturnType<typeof leerAjustes>>;

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_exportacion");
    await aplicarMigraciones();
    previos = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    beto = await crearSesionDePrueba("user");
    await guardarCredencial(ana.id, "kie", CLAVE_ANA, buscar);
  });

  afterAll(async () => {
    for (const s of [ana, beto]) if (s) await s.borrar();
    await guardarAjustes(
      {
        exportacionMaximoDiario: previos.exportacionMaximoDiario,
        exportacionTamanoMaximoMb: previos.exportacionTamanoMaximoMb,
      },
      null,
    );
    olvidarAjustes();
  });

  beforeEach(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_exportacion");
    await db().delete(rateLimits);
    await db().delete(projectExports);
    await guardarAjustes({ exportacionMaximoDiario: 100, exportacionTamanoMaximoMb: 2048 }, null);
  });

  /** Pide la exportación por la API y la prepara el worker. Devuelve el identificador y los archivos del ZIP. */
  async function exportar(sesion: Sesion, proyectoId: string) {
    const pedida = await rutaExportaciones.POST(
      pedir(sesion, `/api/proyectos/${proyectoId}/exportaciones`, "POST"),
      ctx(proyectoId),
    );
    expect(pedida.status).toBe(201);
    const { exportacion } = (await pedida.json()) as { exportacion: { id: string; estado: string } };
    expect(exportacion.estado).toBe("en_cola");
    const tomada = await tomarExportacionProyecto(WORKER);
    expect(tomada?.id).toBe(exportacion.id);
    if (!tomada) throw new Error("sin exportación");
    expect(await empaquetar(tomada, WORKER)).toBe(true);
    const [fila] = await db().select().from(projectExports).where(eq(projectExports.id, exportacion.id));
    expect(fila?.state).toBe("lista");
    if (!fila?.storageKey) throw new Error("sin clave");
    const bytes = new Uint8Array(await leerObjeto(fila.storageKey).arrayBuffer());
    return { id: exportacion.id, fila, bytes, archivos: leerZip(bytes) };
  }

  test("el ZIP no contiene ninguna credencial, secreto, cabecera ni dato de otra cuenta", async () => {
    const config = readServerConfig();
    // Un guion con una clave pegada, una cabecera y el secreto del almacenamiento: el filtro los retira del texto.
    const guion = `Di esto. Authorization: Bearer abcdefghijklmnop ${config.storage.secretAccessKey} ${CLAVE_ANA}`;
    const p = await proyectoProducido({ id: ana.id, esAdmin: false }, { guion });
    // Un medio de otra cuenta citado por error en una escena de Ana no puede entrar en su paquete.
    const ajeno = await medioDePrueba({ id: beto.id, esAdmin: false }, "de-beto.png");
    await db()
      .update(scenes)
      .set({ referenceImageMediaId: ajeno.id })
      .where(eq(scenes.id, p.escenas[1] ?? ""));

    const { bytes, archivos } = await exportar(ana, p.proyectoId);
    const texto = new TextDecoder("latin1").decode(bytes);
    const [credencial] = await db().select().from(providerCredentials).where(eq(providerCredentials.userId, ana.id));
    const [cuenta] = await db().select().from(accounts).where(eq(accounts.userId, ana.id));
    const [sesion] = await db().select().from(sessions).where(eq(sessions.userId, ana.id));
    const prohibidos = [
      config.storage.secretAccessKey,
      config.storage.accessKeyId,
      process.env.BETTER_AUTH_SECRET ?? "sin-secreto-de-sesion",
      process.env.ESCENARA_CLAVE_MAESTRA ?? "sin-clave-maestra",
      CLAVE_ANA,
      credencial?.secret ?? "sin-credencial",
      cuenta?.password ?? "sin-contrasena",
      sesion?.token ?? "sin-token",
      "Bearer abcdefghijklmnop",
      "Authorization",
      "X-Amz-",
      "PROMPT-INTERNO-QUE-NO-SALE",
      ajeno.id,
      ajeno.clave,
      beto.id,
      beto.email,
      ana.email,
    ];
    for (const secreto of prohibidos) expect(texto.includes(secreto)).toBe(false);
    expect(archivos.has("proyecto.json")).toBe(true);
    expect(archivos.has("LEEME.md")).toBe(true);
    expect(new TextDecoder().decode(archivos.get("proyecto.json"))).toContain("[retirado]");
  });

  test("proyecto.json valida contra su esquema y cita todos los medios del paquete, con su huella", async () => {
    const p = await proyectoProducido({ id: ana.id, esAdmin: false });
    const { archivos } = await exportar(ana, p.proyectoId);
    const json = JSON.parse(new TextDecoder().decode(archivos.get("proyecto.json")));
    expect(validarProyectoExportado(json, archivos.keys())).toEqual([]);
    // Dos escenas con fotograma y clip, la referencia subida y el vídeo montado.
    expect(json.medios).toHaveLength(6);
    for (const medio of json.medios as { ruta: string; sha256: string; bytes: number }[]) {
      const datos = archivos.get(medio.ruta);
      expect(datos?.byteLength).toBe(medio.bytes);
      expect(new Bun.CryptoHasher("sha256").update(datos ?? new Uint8Array()).digest("hex")).toBe(medio.sha256);
    }
    expect(json.escenas[0].medios.referencia).toBe("medios/escena-01/referencia.webp");
    expect(json.exportacionesDelMontaje[0].subtitulosSrt).toBe("subtitulos/montaje-01-vertical_9_16.srt");
    expect(json.gasto).toEqual({ estimadoCreditos: 40, consumidoCreditos: 32 });
    // Un campo de más o un medio sin listar no pasan.
    expect(validarProyectoExportado({ ...json, prompt: "x" })).not.toEqual([]);
    expect(validarProyectoExportado(json, [...archivos.keys(), "medios/sobra.png"])).not.toEqual([]);
  });

  test("autorización: nadie exporta ni descarga el proyecto de otra cuenta (404 sin revelar nada)", async () => {
    const p = await proyectoProducido({ id: ana.id, esAdmin: false });
    const ajena = await rutaExportaciones.POST(
      pedir(beto, `/api/proyectos/${p.proyectoId}/exportaciones`, "POST"),
      ctx(p.proyectoId),
    );
    expect(ajena.status).toBe(404);
    const lista = await rutaExportaciones.GET(
      pedir(beto, `/api/proyectos/${p.proyectoId}/exportaciones`),
      ctx(p.proyectoId),
    );
    expect(lista.status).toBe(404);
    const { id } = await exportar(ana, p.proyectoId);
    const descarga = await rutaDescarga.GET(
      pedir(beto, `/api/proyectos/${p.proyectoId}/exportaciones/${id}/descarga`),
      { params: Promise.resolve({ id: p.proyectoId, exportacion: id }) },
    );
    expect(descarga.status).toBe(404);
    expect(await errorDe(descarga)).not.toContain(id);
  });

  test("descarga por URL temporal: dura como mucho lo que le queda al paquete y, caducado, responde 410", async () => {
    const p = await proyectoProducido({ id: ana.id, esAdmin: false });
    const { id } = await exportar(ana, p.proyectoId);
    const contexto = { params: Promise.resolve({ id: p.proyectoId, exportacion: id }) };
    // Le quedan 90 segundos: la URL firmada no puede durar más.
    await db()
      .update(projectExports)
      .set({ expiresAt: new Date(Date.now() + 90_000) })
      .where(eq(projectExports.id, id));
    const vigente = await rutaDescarga.GET(
      pedir(ana, `/api/proyectos/${p.proyectoId}/exportaciones/${id}/descarga`),
      contexto,
    );
    expect(vigente.status).toBe(302);
    const url = new URL(vigente.headers.get("location") ?? "");
    expect(Number(url.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(90);
    expect(url.searchParams.get("response-content-disposition")).toContain("attachment");

    await db()
      .update(projectExports)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(projectExports.id, id));
    const caducada = await rutaDescarga.GET(pedir(ana, `/api/proyectos/${p.proyectoId}/exportaciones/${id}/descarga`), {
      params: Promise.resolve({ id: p.proyectoId, exportacion: id }),
    });
    expect(caducada.status).toBe(410);
    expect(await errorDe(caducada)).toContain("caducado");

    // El barrido borra el objeto y deja la fila como «caducada», sin clave.
    const [antes] = await db().select().from(projectExports).where(eq(projectExports.id, id));
    expect(await barrerExportacionesCaducadas()).toBe(1);
    const [despues] = await db().select().from(projectExports).where(eq(projectExports.id, id));
    expect(despues?.state).toBe("caducada");
    expect(despues?.storageKey).toBeNull();
    expect(await leerObjeto(antes?.storageKey ?? "").exists()).toBe(false);
  });

  test("cuota diaria y tamaño máximo, con su causa concreta; una en marcha se reutiliza", async () => {
    const p = await proyectoProducido({ id: ana.id, esAdmin: false });
    await guardarAjustes({ exportacionMaximoDiario: 1 }, null);
    const primera = await rutaExportaciones.POST(
      pedir(ana, `/api/proyectos/${p.proyectoId}/exportaciones`, "POST"),
      ctx(p.proyectoId),
    );
    expect(primera.status).toBe(201);
    // Mientras se prepara, pedir otra devuelve la misma (200), sin gastar cupo.
    const repetida = await rutaExportaciones.POST(
      pedir(ana, `/api/proyectos/${p.proyectoId}/exportaciones`, "POST"),
      ctx(p.proyectoId),
    );
    expect(repetida.status).toBe(200);
    await db().update(projectExports).set({ state: "fallida" }).where(eq(projectExports.projectId, p.proyectoId));
    const otra = await rutaExportaciones.POST(
      pedir(ana, `/api/proyectos/${p.proyectoId}/exportaciones`, "POST"),
      ctx(p.proyectoId),
    );
    expect(otra.status).toBe(429);
    expect(await errorDe(otra)).toContain("últimas 24 horas");

    await guardarAjustes({ exportacionMaximoDiario: 100, exportacionTamanoMaximoMb: 10 }, null);
    await db()
      .update(media)
      .set({ sizeBytes: 50 * 1024 * 1024 })
      .where(eq(media.id, p.montado.id));
    const grande = await rutaExportaciones.POST(
      pedir(ana, `/api/proyectos/${p.proyectoId}/exportaciones`, "POST"),
      ctx(p.proyectoId),
    );
    expect(grande.status).toBe(413);
    expect(await errorDe(grande)).toContain("Admin › Ajustes");
    expect(
      await db()
        .select()
        .from(projectExports)
        .where(and(eq(projectExports.projectId, p.proyectoId), eq(projectExports.state, "en_cola"))),
    ).toHaveLength(0);
  });

  test("historial: cronología y gasto del proyecto solo para su dueño, sin texto del proveedor", async () => {
    const p = await proyectoProducido({ id: ana.id, esAdmin: false });
    await db()
      .update(generationJobs)
      .set({ state: "fallido", failureReason: "contenido", errorMessage: "TEXTO-LIBRE-DEL-PROVEEDOR" })
      .where(
        eq(
          generationJobs.sceneId,
          (await db().select({ id: scenes.id }).from(scenes).where(eq(scenes.projectId, p.proyectoId)))[0]?.id ?? "",
        ),
      );
    const filtro = { tipo: null, mes: null, proyectoId: p.proyectoId, pagina: 1 };
    const deAna = await historialDe(ana.id, filtro);
    expect(deAna.eventos.filter((x) => x.tipo === "trabajo")).toHaveLength(4);
    expect(deAna.eventos.filter((x) => x.tipo === "montaje")).toHaveLength(1);
    expect(JSON.stringify(deAna)).not.toContain("TEXTO-LIBRE-DEL-PROVEEDOR");
    expect(JSON.stringify(deAna)).not.toContain("PROMPT-INTERNO");
    expect(deAna.eventos.find((x) => x.estado === "fallido")?.fallo).toBeTruthy();
    // Beto pide el historial del proyecto de Ana: nada, ni un evento.
    expect((await historialDe(beto.id, filtro)).eventos).toEqual([]);
    expect(await gastoPorMes(beto.id, p.proyectoId)).toEqual([]);
    const gasto = await gastoPorMes(ana.id, p.proyectoId);
    expect(gasto.reduce((n, g) => n + g.consumido, 0)).toBe(32);
    expect(gasto.reduce((n, g) => n + g.estimado, 0)).toBe(40);
    // Filtros: solo montajes; un mes sin nada.
    expect((await historialDe(ana.id, { ...filtro, tipo: "montaje" })).eventos.every((x) => x.tipo === "montaje")).toBe(
      true,
    );
    expect((await historialDe(ana.id, { ...filtro, mes: "2001-01" })).eventos).toEqual([]);
  });

  test("si el almacenamiento falla al leer, vuelve a la cola y, agotados los intentos, falla diciendo por qué", async () => {
    const p = await proyectoProducido({ id: ana.id, esAdmin: false });
    await rutaExportaciones.POST(pedir(ana, `/api/proyectos/${p.proyectoId}/exportaciones`, "POST"), ctx(p.proyectoId));
    const roto = {
      leer: async () => {
        throw new Error("almacenamiento caído");
      },
      subir: async () => undefined,
      borrar: async () => undefined,
    };
    for (let intento = 1; intento <= 3; intento++) {
      const tomada = await tomarExportacionProyecto(WORKER);
      if (!tomada) throw new Error("no se ha retomado");
      expect(await empaquetar(tomada, WORKER, roto)).toBe(false);
    }
    const [fila] = await db().select().from(projectExports).where(eq(projectExports.projectId, p.proyectoId));
    expect(fila?.state).toBe("fallida");
    expect(fila?.errorMessage).toContain("almacenamiento");
    expect(await tomarExportacionProyecto(WORKER)).toBeNull();
  });
});
