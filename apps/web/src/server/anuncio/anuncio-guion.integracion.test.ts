import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * **Hooks, guion, variantes y `angulo_fiel`** (0.27.0) contra el PostgreSQL local. **No se llama a nadie**: el
 * modelo de texto y Jev se contestan con respuestas grabadas, y las claves son inventadas.
 *
 * Lo que fija, una por una, las promesas de la fase:
 *
 * - la petición al asistente lleva **el ángulo, el público, la versión mejor de sí mismo y la oferta**, y los
 *   campos vacíos de la oferta **no aparecen**;
 * - **no se llama al modelo sin estimación y confirmación** del coste: sin ellas no sale ni una petición;
 * - en los ángulos que afirman algo comprobable, **sin declaración no se pide guion**, y el mensaje dice qué falta;
 * - las **variantes** son N proyectos hermanos con el mismo `variantGroupId`, la misma oferta y ángulos distintos,
 *   con **una sola confirmación agregada**;
 * - el **hook elegido es la primera frase del guion** —una sola vez— y su arranque llega a la dirección de la
 *   escena, sin duplicar el dato;
 * - **`angulo_fiel`** registra veredicto, evidencia y confianza; un guion que mezcla dos ángulos sale negativo con
 *   su evidencia, y **en sombra no bloquea nada**;
 * - **autorización**: nadie pide hooks, crea variantes ni comprueba el ángulo de un proyecto ajeno.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_anuncio_guion");
}

const { and, asc, eq } = await import("drizzle-orm");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { adBriefs, coherenceDecisions, models, projects, scenes, sensitiveClaimDeclarations, users } = await import(
  "../db/esquema"
);
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { guardarAjustes } = await import("../ajustes");
const { guardarCredencial } = await import("../boveda/credenciales");
const { guardarSecreto } = await import("../boveda/secretos");
const { guardarMapa } = await import("../mapa/mapa");
const { olvidarCatalogo } = await import("../proveedores/catalogo");
const { crearProyecto } = await import("../asistente/proyectos");
const { crearProducto } = await import("../productos/servicio");
const { crearOferta } = await import("./ofertas");
const { guardarBrief } = await import("./brief");
const { puedePedirGuion } = await import("./puerta-guion");
const { registrarDeclaracion } = await import("./declaracion");
const { estimacionDeHooksYGuion, hooksGuardadosDe, proponerHooksYGuion } = await import("./guion");
const { escribirGuion } = await import("../asistente/generar");
const { aplicarHook } = await import("./hook");
const { crearVariantes, estimarVariantes } = await import("./variantes");
const { comprobarAnguloDelAnuncio, anguloFielGuardadoDe } = await import("../coherencia/anuncio");
const { HERRAMIENTAS_JEV } = await import("../coherencia/decidir");
const { leerCatalogoDeDireccion } = await import("../direccion/catalogo");
const fixtures = await import("../coherencia/fixtures");
const { ErrorAnuncio } = await import("./errores");

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
type Actor = import("../media/servicio").Actor;
type Buscador = import("../proveedores/codigos").Buscador;

const CLAVE_KIE = "sk-ana-clave-de-kie-inventada-dddd";
const CLAVE_JEV = "ts-clave-de-la-instalacion-1234";
const MODELO_TEXTO = "gpt-5-6-sol";

// ── Los dos servicios simulados ─────────────────────────────────────────────────────────────────────────

/** Cuerpos de las peticiones de texto recibidas. Su número es lo que prueba que **no** se llamó. */
const textosPedidos: string[] = [];
/** Qué contesta el modelo de texto la próxima vez. */
let respuestaDelModelo = "";
/** Qué contesta Jev la próxima vez. */
let respuestaDeJev: unknown = fixtures.JEV_ANGULO_FIEL;

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Simulación de KIE (modelo de texto) y de TypeSafe (Jev). **No se toca el `fetch` global**: en Bun es del proceso
 * entero y se colaría en las demás suites. Cualquier URL no simulada revienta el test a propósito.
 */
