import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import sharp from "sharp";

/**
 * **Cada concepto en un solo sitio, y las direcciones guardadas** (0.25.2), contra el PostgreSQL local.
 *
 * Lo que comprueba, de punta a punta y mirando **el texto que sale de verdad hacia el proveedor**:
 *
 * - un clip dirigido **no repite** el plano, la cámara, el gesto, el registro ni la regla de toma única,
 *   aunque el navegador mande además una plantilla: la dirección sustituye a la plantilla;
 * - se puede **guardar una dirección con nombre**, listarla y aplicarla, y lo que llega al prompt es lo mismo
 *   que si se hubiera elegido a mano, tanto en «Crear» como en la escena de un proyecto;
 * - una dirección guardada **es de su dueño**: otra persona no la ve, no la renombra y no la borra;
 * - una **clave que ya no está en el catálogo** se ignora al aplicarla y se avisa de cuál.
 *
 * **Ningún test llama a KIE**: el proveedor se simula por los puntos de inyección que ya existen
 * (`Herramientas`), nunca sustituyendo `globalThis.fetch`.
 */
loadEnvConfig(path.resolve(import.meta.dirname, "../../../../.."), true, { info() {}, error: console.error }, true);

process.env.ESCENARA_CLAVE_MAESTRA ??= randomBytes(32).toString("base64");

const hayBaseDeDatos = Boolean(process.env.DATABASE_URL);
if (hayBaseDeDatos) {
  const { usarBaseDeDatosDePrueba } = await import("../db/bd-de-prueba");
  await usarBaseDeDatosDePrueba("escenara_pruebas_direccion_sin_duplicados");
}

const { and, eq } = await import("drizzle-orm");
const rutaTrabajos = await import("@/app/api/generacion/trabajos/route");
const rutaGuardadas = await import("@/app/api/direccion/guardadas/route");
const rutaGuardada = await import("@/app/api/direccion/guardadas/[id]/route");
const { crearSesionDePrueba } = await import("../auth/sesion-de-prueba");
const { aplicarMigraciones } = await import("../db/migrar");
const { db } = await import("../db/cliente");
const { generationJobs, presets, promptTemplates } = await import("../db/esquema");
const { guardarCredencial } = await import("../boveda/credenciales");
const { crearMedio } = await import("../media/servicio");
const { enviarEncolados } = await import("../cola/pasada");
const { estimar, olvidarSaldos } = await import("../generacion/estimacion");
const { crearProyecto } = await import("../asistente/proyectos");
const { crearEscena, editarEscena } = await import("../asistente/escenas");
const { escenaPropia } = await import("../asistente/consulta");
const { crearAnimacion } = await import("../generacion/servicio");
const { direccionDeLaEscena } = await import("./escena");
const { opcionesDeDireccion } = await import("./opciones");
const { REGLA_ANTI_CORTE } = await import("./ingles");
const { aplicarDireccionGuardada } = await import("@/lib/direccion");
type DireccionGuardada = import("@/lib/direccion").DireccionGuardada;
type Buscador = import("../proveedores/codigos").Buscador;
type Herramientas = import("../generacion/herramientas").Herramientas;
type Actor = import("../media/servicio").Actor;

const CLAVE_ANA = "sk-ana-clave-de-kie-inventada-sin-duplicados";
const CLAVE_BETO = "sk-beto-clave-de-kie-inventada-sin-duplicados";

// ── Proveedor simulado ───────────────────────────────────────────────────────────────────────────────────

let enviados: { prompt: string; cuerpo: string }[] = [];
let siguienteTarea = 0;

