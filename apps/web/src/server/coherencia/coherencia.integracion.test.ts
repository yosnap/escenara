import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";
import type { PersonajeVista } from "@/lib/personajes";

/**
 * Identidad en **modo activo** (0.24.0), de punta a punta y sin llamar a nadie: la percepción la contesta un
 * servicio compatible simulado con sus respuestas grabadas, y Jev también.
 *
 * Lo que fija, que es justo lo que pidió el propietario el 2026-09-28:
 *
 * - una vista generada que Jev da por la misma persona **cubre** en un personaje real;
 * - una que no, **no cubre** y dice por qué;
 * - sin la declaración de coherencia en el consentimiento **no sale ni un byte** de la cara de esa persona;
 * - la percepción se apunta con **0 créditos** (se paga por cuota del plan) y no toca el presupuesto;
 * - un fallo de Jev no cambia el veredicto que hubiera: no se quita cobertura por una avería.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_coherencia");
}

const { and, eq } = await import("drizzle-orm");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const {
  characterReferences,
  coherenceDecisions,
  consentRecords,
  projects,
  rateLimits,
  sceneCharacters,
  scenes,
  usageLedger,
  users,
} = await import("../db/esquema");
const { productReferences, products } = await import("../db/esquema-productos");
const { comprobarEscena } = await import("./escena");
const { borrarProyecto } = await import("../asistente/proyectos");
const { crearMedio } = await import("../media/servicio");
const { guardarAjustes, olvidarAjustes } = await import("../ajustes");
const { guardarSecreto } = await import("../boveda/secretos");
const { guardarCompatible } = await import("../boveda/compatibles");
const { coberturaDe, filaPropia } = await import("../personajes/consulta");
const { HERRAMIENTAS_PERCEPCION } = await import("./percepcion");
const { HERRAMIENTAS_JEV } = await import("./decidir");
const rutaPersonajes = await import("@/app/api/personajes/route");
const rutaReferencias = await import("@/app/api/personajes/[id]/referencias/route");
const rutaConsentimiento = await import("@/app/api/personajes/[id]/consentimiento/route");
const rutaIdentidad = await import("@/app/api/personajes/[id]/identidad/route");
const fixtures = await import("./fixtures");
const fixturesCompatibles = await import("../proveedores/compatible/fixtures");
type Actor = import("../media/servicio").Actor;

const CLAVE_NAN = "sk-nan-clave-de-ana-inventada-1234";
const CLAVE_JEV = "ts-clave-de-la-instalacion-1234";
const BASE_NAN = "https://api.nan.builders/v1";

/** Lo que contesta Jev en la siguiente decisión. Cada test lo cambia. */
let respuestaDeJev: unknown = fixtures.JEV_IDENTIDAD_SI;
let estadoDeJev = 200;
let llamadasAJev = 0;
let llamadasDePercepcion = 0;

/**
 * Simulación de los dos servicios. **No se toca el `fetch` global**: en Bun es del proceso entero y se colaría en
 * las demás suites. Se inyecta por los dos puntos que existen para eso, uno por servicio.
 *
 * Cualquier URL no simulada revienta el test a propósito: una llamada de verdad en una suite es un error.
 */
const buscar = (async (entrada: string | URL | Request, _opciones?: RequestInit) => {
  const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url;
  if (url.startsWith("https://api.typesafe.ai/")) {
    if (url.endsWith("/models")) return fixtures.respuestaGrabada(fixtures.JEV_MODELOS_200);
    llamadasAJev++;
    return fixtures.respuestaGrabada(respuestaDeJev, estadoDeJev);
  }
  if (url.startsWith(BASE_NAN)) {
    if (url.endsWith("/models")) return fixturesCompatibles.respuestaGrabada(fixturesCompatibles.MODELOS_200);
    llamadasDePercepcion++;
    return fixtures.respuestaGrabada(fixtures.PERCEPCION_CARA);
  }
  throw new Error(`URL no simulada: ${url}`);
}) as unknown as typeof fetch;

function bytes(datos: Uint8Array): Uint8Array<ArrayBuffer> {
  const copia = new Uint8Array(new ArrayBuffer(datos.byteLength));
  copia.set(datos);
  return copia;
}

/** Foto que pasa el control de calidad de 0.14.0: 640 × 640 con ruido, así que cada una tiene su huella. */
async function foto(): Promise<Uint8Array<ArrayBuffer>> {
  return bytes(
    await sharp({
      create: {
        width: 640,
        height: 640,
        channels: 3,
        background: "#808080",
        noise: { type: "gaussian", mean: 128, sigma: 40 },
      },
    })
      .png()
      .toBuffer(),
  );
}

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;
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