const buscar: Buscador = async (url, init) => {
  if (url.startsWith("https://api.typesafe.ai/")) {
    if (url.endsWith("/models")) return fixtures.respuestaGrabada(fixtures.JEV_MODELOS_200);
    return fixtures.respuestaGrabada(respuestaDeJev);
  }
  if (url.includes("/chat/credit")) return sobre(50_000);
  if (url.includes("/codex/v1/responses")) {
    textosPedidos.push(typeof init?.body === "string" ? init.body : "");
    return new Response(
      JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: respuestaDelModelo }] }],
        usage: { input_tokens: 140, output_tokens: 320 },
        credits_consumed: 1.5,
        status: "completed",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  throw new Error(`URL no simulada: ${url}`);
};

/** Respuesta del modelo con cinco hooks y un guion de dos escenas. */
const propuestaDelModelo = (camara: string, gesto: string) =>
  JSON.stringify({
    hooks: [
      { texto: "El encrespado no es tu pelo: son los sulfatos", camara, gesto },
      { texto: "Llevas años tratando el síntoma.", camara: "", gesto: "" },
      { texto: "Hay una razón por la que se te encrespa a los diez minutos.", camara: "", gesto: "" },
      { texto: "Tu champú de siempre es el problema.", camara: "", gesto: "" },
      { texto: "Nadie te ha explicado por qué pasa esto.", camara: "", gesto: "" },
    ],
    concepto: "El mecanismo del encrespado explicado en cuatro escenas.",
    escenas: [
      { texto: "Los sulfatos abren la cutícula del pelo.", accion: "Plano medio en el baño", segundos: 4 },
      { texto: "Sin ellos, el rizo se queda definido.", accion: "Primer plano del rizo", segundos: 4 },
    ],
  });

