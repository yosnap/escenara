import { beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * **Modelo de vídeo fijado en un proyecto**, contra el PostgreSQL local (`bun run services:up`).
 *
 * Lo que comprueba es la regla de dinero de esta columna: la estimación del plan, lo que enseñan las Opciones
 * avanzadas y la estimación que se confirma al encolar salen del **mismo modelo y el mismo sello**. Un proyecto sin
 * modelo fijado estima exactamente igual que antes (con el mapa de la cuenta).
 *
 * **Ningún test llama a KIE**: el saldo se simula y la clave es inventada.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_modelo_de_video");
}

const { eq } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { db } = await import("../db/cliente");
const { models } = await import("../db/esquema");
const { olvidarCatalogo } = await import("../proveedores/catalogo");
const { eleccionOmni } = await import("../omni/registro");
const { fijarModoVoz } = await import("../voz/proyecto");
const { aplicarMigraciones } = await import("../db/migrar");
const { guardarCredencial } = await import("../boveda/credenciales");
const { estimar } = await import("../generacion/estimacion");
const { crearProyecto, editarProyecto } = await import("../asistente/proyectos");
const { proyectoPropio } = await import("../asistente/consulta");
const { eleccionesDelPlan } = await import("../asistente/plan");
const { modeloDeVideoDe, modelosDeVideoDelProyecto } = await import("./modelo-de-video");
type Buscador = import("../proveedores/codigos").Buscador;
type Actor = import("../media/servicio").Actor;

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url) => {
  if (url.includes("/chat/credit")) return sobre(100000);
  throw new Error(`URL no simulada: ${url}`);
};