const sobre = (data: unknown) =>
  new Response(JSON.stringify({ code: 200, msg: "success", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const buscar: Buscador = async (url, opciones) => {
  if (url.includes("/chat/credit")) return sobre(100000);
  if (url.includes("file-stream-upload")) return sobre({ downloadUrl: "https://tempfile.kie.ai/ref.png" });
  if (url.includes("createTask")) {
    const cuerpo = String(opciones?.body ?? "{}");
    const leido = JSON.parse(cuerpo) as { input?: Record<string, unknown> };
    enviados.push({ prompt: String(leido.input?.prompt ?? ""), cuerpo });
    return sobre({ taskId: `task_${++siguienteTarea}_${randomBytes(6).toString("hex")}` });
  }
  if (url.includes("recordInfo")) {
    return sobre({
      state: "success",
      resultJson: JSON.stringify({ resultUrls: ["https://tempfile.kie.ai/clip.mp4"] }),
      creditsConsumed: 10,
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

const png = async () =>
  bytes(
    await sharp({ create: { width: 96, height: 96, channels: 3, background: "#3d6bff" } })
      .png()
      .toBuffer(),
  );

const MP4 = bytes(new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom"), ...new Uint8Array(64)]));

const descargar: Herramientas["descargar"] = async (url) => ({
  archivo: new File([MP4], "clip.mp4", { type: "video/mp4" }),
  origen: url,
});

const h: Herramientas = { buscar, descargar };

type Sesion = Awaited<ReturnType<typeof crearSesionDePrueba>>;

const pedir = (s: Sesion, url: string, metodo: string, cuerpo?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: metodo,
    headers: { cookie: s.cookie, origin: "http://localhost", "Content-Type": "application/json" },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

const contexto = (id: string) => ({ params: Promise.resolve({ id }) });

/** La dirección que se usa en toda la suite, tal como la manda el navegador: claves y texto, nunca prompt. */
const DIRECCION = {
  formatoClip: "ugc_a_camara",
  plano: "primer-plano",
  angulo: "tres-cuartos",
  camara: "push-in-ojos",
  microaccion: "asentir",
  momentoMicroaccion: "despues",
  registroEstetico: "ugc_real",
  acento: "es_CO_bogota",
  instruccionesExtra: "Que sostenga el bote con la etiqueta hacia la cámara.",
} as const;

describe.skipIf(!hayBaseDeDatos)("cada concepto en un solo sitio y las direcciones guardadas", () => {
  let ana: Sesion;
  let beto: Sesion;
  let actorAna: Actor;
  let actorBeto: Actor;
  let fotogramaDeAna: string;
  let creditosClip: number;
  let selloClip: string;
  /** La plantilla del clip que siembra la instalación: es la que duplicaba la cámara y la toma única. */
  let plantillaClip: { id: string; versionId: string };
  /** Lo que el navegador mandaba con la plantilla del clip: su duración es obligatoria y sale de un preset. */
  let presetsDelClip: Record<string, string[]>;

  beforeAll(async () => {
    await aplicarMigraciones();
    [ana, beto] = await Promise.all([crearSesionDePrueba("user"), crearSesionDePrueba("user")]);
    actorAna = { id: ana.id, esAdmin: false };
    actorBeto = { id: beto.id, esAdmin: false };
    await guardarCredencial(ana.id, "kie", CLAVE_ANA, buscar);
    await guardarCredencial(beto.id, "kie", CLAVE_BETO, buscar);
    fotogramaDeAna = (await crearMedio(actorAna, new File([await png()], "ana.png", { type: "image/png" }))).id;
    const estimacion = await estimar(ana.id, "animacion", buscar);
    creditosClip = estimacion.creditos;
    selloClip = estimacion.sello;
    const [duracion] = await db()
      .select()
      .from(presets)
      .where(and(eq(presets.category, "duracion"), eq(presets.slug, `clip-${estimacion.segundos ?? 8}`)))
      .limit(1);
    if (!duracion) throw new Error("la instalación no tiene el preset de duración del clip");
    presetsDelClip = { duracion: [duracion.id] };
    const [fila] = await db().select().from(promptTemplates).where(eq(promptTemplates.slug, "clip-social")).limit(1);
    if (!fila) throw new Error("la instalación no tiene la plantilla del clip");
    plantillaClip = { id: fila.id, versionId: "" };
  });

  beforeEach(async () => {
    enviados = [];
    olvidarSaldos();
    for (const id of [ana.id, beto.id]) {
      await db().delete(generationJobs).where(eq(generationJobs.userId, id));
    }
  });

  const confirmacionDeClip = (extra: Record<string, unknown> = {}) => ({
    tipo: "animacion",
    medioId: fotogramaDeAna,
    prompt: "En una cocina luminosa, cuenta lo que le ha pasado hoy.",
    dialogo: "Esto es lo que quiero que diga.",
    creditosConfirmados: creditosClip,
    selloEstimacion: selloClip,
    derechos: true,
    claveIdempotencia: crypto.randomUUID(),
    ...extra,
  });

  async function animar(sesion: Sesion, cuerpo: Record<string, unknown>): Promise<number> {
    const respuesta = await rutaTrabajos.POST(pedir(sesion, "/api/generacion/trabajos", "POST", cuerpo), undefined);
    if (respuesta.ok) await enviarEncolados(h);
    return respuesta.status;
  }

  const ultimoPrompt = (): string => {
    const ultimo = enviados.at(-1);
    if (!ultimo) throw new Error("no se ha enviado nada al proveedor");
    return ultimo.prompt;
  };

  /** Cuántas veces aparece un trozo en el prompt. Uno = se pidió una vez; dos = se pidió dos veces. */
  const veces = (prompt: string, trozo: string): number => prompt.split(trozo).length - 1;

  // ── 1. Nada se pide dos veces ──────────────────────────────────────────────────────────────────────────

  describe("un clip dirigido no repite lo que ya dice la dirección", () => {
    test("aunque llegue con plantilla, el plano, la cámara, el gesto y la toma única van una sola vez", async () => {
      expect(
        await animar(
          ana,
          confirmacionDeClip({
            direccion: DIRECCION,
            plantillaId: plantillaClip.id,
            plantillaVersionId: plantillaClip.versionId,
            presets: presetsDelClip,
          }),
        ),
      ).toBe(201);
      const prompt = ultimoPrompt();
      expect(veces(prompt, "Close-up on the face and shoulders")).toBe(1);
      expect(veces(prompt, "The camera pushes in towards the eyes")).toBe(1);
      expect(veces(prompt, "The character nods once")).toBe(1);
      expect(veces(prompt, REGLA_ANTI_CORTE)).toBe(1);
      // Y la cabecera de cámara de la plantilla ya no está: la pone la dirección, y solo ella.
      expect(prompt).not.toContain("filmed as one single take");
    });

    test("animar una imagen tuya no exige además describir la escena: la dirección basta", async () => {
      // Es el caso de «usar una imagen que ya tengo»: no hay paso de fotograma, así que no hay descripción.
      expect(await animar(ana, confirmacionDeClip({ prompt: "", direccion: DIRECCION }))).toBe(201);
      const prompt = ultimoPrompt();
      expect(prompt).toContain("Close-up on the face and shoulders");
      expect(prompt).toContain(REGLA_ANTI_CORTE);
    });

    test("sin dirección, la descripción se sigue exigiendo: es lo único que describe el clip", async () => {
      expect(await animar(ana, confirmacionDeClip({ prompt: "" }))).toBe(400);
    });

    test("sin dirección, la plantilla sigue componiendo el clip como en la versión anterior", async () => {
      expect(
        await animar(
          ana,
          confirmacionDeClip({
            plantillaId: plantillaClip.id,
            plantillaVersionId: plantillaClip.versionId,
            presets: presetsDelClip,
          }),
        ),
      ).toBe(201);
      expect(ultimoPrompt()).toContain("filmed as one single take");
    });
  });

  // ── 2. Guardar, listar y aplicar ───────────────────────────────────────────────────────────────────────

  describe("guardar una dirección y volver a usarla", () => {
    let guardadaId: string;

    const listar = async (sesion: Sesion): Promise<DireccionGuardada[]> => {
      const respuesta = await rutaGuardadas.GET(pedir(sesion, "/api/direccion/guardadas", "GET"), undefined);
      return (await respuesta.json()) as DireccionGuardada[];
    };

    /** La primera de la lista. Si no hay ninguna, el test se para aquí y no sigue probando sobre nada. */
    const primeraGuardada = async (): Promise<DireccionGuardada> => {
      const [guardada] = await listar(ana);
      if (!guardada) throw new Error("no hay ninguna dirección guardada");
      return guardada;
    };

    test("se guarda con nombre y aparece en la lista de su dueña", async () => {
      const respuesta = await rutaGuardadas.POST(
        pedir(ana, "/api/direccion/guardadas", "POST", { nombre: "Cocina de cerca", direccion: DIRECCION }),
        undefined,
      );
      expect(respuesta.status).toBe(201);
      const guardada = (await respuesta.json()) as DireccionGuardada;
      guardadaId = guardada.id;
      expect(guardada.nombre).toBe("Cocina de cerca");
      // Se guardan **claves**, no prompt: lo que se lee aquí es lo mismo que se eligió con los botones.
      expect(guardada.direccion.plano).toBe("primer-plano");
      expect(guardada.direccion.instruccionesExtra).toBe(DIRECCION.instruccionesExtra);
      expect(JSON.stringify(guardada)).not.toContain("Close-up");
      expect((await listar(ana)).map((d) => d.nombre)).toEqual(["Cocina de cerca"]);
    });

    test("repetir el nombre se dice con su motivo en lugar de dejar dos iguales", async () => {
      const respuesta = await rutaGuardadas.POST(
        pedir(ana, "/api/direccion/guardadas", "POST", { nombre: "Cocina de cerca", direccion: DIRECCION }),
        undefined,
      );
      expect(respuesta.status).toBe(409);
      expect((await respuesta.json()).error).toContain("Cocina de cerca");
    });

    test("aplicarla en «Crear» llega al prompt igual que elegida a mano", async () => {
      const guardada = await primeraGuardada();
      // Aplicar es lo que hace la pantalla: rellenar los controles con lo guardado. No genera nada.
      const aplicada = aplicarDireccionGuardada(guardada.direccion, await opcionesDeDireccion(ana.id));
      expect(aplicada.aviso).toBe("");
      expect(await animar(ana, confirmacionDeClip({ direccion: aplicada.direccion }))).toBe(201);
      const conGuardada = ultimoPrompt();

      expect(await animar(ana, confirmacionDeClip({ direccion: DIRECCION }))).toBe(201);
      expect(conGuardada).toBe(ultimoPrompt());
      expect(conGuardada).toContain("Close-up on the face and shoulders");
      expect(conGuardada).toContain("Bogotá accent");
    });

    test("aplicarla en una escena de un proyecto llega al prompt igual", async () => {
      const guardada = await primeraGuardada();
      const aplicada = aplicarDireccionGuardada(guardada.direccion, await opcionesDeDireccion(ana.id));
      const detalle = await crearProyecto(actorAna, {
        titulo: "Direcciones guardadas",
        formato: "anuncio",
        idea: "probar",
      });
      const nueva = await crearEscena(actorAna, detalle.proyecto.id, {
        texto: "Esto es lo que quiero que diga.",
        accion: "En una cocina luminosa, cuenta lo que le ha pasado hoy.",
      });
      // La escena guarda lo aplicado en su fila, que es donde vive lo elegido de un proyecto.
      await editarEscena(actorAna, nueva.id, {
        plano: aplicada.direccion.plano,
        angulo: aplicada.direccion.angulo,
        camara: aplicada.direccion.camara,
        microaccion: aplicada.direccion.microaccion,
        momentoMicroaccion: aplicada.direccion.momentoMicroaccion,
        registroEstetico: aplicada.direccion.registroEstetico,
        instruccionesExtra: aplicada.direccion.instruccionesExtra,
      });
      const { escena, proyecto } = await escenaPropia(actorAna, nueva.id);
      const direccion = await direccionDeLaEscena(actorAna.id, escena, proyecto, {
        descripcion: "",
        real: false,
        atractivoElegido: false,
        ejesVoz: {},
      });
      await crearAnimacion(
        actorAna,
        {
          medioId: fotogramaDeAna,
          prompt: escena.action,
          dialogo: escena.scriptText,
          direccion,
          creditosConfirmados: creditosClip,
          selloEstimacion: selloClip,
          derechos: true,
          claveIdempotencia: crypto.randomUUID(),
        },
        h,
      );
      await enviarEncolados(h);
      const prompt = ultimoPrompt();
      expect(prompt).toContain("Close-up on the face and shoulders");
      expect(prompt).toContain("The camera pushes in towards the eyes");
      expect(prompt).toContain("The character nods once");
      expect(veces(prompt, REGLA_ANTI_CORTE)).toBe(1);
    });

    test("se le puede cambiar el nombre y borrarla", async () => {
      const renombrada = await rutaGuardada.PATCH(
        pedir(ana, `/api/direccion/guardadas/${guardadaId}`, "PATCH", { nombre: "Cocina, primer plano" }),
        contexto(guardadaId),
      );
      expect(renombrada.status).toBe(200);
      expect(((await renombrada.json()) as DireccionGuardada).nombre).toBe("Cocina, primer plano");

      const borrada = await rutaGuardada.DELETE(
        pedir(ana, `/api/direccion/guardadas/${guardadaId}`, "DELETE"),
        contexto(guardadaId),
      );
      expect(borrada.status).toBe(200);
      expect(await borrada.json()).toEqual([]);
    });
  });

  // ── 3. Es tuya y de nadie más ──────────────────────────────────────────────────────────────────────────

  describe("una dirección guardada es de su dueña", () => {
    let deAna: string;

    beforeAll(async () => {
      const respuesta = await rutaGuardadas.POST(
        pedir(ana, "/api/direccion/guardadas", "POST", { nombre: "Solo mía", direccion: DIRECCION }),
        undefined,
      );
      deAna = ((await respuesta.json()) as DireccionGuardada).id;
    });

    test("otra persona no la ve en su lista", async () => {
      const respuesta = await rutaGuardadas.GET(pedir(beto, "/api/direccion/guardadas", "GET"), undefined);
      expect(await respuesta.json()).toEqual([]);
    });

    test("otra persona no la renombra ni la borra: ni se dice que existe", async () => {
      const renombrar = await rutaGuardada.PATCH(
        pedir(beto, `/api/direccion/guardadas/${deAna}`, "PATCH", { nombre: "Mía ahora" }),
        contexto(deAna),
      );
      expect(renombrar.status).toBe(404);
      const borrar = await rutaGuardada.DELETE(
        pedir(beto, `/api/direccion/guardadas/${deAna}`, "DELETE"),
        contexto(deAna),
      );
      expect(borrar.status).toBe(404);
      // Y sigue siendo de Ana, con su nombre.
      const suya = await rutaGuardadas.GET(pedir(ana, "/api/direccion/guardadas", "GET"), undefined);
      expect(((await suya.json()) as DireccionGuardada[]).map((d) => d.nombre)).toContain("Solo mía");
    });

    test("sin sesión no se lista nada", async () => {
      const respuesta = await rutaGuardadas.GET(new Request("http://localhost/api/direccion/guardadas"), undefined);
      expect(respuesta.status).toBe(401);
    });
  });

  // ── 4. Una opción que ya no existe ─────────────────────────────────────────────────────────────────────

  test("una clave que ya no está en el catálogo se ignora al aplicarla y se avisa", async () => {
    const respuesta = await rutaGuardadas.POST(
      pedir(ana, "/api/direccion/guardadas", "POST", { nombre: "Con cámara", direccion: DIRECCION }),
      undefined,
    );
    const guardada = (await respuesta.json()) as DireccionGuardada;
    // Quien administra desactiva ese movimiento después de que Ana lo guardara.
    await db()
      .update(presets)
      .set({ active: false })
      .where(and(eq(presets.category, "camara"), eq(presets.slug, "push-in-ojos")));

    const aplicada = aplicarDireccionGuardada(guardada.direccion, await opcionesDeDireccion(ana.id));
    expect(aplicada.direccion.camara).toBe("");
    expect(aplicada.ignoradas).toEqual(["Movimiento de cámara"]);
    expect(aplicada.aviso).toContain("ya no están en el catálogo");
    // Lo demás se aplica igual: una opción caída no invalida la dirección entera.
    expect(aplicada.direccion.plano).toBe("primer-plano");

    expect(await animar(ana, confirmacionDeClip({ direccion: aplicada.direccion }))).toBe(201);
    const prompt = ultimoPrompt();
    expect(prompt).not.toContain("The camera pushes in towards the eyes");
    // Sin movimiento la cámara se queda quieta, y se le dice al modelo: no elegir también es elegir.
    expect(prompt).toContain("The camera stays locked off");

    await db()
      .update(presets)
      .set({ active: true })
      .where(and(eq(presets.category, "camara"), eq(presets.slug, "push-in-ojos")));
  });
});