describe.skipIf(!hayBaseDeDatos)("hooks, guion y variantes del anuncio", () => {
  let ana: Sesion;
  let beto: Sesion;
  let admin: Sesion;
  let actorAna: Actor;
  let actorBeto: Actor;
  let productoId = "";
  let ofertaId = "";
  let camaraClave = "";
  let gestoClave = "";

  const sufijo = () => randomBytes(3).toString("hex");

  beforeAll(async () => {
    await aplicarMigraciones();
    [ana, beto, admin] = await Promise.all([
      crearSesionDePrueba("user"),
      crearSesionDePrueba("user"),
      crearSesionDePrueba("admin"),
    ]);
    actorAna = { id: ana.id, esAdmin: false };
    actorBeto = { id: beto.id, esAdmin: false };

    await guardarCredencial(ana.id, "kie", CLAVE_KIE, buscar);
    // La clave de Jev es **de la instalación**: la coherencia la paga la casa, no el usuario (0.24.0).
    await guardarSecreto("typesafeApiKey", CLAVE_JEV, admin.id);
    HERRAMIENTAS_JEV.buscar = buscar;
    // El modelo de texto se marca utilizable, que es lo que hace quien administra tras probarlo de verdad.
    await db()
      .update(models)
      .set({ state: "compatible", evidence: "Simulado en el test de integración de la 0.27.0." })
      .where(eq(models.modelId, MODELO_TEXTO));
    olvidarCatalogo();
    await guardarMapa(ana.id, "texto", [{ proveedor: "kie", compatibleId: null, modelo: MODELO_TEXTO }]);
    await guardarAjustes(
      {
        presupuestoCreditos: 100_000,
        avisoCreditos: 100_000,
        anuncioBriefActivo: true,
        anuncioVariantesActivas: true,
        coherenciaAnguloFiel: "sombra",
      },
      admin.id,
    );

    const producto = await crearProducto(actorAna, {
      nombre: `Champú de rizos ${sufijo()}`,
      descripcion: "Bote blanco de 300 ml sin sulfatos.",
      tipo: "fisico",
    });
    productoId = producto.id;
    const oferta = await crearOferta(actorAna, {
      productoId,
      queSeDa: "Un bote de 300 ml que dura un mes, con su guía de uso.",
      precio: "19,90 €",
      // Garantía, urgencia y bonus **vacíos**: lo que está vacío no puede aparecer en la petición.
      garantia: "",
      urgencia: "",
      bonus: "",
    });
    ofertaId = oferta.id;

    const catalogo = await leerCatalogoDeDireccion(ana.id);
    camaraClave = [...(catalogo.get("camara")?.keys() ?? [])][0] ?? "";
    gestoClave = [...(catalogo.get("microaccion")?.keys() ?? [])][0] ?? "";
    respuestaDelModelo = propuestaDelModelo(camaraClave, gestoClave);
  });

  /** Proyecto con su brief listo para pedir guion, con el ángulo que se le pase. */
  async function proyectoConBrief(angulo: string, titulo = "Anuncio de champú") {
    const detalle = await crearProyecto(actorAna, {
      titulo: `${titulo} ${sufijo()}`,
      formato: "anuncio",
      idea: "Anuncio del champú de rizos.",
      presupuestoCreditos: 500,
    });
    const id = detalle.proyecto.id;
    await guardarBrief(actorAna, id, {
      productoId,
      ofertaId,
      angulo,
      publico: "Quien tiene el pelo rizado y ya lo ha probado todo",
      versionMejor: "Salir de casa sin pensar en el pelo",
    });
    return id;
  }

  /** Confirmación válida de una llamada, con el sello del precio vigente. */
  async function confirmacion(veces = 1) {
    const estimacion = await estimacionDeHooksYGuion(ana.id);
    return {
      claveIdempotencia: crypto.randomUUID(),
      creditosConfirmados: estimacion.creditos * veces,
      selloEstimacion: estimacion.sello,
    };
  }

  const guionDe = (proyectoId: string) =>
    db().select().from(scenes).where(eq(scenes.projectId, proyectoId)).orderBy(asc(scenes.sortOrder));

  // ── 1. La petición: qué se envía y qué no ──────────────────────────────────────────────────────────────

  describe("la petición al modelo de texto", () => {
    test("lleva el ángulo, el público, la versión mejor y la oferta, y omite los campos vacíos", async () => {
      const proyectoId = await proyectoConBrief("comodidad");
      const antes = textosPedidos.length;
      const propuesta = await proponerHooksYGuion(actorAna, proyectoId, await confirmacion(), buscar);
      expect(textosPedidos).toHaveLength(antes + 1);
      const enviado = textosPedidos[antes] ?? "";
      expect(enviado).toContain("Quien tiene el pelo rizado y ya lo ha probado todo");
      expect(enviado).toContain("Salir de casa sin pensar en el pelo");
      expect(enviado).toContain("Un bote de 300 ml que dura un mes");
      expect(enviado).toContain("19,90");
      // Lo vacío no aparece: no se le da al modelo la ocasión de inventarse una garantía.
      expect(enviado).not.toContain("Garantía");
      expect(enviado).not.toContain("Urgencia");
      // Un solo ángulo: el elegido, con su definición. Nunca la lista de los doce.
      expect(enviado).toContain("Comodidad");
      expect(enviado).not.toContain("Rompemitos");
      expect(propuesta.hooks).toHaveLength(5);
      expect(propuesta.escenasEscritas).toBe(2);
    });

    test("el guion propuesto queda escrito como borrador en las escenas del proyecto", async () => {
      const proyectoId = await proyectoConBrief("comodidad");
      await proponerHooksYGuion(actorAna, proyectoId, await confirmacion(), buscar);
      const escenas = await guionDe(proyectoId);
      expect(escenas).toHaveLength(2);
      expect(escenas[0]?.scriptText).toContain("Los sulfatos abren la cutícula");
      expect(escenas.every((e) => e.state === "borrador")).toBe(true);
    });
  });

  // ── 2. Nada se llama sin confirmación ni sin declaración ───────────────────────────────────────────────

  describe("no se gasta sin permiso", () => {
    test("sin confirmación del coste no sale ni una petición al modelo", async () => {
      const proyectoId = await proyectoConBrief("comodidad");
      const antes = textosPedidos.length;
      await expect(
        proponerHooksYGuion(actorAna, proyectoId, { claveIdempotencia: crypto.randomUUID() }, buscar),
      ).rejects.toThrow(/confirmación del coste/i);
      expect(textosPedidos).toHaveLength(antes);
    });

    test("con el sello del precio caducado se rechaza en lugar de gastar", async () => {
      const proyectoId = await proyectoConBrief("comodidad");
      const antes = textosPedidos.length;
      const { creditosConfirmados } = await confirmacion();
      await expect(
        proponerHooksYGuion(
          actorAna,
          proyectoId,
          {
            claveIdempotencia: crypto.randomUUID(),
            creditosConfirmados,
            selloEstimacion: `kie:${MODELO_TEXTO}:respuesta de texto@v99`,
          },
          buscar,
        ),
      ).rejects.toThrow(/precio/i);
      expect(textosPedidos).toHaveLength(antes);
    });

    test("en los ángulos que afirman algo comprobable, sin declaración no se pide guion y se dice qué falta", async () => {
      for (const angulo of ["mecanismo", "beneficio", "miedo-perdida", "comparacion"]) {
        const proyectoId = await proyectoConBrief(angulo);
        const antes = textosPedidos.length;
        const fallo = await proponerHooksYGuion(actorAna, proyectoId, await confirmacion(), buscar).catch(
          (e: Error) => e,
        );
        expect(fallo).toBeInstanceOf(ErrorAnuncio);
        expect((fallo as Error).message).toMatch(/declaración/i);
        // Y, sobre todo: no se ha llamado a nadie, así que no se ha cobrado nada.
        expect(textosPedidos).toHaveLength(antes);
      }
    });

    test("con la declaración registrada, el mismo ángulo ya deja pedir el guion", async () => {
      const proyectoId = await proyectoConBrief("mecanismo");
      await registrarDeclaracion(
        actorAna,
        proyectoId,
        "mecanismo",
        true,
        new Request("http://localhost/api", { method: "POST" }),
      );
      const propuesta = await proponerHooksYGuion(actorAna, proyectoId, await confirmacion(), buscar);
      expect(propuesta.hooks.length).toBeGreaterThan(0);
    });

    test("la misma confirmación no vuelve a llamar al modelo", async () => {
      const proyectoId = await proyectoConBrief("comodidad");
      const peticion = await confirmacion();
      await proponerHooksYGuion(actorAna, proyectoId, peticion, buscar);
      const tras = textosPedidos.length;
      await expect(proponerHooksYGuion(actorAna, proyectoId, peticion, buscar)).rejects.toThrow(/ya está en marcha/i);
      expect(textosPedidos).toHaveLength(tras);
    });
  });

  // ── 3. El hook es la primera frase del guion ───────────────────────────────────────────────────────────

  describe("el hook elegido", () => {
    test("se escribe como primera frase del guion y su arranque llega a la dirección, sin duplicar el dato", async () => {
      const proyectoId = await proyectoConBrief("comodidad");
      const propuesta = await proponerHooksYGuion(actorAna, proyectoId, await confirmacion(), buscar);
      const hook = propuesta.hooks[0];
      if (!hook) throw new Error("El modelo simulado tenía que proponer hooks.");
      expect(hook.camara).toBe(camaraClave);

      const aplicado = await aplicarHook(actorAna, proyectoId, {
        texto: hook.texto,
        camara: hook.camara,
        gesto: hook.gesto,
      });
      const [primera] = await guionDe(proyectoId);
      expect(primera?.scriptText.startsWith("El encrespado no es tu pelo: son los sulfatos")).toBe(true);
      expect(primera?.scriptText).toContain("Los sulfatos abren la cutícula");
      // El arranque va a las columnas de dirección que ya existen desde 0.25.0: no hay un segundo sitio.
      expect(primera?.cameraMove).toBe(camaraClave);
      expect(primera?.microAction).toBe(gestoClave);
      expect(primera?.microActionTiming).toBe("antes");
      expect(aplicado.escenaId).toBe(primera?.id ?? "");
      expect(aplicado.camara).not.toBe("");
    });

    test("aplicarlo dos veces no lo escribe dos veces", async () => {
      const proyectoId = await proyectoConBrief("comodidad");
      const propuesta = await proponerHooksYGuion(actorAna, proyectoId, await confirmacion(), buscar);
      const hook = propuesta.hooks[1];
      if (!hook) throw new Error("El modelo simulado tenía que proponer cinco hooks.");
      await aplicarHook(actorAna, proyectoId, { texto: hook.texto });
      await aplicarHook(actorAna, proyectoId, { texto: hook.texto });
      const [primera] = await guionDe(proyectoId);
      const veces = (primera?.scriptText.match(/Llevas años tratando el síntoma/g) ?? []).length;
      expect(veces).toBe(1);
    });

    test("un movimiento que no está en el catálogo se trata como no elegido", async () => {
      const proyectoId = await proyectoConBrief("comodidad");
      await proponerHooksYGuion(actorAna, proyectoId, await confirmacion(), buscar);
      const aplicado = await aplicarHook(actorAna, proyectoId, {
        texto: "Un hook escrito a mano.",
        camara: "zoom-imposible",
      });
      const [primera] = await guionDe(proyectoId);
      expect(primera?.cameraMove).toBe("");
      expect(aplicado.camara).toBe("");
    });

    test("sin ninguna escena no hay guion que encabezar, y se dice", async () => {
      const proyectoId = await proyectoConBrief("comodidad");
      await expect(aplicarHook(actorAna, proyectoId, { texto: "Un hook." })).rejects.toThrow(/ninguna escena/i);
    });
  });

  // ── 4. Variantes por ángulo ────────────────────────────────────────────────────────────────────────────

  describe("las variantes por ángulo", () => {
    test("crean N proyectos hermanos con el mismo grupo, la misma oferta y ángulos distintos", async () => {
      const proyectoId = await proyectoConBrief("comodidad", "Campaña de rizos");
      const estimacion = await estimarVariantes(actorAna, proyectoId);
      // El ángulo que ya tiene el proyecto de partida no se ofrece: sería el mismo anuncio dos veces.
      expect(estimacion.angulos.find((a) => a.angulo.clave === "comodidad")?.elegible).toBe(false);

      const angulos = ["problema-dolor", "identidad", "estatus"];
      const creadas = await crearVariantes(
        actorAna,
        proyectoId,
        { angulos, ...(await confirmacion(angulos.length)) },
        new Request("http://localhost/api", { method: "POST" }),
        buscar,
      );
      expect(creadas.variantes).toHaveLength(3);
      expect(creadas.variantes.every((v) => v.error === "")).toBe(true);

      const hermanos = await db()
        .select()
        .from(projects)
        .where(eq(projects.variantGroupId, creadas.grupoId))
        .orderBy(asc(projects.createdAt));
      // Cuatro: los tres hermanos nuevos y el proyecto de partida, que es el primero de su propio grupo.
      expect(hermanos).toHaveLength(4);
      expect(new Set(hermanos.map((h) => h.anglePresetKey)).size).toBe(4);

      const briefs = await db()
        .select()
        .from(adBriefs)
        .where(and(eq(adBriefs.productId, productoId), eq(adBriefs.offerId, ofertaId)));
      // Los hermanos comparten producto y oferta, y cada uno guarda **su** ángulo.
      for (const variante of creadas.variantes) {
        const suyo = briefs.find((b) => b.projectId === variante.proyectoId);
        expect(suyo?.offerId).toBe(ofertaId);
        expect(suyo?.productId).toBe(productoId);
        expect(suyo?.anglePresetKey).toBe(variante.angulo);
        // Y cada una tiene su guion escrito, solo texto: ningún clip se ha generado.
        expect(variante.propuesta?.escenasEscritas).toBe(2);
      }
    });

    test("la confirmación es una sola y agregada: confirmar el coste de una sola variante se rechaza", async () => {
      const proyectoId = await proyectoConBrief("comodidad", "Campaña con coste mal confirmado");
      const antes = textosPedidos.length;
      const proyectosAntes = await db().select({ id: projects.id }).from(projects).where(eq(projects.userId, ana.id));
      await expect(
        crearVariantes(
          actorAna,
          proyectoId,
          { angulos: ["problema-dolor", "identidad"], ...(await confirmacion(1)) },
          new Request("http://localhost/api", { method: "POST" }),
          buscar,
        ),
      ).rejects.toThrow(/coste estimado/i);
      expect(textosPedidos).toHaveLength(antes);
      // Y no se ha creado ningún hermano: la confirmación se comprueba antes de escribir nada.
      const proyectosDespues = await db().select({ id: projects.id }).from(projects).where(eq(projects.userId, ana.id));
      expect(proyectosDespues).toHaveLength(proyectosAntes.length);
    });

    test("un ángulo que exige declaración pide declararla, y al declararla queda registrada por variante", async () => {
      const proyectoId = await proyectoConBrief("comodidad", "Campaña con claims");
      const sinDeclarar = await crearVariantes(
        actorAna,
        proyectoId,
        { angulos: ["mecanismo"], ...(await confirmacion(1)) },
        new Request("http://localhost/api", { method: "POST" }),
        buscar,
      ).catch((e: Error) => e);
      expect((sinDeclarar as Error).message).toMatch(/declarar/i);

      const creadas = await crearVariantes(
        actorAna,
        proyectoId,
        { angulos: ["mecanismo"], declaraVeracidad: true, ...(await confirmacion(1)) },
        new Request("http://localhost/api", { method: "POST" }),
        buscar,
      );
      const variante = creadas.variantes[0];
      expect(variante?.error).toBe("");
      const [declaracion] = await db()
        .select()
        .from(sensitiveClaimDeclarations)
        .where(eq(sensitiveClaimDeclarations.projectId, variante?.proyectoId ?? ""));
      expect(declaracion?.anglePresetKey).toBe("mecanismo");
      expect(declaracion?.acceptedText.length).toBeGreaterThan(20);
    });

    test("con las variantes apagadas en Admin no se crea ninguna, y se dice quién lo enciende", async () => {
      const proyectoId = await proyectoConBrief("comodidad", "Campaña apagada");
      await guardarAjustes({ anuncioVariantesActivas: false }, admin.id);
      try {
        await expect(estimarVariantes(actorAna, proyectoId)).rejects.toThrow(/Admin/);
      } finally {
        await guardarAjustes({ anuncioVariantesActivas: true }, admin.id);
      }
    });
  });

  // ── 5. `angulo_fiel` de Jev, en sombra ─────────────────────────────────────────────────────────────────

  describe("lo que se ha pagado no se pierde ni se deja a medias", () => {
    test("los hooks pagados quedan guardados en el proyecto antes de responder", async () => {
      const proyectoId = await proyectoConBrief("comodidad", "Hooks guardados");
      expect(await hooksGuardadosDe(proyectoId)).toBeNull();
      const propuesta = await proponerHooksYGuion(actorAna, proyectoId, await confirmacion(), buscar);
      const guardados = await hooksGuardadosDe(proyectoId);
      expect(guardados?.hooks.map((h) => h.texto)).toEqual(propuesta.hooks.map((h) => h.texto));
    });

    test("una variante cuya respuesta no sirve no deja un hermano vacío en la lista", async () => {
      const proyectoId = await proyectoConBrief("comodidad", "Variante que falla");
      const buena = respuestaDelModelo;
      respuestaDelModelo = "esto no es una propuesta";
      try {
        const creadas = await crearVariantes(
          actorAna,
          proyectoId,
          { angulos: ["identidad"], ...(await confirmacion(1)) },
          new Request("http://localhost/api", { method: "POST" }),
          buscar,
        );
        expect(creadas.variantes[0]?.error).not.toBe("");
        expect(creadas.variantes[0]?.proyectoId).toBe("");
        const del = await db().select().from(projects).where(eq(projects.variantGroupId, creadas.grupoId));
        // Solo queda el proyecto de partida: el hermano sin guion no se deja.
        expect(del.map((p) => p.id)).toEqual([proyectoId]);
      } finally {
        respuestaDelModelo = buena;
      }
    });

    test("el asistente de guion de siempre tampoco escribe un ángulo que exige declaración sin declararlo", async () => {
      const proyectoId = await proyectoConBrief("mecanismo", "Ruta clásica");
      const antes = textosPedidos.length;
      await expect(
        escribirGuion(
          actorAna,
          proyectoId,
          { claveIdempotencia: crypto.randomUUID(), creditosConfirmados: 0, selloEstimacion: "" },
          buscar,
        ),
      ).rejects.toThrow(/declaración/i);
      expect(textosPedidos).toHaveLength(antes);
    });
  });

  describe("el veredicto del ángulo", () => {
    test("registra veredicto, evidencia y confianza, y en sombra no bloquea nada", async () => {
      const proyectoId = await proyectoConBrief("comodidad");
      await proponerHooksYGuion(actorAna, proyectoId, await confirmacion(), buscar);
      respuestaDeJev = fixtures.JEV_ANGULO_FIEL;

      const { decision, motivo } = await comprobarAnguloDelAnuncio(actorAna, proyectoId);
      expect(motivo).toBe("");
      expect(decision?.veredicto).toBe("pasa");
      expect(decision?.modo).toBe("sombra");
      expect(decision?.confianza).toBeGreaterThan(0.8);
      expect(decision?.evidencia).toContain("responde al ángulo elegido");
      // Lo que se miró queda guardado con el veredicto: un veredicto sin evidencia no se puede discutir.
      expect(decision?.evidencia).toContain("Lo que se miró");

      const [fila] = await db()
        .select()
        .from(coherenceDecisions)
        .where(and(eq(coherenceDecisions.projectId, proyectoId), eq(coherenceDecisions.check, "angulo_fiel")));
      expect(fila?.subject).toBe("proyecto");
      expect(fila?.subjectId).toBe(proyectoId);
      expect(fila?.mode).toBe("sombra");
      expect(await anguloFielGuardadoDe(actorAna, proyectoId)).not.toBeNull();
    });

    test("un guion que mezcla dos ángulos sale negativo y la evidencia lo dice, y aun así no bloquea", async () => {
      const proyectoId = await proyectoConBrief("comodidad");
      await proponerHooksYGuion(actorAna, proyectoId, await confirmacion(), buscar);
      respuestaDeJev = fixtures.JEV_ANGULO_MEZCLA;

      const { decision } = await comprobarAnguloDelAnuncio(actorAna, proyectoId);
      expect(decision?.veredicto).toBe("no_pasa");
      expect(decision?.evidencia).toContain("mezcla");
      // **Sombra quiere decir sombra**: la puerta del guion sigue abierta y nada se ha invalidado.
      expect((await puedePedirGuion(proyectoId)).puede).toBe(true);
      const escenas = await guionDe(proyectoId);
      expect(escenas.every((e) => e.invalidationReason === "")).toBe(true);
    });

    test("sin guion escrito no hay nada que comparar, y se dice en lugar de preguntar", async () => {
      const proyectoId = await proyectoConBrief("comodidad");
      const { decision, motivo } = await comprobarAnguloDelAnuncio(actorAna, proyectoId);
      expect(decision).toBeNull();
      expect(motivo).toMatch(/guion/i);
    });

    test("con la comprobación apagada no se pregunta nada y se dice quién la enciende", async () => {
      const proyectoId = await proyectoConBrief("comodidad");
      await guardarAjustes({ coherenciaAnguloFiel: "apagada" }, admin.id);
      try {
        const { decision, motivo } = await comprobarAnguloDelAnuncio(actorAna, proyectoId);
        expect(decision).toBeNull();
        expect(motivo).toContain("Admin");
      } finally {
        await guardarAjustes({ coherenciaAnguloFiel: "sombra" }, admin.id);
      }
    });
  });

  // ── 6. Autorización ───────────────────────────────────────────────────────────────────────────────────

  describe("nadie usa el anuncio de otra persona", () => {
    test("pedir hooks, elegir hook, crear variantes o comprobar el ángulo de un proyecto ajeno responde 404", async () => {
      const proyectoId = await proyectoConBrief("comodidad", "De Ana y solo de Ana");
      const antes = textosPedidos.length;
      for (const intento of [
        () => proponerHooksYGuion(actorBeto, proyectoId, { claveIdempotencia: crypto.randomUUID() }, buscar),
        () => aplicarHook(actorBeto, proyectoId, { texto: "Mío ahora." }),
        () => estimarVariantes(actorBeto, proyectoId),
        () => comprobarAnguloDelAnuncio(actorBeto, proyectoId),
      ]) {
        const fallo = await intento().catch((e: Error) => e);
        expect((fallo as { estado?: number }).estado).toBe(404);
      }
      expect(textosPedidos).toHaveLength(antes);
    });

    test("un proyecto sin brief sigue funcionando como antes de esta versión", async () => {
      const detalle = await crearProyecto(actorAna, {
        titulo: `Sin brief ${sufijo()}`,
        formato: "reel_vertical",
        idea: "Una idea escrita a mano.",
      });
      // La puerta deja pasar (el brief es opcional) y lo que no se puede es pedir *hooks*, porque no hay ángulo.
      expect((await puedePedirGuion(detalle.proyecto.id)).puede).toBe(true);
      const fallo = await proponerHooksYGuion(actorAna, detalle.proyecto.id, await confirmacion(), buscar).catch(
        (e: Error) => e,
      );
      expect((fallo as Error).message).toMatch(/no tiene brief/i);
    });
  });

  /**
   * La suite comparte conexión y proceso, así que el modelo de texto se deja `descubierto` y Jev sin simulador,
   * que es como vienen de fábrica: si no, la suite siguiente heredaría un catálogo que nadie ha probado.
   */
  afterAll(async () => {
    HERRAMIENTAS_JEV.buscar = undefined;
    await db().update(models).set({ state: "descubierto" }).where(eq(models.modelId, MODELO_TEXTO));
    olvidarCatalogo();
    for (const sesion of [ana, beto, admin]) await db().delete(users).where(eq(users.id, sesion.id));
  });
});