describe.skipIf(!hayBaseDeDatos)("modelo de vídeo fijado en un proyecto", () => {
  let actor: Actor;

  beforeAll(async () => {
    await aplicarMigraciones();
    const sesion = await crearSesionDePrueba("user");
    actor = { id: sesion.id, esAdmin: false };
    await guardarCredencial(sesion.id, "kie", `kie-${randomBytes(8).toString("hex")}`, buscar);
  });

  test("sin modelo fijado el plan estima con el mapa de la cuenta, igual que antes", async () => {
    const detalle = await crearProyecto(actor, { titulo: "Sin fijar", formato: "anuncio", idea: "probar" });
    const fila = await proyectoPropio(actor, detalle.proyecto.id);
    expect(fila.videoModel).toBe("");
    expect(modeloDeVideoDe(fila)).toBeNull();
    const conProyecto = await eleccionesDelPlan(actor.id, fila);
    const sinProyecto = await eleccionesDelPlan(actor.id);
    expect(conProyecto.animacion?.precio.sello).toBe(sinProyecto.animacion?.precio.sello);
    expect(detalle.avanzadas?.modeloVideo).toBe("");
    expect(detalle.avanzadas?.enUso).toBe(sinProyecto.animacion?.modelo.nombre ?? "");
  });

  test("con un modelo fijado, plan, Opciones avanzadas y estimación que se confirma usan el mismo", async () => {
    const detalle = await crearProyecto(actor, { titulo: "Fijado", formato: "anuncio", idea: "probar" });
    const delMapa = (await eleccionesDelPlan(actor.id)).animacion?.modelo.modelo;
    const candidatos = await modelosDeVideoDelProyecto("clip");
    const otro = candidatos.find((m) => m.modelo !== delMapa);
    expect(otro).toBeDefined();
    if (!otro) return;

    const editado = await editarProyecto(actor, detalle.proyecto.id, { modeloVideo: otro.modelo });
    expect(editado.avanzadas?.modeloVideo).toBe(otro.modelo);
    expect(editado.avanzadas?.enUso).toBe(otro.nombre);
    expect(editado.avanzadas?.fijadoNoDisponible).toBe(false);

    const fila = await proyectoPropio(actor, detalle.proyecto.id);
    const plan = await eleccionesDelPlan(actor.id, fila);
    // Lo que se confirma al encolar es la estimación del modelo pedido: el encolado le pasa el mismo lector.
    const confirmada = await estimar(actor.id, "animacion", buscar, await modeloDeVideoDe(fila));
    expect(plan.animacion?.modelo.modelo).toBe(otro.modelo);
    expect(plan.animacion?.precio.sello).toBe(confirmada.sello);
  });

  test("un modelo que no está entre los elegibles se rechaza con su motivo y no cambia nada", async () => {
    const detalle = await crearProyecto(actor, { titulo: "Inválido", formato: "anuncio", idea: "probar" });
    const fallo = (await editarProyecto(actor, detalle.proyecto.id, { modeloVideo: "no-existe" }).catch(
      (e: unknown) => e,
    )) as { estado: number; message: string };
    expect(fallo.estado).toBe(409);
    expect(fallo.message).toContain("No se ha cambiado nada");
    expect(fallo.message).not.toContain("no-existe");
    expect((await proyectoPropio(actor, detalle.proyecto.id)).videoModel).toBe("");
  });

  test("volver a «El de tu mapa de modelos» deja la columna vacía", async () => {
    const detalle = await crearProyecto(actor, { titulo: "Volver", formato: "anuncio", idea: "probar" });
    const [primero] = await modelosDeVideoDelProyecto("clip");
    if (!primero) return;
    await editarProyecto(actor, detalle.proyecto.id, { modeloVideo: primero.modelo });
    const vuelto = await editarProyecto(actor, detalle.proyecto.id, { modeloVideo: "" });
    expect(vuelto.avanzadas?.modeloVideo).toBe("");
    expect((await proyectoPropio(actor, detalle.proyecto.id)).videoModel).toBe("");
  });

  test("un modelo fijado que deja de ser elegible se ignora en todos los caminos y la pantalla lo dice", async () => {
    const detalle = await crearProyecto(actor, { titulo: "Retirado", formato: "anuncio", idea: "probar" });
    const delMapa = (await eleccionesDelPlan(actor.id)).animacion;
    const otro = (await modelosDeVideoDelProyecto("clip")).find((m) => m.modelo !== delMapa?.modelo.modelo);
    if (!otro || !delMapa) return;
    await editarProyecto(actor, detalle.proyecto.id, { modeloVideo: otro.modelo });
    const [fila] = await db()
      .select({ id: models.id, estado: models.state })
      .from(models)
      .where(eq(models.modelId, otro.modelo));
    if (!fila) return;
    try {
      await db().update(models).set({ state: "retirado" }).where(eq(models.id, fila.id));
      olvidarCatalogo();
      const proyecto = await proyectoPropio(actor, detalle.proyecto.id);
      // La columna se conserva, pero el lector único devuelve el mapa: plan, sello y encolado usan el mismo.
      expect(proyecto.videoModel).toBe(otro.modelo);
      expect(await modeloDeVideoDe(proyecto)).toBeNull();
      const plan = await eleccionesDelPlan(actor.id, proyecto);
      expect(plan.animacion?.modelo.modelo).toBe(delMapa.modelo.modelo);
      expect(plan.animacion?.precio.sello).toBe(delMapa.precio.sello);
      const vuelta = await editarProyecto(actor, detalle.proyecto.id, { titulo: "Retirado" });
      expect(vuelta.avanzadas?.fijadoNoDisponible).toBe(true);
      expect(vuelta.avanzadas?.enUso).toBe(delMapa.modelo.nombre);
    } finally {
      await db().update(models).set({ state: fila.estado }).where(eq(models.id, fila.id));
      olvidarCatalogo();
    }
  });

  test("en modo de voz e identidad registradas, el modelo fijado manda también al registrar y al producir", async () => {
    // `registrarVozEnProveedor`, `registrarPersonajeEnProveedor` y `registroParaProducir` resuelven el modelo con
    // `eleccionOmni(usuario, …, proyecto)`: si el proyecto fija uno, los tres usan ese y no el del mapa.
    const habladas = await modelosDeVideoDelProyecto("omni");
    const delMapa = (await eleccionOmni(actor.id)).modelo.modelo;
    const otro = habladas.find((m) => m.modelo !== delMapa);
    if (!otro) return;
    const proyecto = { videoModel: otro.modelo, voiceMode: "omni" as const };
    expect((await eleccionOmni(actor.id, undefined, proyecto)).modelo.modelo).toBe(otro.modelo);
    // Un modelo de clip normal fijado en un proyecto de escenas habladas no cuenta: se queda el del mapa.
    const deClip = { videoModel: "veo3_lite", voiceMode: "omni" as const };
    expect((await eleccionOmni(actor.id, undefined, deClip)).modelo.modelo).toBe(delMapa);
  });

  test("al cambiar de modo de voz el modelo fijado se vacía y el proyecto vuelve al mapa", async () => {
    const detalle = await crearProyecto(actor, { titulo: "Cambio de modo", formato: "anuncio", idea: "probar" });
    const [primero] = await modelosDeVideoDelProyecto("clip");
    if (!primero) return;
    await editarProyecto(actor, detalle.proyecto.id, { modeloVideo: primero.modelo });
    await fijarModoVoz(actor, detalle.proyecto.id, "pista", true);
    expect((await proyectoPropio(actor, detalle.proyecto.id)).videoModel).toBe("");
  });
});