describe.skipIf(!hayBaseDeDatos)("identidad en modo activo", () => {
  let ana: Sesion;
  let actor: Actor;

  beforeAll(async () => {
    await aplicarMigraciones();
    await db().delete(users);
    ana = await crearSesionDePrueba("user");
    actor = { id: ana.id, esAdmin: false };
    // La clave de Jev es **de la instalación**, no de Ana: es una regla de la casa, no una generación suya.
    await guardarSecreto("typesafeApiKey", CLAVE_JEV, null);
    // El servicio que ve: se paga por cuota del plan, así que su llamada apunta 0 créditos.
    // El cliente de los servicios compatibles fija la IP comprobada, así que no pasa por `fetch`: su simulación
    // se inyecta por el punto que existe para eso.
    HERRAMIENTAS_PERCEPCION.buscar = buscar;
    HERRAMIENTAS_JEV.buscar = buscar;
    await guardarCompatible(
      actor.id,
      {
        nombre: "NaN builders",
        urlBase: BASE_NAN,
        clave: CLAVE_NAN,
        modelos: ["gemma4"],
        soloCuota: true,
      },
      buscar,
    );
    await guardarAjustes({ coherenciaIdentidad: "activa", coherenciaUmbralIdentidad: 0.75 }, null);
    olvidarAjustes();
  });

  beforeEach(() => {
    respuestaDeJev = fixtures.JEV_IDENTIDAD_SI;
    estadoDeJev = 200;
    llamadasAJev = 0;
    llamadasDePercepcion = 0;
  });

  /** Personaje real de Ana con una foto original y una «vista generada» ya adjuntada como referencia. */
  async function personajeConVistaGenerada(nombre: string, declaraCoherencia: boolean) {
    const creada = await rutaPersonajes.POST(
      pedir(ana, "/api/personajes", "POST", {
        nombre: `${nombre} ${crypto.randomUUID().slice(0, 6)}`,
        tipo: "persona",
      }),
      undefined,
    );
    const personaje = (await creada.json()) as PersonajeVista;
    const original = await crearMedio(actor, new File([await foto()], `${nombre}-original.png`, { type: "image/png" }));
    await rutaReferencias.POST(
      pedir(ana, `/api/personajes/${personaje.id}/referencias`, "POST", {
        referencias: [{ medioId: original.id, vistaClave: "perfil_izquierdo" }],
      }),
      ctx(personaje.id),
    );
    await rutaConsentimiento.POST(
      pedir(ana, `/api/personajes/${personaje.id}/consentimiento`, "POST", {
        titular: "yo",
        mayoriaDeEdad: true,
        coherencia: declaraCoherencia,
        alcance: "personal",
      }),
      ctx(personaje.id),
    );
    // La vista generada se adjunta como la adjunta el worker: origen `vista_generada` y su vista ya puesta.
    const generada = await crearMedio(actor, new File([await foto()], `${nombre}-frontal.png`, { type: "image/png" }));
    const [referencia] = await db()
      .insert(characterReferences)
      .values({
        characterId: personaje.id,
        mediaId: generada.id,
        origin: "vista_generada",
        viewKey: "frontal",
        declaredView: "De frente",
        sortOrder: 10,
      })
      .returning();
    return { personajeId: personaje.id, referenciaId: referencia?.id ?? "" };
  }

  const comprobar = async (personajeId: string, referenciaId: string) =>
    (await (
      await rutaIdentidad.POST(
        pedir(ana, `/api/personajes/${personajeId}/identidad`, "POST", { referenciaId }),
        ctx(personajeId),
      )
    ).json()) as { comprobada: boolean; motivo: string; veredicto: string | null; evidencia: string };

  test("una vista que Jev da por la misma persona cubre en un personaje real", async () => {
    const { personajeId, referenciaId } = await personajeConVistaGenerada("Elisa", true);
    const antes = await coberturaDe(personajeId, "persona");
    expect(antes.faltan).toContain("frontal");

    const resultado = await comprobar(personajeId, referenciaId);
    expect(resultado.comprobada).toBe(true);
    expect(resultado.veredicto).toBe("pasa");
    // Dos caras, dos percepciones: la generada y la de referencia, descritas por separado.
    expect(llamadasDePercepcion).toBe(2);
    expect(llamadasAJev).toBe(1);

    const despues = await coberturaDe(personajeId, "persona");
    expect(despues.faltan).not.toContain("frontal");
  });

  test("una vista que no pasa no cubre y dice por qué", async () => {
    respuestaDeJev = fixtures.JEV_IDENTIDAD_NO;
    const { personajeId, referenciaId } = await personajeConVistaGenerada("Marta", true);

    const resultado = await comprobar(personajeId, referenciaId);
    expect(resultado.veredicto).toBe("no_pasa");
    // La evidencia nunca está vacía: un veredicto que no se puede discutir no sirve de nada.
    expect(resultado.evidencia).not.toBe("");
    expect(resultado.evidencia).toContain("misma persona");

    const cobertura = await coberturaDe(personajeId, "persona");
    expect(cobertura.faltan).toContain("frontal");
    const [fila] = await db()
      .select()
      .from(characterReferences)
      .where(eq(characterReferences.id, referenciaId))
      .limit(1);
    expect(fila?.identityVerdict).toBe("no_pasa");
    expect(fila?.identityReason).not.toBe("");
  });

  test("sin la declaración del consentimiento no sale la cara de nadie", async () => {
    const { personajeId, referenciaId } = await personajeConVistaGenerada("Lucía", false);

    const resultado = await comprobar(personajeId, referenciaId);
    expect(resultado.comprobada).toBe(false);
    expect(resultado.motivo).toContain("consentimiento");
    // Ni percepción ni decisión: la puerta está **antes** de leer un solo byte.
    expect(llamadasDePercepcion).toBe(0);
    expect(llamadasAJev).toBe(0);
    expect((await coberturaDe(personajeId, "persona")).faltan).toContain("frontal");
  });

  test("la percepción se apunta con 0 créditos, porque se paga por cuota del plan", async () => {
    const { personajeId, referenciaId } = await personajeConVistaGenerada("Nuria", true);
    await comprobar(personajeId, referenciaId);

    const apuntes = await db()
      .select()
      .from(usageLedger)
      .where(and(eq(usageLedger.userId, actor.id), eq(usageLedger.provider, "compatible")));
    expect(apuntes.length).toBeGreaterThan(0);
    for (const apunte of apuntes) {
      expect(apunte.credits).toBe(0);
      expect(apunte.amountEur).toBe(0);
    }
  });

  test("un fallo de Jev no decide ni quita la cobertura que ya había", async () => {
    const { personajeId, referenciaId } = await personajeConVistaGenerada("Sara", true);
    // Primero pasa, así que la vista cubre.
    await comprobar(personajeId, referenciaId);
    expect((await coberturaDe(personajeId, "persona")).faltan).not.toContain("frontal");

    // Y ahora Jev rechaza la clave: no hay veredicto, y lo que había **no se toca**.
    respuestaDeJev = fixtures.JEV_401;
    estadoDeJev = 401;
    const resultado = await comprobar(personajeId, referenciaId);
    expect(resultado.comprobada).toBe(false);
    expect(resultado.motivo).toContain("TypeSafe");
    expect((await coberturaDe(personajeId, "persona")).faltan).not.toContain("frontal");
  });

  test("cada decisión queda registrada con su evidencia, su confianza y su umbral", async () => {
    const { personajeId, referenciaId } = await personajeConVistaGenerada("Iris", true);
    await comprobar(personajeId, referenciaId);

    const [decision] = await db()
      .select()
      .from(coherenceDecisions)
      .where(eq(coherenceDecisions.subjectId, referenciaId))
      .limit(1);
    expect(decision?.check).toBe("identidad");
    expect(decision?.mode).toBe("activa");
    expect(decision?.evidence).not.toBe("");
    expect(decision?.facts).not.toBe("");
    expect(decision?.threshold).toBeCloseTo(0.75, 3);
    expect(decision?.decisionModel).toBe("jev-1.13.0");
    expect(decision?.perceptionModel).toBe("gemma4");
    // Sin corrección todavía: la etiqueta la pone una persona, y es de lo que sale el panel de acierto.
    expect(decision?.correction).toBeNull();
  });

  test("con la comprobación apagada no se llama a nadie", async () => {
    await guardarAjustes({ coherenciaIdentidad: "apagada" }, null);
    olvidarAjustes();
    try {
      const { personajeId, referenciaId } = await personajeConVistaGenerada("Olga", true);
      const resultado = await comprobar(personajeId, referenciaId);
      expect(resultado.comprobada).toBe(false);
      expect(llamadasDePercepcion).toBe(0);
      expect(llamadasAJev).toBe(0);
    } finally {
      await guardarAjustes({ coherenciaIdentidad: "activa" }, null);
      olvidarAjustes();
    }
  });

  test("el consentimiento guarda la declaración de coherencia tal como se marcó", async () => {
    const { personajeId } = await personajeConVistaGenerada("Rocío", true);
    const personaje = await filaPropia(actor, personajeId);
    const [consentimiento] = await db()
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.characterId, personaje.id))
      .limit(1);
    expect(consentimiento?.coherenceDeclared).toBe(true);
  });
  test("sin la declaración, la escena no manda ni el fotograma ni la voz", async () => {
    const { personajeId } = await personajeConVistaGenerada("Beatriz", false);
    const fotograma = await crearMedio(actor, new File([await foto()], "fotograma.png", { type: "image/png" }));
    const [proyecto] = await db()
      .insert(projects)
      .values({ userId: actor.id, title: "Sin declaración", mainCharacterId: personajeId })
      .returning();
    const [escena] = await db()
      .insert(scenes)
      .values({ projectId: proyecto?.id ?? "", sortOrder: 0, approvedFrameMediaId: fotograma.id })
      .returning();

    const resultado = await comprobarEscena(actor, escena?.id);
    const motivo = resultado.sinComprobar.find((s) => s.comprobacion === "resultado")?.motivo ?? "";
    expect(motivo).toContain("consentimiento");
    expect(llamadasDePercepcion).toBe(0);
  });

  /**
   * **`producto_fiel` en sombra** (0.26.0): se registra con su evidencia y **no bloquea nada**. Es la misma
   * puerta de consentimiento, el mismo tope diario y el mismo registro que el resto desde la 0.24.0.
   */
  test("producto_fiel se registra en sombra, con su evidencia, y no bloquea nada", async () => {
    const { personajeId } = await personajeConVistaGenerada("Olivia", true);
    const fotograma = await crearMedio(actor, new File([await foto()], "fotograma.png", { type: "image/png" }));
    const frontal = await crearMedio(actor, new File([await foto()], "frontal-bote.png", { type: "image/png" }));
    const [producto] = await db()
      .insert(products)
      .values({
        ownerId: actor.id,
        name: "Crema Aurora",
        description: "Bote blanco con tapón dorado y etiqueta negra.",
        kind: "fisico",
        brandVisible: true,
      })
      .returning();
    await db()
      .insert(productReferences)
      .values({ productId: producto?.id ?? "", mediaId: frontal.id, kind: "etiqueta", sortOrder: 1 });
    const [proyecto] = await db()
      .insert(projects)
      .values({ userId: actor.id, title: "Con producto", mainCharacterId: personajeId })
      .returning();
    const [escena] = await db()
      .insert(scenes)
      .values({
        projectId: proyecto?.id ?? "",
        sortOrder: 0,
        approvedFrameMediaId: fotograma.id,
        productId: producto?.id ?? null,
        productAction: "ensenarlo-a-camara",
      })
      .returning();

    const resultado = await comprobarEscena(actor, escena?.id);
    const veredicto = resultado.decisiones.find((d) => d.comprobacion === "producto_fiel");
    expect(veredicto).toBeDefined();
    expect(veredicto?.modo).toBe("sombra");
    expect(veredicto?.veredicto).toBe("pasa");
    expect(veredicto?.evidencia).toContain("mismo producto");

    // Dos percepciones distintas: lo generado y la foto del producto, descritas por separado.
    const [decision] = await db()
      .select()
      .from(coherenceDecisions)
      .where(and(eq(coherenceDecisions.subjectId, escena?.id ?? ""), eq(coherenceDecisions.check, "producto_fiel")))
      .limit(1);
    expect(decision?.mode).toBe("sombra");
    expect(decision?.facts).not.toBe("");
    expect(decision?.evidence).not.toBe("");
  });

  test("sin fotos del producto, producto_fiel dice por qué no se ha comprobado y no llama a nadie", async () => {
    const { personajeId } = await personajeConVistaGenerada("Pilar", true);
    const fotograma = await crearMedio(actor, new File([await foto()], "fotograma2.png", { type: "image/png" }));
    const [producto] = await db()
      .insert(products)
      .values({ ownerId: actor.id, name: "Sin fotos", description: "", kind: "fisico", brandVisible: false })
      .returning();
    const [proyecto] = await db()
      .insert(projects)
      .values({ userId: actor.id, title: "Sin fotos del producto", mainCharacterId: personajeId })
      .returning();
    const [escena] = await db()
      .insert(scenes)
      .values({
        projectId: proyecto?.id ?? "",
        sortOrder: 0,
        approvedFrameMediaId: fotograma.id,
        productId: producto?.id ?? null,
        productAction: "sostenerlo",
      })
      .returning();

    const resultado = await comprobarEscena(actor, escena?.id);
    const motivo = resultado.sinComprobar.find((s) => s.comprobacion === "producto_fiel")?.motivo ?? "";
    expect(motivo).toContain("foto de referencia");
    expect(resultado.decisiones.some((d) => d.comprobacion === "producto_fiel")).toBe(false);
  });

  test("revocar el consentimiento retira el veredicto y la vista deja de cubrir", async () => {
    const { personajeId, referenciaId } = await personajeConVistaGenerada("Carmen", true);
    await comprobar(personajeId, referenciaId);
    expect((await coberturaDe(personajeId, "persona")).faltan).not.toContain("frontal");

    await rutaConsentimiento.DELETE(
      pedir(ana, `/api/personajes/${personajeId}/consentimiento`, "DELETE", { motivo: "Ya no quiero." }),
      ctx(personajeId),
    );
    const [fila] = await db()
      .select()
      .from(characterReferences)
      .where(eq(characterReferences.id, referenciaId))
      .limit(1);
    expect(fila?.identityVerdict).toBe("sin_comprobar");
  });

  test("con el tope diario agotado no se llama a Jev y se dice que no se ha cobrado", async () => {
    await guardarAjustes({ coherenciaDecisionesPorDia: 1 }, null);
    olvidarAjustes();
    try {
      const { personajeId, referenciaId } = await personajeConVistaGenerada("Diana", true);
      const resultado = await comprobar(personajeId, referenciaId);
      expect(resultado.comprobada).toBe(false);
      expect(resultado.motivo).toContain("tope");
      expect(llamadasAJev).toBe(0);
    } finally {
      await guardarAjustes({ coherenciaDecisionesPorDia: 60 }, null);
      olvidarAjustes();
    }
  });

  /**
   * **La cara de cada personaje contra su propia referencia** (0.28.0). Con dos personajes en el plano no basta una
   * comprobación: se hace **una por cada uno**, con la referencia de ese personaje y con el lado del cuadro en el
   * que se le pidió salir, para que el veredicto pueda decir **cuál** de las dos caras no cuadra.
   */
  test("la identidad se evalúa contra la referencia de cada personaje del reparto", async () => {
    // Esta suite crea unos cuantos personajes: el ritmo de escritura se limpia para que no corte el alta de estos.
    await db().delete(rateLimits);
    const primera = await personajeConVistaGenerada("Rosa", true);
    const segunda = await personajeConVistaGenerada("Sara", true);
    const fotograma = await crearMedio(actor, new File([await foto()], "dualcast.png", { type: "image/png" }));
    const [proyecto] = await db()
      .insert(projects)
      .values({ userId: actor.id, title: "Dualcast", mainCharacterId: primera.personajeId })
      .returning();
    const [escena] = await db()
      .insert(scenes)
      .values({
        projectId: proyecto?.id ?? "",
        sortOrder: 0,
        approvedFrameMediaId: fotograma.id,
        castFormat: "dualcast",
      })
      .returning();
    await db()
      .insert(sceneCharacters)
      .values([
        {
          sceneId: escena?.id ?? "",
          characterId: primera.personajeId,
          role: "hablante",
          side: "izquierda",
          gazeDirection: "camara",
          sortOrder: 1,
        },
        {
          sceneId: escena?.id ?? "",
          characterId: segunda.personajeId,
          role: "acompanante",
          side: "derecha",
          gazeDirection: "camara",
          sortOrder: 2,
        },
      ]);

    const resultado = await comprobarEscena(actor, escena?.id);
    const identidades = resultado.decisiones.filter((d) => d.comprobacion === "identidad");
    expect(identidades).toHaveLength(2);
    // Cada una dice de quién habla y por qué lado del plano: sin eso serían dos filas iguales.
    expect(identidades.map((d) => d.sobre).join(" | ")).toContain("a la izquierda del plano");
    expect(identidades.map((d) => d.sobre).join(" | ")).toContain("a la derecha del plano");
    const guardadas = await db()
      .select()
      .from(coherenceDecisions)
      .where(and(eq(coherenceDecisions.subjectId, escena?.id ?? ""), eq(coherenceDecisions.check, "identidad")));
    expect(new Set(guardadas.map((d) => d.characterId))).toEqual(new Set([primera.personajeId, segunda.personajeId]));
  });

  /**
   * **`reparto_fiel` en sombra** (0.28.0): registra su veredicto con su evidencia y **no bloquea nada**. Aquí se
   * pregunta directamente a Jev porque escuchar el clip de verdad necesita convertir su audio, y lo que esta prueba
   * tiene que fijar es la pregunta, el registro y que en sombra no decide.
   */
  test("reparto_fiel registra su veredicto y su evidencia, y en sombra no decide nada", async () => {
    respuestaDeJev = fixtures.JEV_REPARTO_HABLA_OTRO;
    await guardarAjustes({ coherenciaRepartoFiel: "sombra" }, null);
    olvidarAjustes();
    const { decidirCoherencia } = await import("./decidir");
    const [proyecto] = await db().insert(projects).values({ userId: actor.id, title: "Reparto" }).returning();
    const [escena] = await db()
      .insert(scenes)
      .values({ projectId: proyecto?.id ?? "", sortOrder: 0, castFormat: "podcast" })
      .returning();

    const decision = await decidirCoherencia({
      usuarioId: actor.id,
      comprobacion: "reparto_fiel",
      sujeto: { tipo: "escena", id: escena?.id ?? "", proyectoId: proyecto?.id ?? "" },
      percepcion: {
        hechos: "Two voices. first voice: «hola». second voice: «hola».",
        proveedor: "NaN",
        modelo: "mimo",
      },
      referencia: { cast_format: "podcast", requested_turns: '1. Rosa: "hola"' },
    });

    expect(decision.modo).toBe("sombra");
    // En sombra hay veredicto y **no decide**: es lo que permite medir su acierto antes de darle poder.
    expect(decision.decide).toBe(false);
    expect(decision.veredicto).toBe("no_pasa");
    expect(decision.evidencia).toContain("habla alguien que no tenía turno");
    const [guardada] = await db()
      .select()
      .from(coherenceDecisions)
      .where(and(eq(coherenceDecisions.subjectId, escena?.id ?? ""), eq(coherenceDecisions.check, "reparto_fiel")))
      .limit(1);
    expect(guardada?.mode).toBe("sombra");
    expect(guardada?.evidence).not.toBe("");
  });

  test("en una escena de un personaje, reparto_fiel dice por qué no se comprueba y no llama a nadie", async () => {
    await db().delete(rateLimits);
    const { personajeId } = await personajeConVistaGenerada("Teresa", true);
    const [proyecto] = await db()
      .insert(projects)
      .values({ userId: actor.id, title: "Un personaje", mainCharacterId: personajeId })
      .returning();
    const [escena] = await db()
      .insert(scenes)
      .values({ projectId: proyecto?.id ?? "", sortOrder: 0 })
      .returning();

    const resultado = await comprobarEscena(actor, escena?.id);
    const motivo = resultado.sinComprobar.find((s) => s.comprobacion === "reparto_fiel")?.motivo ?? "";
    expect(motivo).toContain("un solo personaje");
    expect(resultado.decisiones.some((d) => d.comprobacion === "reparto_fiel")).toBe(false);
  });

  test("borrar el proyecto olvida lo percibido de sus escenas y conserva el veredicto", async () => {
    const [proyecto] = await db().insert(projects).values({ userId: actor.id, title: "Para borrar" }).returning();
    const proyectoId = proyecto?.id ?? "";
    const [decision] = await db()
      .insert(coherenceDecisions)
      .values({
        userId: actor.id,
        check: "resultado",
        mode: "sombra",
        subject: "escena",
        subjectId: proyectoId,
        projectId: proyectoId,
        verdict: "pasa",
        confidence: 0.9,
        threshold: 0.75,
        fit: 0.9,
        probabilities: { si: 0.9 },
        facts: "Mujer de pelo castaño con lunar en la mejilla.",
        evidence: "Encaja.",
        decisionModel: "jev-1.13.0",
        rulesVersion: "1",
      })
      .returning();

    await borrarProyecto(actor, proyectoId);
    const [despues] = await db()
      .select()
      .from(coherenceDecisions)
      .where(eq(coherenceDecisions.id, decision?.id ?? ""))
      .limit(1);
    expect(despues?.facts).toBe("");
    expect(despues?.verdict).toBe("pasa");
  });
});
