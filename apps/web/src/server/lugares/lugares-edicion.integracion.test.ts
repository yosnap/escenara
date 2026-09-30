import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * **Retirar personas y candidatos de un lugar**, contra el PostgreSQL local y con el proveedor simulado.
 *
 * Retirar a la gente es una edición de imagen con su coste confirmado, por el mismo camino de dinero que cualquier
 * fotograma; su resultado entra en el lugar como foto generada, ocupa el sitio de la maestra si de ella salía, retira
 * la declaración y crea versión. Solo así se puede declarar «personas retiradas».
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_lugares_edicion");
}

const { eq } = await import("drizzle-orm");
const rutaEdicion = await import("@/app/api/lugares/[id]/edicion/route");
const { exigirBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes, leerAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, rateLimits, usageLedger, users } = await import("../db/esquema");
const { estimar, olvidarSaldos } = await import("../generacion/estimacion");
const { lugarDeclaradoDePrueba, subirFotoDePrueba } = await import("./lugar-de-prueba");
const { adjuntarAlLugar, PROMPT_RETIRAR_PERSONAS } = await import("./edicion");
const { declararLugar } = await import("./declaracion");
const { crearLugar } = await import("./servicio");
const { obtenerLugar } = await import("./consulta");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type Buscador = import("../proveedores/codigos").Buscador;

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url) => {
  if (url.includes("/chat/credit")) return sobre(1_000_000);
  throw new Error(`URL no simulada: ${url}`);
};

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!hayBaseDeDatos)("fotos generadas de un lugar", () => {
  let ana: Sesion;
  let beto: Sesion;
  let actor: Actor;
  let ajustesPrevios: Awaited<ReturnType<typeof leerAjustes>>;

  beforeAll(async () => {
    exigirBaseDeDatosDePrueba("escenara_pruebas_lugares_edicion");
    await aplicarMigraciones();
    ajustesPrevios = await leerAjustes();
    ana = await crearSesionDePrueba("user");
    beto = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", "sk-ana-clave-de-kie-inventada-edicion", buscar);
    await guardarAjustes({ presupuestoCreditos: 0, presupuestoTrabajo: 0, trabajosSimultaneos: 20 }, null);
  });

  afterAll(async () => {
    for (const sesion of [ana, beto]) {
      if (sesion?.email) await db().delete(users).where(eq(users.email, sesion.email));
    }
    await guardarAjustes(
      {
        presupuestoCreditos: ajustesPrevios.presupuestoCreditos,
        presupuestoTrabajo: ajustesPrevios.presupuestoTrabajo,
        trabajosSimultaneos: ajustesPrevios.trabajosSimultaneos,
      },
      null,
    );
  });

  beforeEach(async () => {
    olvidarSaldos();
    exigirBaseDeDatosDePrueba("escenara_pruebas_lugares_edicion");
    await db().delete(rateLimits);
    await db().delete(generationJobs).where(eq(generationJobs.userId, ana.id));
    await db().delete(usageLedger).where(eq(usageLedger.userId, ana.id));
  });

  const encargar = async (sesion: Sesion, lugarId: string, cuerpo: Record<string, unknown>) => {
    const estimacion = await estimar(sesion.id, "fotograma", buscar, null, {
      sinReferencia: cuerpo.tipo === "candidato",
    });
    return rutaEdicion.POST(
      new Request(`http://localhost/api/lugares/${lugarId}/edicion`, {
        method: "POST",
        headers: { cookie: sesion.cookie, origin: "http://localhost", "Content-Type": "application/json" },
        body: JSON.stringify({
          creditosConfirmados: estimacion.creditos,
          selloEstimacion: estimacion.sello,
          derechos: true,
          claveIdempotencia: crypto.randomUUID(),
          ...cuerpo,
        }),
      }),
      ctx(lugarId),
    );
  };

  test("retirar a la gente de la maestra: se cobra como un fotograma y el resultado pasa a ser la maestra", async () => {
    const { lugar, maestra } = await lugarDeclaradoDePrueba(actor, "Plaza con gente", { declarado: false });
    const referenciaId = lugar.referencias[0]?.id ?? "";
    // «Retiradas» no se puede declarar mientras la maestra sea la foto original.
    await expect(
      declararLugar(actor, lugar.id, {
        origenFotos: "propias",
        personasVisibles: "retiradas",
        sinMenores: true,
      }),
    ).rejects.toThrow("la maestra es la foto original");

    const respuesta = await encargar(ana, lugar.id, { tipo: "retirar-personas", referenciaId });
    expect(respuesta.status).toBe(201);
    const [trabajo] = await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id));
    expect(trabajo?.kind).toBe("fotograma");
    expect(trabajo?.sourceMediaId).toBe(maestra);
    expect(trabajo?.prompt).toContain(PROMPT_RETIRAR_PERSONAS.slice(0, 40));
    expect((trabajo?.input as { edicionDeLugar?: unknown }).edicionDeLugar).toMatchObject({
      lugarId: lugar.id,
      tipo: "retirar_personas",
    });
    // Se reservó lo que cuesta: el mismo apunte que cualquier fotograma.
    expect(await db().select().from(usageLedger).where(eq(usageLedger.userId, ana.id))).not.toHaveLength(0);

    // Al cerrarse el trabajo, la foto editada entra como maestra generada y crea versión.
    const editada = await subirFotoDePrueba(actor, "plaza-sin-gente.png");
    if (!trabajo) throw new Error("Falta el trabajo.");
    await adjuntarAlLugar(trabajo, editada);
    const despues = await obtenerLugar(actor, lugar.id);
    const nueva = despues.referencias.find((r) => r.medio.id === editada);
    expect(nueva?.papel).toBe("maestra");
    expect(nueva?.generada).toBe(true);
    expect(despues.referencias.find((r) => r.medio.id === maestra)?.papel).toBe("general");
    expect(despues.version).toBe(lugar.version + 1);
    const declarado = await declararLugar(actor, lugar.id, {
      origenFotos: "propias",
      personasVisibles: "retiradas",
      sinMenores: true,
    });
    expect(declarado.declarado).toBe(true);
  });

  test("otra persona no puede encargar nada sobre un lugar ajeno, y un lugar real no pide candidatos", async () => {
    const { lugar } = await lugarDeclaradoDePrueba(actor, "Bar");
    await guardarCredencial(beto.id, "kie", "sk-beto-clave-de-kie-inventada-edicion", buscar);
    const ajeno = await encargar(beto, lugar.id, { tipo: "retirar-personas", referenciaId: lugar.referencias[0]?.id });
    expect(ajeno.status).toBe(404);
    const candidato = await encargar(ana, lugar.id, { tipo: "candidato" });
    expect(candidato.status).toBe(409);
    expect(await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id))).toHaveLength(0);
  });

  test("un lugar animado sin descripción no pide candidatos, y retirar personas no aplica", async () => {
    const animado = await crearLugar(actor, {
      nombre: `Plaza animada ${crypto.randomUUID().slice(0, 6)}`,
      estilo: "ilustracion-plana",
    });
    expect(animado.acabado).toBe("animado");
    const sinDescripcion = await encargar(ana, animado.id, { tipo: "candidato" });
    expect(sinDescripcion.status).toBe(409);
    const retirar = await encargar(ana, animado.id, { tipo: "retirar-personas", referenciaId: "x" });
    expect(retirar.status).toBe(409);
  });

  test("un candidato de un lugar animado sale sin foto de partida, con su estilo, y entra en el lugar sin ser maestro", async () => {
    const animado = await crearLugar(actor, {
      nombre: `Plaza de Nora ${crypto.randomUUID().slice(0, 6)}`,
      descripcion: "Plaza pequeña con un quiosco, bancos verdes y una fuente.",
      estilo: "ilustracion-plana",
    });
    const respuesta = await encargar(ana, animado.id, { tipo: "candidato" });
    expect(respuesta.status).toBe(201);
    const [trabajo] = await db().select().from(generationJobs).where(eq(generationJobs.userId, ana.id));
    expect(trabajo?.sourceMediaId).toBeNull();
    expect((trabajo?.input as { sinReferencia?: unknown }).sinReferencia).toBe(true);
    expect(trabajo?.prompt).toContain("Plaza pequeña con un quiosco");
    if (!trabajo) throw new Error("Falta el trabajo.");
    const candidato = await subirFotoDePrueba(actor, "candidato.png");
    await adjuntarAlLugar(trabajo, candidato);
    const despues = await obtenerLugar(actor, animado.id);
    expect(despues.referencias.find((r) => r.medio.id === candidato)?.papel).toBe("general");
    expect(despues.tieneMaestra).toBe(false);
  });
});
